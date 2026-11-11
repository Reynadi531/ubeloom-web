/** Payment review mutations used by "Verifikasi bayar" and the Telegram bot. */
import type { Database } from "@web-kwu/db";
import { gatewayPayment, order, orderEvent, paymentAttempt } from "@web-kwu/db/schema/shop";
import { and, eq, inArray, ne, notExists, or, sql } from "drizzle-orm";

/** Placeholders like "-" or "..." carry no letter/digit and must never count as a reference. */
export const normalizeReference = (value: string) =>
  /[\p{L}\p{N}]/u.test(value) ? value.trim().toLowerCase() : "";

/**
 * Approves a pending attempt and marks its order paid. Re-validates the amount
 * and that neither reference already settled another order.
 */
export function approvePaymentAttempt(
  db: Database,
  data: { attemptId: string; merchantReference: string },
  actorId: string,
) {
  const merchantReference = data.merchantReference.trim();

  return db.transaction(async (tx) => {
    const attempt = await tx.query.paymentAttempt.findFirst({
      where: { id: data.attemptId },
      with: {
        order: {
          columns: { id: true, total: true, paymentStatus: true, fulfillmentStatus: true },
        },
      },
    });
    if (!attempt) throw new Error("Percobaan pembayaran tidak ditemukan.");
    if (attempt.status !== "pending") throw new Error("Bukti ini sudah ditinjau.");
    if (attempt.order.paymentStatus === "paid") throw new Error("Invoice ini sudah lunas.");
    if (attempt.order.fulfillmentStatus === "cancelled") {
      throw new Error("Pesanan sudah dibatalkan. Tolak bukti ini.");
    }
    if (attempt.claimedAmount !== attempt.order.total) {
      throw new Error("Nominal yang diklaim tidak sama dengan total invoice.");
    }

    // Serialize approvals that touch the same references, then check reuse.
    const references = [
      ...new Set([
        normalizeReference(attempt.customerReference),
        normalizeReference(merchantReference),
      ]),
    ].filter(Boolean);
    for (const reference of [...references].sort()) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`payment-ref:${reference}`}))`);
    }
    const [reused] = await tx
      .select({ id: paymentAttempt.id })
      .from(paymentAttempt)
      .where(
        and(
          eq(paymentAttempt.status, "approved"),
          ne(paymentAttempt.orderId, attempt.orderId),
          or(
            inArray(sql`lower(trim(${paymentAttempt.customerReference}))`, references),
            inArray(sql`lower(trim(${paymentAttempt.merchantReference}))`, references),
          ),
        ),
      )
      .limit(1);
    if (reused) throw new Error("Referensi transaksi sudah dipakai invoice lain.");

    const now = new Date();
    const updated = await tx
      .update(paymentAttempt)
      .set({
        status: "approved",
        merchantReference,
        reviewedById: actorId,
        reviewedAt: now,
      })
      .where(and(eq(paymentAttempt.id, attempt.id), eq(paymentAttempt.status, "pending")))
      .returning({ id: paymentAttempt.id });
    if (updated.length === 0) throw new Error("Bukti ini sudah ditinjau.");

    const paidOrder = await tx
      .update(order)
      .set({ paymentStatus: "paid", paidAt: now })
      .where(and(eq(order.id, attempt.orderId), ne(order.paymentStatus, "paid")))
      .returning({ id: order.id });
    if (paidOrder.length === 0) throw new Error("Invoice ini sudah lunas.");

    await tx.insert(orderEvent).values({
      orderId: attempt.orderId,
      type: "payment_approved",
      fromStatus: attempt.order.paymentStatus,
      toStatus: "paid",
      note: `Percobaan #${attempt.attempt} · ref. merchant ${merchantReference}`,
      actorId,
    });

    return { id: attempt.id };
  });
}

/** Rejects a pending attempt with a reason; the order goes back to unpaid. */
export function rejectPaymentAttempt(
  db: Database,
  data: { attemptId: string; reason: string; note?: string },
  actorId: string,
) {
  const reviewNote = data.note ? `${data.reason} — ${data.note}` : data.reason;

  return db.transaction(async (tx) => {
    const [rejected] = await tx
      .update(paymentAttempt)
      .set({ status: "rejected", reviewNote, reviewedById: actorId, reviewedAt: new Date() })
      .where(and(eq(paymentAttempt.id, data.attemptId), eq(paymentAttempt.status, "pending")))
      .returning({ orderId: paymentAttempt.orderId, attempt: paymentAttempt.attempt });
    if (!rejected) throw new Error("Bukti ini sudah ditinjau atau tidak ditemukan.");

    // Back to unpaid unless another proof for the same order is still waiting.
    const otherPending = db
      .select({ id: paymentAttempt.id })
      .from(paymentAttempt)
      .where(
        and(eq(paymentAttempt.orderId, rejected.orderId), eq(paymentAttempt.status, "pending")),
      );
    const reverted = await tx
      .update(order)
      .set({ paymentStatus: "unpaid" })
      .where(
        and(
          eq(order.id, rejected.orderId),
          eq(order.paymentStatus, "review"),
          notExists(otherPending),
        ),
      )
      .returning({ id: order.id });

    await tx.insert(orderEvent).values({
      orderId: rejected.orderId,
      type: "payment_rejected",
      fromStatus: "review",
      toStatus: reverted.length ? "unpaid" : "review",
      note: `Percobaan #${rejected.attempt} · ${reviewNote}`,
      actorId,
    });

    return { id: data.attemptId };
  });
}

export type GatewayOutcome = "completed" | "failed" | "expired";

export type GatewayNotification = {
  /** Our `order_id` echoed back by the gateway (gatewayPayment.reference). */
  reference: string;
  outcome: GatewayOutcome;
  providerPaymentId?: string;
  amount?: number;
  fee?: number;
  netAmount?: number;
  paidAt?: Date;
};

/**
 * Applies a verified gateway webhook. Idempotent: replays and out-of-order events never
 * downgrade a completed payment. A completion marks the order paid unless it already
 * is; a completion on a cancelled or already-paid order is recorded for a manual refund.
 */
export function settleGatewayPayment(db: Database, event: GatewayNotification) {
  return db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(gatewayPayment)
      .where(eq(gatewayPayment.reference, event.reference))
      .for("update");
    if (!payment) return { result: "unknown" as const };
    if (payment.status === "completed") return { result: "duplicate" as const };

    if (event.outcome !== "completed") {
      if (payment.status === "pending") {
        await tx
          .update(gatewayPayment)
          .set({ status: event.outcome, providerPaymentId: event.providerPaymentId })
          .where(eq(gatewayPayment.id, payment.id));
      }
      return { result: event.outcome };
    }

    // With "charge fee to customer" the gateway may report more than we asked; never less.
    if (event.amount !== undefined && event.amount < payment.amount) {
      await tx.insert(orderEvent).values({
        orderId: payment.orderId,
        type: "payment_gateway_mismatch",
        note: `QRIS otomatis · ref. ${payment.reference} · dilaporkan ${event.amount}, diminta ${payment.amount}`,
      });
      return { result: "mismatch" as const };
    }

    const paidAt = event.paidAt ?? new Date();
    await tx
      .update(gatewayPayment)
      .set({
        status: "completed",
        providerPaymentId: event.providerPaymentId ?? payment.providerPaymentId,
        fee: event.fee,
        netAmount: event.netAmount,
        paidAt,
      })
      .where(eq(gatewayPayment.id, payment.id));

    const [current] = await tx
      .select({
        total: order.total,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
      })
      .from(order)
      .where(eq(order.id, payment.orderId))
      .for("update");
    if (!current) return { result: "unknown" as const };

    const note = `QRIS otomatis · ref. ${payment.reference}${event.providerPaymentId ? ` · ${event.providerPaymentId}` : ""}`;
    if (current.paymentStatus === "paid" || current.fulfillmentStatus === "cancelled") {
      await tx.insert(orderEvent).values({
        orderId: payment.orderId,
        type: "payment_gateway_refund_needed",
        fromStatus: current.paymentStatus,
        toStatus: current.paymentStatus,
        note: `${note} · dibayar saat pesanan ${current.paymentStatus === "paid" ? "sudah lunas" : "dibatalkan"}, perlu refund`,
      });
      return { result: "refund_needed" as const };
    }
    if (payment.amount !== current.total) {
      // The order total changed after the QR was issued (admin edit); keep it for review.
      await tx.insert(orderEvent).values({
        orderId: payment.orderId,
        type: "payment_gateway_mismatch",
        fromStatus: current.paymentStatus,
        toStatus: current.paymentStatus,
        note: `${note} · dibayar ${payment.amount}, total invoice kini ${current.total}`,
      });
      return { result: "mismatch" as const };
    }

    await tx
      .update(order)
      .set({ paymentStatus: "paid", paidAt })
      .where(eq(order.id, payment.orderId));
    await tx.insert(orderEvent).values({
      orderId: payment.orderId,
      type: "payment_gateway_paid",
      fromStatus: current.paymentStatus,
      toStatus: "paid",
      note,
    });
    return { result: "paid" as const };
  });
}
