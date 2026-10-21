import type { Database } from "@web-kwu/db";
import { user } from "@web-kwu/db/schema/auth";
import { order, orderVoucher } from "@web-kwu/db/schema/shop";
import { and, count, desc, eq, gte, ilike, inArray, ne, or, sql, sum } from "drizzle-orm";

import type { DailySummary, OrderRow, PendingPayment } from "./format";

const DAY_MS = 24 * 60 * 60 * 1000;
/** WIB is UTC+7 all year. */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Midnight WIB of the current day. */
export const startOfTodayWib = (now = Date.now()) =>
  new Date(Math.floor((now + WIB_OFFSET_MS) / DAY_MS) * DAY_MS - WIB_OFFSET_MS);

const orderColumns = {
  id: true,
  invoiceNumber: true,
  customerName: true,
  customerPhone: true,
  method: true,
  deliveryArea: true,
  address: true,
  paymentMethod: true,
  paymentStatus: true,
  fulfillmentStatus: true,
  total: true,
  notes: true,
  createdById: true,
  createdAt: true,
} as const;

const orderRelations = {
  batch: { columns: { name: true } },
  pickupSlot: { columns: { startsAt: true } },
  deliveryZone: { columns: { windowStartsAt: true } },
  items: { columns: { productName: true, quantity: true, lineTotal: true } },
} as const;

export function ordersSince(db: Database, since: Date): Promise<OrderRow[]> {
  return db.query.order.findMany({
    where: { createdAt: { gt: since } },
    orderBy: { createdAt: "asc" },
    columns: orderColumns,
    with: orderRelations,
  });
}

export async function orderById(db: Database, id: string): Promise<OrderRow | null> {
  const row = await db.query.order.findFirst({
    where: { id },
    columns: orderColumns,
    with: orderRelations,
  });
  return row ?? null;
}

const SEARCH_LIMIT = 10;

/** Newest orders whose invoice number, customer name or phone contains `query`. */
export function searchOrders(db: Database, query: string) {
  const pattern = `%${query.replaceAll(/[\\%_]/g, (char) => `\\${char}`)}%`;
  return db
    .select({
      id: order.id,
      invoiceNumber: order.invoiceNumber,
      customerName: order.customerName,
      total: order.total,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
    })
    .from(order)
    .where(
      or(
        ilike(order.invoiceNumber, pattern),
        ilike(order.customerName, pattern),
        ilike(order.customerPhone, pattern),
      ),
    )
    .orderBy(desc(order.createdAt))
    .limit(SEARCH_LIMIT);
}

export type PendingPaymentRow = PendingPayment & {
  orderId: string;
  proofKey: string | null;
  proofUrl: string | null;
};

/**
 * Payment proofs waiting in "Verifikasi bayar", oldest first; `since` limits to
 * newer ones, `orderId` to one order.
 */
export function pendingPayments(
  db: Database,
  filter: { since?: Date; orderId?: string } = {},
): Promise<PendingPaymentRow[]> {
  return db.query.paymentAttempt.findMany({
    where: {
      status: "pending",
      ...(filter.since ? { createdAt: { gt: filter.since } } : {}),
      ...(filter.orderId ? { orderId: filter.orderId } : {}),
    },
    orderBy: { createdAt: "asc" },
    columns: {
      id: true,
      orderId: true,
      attempt: true,
      claimedAmount: true,
      claimedPaidAt: true,
      customerReference: true,
      proofKey: true,
      proofUrl: true,
      createdAt: true,
    },
    with: {
      order: {
        columns: {
          invoiceNumber: true,
          customerName: true,
          customerPhone: true,
          paymentMethod: true,
          total: true,
        },
      },
    },
  });
}

/** Status and invoice of one attempt, checked before prompting the reviewer. */
export function paymentAttemptSummary(db: Database, id: string) {
  return db.query.paymentAttempt.findFirst({
    where: { id },
    columns: { id: true, status: true, attempt: true },
    with: { order: { columns: { invoiceNumber: true } } },
  });
}

/** Non-cancelled orders placed today (WIB). */
export async function todaySummary(db: Database): Promise<DailySummary> {
  const [row] = await db
    .select({
      orders: count(),
      revenue: sum(order.total).mapWith(Number),
      unpaid: sql<number>`count(*) filter (where ${order.paymentStatus} = 'unpaid')`.mapWith(
        Number,
      ),
      review: sql<number>`count(*) filter (where ${order.paymentStatus} = 'review')`.mapWith(
        Number,
      ),
      paid: sql<number>`count(*) filter (where ${order.paymentStatus} = 'paid')`.mapWith(Number),
    })
    .from(order)
    .where(and(gte(order.createdAt, startOfTodayWib()), ne(order.fulfillmentStatus, "cancelled")));
  return {
    orders: row?.orders ?? 0,
    revenue: row?.revenue ?? 0,
    unpaid: row?.unpaid ?? 0,
    review: row?.review ?? 0,
    paid: row?.paid ?? 0,
  };
}

const BATCH_LIMIT = 5;

/** Most recent non-archived batches with their non-cancelled order counts. */
export async function recentBatches(db: Database) {
  const batches = await db.query.batch.findMany({
    where: { status: { ne: "archived" } },
    orderBy: { opensAt: "desc" },
    limit: BATCH_LIMIT,
    columns: { id: true, name: true, status: true, opensAt: true, closesAt: true },
  });
  if (batches.length === 0) return [];
  const counts = await db
    .select({ batchId: order.batchId, orders: count() })
    .from(order)
    .where(ne(order.fulfillmentStatus, "cancelled"))
    .groupBy(order.batchId);
  const byBatch = new Map(counts.map((row) => [row.batchId, row.orders]));
  return batches.map((row) => ({ ...row, orders: byBatch.get(row.id) ?? 0 }));
}

export type BatchRow = Awaited<ReturnType<typeof recentBatches>>[number];

const VOUCHER_LIMIT = 20;

/** Vouchers with how many non-cancelled orders used them, active first. */
export async function listVouchers(db: Database) {
  const vouchers = await db.query.voucher.findMany({
    orderBy: { createdAt: "desc" },
    limit: VOUCHER_LIMIT,
    columns: { id: true, code: true, description: true, active: true, quota: true },
  });
  if (vouchers.length === 0) return [];
  const usage = await db
    .select({ voucherId: orderVoucher.voucherId, used: count() })
    .from(orderVoucher)
    .innerJoin(order, eq(order.id, orderVoucher.orderId))
    .where(ne(order.fulfillmentStatus, "cancelled"))
    .groupBy(orderVoucher.voucherId);
  const byVoucher = new Map(usage.map((row) => [row.voucherId, row.used]));
  return vouchers
    .map((row) => ({ ...row, used: byVoucher.get(row.id) ?? 0 }))
    .sort((a, b) => Number(b.active) - Number(a.active));
}

export type VoucherRow = Awaited<ReturnType<typeof listVouchers>>[number];

/** Dashboard accounts behind the configured Telegram admins; `emails` are lowercase. */
export function usersByEmail(db: Database, emails: string[]) {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(inArray(sql`lower(${user.email})`, emails));
}

export function batchStatus(db: Database, id: string) {
  return db.query.batch.findFirst({ where: { id }, columns: { status: true } });
}
