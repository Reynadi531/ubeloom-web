import { Link } from "@tanstack/react-router";

import StorefrontFooter from "./storefront-footer";
import StorefrontNav from "./storefront-nav";

/** Storefront 404 for unknown or unpublished product slugs. */
export default function ProductNotFound() {
  return (
    <div className="flex min-h-svh flex-col bg-white font-body text-ink">
      <StorefrontNav />
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col items-start justify-center gap-4 px-5 py-16 lg:px-16">
        <p className="font-data text-[11px] font-bold text-ube-pop">404 / MENU</p>
        <h1 className="font-display text-[34px]/[1.1] font-bold text-deep-ube lg:text-[43px]/[1.1]">
          Menu ini tidak ditemukan.
        </h1>
        <p className="text-[15px]/[1.4] text-plum">
          Produknya mungkin sudah tidak dijual atau tautannya salah ketik.
        </p>
        <Link
          to="/menu"
          className="rounded-full bg-deep-ube px-[22px] py-[13px] text-[15px] font-bold text-vanilla transition-colors hover:bg-ube-pop"
        >
          Lihat menu →
        </Link>
      </main>
      <StorefrontFooter />
    </div>
  );
}
