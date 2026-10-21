/** Long-polls Telegram for chat commands. Only configured chats may read shop data. */
import type { Database } from "@web-kwu/db";

import { pendingListMessage, summaryMessage } from "./format";
import { pendingPayments, todaySummary } from "./queries";
import { TelegramError, type Telegram } from "./telegram";

export const COMMANDS = [
  { command: "pending", description: "Pembayaran yang menunggu verifikasi" },
  { command: "ringkasan", description: "Ringkasan pesanan hari ini" },
  { command: "start", description: "Tampilkan chat id" },
];

const PENDING_LIST_LIMIT = 30;

export type CommandOptions = {
  db: Database;
  telegram: Telegram;
  chatIds: string[];
  dashboardUrl: string;
};

export async function runCommands(
  { db, telegram, chatIds, dashboardUrl }: CommandOptions,
  signal: AbortSignal,
) {
  async function reply(chatId: string, text: string) {
    const allowed = chatIds.includes(chatId);
    // "/start@ubeloom_bot" → "start"
    const command = text.trim().split(/\s+/)[0]?.slice(1).split("@")[0]?.toLowerCase();

    if (command === "start" || command === "id") {
      return telegram.sendMessage(
        chatId,
        allowed
          ? `👋 Chat ini menerima notifikasi pesanan.\nChat id: <code>${chatId}</code>`
          : `Chat id: <code>${chatId}</code>\nTambahkan ke <code>TELEGRAM_CHAT_IDS</code> lalu restart bot untuk menerima notifikasi.`,
      );
    }
    if (!allowed) return;

    if (command === "pending") {
      const rows = await pendingPayments(db);
      const shown = rows.slice(0, PENDING_LIST_LIMIT);
      let message = pendingListMessage(shown, dashboardUrl);
      if (rows.length > shown.length) message += `\n… dan ${rows.length - shown.length} lainnya`;
      return telegram.sendMessage(chatId, message);
    }
    if (command === "ringkasan") {
      const [summary, pending] = await Promise.all([todaySummary(db), pendingPayments(db)]);
      return telegram.sendMessage(chatId, summaryMessage(summary, pending.length));
    }
  }

  let offset = 0;
  while (!signal.aborted) {
    try {
      const updates = await telegram.getUpdates(offset, signal);
      for (const update of updates) {
        offset = update.update_id + 1;
        const message = update.message;
        if (!message?.text?.startsWith("/")) continue;
        try {
          await reply(String(message.chat.id), message.text);
        } catch (error) {
          console.error(`[commands] ${message.text} in ${message.chat.id} failed`, error);
        }
      }
    } catch (error) {
      if (signal.aborted) break;
      console.error("[commands] getUpdates failed", error);
      // A 409 means another instance polls with this token; back off longer.
      const conflict = error instanceof TelegramError && error.message.includes("Conflict");
      await Bun.sleep(conflict ? 30_000 : 5_000);
    }
  }
}
