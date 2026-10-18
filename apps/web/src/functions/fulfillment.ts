import { createServerFn } from "@tanstack/react-start";
import {
  batch,
  deliveryZone,
  order,
  orderEvent,
  orderItem,
  paymentAttempt,
  pickupSlot,
} from "@web-kwu/db/schema/shop";
import { and, asc, desc, eq, gte, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { resolveBatch } from "@/lib/batches.server";
import { type FulfillmentStatus, canTransition } from "@/lib/orders";
import { requireAuthMiddleware } from "@/middleware/auth";
import { db } from "@/services";

const fulfillmentStatusValues = [
  "pending",
  "preparing",
  "ready_pickup",
  "picked_up",
  "ready_delivery",
  "in_transit",
  "delivered",
  "cancelled",
] as const satisfies readonly FulfillmentStatus[];

/**
 * Status filter on the fulfillment board. `awaiting_payment` covers every
 * unpaid / in-review order; the rest are fulfillment statuses of paid orders.
 */
export const boardStatusValues = ["awaiting_payment", ...fulfillmentStatusValues] as const;
export type BoardStatus = (typeof boardStatusValues)[number];

export const fulfillmentBoardSearchSchema = z.object({
  batch: z.string().min(1).optional().catch(undefined),
  method: z.enum(["pickup", "delivery"]).optional().catch(undefined),
  status: z.enum(boardStatusValues).optional().catch(undefined),
});

/** Status an order shows on the board: unpaid orders read as "awaiting payment". */
export function boardStatusOf(row: {
  paymentStatus: "unpaid" | "review" | "paid";
  fulfillmentStatus: FulfillmentStatus;
}): BoardStatus {
  if (row.fulfillmentStatus === "cancelled") return "cancelled";
  if (row.paymentStatus !== "paid") return "awaiting_payment";
  return row.fulfillmentStatus;
}

/** Queue order on the board: actionable statuses first. */
const boardPriority: BoardStatus[] = [
  "ready_delivery",
  "ready_pickup",
  "preparing",
  "pending",
  "in_transit",
  "awaiting_payment",
  "picked_up",
  "delivered",
  "cancelled",
];

function scheduleStart(row: {
  pickupSlot: { startsAt: Date } | null;
  deliveryZone: { windowStartsAt: Date } | null;
}) {
  return (
    row.pickupSlot?.startsAt.getTime() ?? row.deliveryZone?.windowStartsAt.getTime() ?? Infinity
  );
}

function statusWhere(status: BoardStatus | undefined) {
  if (!status) return { fulfillmentStatus: { ne: "cancelled" as const } };
  if (status === "awaiting_payment") {
    return {
      fulfillmentStatus: { ne: "cancelled" as const },
      paymentStatus: { ne: "paid" as const },
    };
  }
  if (status === "cancelled") return { fulfillmentStatus: status };
  return { fulfillmentStatus: status, paymentStatus: "paid" as const };
}

/** Everything the "Pickup & pengantaran" page renders for one batch. */
export const getFulfillmentBoard = createServerFn({ method: "GET" })
  .middleware([requireAuthMiddleware])
  .validator(fulfillmentBoardSearchSchema)
  .handler(async ({ data }) => {
    const [current, batches] = await Promise.all([
      resolveBatch(data.batch),
      db.select({ id: batch.id, name: batch.name }).from(batch).orderBy(desc(batch.opensAt)),
    ]);
    if (!current) {
      return { batch: null, batches, metrics: null, orders: [], production: [], nextPickup: null };
    }

    const notCancelled = ne(order.fulfillmentStatus, "cancelled");
    const isPaid = eq(order.paymentStatus, "paid");
    const count = (condition: ReturnType<typeof sql>) =>
      sql<number>`count(*) filter (where ${condition})`.mapWith(Number);

    const [[metrics], [{ pendingProofs }], [nextPickup], orders, productionRows] =
      await Promise.all([
        db
          .select({
            active: count(sql`${order.fulfillmentStatus} <> 'cancelled'`),
            awaitingPayment: count(
              sql`${order.fulfillmentStatus} <> 'cancelled' and ${order.paymentStatus} <> 'paid'`,
            ),
            paid: count(
              sql`${order.fulfillmentStatus} <> 'cancelled' and ${order.paymentStatus} = 'paid'`,
            ),
            pickupScheduled: count(
              sql`${order.method} = 'pickup' and ${order.paymentStatus} = 'paid' and ${order.fulfillmentStatus} in ('pending', 'preparing', 'ready_pickup')`,
            ),
            toDeliver: count(
              sql`${order.method} = 'delivery' and ${order.paymentStatus} = 'paid' and ${order.fulfillmentStatus} in ('pending', 'preparing', 'ready_delivery')`,
            ),
            readyForCourier: count(
              sql`${order.method} = 'delivery' and ${order.paymentStatus} = 'paid' and ${order.fulfillmentStatus} = 'ready_delivery'`,
            ),
          })
          .from(order)
          .where(eq(order.batchId, current.id)),
        db
          .select({ pendingProofs: sql<number>`count(*)`.mapWith(Number) })
          .from(paymentAttempt)
          .innerJoin(order, eq(order.id, paymentAttempt.orderId))
          .where(and(eq(order.batchId, current.id), eq(paymentAttempt.status, "pending"))),
        db
          .select({ startsAt: pickupSlot.startsAt, endsAt: pickupSlot.endsAt })
          .from(pickupSlot)
          .where(
            and(
              eq(pickupSlot.batchId, current.id),
              eq(pickupSlot.active, true),
              gte(pickupSlot.endsAt, new Date()),
            ),
          )
          .orderBy(asc(pickupSlot.startsAt))
          .limit(1),
        db.query.order.findMany({
          where: {
            batchId: current.id,
            ...(data.method ? { method: data.method } : {}),
            ...statusWhere(data.status),
          },
          orderBy: { createdAt: "desc" },
          columns: {
            id: true,
            invoiceNumber: true,
            customerName: true,
            customerPhone: true,
            method: true,
            address: true,
            notes: true,
            paymentMethod: true,
            paymentStatus: true,
            fulfillmentStatus: true,
            subtotal: true,
            shippingFee: true,
            total: true,
            paidAt: true,
          },
          with: {
            pickupSlot: { columns: { startsAt: true, endsAt: true } },
            deliveryZone: {
              columns: { name: true, windowStartsAt: true, windowEndsAt: true },
            },
            items: { columns: { productName: true, quantity: true } },
            events: {
              where: { type: "handover" },
              orderBy: { createdAt: "desc" },
              limit: 1,
              columns: { handoverTo: true, note: true, createdAt: true },
            },
          },
        }),
        // Paid, non-cancelled quantities per product × method × schedule window.
        db
          .select({
            productName: orderItem.productName,
            method: order.method,
            slotStartsAt: pickupSlot.startsAt,
            slotEndsAt: pickupSlot.endsAt,
            zoneStartsAt: deliveryZone.windowStartsAt,
            zoneEndsAt: deliveryZone.windowEndsAt,
            quantity: sql<number>`sum(${orderItem.quantity})`.mapWith(Number),
          })
          .from(orderItem)
          .innerJoin(order, eq(order.id, orderItem.orderId))
          .leftJoin(pickupSlot, eq(pickupSlot.id, order.pickupSlotId))
          .leftJoin(deliveryZone, eq(deliveryZone.id, order.deliveryZoneId))
          .where(and(eq(order.batchId, current.id), isPaid, notCancelled))
          .groupBy(
            orderItem.productName,
            order.method,
            pickupSlot.startsAt,
            pickupSlot.endsAt,
            deliveryZone.windowStartsAt,
            deliveryZone.windowEndsAt,
          ),
      ]);

    // Pickup orders read the slot, delivery orders the zone window.
    const production = productionRows
      .map((row) => ({
        productName: row.productName,
        method: row.method,
        startsAt: row.method === "pickup" ? row.slotStartsAt : row.zoneStartsAt,
        endsAt: row.method === "pickup" ? row.slotEndsAt : row.zoneEndsAt,
        quantity: row.quantity,
      }))
      .sort(
        (a, b) =>
          (a.startsAt?.getTime() ?? Infinity) - (b.startsAt?.getTime() ?? Infinity) ||
          a.method.localeCompare(b.method) ||
          a.productName.localeCompare(b.productName),
      );

    return {
      batch: {
        id: current.id,
        name: current.name,
        status: current.status,
        closesAt: current.closesAt,
        pickupLocation: current.pickupLocation,
      },
      batches,
      metrics: { ...metrics, pendingProofs },
      nextPickup: nextPickup ?? null,
      orders: orders
        .map(({ events, ...row }) => ({
          ...row,
          boardStatus: boardStatusOf(row),
          handover: events[0] ?? null,
        }))
        // Work that needs action first, then by schedule.
        .sort(
          (a, b) =>
            boardPriority.indexOf(a.boardStatus) - boardPriority.indexOf(b.boardStatus) ||
            scheduleStart(a) - scheduleStart(b),
        ),
      production,
    };
  });

export type FulfillmentBoard = Awaited<ReturnType<typeof getFulfillmentBoard>>;
export type FulfillmentOrder = FulfillmentBoard["orders"][number];
export type ProductionRow = FulfillmentBoard["production"][number];

/**
 * Moves an order one fulfillment step. `from` is the status the admin saw; the
 * update only applies while the order is still in it. Steps that hand the order
 * over (picked_up, in_transit, delivered) are logged as "handover" events; handing
 * a delivery to the courier (→ in_transit) requires the courier's name.
 */
const handoverSteps: FulfillmentStatus[] = ["picked_up", "in_transit", "delivered"];

export const transitionFulfillment = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(
    z.object({
      orderId: z.string().min(1),
      from: z.enum(fulfillmentStatusValues),
      to: z.enum(fulfillmentStatusValues),
      handoverTo: z.string().trim().max(120).optional(),
      note: z.string().trim().max(500).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const actorId = context.session.user.id;
    const isHandover = handoverSteps.includes(data.to);
    const handoverTo = data.handoverTo || undefined;
    const note = data.note || undefined;
    if (data.to === "in_transit" && !handoverTo) {
      throw new Error("Isi nama kurir sebelum serah-terima.");
    }

    return db.transaction(async (tx) => {
      const [current] = await tx
        .select({ method: order.method, paymentStatus: order.paymentStatus })
        .from(order)
        .where(eq(order.id, data.orderId));
      if (!current) throw new Error("Pesanan tidak ditemukan.");
      if (!canTransition(current.method, current.paymentStatus, data.from, data.to)) {
        throw new Error(
          current.paymentStatus === "paid" || data.to === "cancelled"
            ? "Perubahan status ini tidak diizinkan."
            : "Pesanan belum lunas.",
        );
      }

      const updated = await tx
        .update(order)
        .set({ fulfillmentStatus: data.to })
        .where(
          and(
            eq(order.id, data.orderId),
            eq(order.fulfillmentStatus, data.from),
            // Payment must still be settled at write time (except for cancelling).
            data.to === "cancelled" ? undefined : eq(order.paymentStatus, "paid"),
          ),
        )
        .returning({ id: order.id });
      if (updated.length === 0) {
        throw new Error("Status pesanan sudah berubah. Muat ulang lalu coba lagi.");
      }

      await tx.insert(orderEvent).values({
        orderId: data.orderId,
        type: isHandover ? "handover" : "fulfillment_changed",
        fromStatus: data.from,
        toStatus: data.to,
        handoverTo,
        note,
        actorId,
      });

      return { id: data.orderId, status: data.to };
    });
  });
