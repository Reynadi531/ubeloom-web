import { createFileRoute } from "@tanstack/react-router";
import { ReactLenis } from "lenis/react";
import { PackageCheck, ScanLine } from "lucide-react";

import { batchCopy } from "@/components/storefront/batch-copy";
import PreorderInvitation from "@/components/storefront/preorder-invitation";
import StorefrontFooter from "@/components/storefront/storefront-footer";
import StorefrontNav from "@/components/storefront/storefront-nav";
import { getStorefront } from "@/functions/products";

export const Route = createFileRoute("/cara-pesan")({
  head: () => ({
    meta: [
      { title: "Cara pesan · ubeloom" },
      {
        name: "description",
        content:
          "Alur preorder ubeloom tanpa akun: pilih menu, tentukan pickup atau delivery, terima invoice, bayar via QRIS, lalu tunggu verifikasi.",
      },
    ],
  }),
  loader: () => getStorefront(),
  component: CaraPesanComponent,
});

type BatchCopy = ReturnType<typeof batchCopy>;

const flowSummary = ["Pilih menu", "Pickup / delivery", "Invoice", "QRIS & bukti", "Diproses"];

/** "A", "A atau B", "A, B, atau C"; generic wording when the menu is empty. */
const listMenu = (names: string[]) => {
  if (names.length === 0) return "menu favoritmu";
  if (names.length === 1) return names[0]!;
  const last = names.at(-1)!;
  const rest = names.slice(0, -1).join(", ");
  return names.length === 2 ? `${rest} atau ${last}` : `${rest}, atau ${last}`;
};

const orderSteps = (
  productNames: string[],
  batch: BatchCopy,
): { title: string; description: string }[] => [
  {
    title: "Pilih menu & jumlah",
    description: `Masukkan ${listMenu(productNames)} ke preorder. Lanjut sebagai tamu tanpa membuat akun.`,
  },
  {
    title: "Tentukan cara menerima",
    description: `Isi nama dan WhatsApp aktif, lalu pilih pickup di ${batch.pickupLocation} atau delivery. Untuk delivery, isi alamat; ongkir dan total tampil sebelum konfirmasi.`,
  },
  {
    title: "Periksa pesanan, terima invoice",
    description:
      "Cek produk, jumlah, cara menerima, serta total akhir. Setelah pesanan dibuat, simpan invoice dan tautan status pribadi yang diberikan.",
  },
  {
    title: "Bayar QRIS & unggah bukti",
    description:
      "Bayar sesuai nominal invoice paling lambat 24 jam setelah memesan atau sebelum batas batch. Unggah bukti pembayaran; tim meninjau dulu sebelum status menjadi lunas.",
  },
  {
    title: "Tunggu verifikasi & nikmati",
    description:
      "Setelah pembayaran disetujui, pesanan diproses. Pantau status pesanan, lalu ambil saat jadwal pickup atau tunggu delivery ke alamatmu.",
  },
];

const stepNumber = (index: number) => String(index + 1).padStart(2, "0");

function CaraPesanComponent() {
  const { batch: current, products } = Route.useLoaderData();
  const batch = batchCopy(current);
  const steps = orderSteps(
    products.map((item) => item.name),
    batch,
  );

  return (
    <div className="flex min-h-svh flex-col bg-white font-body text-ink">
      <ReactLenis root />
      <StorefrontNav />
      <main className="flex-1">
        <OrderingGuideHero />
        <FlowSummary />
        <PreorderGuide batch={batch} steps={steps} />
        <PreorderInvitation
          title="Siap untuk jeda yang lebih manis?"
          description={
            batch.open
              ? `Batch preorder masih dibuka hingga ${batch.closesAt}. Pilih menu sekarang, bayar setelah invoice terbit.`
              : "Batch preorder sedang ditutup. Lihat menu sambil menunggu batch berikutnya."
          }
          href="/menu"
        />
      </main>
      <StorefrontFooter />
    </div>
  );
}

function OrderingGuideHero() {
  return (
    <section className="mx-auto flex max-w-[1280px] flex-col gap-6 px-5 py-8 lg:h-[286px] lg:flex-row lg:items-center lg:gap-10 lg:px-16 lg:py-0">
      <div className="flex flex-col gap-[15px] lg:w-[650px] lg:shrink-0">
        <p className="text-[11px] font-bold text-ube-pop">CARA PESAN / TANPA AKUN</p>
        <h1 className="font-display text-[34px]/[1.2] font-bold text-deep-ube lg:text-[43px]/[1.4]">
          Dari pilih menu sampai siap dinikmati.
        </h1>
        <p className="text-[15px]/[1.4] text-plum">
          Preorder ubeloom dibuat sederhana: pilih favoritmu, tentukan cara menerima, bayar lewat
          QRIS, lalu tunggu kabar dari kami.
        </p>
      </div>
      <img
        src="/images/lumpia-cone.webp"
        alt="Tangan memegang cone kertas berisi lumpia ubi dengan saus ubi ungu"
        width={1000}
        height={1000}
        fetchPriority="high"
        className="h-[200px] w-full rounded-[20px] bg-deep-ube object-cover lg:h-[212px] lg:flex-1"
      />
    </section>
  );
}

function FlowSummary() {
  return (
    <section aria-label="Ringkasan alur" className="border-y border-ube-line bg-vanilla">
      <ol className="mx-auto grid max-w-[1280px] grid-cols-2 gap-x-[18px] gap-y-3 px-5 py-5 sm:grid-cols-3 lg:flex lg:h-16 lg:items-center lg:px-16 lg:py-0">
        {flowSummary.map((label, index) => (
          <li key={label} className="flex items-center gap-2 lg:flex-1">
            <span className="text-[11px] font-bold text-ube-pop">{stepNumber(index)}</span>
            <span className="text-xs font-bold text-deep-ube">{label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PreorderGuide({
  batch,
  steps,
}: {
  batch: BatchCopy;
  steps: ReturnType<typeof orderSteps>;
}) {
  return (
    <section className="mx-auto flex max-w-[1280px] flex-col gap-6 px-5 py-8 lg:px-16 lg:py-[42px]">
      <div className="flex flex-col gap-[5px]">
        <p className="text-[11px] font-bold text-ube-pop">02 / LANGKAH DEMI LANGKAH</p>
        <h2 className="font-display leading-[1.2] text-[27px] font-bold text-deep-ube lg:text-[32px]">
          Begini alur pesananmu.
        </h2>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-[42px]">
        <ol className="flex flex-col lg:flex-1">
          {steps.map(({ title, description }, index) => (
            <li
              key={title}
              className="flex gap-4 border-b border-ube-line py-[17px] lg:min-h-[104px] lg:gap-[18px]"
            >
              <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-vanilla text-sm font-bold text-deep-ube">
                {stepNumber(index)}
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-[17px] font-bold text-deep-ube lg:text-[19px]">{title}</h3>
                <p className="text-sm/[1.4] text-plum">{description}</p>
              </div>
            </li>
          ))}
        </ol>

        <aside className="flex flex-col gap-[15px] lg:w-[326px] lg:shrink-0">
          <div className="flex flex-col gap-[13px] rounded-2xl border border-ube-line bg-vanilla p-[22px]">
            <PackageCheck aria-hidden className="size-[26px] text-deep-ube" />
            <h3 className="text-[22px] font-bold text-deep-ube">Pilih yang paling pas.</h3>
            <p className="text-sm/[1.4] text-plum">
              Pickup: {batch.pickupDateLong} di {batch.pickupLocation}. Delivery: isi alamat saat
              checkout dan lihat biaya kirim sebelum memesan.
            </p>
          </div>

          <div className="flex flex-col gap-[13px] rounded-2xl bg-deep-ube p-[22px]">
            <ScanLine aria-hidden className="size-[26px] text-ube-gold" />
            <h3 className="text-[22px] font-bold text-vanilla">Bukti dikirim ≠ lunas.</h3>
            <p className="text-sm/[1.4] text-vanilla">
              Invoice terbit bukan tanda pembayaran berhasil. Setelah bukti QRIS diunggah, status
              “Dalam peninjauan” hingga admin memverifikasi. Jangan bayar dua kali sebelum transaksi
              dicek.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 rounded-2xl border border-ube-line bg-surface p-[22px]">
            <h3 className="text-[19px] font-bold text-deep-ube">Simpan tautan statusmu</h3>
            <p className="text-sm/[1.4] text-plum">
              Gunakan tautan pribadi dari invoice untuk mengikuti pembaruan pesanan. Jangan bagikan
              kepada orang lain.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
