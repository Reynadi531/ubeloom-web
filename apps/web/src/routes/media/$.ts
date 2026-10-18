import { createFileRoute } from "@tanstack/react-router";

import { productImageKeyPattern, qrisImageKeyPattern } from "@/lib/product-images";
import { storage } from "@/services";

/**
 * Streams public product photos and the QRIS code from the private bucket. Only
 * `products/` and `qris/` keys are served, so payment proofs stay reachable through presigned URLs alone. Keys are
 * random and never rewritten, so responses are cached as immutable.
 */
export const Route = createFileRoute("/media/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const key = params._splat ?? "";
        if (!productImageKeyPattern.test(key) && !qrisImageKeyPattern.test(key))
          return new Response("Not found", { status: 404 });

        const object = await storage.getObject(key);
        if (!object) return new Response("Not found", { status: 404 });

        const headers = new Headers({
          "Content-Type": object.contentType ?? "application/octet-stream",
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        });
        if (object.contentLength != null) {
          headers.set("Content-Length", String(object.contentLength));
        }
        if (object.etag) headers.set("ETag", object.etag);
        return new Response(object.body, { headers });
      },
    },
  },
});
