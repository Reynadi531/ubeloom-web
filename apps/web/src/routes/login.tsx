import { Link, createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import SignInForm from "@/components/sign-in-form";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Masuk · ubeloom" }],
  }),
  component: LoginComponent,
});

function LoginComponent() {
  return (
    <div className="flex min-h-svh bg-white font-body text-ink">
      <BrandPanel />
      <main className="flex min-h-svh flex-1 flex-col items-center justify-between gap-10 px-5 py-8 sm:px-10 lg:px-[84px] lg:py-[42px]">
        <div className="flex w-full items-center justify-between lg:justify-end">
          <Link to="/" aria-label="ubeloom beranda" className="lg:hidden">
            <img
              src="/images/ubeloom-logo.webp"
              alt="ubeloom"
              width={48}
              height={48}
              className="size-12"
            />
          </Link>
          <Link
            to="/"
            className="text-[13px] font-bold whitespace-pre text-deep-ube transition-colors hover:text-ube-pop"
          >
            <span aria-hidden>{"←  "}</span>
            Kembali ke toko
          </Link>
        </div>

        <div className="flex w-full max-w-[440px] flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="font-data text-[11px] font-bold text-ube-pop">
              AKSES TERBATAS&nbsp;&nbsp;/&nbsp;&nbsp;ADMIN &amp; REVIEWER
            </p>
            <h1 className="font-display text-[30px]/[1.2] font-bold text-ink lg:text-[34px]">
              Masuk ke ruang kerja
            </h1>
            <p className="text-sm/[1.45] text-plum">
              Gunakan akun tim yang sudah didaftarkan. Akses reviewer bersifat baca-saja.
            </p>
          </div>

          <SignInForm />

          <div className="flex flex-col gap-[5px] rounded-[10px] bg-vanilla px-4 py-[13px]">
            <p className="text-xs font-bold text-ink">Belum punya akses?</p>
            <p className="text-[11px]/[1.4] text-plum">
              Hubungi administrator tim untuk undangan atau pemulihan akun. Jangan bagikan kata
              sandi melalui WhatsApp.
            </p>
          </div>
        </div>

        <footer className="flex w-full flex-wrap items-center justify-between gap-2 border-t border-ube-line pt-4 text-[11px] text-plum">
          <span className="flex items-center gap-[7px]">
            <Lock className="size-3.5 text-deep-ube" />
            Koneksi aman · akses sesuai peran
          </span>
          <span>© ubeloom 2026</span>
        </footer>
      </main>
    </div>
  );
}

function BrandPanel() {
  return (
    <aside className="hidden w-[520px] shrink-0 flex-col justify-between gap-10 bg-vanilla px-12 py-10 lg:flex">
      <div className="flex flex-col gap-[9px]">
        <Link to="/" aria-label="ubeloom beranda" className="w-fit">
          <img
            src="/images/ubeloom-logo.webp"
            alt="ubeloom"
            width={74}
            height={74}
            className="size-[74px]"
          />
        </Link>
        <p className="font-data text-[11px] font-bold text-deep-ube">RUANG KERJA TIM</p>
      </div>

      <div className="flex flex-col gap-[18px]">
        <h2 className="font-display text-[43px]/[1.08] font-bold text-deep-ube">
          Semua pesanan, satu tempat.
        </h2>
        <p className="text-base/[1.5] text-plum">
          Pantau preorder yang masih dibuka, periksa pembayaran, siapkan pesanan pickup dan
          delivery, lalu kelola undian dengan jejak yang jelas.
        </p>
        <img
          src="/images/lumpia-cone.webp"
          alt="Tangan memegang cone kertas berisi lumpia ubi dengan saus ubi ungu"
          width={1000}
          height={1000}
          className="h-[200px] w-[278px] rounded-2xl bg-deep-ube object-cover"
        />
      </div>

      <div className="flex items-center gap-[9px]">
        <span className="size-2 rounded-full bg-ube-pop" />
        <p className="font-data text-[11px] font-bold text-deep-ube">
          BATCH OKTOBER · PREORDER DIBUKA
        </p>
      </div>
    </aside>
  );
}
