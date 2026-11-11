/**
 * Order status vocabulary and rules shared by the dashboard (client and server) and
 * the Telegram bot. Pure: no database imports, so client bundles can use it.
 */

export type FulfillmentMethod = "pickup" | "delivery";
export type PaymentStatus = "unpaid" | "review" | "paid";
export type FulfillmentStatus =
  | "pending"
  | "preparing"
  | "ready_pickup"
  | "picked_up"
  | "ready_delivery"
  | "in_transit"
  | "delivered"
  | "cancelled";
export type PaymentAttemptStatus = "pending" | "approved" | "rejected";

export const fulfillmentStatusValues = [
  "pending",
  "preparing",
  "ready_pickup",
  "picked_up",
  "ready_delivery",
  "in_transit",
  "delivered",
  "cancelled",
] as const satisfies readonly FulfillmentStatus[];

/** Checkout orders start as plain QRIS; the label narrows once the customer pays one way. */
export const QRIS_PAYMENT_METHOD = "QRIS";
/** Dynamic QR from the gateway, settled automatically. */
export const QRIS_AUTO_PAYMENT_METHOD = "QRIS otomatis";
/** Static QR plus an uploaded proof that an admin reviews. */
export const QRIS_MANUAL_PAYMENT_METHOD = "QRIS manual";

/** Order event written when the QRIS gateway settles an order (no reviewer involved). */
export const AUTO_PAYMENT_EVENT = "payment_auto_approved";
/** Order event written when gateway money arrives but cannot settle its order. */
export const UNMATCHED_PAYMENT_EVENT = "payment_unmatched";

export const methodLabels: Record<FulfillmentMethod, string> = {
  pickup: "Pickup",
  delivery: "Delivery",
};

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  unpaid: "Belum bayar",
  review: "Review",
  paid: "Lunas",
};

export const fulfillmentStatusLabels: Record<FulfillmentStatus, string> = {
  pending: "Menunggu",
  preparing: "Disiapkan",
  ready_pickup: "Siap diambil",
  picked_up: "Selesai",
  ready_delivery: "Siap dikirim",
  in_transit: "Dalam perjalanan",
  delivered: "Terkirim",
  cancelled: "Dibatalkan",
};

/** Next fulfillment steps an admin may take. Production starts only after payment. */
export const fulfillmentTransitions: Record<
  FulfillmentMethod,
  Partial<Record<FulfillmentStatus, FulfillmentStatus[]>>
> = {
  pickup: {
    pending: ["preparing", "cancelled"],
    preparing: ["ready_pickup", "cancelled"],
    ready_pickup: ["picked_up"],
  },
  delivery: {
    pending: ["preparing", "cancelled"],
    preparing: ["ready_delivery", "cancelled"],
    ready_delivery: ["in_transit"],
    in_transit: ["delivered"],
  },
};

export function canTransition(
  method: FulfillmentMethod,
  paymentStatus: PaymentStatus,
  from: FulfillmentStatus,
  to: FulfillmentStatus,
) {
  if (to !== "cancelled" && paymentStatus !== "paid") return false;
  return fulfillmentTransitions[method][from]?.includes(to) ?? false;
}

/** What the reviewer confirms before approving a payment proof. */
export const paymentChecklist = [
  "Nominal dan mata uang cocok dengan invoice",
  "Mutasi merchant diterima dan waktunya sesuai",
  "Referensi transaksi belum dipakai invoice lain",
];

export const rejectionReasons = [
  "Nominal tidak sesuai invoice",
  "Mutasi merchant tidak ditemukan",
  "Bukti tidak terbaca / tidak valid",
  "Referensi sudah dipakai invoice lain",
  "Lainnya",
];
