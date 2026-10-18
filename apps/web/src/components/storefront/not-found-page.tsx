import { Link, type LinkProps } from "@tanstack/react-router";

import StorefrontFooter from "./storefront-footer";
import StorefrontNav from "./storefront-nav";

type NotFoundPageProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
  cta?: { to: LinkProps["to"]; label: string };
};

/** Storefront 404; the defaults cover any unknown URL, routes override the copy. */
export default function NotFoundPage({
  eyebrow = "404 / HALAMAN",
  title = "Halaman ini tidak ditemukan.",
  description = "Tautannya mungkin salah ketik atau halamannya sudah dipindahkan.",
  cta = { to: "/", label: "Kembali ke beranda" },
}: NotFoundPageProps) {
  return (
    <div className="flex min-h-svh flex-col bg-white font-body text-ink">
      <StorefrontNav />
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col items-start justify-center gap-4 px-5 py-16 lg:px-16">
        <p className="font-data text-[11px] font-bold text-ube-pop">{eyebrow}</p>
        <h1 className="font-display text-[34px]/[1.1] font-bold text-deep-ube lg:text-[43px]/[1.1]">
          {title}
        </h1>
        <p className="text-[15px]/[1.4] text-plum">{description}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={cta.to}
            className="rounded-full bg-deep-ube px-[22px] py-[13px] text-[15px] font-bold text-vanilla transition-colors hover:bg-ube-pop"
          >
            {cta.label} →
          </Link>
          {cta.to !== "/menu" && (
            <Link
              to="/menu"
              className="rounded-full border border-ube-line px-[22px] py-[13px] text-[15px] font-bold text-deep-ube transition-colors hover:border-ube-pop hover:text-ube-pop"
            >
              Lihat menu
            </Link>
          )}
        </div>
      </main>
      <StorefrontFooter />
    </div>
  );
}
