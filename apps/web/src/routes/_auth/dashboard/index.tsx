import { Link, type LinkProps, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarPlus,
  ChevronDown,
  Clock3,
  ImageOff,
  type LucideIcon,
  ScanEye,
  Store,
  Truck,
} from "lucide-react";
import { z } from "zod";

import { getDashboardOverview } from "@/functions/dashboard";

export const Route = createFileRoute("/_auth/dashboard/")({
  validateSearch: z.object({ batch: z.string().optional() }),
  loaderDeps: ({ search }) => ({ batchId: search.batch }),
  loader: ({ deps }) => getDashboardOverview({ data: deps }),
  head: () => ({
    meta: [{ title: "Ringkasan · ubeloom" }],
  }),
  component: DashboardComponent,
});

type Overview = Awaited<ReturnType<typeof getDashboardOverview>>;
type LoadedOverview = Extract<Overview, { batch: object }>;

const cardClassName = "rounded-xl border border-ube-line";

function DashboardComponent() {
  const { session } = Route.useRouteContext();
  const overview = Route.useLoaderData();
  const firstName = session.user.name.split(" ")[0];

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 px-5 pt-[88px] pb-7 lg:px-8 lg:pt-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-bold tracking-[1.2px] whitespace-pre text-ube-pop">
            RUANG KERJA / RINGKASAN
          </p>
          <h1 className="font-display text-[30px]/[1.2] font-bold text-ink">
            Selamat datang, {firstName}.
          </h1>
          <p className="text-sm text-plum">
            Lihat yang perlu ditindaklanjuti untuk batch preorder aktif.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {overview.batch && (
            <BatchPicker batches={overview.batches} currentId={overview.batch.id} />
          )}
          <Link
            to="/dashboard/pesanan"
            className="flex items-center gap-[7px] rounded-lg bg-deep-ube px-[15px] py-[11px] text-[13px] font-bold text-white transition-colors hover:bg-ube-pop"
          >
            Lihat pesanan
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </div>

      {overview.batch ? <BatchOverview overview={overview} /> : <NoBatch />}
    </main>
  );
}

function BatchPicker({
  batches,
  currentId,
}: {
  batches: LoadedOverview["batches"];
  currentId: string;
}) {
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <label className="relative flex items-center rounded-lg border border-ube-line text-[13px] font-semibold text-ink transition-colors focus-within:ring-2 focus-within:ring-ube-pop/30 hover:bg-vanilla">
      <span className="sr-only">Pilih batch</span>
      <select
        value={currentId}
        onChange={(event) => navigate({ search: { batch: event.target.value } })}
        className="cursor-pointer appearance-none bg-transparent py-2.5 pr-9 pl-3 outline-none"
      >
        {batches.map(({ id, name }) => (
          <option key={id} value={id}>
            Batch {name}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 size-3.5 text-plum"
      />
    </label>
  );
}

function NoBatch() {
  return (
    <section className="flex flex-wrap items-center justify-between gap-6 rounded-[15px] bg-deep-ube px-[29px] py-[23px] lg:min-h-[164px]">
      <div className="flex max-w-[540px] flex-col gap-[9px]">
        <p className="text-xs font-bold tracking-[1.1px] whitespace-pre text-[#ffd6ed]">
          ● BELUM ADA BATCH
        </p>
        <h2 className="font-display text-[27px]/[1.2] font-bold text-white">
          Mulai batch preorder pertama.
        </h2>
        <p className="text-sm text-[#f6e8f1]">
          Ringkasan pesanan, pembayaran dan distribusi tampil di sini setelah batch dibuat.
        </p>
      </div>
      <Link
        to="/dashboard/batch-produk"
        className="flex items-center gap-[7px] rounded-lg bg-white px-[15px] py-[11px] text-[13px] font-bold text-deep-ube transition-colors hover:bg-vanilla"
      >
        <CalendarPlus className="size-3.5" />
        Atur batch &amp; produk
      </Link>
    </section>
  );
}

function BatchOverview({ overview }: { overview: LoadedOverview }) {
  const { batch, growth, products } = overview;

  const metrics: { label: string; value: number; note: string; icon: LucideIcon }[] = [
    { label: "LUNAS", value: overview.metrics.paid, note: "Siap diproses", icon: BadgeCheck },
    {
      label: "MENUNGGU BAYAR",
      value: overview.metrics.unpaid,
      note: "Invoice aktif",
      icon: Clock3,
    },
    {
      label: "BUKTI DIREVIEW",
      value: overview.metrics.inReview,
      note: "Perlu verifikasi",
      icon: ScanEye,
    },
    {
      label: "SIAP DIKIRIM",
      value: overview.metrics.readyDelivery,
      note: "Menunggu kurir",
      icon: Truck,
    },
  ];

  const actions: { count: number; title: string; description: string; to: LinkProps["to"] }[] = [
    {
      count: overview.metrics.inReview,
      title: "Verifikasi bukti bayar",
      description: "Periksa kecocokan nominal sebelum pesanan masuk produksi.",
      to: "/dashboard/verifikasi-bayar",
    },
    {
      count: overview.metrics.unpaid,
      title: "Tindak lanjut pembayaran",
      description: "Invoice menunggu pembayaran pelanggan.",
      to: "/dashboard/pesanan",
    },
    {
      count: overview.metrics.readyDelivery,
      title: "Serahkan ke kurir",
      description: "Pesanan lunas siap beralih ke dalam perjalanan.",
      to: "/dashboard/produksi-kirim",
    },
  ];

  const fulfillment: { label: string; count: number; detail: string; icon: LucideIcon }[] = [
    {
      label: "PICKUP TERJADWAL",
      count: overview.fulfillment.pickup.count,
      detail: overview.fulfillment.pickup.detail,
      icon: Store,
    },
    {
      label: "PERLU DIKIRIM",
      count: overview.fulfillment.delivery.count,
      detail: overview.fulfillment.delivery.detail,
      icon: Truck,
    },
  ];

  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-6 rounded-[15px] bg-deep-ube px-[29px] py-[23px] lg:min-h-[164px]">
        <div className="flex max-w-[540px] flex-col gap-[9px]">
          <p className="text-xs font-bold tracking-[1.1px] whitespace-pre text-[#ffd6ed]">
            {batch.eyebrow}
          </p>
          <h2 className="font-display text-[27px]/[1.2] font-bold text-white">{batch.name}</h2>
          <p className="text-sm whitespace-pre-wrap text-[#f6e8f1]">{batch.deadline}</p>
        </div>
        <div className="flex flex-col items-end gap-[3px]">
          <p className="font-display text-[43px]/none font-bold text-white">{batch.activeOrders}</p>
          <p className="text-xs font-bold tracking-[1px] text-[#f5dcec]">PESANAN AKTIF</p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map(({ label, value, note, icon: Icon }) => (
          <div
            key={label}
            className={`${cardClassName} flex flex-col gap-[7px] rounded-[11px] bg-surface px-[17px] py-[15px]`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold tracking-[0.7px] text-plum">{label}</p>
              <Icon className="size-4 shrink-0 text-deep-ube" />
            </div>
            <p className="font-display text-[26px]/[1.2] font-bold text-deep-ube">{value}</p>
            <p className="text-xs text-plum">{note}</p>
          </div>
        ))}
      </section>

      <OrderGrowthChart range={growth.range} points={growth.points} />

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
                <p className="text-sm font-bold text-ink group-hover:text-deep-ube">{title}</p>
                <p className="text-xs text-plum">{description}</p>
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
          {products.length === 0 && (
            <p className="border-t border-ube-line pt-[13px] text-[13px] text-plum">
              Belum ada produk yang tayang di halaman pelanggan.
            </p>
          )}
          {products.map(({ slug, name, price, image }) => (
            <Link
              key={slug}
              to="/dashboard/batch-produk/$slug"
              params={{ slug }}
              className="group flex items-center gap-[11px] border-t border-ube-line pt-[13px]"
            >
              {image ? (
                <img
                  src={image}
                  alt={name}
                  width={56}
                  height={56}
                  className="size-14 shrink-0 rounded-[7px] object-cover"
                />
              ) : (
                <span className="flex size-14 shrink-0 items-center justify-center rounded-[7px] bg-vanilla">
                  <ImageOff aria-hidden className="size-4 text-plum" />
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-sm font-bold text-ink group-hover:text-deep-ube">{name}</p>
                <p className="text-xs whitespace-pre text-plum">{price} · Tayang</p>
              </div>
              <ArrowUpRight className="size-[15px] shrink-0 text-deep-ube" />
            </Link>
          ))}
        </section>
      </div>

      <section className="flex flex-col gap-[25px] rounded-xl bg-vanilla px-[26px] py-[23px] lg:min-h-[170px] lg:flex-row lg:items-center">
        <div className="flex flex-col gap-2 lg:w-[310px] lg:shrink-0">
          <p className="text-xs font-bold tracking-[0.8px] text-ube-pop">
            PRODUKSI &amp; DISTRIBUSI
          </p>
          <h2 className="font-display text-[19px]/[1.2] font-bold text-ink">
            Siapkan pesanan yang lunas.
          </h2>
          <p className="text-[13px]/[1.45] text-plum">
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
                <p className="text-xs font-bold tracking-[0.5px] text-plum">{label}</p>
              </div>
              <p className="font-display text-xl font-bold text-deep-ube">{count} pesanan</p>
              <p className="text-xs text-plum">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-plum">
        <span>{batch.name} · Waktu ditampilkan dalam WIB</span>
        <span className="font-semibold">Akses administrator saja</span>
      </footer>
    </>
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
        <p className="text-[13px] text-plum">{subtitle}</p>
      </div>
      <Link
        to={to}
        className="shrink-0 text-[13px] font-bold whitespace-pre text-deep-ube transition-colors hover:text-ube-pop"
      >
        {link} ↗
      </Link>
    </div>
  );
}

function OrderGrowthChart({ range, points }: LoadedOverview["growth"]) {
  // Keep bars at zero height when there are no orders yet.
  const max = Math.max(1, ...points.map(({ total }) => total));
  const latest = points.at(-1);

  return (
    <section className={`${cardClassName} flex flex-col gap-[13px] bg-white px-[23px] py-[19px]`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-lg/[1.2] font-bold text-ink">Pertumbuhan pesanan</h2>
          <p className="text-[13px] text-plum">Pesanan aktif harian · {range}</p>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <p className="font-display text-lg/[1.2] font-bold text-deep-ube">
            {latest?.total} pesanan
          </p>
          <p className="text-[11px] font-bold tracking-[0.8px] text-plum">PER HARI · WIB</p>
        </div>
      </div>

      <ol className="flex h-[139px] items-end gap-[9px]" aria-label="Jumlah pesanan per hari">
        {points.map(({ day, total }) => (
          <li
            key={day}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[5px]"
          >
            <span className="font-data text-[13px] font-bold text-deep-ube">{total}</span>
            <span
              aria-hidden
              className={`w-full max-w-[82px] rounded-t-[5px] ${day === latest?.day ? "bg-deep-ube" : "bg-[#e7d4e1]"}`}
              style={{ height: Math.round((total / max) * 94) }}
            />
            <span className="text-xs font-semibold text-plum">{day}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
