import { Link, type LinkProps, createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BadgeCheck,
  ChevronDown,
  Clock3,
  type LucideIcon,
  ScanEye,
  Store,
  Truck,
} from "lucide-react";

export const Route = createFileRoute("/_auth/dashboard/")({
  head: () => ({
    meta: [{ title: "Ringkasan · ubeloom" }],
  }),
  component: DashboardComponent,
});

// Sample data until orders and batches live in the database.
const activeBatch = {
  name: "Batch Oktober 2026",
  deadline: "Tutup preorder 22 Okt · 20.00 WIB  /  Pickup & delivery tersedia",
  activeOrders: 54,
};

const metrics: { label: string; value: number; note: string; icon: LucideIcon }[] = [
  { label: "LUNAS", value: 42, note: "Siap diproses", icon: BadgeCheck },
  { label: "MENUNGGU BAYAR", value: 12, note: "Invoice aktif", icon: Clock3 },
  { label: "BUKTI DIREVIEW", value: 7, note: "Perlu verifikasi", icon: ScanEye },
  { label: "SIAP DIKIRIM", value: 6, note: "Menunggu kurir", icon: Truck },
];

const orderGrowth: { day: string; total: number }[] = [
  { day: "16 Okt", total: 8 },
  { day: "17 Okt", total: 15 },
  { day: "18 Okt", total: 23 },
  { day: "19 Okt", total: 31 },
  { day: "20 Okt", total: 42 },
  { day: "21 Okt", total: 54 },
];

const actions: { count: number; title: string; description: string; to: LinkProps["to"] }[] = [
  {
    count: 7,
    title: "Verifikasi bukti bayar",
    description: "Periksa kecocokan nominal sebelum pesanan masuk produksi.",
    to: "/dashboard/verifikasi-bayar",
  },
  {
    count: 12,
    title: "Tindak lanjut pembayaran",
    description: "Invoice menunggu pembayaran pelanggan.",
    to: "/dashboard/pesanan",
  },
  {
    count: 6,
    title: "Serahkan ke kurir",
    description: "Pesanan lunas siap beralih ke dalam perjalanan.",
    to: "/dashboard/produksi-kirim",
  },
];

const publishedProducts: { slug: string; name: string; price: string; image: string }[] = [
  {
    slug: "lumpia-ubi-goreng",
    name: "Lumpia Ubi Goreng",
    price: "Rp 28.000",
    image: "/images/lumpia-ubi-goreng.webp",
  },
  {
    slug: "sparkling-starfruit",
    name: "Sparkling Starfruit",
    price: "Rp 16.000",
    image: "/images/sparkling-starfruit.webp",
  },
];

const fulfillment: { label: string; count: number; detail: string; icon: LucideIcon }[] = [
  { label: "PICKUP TERJADWAL", count: 23, detail: "Sabtu · 10.00–15.00", icon: Store },
  { label: "PERLU DIKIRIM", count: 19, detail: "6 siap diserahkan kurir", icon: Truck },
];

const cardClassName = "rounded-xl border border-ube-line";

function DashboardComponent() {
  const { session } = Route.useRouteContext();
  const firstName = session.user.name.split(" ")[0];

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 px-5 pt-[88px] pb-7 lg:px-8 lg:pt-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-bold tracking-[1.2px] whitespace-pre text-ube-pop">
            RUANG KERJA / RINGKASAN
          </p>
          <h1 className="font-display text-[30px]/[1.2] font-bold text-ink">
            Selamat datang, {firstName}.
          </h1>
          <p className="text-xs text-plum">
            Lihat yang perlu ditindaklanjuti untuk batch preorder aktif.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className="flex items-center gap-3 rounded-lg border border-ube-line px-3 py-2.5 text-[11px] font-semibold text-ink transition-colors hover:bg-vanilla"
          >
            {activeBatch.name}
            <ChevronDown className="size-3.5 text-plum" />
          </button>
          <Link
            to="/dashboard/pesanan"
            className="flex items-center gap-[7px] rounded-lg bg-deep-ube px-[15px] py-[11px] text-[11px] font-bold text-white transition-colors hover:bg-ube-pop"
          >
            Lihat pesanan
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </div>

      <section className="flex flex-wrap items-center justify-between gap-6 rounded-[15px] bg-deep-ube px-[29px] py-[23px] lg:min-h-[164px]">
        <div className="flex max-w-[540px] flex-col gap-[9px]">
          <p className="text-[10px] font-bold tracking-[1.1px] whitespace-pre text-[#ffd6ed]">
            ● PREORDER DIBUKA
          </p>
          <h2 className="font-display text-[27px]/[1.2] font-bold text-white">
            {activeBatch.name}
          </h2>
          <p className="text-xs whitespace-pre-wrap text-[#f6e8f1]">{activeBatch.deadline}</p>
        </div>
        <div className="flex flex-col items-end gap-[3px]">
          <p className="font-display text-[43px]/none font-bold text-white">
            {activeBatch.activeOrders}
          </p>
          <p className="text-[10px] font-bold tracking-[1px] text-[#f5dcec]">PESANAN AKTIF</p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map(({ label, value, note, icon: Icon }) => (
          <div
            key={label}
            className={`${cardClassName} flex flex-col gap-[7px] rounded-[11px] bg-surface px-[17px] py-[15px]`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9px] font-bold tracking-[0.7px] text-plum">{label}</p>
              <Icon className="size-4 shrink-0 text-deep-ube" />
            </div>
            <p className="font-display text-[26px]/[1.2] font-bold text-deep-ube">{value}</p>
            <p className="text-[10px] text-plum">{note}</p>
          </div>
        ))}
      </section>

      <OrderGrowthChart />

      <div className="grid gap-[18px] xl:grid-cols-[616fr_368fr]">
        <section className={`${cardClassName} flex flex-col gap-[15px] px-[22px] py-5`}>
          <CardHeading
            title="Perlu tindakan"
            subtitle="Prioritas operasional untuk batch ini"
            link="Lihat antrean"
            to="/dashboard/verifikasi-bayar"
          />
          {actions.map(({ count, title, description, to }) => (
            <Link
              key={title}
              to={to}
              className="group flex items-center gap-[13px] border-t border-ube-line pt-3"
            >
              <span className="flex size-[39px] shrink-0 items-center justify-center rounded-[9px] bg-[#f6eaf2] font-display text-[17px] font-bold text-deep-ube">
                {count}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-xs font-bold text-ink group-hover:text-deep-ube">{title}</p>
                <p className="text-[10px] text-plum">{description}</p>
              </div>
              <ArrowUpRight className="size-4 shrink-0 text-deep-ube" />
            </Link>
          ))}
        </section>

        <section className={`${cardClassName} flex flex-col gap-3.5 px-[19px] py-5`}>
          <CardHeading
            title="Produk yang tayang"
            subtitle="Detail halaman pelanggan"
            link="Kelola"
            to="/dashboard/batch-produk"
          />
          {publishedProducts.map(({ slug, name, price, image }) => (
            <Link
              key={slug}
              to="/dashboard/batch-produk/$slug"
              params={{ slug }}
              className="group flex items-center gap-[11px] border-t border-ube-line pt-[13px]"
            >
              <img
                src={image}
                alt={name}
                width={56}
                height={56}
                className="size-14 shrink-0 rounded-[7px] object-cover"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-xs font-bold text-ink group-hover:text-deep-ube">{name}</p>
                <p className="text-[10px] whitespace-pre text-plum">{price} · Tayang</p>
              </div>
              <ArrowUpRight className="size-[15px] shrink-0 text-deep-ube" />
            </Link>
          ))}
        </section>
      </div>

      <section className="flex flex-col gap-[25px] rounded-xl bg-vanilla px-[26px] py-[23px] lg:min-h-[170px] lg:flex-row lg:items-center">
        <div className="flex flex-col gap-2 lg:w-[310px] lg:shrink-0">
          <p className="text-[10px] font-bold tracking-[0.8px] text-ube-pop">
            PRODUKSI &amp; DISTRIBUSI
          </p>
          <h2 className="font-display text-[19px]/[1.2] font-bold text-ink">
            Siapkan pesanan yang lunas.
          </h2>
          <p className="text-[11px]/[1.45] text-plum">
            Pantau jadwal pengambilan dan pengantaran untuk batch aktif.
          </p>
        </div>
        <div className="grid flex-1 gap-[15px] sm:grid-cols-2">
          {fulfillment.map(({ label, count, detail, icon: Icon }) => (
            <div
              key={label}
              className="flex flex-col gap-[7px] rounded-[9px] border border-ube-line bg-white px-[17px] py-[15px]"
            >
              <div className="flex items-center gap-[7px]">
                <Icon className="size-4 text-deep-ube" />
                <p className="text-[10px] font-bold tracking-[0.5px] text-plum">{label}</p>
              </div>
              <p className="font-display text-xl font-bold text-deep-ube">{count} pesanan</p>
              <p className="text-[10px] text-plum">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-plum">
        <span>Data contoh · {activeBatch.name} · Waktu ditampilkan dalam WIB</span>
        <span className="font-semibold">Akses administrator saja</span>
      </footer>
    </main>
  );
}

function CardHeading({
  title,
  subtitle,
  link,
  to,
}: {
  title: string;
  subtitle: string;
  link: string;
  to: LinkProps["to"];
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-[3px]">
        <h2 className="font-display text-lg/[1.2] font-bold text-ink">{title}</h2>
        <p className="text-[11px] text-plum">{subtitle}</p>
      </div>
      <Link
        to={to}
        className="shrink-0 text-[11px] font-bold whitespace-pre text-deep-ube transition-colors hover:text-ube-pop"
      >
        {link} ↗
      </Link>
    </div>
  );
}

function OrderGrowthChart() {
  const max = Math.max(...orderGrowth.map(({ total }) => total));
  const latest = orderGrowth.at(-1);

  return (
    <section className={`${cardClassName} flex flex-col gap-[13px] bg-white px-[23px] py-[19px]`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-lg/[1.2] font-bold text-ink">Pertumbuhan pesanan</h2>
          <p className="text-[11px] text-plum">Akumulasi pesanan aktif · 16–21 Okt</p>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <p className="font-display text-lg/[1.2] font-bold text-deep-ube">
            {latest?.total} pesanan
          </p>
          <p className="text-[9px] font-bold tracking-[0.8px] text-plum">DATA CONTOH</p>
        </div>
      </div>

      <ol className="flex h-[139px] items-end gap-[9px]" aria-label="Akumulasi pesanan per hari">
        {orderGrowth.map(({ day, total }) => (
          <li
            key={day}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[5px]"
          >
            <span className="font-data text-[11px] font-bold text-deep-ube">{total}</span>
            <span
              aria-hidden
              className={`w-full max-w-[82px] rounded-t-[5px] ${day === latest?.day ? "bg-deep-ube" : "bg-[#e7d4e1]"}`}
              style={{ height: Math.round((total / max) * 94) }}
            />
            <span className="text-[10px] font-semibold text-plum">{day}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
