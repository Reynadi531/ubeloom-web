import { createServerFn } from "@tanstack/react-start";
import {
  batch,
  batchProduct,
  deliveryZone,
  order,
  pickupSlot,
  product,
} from "@web-kwu/db/schema/shop";
import { and, count, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { getCurrentBatch } from "@/lib/batches.server";
import { productCoverUrl } from "@/lib/product-images";
import { getShopSettings } from "@/lib/settings.server";
import { requireAuthMiddleware } from "@/middleware/auth";
import { db } from "@/services";

import { createDraftProduct, getSoldQuantities } from "./catalog.server";
import { productCategories, productImagesSchema, productUnits } from "./products";

export const batchStatuses = ["draft", "open", "closed", "archived"] as const;
export type BatchStatus = (typeof batchStatuses)[number];

const notCancelled = ne(order.fulfillmentStatus, "cancelled");

/**
 * Everything the "Batch & produk" page shows: the current batch plus the whole
 * catalog in storefront order, each product annotated with its batch listing.
 */
export const getBatchOverview = createServerFn({ method: "GET" })
  .middleware([requireAuthMiddleware])
  .handler(async () => {
    const [current, { deliveryRates }] = await Promise.all([getCurrentBatch(), getShopSettings()]);
    const deliveryAreas = deliveryRates.map(({ area }) => area);
    const catalog = await db.query.product.findMany({
      orderBy: { sortOrder: "asc", name: "asc" },
      with: { batchProducts: { where: { batchId: current?.id ?? "" } } },
    });
    const sold = current ? await getSoldQuantities(current.id) : new Map<string, number>();
    const products = catalog.map((row) => {
      const entry = row.batchProducts[0];
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        summary: row.display?.variant || row.tagline,
        unit: row.unit,
        image: productCoverUrl(row.images),
        published: row.published,
        inBatch: !!entry,
        available: entry?.available ?? false,
        price: entry?.price ?? row.price,
        capacity: entry?.capacity ?? null,
        sold: sold.get(row.id) ?? 0,
      };
    });
    if (!current) return { products, deliveryAreas, current: null };

    const [slots, zones, orderTotals, slotFill] = await Promise.all([
      db.query.pickupSlot.findMany({
        where: { batchId: current.id },
        orderBy: { startsAt: "asc" },
      }),
      db.query.deliveryZone.findMany({
        where: { batchId: current.id },
        orderBy: { windowStartsAt: "asc" },
      }),
      db
        .select({
          total: count(),
          paid: sql<number>`count(*) filter (where ${order.paymentStatus} = 'paid')::int`,
          pickup: sql<number>`count(*) filter (where ${order.method} = 'pickup')::int`,
          delivery: sql<number>`count(*) filter (where ${order.method} = 'delivery')::int`,
        })
        .from(order)
        .where(and(eq(order.batchId, current.id), notCancelled)),
      db
        .select({ slotId: order.pickupSlotId, filled: count() })
        .from(order)
        .where(and(eq(order.batchId, current.id), eq(order.method, "pickup"), notCancelled))
        .groupBy(order.pickupSlotId),
    ]);

    const filledBySlot = new Map(slotFill.map(({ slotId, filled }) => [slotId, filled]));
    const [totals] = orderTotals;

    return {
      products,
      deliveryAreas,
      current: {
        batch: current,
        orders: {
          total: totals?.total ?? 0,
          paid: totals?.paid ?? 0,
          pickup: totals?.pickup ?? 0,
          delivery: totals?.delivery ?? 0,
        },
        slots: slots.map((slot) => ({ ...slot, filled: filledBySlot.get(slot.id) ?? 0 })),
        zones,
      },
    };
  });

export type BatchOverview = Awaited<ReturnType<typeof getBatchOverview>>;

const dateSchema = z.coerce.date();

export const saveBatchSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().trim().min(1, "Nama batch wajib diisi").max(80),
    status: z.enum(batchStatuses),
    opensAt: dateSchema,
    closesAt: dateSchema,
    paymentCutoffAt: dateSchema,
    pickupLocation: z.string().trim().max(160),
    pickupEnabled: z.boolean(),
    deliveryEnabled: z.boolean(),
  })
  .refine(({ pickupEnabled, deliveryEnabled }) => pickupEnabled || deliveryEnabled, {
    message: "Aktifkan minimal satu cara pengiriman",
    path: ["pickupEnabled"],
  })
  .refine(({ opensAt, closesAt }) => closesAt > opensAt, {
    message: "Waktu tutup harus setelah waktu buka",
    path: ["closesAt"],
  })
  .refine(({ closesAt, paymentCutoffAt }) => paymentCutoffAt >= closesAt, {
    message: "Cutoff pembayaran tidak boleh sebelum batch ditutup",
    path: ["paymentCutoffAt"],
  });

/** Creates or updates a batch. Opening a batch closes any other open batch. */
export const saveBatch = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(saveBatchSchema)
  .handler(async ({ data: { id, ...values } }) => {
    return db.transaction(async (tx) => {
      const [saved] = id
        ? await tx.update(batch).set(values).where(eq(batch.id, id)).returning()
        : await tx.insert(batch).values(values).returning();
      if (!saved) throw new Error("Batch tidak ditemukan");
      if (saved.status === "open") {
        await tx
          .update(batch)
          .set({ status: "closed" })
          .where(and(eq(batch.status, "open"), ne(batch.id, saved.id)));
      }
      return { id: saved.id };
    });
  });

export const savePickupSlotSchema = z
  .object({
    id: z.string().min(1).optional(),
    batchId: z.string().min(1),
    startsAt: dateSchema,
    endsAt: dateSchema,
    location: z.string().trim().max(160, "Lokasi maksimal 160 karakter"),
    capacity: z.number().int().min(1, "Kapasitas minimal 1").max(10_000),
    active: z.boolean(),
  })
  .refine(({ startsAt, endsAt }) => endsAt > startsAt, {
    message: "Jam selesai harus setelah jam mulai",
    path: ["endsAt"],
  });

export const savePickupSlot = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(savePickupSlotSchema)
  .handler(async ({ data: { id, ...values } }) => {
    if (id) {
      await db.update(pickupSlot).set(values).where(eq(pickupSlot.id, id));
    } else {
      await db.insert(pickupSlot).values(values);
    }
    return { ok: true as const };
  });

/** Deletes a slot only while no order uses it; otherwise deactivate it instead. */
export const deletePickupSlot = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const [{ value }] = await db
      .select({ value: count() })
      .from(order)
      .where(eq(order.pickupSlotId, data.id));
    if (value > 0) {
      throw new Error("Slot sudah dipakai pesanan. Nonaktifkan saja agar tidak bisa dipilih.");
    }
    await db.delete(pickupSlot).where(eq(pickupSlot.id, data.id));
    return { ok: true as const };
  });

export const saveDeliveryZoneSchema = z
  .object({
    id: z.string().min(1).optional(),
    batchId: z.string().min(1),
    windowStartsAt: dateSchema,
    windowEndsAt: dateSchema,
    /** Areas served; empty serves every area. */
    areas: z.array(z.string().trim().min(1).max(80)).max(30),
    active: z.boolean(),
  })
  .refine(({ windowStartsAt, windowEndsAt }) => windowEndsAt > windowStartsAt, {
    message: "Jam selesai harus setelah jam mulai",
    path: ["windowEndsAt"],
  });

export const saveDeliveryZone = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(saveDeliveryZoneSchema)
  .handler(async ({ data: { id, ...values } }) => {
    if (id) {
      await db.update(deliveryZone).set(values).where(eq(deliveryZone.id, id));
    } else {
      await db.insert(deliveryZone).values(values);
    }
    return { ok: true as const };
  });

/** Deletes a delivery window only while no order uses it; otherwise deactivate it instead. */
export const deleteDeliveryZone = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const [{ value }] = await db
      .select({ value: count() })
      .from(order)
      .where(eq(order.deliveryZoneId, data.id));
    if (value > 0) {
      throw new Error("Jadwal sudah dipakai pesanan. Nonaktifkan saja agar tidak bisa dipilih.");
    }
    await db.delete(deliveryZone).where(eq(deliveryZone.id, data.id));
    return { ok: true as const };
  });

export const addBatchProductSchema = z.object({
  batchId: z.string().min(1),
  /** Existing product to sell; omit to create a new draft product. */
  productId: z.string().min(1).optional(),
  newProduct: z
    .object({
      name: z.string().trim().min(1, "Nama produk wajib diisi").max(80),
      category: z.enum(productCategories),
      unit: z.enum(productUnits),
      price: z.number().int().min(0).max(10_000_000),
      images: productImagesSchema,
    })
    .optional(),
  /** Null means unlimited. */
  capacity: z.number().int().min(0).max(100_000).nullable(),
});

/** Adds a product to a batch, creating it first as an unpublished draft when new. */
export const addBatchProduct = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(addBatchProductSchema)
  .handler(async ({ data }) => {
    let target: { id: string; slug: string } | undefined;
    if (data.productId) {
      [target] = await db
        .select({ id: product.id, slug: product.slug })
        .from(product)
        .where(eq(product.id, data.productId));
    } else if (data.newProduct) {
      target = await createDraftProduct(data.newProduct);
    }
    if (!target) throw new Error("Pilih produk atau isi data produk baru");

    await db
      .insert(batchProduct)
      .values({ batchId: data.batchId, productId: target.id, capacity: data.capacity })
      .onConflictDoUpdate({
        target: [batchProduct.batchId, batchProduct.productId],
        set: { capacity: data.capacity, available: true },
      });
    return { slug: target.slug };
  });
