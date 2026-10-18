/**
 * Invoice draw (undian) domain logic. Takes the database as a parameter so it
 * can run inside server fns and in standalone scripts alike.
 */
import type { Database } from "@web-kwu/db";
import { batch, draw, drawPrize, drawWinner, order } from "@web-kwu/db/schema/shop";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

type Executor = Pick<Database, "select" | "update" | "insert" | "delete">;

export const DEFAULT_ENTRY_RULE = "1 per invoice lunas + opt-in";
const DAY_MS = 24 * 60 * 60 * 1000;

export class DrawError extends Error {}

/** Orders still in play for the draw: not cancelled. */
const notCancelled = ne(order.fulfillmentStatus, "cancelled");

/** An order awaits payment review when flagged or when it has a pending attempt. */
export const inReviewSql = sql`(${order.paymentStatus} = 'review' or exists (
  select 1 from payment_attempt pa where pa.order_id = ${order.id} and pa.status = 'pending'
))`;

/** Live pool counts for a batch (non-cancelled orders only). */
export async function getPoolCounts(db: Executor, batchId: string) {
  const [counts] = await db
    .select({
      paid: sql<number>`count(*) filter (where ${order.paymentStatus} = 'paid')`.mapWith(Number),
      optedIn:
        sql<number>`count(*) filter (where ${order.paymentStatus} = 'paid' and ${order.drawOptIn})`.mapWith(
          Number,
        ),
      unpaid: sql<number>`count(*) filter (where ${order.paymentStatus} <> 'paid')`.mapWith(Number),
      inReview: sql<number>`count(*) filter (where ${inReviewSql})`.mapWith(Number),
    })
    .from(order)
    .where(and(eq(order.batchId, batchId), notCancelled));
  return counts ?? { paid: 0, optedIn: 0, unpaid: 0, inReview: 0 };
}

/** The moment the draw pool may be frozen: preorder closed and payment cutoff passed. */
export function freezeOpensAt(b: { closesAt: Date; paymentCutoffAt: Date }) {
  return new Date(Math.max(b.closesAt.getTime(), b.paymentCutoffAt.getTime()));
}

/**
 * Why the pool cannot be frozen yet, or undefined when it can. Pending reviews
 * block the freeze until the verification deadline; after it, unverified
 * invoices simply stay out of the pool.
 */
export function getFreezeBlocker({
  batch: b,
  verificationDeadline,
  inReview,
  optedIn,
  now = new Date(),
}: {
  batch: { status: string; closesAt: Date; paymentCutoffAt: Date };
  verificationDeadline: Date;
  inReview: number;
  optedIn: number;
  now?: Date;
}) {
  if (b.status === "draft" || now < freezeOpensAt(b)) return "tersedia setelah cutoff";
  if (inReview > 0 && now < verificationDeadline) return "antrean review harus nol";
  if (optedIn === 0) return "belum ada invoice yang memenuhi syarat";
  return undefined;
}

/** Creates the draft draw for a batch with default rules; prizes are added by the admin. */
export async function createDefaultDraw(db: Database, batchId: string) {
  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(batch).where(eq(batch.id, batchId)).limit(1);
    if (!b) throw new DrawError("Batch tidak ditemukan.");
    const [created] = await tx
      .insert(draw)
      .values({
        batchId,
        entryRule: DEFAULT_ENTRY_RULE,
        verificationDeadline: b.paymentCutoffAt,
        claimDeadline: new Date(b.paymentCutoffAt.getTime() + 7 * DAY_MS),
      })
      .onConflictDoNothing({ target: draw.batchId })
      .returning();
    if (!created) throw new DrawError("Undian untuk batch ini sudah ada.");
    return created;
  });
}

/** Replaces rules and prizes of a draft draw; bumps rulesVersion when anything changed. */
export async function updateDraftDraw(
  db: Database,
  input: {
    drawId: string;
    entryRule: string;
    verificationDeadline: Date;
    claimDeadline: Date;
    prizes: string[];
  },
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(draw)
      .where(eq(draw.id, input.drawId))
      .for("update")
      .limit(1);
    if (!current) throw new DrawError("Undian tidak ditemukan.");
    if (current.status !== "draft") throw new DrawError("Aturan terkunci setelah pool dibekukan.");
    if (input.prizes.length < 1 || input.prizes.length > current.maxWinners) {
      throw new DrawError(`Jumlah hadiah harus 1–${current.maxWinners}.`);
    }
    if (input.claimDeadline <= input.verificationDeadline) {
      throw new DrawError("Batas klaim harus setelah batas verifikasi.");
    }

    const prizes = await tx
      .select({ name: drawPrize.name })
      .from(drawPrize)
      .where(eq(drawPrize.drawId, input.drawId))
      .orderBy(drawPrize.position);
    const changed =
      current.entryRule !== input.entryRule ||
      current.verificationDeadline.getTime() !== input.verificationDeadline.getTime() ||
      current.claimDeadline.getTime() !== input.claimDeadline.getTime() ||
      prizes.length !== input.prizes.length ||
      prizes.some(({ name }, index) => name !== input.prizes[index]);
    if (!changed) return { changed: false, rulesVersion: current.rulesVersion };

    // Draft draws have no winners yet, so prizes can be replaced wholesale.
    await tx.delete(drawPrize).where(eq(drawPrize.drawId, input.drawId));
    await tx
      .insert(drawPrize)
      .values(
        input.prizes.map((name, index) => ({ drawId: input.drawId, name, position: index + 1 })),
      );
    const [updated] = await tx
      .update(draw)
      .set({
        entryRule: input.entryRule,
        verificationDeadline: input.verificationDeadline,
        claimDeadline: input.claimDeadline,
        rulesVersion: sql`${draw.rulesVersion} + 1`,
      })
      .where(and(eq(draw.id, input.drawId), eq(draw.status, "draft")))
      .returning({ rulesVersion: draw.rulesVersion });
    if (!updated) throw new DrawError("Aturan terkunci setelah pool dibekukan.");
    return { changed: true, rulesVersion: updated.rulesVersion };
  });
}

/** Eligible invoices: paid, opted in, not cancelled, in the draw's batch. */
function eligibleWhere(batchId: string) {
  return and(
    eq(order.batchId, batchId),
    eq(order.paymentStatus, "paid"),
    eq(order.drawOptIn, true),
    notCancelled,
  );
}

/** Snapshots the eligible invoice numbers and locks the rules. Runs once per draw. */
export async function freezeDraw(
  db: Database,
  { drawId, now = new Date() }: { drawId: string; now?: Date },
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ draw, batch })
      .from(draw)
      .innerJoin(batch, eq(batch.id, draw.batchId))
      .where(eq(draw.id, drawId))
      .for("update", { of: draw })
      .limit(1);
    if (!current) throw new DrawError("Undian tidak ditemukan.");
    if (current.draw.status !== "draft") throw new DrawError("Pool sudah dibekukan.");

    const counts = await getPoolCounts(tx, current.batch.id);
    const blocker = getFreezeBlocker({
      batch: current.batch,
      verificationDeadline: current.draw.verificationDeadline,
      inReview: counts.inReview,
      optedIn: counts.optedIn,
      now,
    });
    if (blocker) throw new DrawError(`Belum bisa dibekukan: ${blocker}.`);
    const [{ prizeCount }] = await tx
      .select({ prizeCount: sql<number>`count(*)`.mapWith(Number) })
      .from(drawPrize)
      .where(eq(drawPrize.drawId, drawId));
    if (prizeCount === 0)
      throw new DrawError("Belum bisa dibekukan: tambahkan minimal satu hadiah.");

    const pool = await tx
      .select({ invoiceNumber: order.invoiceNumber })
      .from(order)
      .where(eligibleWhere(current.batch.id))
      .orderBy(order.invoiceNumber);
    const frozenPool = pool.map(({ invoiceNumber }) => invoiceNumber);

    const [frozen] = await tx
      .update(draw)
      .set({ status: "frozen", frozenPool, frozenAt: now })
      .where(and(eq(draw.id, drawId), eq(draw.status, "draft")))
      .returning();
    if (!frozen) throw new DrawError("Pool sudah dibekukan.");
    return frozen;
  });
}

/** Uniform integer in [0, max) from the CSPRNG, using rejection sampling to avoid modulo bias. */
export function secureRandomInt(max: number) {
  if (!Number.isInteger(max) || max <= 0 || max > 2 ** 32) throw new RangeError("max out of range");
  const limit = 2 ** 32 - (2 ** 32 % max);
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    const value = buffer[0]!;
    if (value < limit) return value % max;
  }
}

/** Picks `count` distinct items via a partial Fisher–Yates shuffle on a copy. */
export function securePick<T>(items: readonly T[], count: number) {
  const pool = [...items];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + secureRandomInt(pool.length - i);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, n);
}

/**
 * Re-checks the frozen pool, draws winners with server-side secure randomness
 * and persists them in the same transaction. The conditional status update
 * guarantees the draw can only ever run once.
 */
export async function runDraw(
  db: Database,
  { drawId, actorId, now = new Date() }: { drawId: string; actorId: string; now?: Date },
) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(draw).where(eq(draw.id, drawId)).limit(1);
    if (!current) throw new DrawError("Undian tidak ditemukan.");
    if (current.status === "drawn") throw new DrawError("Undian sudah dijalankan.");
    if (current.status !== "frozen") throw new DrawError("Bekukan pool sebelum mengundi.");

    // Claim the run first: concurrent attempts block on the row lock and then match nothing.
    const [claimed] = await tx
      .update(draw)
      .set({ status: "drawn", drawnAt: now, drawnById: actorId })
      .where(and(eq(draw.id, drawId), eq(draw.status, "frozen")))
      .returning();
    if (!claimed) throw new DrawError("Undian sudah dijalankan.");

    const prizes = await tx
      .select()
      .from(drawPrize)
      .where(eq(drawPrize.drawId, drawId))
      .orderBy(drawPrize.position);
    if (prizes.length === 0) throw new DrawError("Tambahkan minimal satu hadiah.");

    const frozenPool = claimed.frozenPool ?? [];
    // Eligibility can change after freeze (refund/cancel), so re-check every invoice.
    const eligible =
      frozenPool.length === 0
        ? []
        : await tx
            .select({ id: order.id, invoiceNumber: order.invoiceNumber })
            .from(order)
            .where(and(eligibleWhere(claimed.batchId), inArray(order.invoiceNumber, frozenPool)))
            .orderBy(order.invoiceNumber);
    if (eligible.length === 0) throw new DrawError("Tidak ada invoice yang masih memenuhi syarat.");

    const count = Math.min(claimed.maxWinners, prizes.length, eligible.length);
    const winners = securePick(eligible, count);
    await tx.insert(drawWinner).values(
      winners.map((winner, index) => ({
        drawId,
        orderId: winner.id,
        prizeId: prizes[index]!.id,
        position: index + 1,
      })),
    );
    return {
      draw: claimed,
      winners: winners.length,
      excluded: frozenPool.length - eligible.length,
    };
  });
}

/** "Ayu Lestari" → "A••• L•••" for result lists. */
export function maskName(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word[0]!.toUpperCase()}•••`)
    .join(" ");
}
