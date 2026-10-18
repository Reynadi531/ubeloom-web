/**
 * Server-only logic behind the public checkout and private invoice server fns in
 * `./checkout`. Customers have no account: the order's `accessToken` is the only key
 * to its invoice, so every lookup here goes through it.
 */
import { order, orderEvent, orderItem, paymentAttempt } from "@web-kwu/db/schema/shop";
import { and, eq, ne, sql } from "drizzle-orm";
import { notFound } from "@tanstack/react-router";

import { getPublicBatch } from "@/lib/batches.server";
import { storeProof } from "@/lib/proof.server";
import { getShopSettings } from "@/lib/settings.server";
import {
  formatDayMonth,
  formatRupiah,
  formatTime,
  formatWeekday,
  formatWindow,
} from "@/lib/format";
import {
  generateInvoiceNumber,
  type FulfillmentMethod,
  type PaymentStatus,
  windowServesArea,
} from "@/lib/orders";
import { productCoverUrl, qrisImageUrl } from "@/lib/product-images";
import { db } from "@/services";

import {
  OrderError,
  isUniqueViolation,
  lockOpenBatch,
  mergeQuantities,
  orderedQuantities,
  priceOrder,
  slotBookings,
} from "./orders.server";
import type { PlaceOrderData, SubmitProofData } from "./checkout";

/** Customers pay within 24 hours of the invoice, never after the batch cutoff. */
const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Customer uploads per order; stops a leaked link from filling the bucket. */
const MAX_PROOF_ATTEMPTS = 5;

function paymentDeadline(createdAt: Date, cutoff: Date) {
  const due = new Date(createdAt.getTime() + PAYMENT_WINDOW_MS);
  return due < cutoff ? due : cutoff;
}

/** "23 Okt 2026 · 20.00 WIB" */
function formatFullDateTime(value: Date) {
  const year = new Intl.DateTimeFormat("id-ID", { year: "numeric", timeZone: "Asia/Jakarta" });
  return `${formatDayMonth(value)} ${year.format(value)} · ${formatTime(value)} WIB`;
}

/** "Sabtu, 24 Okt · 13.00–17.00 WIB" */
function formatSlot(start: Date, end: Date) {
  return `${formatWeekday(start)}, ${formatWindow(start, end)} WIB`;
}

/* -------------------------------------------------------------------------- */
/*                                  Checkout                                  */
/* -------------------------------------------------------------------------- */

export async function loadCheckout() {
  const current = await getPublicBatch();
  if (!current || current.status !== "open") return null;

  const [batchProducts, slots, zones, { deliveryRates, couriers }] = await Promise.all([
    db.query.batchProduct.findMany({
      where: { batchId: current.id, available: true, product: { published: true } },
      with: { product: true },
    }),
    // A disabled method offers no schedules, so checkout cannot select it.
    current.pickupEnabled
      ? db.query.pickupSlot.findMany({
          where: { batchId: current.id, active: true },
          orderBy: { startsAt: "asc" },
        })
      : [],
    current.deliveryEnabled
      ? db.query.deliveryZone.findMany({
          where: { batchId: current.id, active: true },
          orderBy: { windowStartsAt: "asc" },
        })
      : [],
    getShopSettings(),
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

  // Only offer areas that at least one delivery window of this batch serves.
  const deliveryAreas = deliveryRates
    .filter(({ area }) => zones.some((zone) => windowServesArea(zone.areas, area)))
    .map(({ area, fee }) => ({ name: area, fee }));

  const pickupLocation = current.pickupLocation || "Lokasi pickup menyusul";
  return {
    batch: {
      id: current.id,
      name: current.name,
      closesAt: `${formatDayMonth(current.closesAt)}, ${formatTime(current.closesAt)} WIB`,
      /** Deadline if the order were placed now. */
      paymentDeadline: formatFullDateTime(paymentDeadline(new Date(), current.paymentCutoffAt)),
      pickupLocation,
    },
    products: batchProducts
      .sort((a, b) => a.product.sortOrder - b.product.sortOrder)
      .map(({ product, price, capacity }) => ({
        id: product.id,
        slug: product.slug,
        name: product.name,
        variant: product.display?.variant || product.tagline,
        unit: product.unit,
        price: price ?? product.price,
        image: productCoverUrl(product.images),
        remaining:
          capacity === null ? null : Math.max(0, capacity - (ordered.get(product.id) ?? 0)),
      })),
    pickupSlots: slots.map(({ id, startsAt, endsAt, location, capacity }) => ({
      id,
      label: formatSlot(startsAt, endsAt),
      location: location || pickupLocation,
      remaining: Math.max(0, capacity - (booked.get(id) ?? 0)),
    })),
    deliveryAreas,
    deliveryWindows: deliveryAreas.length
      ? zones.map(({ id, windowStartsAt, windowEndsAt, areas }) => ({
          id,
          label: formatSlot(windowStartsAt, windowEndsAt),
          areas,
        }))
      : [],
    couriers,
  };
}

/** Creates a customer order from checkout; prices and fees are recomputed server-side. */
export async function insertCheckoutOrder(data: PlaceOrderData) {
  const quantities = mergeQuantities(data.items);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const lockedBatch = await lockOpenBatch(tx, data.batchId);
        const { lines, shippingFee, pickupSlotId, deliveryZoneId, deliveryArea, courier } =
          await priceOrder(tx, lockedBatch, quantities, data.method, data.scheduleId, {
            area: data.deliveryArea,
            courier: data.courier,
          });
        const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
        const isDelivery = data.method === "delivery";

        const [created] = await tx
          .insert(order)
          .values({
            invoiceNumber: generateInvoiceNumber(),
            batchId: lockedBatch.id,
            customerName: data.customerName,
            customerPhone: data.customerPhone,
            method: data.method,
            pickupSlotId,
            deliveryZoneId,
            deliveryArea,
            address: isDelivery ? data.address : null,
            recipientName: isDelivery ? data.recipientName : null,
            recipientPhone: isDelivery ? data.recipientPhone : null,
            courier,
            paymentMethod: "QRIS",
            subtotal,
            shippingFee,
            total: subtotal + shippingFee,
            notes: data.notes || null,
            drawOptIn: data.drawOptIn,
          })
          .returning({ id: order.id, accessToken: order.accessToken });

        await tx.insert(orderItem).values(lines.map((line) => ({ ...line, orderId: created.id })));
        await tx.insert(orderEvent).values({
          orderId: created.id,
          type: "created",
          toStatus: "pending",
          note: "Pesanan dari checkout storefront · QRIS",
        });
        return { token: created.accessToken };
      });
    } catch (error) {
      if (isUniqueViolation(error, "invoice_number")) continue;
      if (error instanceof OrderError) throw new Error(error.message);
      throw error;
    }
  }
  throw new Error("Gagal membuat nomor invoice unik. Silakan coba lagi.");
}

/* -------------------------------------------------------------------------- */
/*                                   Invoice                                  */
/* -------------------------------------------------------------------------- */

export async function loadInvoice(token: string) {
  const row = await db.query.order.findFirst({
    where: { accessToken: token },
    with: {
      batch: true,
      items: true,
      pickupSlot: true,
      deliveryZone: true,
      paymentAttempts: { orderBy: { attempt: "desc" }, limit: 1 },
    },
  });
  if (!row) throw notFound();

  const latest = row.paymentAttempts[0];
  const settings = await getShopSettings();
  const window =
    row.method === "pickup"
      ? row.pickupSlot && formatSlot(row.pickupSlot.startsAt, row.pickupSlot.endsAt)
      : row.deliveryZone &&
        formatSlot(row.deliveryZone.windowStartsAt, row.deliveryZone.windowEndsAt);
  const cancelled = row.fulfillmentStatus === "cancelled";

  return {
    invoiceNumber: row.invoiceNumber,
    merchantName: settings.qrisMerchantName,
    qrisImageUrl: settings.qrisImageKey ? qrisImageUrl(settings.qrisImageKey) : null,
    batchOpen: row.batch.status === "open",
    createdAt: formatFullDateTime(row.createdAt),
    customerName: row.customerName,
    method: row.method as FulfillmentMethod,
    destination:
      row.method === "delivery"
        ? [row.address, row.deliveryArea, row.courier].filter(Boolean).join(" · ")
        : row.pickupSlot?.location || row.batch.pickupLocation || "Lokasi pickup menyusul",
    recipient:
      row.method === "delivery" && row.recipientName
        ? `${row.recipientName} · ${row.recipientPhone ?? ""}`.trim()
        : null,
    window: window ?? "Jadwal menyusul",
    items: row.items.map(({ id, productName, quantity, unitPrice, lineTotal }) => ({
      id,
      productName,
      quantity,
      unitPrice,
      lineTotal,
    })),
    subtotal: row.subtotal,
    shippingFee: row.shippingFee,
    total: row.total,
    paymentStatus: row.paymentStatus as PaymentStatus,
    cancelled,
    paymentDeadline: formatFullDateTime(paymentDeadline(row.createdAt, row.batch.paymentCutoffAt)),
    latestProof: latest
      ? {
          status: latest.status,
          reviewNote: latest.reviewNote,
          submittedAt: `${formatDayMonth(latest.createdAt)} · ${formatTime(latest.createdAt)} WIB`,
        }
      : null,
    canUpload:
      !cancelled && row.paymentStatus === "unpaid" && (latest?.attempt ?? 0) < MAX_PROOF_ATTEMPTS,
  };
}

/** Stores the proof in the private bucket and queues it for review in "Verifikasi bayar". */
export async function insertProof(data: SubmitProofData) {
  const target = await db.query.order.findFirst({
    where: { accessToken: data.token },
    columns: { id: true, invoiceNumber: true, total: true },
  });
  if (!target) throw new Error("Invoice tidak ditemukan.");

  // Upload first so the transaction stays short; an orphaned object on failure is harmless.
  const key = await storeProof(target.id, data.file, ["image/jpeg", "image/png"]);

  return db.transaction(async (tx) => {
    // Lock the order so concurrent submissions get distinct attempt numbers.
    const [locked] = await tx
      .select({ paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus })
      .from(order)
      .where(eq(order.id, target.id))
      .for("update");
    if (!locked || locked.fulfillmentStatus === "cancelled") {
      throw new Error("Pesanan ini sudah dibatalkan.");
    }
    if (locked.paymentStatus === "paid") throw new Error("Invoice ini sudah lunas.");
    if (locked.paymentStatus === "review") {
      throw new Error("Bukti sebelumnya masih ditinjau. Tunggu hasil verifikasi.");
    }

    const [{ next }] = await tx
      .select({
        next: sql<number>`coalesce(max(${paymentAttempt.attempt}), 0) + 1`.mapWith(Number),
      })
      .from(paymentAttempt)
      .where(eq(paymentAttempt.orderId, target.id));
    if (next > MAX_PROOF_ATTEMPTS) {
      throw new Error("Batas unggah bukti tercapai. Hubungi bantuan.");
    }

    await tx.insert(paymentAttempt).values({
      orderId: target.id,
      attempt: next,
      claimedAmount: target.total,
      claimedPaidAt: data.paidAt,
      // Without a typed reference, fall back to one unique to this invoice so the
      // reuse check in approvePayment never matches another order.
      customerReference: data.reference || `${target.invoiceNumber}#${next}`,
      proofKey: key,
    });
    await tx
      .update(order)
      .set({ paymentStatus: "review" })
      .where(and(eq(order.id, target.id), ne(order.paymentStatus, "paid")));
    await tx.insert(orderEvent).values({
      orderId: target.id,
      type: "payment_submitted",
      fromStatus: locked.paymentStatus,
      toStatus: "review",
      note: `Bukti dari pelanggan · percobaan #${next} · ${formatRupiah(target.total)}`,
    });
    return { attempt: next };
  });
}
