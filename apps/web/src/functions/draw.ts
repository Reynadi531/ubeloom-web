import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { resolveBatch } from "@/lib/batches.server";
import {
  DrawError,
  createDefaultDraw,
  freezeDraw as freezeDrawCore,
  freezeOpensAt,
  getFreezeBlocker,
  getPoolCounts,
  maskName,
  runDraw as runDrawCore,
  updateDraftDraw,
} from "@/lib/draw.server";
import { requireAuthMiddleware } from "@/middleware/auth";
import { db } from "@/services";

/** Turns domain errors into plain messages the page can toast. */
async function withDrawErrors<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof DrawError) throw new Error(error.message);
    throw error;
  }
}

/** Everything the Undian page shows for one batch (defaults to the current batch). */
export const getDrawPage = createServerFn({ method: "GET" })
  .middleware([requireAuthMiddleware])
  .validator(z.object({ batchId: z.string().min(1).optional() }))
  .handler(async ({ data }) => {
    const b = await resolveBatch(data.batchId);
    if (!b) return { batch: null } as const;

    const [pool, found] = await Promise.all([
      getPoolCounts(db, b.id),
      db.query.draw.findFirst({
        where: { batchId: b.id },
        with: {
          prizes: { orderBy: { position: "asc" } },
          winners: {
            orderBy: { position: "asc" },
            with: {
              prize: { columns: { name: true } },
              order: { columns: { invoiceNumber: true, customerName: true } },
            },
          },
        },
      }),
    ]);

    const now = new Date();
    const batchInfo = {
      id: b.id,
      name: b.name,
      status: b.status,
      paymentCutoffAt: b.paymentCutoffAt,
      freezeOpensAt: freezeOpensAt(b),
      cutoffPassed: b.status !== "draft" && now >= freezeOpensAt(b),
    };
    if (!found) return { batch: batchInfo, pool, draw: null } as const;

    return {
      batch: batchInfo,
      pool,
      draw: {
        id: found.id,
        status: found.status,
        entryRule: found.entryRule,
        verificationDeadline: found.verificationDeadline,
        claimDeadline: found.claimDeadline,
        maxWinners: found.maxWinners,
        rulesVersion: found.rulesVersion,
        frozenPoolSize: found.frozenPool?.length ?? null,
        frozenAt: found.frozenAt,
        drawnAt: found.drawnAt,
        prizes: found.prizes.map(({ id, name, position }) => ({ id, name, position })),
        // Only persisted results ever reach the page; contact details stay masked.
        winners: found.winners.map((winner) => ({
          position: winner.position,
          invoiceNumber: winner.order.invoiceNumber,
          customer: maskName(winner.order.customerName),
          prize: winner.prize?.name ?? "—",
        })),
        freezeBlocker:
          found.status === "draft"
            ? getFreezeBlocker({
                batch: b,
                verificationDeadline: found.verificationDeadline,
                inReview: pool.inReview,
                optedIn: pool.optedIn,
                now,
              })
            : undefined,
      },
    } as const;
  });

/** Creates the draft draw for a batch with default rules and prizes. */
export const createDraw = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(z.object({ batchId: z.string().min(1) }))
  .handler(({ data }) =>
    withDrawErrors(async () => {
      const created = await createDefaultDraw(db, data.batchId);
      return { id: created.id };
    }),
  );

/** Saves rules and prizes while the draw is still a draft. */
export const saveDrawRules = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(
    z.object({
      drawId: z.string().min(1),
      entryRule: z.string().trim().min(1, "Aturan entri wajib diisi.").max(200),
      verificationDeadline: z.coerce.date(),
      claimDeadline: z.coerce.date(),
      prizes: z.array(z.string().trim().min(1, "Nama hadiah wajib diisi.").max(120)).min(1).max(50),
    }),
  )
  .handler(({ data }) => withDrawErrors(() => updateDraftDraw(db, data)));

/** Freezes the eligible invoice pool and locks the rules. */
export const freezeDraw = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(z.object({ drawId: z.string().min(1) }))
  .handler(({ data }) =>
    withDrawErrors(async () => {
      const frozen = await freezeDrawCore(db, { drawId: data.drawId });
      return { poolSize: frozen.frozenPool?.length ?? 0 };
    }),
  );

/** Draws and persists the winners. Can only succeed once per draw. */
export const runDraw = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(z.object({ drawId: z.string().min(1) }))
  .handler(({ data, context }) =>
    withDrawErrors(async () => {
      const result = await runDrawCore(db, {
        drawId: data.drawId,
        actorId: context.session.user.id,
      });
      return { winners: result.winners, excluded: result.excluded };
    }),
  );
