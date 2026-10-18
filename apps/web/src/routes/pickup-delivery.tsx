import { Link, createFileRoute } from "@tanstack/react-router";
import { ReactLenis } from "lenis/react";
import { MapPin, Truck, type LucideIcon } from "lucide-react";

import { batchCopy } from "@/components/storefront/batch-copy";
import StorefrontFooter from "@/components/storefront/storefront-footer";
import StorefrontNav from "@/components/storefront/storefront-nav";
import { getStorefrontBatch } from "@/functions/products";

export const Route = createFileRoute("/pickup-delivery")({
  head: ({ loaderData }) => ({
    meta: [
      { title: "Pickup & delivery · ubeloom" },
      {
        name: "description",
        content: `Ambil pesanan ubeloom di ${batchCopy(loaderData ?? null).pickupLocation} atau kirim ke alamatmu. Jadwal, alamat, dan ongkir tampil sebelum invoice dibuat.`,
      },
    ],
  }),
  loader: () => getStorefrontBatch(),
  component: PickupDeliveryComponent,
});

type BatchCopy = ReturnType<typeof batchCopy>;

const fulfillmentMethods = (
  batch: BatchCopy,
): {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  details: { label: string; value: string }[];
}[] => [
  {
    icon: MapPin,
    title: "Pickup di kampus",
    subtitle: "Datang sesuai slot yang kamu pilih.",
    details: [
      { label: "LOKASI", value: `${batch.pickupLocation} · detail titik temu di invoice` },
      { label: "JADWAL", value: `${batch.pickupDateLong} · slot aktif dipilih saat checkout` },
      { label: "BIAYA", value: "Tidak ada ongkir" },
      { label: "SAAT SERAH-TERIMA", value: "Tunjukkan invoice; tim mencatat pesanan selesai" },
    ],
  },
  {
    icon: Truck,
    title: "Delivery ke alamatmu",
    subtitle: "Kami kirim dalam jendela waktu yang disepakati.",
    details: [
      { label: "JANGKAUAN", value: "Masukkan alamat untuk cek area layanan" },
      { label: "JADWAL", value: "Pilih jendela kirim yang tersedia saat checkout" },
      { label: "BIAYA", value: "Ongkir dihitung dan terlihat sebelum konfirmasi" },
      {
        label: "SAAT PENGIRIMAN",
        value: "Status berlanjut dari disiapkan ke dikirim lalu terkirim",
      },
    ],
  },
];

const checkoutSteps: { title: string; detail: string }[] = [
  { title: "Pilih produk", detail: "Atur varian & jumlah" },
  { title: "Pilih metode", detail: "Pickup atau delivery" },
  { title: "Cek total", detail: "Ongkir tampil sebelum submit" },
  { title: "Bayar via QRIS", detail: "Tunggu verifikasi admin" },
];

function PickupDeliveryComponent() {
  const batch = batchCopy(Route.useLoaderData());

  return (
    <div className="flex min-h-svh flex-col bg-white font-body text-ink">
      <ReactLenis root />
      <StorefrontNav />
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-6 px-5 pt-7 pb-8 lg:px-16">
        <FulfillmentHero batch={batch} />
        <FulfillmentChoices batch={batch} />
        <CheckoutTiming />
        <FulfillmentNotes batch={batch} />
      </main>
      <StorefrontFooter />
    </div>
  );
}

function FulfillmentHero({ batch }: { batch: BatchCopy }) {
  return (
    <section className="flex flex-col gap-6 lg:min-h-[238px] lg:flex-row lg:items-center lg:gap-9">
      <div className="flex flex-col items-start gap-[13px] lg:flex-1">
        <p className="rounded-full bg-vanilla px-3 py-[7px] font-data text-[10px] font-bold text-deep-ube">
          {batch.open
            ? `PREORDER MASIH DIBUKA · HINGGA ${batch.closesAtShort.replace(" · ", ", ").toUpperCase()}`
            : "PREORDER SEDANG DITUTUP"}
        </p>
        <h1 className="font-display text-[34px]/[1.1] font-bold text-deep-ube lg:text-[41px]/[1.07]">
          Ambil sendiri, atau kami antar.
        </h1>
        <p className="text-sm/[1.45] text-plum">
          Pilih cara menerima lumpia ubi dan minumanmu saat checkout. Jadwal, alamat dan biaya kirim
          ditampilkan sebelum kamu membuat invoice.
        </p>
      </div>
      <img
        src="/images/lumpia-ubi-goreng.webp"
        alt="Lumpia ubi goreng dengan isian ubi ungu"
        width={1122}
        height={1402}
        fetchPriority="high"
        className="h-[200px] w-full rounded-[18px] bg-deep-ube object-cover lg:h-[226px] lg:w-[380px] lg:shrink-0"
      />
    </section>
  );
}

function FulfillmentChoices({ batch }: { batch: BatchCopy }) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-[5px]">
        <p className="font-data text-[10px] font-bold text-ube-pop">PILIH CARA TERIMA PESANAN</p>
        <h2 className="font-display leading-[1.2] text-[25px] font-bold text-ink">
          Dua cara, sama-sama praktis.
        </h2>
      </div>

      <div className="grid gap-[18px] lg:grid-cols-2">
        {fulfillmentMethods(batch).map(({ icon: Icon, title, subtitle, details }) => (
          <article
            key={title}
            className="flex flex-col gap-[13px] rounded-2xl border border-ube-line bg-vanilla p-[21px]"
          >
            <div className="flex items-center gap-2.5">
              <Icon aria-hidden className="size-[22px] shrink-0 text-deep-ube" />
              <h3 className="font-display leading-[1.2] text-[21px] font-bold text-deep-ube">
                {title}
              </h3>
            </div>
            <p className="text-[13px]/4 text-plum">{subtitle}</p>
            <hr className="border-ube-line" />
            <dl className="flex flex-col gap-[13px]">
              {details.map(({ label, value }) => (
                <div key={label} className="flex flex-col gap-[3px]">
                  <dt className="font-data text-[9px]/3 font-bold text-deep-ube">{label}</dt>
                  <dd className="text-xs/[1.35] font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function CheckoutTiming() {
  return (
    <section aria-label="Urutan checkout">
      <ol className="grid grid-cols-2 gap-4 rounded-[14px] border border-ube-line bg-surface px-5 py-[17px] lg:flex lg:justify-between">
        {checkoutSteps.map(({ title, detail }, index) => (
          <li key={title} className="flex flex-col gap-[3px] lg:flex-1">
            <span className="font-data text-[10px]/[13px] font-bold text-ube-pop">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="text-[13px]/4 font-bold text-ink">{title}</span>
            <span className="text-[10px]/[13px] text-plum">{detail}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FulfillmentNotes({ batch }: { batch: BatchCopy }) {
  return (
    <section className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-[26px]">
      <div className="flex flex-col gap-2 lg:flex-1">
        <h2 className="font-display leading-[1.2] text-lg font-bold text-ink">
          Sebelum kamu memesan
        </h2>
        <p className="text-xs/[1.45] text-plum">
          Nomor WhatsApp dipakai untuk urusan pesanan. Pembayaran dinyatakan lunas hanya setelah
          bukti cocok dengan transaksi merchant. Perubahan alamat atau slot setelah invoice dibuat
          perlu bantuan admin.
        </p>
      </div>

      <div className="flex flex-col gap-[9px] rounded-[14px] bg-deep-ube p-[19px] lg:w-[345px] lg:shrink-0">
        <h2 className="font-display leading-[1.2] text-[19px] font-bold text-vanilla">
          Siap pilih caramu?
        </h2>
        <p className="text-[11px] text-[#f6dcea]">
          {batch.open ? "Batch masih dibuka." : "Batch sedang ditutup."} Pilihan metode ada saat
          checkout.
        </p>
        <Link
          to="/menu"
          className="w-fit rounded-full bg-ube-gold px-[15px] py-2.5 text-xs font-bold text-ink transition-colors hover:bg-vanilla"
        >
          Mulai preorder →
        </Link>
      </div>
    </section>
  );
}
