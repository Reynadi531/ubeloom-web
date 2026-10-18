import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { createMiddleware } from "@tanstack/react-start";
import { Toaster } from "@web-kwu/ui/components/sonner";
import { evlogErrorHandler } from "evlog/nitro/v3";

import { DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE, SITE_NAME, absoluteUrl } from "@/lib/seo";

import appCss from "../index.css?url";

export interface RouterAppContext {}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  server: {
    middleware: [createMiddleware().server(evlogErrorHandler)],
  },

  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: SITE_NAME,
      },
      // Fallbacks; pages override them by name/property through `seo()`.
      { name: "description", content: DEFAULT_DESCRIPTION },
      { name: "theme-color", content: "#7c2961" },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:locale", content: "id_ID" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: absoluteUrl(DEFAULT_OG_IMAGE) },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: absoluteUrl(DEFAULT_OG_IMAGE) },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "icon", type: "image/png", href: "/icon-192.png", sizes: "192x192" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      // Storefront typefaces, shared by every storefront page.
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fredoka:wght@700&family=JetBrains+Mono:wght@400;600;700&family=Manrope:wght@400;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap",
      },
    ],
  }),

  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="id" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Toaster
          richColors
          theme="light"
          style={
            {
              fontFamily: "var(--font-body)",
              "--normal-bg": "var(--color-surface)",
              "--normal-text": "var(--color-ink)",
              "--normal-border": "var(--color-ube-line)",
              "--success-bg": "color-mix(in oklab, var(--color-lilac) 45%, white)",
              "--success-text": "var(--color-deep-ube)",
              "--success-border": "var(--color-lilac)",
              "--info-bg": "var(--color-surface)",
              "--info-text": "var(--color-ube-pop)",
              "--info-border": "var(--color-ube-line)",
              "--warning-bg": "var(--color-vanilla)",
              "--warning-text": "color-mix(in oklab, var(--color-ube-gold) 45%, var(--color-ink))",
              "--warning-border": "var(--color-ube-gold)",
              "--error-bg": "color-mix(in oklab, var(--color-blush-pink) 14%, white)",
              "--error-text": "color-mix(in oklab, #d1335b 80%, var(--color-ink))",
              "--error-border": "var(--color-blush-pink)",
              "--border-radius": "12px",
            } as React.CSSProperties
          }
          toastOptions={{
            classNames: {
              toast: "cn-toast shadow-[0_8px_24px_rgb(124_41_97/0.12)]!",
              title: "font-semibold",
              description: "text-plum!",
            },
          }}
        />
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}
