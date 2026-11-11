/**
 * Sumopod managed payment (QRIS): creating payments and verifying webhooks.
 * https://docs.sumopod.com/guides/managed-payment/create-managed-payment
 *
 * The public docs list field names but not full response or webhook schemas, so
 * parsing accepts both a flat body and one wrapped in `data`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import type { GatewayNotification, GatewayOutcome } from "@web-kwu/shop/payments";

import { ENV } from "@/env.server";

/** Svix rejects deliveries older than this to stop replays; same tolerance here. */
const WEBHOOK_TOLERANCE_S = 5 * 60;

export const isSumopodEnabled = () => Boolean(ENV.SUMOPOD_API_KEY);

type Json = Record<string, unknown>;

const asObject = (value: unknown): Json | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : undefined;

const asString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const asNumber = (value: unknown) => {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? Math.round(number) : undefined;
};

/** Payload fields live either at the top level or under `data`. */
const unwrap = (body: Json) => ({ ...body, ...asObject(body.data) });

export type CreatedSumopodPayment = {
  paymentUrl: string;
  providerPaymentId?: string;
};

export async function createSumopodPayment(input: {
  reference: string;
  amount: number;
  /** Omitted → Sumopod falls back to the default return URLs from its dashboard. */
  successUrl?: string;
  cancelUrl?: string;
}): Promise<CreatedSumopodPayment> {
  const apiKey = ENV.SUMOPOD_API_KEY;
  if (!apiKey) throw new Error("Pembayaran QRIS otomatis belum diaktifkan.");

  let response: Response;
  try {
    response = await fetch(new URL("/api/v1/payments", ENV.SUMOPOD_API_URL), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify({
        order_id: input.reference,
        amount: input.amount,
        currency: "IDR",
        payment_method_type_code: "QRIS",
        success_return_url: input.successUrl,
        cancel_return_url: input.cancelUrl,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error("[sumopod] create payment request failed", error);
    throw new Error("Layanan pembayaran tidak merespons. Coba lagi sebentar.");
  }

  const body = asObject(await response.json().catch(() => undefined)) ?? {};
  if (!response.ok) {
    console.error("[sumopod] create payment rejected", response.status, body);
    throw new Error("Gagal membuat pembayaran QRIS. Coba lagi atau hubungi bantuan.");
  }

  const data = unwrap(body);
  const paymentUrl = asString(data.payment_link_url);
  if (!paymentUrl) {
    console.error("[sumopod] create payment response has no payment_link_url", body);
    throw new Error("Gagal membuat pembayaran QRIS. Coba lagi atau hubungi bantuan.");
  }
  return {
    paymentUrl,
    providerPaymentId: asString(data.payment_id) ?? asString(data.id),
  };
}

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Checks a webhook delivery: Svix signature when a `whsec_` secret is configured,
 * otherwise the static `X-Webhook-Token`. Fails closed when neither is configured.
 */
export function verifySumopodWebhook(headers: Headers, rawBody: string) {
  const secret = ENV.SUMOPOD_WEBHOOK_SECRET;
  if (secret) {
    const id = headers.get("svix-id");
    const timestamp = headers.get("svix-timestamp");
    const signatures = headers.get("svix-signature");
    if (!id || !timestamp || !signatures) return false;

    const sentAt = Number(timestamp);
    if (!Number.isFinite(sentAt)) return false;
    if (Math.abs(Date.now() / 1000 - sentAt) > WEBHOOK_TOLERANCE_S) return false;

    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const expected = createHmac("sha256", key)
      .update(`${id}.${timestamp}.${rawBody}`)
      .digest("base64");
    // Header holds space-separated "v1,<base64>" entries (several during secret rotation).
    return signatures
      .split(" ")
      .some((entry) => entry.startsWith("v1,") && safeEqual(entry.slice(3), expected));
  }

  const token = ENV.SUMOPOD_WEBHOOK_TOKEN;
  if (token) {
    const received = headers.get("x-webhook-token");
    return received !== null && safeEqual(received, token);
  }

  console.error("[sumopod] webhook received but no SUMOPOD_WEBHOOK_SECRET/TOKEN is configured");
  return false;
}

const EVENT_OUTCOMES: Record<string, GatewayOutcome> = {
  "payment.completed": "completed",
  "payment.failed": "failed",
  "payment.expired": "expired",
};

const STATUS_OUTCOMES: Record<string, GatewayOutcome> = {
  completed: "completed",
  paid: "completed",
  success: "completed",
  succeeded: "completed",
  settled: "completed",
  failed: "failed",
  expired: "expired",
};

/** Maps a verified webhook body to a settlement; null when it is not a payment outcome. */
export function parseSumopodWebhook(rawBody: string): GatewayNotification | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const body = asObject(parsed);
  if (!body) return null;
  const data = unwrap(body);

  const eventName = asString(body.type) ?? asString(body.event) ?? asString(body.event_type);
  const status = asString(data.status)?.toLowerCase();
  const outcome =
    (eventName && EVENT_OUTCOMES[eventName.toLowerCase()]) ?? (status && STATUS_OUTCOMES[status]);
  const reference = asString(data.order_id);
  if (!outcome || !reference) return null;

  const paidAt = asString(data.paid_at);
  const paidDate = paidAt ? new Date(paidAt) : undefined;
  return {
    reference,
    outcome,
    providerPaymentId: asString(data.payment_id) ?? asString(data.id),
    amount: asNumber(data.amount),
    fee: asNumber(data.fee),
    netAmount: asNumber(data.net_amount),
    paidAt: paidDate && !Number.isNaN(paidDate.getTime()) ? paidDate : undefined,
  };
}
