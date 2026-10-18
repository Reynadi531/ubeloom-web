import { createFileRoute } from "@tanstack/react-router";
import { product } from "@web-kwu/db/schema/shop";
import { asc, eq } from "drizzle-orm";

import { absoluteUrl } from "@/lib/seo";
import { db } from "@/services";

/** Indexable storefront pages; checkout, invoices, sign-in and the dashboard are left out. */
const staticPaths = ["/", "/menu", "/cara-pesan", "/pickup-delivery"];

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (char) => `&#${char.charCodeAt(0)};`);

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const products = await db
          .select({ slug: product.slug, updatedAt: product.updatedAt })
          .from(product)
          .where(eq(product.published, true))
          .orderBy(asc(product.sortOrder));

        const entries = [
          ...staticPaths.map((path) => ({ loc: absoluteUrl(path), lastmod: undefined })),
          ...products.map(({ slug, updatedAt }) => ({
            loc: absoluteUrl(`/menu/${encodeURIComponent(slug)}`),
            lastmod: updatedAt.toISOString(),
          })),
        ];

        const body = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...entries.map(
            ({ loc, lastmod }) =>
              `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`,
          ),
          "</urlset>",
          "",
        ].join("\n");

        return new Response(body, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
