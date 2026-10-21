import { createServerFn } from "@tanstack/react-start";
import { order, orderEvent, paymentAttempt } from "@web-kwu/db/schema/shop";
import { approvePaymentAttempt, rejectPaymentAttempt } from "@web-kwu/shop/payments";
import { and, eq, gte, ne, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import { getCurrentBatch } from "@/lib/batches.server";
import { getShopSettings } from "@/lib/settings.server";
import { fromDateInputValue, toDateInputValue } from "@/lib/format";
import { requireAuthMiddleware } from "@/middleware/auth";
import { db, storage } from "@/services";

/** Rejected attempts stay visible in the queue ("Ditolak sebelumnya") for this long. */
export const RECENT_REJECTION_DAYS = 7;
const RECENT_REJECTION_LIMIT = 5;

/** Midnight WIB of the current day. */
const startOfTodayWib = () => fromDateInputValue(toDateInputValue(new Date()));

/** Everything the "Verifikasi pembayaran" page renders. */
export const getPaymentReview = createServerFn({ method: "GET" })
  .middleware([requireAuthMiddleware])
  .handler(async () => {
    const todayStart = startOfTodayWib();
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const rejectedSince = new Date(Date.now() - RECENT_REJECTION_DAYS * 24 * 60 * 60 * 1000);
    const newerAttempt = alias(paymentAttempt, "newer_attempt");

    const [[counts], currentBatch, recentRejectedIds] = await Promise.all([
      db
        .select({
          pending:
            sql<number>`count(*) filter (where ${paymentAttempt.status} = 'pending')`.mapWith(
              Number,
            ),
          pendingBeforeToday:
            sql<number>`count(*) filter (where ${paymentAttempt.status} = 'pending' and ${paymentAttempt.createdAt} < ${todayStart})`.mapWith(
              Number,
            ),
          approvedToday:
            sql<number>`count(*) filter (where ${paymentAttempt.status} = 'approved' and ${paymentAttempt.reviewedAt} >= ${todayStart} and ${paymentAttempt.reviewedAt} < ${tomorrowStart})`.mapWith(
              Number,
            ),
          resubmitted:
            sql<number>`count(*) filter (where ${paymentAttempt.status} = 'pending' and ${paymentAttempt.attempt} > 1)`.mapWith(
              Number,
            ),
          // Same window as the "Ditolak sebelumnya" rows in the queue.
          rejectedRecent:
            sql<number>`count(*) filter (where ${paymentAttempt.status} = 'rejected' and ${paymentAttempt.reviewedAt} >= ${rejectedSince})`.mapWith(
              Number,
            ),
        })
        .from(paymentAttempt),
      getCurrentBatch(),
      // Latest rejections whose order is still unpaid and has no newer attempt.
      db
        .select({ id: paymentAttempt.id })
        .from(paymentAttempt)
        .innerJoin(order, eq(order.id, paymentAttempt.orderId))
        .where(
          and(
            eq(paymentAttempt.status, "rejected"),
            gte(paymentAttempt.reviewedAt, rejectedSince),
            ne(order.paymentStatus, "paid"),
            notExists(
              db
                .select({ id: newerAttempt.id })
                .from(newerAttempt)
                .where(
                  and(
                    eq(newerAttempt.orderId, paymentAttempt.orderId),
                    sql`${newerAttempt.attempt} > ${paymentAttempt.attempt}`,
                  ),
                ),
            ),
          ),
        )
        .orderBy(sql`${paymentAttempt.reviewedAt} desc`)
        .limit(RECENT_REJECTION_LIMIT),
    ]);

    const rejectedIds = recentRejectedIds.map(({ id }) => id);
    const rows = await db.query.paymentAttempt.findMany({
      where: rejectedIds.length
        ? { OR: [{ status: "pending" }, { id: { in: rejectedIds } }] }
        : { status: "pending" },
      orderBy: { createdAt: "asc" },
      with: {
        order: {
          columns: {
            id: true,
            invoiceNumber: true,
            customerName: true,
            customerPhone: true,
            method: true,
            paymentMethod: true,
            paymentStatus: true,
            fulfillmentStatus: true,
            subtotal: true,
            shippingFee: true,
            total: true,
          },
          with: {
            pickupSlot: { columns: { startsAt: true, endsAt: true } },
          },
        },
        reviewedBy: { columns: { name: true } },
      },
    });

    // Pending first (oldest first), then the recent rejections.
    const attempts = await Promise.all(
      [
        ...rows.filter(({ status }) => status === "pending"),
        ...rows.filter(({ status }) => status !== "pending"),
      ].map(async (row) => ({
        id: row.id,
        attempt: row.attempt,
        status: row.status,
        claimedAmount: row.claimedAmount,
        claimedPaidAt: row.claimedPaidAt,
        customerReference: row.customerReference,
        merchantReference: row.merchantReference,
        // Customer uploads live in the private bucket; hand the reviewer a short-lived link.
        proofUrl: row.proofKey ? await storage.presignGet(row.proofKey) : row.proofUrl,
        reviewNote: row.reviewNote,
        reviewedAt: row.reviewedAt,
        reviewedBy: row.reviewedBy?.name ?? null,
        createdAt: row.createdAt,
        order: row.order,
      })),
    );

    return {
      batch: currentBatch ? { name: currentBatch.name, status: currentBatch.status } : null,
      todayStart,
      metrics: counts,
      merchantName: (await getShopSettings()).qrisMerchantName,
      attempts,
    };
  });

export type PaymentReviewData = Awaited<ReturnType<typeof getPaymentReview>>;
export type PaymentReviewAttempt = PaymentReviewData["attempts"][number];

/**
 * Approves a pending attempt and marks its order paid. Re-validates the amount
 * and that neither reference already settled another order.
 */
export const approvePayment = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(
    z.object({
      attemptId: z.string().min(1),
      merchantReference: z.string().trim().min(1, "Referensi merchant wajib diisi").max(120),
      /** Client confirms every checklist item; the server re-checks what it can. */
      checklistConfirmed: z.literal(true, "Lengkapi checklist sebelum menyetujui"),
    }),
  )
  .handler(async ({ data, context }) => {
    const { attemptId, merchantReference } = data;
    return approvePaymentAttempt(db, { attemptId, merchantReference }, context.session.user.id);
  });

/** Rejects a pending attempt with a reason; the order goes back to unpaid. */
export const rejectPayment = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(
    z.object({
      attemptId: z.string().min(1),
      reason: z.string().trim().min(1, "Pilih alasan penolakan").max(120),
      note: z.string().trim().max(500).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const actorId = context.session.user.id;
    const { attemptId, reason, note } = data;
    return rejectPaymentAttempt(db, { attemptId, reason, note }, actorId);
  });

/**
 * Records a customer's payment claim (admin-entered until customers can upload
 * proofs themselves). Creates the next attempt number and puts the order in review.
 */
export const recordPaymentAttempt = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(
    z.object({
      orderId: z.string().min(1),
      amount: z.number().int().positive(),
      paidAt: z.coerce.date(),
      reference: z.string().trim().min(1).max(120),
      proofUrl: z.url({ protocol: /^https?$/ }).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    return db.transaction(async (tx) => {
      // Lock the order so concurrent submissions get distinct attempt numbers.
      const [target] = await tx
        .select({ id: order.id, paymentStatus: order.paymentStatus })
        .from(order)
        .where(eq(order.id, data.orderId))
        .for("update");
      if (!target) throw new Error("Pesanan tidak ditemukan.");
      if (target.paymentStatus === "paid") throw new Error("Invoice ini sudah lunas.");

      const [{ next }] = await tx
        .select({
          next: sql<number>`coalesce(max(${paymentAttempt.attempt}), 0) + 1`.mapWith(Number),
        })
        .from(paymentAttempt)
        .where(eq(paymentAttempt.orderId, data.orderId));

      const [created] = await tx
        .insert(paymentAttempt)
        .values({
          orderId: data.orderId,
          attempt: next,
          claimedAmount: data.amount,
          claimedPaidAt: data.paidAt,
          customerReference: data.reference,
          proofUrl: data.proofUrl,
        })
        .returning({ id: paymentAttempt.id, attempt: paymentAttempt.attempt });

      await tx.update(order).set({ paymentStatus: "review" }).where(eq(order.id, data.orderId));
      await tx.insert(orderEvent).values({
        orderId: data.orderId,
        type: "payment_submitted",
        fromStatus: target.paymentStatus,
        toStatus: "review",
        note: `Percobaan #${next} · ref. ${data.reference}`,
        proofUrl: data.proofUrl,
        actorId: context.session.user.id,
      });

      return created;
    });
  });
