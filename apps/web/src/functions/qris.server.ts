/**
 * Automatic QRIS payments on the customer's invoice. The gateway settles a payment
 * on its own, so a paid transaction marks the order paid without a proof or review.
 * Its webhook and the invoice page's polling both end up in `applyGatewayTransaction`.
 */
import { order, orderEvent, paymentAttempt, qrisPayment } from "@web-kwu/db/schema/shop";
import { QRIS_AUTO_PAYMENT_METHOD } from "@web-kwu/shop/rules";
import { and, count, eq } from "drizzle-orm";
import QRCode from "qrcode";

import { formatRupiah } from "@/lib/format";
import {
  type GatewayTransaction,
  QrisGatewayError,
  createGatewayTransaction,
  getGatewayTransaction,
  qrisGatewayConfig,
} from "@/lib/qris-gateway.server";
import { db } from "@/services";

/** QR codes a customer may generate per order; each one reserves an amount at the gateway. */
const MAX_QRIS_PAYMENTS = 20;

const UNAVAILABLE = "QRIS otomatis sedang tidak tersedia. Gunakan QRIS manual.";

type QrisPaymentRow = typeof qrisPayment.$inferSelect;

/** What the invoice page needs to offer and render the automatic QRIS. */
export async function autoQrisView(
  latest: QrisPaymentRow | undefined,
  payable: boolean,
): Promise<{
  /** The customer may generate (or keep paying) an automatic QR. */
  available: boolean;
  payment: {
    status: QrisPaymentRow["status"];
    /** Pending and not past its deadline when the page loaded: the QR may be paid. */
    active: boolean;
    uniqueCode: number;
    totalAmount: number;
    /** ISO timestamp; the QR must not be paid after it. */
    expiresAt: string;
    /** PNG data URL of the QR; only while the payment is pending. */
    qrDataUrl: string | null;
  } | null;
}> {
  const available = payable && qrisGatewayConfig() !== null;
  if (!available || !latest) return { available, payment: null };
  return {
    available,
    payment: {
      status: latest.status,
      active: latest.status === "pending" && latest.expiresAt.getTime() > Date.now(),
      uniqueCode: latest.uniqueCode,
      totalAmount: latest.totalAmount,
      expiresAt: latest.expiresAt.toISOString(),
      qrDataUrl:
        latest.status === "pending"
          ? await QRCode.toDataURL(latest.qris, {
              errorCorrectionLevel: "M",
              margin: 2,
              width: 560,
            })
          : null,
    },
  };
}

function findOrder(token: string) {
  return db.query.order.findFirst({
    where: { accessToken: token },
    columns: {
      id: true,
      invoiceNumber: true,
      total: true,
      paymentStatus: true,
      fulfillmentStatus: true,
    },
    with: { qrisPayments: { orderBy: { createdAt: "desc" }, limit: 1 } },
  });
}

/** Generates a QR for the order total, reusing the current one while it is still payable. */
export async function startQrisPayment(token: string) {
  const config = qrisGatewayConfig();
  if (!config) throw new Error(UNAVAILABLE);

  const target = await findOrder(token);
  if (!target) throw new Error("Invoice tidak ditemukan.");
  if (target.fulfillmentStatus === "cancelled") throw new Error("Pesanan ini sudah dibatalkan.");
  if (target.paymentStatus === "paid") throw new Error("Invoice ini sudah lunas.");
  if (target.paymentStatus === "review") {
    throw new Error("Bukti pembayaran manual masih ditinjau. Tunggu hasil verifikasi.");
  }
  if (target.total < 1) throw new Error("Invoice ini tidak memerlukan pembayaran.");

  const [latest] = target.qrisPayments;
  if (
    latest?.status === "pending" &&
    latest.expiresAt.getTime() > Date.now() &&
    latest.amount === target.total
  ) {
    return { transactionId: latest.transactionId };
  }

  const [{ created }] = await db
    .select({ created: count() })
    .from(qrisPayment)
    .where(eq(qrisPayment.orderId, target.id));
  if (created >= MAX_QRIS_PAYMENTS) {
    throw new Error("Batas pembuatan QR tercapai. Gunakan QRIS manual atau hubungi bantuan.");
  }

  let remote: GatewayTransaction;
  try {
    // Concurrent requests compute the same ID, and the gateway answers both with one payment.
    remote = await createGatewayTransaction(config, {
      transactionId: `${target.invoiceNumber}-${created + 1}`,
      amount: target.total,
    });
  } catch (error) {
    console.error(`[qris] create payment for ${target.invoiceNumber} failed`, error);
    throw new Error(
      error instanceof QrisGatewayError && error.status === 409
        ? "QR tidak dapat dibuat saat ini. Coba lagi beberapa menit lagi atau gunakan QRIS manual."
        : UNAVAILABLE,
    );
  }

  await db
    .insert(qrisPayment)
    .values({
      orderId: target.id,
      transactionId: remote.transaction_id,
      amount: remote.amount,
      uniqueCode: remote.unique_code,
      totalAmount: remote.total_amount,
      qris: remote.qris,
      expiresAt: remote.expires_at,
    })
    .onConflictDoNothing({ target: qrisPayment.transactionId });
  // An identical retry can return a payment the gateway already finalized.
  await applyGatewayTransaction(remote);
  return { transactionId: remote.transaction_id };
}

/**
 * Polled by the invoice page while a QR is pending: asks the gateway for the latest
 * status (covering a webhook that has not arrived) and reports where the order stands.
 */
export async function refreshQrisPayment(token: string) {
  const target = await findOrder(token);
  if (!target) throw new Error("Invoice tidak ditemukan.");

  const [latest] = target.qrisPayments;
  const config = qrisGatewayConfig();
  if (latest?.status !== "pending" || !config) {
    return { paymentStatus: target.paymentStatus, qrisStatus: latest?.status ?? null };
  }

  try {
    await applyGatewayTransaction(await getGatewayTransaction(config, latest.transactionId));
  } catch (error) {
    console.error(`[qris] refresh ${latest.transactionId} failed`, error);
  }
  const fresh = await findOrder(token);
  return {
    paymentStatus: fresh?.paymentStatus ?? target.paymentStatus,
    qrisStatus: fresh?.qrisPayments[0]?.status ?? latest.status,
  };
}

/**
 * Records the gateway's final status of a payment and, when paid, settles its order.
 * Safe to call repeatedly: only a still-pending payment is ever changed.
 */
export async function applyGatewayTransaction(remote: GatewayTransaction) {
  if (remote.status === "pending") return "pending" as const;

  return db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(qrisPayment)
      .where(eq(qrisPayment.transactionId, remote.transaction_id))
      .for("update");
    if (!payment) return "unknown" as const;
    if (payment.status !== "pending") return "duplicate" as const;
    if (remote.total_amount !== payment.totalAmount) {
      console.error(
        `[qris] ${payment.transactionId}: gateway amount ${remote.total_amount} differs from ${payment.totalAmount}`,
      );
      return "mismatch" as const;
    }

    await tx
      .update(qrisPayment)
      .set({ status: remote.status, providerTransactionId: remote.provider_transaction_id ?? null })
      .where(eq(qrisPayment.id, payment.id));
    if (remote.status === "expired") return "expired" as const;

    const [target] = await tx
      .select({
        total: order.total,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
      })
      .from(order)
      .where(eq(order.id, payment.orderId))
      .for("update");
    if (!target) return "unknown" as const;

    const received = [
      `${QRIS_AUTO_PAYMENT_METHOD} · ${formatRupiah(payment.totalAmount)} (kode unik ${payment.uniqueCode})`,
      ...(remote.provider_transaction_id ? [`ref. ${remote.provider_transaction_id}`] : []),
    ].join(" · ");

    // Money arrived but the order cannot simply be settled: leave it for an admin.
    const problem =
      target.fulfillmentStatus === "cancelled"
        ? "pesanan sudah dibatalkan"
        : target.paymentStatus === "paid"
          ? "invoice sudah lunas (pembayaran ganda)"
          : payment.amount !== target.total
            ? `total pesanan berubah menjadi ${formatRupiah(target.total)}`
            : null;
    if (problem) {
      await tx.insert(orderEvent).values({
        orderId: payment.orderId,
        type: "payment_unmatched",
        note: `Dana diterima, ${problem} · perlu ditinjau/refund · ${received}`,
      });
      return "unmatched" as const;
    }

    const now = new Date();
    // A manual proof still in the queue is moot once the order is paid.
    await tx
      .update(paymentAttempt)
      .set({
        status: "rejected",
        reviewNote: `Tidak diperlukan · lunas lewat ${QRIS_AUTO_PAYMENT_METHOD}`,
        reviewedAt: now,
      })
      .where(
        and(eq(paymentAttempt.orderId, payment.orderId), eq(paymentAttempt.status, "pending")),
      );
    await tx
      .update(order)
      .set({ paymentStatus: "paid", paidAt: now, paymentMethod: QRIS_AUTO_PAYMENT_METHOD })
      .where(eq(order.id, payment.orderId));
    await tx.insert(orderEvent).values({
      orderId: payment.orderId,
      type: "payment_approved",
      fromStatus: target.paymentStatus,
      toStatus: "paid",
      note: `Terverifikasi otomatis · ${received}`,
    });
    return "paid" as const;
  });
}
