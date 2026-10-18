import { createFileRoute } from "@tanstack/react-router";

import { absoluteUrl } from "@/lib/seo";

/** Served dynamically so the sitemap line carries the absolute public origin. */
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(
          [
            "User-agent: *",
            "Disallow: /api/",
            "Disallow: /dashboard",
            "",
            `Sitemap: ${absoluteUrl("/sitemap.xml")}`,
            "",
          ].join("\n"),
          {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "public, max-age=3600",
            },
          },
        ),
    },
  },
});
