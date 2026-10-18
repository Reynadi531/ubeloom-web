import { Link } from "@tanstack/react-router";
import { LockKeyhole } from "lucide-react";

/** Top navigation of private customer pages (invoice): no order CTA, a privacy pill instead. */
export default function PrivateNav() {
  return (
    <header className="border-b border-ube-line bg-white print:hidden">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-5 lg:h-[72px] lg:px-16">
        <Link to="/" aria-label="ubeloom beranda" className="flex items-center">
          <img
            src="/images/ubeloom-logo.webp"
            alt="ubeloom"
            width={56}
            height={56}
            className="size-12 lg:size-14"
          />
        </Link>

        <nav aria-label="Navigasi utama" className="hidden items-center gap-[30px] md:flex">
          {(
            [
              { to: "/menu", label: "Menu" },
              { to: "/cara-pesan", label: "Cara pesan" },
              { to: "/pickup-delivery", label: "Bantuan" },
            ] as const
          ).map(({ to, label }) => (
            <Link
              key={label}
              to={to}
              className="font-body text-sm font-semibold text-plum transition-colors hover:text-ube-pop"
            >
              {label}
            </Link>
          ))}
        </nav>

        <p className="flex items-center gap-[7px] rounded-full bg-vanilla px-[13px] py-[9px] font-body text-xs font-bold text-deep-ube">
          <LockKeyhole aria-hidden className="size-[15px]" />
          Tautan privat
        </p>
      </div>
    </header>
  );
}
