/**
 * Server-only voucher logic behind `./vouchers` and checkout. A voucher's usage is the
 * number of non-cancelled orders holding it, so cancelling an order frees its use.
 */
import { order, voucher } from "@web-kwu/db/schema/shop";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { applyVoucher, type VoucherLine } from "@/lib/vouchers";
import { db } from "@/services";

import { OrderError, isUniqueViolation, mergeQuantities } from "./orders.server";
import type { CheckVoucherData, SaveVoucherData } from "./vouchers";

type Executor = Pick<typeof db, "select">;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Non-cancelled orders holding each voucher. */
async function voucherUsage(executor: Executor, voucherIds: string[]) {
  if (voucherIds.length === 0) return new Map<string, number>();
  const rows = await executor
    .select({ voucherId: order.voucherId, count: sql<number>`count(*)::int` })
    .from(order)
    .where(and(inArray(order.voucherId, voucherIds), ne(order.fulfillmentStatus, "cancelled")))
    .groupBy(order.voucherId);
  return new Map(rows.map(({ voucherId, count }) => [voucherId ?? "", Number(count)]));
}

/* -------------------------------------------------------------------------- */
/*                                  Checkout                                  */
/* -------------------------------------------------------------------------- */

/**
 * Applies a voucher code to priced lines inside the order transaction. Locks the voucher
 * row so concurrent checkouts cannot overrun its quota.
 */
export async function redeemVoucher(
  tx: Transaction,
  code: string,
  lines: VoucherLine[],
  shippingFee: number,
) {
  const [locked] = await tx.select().from(voucher).where(eq(voucher.code, code)).for("update");
  if (!locked) throw new OrderError("Kode voucher tidak ditemukan.");
  const used = (await voucherUsage(tx, [locked.id])).get(locked.id) ?? 0;
  const result = applyVoucher(locked, lines, used, shippingFee);
  if (!result.ok) throw new OrderError(result.message);
  return { voucherId: locked.id, voucherCode: locked.code, discount: result.discount };
}

/** Prices the cart at current batch prices and previews the voucher's discount. */
export async function checkVoucherForCart(data: CheckVoucherData) {
  const quantities = mergeQuantities(data.items);
  const [found, batchProducts] = await Promise.all([
    db.query.voucher.findFirst({ where: { code: data.code } }),
    db.query.batchProduct.findMany({
      where: { batchId: data.batchId, productId: { in: [...quantities.keys()] } },
      with: { product: { columns: { price: true } } },
    }),
  ]);
  if (!found) throw new Error("Kode voucher tidak ditemukan.");

  const lines = batchProducts.map(({ productId, price, product }) => ({
    productId,
    unitPrice: price ?? product.price,
    quantity: quantities.get(productId) ?? 0,
  }));
  const used = (await voucherUsage(db, [found.id])).get(found.id) ?? 0;
  const result = applyVoucher(found, lines, used, data.shippingFee);
  if (!result.ok) throw new Error(result.message);
  return {
    code: found.code,
    description: found.description,
    discount: result.discount,
    /** Ongkir rule, so checkout can follow fee changes; null for product vouchers. */
    shipping:
      found.scope === "shipping"
        ? {
            discountType: found.discountType,
            value: found.value,
            maxDiscount: found.maxDiscount,
          }
        : null,
  };
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

export async function toggleVoucher(id: string, active: boolean) {
  const [updated] = await db
    .update(voucher)
    .set({ active })
    .where(eq(voucher.id, id))
    .returning({ id: voucher.id });
  if (!updated) throw new Error("Voucher tidak ditemukan.");
  return { ok: true };
}

export async function removeVoucher(id: string) {
  // Any order, cancelled included, keeps the voucher for its history.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(order)
    .where(eq(order.voucherId, id));
  if (Number(count) > 0) {
    throw new Error("Voucher sudah dipakai pesanan. Nonaktifkan saja agar riwayat tetap utuh.");
  }
  await db.delete(voucher).where(eq(voucher.id, id));
  return { ok: true };
}
