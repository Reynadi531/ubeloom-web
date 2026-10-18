import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  batch,
  batchProduct,
  pickupSlot,
  product,
  type ProductDisplay,
  type ProductIcon,
} from "@web-kwu/db/schema/shop";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Product } from "@/components/storefront/product-card";
import { getCurrentBatch, getPublicBatch } from "@/lib/batches.server";
import { formatDateTime, formatDayMonth, formatRupiah } from "@/lib/format";
import { requireAuthMiddleware } from "@/middleware/auth";
import { db } from "@/services";

import {
  formatShortDate,
  formatShortDateTime,
  getBatchNumber,
  getSoldQuantities,
} from "./catalog.server";

export type { ProductDisplay, ProductIcon };

export const productIcons = [
  "sparkles",
  "package",
  "chef-hat",
  "heart",
  "map-pin",
  "snowflake",
  "cup-soda",
] as const satisfies readonly ProductIcon[];

export const productCategories = ["camilan", "minuman"] as const;
export const productUnits = ["porsi", "kotak", "cup"] as const;

/** Shown when a product has no photo yet. */
export const PLACEHOLDER_IMAGE = "/images/ubeloom-logo.webp";

type ProductRow = typeof product.$inferSelect;
type BatchRow = typeof batch.$inferSelect;
type BatchProductRow = typeof batchProduct.$inferSelect;

/** Batch facts the storefront copy needs; dates are preformatted in WIB. */
export interface StorefrontBatch {
  /** "01" — position of the batch by opening date. */
  number: string;
  open: boolean;
  /** "24 Okt 2026 · 20.00 WIB" */
  closesAt: string;
  /** "24 Okt · 20.00 WIB" */
  closesAtShort: string;
  /** Day of the first active pickup slot: "26 Okt", or null without slots. */
  pickupDate: string | null;
  /** "26 Okt 2026", or null without slots. */
  pickupDateLong: string | null;
  pickupLocation: string;
}

export interface ProductDetail {
  slug: string;
  name: string;
  collection: string;
  subtitle: string;
  /** Price in rupiah for the current batch. */
  price: number;
  portionLabel: string;
  story: string;
  image: { src: string; alt: string };
  highlights: ProductDisplay["highlights"];
  details: { title: string; facts: ProductDisplay["facts"] };
  available: boolean;
  /** "TERSEDIA", "HABIS" or "PREORDER DITUTUP". */
  availability: string;
  /** Units left in the current batch; null when unlimited. */
  remaining: number | null;
}

const emptyDisplay: ProductDisplay = {
  collection: "",
  story: "",
  variant: "",
  highlights: [],
  detailsTitle: "",
  facts: [],
};

async function toStorefrontBatch(current: BatchRow): Promise<StorefrontBatch> {
  const [firstSlot] = await db
    .select({ startsAt: pickupSlot.startsAt })
    .from(pickupSlot)
    .where(and(eq(pickupSlot.batchId, current.id), eq(pickupSlot.active, true)))
    .orderBy(asc(pickupSlot.startsAt))
    .limit(1);

  return {
    number: await getBatchNumber(current),
    open: current.status === "open",
    closesAt: formatShortDateTime(current.closesAt),
    closesAtShort: formatDateTime(current.closesAt),
    pickupDate: firstSlot ? formatDayMonth(firstSlot.startsAt) : null,
    pickupDateLong: firstSlot ? formatShortDate(firstSlot.startsAt) : null,
    pickupLocation: current.pickupLocation || "Kampus ubeloom",
  };
}

/** Price, stock and sellability of a product in the current batch. */
function resolveAvailability(
  current: BatchRow | undefined,
  row: ProductRow,
  entry: BatchProductRow | undefined,
  sold: Map<string, number>,
) {
  const price = entry?.price ?? row.price;
  const remaining =
    entry?.capacity == null ? null : Math.max(0, entry.capacity - (sold.get(row.id) ?? 0));
  if (current?.status !== "open") {
    return { price, remaining, available: false, availability: "PREORDER DITUTUP" };
  }
  const available = !!entry && entry.available && remaining !== 0;
  return { price, remaining, available, availability: available ? "TERSEDIA" : "HABIS" };
}

async function loadPublishedProducts(current: BatchRow | undefined) {
  const rows = await db.query.product.findMany({
    where: { published: true },
    orderBy: { sortOrder: "asc", name: "asc" },
    with: { batchProducts: { where: { batchId: current?.id ?? "" } } },
  });
  const sold = current ? await getSoldQuantities(current.id) : new Map<string, number>();
  return rows.map((row) => ({
    row,
    ...resolveAvailability(current, row, row.batchProducts[0], sold),
  }));
}

/** Landing + menu page data: current batch and published products as catalog cards. */
export const getStorefront = createServerFn({ method: "GET" }).handler(async () => {
  const current = await getPublicBatch();
  const products = await loadPublishedProducts(current);

  return {
    batch: current ? await toStorefrontBatch(current) : null,
    products: products.map(({ row, price, available, availability }): Product => {
      const display = row.display ?? emptyDisplay;
      const image = row.imageUrl ?? PLACEHOLDER_IMAGE;
      const care = [row.allergen && `Alergen: ${row.allergen.toLowerCase()}`, row.serving]
        .filter(Boolean)
        .join(" · ");
      const description = row.tagline;
      return {
        slug: row.slug,
        name: row.name,
        price: formatRupiah(price),
        image: { mobile: image, desktop: row.imageWideUrl ?? image },
        variant: { mobile: display.variant, desktop: display.variant },
        description: { mobile: description, desktop: description },
        care: { mobile: care, desktop: care },
        available,
        availability,
      };
    }),
  };
});

/** Batch dates for the static info pages (pickup & delivery, cara pesan). */
export const getStorefrontBatch = createServerFn({ method: "GET" }).handler(async () => {
  const current = await getPublicBatch();
  return current ? toStorefrontBatch(current) : null;
});

export const getProduct = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().min(1) }))
  .handler(async ({ data }): Promise<ProductDetail> => {
    const current = await getPublicBatch();
    const row = await db.query.product.findFirst({
      where: { slug: data.slug, published: true },
      with: { batchProducts: { where: { batchId: current?.id ?? "" } } },
    });
    if (!row) throw notFound();

    const sold = current ? await getSoldQuantities(current.id) : new Map<string, number>();
    const entry = row.batchProducts[0];
    const { price, remaining, available, availability } = resolveAvailability(
      current,
      row,
      entry,
      sold,
    );
    const display = row.display ?? emptyDisplay;

    return {
      slug: row.slug,
      name: row.name,
      collection: display.collection || `MENU  /  ${availability}`,
      subtitle: row.tagline,
      price,
      portionLabel: `/ ${row.unit}`,
      story: row.description || display.story,
      image: { src: row.imageUrl ?? PLACEHOLDER_IMAGE, alt: row.name },
      highlights: display.highlights,
      details: { title: display.detailsTitle, facts: display.facts },
      available,
      availability,
      remaining,
    };
  });

// ---------------------------------------------------------------------------
// Admin product editor
// ---------------------------------------------------------------------------

export const getProductEditor = createServerFn({ method: "GET" })
  .middleware([requireAuthMiddleware])
  .validator(z.object({ slug: z.string().min(1) }))
  .handler(async ({ data }) => {
    const current = await getCurrentBatch();
    const row = await db.query.product.findFirst({
      where: { slug: data.slug },
      with: { batchProducts: { where: { batchId: current?.id ?? "" } } },
    });
    if (!row) throw notFound();

    const entry = row.batchProducts[0];
    const sold = current ? ((await getSoldQuantities(current.id)).get(row.id) ?? 0) : 0;
    const allProducts = await db
      .select({ slug: product.slug, name: product.name })
      .from(product)
      .orderBy(asc(product.sortOrder), asc(product.name));

    return {
      product: {
        id: row.id,
        slug: row.slug,
        code: row.code,
        name: row.name,
        category: row.category,
        unit: row.unit,
        price: row.price,
        tagline: row.tagline,
        description: row.description,
        serving: row.serving,
        allergen: row.allergen,
        imageUrl: row.imageUrl ?? "",
        imageWideUrl: row.imageWideUrl ?? "",
        published: row.published,
        display: row.display ?? emptyDisplay,
      },
      batch: current
        ? {
            id: current.id,
            name: current.name,
            status: current.status,
            sold,
            entry: entry
              ? { price: entry.price, capacity: entry.capacity, available: entry.available }
              : null,
          }
        : null,
      products: allProducts,
    };
  });

export type ProductEditorData = Awaited<ReturnType<typeof getProductEditor>>;

const iconSchema = z.enum(productIcons);
const trimmed = z.string().trim();
const optionalUrl = trimmed.max(2048).refine((value) => !value || /^(https?:\/\/|\/)/.test(value), {
  message: "Gunakan URL http(s) atau path yang diawali /",
});

const displaySchema = z.object({
  collection: trimmed.max(80),
  story: trimmed.max(500),
  variant: trimmed.max(120),
  highlights: z
    .array(z.object({ icon: iconSchema, title: trimmed.min(1).max(60), note: trimmed.max(80) }))
    .max(4),
  detailsTitle: trimmed.max(120),
  facts: z
    .array(
      z.object({ icon: iconSchema, title: trimmed.min(1).max(80), description: trimmed.max(400) }),
    )
    .max(6),
});

export const saveProductSchema = z.object({
  id: z.string().min(1),
  name: trimmed.min(1, "Nama produk wajib diisi").max(80),
  category: z.enum(productCategories),
  unit: z.enum(productUnits),
  price: z.number().int().min(0).max(10_000_000),
  tagline: trimmed.max(160),
  description: trimmed.max(1000),
  serving: trimmed.max(120),
  allergen: trimmed.max(120),
  imageUrl: optionalUrl,
  imageWideUrl: optionalUrl,
  published: z.boolean(),
  display: displaySchema,
  /** Omitted when there is no batch to sell in. */
  availability: z
    .object({
      batchId: z.string().min(1),
      inBatch: z.boolean(),
      available: z.boolean(),
      /** Null keeps the product's default price. */
      price: z.number().int().min(0).max(10_000_000).nullable(),
      /** Null means unlimited. */
      capacity: z.number().int().min(0).max(100_000).nullable(),
    })
    .optional(),
});

export type SaveProductInput = z.infer<typeof saveProductSchema>;

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(saveProductSchema)
  .handler(async ({ data }) => {
    const { id, availability, imageUrl, imageWideUrl, ...fields } = data;

    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(product)
        .set({ ...fields, imageUrl: imageUrl || null, imageWideUrl: imageWideUrl || null })
        .where(eq(product.id, id))
        .returning({ id: product.id });
      if (!updated) throw notFound();

      if (!availability) return;
      const key = and(
        eq(batchProduct.batchId, availability.batchId),
        eq(batchProduct.productId, id),
      );
      if (!availability.inBatch) {
        await tx.delete(batchProduct).where(key);
        return;
      }
      const values = {
        price: availability.price,
        capacity: availability.capacity,
        available: availability.available,
      };
      await tx
        .insert(batchProduct)
        .values({ batchId: availability.batchId, productId: id, ...values })
        .onConflictDoUpdate({
          target: [batchProduct.batchId, batchProduct.productId],
          set: values,
        });
    });

    return { ok: true as const };
  });

/**
 * Swaps a product with its neighbour in storefront order (landing + menu).
 * Renumbers the whole catalog so ties in sortOrder cannot block the move.
 */
export const moveProduct = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(z.object({ id: z.string().min(1), direction: z.enum(["up", "down"]) }))
  .handler(async ({ data }) => {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: product.id, sortOrder: product.sortOrder })
        .from(product)
        .orderBy(asc(product.sortOrder), asc(product.name))
        .for("update");
      const from = rows.findIndex((row) => row.id === data.id);
      if (from === -1) throw notFound();
      const to = data.direction === "up" ? from - 1 : from + 1;
      if (to < 0 || to >= rows.length) return;

      const ordered = rows.map((row) => row.id);
      [ordered[from], ordered[to]] = [ordered[to]!, ordered[from]!];
      for (const [index, id] of ordered.entries()) {
        if (rows.find((row) => row.id === id)?.sortOrder === index + 1) continue;
        await tx
          .update(product)
          .set({ sortOrder: index + 1 })
          .where(eq(product.id, id));
      }
    });

    return { ok: true as const };
  });
