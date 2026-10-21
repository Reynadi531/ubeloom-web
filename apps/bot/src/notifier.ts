/**
 * Polls the database for new orders and payment proofs and pushes them to Telegram.
 *
 * Each poll re-reads an overlap window before the previous poll, so rows whose
 * transaction committed late (createdAt is set at insert, not commit) are still
 * caught; `sent` dedupes them per chat. A failed send is retried on the next poll
 * while the row is inside the window.
 */
import type { Database } from "@web-kwu/db";

import { buildPaymentCard, sendPaymentCard, type Storage } from "./cards";
import { orderMessage } from "./format";
import { orderKeyboard } from "./keyboards";
import { ordersSince, pendingPayments, type PendingPaymentRow } from "./queries";
import type { Telegram } from "./telegram";

const OVERLAP_MS = 2 * 60 * 1000;

export type NotifierOptions = {
  db: Database;
  telegram: Telegram;
  storage: Storage | null;
  chatIds: string[];
  dashboardUrl: string;
};

export function createNotifier({ db, telegram, storage, chatIds, dashboardUrl }: NotifierOptions) {
  /** `${kind}:${rowId}:${chatId}` → row createdAt (ms), pruned once outside the window. */
  const sent = new Map<string, number>();
  let lastPollAt = Date.now();

  const markSent = (key: string, createdAt: Date) => sent.set(key, createdAt.getTime());

  async function notifyPayment(row: PendingPaymentRow) {
    const targets = chatIds.filter((chatId) => !sent.has(`payment:${row.id}:${chatId}`));
    if (targets.length === 0) return;

    const card = await buildPaymentCard(row, storage, dashboardUrl);
    for (const chatId of targets) {
      try {
        await sendPaymentCard(telegram, chatId, row.id, card);
        markSent(`payment:${row.id}:${chatId}`, row.createdAt);
      } catch (error) {
        console.error(`[notifier] payment ${row.id} → ${chatId} failed`, error);
      }
    }
  }

  async function poll() {
    const startedAt = Date.now();
    const since = new Date(lastPollAt - OVERLAP_MS);
    const [orders, payments] = await Promise.all([
      ordersSince(db, since),
      pendingPayments(db, { since }),
    ]);

    for (const row of orders) {
      const message = orderMessage(row, dashboardUrl, "🛒 <b>Pesanan baru</b>");
      for (const chatId of chatIds) {
        const key = `order:${row.id}:${chatId}`;
        if (sent.has(key)) continue;
        try {
          await telegram.sendMessage(chatId, message, orderKeyboard(row));
          markSent(key, row.createdAt);
        } catch (error) {
          console.error(`[notifier] order ${row.invoiceNumber} → ${chatId} failed`, error);
        }
      }
    }
    for (const row of payments) await notifyPayment(row);

    lastPollAt = startedAt;
    for (const [key, createdAt] of sent) {
      if (createdAt < since.getTime()) sent.delete(key);
    }
  }

  return {
    /** Marks rows already inside the first window as sent so a restart does not repeat them. */
    async prime() {
      const since = new Date(lastPollAt - OVERLAP_MS);
      const [orders, payments] = await Promise.all([
        ordersSince(db, since),
        pendingPayments(db, { since }),
      ]);
      for (const chatId of chatIds) {
        for (const row of orders) markSent(`order:${row.id}:${chatId}`, row.createdAt);
        for (const row of payments) markSent(`payment:${row.id}:${chatId}`, row.createdAt);
      }
    },

    async run(intervalMs: number, signal: AbortSignal) {
      while (!signal.aborted) {
        try {
          await poll();
        } catch (error) {
          console.error("[notifier] poll failed", error);
        }
        await Bun.sleep(intervalMs);
      }
    },
  };
}
