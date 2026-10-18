/**
 * Server-only order logic behind the server fns in `./orders`. Kept separate so no
 * database code reaches the client bundle.
 */
import {
  batch,
  order,
  orderEvent,
  orderItem,
  paymentAttempt,
  pickupSlot,
} from "@web-kwu/db/schema/shop";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";

import { getCurrentBatch, resolveBatch } from "@/lib/batches.server";
import {
  formatDayMonth,
  formatRupiah,
  formatWeekday,
  formatWindow,
  maskPhone,
  toDateInputValue,
} from "@/lib/format";
import {
  CASH_PAYMENT_METHOD,
  type FulfillmentMethod,
  type FulfillmentStatus,
  type PaymentStatus,
  fulfillmentStatusLabels,
  generateInvoiceNumber,
  methodLabels,
  paymentStatusLabels,
} from "@/lib/orders";
import { storeProof } from "@/lib/proof.server";
import { getShopSettings } from "@/lib/settings.server";
import { db } from "@/services";

import type { CreateOrderData, OrderListFilters, OrderTabKey } from "./orders";

type BatchRow = typeof batch.$inferSelect;
type Executor = Pick<typeof db, "select">;

/* -------------------------------------------------------------------------- */
/*                                Orders list                                 */
/* -------------------------------------------------------------------------- */

export const ORDERS_PAGE_SIZE = 10;

const PICKUP_FALLBACK = "Lokasi pickup belum diatur";

async function loadBatchOrders(batchId: string) {
  return db.query.order.findMany({
    where: { batchId },
    with: { items: true, pickupSlot: true, deliveryZone: true },
    orderBy: { createdAt: "desc" },
  });
}

type LoadedOrder = Awaited<ReturnType<typeof loadBatchOrders>>[number];

function scheduleOf(row: LoadedOrder) {
  const window =
    row.method === "pickup"
      ? row.pickupSlot && { start: row.pickupSlot.startsAt, end: row.pickupSlot.endsAt }
      : row.deliveryZone && {
          start: row.deliveryZone.windowStartsAt,
          end: row.deliveryZone.windowEndsAt,
        };
  if (!window) return { label: "Belum dijadwalkan", date: null };
  return {
    label: `${formatWindow(window.start, window.end)} WIB`,
    date: toDateInputValue(window.start),
  };
}

function toOrderView(row: LoadedOrder, orderBatch: BatchRow) {
  const schedule = scheduleOf(row);
  const destination =
    row.method === "delivery"
      ? [row.address, row.deliveryZone?.name].filter(Boolean).join(" · ") || "—"
      : orderBatch.pickupLocation || PICKUP_FALLBACK;
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerEmail: row.customerEmail,
    method: row.method as FulfillmentMethod,
    paymentStatus: row.paymentStatus as PaymentStatus,
    fulfillmentStatus: row.fulfillmentStatus as FulfillmentStatus,
    paymentMethod: row.paymentMethod,
    destination,
    schedule: schedule.label,
    scheduleDate: schedule.date,
    items: row.items.map(({ productName, quantity, unitPrice, lineTotal }) => ({
      productName,
      quantity,
      unitPrice,
      lineTotal,
    })),
    itemsSummary: row.items
      .map(({ productName, quantity }) => `${productName} × ${quantity}`)
      .join(", "),
    subtotal: row.subtotal,
    shippingFee: row.shippingFee,
    total: row.total,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

type OrderView = ReturnType<typeof toOrderView>;

const tabMatchers: Record<OrderTabKey, (row: OrderView) => boolean> = {
  semua: () => true,
  "menunggu-bayar": (row) => row.paymentStatus !== "paid" && row.fulfillmentStatus !== "cancelled",
  disiapkan: (row) =>
    ["preparing", "ready_pickup", "ready_delivery"].includes(row.fulfillmentStatus),
  pickup: (row) => row.method === "pickup",
  delivery: (row) => row.method === "delivery",
};

const tabKeys = Object.keys(tabMatchers) as OrderTabKey[];

function applyFilters(rows: OrderView[], filters: OrderListFilters) {
  const query = filters.q?.trim().toLowerCase() ?? "";
  const digits = query.replace(/\D/g, "");
  const tab = tabMatchers[filters.tab ?? "semua"];
  return rows.filter(
    (row) =>
      tab(row) &&
      (!filters.payment || row.paymentStatus === filters.payment) &&
      (!filters.method || row.method === filters.method) &&
      (!filters.date || row.scheduleDate === filters.date) &&
      (!query ||
        row.invoiceNumber.toLowerCase().includes(query) ||
        row.customerName.toLowerCase().includes(query) ||
        (digits.length >= 3 && row.customerPhone.replace(/\D/g, "").includes(digits))),
  );
}

async function scheduleDatesOf(batchId: string, rows: OrderView[]) {
  const [slots, zones] = await Promise.all([
    db.query.pickupSlot.findMany({ where: { batchId }, columns: { startsAt: true } }),
    db.query.deliveryZone.findMany({ where: { batchId }, columns: { windowStartsAt: true } }),
  ]);
  const dates = new Set<string>([
    ...slots.map(({ startsAt }) => toDateInputValue(startsAt)),
    ...zones.map(({ windowStartsAt }) => toDateInputValue(windowStartsAt)),
    ...rows.flatMap(({ scheduleDate }) => (scheduleDate ? [scheduleDate] : [])),
  ]);
  return [...dates]
    .sort()
    .map((value) => ({ value, label: formatDayMonth(`${value}T12:00:00+07:00`) }));
}

/** Loads the batch's orders and applies the list filters (no pagination). */
async function filteredOrders(filters: OrderListFilters) {
  const orderBatch = await resolveBatch(filters.batch);
  if (!orderBatch) return null;
  const rows = (await loadBatchOrders(orderBatch.id)).map((row) => toOrderView(row, orderBatch));
  return { orderBatch, rows, filtered: applyFilters(rows, filters) };
}

export async function listOrdersPage(filters: OrderListFilters) {
  const batches = await db.query.batch.findMany({
    columns: { id: true, name: true, status: true },
    orderBy: { opensAt: "desc" },
  });
  const result = await filteredOrders(filters);
  const rows = result?.rows ?? [];
  const filtered = result?.filtered ?? [];
  const tabCounts = Object.fromEntries(
    tabKeys.map((key) => [key, rows.filter(tabMatchers[key]).length]),
  ) as Record<OrderTabKey, number>;
  const pageCount = Math.max(1, Math.ceil(filtered.length / ORDERS_PAGE_SIZE));
  const page = Math.min(filters.page ?? 1, pageCount);
  return {
    batches,
    batch: result
      ? {
          id: result.orderBatch.id,
          name: result.orderBatch.name,
          status: result.orderBatch.status,
        }
      : null,
    tabCounts,
    scheduleOptions: result ? await scheduleDatesOf(result.orderBatch.id, rows) : [],
    // Lists only ever show masked phone numbers; search ran on the full number above.
    orders: filtered
      .slice((page - 1) * ORDERS_PAGE_SIZE, page * ORDERS_PAGE_SIZE)
      .map((row) => ({ ...row, customerPhone: maskPhone(row.customerPhone) })),
    filteredTotal: filtered.length,
    page,
    pageCount,
  };
}

/* -------------------------------------------------------------------------- */
/*                                 CSV export                                 */
/* -------------------------------------------------------------------------- */

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  // Neutralise spreadsheet formulas, then quote whatever needs it.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r;]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function toCsv(rows: (string | number | null | undefined)[][]) {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function buildOrdersCsv(
  filters: OrderListFilters,
  kind: "orders" | "production",
  actorEmail: string,
) {
  const result = await filteredOrders(filters);
  if (!result) throw new Error("Belum ada batch untuk diekspor.");
  const { orderBatch, filtered } = result;
  const today = toDateInputValue(new Date());
  console.info(
    `[audit] ${actorEmail} exported ${kind} CSV (${filtered.length} orders, batch ${orderBatch.name})`,
  );

  if (kind === "orders") {
    const header = [
      "Invoice",
      "Tanggal pesan",
      "Nama",
      "WhatsApp",
      "Email",
      "Metode",
      "Jadwal",
      "Tujuan",
      "Item",
      "Subtotal",
      "Ongkir",
      "Total",
      "Pembayaran",
      "Metode bayar",
      "Status",
      "Catatan",
    ];
    const body = filtered.map((row) => [
      row.invoiceNumber,
      toDateInputValue(row.createdAt),
      row.customerName,
      row.customerPhone,
      row.customerEmail,
      methodLabels[row.method],
      row.schedule,
      row.destination,
      row.itemsSummary,
      row.subtotal,
      row.shippingFee,
      row.total,
      paymentStatusLabels[row.paymentStatus],
      row.paymentMethod,
      fulfillmentStatusLabels[row.fulfillmentStatus],
      row.notes,
    ]);
    return {
      filename: `pesanan-${slugify(orderBatch.name)}-${today}.csv`,
      csv: toCsv([header, ...body]),
    };
  }

  // Production sheet: units per schedule window and product, cancelled orders excluded.
  const totals = new Map<
    string,
    { schedule: string; method: string; product: string; quantity: number; orders: number }
  >();
  for (const row of filtered) {
    if (row.fulfillmentStatus === "cancelled") continue;
    for (const item of row.items) {
      const key = `${row.scheduleDate}|${row.schedule}|${row.method}|${item.productName}`;
      const entry = totals.get(key) ?? {
        schedule: row.schedule,
        method: methodLabels[row.method],
        product: item.productName,
        quantity: 0,
        orders: 0,
      };
      entry.quantity += item.quantity;
      entry.orders += 1;
      totals.set(key, entry);
    }
  }
  const body = [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, entry]) => [
      entry.schedule,
      entry.method,
      entry.product,
      entry.quantity,
      entry.orders,
    ]);
  return {
    filename: `produksi-${slugify(orderBatch.name)}-${today}.csv`,
    csv: toCsv([["Jadwal", "Metode", "Produk", "Jumlah unit", "Jumlah pesanan"], ...body]),
  };
}

/* -------------------------------------------------------------------------- */
/*                               Manual order                                 */
/* -------------------------------------------------------------------------- */

/** Units already committed per product in a batch (cancelled orders excluded). */
export async function orderedQuantities(executor: Executor, batchId: string, productIds: string[]) {
  if (productIds.length === 0) return new Map<string, number>();
  const rows = await executor
    .select({
      productId: orderItem.productId,
      quantity: sql<number>`coalesce(sum(${orderItem.quantity}), 0)::int`,
    })
    .from(orderItem)
    .innerJoin(order, eq(order.id, orderItem.orderId))
    .where(
      and(
        eq(order.batchId, batchId),
        ne(order.fulfillmentStatus, "cancelled"),
        inArray(orderItem.productId, productIds),
      ),
    )
    .groupBy(orderItem.productId);
  return new Map(rows.map(({ productId, quantity }) => [productId ?? "", Number(quantity)]));
}

/** Non-cancelled orders booked per pickup slot. */
export async function slotBookings(executor: Executor, slotIds: string[]) {
  if (slotIds.length === 0) return new Map<string, number>();
  const rows = await executor
    .select({ slotId: order.pickupSlotId, count: sql<number>`count(*)::int` })
    .from(order)
    .where(and(inArray(order.pickupSlotId, slotIds), ne(order.fulfillmentStatus, "cancelled")))
    .groupBy(order.pickupSlotId);
  return new Map(rows.map(({ slotId, count }) => [slotId ?? "", Number(count)]));
}

export async function loadManualOrderForm() {
  const [current, settings] = await Promise.all([getCurrentBatch(), getShopSettings()]);
  const paymentMethods = [...settings.paymentMethods, CASH_PAYMENT_METHOD];
  if (!current) {
    return { batch: null, products: [], pickupSlots: [], deliveryZones: [], paymentMethods };
  }

  const [batchProducts, slots, zones] = await Promise.all([
    db.query.batchProduct.findMany({
      where: { batchId: current.id, available: true },
      with: { product: true },
    }),
    db.query.pickupSlot.findMany({
      where: { batchId: current.id, active: true },
      orderBy: { startsAt: "asc" },
    }),
    db.query.deliveryZone.findMany({
      where: { batchId: current.id, active: true },
      orderBy: { windowStartsAt: "asc" },
    }),
  ]);
  const [ordered, booked] = await Promise.all([
    orderedQuantities(
      db,
      current.id,
      batchProducts.map(({ productId }) => productId),
    ),
    slotBookings(
      db,
      slots.map(({ id }) => id),
    ),
  ]);

  return {
    batch: {
      id: current.id,
      name: current.name,
      isOpen: current.status === "open",
      pickupLocation: current.pickupLocation,
    },
    paymentMethods,
    products: batchProducts
      .sort((a, b) => a.product.sortOrder - b.product.sortOrder)
      .map(({ product, price, capacity }) => ({
        id: product.id,
        name: product.name,
        price: price ?? product.price,
        remaining:
          capacity === null ? null : Math.max(0, capacity - (ordered.get(product.id) ?? 0)),
      })),
    pickupSlots: slots.map(({ id, startsAt, endsAt, capacity }) => ({
      id,
      label: `${formatWeekday(startsAt)} ${formatWindow(startsAt, endsAt)}`,
      remaining: Math.max(0, capacity - (booked.get(id) ?? 0)),
    })),
    deliveryZones: zones.map(({ id, name, windowStartsAt, windowEndsAt, fee }) => ({
      id,
      label: `${name} · ${formatWeekday(windowStartsAt)} ${formatWindow(windowStartsAt, windowEndsAt)} · ongkir ${formatRupiah(fee)}`,
      fee,
    })),
  };
}

/** Error whose message is safe and useful to show on the form. */
export class OrderError extends Error {}

export function isUniqueViolation(error: unknown, constraintHint = ""): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const candidate = current as { code?: string; constraint?: string; cause?: unknown };
    if (candidate.code === "23505") return (candidate.constraint ?? "").includes(constraintHint);
    current = candidate.cause;
  }
  return false;
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Merges duplicate lines so capacity checks see the real quantity per product. */
export function mergeQuantities(items: { productId: string; quantity: number }[]) {
  const quantities = new Map<string, number>();
  for (const { productId, quantity } of items) {
    quantities.set(productId, (quantities.get(productId) ?? 0) + quantity);
  }
  return quantities;
}

/** Locks the batch row so concurrent orders cannot oversell capacity; it must be open. */
export async function lockOpenBatch(tx: Transaction, batchId: string) {
  const [lockedBatch] = await tx.select().from(batch).where(eq(batch.id, batchId)).for("update");
  if (!lockedBatch) throw new OrderError("Batch tidak ditemukan.");
  if (lockedBatch.status !== "open") {
    throw new OrderError(`Batch ${lockedBatch.name} sedang tidak dibuka untuk pesanan.`);
  }
  return lockedBatch;
}

/**
 * Prices an order inside a transaction holding the batch lock: checks availability and
 * capacity, snapshots unit prices, and resolves the pickup slot or delivery zone fee.
 */
export async function priceOrder(
  tx: Transaction,
  lockedBatch: BatchRow,
  quantities: Map<string, number>,
  method: FulfillmentMethod,
  scheduleId: string,
) {
  const productIds = [...quantities.keys()];
  const batchProducts = await tx.query.batchProduct.findMany({
    where: { batchId: lockedBatch.id, productId: { in: productIds } },
    with: { product: true },
  });
  const ordered = await orderedQuantities(tx, lockedBatch.id, productIds);

  const lines = productIds.map((productId) => {
    const entry = batchProducts.find((candidate) => candidate.productId === productId);
    if (!entry || !entry.available) {
      throw new OrderError("Ada produk yang tidak tersedia di batch ini.");
    }
    const quantity = quantities.get(productId) ?? 0;
    if (entry.capacity !== null) {
      const remaining = entry.capacity - (ordered.get(productId) ?? 0);
      if (quantity > remaining) {
        throw new OrderError(
          remaining > 0
            ? `Stok ${entry.product.name} tinggal ${remaining}.`
            : `${entry.product.name} sudah habis untuk batch ini.`,
        );
      }
    }
    const unitPrice = entry.price ?? entry.product.price;
    return {
      productId,
      productName: entry.product.name,
      unitPrice,
      quantity,
      lineTotal: unitPrice * quantity,
    };
  });

  if (method === "pickup") {
    const [slot] = await tx
      .select()
      .from(pickupSlot)
      .where(and(eq(pickupSlot.id, scheduleId), eq(pickupSlot.batchId, lockedBatch.id)));
    if (!slot || !slot.active) throw new OrderError("Jadwal pickup tidak tersedia.");
    const booked = (await slotBookings(tx, [slot.id])).get(slot.id) ?? 0;
    if (booked >= slot.capacity) throw new OrderError("Slot pickup ini sudah penuh.");
    return { lines, shippingFee: 0, pickupSlotId: slot.id, deliveryZoneId: null };
  }

  const zone = await tx.query.deliveryZone.findFirst({
    where: { id: scheduleId, batchId: lockedBatch.id },
  });
  if (!zone || !zone.active) throw new OrderError("Jadwal delivery tidak tersedia.");
  return { lines, shippingFee: zone.fee, pickupSlotId: null, deliveryZoneId: zone.id };
}

/**
 * Records an order taken outside checkout. Prices, fees and totals are recomputed here.
 *
 * Payment handling:
 * - No amount entered → `unpaid`, no payment attempt.
 * - "Tunai" with an amount ≥ total → `paid` immediately (paidAt now) with an approved
 *   payment attempt reviewed by the admin; cash is counted in person, so no review queue.
 * - Any other method with an amount → `review` with a pending payment attempt, so it shows
 *   up in "Verifikasi bayar" like a customer-submitted proof.
 */
export async function insertManualOrder(data: CreateOrderData, actorId: string) {
  const { paymentMethods } = await getShopSettings();
  if (![...paymentMethods, CASH_PAYMENT_METHOD].includes(data.paymentMethod)) {
    throw new Error("Metode pembayaran tidak tersedia. Periksa Pengaturan.");
  }
  const quantities = mergeQuantities(data.items);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const lockedBatch = await lockOpenBatch(tx, data.batchId);

        const { lines, shippingFee, pickupSlotId, deliveryZoneId } = await priceOrder(
          tx,
          lockedBatch,
          quantities,
          data.method,
          data.scheduleId,
        );

        const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
        const total = subtotal + shippingFee;
        const now = new Date();
        const amount = data.amountReceived && data.amountReceived > 0 ? data.amountReceived : null;
        const isCash = data.paymentMethod === CASH_PAYMENT_METHOD;
        if (isCash && amount !== null && amount < total) {
          throw new OrderError(
            `Nominal tunai ${formatRupiah(amount)} kurang dari total ${formatRupiah(total)}.`,
          );
        }
        const paymentStatus: PaymentStatus =
          amount === null ? "unpaid" : isCash ? "paid" : "review";

        const [created] = await tx
          .insert(order)
          .values({
            invoiceNumber: generateInvoiceNumber(now),
            batchId: lockedBatch.id,
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            method: data.method,
            pickupSlotId,
            deliveryZoneId,
            address: data.method === "delivery" ? data.address : null,
            paymentMethod: data.paymentMethod,
            paymentStatus,
            subtotal,
            shippingFee,
            total,
            paidAt: paymentStatus === "paid" ? now : null,
            createdById: actorId,
          })
          .returning({ id: order.id, invoiceNumber: order.invoiceNumber });

        await tx.insert(orderItem).values(lines.map((line) => ({ ...line, orderId: created.id })));

        const events: (typeof orderEvent.$inferInsert)[] = [
          {
            orderId: created.id,
            type: "created",
            toStatus: "pending",
            note: `Pesanan manual oleh admin · ${data.paymentMethod}`,
            actorId,
          },
        ];

        if (amount !== null) {
          await tx.insert(paymentAttempt).values({
            orderId: created.id,
            attempt: 1,
            // Cash keeps only the total; any excess was handed back as change.
            claimedAmount: isCash ? total : amount,
            claimedPaidAt: now,
            // Unique per order so the reuse check in approvePayment never matches another manual entry.
            customerReference: `MANUAL-${created.invoiceNumber}`,
            status: isCash ? "approved" : "pending",
            merchantReference: isCash ? `TUNAI-${created.invoiceNumber}` : null,
            reviewNote: isCash ? "Pembayaran tunai diterima saat input manual." : null,
            reviewedById: isCash ? actorId : null,
            reviewedAt: isCash ? now : null,
          });
          events.push({
            orderId: created.id,
            type: isCash ? "payment_approved" : "payment_submitted",
            fromStatus: "unpaid",
            toStatus: paymentStatus,
            note:
              isCash && amount > total
                ? `Tunai diterima ${formatRupiah(amount)} · kembalian ${formatRupiah(amount - total)}`
                : `${data.paymentMethod} · ${formatRupiah(amount)}`,
            actorId,
          });
        }

        await tx.insert(orderEvent).values(events);
        return { ...created, total, paymentStatus };
      });
    } catch (error) {
      if (isUniqueViolation(error, "invoice_number")) continue;
      if (error instanceof OrderError) throw new Error(error.message);
      throw error;
    }
  }
  throw new Error("Gagal membuat nomor invoice unik. Silakan coba lagi.");
}

/** Attaches a stored proof to the manual order's latest payment attempt. */
export async function attachProofToManualOrder(orderId: string, file: File) {
  const [latest] = await db
    .select({ id: paymentAttempt.id })
    .from(paymentAttempt)
    .where(eq(paymentAttempt.orderId, orderId))
    .orderBy(desc(paymentAttempt.attempt))
    .limit(1);
  if (!latest) throw new Error("Isi nominal diterima untuk melampirkan bukti.");
  const key = await storeProof(orderId, file, ["image/jpeg", "image/png", "application/pdf"]);
  await db.update(paymentAttempt).set({ proofKey: key }).where(eq(paymentAttempt.id, latest.id));
  return { ok: true };
}
