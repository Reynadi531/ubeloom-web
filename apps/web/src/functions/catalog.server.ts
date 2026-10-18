import { batch, order, orderItem, product } from "@web-kwu/db/schema/shop";
import { and, count, eq, lte, ne, sql } from "drizzle-orm";

import { formatDayMonth, formatTime, toDateInputValue } from "@/lib/format";
import { db } from "@/services";

type Batch = typeof batch.$inferSelect;

/** Units sold per product in a batch, counting every order that is not cancelled. */
export async function getSoldQuantities(batchId: string) {
  const rows = await db
    .select({
      productId: orderItem.productId,
      quantity: sql<number>`coalesce(sum(${orderItem.quantity}), 0)::int`,
    })
    .from(orderItem)
    .innerJoin(order, eq(orderItem.orderId, order.id))
    .where(and(eq(order.batchId, batchId), ne(order.fulfillmentStatus, "cancelled")))
    .groupBy(orderItem.productId);
  return new Map(
    rows.flatMap(({ productId, quantity }) => (productId ? [[productId, quantity]] : [])),
  );
}

/** 1-based position of a batch by opening date, zero-padded: "01". */
export async function getBatchNumber(current: Batch) {
  const [{ value }] = await db
    .select({ value: count() })
    .from(batch)
    .where(lte(batch.opensAt, current.opensAt));
  return String(value).padStart(2, "0");
}

/** "24 Okt 2026" in WIB. */
export const formatShortDate = (value: Date) =>
  `${formatDayMonth(value)} ${toDateInputValue(value).slice(0, 4)}`;

/** "24 Okt 2026 · 20.00 WIB" in WIB. */
export const formatShortDateTime = (value: Date) =>
  `${formatShortDate(value)} · ${formatTime(value)} WIB`;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "produk";

/** Creates an unpublished product with a unique slug and the next PRD-### code. */
export async function createDraftProduct(input: {
  name: string;
  category: (typeof product.$inferInsert)["category"];
  unit: (typeof product.$inferInsert)["unit"];
  price: number;
  images: string[];
}) {
  const existing = await db
    .select({ slug: product.slug, code: product.code, sortOrder: product.sortOrder })
    .from(product);

  const base = slugify(input.name);
  const slugs = new Set(existing.map(({ slug }) => slug));
  let slug = base;
  for (let suffix = 2; slugs.has(slug); suffix++) slug = `${base}-${suffix}`;

  const codeNumbers = existing.map(({ code }) => Number(/^PRD-(\d+)$/.exec(code)?.[1] ?? 0));
  const code = `PRD-${String(Math.max(0, ...codeNumbers) + 1).padStart(3, "0")}`;
  const sortOrder = Math.max(0, ...existing.map((row) => row.sortOrder)) + 1;

  const [created] = await db
    .insert(product)
    .values({
      ...input,
      slug,
      code,
      sortOrder,
      published: false,
      display: {
        collection: "",
        story: "",
        variant: "",
        highlights: [],
        detailsTitle: "",
        facts: [],
      },
    })
    .returning();
  return created;
}
