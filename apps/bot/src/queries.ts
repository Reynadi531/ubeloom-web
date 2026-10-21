import type { Database } from "@web-kwu/db";
import { order } from "@web-kwu/db/schema/index";
import { and, count, gte, ne, sql, sum } from "drizzle-orm";

import type { DailySummary, NewOrder, PendingPayment } from "./format";

const DAY_MS = 24 * 60 * 60 * 1000;
/** WIB is UTC+7 all year. */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Midnight WIB of the current day. */
export const startOfTodayWib = (now = Date.now()) =>
  new Date(Math.floor((now + WIB_OFFSET_MS) / DAY_MS) * DAY_MS - WIB_OFFSET_MS);

export function ordersSince(db: Database, since: Date): Promise<NewOrder[]> {
  return db.query.order.findMany({
    where: { createdAt: { gt: since } },
    orderBy: { createdAt: "asc" },
    columns: {
      id: true,
      invoiceNumber: true,
      customerName: true,
      customerPhone: true,
      method: true,
      deliveryArea: true,
      address: true,
      paymentMethod: true,
      paymentStatus: true,
      total: true,
      notes: true,
      createdById: true,
      createdAt: true,
    },
    with: {
      batch: { columns: { name: true } },
      pickupSlot: { columns: { startsAt: true } },
      deliveryZone: { columns: { windowStartsAt: true } },
      items: { columns: { productName: true, quantity: true, lineTotal: true } },
    },
  });
}

export type PendingPaymentRow = PendingPayment & {
  proofKey: string | null;
  proofUrl: string | null;
};

/** Payment proofs waiting in "Verifikasi bayar", oldest first; `since` limits to newer ones. */
export function pendingPayments(db: Database, since?: Date): Promise<PendingPaymentRow[]> {
  return db.query.paymentAttempt.findMany({
    where: { status: "pending", ...(since ? { createdAt: { gt: since } } : {}) },
    orderBy: { createdAt: "asc" },
    columns: {
      id: true,
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
