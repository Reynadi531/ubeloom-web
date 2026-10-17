import { Menu, X } from "lucide-react";
import { useState } from "react";

import { storefrontLinks } from "./links";

export default function StorefrontNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="relative border-b border-ube-line bg-white">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5 lg:h-[78px] lg:px-16">
        <a href="/" aria-label="ubeloom beranda" className="flex items-center">
          <img
            src="/images/ubeloom-logo.webp"
            alt="ubeloom"
            width={58}
            height={58}
            className="size-12 lg:size-[58px]"
          />
        </a>

        <nav aria-label="Navigasi utama" className="hidden items-center gap-[34px] lg:flex">
          {storefrontLinks.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="font-body text-[13px] font-semibold text-ink transition-colors hover:text-ube-pop"
            >
              {label}
            </a>
          ))}
        </nav>

        <a
          href="#menu"
          className="hidden rounded-full bg-deep-ube px-[22px] py-[13px] font-body text-[15px] font-bold text-vanilla transition-colors hover:bg-ube-pop lg:inline-flex"
        >
          Pesan sekarang
        </a>

        <button
          type="button"
          aria-label={open ? "Tutup menu" : "Buka menu"}
          aria-expanded={open}
          aria-controls="storefront-mobile-menu"
          onClick={() => setOpen((value) => !value)}
          className="flex size-[38px] items-center justify-center rounded-full bg-vanilla text-deep-ube lg:hidden"
        >
          {open ? <X className="size-[19px]" /> : <Menu className="size-[19px]" />}
        </button>
      </div>

      {open && (
        <nav
          id="storefront-mobile-menu"
          aria-label="Navigasi utama"
          className="absolute inset-x-0 top-full z-20 flex flex-col gap-1 border-b border-ube-line bg-white px-5 pt-2 pb-5 lg:hidden"
        >
          {storefrontLinks.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="py-2.5 font-body text-[15px] font-semibold text-ink"
            >
              {label}
            </a>
          ))}
          <a
            href="#menu"
            onClick={() => setOpen(false)}
            className="mt-2 inline-flex w-fit rounded-full bg-deep-ube px-[22px] py-[13px] font-body text-[15px] font-bold text-vanilla"
          >
            Pesan sekarang
          </a>
        </nav>
      )}
    </header>
  );
}
