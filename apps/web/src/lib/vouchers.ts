/**
 * Voucher rules shared by checkout (preview and placement) and the dashboard. Pure so the
 * server and the client agree on the discount; the server always recomputes it.
 *
 * Three shapes:
 * - scope `order`: one percentage or rupiah cut on the whole product subtotal.
 * - scope `products`: an individual discount per product; rupiah cuts apply per unit.
 * - scope `shipping`: one percentage or rupiah cut on ongkir; delivery orders only.
 */
import { formatRupiah } from "./format";

export type VoucherDiscountType = "percentage" | "fixed";
export type VoucherScope = "order" | "products" | "shipping";

export interface VoucherItemRule {
  productId: string;
  discountType: VoucherDiscountType;
  value: number;
}

export interface VoucherRule {
  scope: VoucherScope;
  discountType: VoucherDiscountType | null;
  value: number | null;
  items: VoucherItemRule[];
  maxDiscount: number | null;
  minSubtotal: number;
  quota: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
}

export interface VoucherLine {
  productId: string;
  unitPrice: number;
  quantity: number;
}

/** Codes are matched case-insensitively and stored uppercase. */
export const normalizeVoucherCode = (code: string) => code.trim().toUpperCase();

export const VOUCHER_CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;

/** "10%", "Rp 5.000" for an order rule; "Rp 3.000 / item" for a per-product rupiah cut. */
export function discountLabel(discountType: VoucherDiscountType, value: number, perItem = false) {
  if (discountType === "percentage") return `${value}%`;
  return perItem ? `${formatRupiah(value)} / item` : formatRupiah(value);
}

/** Why a voucher cannot be used right now, or null when it is usable. */
function availabilityError(rule: VoucherRule, used: number, now: Date) {
  if (!rule.active) return "Voucher tidak aktif.";
  if (rule.startsAt && now < rule.startsAt) return "Voucher belum berlaku.";
  if (rule.endsAt && now > rule.endsAt) return "Voucher sudah berakhir.";
  if (rule.quota !== null && used >= rule.quota) return "Kuota voucher sudah habis.";
  return null;
}

function lineDiscount(
  { discountType, value }: { discountType: VoucherDiscountType; value: number },
  { unitPrice, quantity }: VoucherLine,
) {
  return discountType === "percentage"
    ? Math.floor((unitPrice * quantity * value) / 100)
    : Math.min(value, unitPrice) * quantity;
}

/**
 * Ongkir discount of a `shipping` voucher, capped by its max discount and the fee itself.
 * Exported so checkout can follow fee changes without re-checking the code.
 */
export function shippingDiscount(
  rule: Pick<VoucherRule, "discountType" | "value" | "maxDiscount">,
  shippingFee: number,
) {
  if (!rule.discountType || !rule.value) return 0;
  const discount =
    rule.discountType === "percentage" ? Math.floor((shippingFee * rule.value) / 100) : rule.value;
  return Math.min(discount, rule.maxDiscount ?? discount, shippingFee);
}

export type VoucherResult =
  | { ok: true; discount: number; eligibleSubtotal: number }
  | { ok: false; message: string };

/**
 * Discount of a voucher on the given lines and ongkir. `used` is the number of orders
 * already holding the voucher. A product discount never exceeds the eligible subtotal and
 * an ongkir discount never exceeds `shippingFee`, so totals stay ≥ 0.
 */
export function applyVoucher(
  rule: VoucherRule,
  lines: VoucherLine[],
  used: number,
  shippingFee: number,
  now = new Date(),
): VoucherResult {
  const unavailable = availabilityError(rule, used, now);
  if (unavailable) return { ok: false, message: unavailable };

  let eligibleSubtotal = 0;
  let discount = 0;
  if (rule.scope === "shipping") {
    if (!rule.discountType || !rule.value) return { ok: false, message: "Voucher tidak valid." };
    eligibleSubtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    if (eligibleSubtotal < rule.minSubtotal) {
      return { ok: false, message: `Minimal belanja ${formatRupiah(rule.minSubtotal)}.` };
    }
    if (shippingFee === 0) {
      return { ok: false, message: "Voucher ongkir hanya berlaku untuk pesanan delivery." };
    }
    return { ok: true, discount: shippingDiscount(rule, shippingFee), eligibleSubtotal };
  }
  if (rule.scope === "order") {
    if (!rule.discountType || !rule.value) return { ok: false, message: "Voucher tidak valid." };
    eligibleSubtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    discount =
      rule.discountType === "percentage"
        ? Math.floor((eligibleSubtotal * rule.value) / 100)
        : rule.value;
  } else {
    for (const line of lines) {
      const item = rule.items.find(({ productId }) => productId === line.productId);
      if (!item) continue;
      eligibleSubtotal += line.unitPrice * line.quantity;
      discount += lineDiscount(item, line);
    }
    if (eligibleSubtotal === 0) {
      return { ok: false, message: "Voucher tidak berlaku untuk produk yang dipilih." };
    }
  }

  if (eligibleSubtotal < rule.minSubtotal) {
    return {
      ok: false,
      message: `Minimal belanja ${formatRupiah(rule.minSubtotal)}${rule.scope === "products" ? " untuk produk promo" : ""}.`,
    };
  }
  if (rule.maxDiscount !== null) discount = Math.min(discount, rule.maxDiscount);
  return { ok: true, discount: Math.min(discount, eligibleSubtotal), eligibleSubtotal };
}
