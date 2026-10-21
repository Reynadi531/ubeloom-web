/**
 * Long-polls Telegram for commands, button presses and replies to the bot's prompts.
 *
 * Reading shop data needs a configured chat (TELEGRAM_CHAT_IDS) or an admin;
 * changing it (approve/reject payments, order status, batches, vouchers) needs the
 * pressing user to be in TELEGRAM_ADMINS, whose dashboard account is recorded as the actor.
 * Multi-step flows (merchant reference, courier name, rejection note) use force-reply
 * prompts held in memory; a restart drops unfinished ones.
 */
import type { Database } from "@web-kwu/db";
import { setBatchStatus, setVoucherActive } from "@web-kwu/shop/catalog";
import { transitionOrderFulfillment } from "@web-kwu/shop/fulfillment";
import { approvePaymentAttempt, rejectPaymentAttempt } from "@web-kwu/shop/payments";
import {
  type FulfillmentStatus,
  fulfillmentStatusLabels,
  rejectionReasons,
} from "@web-kwu/shop/rules";

import type { Admin } from "./admins";
import { buildPaymentCard, sendPaymentCard, type Storage } from "./cards";
import {
  approveConfirmMessage,
  batchListMessage,
  helpMessage,
  orderMessage,
  summaryMessage,
  voucherListMessage,
} from "./format";
import {
  type Action,
  approveConfirmKeyboard,
  batchConfirmKeyboard,
  batchKeyboard,
  cancelConfirmKeyboard,
  decodeAction,
  orderKeyboard,
  orderListKeyboard,
  paymentKeyboard,
  rejectReasonKeyboard,
  voucherKeyboard,
} from "./keyboards";
import {
  batchStatus,
  listVouchers,
  orderById,
  paymentAttemptSummary,
  pendingPayments,
  recentBatches,
  searchOrders,
  todaySummary,
} from "./queries";
import {
  type CallbackQuery,
  type Message,
  type Telegram,
  TelegramError,
  type User,
  escapeHtml,
} from "./telegram";

export const COMMANDS = [
  { command: "pending", description: "Pembayaran yang menunggu verifikasi" },
  { command: "order", description: "Cari pesanan (invoice / nama / no. HP)" },
  { command: "ringkasan", description: "Ringkasan pesanan hari ini" },
  { command: "batch", description: "Buka / tutup batch" },
  { command: "voucher", description: "Aktifkan / nonaktifkan voucher" },
  { command: "help", description: "Daftar perintah" },
];

const PENDING_CARD_LIMIT = 10;
const PROMPT_TTL_MS = 30 * 60 * 1000;
const MAX_REFERENCE_LENGTH = 120;
const MAX_NOTE_LENGTH = 500;
const MAX_COURIER_LENGTH = 120;

export type BotOptions = {
  db: Database;
  telegram: Telegram;
  storage: Storage | null;
  chatIds: string[];
  admins: Map<number, Admin>;
  dashboardUrl: string;
};

/** A message the bot can edit later: a payment card or an order card. */
type MessageRef = { chatId: number; messageId: number };

type Prompt = { userId: number; createdAt: number; card: MessageRef } & (
  | { kind: "approveRef"; attemptId: string; invoiceNumber: string }
  | { kind: "rejectNote"; attemptId: string; invoiceNumber: string; reason: string }
  | { kind: "courier"; orderId: string; from: FulfillmentStatus }
);

type PendingApproval = {
  userId: number;
  createdAt: number;
  card: MessageRef;
  attemptId: string;
  invoiceNumber: string;
  merchantReference: string;
};

/** User-facing failure raised by the bot itself. */
class Refusal extends Error {}

/**
 * Refusals and the plain `Error`s thrown by @web-kwu/shop carry Indonesian messages
 * meant for the admin; driver and Telegram errors (subclasses) stay generic.
 */
const errorText = (error: unknown) =>
  error instanceof Refusal || (error instanceof Error && error.constructor === Error)
    ? error.message
    : "Terjadi kesalahan. Coba lagi.";

const mention = (user: User) =>
  `<a href="tg://user?id=${user.id}">${escapeHtml(user.first_name)}</a>`;

export function createBot({ db, telegram, storage, chatIds, admins, dashboardUrl }: BotOptions) {
  /** Force-reply prompts by `${chatId}:${promptMessageId}`. */
  const prompts = new Map<string, Prompt>();
  /** Approvals waiting for the checklist confirmation, by short token. */
  const approvals = new Map<string, PendingApproval>();

  /**
   * Configured chats can read; admins also can in their private chat with the bot,
   * but never in an unconfigured group where other members would see customer data.
   */
  const canRead = (chat: Message["chat"], user?: User) =>
    chatIds.includes(String(chat.id)) ||
    (chat.type === "private" && user !== undefined && admins.has(user.id));

  const isFresh = (entry: { createdAt: number }) => Date.now() - entry.createdAt <= PROMPT_TTL_MS;

  function prune() {
    const cutoff = Date.now() - PROMPT_TTL_MS;
    for (const [key, prompt] of prompts) if (prompt.createdAt < cutoff) prompts.delete(key);
    for (const [key, approval] of approvals) if (approval.createdAt < cutoff) approvals.delete(key);
  }

  async function ask(chatId: number, user: User, html: string, placeholder: string) {
    prune();
    return telegram.sendMessage(chatId, `${mention(user)} ${html}`, {
      force_reply: true,
      input_field_placeholder: placeholder,
      selective: true,
    });
  }

  /** Strips the buttons off a card; ignores cards that are already gone or unchanged. */
  const clearButtons = (ref: MessageRef) =>
    telegram.editReplyMarkup(ref.chatId, ref.messageId).catch(() => undefined);

  async function renderOrder(orderId: string) {
    const row = await orderById(db, orderId);
    if (!row) throw new Refusal("Pesanan tidak ditemukan.");
    return {
      text: orderMessage(row, dashboardUrl, "📦 <b>Pesanan</b>"),
      keyboard: orderKeyboard(row),
    };
  }

  async function refreshOrder(ref: MessageRef, orderId: string) {
    const { text, keyboard } = await renderOrder(orderId);
    await telegram.editMessageText(ref.chatId, ref.messageId, text, keyboard).catch((error) => {
      // "message is not modified" when nothing changed since the last render.
      if (!(error instanceof TelegramError && error.message.includes("not modified"))) throw error;
    });
  }

  async function sendPendingCards(chatId: number, orderId?: string) {
    const rows = await pendingPayments(db, { orderId });
    if (rows.length === 0) {
      await telegram.sendMessage(chatId, "✅ Tidak ada pembayaran yang menunggu verifikasi.");
      return;
    }
    const shown = rows.slice(0, PENDING_CARD_LIMIT);
    if (!orderId) {
      await telegram.sendMessage(
        chatId,
        `💳 <b>${rows.length} pembayaran menunggu verifikasi</b>${
          rows.length > shown.length ? ` · menampilkan ${shown.length} terlama` : ""
        }`,
      );
    }
    for (const row of shown) {
      try {
        const card = await buildPaymentCard(row, storage, dashboardUrl);
        await sendPaymentCard(telegram, chatId, row.id, card);
      } catch (error) {
        console.error(`[bot] payment card ${row.id} failed`, error);
        await telegram.sendMessage(
          chatId,
          `⚠️ Gagal menampilkan <code>${escapeHtml(row.order.invoiceNumber)}</code> percobaan #${row.attempt}. Buka di dashboard.`,
        );
      }
    }
  }

  async function rejectPayment(
    admin: Admin,
    card: MessageRef,
    attemptId: string,
    invoiceNumber: string,
    reason: string,
    note?: string,
  ) {
    await rejectPaymentAttempt(db, { attemptId, reason, note }, admin.userId);
    await clearButtons(card);
    await telegram.sendMessage(
      card.chatId,
      `❌ Pembayaran <code>${escapeHtml(invoiceNumber)}</code> ditolak oleh ${escapeHtml(admin.name)} · ${escapeHtml(note ? `${reason} — ${note}` : reason)}`,
    );
  }

  /* ------------------------------------------------------------------------ */
  /*                                 Commands                                 */
  /* ------------------------------------------------------------------------ */

  async function handleCommand(message: Message, text: string) {
    const chatId = message.chat.id;
    const [head = "", ...rest] = text.trim().split(/\s+/);
    // "/start@ubeloom_bot" → "start"
    const command = head.slice(1).split("@")[0]?.toLowerCase();
    const args = rest.join(" ");

    if (command === "start" || command === "id") {
      const admin = message.from ? admins.get(message.from.id) : undefined;
      return telegram.sendMessage(
        chatId,
        [
          canRead(message.chat, message.from)
            ? "👋 Bot pesanan ubeloom aktif. Ketik /help untuk daftar perintah."
            : "Chat ini belum terdaftar. Tambahkan chat id ke <code>TELEGRAM_CHAT_IDS</code> lalu restart bot.",
          "",
          `Chat id: <code>${chatId}</code>`,
          ...(message.from ? [`User id: <code>${message.from.id}</code>`] : []),
          admin
            ? `Admin: ${escapeHtml(admin.name)}`
            : "Untuk menyetujui pembayaran dan mengubah status, tambahkan <code>userId=email-dashboard</code> ke <code>TELEGRAM_ADMINS</code>.",
        ].join("\n"),
      );
    }
    if (!canRead(message.chat, message.from)) return;

    switch (command) {
      case "help":
        return telegram.sendMessage(chatId, helpMessage);
      case "pending":
        return sendPendingCards(chatId);
      case "ringkasan": {
        const [summary, pending] = await Promise.all([todaySummary(db), pendingPayments(db)]);
        return telegram.sendMessage(chatId, summaryMessage(summary, pending.length));
      }
      case "order": {
        const rows = await searchOrders(db, args);
        if (rows.length === 0) {
          return telegram.sendMessage(chatId, `Tidak ada pesanan untuk "${escapeHtml(args)}".`);
        }
        if (rows.length === 1 && args) {
          const { text: card, keyboard } = await renderOrder(rows[0]!.id);
          return telegram.sendMessage(chatId, card, keyboard);
        }
        return telegram.sendMessage(
          chatId,
          args
            ? `🔎 ${rows.length} pesanan cocok dengan "${escapeHtml(args)}":`
            : "🧾 Pesanan terbaru:",
          orderListKeyboard(rows),
        );
      }
      case "batch": {
        const rows = await recentBatches(db);
        return telegram.sendMessage(chatId, batchListMessage(rows), batchKeyboard(rows));
      }
      case "voucher": {
        const rows = await listVouchers(db);
        return telegram.sendMessage(chatId, voucherListMessage(rows), voucherKeyboard(rows));
      }
    }
  }

  /* ------------------------------------------------------------------------ */
  /*                                  Buttons                                 */
  /* ------------------------------------------------------------------------ */

  const readOnlyActions = new Set<Action["type"]>(["order", "orderRefresh", "orderPayments"]);

  /** Runs a button press; the returned text is shown as a toast. */
  async function runAction(
    action: Action,
    user: User,
    card: MessageRef,
  ): Promise<string | undefined> {
    const chatId = card.chatId;
    const admin = admins.get(user.id);
    if (!readOnlyActions.has(action.type) && !admin) {
      throw new Refusal("Akun Telegram ini belum terdaftar di TELEGRAM_ADMINS.");
    }

    switch (action.type) {
      case "order": {
        const { text, keyboard } = await renderOrder(action.orderId);
        await telegram.sendMessage(chatId, text, keyboard);
        return;
      }
      case "orderRefresh":
        await refreshOrder(card, action.orderId);
        return "Diperbarui";
      case "orderPayments":
        await sendPendingCards(chatId, action.orderId);
        return;
      case "approve": {
        const attempt = await paymentAttemptSummary(db, action.attemptId);
        if (!attempt) throw new Refusal("Percobaan pembayaran tidak ditemukan.");
        if (attempt.status !== "pending") {
          await clearButtons(card);
          throw new Refusal("Bukti ini sudah ditinjau.");
        }
        const prompt = await ask(
          chatId,
          user,
          `balas pesan ini dengan <b>referensi mutasi merchant</b> untuk <code>${escapeHtml(attempt.order.invoiceNumber)}</code>.`,
          "Referensi merchant",
        );
        prompts.set(`${chatId}:${prompt.message_id}`, {
          kind: "approveRef",
          userId: user.id,
          createdAt: Date.now(),
          card,
          attemptId: attempt.id,
          invoiceNumber: attempt.order.invoiceNumber,
        });
        return "Balas dengan referensi merchant";
      }
      case "approveConfirm": {
        prune();
        const approval = approvals.get(action.token);
        if (!approval || !isFresh(approval))
          throw new Refusal("Konfirmasi kedaluwarsa. Tekan Setujui lagi.");
        if (approval.userId !== user.id)
          throw new Refusal("Hanya peninjau yang memulai yang bisa mengonfirmasi.");
        approvals.delete(action.token);
        await clearButtons(card);
        await approvePaymentAttempt(
          db,
          { attemptId: approval.attemptId, merchantReference: approval.merchantReference },
          admin!.userId,
        );
        await clearButtons(approval.card);
        await telegram.sendMessage(
          chatId,
          `✅ Pembayaran <code>${escapeHtml(approval.invoiceNumber)}</code> disetujui oleh ${escapeHtml(admin!.name)} · ref <code>${escapeHtml(approval.merchantReference)}</code>`,
        );
        return "Disetujui";
      }
      case "approveCancel":
        approvals.delete(action.token);
        await clearButtons(card);
        return "Dibatalkan";
      case "reject":
        await telegram.editReplyMarkup(
          chatId,
          card.messageId,
          rejectReasonKeyboard(action.attemptId),
        );
        return "Pilih alasan penolakan";
      case "rejectBack":
        await telegram.editReplyMarkup(chatId, card.messageId, paymentKeyboard(action.attemptId));
        return;
      case "rejectReason": {
        const reason = rejectionReasons[action.reason];
        if (!reason) throw new Refusal("Alasan tidak dikenal.");
        const attempt = await paymentAttemptSummary(db, action.attemptId);
        if (!attempt || attempt.status !== "pending") {
          await clearButtons(card);
          throw new Refusal("Bukti ini sudah ditinjau atau tidak ditemukan.");
        }
        // The last reason ("Lainnya") needs a written note.
        if (action.reason === rejectionReasons.length - 1) {
          const prompt = await ask(
            chatId,
            user,
            `balas pesan ini dengan <b>catatan penolakan</b> untuk <code>${escapeHtml(attempt.order.invoiceNumber)}</code>.`,
            "Catatan penolakan",
          );
          prompts.set(`${chatId}:${prompt.message_id}`, {
            kind: "rejectNote",
            userId: user.id,
            createdAt: Date.now(),
            card,
            attemptId: attempt.id,
            invoiceNumber: attempt.order.invoiceNumber,
            reason,
          });
          return "Balas dengan catatan";
        }
        await rejectPayment(admin!, card, attempt.id, attempt.order.invoiceNumber, reason);
        return "Ditolak";
      }
      case "cancelConfirm":
        await telegram.editReplyMarkup(
          chatId,
          card.messageId,
          cancelConfirmKeyboard(action.orderId, action.from),
        );
        return "Yakin batalkan pesanan?";
      case "transition": {
        if (action.to === "in_transit") {
          const prompt = await ask(
            chatId,
            user,
            "balas pesan ini dengan <b>nama kurir</b> yang membawa pesanan.",
            "Nama kurir",
          );
          prompts.set(`${chatId}:${prompt.message_id}`, {
            kind: "courier",
            userId: user.id,
            createdAt: Date.now(),
            card,
            orderId: action.orderId,
            from: action.from,
          });
          return "Balas dengan nama kurir";
        }
        await transitionOrderFulfillment(
          db,
          { orderId: action.orderId, from: action.from, to: action.to, note: "Lewat bot Telegram" },
          admin!.userId,
        );
        await refreshOrder(card, action.orderId);
        return `Status: ${fulfillmentStatusLabels[action.to]}`;
      }
      case "batch": {
        if (!action.confirmed) {
          await telegram.editReplyMarkup(
            chatId,
            card.messageId,
            batchConfirmKeyboard(action.batchId, action.status),
          );
          return action.status === "open"
            ? "Batch lain yang sedang dibuka akan ditutup. Yakin?"
            : "Pelanggan tidak bisa memesan setelah batch ditutup. Yakin?";
        }
        // Buttons can be stale: never revive an archived batch or repeat a change.
        const current = await batchStatus(db, action.batchId);
        if (!current) throw new Refusal("Batch tidak ditemukan.");
        if (current.status === "archived") throw new Refusal("Batch sudah diarsipkan.");
        if (current.status === action.status) {
          throw new Refusal(`Batch sudah ${action.status === "open" ? "dibuka" : "ditutup"}.`);
        }
        const saved = await setBatchStatus(db, action.batchId, action.status);
        const rows = await recentBatches(db);
        await telegram.editMessageText(
          chatId,
          card.messageId,
          batchListMessage(rows),
          batchKeyboard(rows),
        );
        return `${saved.name} ${action.status === "open" ? "dibuka" : "ditutup"}`;
      }
      case "batchList": {
        const rows = await recentBatches(db);
        await telegram.editReplyMarkup(chatId, card.messageId, batchKeyboard(rows));
        return;
      }
      case "voucher": {
        await setVoucherActive(db, action.voucherId, action.active);
        const rows = await listVouchers(db);
        await telegram.editMessageText(
          chatId,
          card.messageId,
          voucherListMessage(rows),
          voucherKeyboard(rows),
        );
        return action.active ? "Voucher diaktifkan" : "Voucher dinonaktifkan";
      }
    }
  }

  async function handleCallback(query: CallbackQuery) {
    const action = decodeAction(query.data ?? "");
    const message = query.message;
    if (!action || !message || !canRead(message.chat, query.from)) {
      return telegram.answerCallback(query.id);
    }
    try {
      const toast = await runAction(action, query.from, {
        chatId: message.chat.id,
        messageId: message.message_id,
      });
      await telegram.answerCallback(query.id, toast);
    } catch (error) {
      if (!(error instanceof Refusal)) console.error(`[bot] action ${query.data} failed`, error);
      await telegram.answerCallback(query.id, errorText(error), true);
    }
  }

  /* ------------------------------------------------------------------------ */
  /*                               Prompt replies                             */
  /* ------------------------------------------------------------------------ */

  async function handleReply(message: Message, prompt: Prompt, text: string) {
    const chatId = message.chat.id;
    const admin = admins.get(prompt.userId);
    if (!admin) throw new Refusal("Akun Telegram ini belum terdaftar di TELEGRAM_ADMINS.");

    switch (prompt.kind) {
      case "approveRef": {
        if (text.length > MAX_REFERENCE_LENGTH) {
          throw new Refusal(`Referensi maksimal ${MAX_REFERENCE_LENGTH} karakter.`);
        }
        const token = crypto.randomUUID().slice(0, 8);
        approvals.set(token, {
          userId: prompt.userId,
          createdAt: Date.now(),
          card: prompt.card,
          attemptId: prompt.attemptId,
          invoiceNumber: prompt.invoiceNumber,
          merchantReference: text,
        });
        await telegram.sendMessage(
          chatId,
          approveConfirmMessage(prompt.invoiceNumber, text),
          approveConfirmKeyboard(token),
        );
        return;
      }
      case "rejectNote":
        if (text.length > MAX_NOTE_LENGTH)
          throw new Refusal(`Catatan maksimal ${MAX_NOTE_LENGTH} karakter.`);
        await rejectPayment(
          admin,
          prompt.card,
          prompt.attemptId,
          prompt.invoiceNumber,
          prompt.reason,
          text,
        );
        return;
      case "courier":
        if (text.length > MAX_COURIER_LENGTH) {
          throw new Refusal(`Nama kurir maksimal ${MAX_COURIER_LENGTH} karakter.`);
        }
        await transitionOrderFulfillment(
          db,
          {
            orderId: prompt.orderId,
            from: prompt.from,
            to: "in_transit",
            handoverTo: text,
            note: "Lewat bot Telegram",
          },
          admin.userId,
        );
        await refreshOrder(prompt.card, prompt.orderId);
        await telegram.sendMessage(
          chatId,
          `🛵 Diserahkan ke kurir ${escapeHtml(text)} oleh ${escapeHtml(admin.name)}.`,
        );
        return;
    }
  }

  async function handleMessage(message: Message) {
    const text = message.text?.trim();
    if (!text) return;

    const replyTo = message.reply_to_message;
    const key = replyTo ? `${message.chat.id}:${replyTo.message_id}` : undefined;
    const prompt = key ? prompts.get(key) : undefined;
    if (key && prompt && message.from?.id === prompt.userId) {
      prompts.delete(key);
      if (!isFresh(prompt)) {
        await telegram.sendMessage(
          message.chat.id,
          "⚠️ Permintaan kedaluwarsa. Ulangi dari tombolnya.",
        );
        return;
      }
      try {
        await handleReply(message, prompt, text);
      } catch (error) {
        if (!(error instanceof Refusal))
          console.error(`[bot] reply to ${prompt.kind} failed`, error);
        await telegram.sendMessage(message.chat.id, `⚠️ ${escapeHtml(errorText(error))}`);
      }
      return;
    }
    if (text.startsWith("/")) await handleCommand(message, text);
  }

  return {
    async run(signal: AbortSignal) {
      let offset = 0;
      while (!signal.aborted) {
        try {
          const updates = await telegram.getUpdates(offset, signal);
          for (const update of updates) {
            offset = update.update_id + 1;
            try {
              if (update.callback_query) await handleCallback(update.callback_query);
              else if (update.message) await handleMessage(update.message);
            } catch (error) {
              console.error(`[bot] update ${update.update_id} failed`, error);
            }
          }
        } catch (error) {
          if (signal.aborted) break;
          console.error("[bot] getUpdates failed", error);
          // A 409 means another instance polls with this token; back off longer.
          const conflict = error instanceof TelegramError && error.message.includes("Conflict");
          await Bun.sleep(conflict ? 30_000 : 5_000);
        }
      }
    },
  };
}
