/**
 * Order status vocabulary shared by every admin page. Enum values come from
 * `@web-kwu/db/schema/shop`; this module owns their labels and legal transitions.
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

/** Cash is always offered on manual orders; it skips the review queue. */
export const CASH_PAYMENT_METHOD = "Tunai";

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

const INVOICE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Customer-facing order code: UBP-YYYYMMDD-XXXXXXXX (date in WIB). */
export function generateInvoiceNumber(now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" })
    .format(now)
    .replaceAll("-", "");
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const suffix = Array.from(bytes, (byte) => INVOICE_ALPHABET[byte % INVOICE_ALPHABET.length]).join(
    "",
  );
  return `UBP-${date}-${suffix}`;
}

/** Whether a delivery window (its `areas` list; empty = all) serves the given area. */
export function windowServesArea(areas: string[], area: string) {
  const target = area.trim().toLowerCase();
  return areas.length === 0 || areas.some((name) => name.trim().toLowerCase() === target);
}
