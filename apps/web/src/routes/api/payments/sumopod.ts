import { createFileRoute } from "@tanstack/react-router";
import { settleGatewayPayment } from "@web-kwu/shop/payments";

import { parseSumopodWebhook, verifySumopodWebhook } from "@/lib/sumopod.server";
import { db } from "@/services";

/**
 * Sumopod managed payment webhook (payment.completed / failed / expired). Must answer
 * 2xx within 10 s or Sumopod marks the delivery failed; unknown or irrelevant events
 * are acknowledged so they are not retried forever.
 */
export const Route = createFileRoute("/api/payments/sumopod")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        if (!verifySumopodWebhook(request.headers, rawBody)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const event = parseSumopodWebhook(rawBody);
        if (!event) return Response.json({ received: true, ignored: true });

        try {
          const { result } = await settleGatewayPayment(db, event);
          if (result !== "paid" && result !== "duplicate") {
            console.warn(`[sumopod] webhook ${event.reference} → ${result}`);
          }
          return Response.json({ received: true, result });
        } catch (error) {
          // 5xx lets Sumopod retry the delivery.
          console.error(`[sumopod] settling ${event.reference} failed`, error);
          return new Response("Settlement failed", { status: 500 });
        }
      },
    },
  },
});
