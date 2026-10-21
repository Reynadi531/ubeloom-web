/**
 * Inline keyboards and their callback data. Telegram caps callback data at 64
 * bytes, so actions are short prefixes and statuses travel as indexes.
 */
import {
  type FulfillmentStatus,
  canTransition,
  fulfillmentStatusLabels,
  fulfillmentStatusValues,
  fulfillmentTransitions,
  rejectionReasons,
} from "@web-kwu/shop/rules";

import type { OrderRow } from "./format";
import type { BatchRow, VoucherRow } from "./queries";
import type { InlineButton, InlineKeyboard } from "./telegram";

export type Action =
  | { type: "approve"; attemptId: string }
  | { type: "approveConfirm"; token: string }
  | { type: "approveCancel"; token: string }
  | { type: "reject"; attemptId: string }
  | { type: "rejectReason"; attemptId: string; reason: number }
  | { type: "rejectBack"; attemptId: string }
  | { type: "order"; orderId: string }
  | { type: "orderRefresh"; orderId: string }
  | { type: "orderPayments"; orderId: string }
  | { type: "transition"; orderId: string; from: FulfillmentStatus; to: FulfillmentStatus }
  | { type: "cancelConfirm"; orderId: string; from: FulfillmentStatus }
  | { type: "batch"; batchId: string; status: "open" | "closed"; confirmed: boolean }
  | { type: "batchList" }
  | { type: "voucher"; voucherId: string; active: boolean };

const statusIndex = (status: FulfillmentStatus) => fulfillmentStatusValues.indexOf(status);
const statusAt = (index: string) =>
  /^\d$/.test(index) ? fulfillmentStatusValues[Number(index)] : undefined;

/** Truncates by code point so emoji are never split into lone surrogates. */
export const truncate = (text: string, max: number) => Array.from(text).slice(0, max).join("");

export function encodeAction(action: Action): string {
  switch (action.type) {
    case "approve":
      return `pa:${action.attemptId}`;
    case "approveConfirm":
      return `pc:${action.token}`;
    case "approveCancel":
      return `px:${action.token}`;
    case "reject":
      return `pr:${action.attemptId}`;
    case "rejectReason":
      return `rr:${action.attemptId}:${action.reason}`;
    case "rejectBack":
      return `rb:${action.attemptId}`;
    case "order":
      return `od:${action.orderId}`;
    case "orderRefresh":
      return `or:${action.orderId}`;
    case "orderPayments":
      return `op:${action.orderId}`;
    case "transition":
      return `ft:${action.orderId}:${statusIndex(action.from)}:${statusIndex(action.to)}`;
    case "cancelConfirm":
      return `fc:${action.orderId}:${statusIndex(action.from)}`;
    case "batch": {
      // Lowercase asks for confirmation, uppercase is the confirmed press.
      const code = action.status === "open" ? "o" : "c";
      return `bs:${action.batchId}:${action.confirmed ? code.toUpperCase() : code}`;
    }
    case "batchList":
      return "bl:_";
    case "voucher":
      return `vt:${action.voucherId}:${action.active ? 1 : 0}`;
  }
}

export function decodeAction(data: string): Action | null {
  const [prefix, id = "", a = "", b = ""] = data.split(":");
  if (!id) return null;
  switch (prefix) {
    case "pa":
      return { type: "approve", attemptId: id };
    case "pc":
      return { type: "approveConfirm", token: id };
    case "px":
      return { type: "approveCancel", token: id };
    case "pr":
      return { type: "reject", attemptId: id };
    case "rr":
      return /^\d$/.test(a) ? { type: "rejectReason", attemptId: id, reason: Number(a) } : null;
    case "rb":
      return { type: "rejectBack", attemptId: id };
    case "od":
      return { type: "order", orderId: id };
    case "or":
      return { type: "orderRefresh", orderId: id };
    case "op":
      return { type: "orderPayments", orderId: id };
    case "ft": {
      const from = statusAt(a);
      const to = statusAt(b);
      return from && to ? { type: "transition", orderId: id, from, to } : null;
    }
    case "fc": {
      const from = statusAt(a);
      return from ? { type: "cancelConfirm", orderId: id, from } : null;
    }
    case "bs":
      if (!["o", "c", "O", "C"].includes(a)) return null;
      return {
        type: "batch",
        batchId: id,
        status: a.toLowerCase() === "o" ? "open" : "closed",
        confirmed: a === a.toUpperCase(),
      };
    case "bl":
      return { type: "batchList" };
    case "vt":
      return { type: "voucher", voucherId: id, active: a === "1" };
    default:
      return null;
  }
}

const button = (text: string, action: Action): InlineButton => ({
  text,
  callback_data: encodeAction(action),
});

export const paymentKeyboard = (attemptId: string): InlineKeyboard => ({
  inline_keyboard: [
    [
      button("✅ Setujui", { type: "approve", attemptId }),
      button("❌ Tolak", { type: "reject", attemptId }),
    ],
  ],
});

export const rejectReasonKeyboard = (attemptId: string): InlineKeyboard => ({
  inline_keyboard: [
    ...rejectionReasons.map((reason, index) => [
      button(reason, { type: "rejectReason", attemptId, reason: index }),
    ]),
    [button("↩️ Kembali", { type: "rejectBack", attemptId })],
  ],
});

export const approveConfirmKeyboard = (token: string): InlineKeyboard => ({
  inline_keyboard: [
    [
      button("✅ Ya, setujui", { type: "approveConfirm", token }),
      button("Batal", { type: "approveCancel", token }),
    ],
  ],
});

const transitionEmoji: Partial<Record<FulfillmentStatus, string>> = {
  preparing: "👩‍🍳",
  ready_pickup: "🏪",
  picked_up: "✅",
  ready_delivery: "📦",
  in_transit: "🛵",
  delivered: "✅",
  cancelled: "🚫",
};

/** Next fulfillment steps the order allows, plus payment review and refresh. */
export function orderKeyboard(row: OrderRow): InlineKeyboard {
  const from = row.fulfillmentStatus;
  const steps = (fulfillmentTransitions[row.method][from] ?? []).filter((to) =>
    canTransition(row.method, row.paymentStatus, from, to),
  );
  const rows: InlineButton[][] = steps.map((to) => [
    button(
      `${transitionEmoji[to] ?? "➡️"} ${fulfillmentStatusLabels[to]}`,
      to === "cancelled"
        ? { type: "cancelConfirm", orderId: row.id, from }
        : { type: "transition", orderId: row.id, from, to },
    ),
  ]);
  if (row.paymentStatus === "review") {
    rows.push([button("💳 Tinjau pembayaran", { type: "orderPayments", orderId: row.id })]);
  }
  rows.push([button("🔄 Muat ulang", { type: "orderRefresh", orderId: row.id })]);
  return { inline_keyboard: rows };
}

export const cancelConfirmKeyboard = (
  orderId: string,
  from: FulfillmentStatus,
): InlineKeyboard => ({
  inline_keyboard: [
    [
      button("🚫 Ya, batalkan", { type: "transition", orderId, from, to: "cancelled" }),
      button("Kembali", { type: "orderRefresh", orderId }),
    ],
  ],
});

export const orderListKeyboard = (
  rows: { id: string; invoiceNumber: string; customerName: string }[],
) => ({
  inline_keyboard: rows.map((row) => [
    button(truncate(`${row.invoiceNumber} · ${row.customerName}`, 60), {
      type: "order",
      orderId: row.id,
    }),
  ]),
});

export const batchKeyboard = (rows: BatchRow[]): InlineKeyboard => ({
  inline_keyboard: rows.flatMap((row) => {
    if (row.status === "open") {
      return [
        [
          button(`🔒 Tutup ${row.name}`, {
            type: "batch",
            batchId: row.id,
            status: "closed",
            confirmed: false,
          }),
        ],
      ];
    }
    return [
      [
        button(`🔓 Buka ${row.name}`, {
          type: "batch",
          batchId: row.id,
          status: "open",
          confirmed: false,
        }),
      ],
    ];
  }),
});

export const batchConfirmKeyboard = (
  batchId: string,
  status: "open" | "closed",
): InlineKeyboard => ({
  inline_keyboard: [
    [
      button(status === "open" ? "🔓 Ya, buka batch" : "🔒 Ya, tutup batch", {
        type: "batch",
        batchId,
        status,
        confirmed: true,
      }),
      button("Kembali", { type: "batchList" }),
    ],
  ],
});

export const voucherKeyboard = (rows: VoucherRow[]): InlineKeyboard => ({
  inline_keyboard: rows.map((row) => [
    button(
      `${row.active ? "🟢" : "⚪️"} ${row.code} · ${row.used}${row.quota ? `/${row.quota}` : ""} dipakai`,
      { type: "voucher", voucherId: row.id, active: !row.active },
    ),
  ]),
});
