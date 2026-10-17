import { storefrontLinks } from "./links";

// Instagram, WhatsApp, and Kontak have no destinations yet, so they render as text.
export default function StorefrontFooter() {
  return (
    <footer className="bg-deep-ube">
      <div className="flex flex-col gap-[15px] px-[22px] pt-6 pb-7 lg:hidden">
        <p className="font-display text-2xl font-bold text-vanilla">UBELOOM</p>
        <p className="font-body text-xs/[17px] text-lilac">
          Jeda manis dari ubi ungu. Dibuat fresh, dikirim dengan hati.
        </p>
        <nav aria-label="Navigasi footer" className="flex gap-[17px]">
          {storefrontLinks.slice(0, 2).map(({ href, label }) => (
            <a key={href} href={href} className="font-body text-xs font-semibold text-vanilla">
              {label}
            </a>
          ))}
          <span className="font-body text-xs font-semibold text-vanilla">Kontak</span>
        </nav>
        <hr className="border-white/20" />
        <p className="font-data text-[9px] text-lilac">© 2024 UBELOOM · Manisnya punya cerita.</p>
      </div>

      <div className="mx-auto hidden min-h-[188px] max-w-[1280px] flex-col gap-[18px] px-16 py-7 lg:flex">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1.5">
            <p className="font-wordmark text-[22px] font-extrabold text-vanilla">ubeloom</p>
            <p className="font-wordmark text-[11px] text-lilac">Preorder treats, made with care.</p>
          </div>
          <nav aria-label="Navigasi footer" className="flex items-center gap-6">
            {storefrontLinks.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                className="font-wordmark text-xs font-semibold text-vanilla hover:underline"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center justify-between border-t border-white/20 pt-3.5">
          <p className="font-wordmark text-[10px] text-lilac">
            © 2025 ubeloom · Semua hak dilindungi
          </p>
          <p className="flex gap-3 font-wordmark text-[10px] font-semibold text-vanilla">
            <span>Instagram ↗</span>
            <span>WhatsApp ↗</span>
            <span>Hubungi kami</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
