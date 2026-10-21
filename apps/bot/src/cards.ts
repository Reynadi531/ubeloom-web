/** Payment cards: the proof photo with review details and approve/reject buttons. */
import type { createStorage } from "@web-kwu/storage";

import { paymentMessage } from "./format";
import { paymentKeyboard } from "./keyboards";
import type { PendingPaymentRow } from "./queries";
import { escapeHtml, type Telegram } from "./telegram";

export type Storage = ReturnType<typeof createStorage>;

export type PaymentCard = { caption: string; proof: Blob | null; filename: string };

async function loadProof(storage: Storage | null, key: string | null) {
  if (!storage || !key) return null;
  try {
    const object = await storage.getObject(key);
    if (!object) return null;
    const headers = { "content-type": object.contentType ?? "application/octet-stream" };
    return await new Response(object.body, { headers }).blob();
  } catch (error) {
    console.error(`[cards] proof ${key} unavailable`, error);
    return null;
  }
}

/** Builds a card once so it can be sent to several chats without re-downloading the proof. */
export async function buildPaymentCard(
  row: PendingPaymentRow,
  storage: Storage | null,
  dashboardUrl: string,
): Promise<PaymentCard> {
  let caption = paymentMessage(row, dashboardUrl);
  if (row.proofUrl) caption += `\n<a href="${escapeHtml(row.proofUrl)}">Bukti (tautan)</a>`;
  return {
    caption,
    proof: await loadProof(storage, row.proofKey),
    filename: row.proofKey?.split("/").pop() ?? "bukti",
  };
}

export function sendPaymentCard(
  telegram: Telegram,
  chatId: string | number,
  attemptId: string,
  card: PaymentCard,
) {
  const keyboard = paymentKeyboard(attemptId);
  return card.proof
    ? telegram.sendFile(chatId, card.proof, card.filename, card.caption, keyboard)
    : telegram.sendMessage(chatId, card.caption, keyboard);
}
