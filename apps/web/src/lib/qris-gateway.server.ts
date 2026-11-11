/**
 * Client for the QRIS gateway behind automatic payments: it issues a dynamic QR for
 * an amount plus a unique code, watches the merchant feed, and reports the final
 * status through a signed webhook.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { ENV } from "@/env.server";

export const QRIS_WEBHOOK_PATH = "/api/payments/qris-webhook";

const REQUEST_TIMEOUT_MS = 10_000;
/** Webhooks older or newer than this are rejected as replays. */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export type QrisGatewayConfig = {
  url: string;
  apiKey: string;
  webhookSecret: string;
  webhookUrl: string;
};

/** Null until the gateway URL, API key and webhook secret are all configured. */
export function qrisGatewayConfig(): QrisGatewayConfig | null {
  const {
    QRIS_GATEWAY_URL: url,
    QRIS_GATEWAY_API_KEY: apiKey,
    QRIS_GATEWAY_WEBHOOK_SECRET: webhookSecret,
  } = ENV;
  if (!url || !apiKey || !webhookSecret) return null;
  return {
    url,
    apiKey,
    webhookSecret,
    webhookUrl: new URL(
      QRIS_WEBHOOK_PATH,
      ENV.QRIS_GATEWAY_WEBHOOK_ORIGIN || ENV.BETTER_AUTH_URL,
    ).toString(),
  };
}

const transactionSchema = z.object({
  transaction_id: z.string().min(1),
  amount: z.number().int(),
  unique_code: z.number().int(),
  total_amount: z.number().int(),
  qris: z.string().min(1),
  status: z.enum(["pending", "paid", "expired"]),
  provider_transaction_id: z.string().optional(),
  expires_at: z.coerce.date(),
});

export type GatewayTransaction = z.output<typeof transactionSchema>;

const transactionResponseSchema = z.object({ transaction: transactionSchema });

const webhookEventSchema = z.object({
  event_id: z.string().min(1),
  type: z.enum(["transaction.paid", "transaction.expired"]),
  transaction: transactionSchema,
});

/** A non-2xx gateway answer; `status` 503 means its payment session is not ready. */
export class QrisGatewayError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request(config: QrisGatewayConfig, path: string, init?: RequestInit) {
  const response = await fetch(new URL(path, config.url), {
    ...init,
    headers: { "X-API-Key": config.apiKey, ...init?.headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const detail =
      body && typeof body === "object" && "error" in body ? String(body.error) : "unknown error";
    throw new QrisGatewayError(response.status, `QRIS gateway ${response.status}: ${detail}`);
  }
  return transactionResponseSchema.parse(await response.json()).transaction;
}

/**
 * Creates the payment, or returns the existing one when `transactionId` was already
 * created with the same amount (the gateway is idempotent per ID).
 */
export function createGatewayTransaction(
  config: QrisGatewayConfig,
  data: { transactionId: string; amount: number },
) {
  return request(config, "/api/v1/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transaction_id: data.transactionId,
      amount: data.amount,
      webhook_url: config.webhookUrl,
    }),
  });
}

export function getGatewayTransaction(config: QrisGatewayConfig, transactionId: string) {
  return request(config, `/api/v1/transactions/${encodeURIComponent(transactionId)}`);
}

/**
 * Verifies `X-Webhook-Signature` (HMAC-SHA256 over "<timestamp>.<raw body>") and the
 * timestamp's freshness, then parses the event. Null when anything fails to check out.
 */
export function parseGatewayWebhook(config: QrisGatewayConfig, headers: Headers, body: Buffer) {
  const timestamp = headers.get("x-webhook-timestamp") ?? "";
  const signature = headers.get("x-webhook-signature") ?? "";
  if (!/^\d{1,12}$/.test(timestamp) || !/^sha256=[0-9a-f]{64}$/.test(signature)) return null;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return null;

  const expected = createHmac("sha256", config.webhookSecret)
    .update(`${timestamp}.`)
    .update(body)
    .digest();
  const given = Buffer.from(signature.slice("sha256=".length), "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    return webhookEventSchema.parse(JSON.parse(body.toString("utf8")));
  } catch {
    return null;
  }
}
