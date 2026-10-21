/**
 * Order helpers shared by every admin page. The status vocabulary (types, labels and
 * legal transitions) now lives in `@web-kwu/shop/rules` and is re-exported here.
 */

export type {
  FulfillmentMethod,
  FulfillmentStatus,
  PaymentAttemptStatus,
  PaymentStatus,
} from "@web-kwu/shop/rules";
export {
  canTransition,
  fulfillmentStatusLabels,
  fulfillmentTransitions,
  methodLabels,
  paymentStatusLabels,
} from "@web-kwu/shop/rules";

/** Cash is always offered on manual orders; it skips the review queue. */
export const CASH_PAYMENT_METHOD = "Tunai";

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
