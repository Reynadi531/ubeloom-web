/** Batch and voucher switches shared by the dashboard and the Telegram bot. */
import type { Database } from "@web-kwu/db";
import { batch, voucher } from "@web-kwu/db/schema/shop";
import { and, eq, ne } from "drizzle-orm";

type Executor = Pick<Database, "update">;

/** Only one batch is open at a time: opening one closes the rest. */
export function closeOtherOpenBatches(executor: Executor, openBatchId: string) {
  return executor
    .update(batch)
    .set({ status: "closed" })
    .where(and(eq(batch.status, "open"), ne(batch.id, openBatchId)));
}

export function setBatchStatus(
  db: Database,
  batchId: string,
  status: "draft" | "open" | "closed" | "archived",
) {
  return db.transaction(async (tx) => {
    const [saved] = await tx
      .update(batch)
      .set({ status })
      .where(eq(batch.id, batchId))
      .returning({ id: batch.id, name: batch.name });
    if (!saved) throw new Error("Batch tidak ditemukan");
    if (status === "open") await closeOtherOpenBatches(tx, saved.id);
    return saved;
  });
}

export async function setVoucherActive(db: Database, id: string, active: boolean) {
  const [updated] = await db
    .update(voucher)
    .set({ active })
    .where(eq(voucher.id, id))
    .returning({ id: voucher.id });
  if (!updated) throw new Error("Voucher tidak ditemukan.");
  return { ok: true };
}
