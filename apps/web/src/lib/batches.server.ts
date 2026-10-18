import { batch } from "@web-kwu/db/schema/shop";
import { desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/services";

/**
 * The batch admin pages default to: the open batch if any, otherwise the most
 * recently opened one. Returns undefined when no batch exists yet.
 */
export async function getCurrentBatch() {
  const [open] = await db
    .select()
    .from(batch)
    .where(eq(batch.status, "open"))
    .orderBy(desc(batch.opensAt))
    .limit(1);
  if (open) return open;
  const [latest] = await db.select().from(batch).orderBy(desc(batch.opensAt)).limit(1);
  return latest;
}

/** Resolves an explicit batch id, falling back to the current batch. */
export async function resolveBatch(batchId?: string) {
  if (!batchId) return getCurrentBatch();
  const [found] = await db.select().from(batch).where(eq(batch.id, batchId)).limit(1);
  return found;
}

/**
 * Batch the public storefront may show: the open batch, otherwise the most
 * recently closed one. Draft and archived batches are never exposed.
 */
export async function getPublicBatch() {
  const [found] = await db
    .select()
    .from(batch)
    .where(inArray(batch.status, ["open", "closed"]))
    .orderBy(sql`${batch.status} = 'open' desc`, desc(batch.opensAt))
    .limit(1);
  return found;
}
