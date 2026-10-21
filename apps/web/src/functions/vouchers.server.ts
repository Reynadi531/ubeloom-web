/**
 * Server-only voucher logic behind `./vouchers` and checkout. A voucher's usage is the
 * number of non-cancelled orders holding it, so cancelling an order frees its use.
 */
import { order, orderVoucher, voucher } from "@web-kwu/db/schema/shop";
import { setVoucherActive } from "@web-kwu/shop/catalog";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import { applyVouchers, type VoucherLine } from "@/lib/vouchers";
import { db } from "@/services";

import { OrderError, isUniqueViolation, mergeQuantities } from "./orders.server";
import type { CheckVoucherData, SaveVoucherData } from "./vouchers";

type Executor = Pick<typeof db, "select">;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Non-cancelled orders holding each voucher. */
async function voucherUsage(executor: Executor, voucherIds: string[]) {
  if (voucherIds.length === 0) return new Map<string, number>();
  const rows = await executor
    .select({ voucherId: orderVoucher.voucherId, count: sql<number>`count(*)::int` })
    .from(orderVoucher)
    .innerJoin(order, eq(order.id, orderVoucher.orderId))
    .where(
      and(inArray(orderVoucher.voucherId, voucherIds), ne(order.fulfillmentStatus, "cancelled")),
    )
    .groupBy(orderVoucher.voucherId);
  return new Map(rows.map(({ voucherId, count }) => [voucherId ?? "", Number(count)]));
}

/* -------------------------------------------------------------------------- */
/*                                  Checkout                                  */
/* -------------------------------------------------------------------------- */

/**
 * Applies stacked voucher codes to priced lines inside the order transaction. Locks the
 * voucher rows (in id order, so concurrent checkouts cannot deadlock) so they cannot overrun
 * their quotas. Every code must apply; the client only sends codes its preview accepted.
 */
export async function redeemVouchers(
  tx: Transaction,
  codes: string[],
  lines: VoucherLine[],
  shippingFee: number,
) {
  if (codes.length === 0) return [];
  const locked = await tx
    .select()
    .from(voucher)
    .where(inArray(voucher.code, codes))
    .orderBy(asc(voucher.id))
    .for("update");
  const byCode = new Map(locked.map((row) => [row.code, row]));
  const missing = codes.find((code) => !byCode.has(code));
  if (missing) throw new OrderError(`Kode voucher ${missing} tidak ditemukan.`);

  const stacked = codes.map((code) => byCode.get(code)!);
  const usage = await voucherUsage(
    tx,
    stacked.map(({ id }) => id),
  );
  const results = applyVouchers(
    stacked.map((rule) => ({ rule, used: usage.get(rule.id) ?? 0 })),
    lines,
    shippingFee,
  );
  return stacked.map((row, index) => {
    const result = results[index];
    if (!result.ok) throw new OrderError(`Voucher ${row.code}: ${result.message}`);
    return { voucherId: row.id, code: row.code, discount: result.discount };
  });
}

/**
 * Prices the cart at current batch prices and previews the stacked discounts of the codes,
 * one result per code in the same order.
 */
export async function checkVouchersForCart(data: CheckVoucherData) {
  const quantities = mergeQuantities(data.items);
  const [found, batchProducts] = await Promise.all([
    db.query.voucher.findMany({ where: { code: { in: data.codes } } }),
    db.query.batchProduct.findMany({
      where: { batchId: data.batchId, productId: { in: [...quantities.keys()] } },
      with: { product: { columns: { price: true } } },
    }),
  ]);

  const lines = batchProducts.map(({ productId, price, product }) => ({
    productId,
    unitPrice: price ?? product.price,
    quantity: quantities.get(productId) ?? 0,
  }));
  const byCode = new Map(found.map((row) => [row.code, row]));
  const stacked = data.codes.flatMap((code) => {
    const row = byCode.get(code);
    return row ? [row] : [];
  });
  const usage = await voucherUsage(
    db,
    stacked.map(({ id }) => id),
  );
  const results = applyVouchers(
    stacked.map((rule) => ({ rule, used: usage.get(rule.id) ?? 0 })),
    lines,
    data.shippingFee,
  );
  const resultOf = new Map(stacked.map((row, index) => [row.code, results[index]]));

  return data.codes.map((code) => {
    const row = byCode.get(code);
    const result = resultOf.get(code);
    if (!row || !result) {
      return { ok: false as const, code, message: "Kode voucher tidak ditemukan." };
    }
    if (!result.ok) return { ok: false as const, code, message: result.message };
    return {
      ok: true as const,
      code: row.code,
      description: row.description,
      discount: result.discount,
      /** Ongkir rule, so checkout can follow fee changes; null for product vouchers. */
      shipping:
        row.scope === "shipping"
          ? {
              discountType: row.discountType,
              value: row.value,
              maxDiscount: row.maxDiscount,
            }
          : null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*                                 Dashboard                                  */
/* -------------------------------------------------------------------------- */

export async function listVouchersPage() {
  const [vouchers, products] = await Promise.all([
    db.query.voucher.findMany({ orderBy: { createdAt: "desc" } }),
    db.query.product.findMany({
      columns: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  const usage = await voucherUsage(
    db,
    vouchers.map(({ id }) => id),
  );
  const productNames = new Map(products.map(({ id, name }) => [id, name]));

  return {
    products,
    vouchers: vouchers.map((row) => ({
      id: row.id,
      code: row.code,
      description: row.description,
      scope: row.scope,
      discountType: row.discountType,
      value: row.value,
      items: row.items.map((item) => ({
        ...item,
        productName: productNames.get(item.productId) ?? "Produk terhapus",
      })),
      maxDiscount: row.maxDiscount,
      minSubtotal: row.minSubtotal,
      quota: row.quota,
      used: usage.get(row.id) ?? 0,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      active: row.active,
    })),
  };
}

export async function upsertVoucher(data: SaveVoucherData, actorId: string) {
  if (data.items.length > 0) {
    const found = await db.query.product.findMany({
      where: { id: { in: data.items.map(({ productId }) => productId) } },
      columns: { id: true },
    });
    if (found.length !== data.items.length) {
      throw new Error("Ada produk promo yang sudah tidak tersedia. Pilih ulang produknya.");
    }
  }

  const { id, ...values } = data;
  try {
    if (!id) {
      const [created] = await db
        .insert(voucher)
        .values({ ...values, createdById: actorId })
        .returning({ id: voucher.id });
      return created;
    }
    const used = (await voucherUsage(db, [id])).get(id) ?? 0;
    if (values.quota !== null && values.quota < used) {
      throw new Error(`Kuota tidak boleh kurang dari pemakaian saat ini (${used}).`);
    }
    const [updated] = await db
      .update(voucher)
      .set(values)
      .where(eq(voucher.id, id))
      .returning({ id: voucher.id });
    if (!updated) throw new Error("Voucher tidak ditemukan.");
    return updated;
  } catch (error) {
    if (isUniqueViolation(error, "code")) {
      throw new Error(`Kode ${values.code} sudah dipakai voucher lain.`);
    }
    throw error;
  }
}

export function toggleVoucher(id: string, active: boolean) {
  return setVoucherActive(db, id, active);
}

export async function removeVoucher(id: string) {
  // Any order, cancelled included, keeps the voucher for its history.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orderVoucher)
    .where(eq(orderVoucher.voucherId, id));
  if (Number(count) > 0) {
    throw new Error("Voucher sudah dipakai pesanan. Nonaktifkan saja agar riwayat tetap utuh.");
  }
  await db.delete(voucher).where(eq(voucher.id, id));
  return { ok: true };
}
