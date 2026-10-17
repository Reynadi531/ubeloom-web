import { createFileRoute } from "@tanstack/react-router";
import {
  Boxes,
  Clock3,
  type LucideIcon,
  MapPin,
  RotateCcw,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { type KeyboardEvent, type ReactNode, useState } from "react";

import { AdminPage } from "@/components/admin/admin-page";
import { FilterSelect } from "@/components/admin/filter-controls";
import { MetricCard } from "@/components/admin/metric-card";
import { StatusBadge, type StatusTone } from "@/components/admin/status-badge";

export const Route = createFileRoute("/_auth/dashboard/produksi-kirim")({
  head: () => ({
    meta: [{ title: "Pickup & pengantaran · ubeloom" }],
  }),
  component: FulfillmentComponent,
});

// Sample data until orders, schedules and handovers live in the database.
const metrics: { label: string; value: string; context: string; icon: LucideIcon }[] = [
  { label: "PESANAN AKTIF", value: "54 pesanan", context: "12 menunggu pembayaran", icon: Wallet },
  {
    label: "PICKUP TERJADWAL",
    value: "23 pesanan",
    context: "Slot Sabtu · 10.00–15.00",
    icon: RotateCcw,
  },
  { label: "PERLU DIKIRIM", value: "19 pesanan", context: "6 siap diserahkan kurir", icon: Clock3 },
  { label: "MENUNGGU REVIEW", value: "7 bukti", context: "Belum masuk produksi", icon: Boxes },
];

type Method = "Delivery" | "Pickup";
type FulfillmentStatus = "Siap dikirim" | "Siap diambil" | "Disiapkan" | "Menunggu bayar";

/** Badge per status. */
const statusBadges: Record<FulfillmentStatus, { tone: StatusTone; className?: string }> = {
  "Siap dikirim": { tone: "ready" },
  "Siap diambil": { tone: "gold", className: "font-bold!" },
  Disiapkan: { tone: "neutral" },
  "Menunggu bayar": { tone: "muted" },
};

type Order = {
  invoice: string;
  customer: string;
  method: Method;
  status: FulfillmentStatus;
  schedule: string;
  /** Uppercase payment + fulfillment summary shown in the detail panel. */
  summary: string;
  totals: string;
  destination: string;
  window: string;
};

const orders: Order[] = [
  {
    invoice: "UBP-20261016-A7K9M2Q4",
    customer: "Rani A. · 0812•••4521",
    method: "Delivery",
    status: "Siap dikirim",
    schedule: "24 Okt · 13.00",
    summary: "LUNAS · SIAP DIKIRIM",
    totals: "Rp 160.000 + Rp 8.000",
    destination: "Jl. Telekomunikasi No. 1, Bandung",
    window: "24 Okt · 13.00–16.00 WIB",
  },
  {
    invoice: "UBP-20261016-D8P4L1S3",
    customer: "Bima R. · 0857•••9012",
    method: "Pickup",
    status: "Siap diambil",
    schedule: "24 Okt · 10.00",
    summary: "LUNAS · SIAP DIAMBIL",
    totals: "Rp 112.000 + Rp 0",
    destination: "Pickup · Dapur ubeloom, Bandung",
    window: "24 Okt · 10.00–12.00 WIB",
  },
  {
    invoice: "UBP-20261015-Q2N7H5K8",
    customer: "Dewi S. · 0813•••2280",
    method: "Delivery",
    status: "Disiapkan",
    schedule: "24 Okt · 15.00",
    summary: "LUNAS · DISIAPKAN",
    totals: "Rp 84.000 + Rp 12.000",
    destination: "Jl. Dipatiukur No. 35, Bandung",
    window: "24 Okt · 15.00–18.00 WIB",
  },
  {
    invoice: "UBP-20261015-M4V6C9T1",
    customer: "Aditya P. · 0821•••1903",
    method: "Pickup",
    status: "Menunggu bayar",
    schedule: "25 Okt · 09.00",
    summary: "MENUNGGU BAYAR",
    totals: "Rp 56.000 + Rp 0",
    destination: "Pickup · Dapur ubeloom, Bandung",
    window: "25 Okt · 09.00–12.00 WIB",
  },
];

const totalPaidOrders = 42;

const batchOptions = ["Oktober 2026"] as const;
const methodOptions = ["Semua", "Pickup", "Delivery"] as const;
const statusOptions = [
  "Semua",
  "Siap dikirim",
  "Siap diambil",
  "Disiapkan",
  "Menunggu bayar",
] as const;

const production: { variant: string; schedule: string; quantity: number }[] = [
  { variant: "Lumpia Ubi Original", schedule: "Delivery · 24 Okt, 13.00–16.00", quantity: 32 },
  { variant: "Lumpia Ubi Keju", schedule: "Pickup · 24 Okt, 10.00–12.00", quantity: 28 },
  { variant: "Lumpia Ubi Original", schedule: "Delivery · 25 Okt, 09.00–12.00", quantity: 36 },
];

const rules: { title: string; detail: string }[] = [
  {
    title: "Pembayaran & kapasitas",
    detail:
      "Preorder tetap terbuka; reservasi masuk hanya setelah invoice dibuat. Produksi dimulai setelah pembayaran disetujui.",
  },
  {
    title: "Pickup atau delivery",
    detail:
      "Pickup: siap diambil → selesai. Delivery: siap dikirim → dalam perjalanan → terkirim, dengan serah-terima tercatat.",
  },
  {
    title: "Jejak perubahan",
    detail:
      "Biaya kirim harus tampil sebelum konfirmasi. Simpan alamat terbatas, petugas, waktu dan bukti serah-terima.",
  },
];

const cardClassName = "rounded-xl border border-ube-line";
const columnHeadingClassName = "text-left text-[9px] font-extrabold text-plum";
const filterSelectClassName = "h-[38px]! w-full px-[11px]! sm:w-auto";

/** Builds a CSV client-side and hands it to the browser as a download. */
function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportOrders() {
  downloadCsv("pesanan-batch-oktober-2026.csv", [
    ["Invoice", "Pelanggan", "Metode", "Status", "Jadwal", "Subtotal + ongkir", "Tujuan"],
    ...orders.map((order) => [
      order.invoice,
      order.customer,
      order.method,
      order.status,
      order.schedule,
      order.totals,
      order.destination,
    ]),
  ]);
}

function exportProduction() {
  downloadCsv("produksi-batch-oktober-2026.csv", [
    ["Varian", "Metode / jadwal", "Lunas (item)"],
    ...production.map(({ variant, schedule, quantity }) => [variant, schedule, quantity]),
  ]);
}

function FulfillmentComponent() {
  const [query, setQuery] = useState("");
  const [batch, setBatch] = useState<string>(batchOptions[0]);
  const [method, setMethod] = useState<string>("Semua");
  const [status, setStatus] = useState<string>("Semua");
  const [selectedInvoice, setSelectedInvoice] = useState(orders[0].invoice);

  const needle = query.trim().toLowerCase();
  const visibleOrders = orders.filter(
    (order) =>
      (method === "Semua" || order.method === method) &&
      (status === "Semua" || order.status === status) &&
      (needle === "" || `${order.invoice} ${order.customer}`.toLowerCase().includes(needle)),
  );
  const selectedOrder = orders.find(({ invoice }) => invoice === selectedInvoice) ?? orders[0];

  return (
    <AdminPage className="gap-[19px]!">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex max-w-[660px] flex-col gap-[5px]">
          <p className="text-[10px] font-extrabold tracking-[1.5px] whitespace-pre text-deep-ube">
            PREORDER DIBUKA / OPERASI
          </p>
          <h1 className="text-[30px]/[1.25] font-extrabold text-ink">Pickup &amp; pengantaran</h1>
          <p className="text-xs font-medium text-plum">
            Kelola pesanan lunas untuk diambil atau dikirim. Batch Oktober masih menerima preorder
            hingga 22 Okt, 20.00 WIB.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-[9px]">
          <OutlineButton onClick={exportOrders}>Ekspor pesanan CSV</OutlineButton>
          <OutlineButton onClick={exportProduction}>Ekspor produksi CSV</OutlineButton>
        </div>
      </div>

      <section aria-label="Ringkasan pemenuhan" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h2 className="text-[19px]/[1.25] font-extrabold text-ink">Antrean pemenuhan</h2>
          <p className="text-[11px] font-medium text-plum">
            Batch dibuka · {totalPaidOrders} lunas · 12 menunggu bayar
          </p>
        </div>
        <div className="flex flex-wrap gap-[9px]">
          <label className="flex h-[38px] w-full items-center gap-2 rounded-lg border border-ube-line bg-white px-3 transition-colors focus-within:border-ube-pop sm:w-[300px]">
            <Search aria-hidden className="size-[15px] shrink-0 text-plum" />
            <span className="sr-only">Cari invoice atau WhatsApp</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari invoice / WhatsApp"
              className="min-w-0 flex-1 bg-transparent text-[11px] font-medium text-ink outline-none placeholder:text-plum"
            />
          </label>
          <FilterSelect
            label="Batch"
            options={batchOptions}
            value={batch}
            onChange={setBatch}
            className={`${filterSelectClassName} sm:w-[174px]!`}
          />
          <FilterSelect
            label="Metode"
            options={methodOptions}
            value={method}
            onChange={setMethod}
            className={`${filterSelectClassName} sm:w-[171px]!`}
          />
          <FilterSelect
            label="Status"
            options={statusOptions}
            value={status}
            onChange={setStatus}
            className={`${filterSelectClassName} sm:w-[170px]!`}
          />
        </div>
      </div>

      <div className="grid gap-[15px] xl:grid-cols-[590fr_397fr]">
        <OrdersQueue
          orders={visibleOrders}
          selectedInvoice={selectedOrder.invoice}
          onSelect={setSelectedInvoice}
        />
        <DeliveryDetail key={selectedOrder.invoice} order={selectedOrder} />
      </div>

      <div className="grid gap-[15px] xl:grid-cols-[590fr_397fr]">
        <ProductionTable />
        <section className="flex flex-col gap-3 rounded-xl bg-vanilla p-[18px]">
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden className="size-[18px] shrink-0 text-deep-ube" />
            <h2 className="text-base/[1.25] font-extrabold text-ink">Kontrol pemenuhan</h2>
          </div>
          {rules.map(({ title, detail }) => (
            <div key={title} className="flex flex-col gap-[3px]">
              <h3 className="text-[11px] font-extrabold text-deep-ube">{title}</h3>
              <p className="text-[10px]/[1.35] font-medium text-plum">{detail}</p>
            </div>
          ))}
        </section>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-medium text-plum">
        <span>Data contoh · akses administrator saja · waktu ditampilkan dalam WIB</span>
        <span>Bukti bayar privat • ekspor data hanya untuk admin</span>
      </footer>
    </AdminPage>
  );
}

function OrdersQueue({
  orders,
  selectedInvoice,
  onSelect,
}: {
  orders: Order[];
  selectedInvoice: string;
  onSelect: (invoice: string) => void;
}) {
  function handleKeyDown(event: KeyboardEvent, invoice: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(invoice);
    }
  }

  return (
    <section
      aria-label="Daftar pesanan"
      className={`${cardClassName} flex min-w-0 flex-col overflow-hidden bg-white`}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[590px] border-collapse">
          <thead>
            <tr className="h-[42px] bg-vanilla tracking-[0.7px]">
              <th scope="col" className={`${columnHeadingClassName} w-[227px] pr-2.5 pl-4`}>
                INVOICE / PELANGGAN
              </th>
              <th scope="col" className={`${columnHeadingClassName} w-[107px] pr-2.5`}>
                METODE
              </th>
              <th scope="col" className={`${columnHeadingClassName} w-[132px] pr-2.5`}>
                STATUS
              </th>
              <th scope="col" className={`${columnHeadingClassName} pr-4`}>
                JADWAL
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const selected = order.invoice === selectedInvoice;
              const badge = statusBadges[order.status];
              return (
                <tr
                  key={order.invoice}
                  tabIndex={0}
                  aria-selected={selected}
                  onClick={() => onSelect(order.invoice)}
                  onKeyDown={(event) => handleKeyDown(event, order.invoice)}
                  className={`h-[81px] cursor-pointer border-b border-ube-line transition-colors outline-none focus-visible:bg-vanilla ${selected ? "bg-[#fbf1f8]" : "hover:bg-surface"}`}
                >
                  <td className="py-3 pr-2.5 pl-4">
                    <p className="font-data text-[11px] font-extrabold text-deep-ube">
                      {order.invoice}
                    </p>
                    <p className="mt-1.5 text-[10px] font-medium text-plum">{order.customer}</p>
                  </td>
                  <td className="pr-2.5 text-[11px] font-bold text-ink">{order.method}</td>
                  <td className="pr-2.5">
                    <StatusBadge tone={badge.tone} className={badge.className}>
                      {order.status}
                    </StatusBadge>
                  </td>
                  <td className="pr-4 text-[10px] font-semibold text-plum">{order.schedule}</td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr className="h-[81px] border-b border-ube-line">
                <td colSpan={4} className="px-4 text-[11px] font-medium text-plum">
                  Tidak ada pesanan yang cocok dengan pencarian atau filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-[13px] text-[10px]">
        <p className="font-medium text-plum">
          Menampilkan {orders.length} dari {totalPaidOrders} pesanan
        </p>
        <nav aria-label="Halaman antrean" className="flex items-center gap-3.5 font-bold">
          <PagerButton>Sebelumnya</PagerButton>
          <span className="flex items-center gap-1.5">
            {[1, 2, 3].map((page) => (
              <PagerButton key={page} current={page === 1}>
                {page}
              </PagerButton>
            ))}
          </span>
          <PagerButton>Berikutnya →</PagerButton>
        </nav>
      </div>
    </section>
  );
}

function PagerButton({ current = false, children }: { current?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-current={current ? "page" : undefined}
      className="text-deep-ube transition-colors hover:text-ube-pop"
    >
      {children}
    </button>
  );
}

function DeliveryDetail({ order }: { order: Order }) {
  const [note, setNote] = useState("");
  const paid = order.status !== "Menunggu bayar";
  const details: [label: string, value: string][] = [
    ["Penerima / kontak", order.customer],
    ["Subtotal + ongkir", order.totals],
    ["Alamat tujuan", order.destination],
    ["Jendela kirim", order.window],
  ];

  return (
    <section
      aria-labelledby="delivery-detail-title"
      className={`${cardClassName} flex min-w-0 flex-col gap-[11px] bg-surface p-[17px]`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id="delivery-detail-title" className="text-[17px]/[1.25] font-extrabold text-ink">
          Detail pengantaran
        </h2>
        <p className="text-[9px] font-extrabold tracking-[0.5px] text-deep-ube">{order.summary}</p>
      </div>
      <p className="font-data text-[11px] font-bold text-deep-ube">{order.invoice}</p>
      <hr className="border-ube-line" />
      <dl className="flex flex-col gap-[11px] text-[10px]">
        {details.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="shrink-0 font-medium text-plum">{label}</dt>
            <dd className="text-right font-bold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        className="flex h-[39px] items-center gap-[9px] rounded-[7px] border border-ube-line bg-white px-2.5 text-left text-[10px] font-bold text-deep-ube transition-colors hover:bg-vanilla"
      >
        <MapPin aria-hidden className="size-[15px] shrink-0" />
        Lihat detail alamat &amp; instruksi kurir ↗
      </button>
      <p className="text-[10px]/[1.35] font-medium text-plum">
        Hanya pesanan lunas dapat dikirim. Konfirmasi alamat dan wilayah, lalu catat petugas, waktu
        serah-terima serta bukti pengantaran.
      </p>
      <label className="flex h-9 items-center rounded-[7px] border border-ube-line bg-white px-2.5 transition-colors focus-within:border-ube-pop">
        <span className="sr-only">Catatan kurir atau nomor resi internal (opsional)</span>
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Catatan kurir / nomor resi internal (opsional)"
          className="min-w-0 flex-1 bg-transparent text-[10px] font-medium text-ink outline-none placeholder:text-plum"
        />
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <OutlineButton>Tahan pengiriman</OutlineButton>
        <button
          type="button"
          disabled={!paid}
          title={paid ? undefined : "Pesanan belum lunas"}
          className="rounded-full bg-deep-ube px-[22px] py-[13px] text-xs/[15px] font-bold text-vanilla transition-colors hover:bg-ube-pop disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-deep-ube"
        >
          Tandai dikirim
        </button>
      </div>
    </section>
  );
}

function ProductionTable() {
  return (
    <section
      aria-labelledby="production-title"
      className={`${cardClassName} flex min-w-0 flex-col overflow-hidden bg-white`}
    >
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
        <div className="flex flex-col gap-[3px]">
          <h2 id="production-title" className="text-base/[1.25] font-extrabold text-ink">
            Produksi &amp; distribusi
          </h2>
          <p className="text-[10px] font-medium text-plum">
            Kuantitas lunas menurut varian dan metode pemenuhan
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 text-[10px] font-bold whitespace-pre text-deep-ube transition-colors hover:text-ube-pop"
        >
          Lihat semua jadwal ↗
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className="h-[31px] bg-vanilla tracking-[0.6px]">
              <th scope="col" className={`${columnHeadingClassName} w-[200px] pl-4`}>
                VARIAN
              </th>
              <th scope="col" className={`${columnHeadingClassName} w-[260px]`}>
                METODE / JADWAL
              </th>
              <th scope="col" className={`${columnHeadingClassName} pr-4`}>
                LUNAS
              </th>
            </tr>
          </thead>
          <tbody>
            {production.map(({ variant, schedule, quantity }) => (
              <tr key={`${variant}-${schedule}`} className="h-[50px] border-b border-ube-line">
                <th scope="row" className="pl-4 text-left text-[11px] font-bold text-ink">
                  {variant}
                </th>
                <td className="text-[10px] font-medium text-plum">{schedule}</td>
                <td className="pr-4 text-[11px] font-extrabold text-deep-ube">{quantity} item</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Outline pill button (design: outline button component). */
function OutlineButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border-[1.5px] border-deep-ube bg-surface px-[20.5px] py-[11.5px] text-xs/[15px] font-bold whitespace-nowrap text-deep-ube transition-colors hover:bg-vanilla"
    >
      {children}
    </button>
  );
}
