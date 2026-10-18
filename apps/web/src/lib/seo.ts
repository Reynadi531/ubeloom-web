import { ENV } from "@/env";

export const SITE_NAME = "ubeloom";
export const DEFAULT_DESCRIPTION =
  "Lumpia ubi hangat dan minuman segar. Preorder sekarang, lalu pilih pickup atau delivery saat checkout.";
/** 1200×630 card used when a page has no image of its own. */
export const DEFAULT_OG_IMAGE = "/images/og-default.jpg";
export const LOGO_IMAGE = "/images/ubeloom-logo.webp";

/** Absolute URL on the public origin; crawlers and link previews ignore relative URLs. */
export const absoluteUrl = (path: string) => new URL(path, ENV.SITE_URL).href;

interface SeoOptions {
  title: string;
  description: string;
  /** Pathname of the canonical URL, e.g. "/menu". */
  path: string;
  /** Path or absolute URL of the share image; defaults to the brand card. */
  image?: string;
  imageAlt?: string;
  type?: "website" | "product";
}

/**
 * Title, description, canonical link and Open Graph / Twitter tags for an indexable page.
 * Spread `meta` and `links` into the route's `head`.
 */
export function seo({ title, description, path, image, imageAlt, type = "website" }: SeoOptions) {
  const url = absoluteUrl(path);
  const ogImage = image ? absoluteUrl(image) : absoluteUrl(DEFAULT_OG_IMAGE);
  const alt = imageAlt ?? title;

  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:type", content: type },
      { property: "og:url", content: url },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:image", content: ogImage },
      { property: "og:image:alt", content: alt },
      // Dimensions are only known for the brand card.
      ...(image
        ? []
        : [
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
          ]),
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: ogImage },
      { name: "twitter:image:alt", content: alt },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

/**
 * Structured data as a head `scripts` entry. `<` is escaped so text from the database
 * cannot close the script tag.
 */
export const jsonLd = (data: Record<string, unknown>) => ({
  type: "application/ld+json",
  children: JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c"),
});

/** Pages that must stay out of search results (private links, admin, sign-in). */
export const noindex = { name: "robots", content: "noindex, nofollow" };
