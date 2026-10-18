import { createServerFn } from "@tanstack/react-start";
import {
  batch as batchTable,
  batchProduct,
  deliveryZone,
  order,
  pickupSlot,
  product,
} from "@web-kwu/db/schema/shop";
import { and, asc, count, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { resolveBatch } from "@/lib/batches.server";
import { inReviewSql } from "@/lib/draw.server";
import {
  formatDateTime,
  formatDayMonth,
  formatRupiah,
  formatTime,
  formatWeekday,
  toDateInputValue,
} from "@/lib/format";
import { requireAuthMiddleware } from "@/middleware/auth";
import { db } from "@/services";

/** Days shown in the order growth chart. */
const GROWTH_DAYS = 6;

/** `yyyy-mm-dd` (WIB) → noon WIB, safe to feed into the WIB formatters. */
const wibDay = (day: string) => new Date(`${day}T12:00:00+07:00`);

/** Inclusive list of `yyyy-mm-dd` days between two WIB dates. */
function dayRange(from: string, to: string) {
  const days: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

/** "16–21 Okt" or "28 Sep–3 Okt". */
function formatDayRange(first: string, last: string) {
  if (first === last) return formatDayMonth(wibDay(first));
  const [startDay, startMonth] = formatDayMonth(wibDay(first)).split(" ");
  const end = formatDayMonth(wibDay(last));
  return end.endsWith(` ${startMonth}`) ? `${startDay}–${end}` : `${startDay} ${startMonth}–${end}`;
}

const statusEyebrows = {
  draft: "● DRAF BATCH",
  open: "● PREORDER DIBUKA",
  closed: "● PREORDER DITUTUP",
  archived: "● DIARSIPKAN",
} as const;

/** Everything on the Ringkasan page for one batch (defaults to the current batch). */
export const getDashboardOverview = createServerFn({ method: "GET" })
  .middleware([requireAuthMiddleware])
  .validator(z.object({ batchId: z.string().min(1).optional() }))
  .handler(async ({ data }) => {
    const [b, batches] = await Promise.all([
      resolveBatch(data.batchId),
      db
        .select({ id: batchTable.id, name: batchTable.name })
        .from(batchTable)
        .orderBy(desc(batchTable.opensAt)),
    ]);
    if (!b) return { batch: null, batches } as const;

    const now = new Date();
    const activeOrders = and(eq(order.batchId, b.id), ne(order.fulfillmentStatus, "cancelled"));

    const orderDay = sql<string>`to_char(${order.createdAt} at time zone 'Asia/Jakarta', 'YYYY-MM-DD')`;

    const [[counts], perDay, products, [slots], [zones]] = await Promise.all([
      db
        .select({
          active: count(),
          paid: sql<number>`count(*) filter (where ${order.paymentStatus} = 'paid')`.mapWith(
            Number,
          ),
          // Orders with a proof under review count under inReview only, never twice.
          unpaid:
            sql<number>`count(*) filter (where ${order.paymentStatus} = 'unpaid' and not ${inReviewSql})`.mapWith(
              Number,
            ),
          inReview: sql<number>`count(*) filter (where ${inReviewSql})`.mapWith(Number),
          readyDelivery:
            sql<number>`count(*) filter (where ${order.fulfillmentStatus} = 'ready_delivery')`.mapWith(
              Number,
            ),
          pickupScheduled:
            sql<number>`count(*) filter (where ${order.paymentStatus} = 'paid' and ${order.method} = 'pickup' and ${order.fulfillmentStatus} in ('pending', 'preparing', 'ready_pickup'))`.mapWith(
              Number,
            ),
          toDeliver:
            sql<number>`count(*) filter (where ${order.paymentStatus} = 'paid' and ${order.method} = 'delivery' and ${order.fulfillmentStatus} in ('pending', 'preparing', 'ready_delivery'))`.mapWith(
              Number,
            ),
        })
        .from(order)
        .where(activeOrders),
      db
        .select({ day: orderDay, total: count() })
        .from(order)
        .where(activeOrders)
        .groupBy(orderDay),
      db
        .select({
          slug: product.slug,
          name: product.name,
          imageUrl: product.imageUrl,
          price: sql<number>`coalesce(${batchProduct.price}, ${product.price})`.mapWith(Number),
        })
        .from(product)
        .leftJoin(
          batchProduct,
          and(eq(batchProduct.productId, product.id), eq(batchProduct.batchId, b.id)),
        )
        .where(eq(product.published, true))
        .orderBy(asc(product.sortOrder), asc(product.name)),
      db
        .select({
          count: count(),
          startsAt: sql<Date | null>`min(${pickupSlot.startsAt})`.mapWith(pickupSlot.startsAt),
          endsAt: sql<Date | null>`max(${pickupSlot.endsAt})`.mapWith(pickupSlot.endsAt),
        })
        .from(pickupSlot)
        .where(and(eq(pickupSlot.batchId, b.id), eq(pickupSlot.active, true))),
      db
        .select({ count: count() })
        .from(deliveryZone)
        .where(and(eq(deliveryZone.batchId, b.id), eq(deliveryZone.active, true))),
    ]);

    // Chart from the batch opening to today (or the close), extended to the latest order day.
    const firstDay = toDateInputValue(b.opensAt);
    const lastDay = [
      toDateInputValue(now < b.closesAt ? now : b.closesAt),
      ...perDay.map(({ day }) => day),
    ]
      .sort()
      .at(-1)!;
    const days = dayRange(firstDay, lastDay < firstDay ? firstDay : lastDay).slice(-GROWTH_DAYS);
    const totals = new Map(perDay.map(({ day, total }) => [day, total]));
    let running = perDay
      .filter(({ day }) => day < days[0]!)
      .reduce((sum, { total }) => sum + total, 0);
    const orderGrowth = days.map((day) => {
      running += totals.get(day) ?? 0;
      return { day: formatDayMonth(wibDay(day)), total: running };
    });

    const hasPickup = (slots?.count ?? 0) > 0;
    const hasDelivery = (zones?.count ?? 0) > 0;
    const methodsText =
      hasPickup && hasDelivery
        ? "Pickup & delivery tersedia"
        : hasPickup
          ? "Pickup saja"
          : hasDelivery
            ? "Delivery saja"
            : "Pickup & delivery belum diatur";

    let pickupWindow = "Belum ada slot pickup";
    if (slots?.startsAt && slots.endsAt) {
      pickupWindow =
        toDateInputValue(slots.startsAt) === toDateInputValue(slots.endsAt)
          ? `${formatWeekday(slots.startsAt)} · ${formatTime(slots.startsAt)}–${formatTime(slots.endsAt)}`
          : `${formatDayMonth(slots.startsAt)} – ${formatDayMonth(slots.endsAt)}`;
    }

    const c = counts ?? {
      active: 0,
      paid: 0,
      unpaid: 0,
      inReview: 0,
      readyDelivery: 0,
      pickupScheduled: 0,
      toDeliver: 0,
    };

    return {
      batches,
      batch: {
        id: b.id,
        name: `Batch ${b.name}`,
        eyebrow: statusEyebrows[b.status],
        deadline: `${now < b.closesAt ? "Tutup" : "Ditutup"} preorder ${formatDateTime(b.closesAt)}  /  ${methodsText}`,
        activeOrders: c.active,
      },
      metrics: {
        paid: c.paid,
        unpaid: c.unpaid,
        inReview: c.inReview,
        readyDelivery: c.readyDelivery,
      },
      growth: {
        range: formatDayRange(days[0]!, days.at(-1)!),
        points: orderGrowth,
      },
      products: products.map(({ slug, name, imageUrl, price }) => ({
        slug,
        name,
        image: imageUrl,
        price: formatRupiah(price),
      })),
      fulfillment: {
        pickup: { count: c.pickupScheduled, detail: pickupWindow },
        delivery: {
          count: c.toDeliver,
          detail: `${c.readyDelivery} siap diserahkan kurir`,
        },
      },
    } as const;
  });
