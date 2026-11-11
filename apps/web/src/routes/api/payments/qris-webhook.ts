import { createFileRoute } from "@tanstack/react-router";

import { applyGatewayTransaction } from "@/functions/qris.server";
import { parseGatewayWebhook, qrisGatewayConfig } from "@/lib/qris-gateway.server";

/** The gateway's events are a few hundred bytes; anything larger is not one. */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * Final status (paid or expired) of an automatic QRIS payment, pushed by the gateway.
 * Delivery is at least once and retried until a 2xx, so the handler is idempotent
 * and acknowledges events it has nothing to do for.
 */
export const Route = createFileRoute("/api/payments/qris-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const config = qrisGatewayConfig();
        if (!config) return new Response("Not found", { status: 404 });

        // Signed over the exact bytes, so read them before any parsing.
        const body = Buffer.from(await request.arrayBuffer());
        if (body.length > MAX_BODY_BYTES) return new Response("Payload too large", { status: 413 });

        const event = parseGatewayWebhook(config, request.headers, body);
        if (!event) return new Response("Invalid signature", { status: 401 });

        const result = await applyGatewayTransaction(event.transaction);
        if (result === "unknown" || result === "mismatch") {
          console.error(
            `[qris] webhook ${event.event_id} for ${event.transaction.transaction_id}: ${result}`,
          );
        }
        return Response.json({ received: true, result });
      },
    },
  },
});
