import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Search } from "lucide-react";
import { useState } from "react";

import { AdminPage, BatchStatusPill, PageHeading } from "@/components/admin/admin-page";
import { FilterSelect, FilterTab } from "@/components/admin/filter-controls";
import { StatusBadge } from "@/components/admin/status-badge";

export const Route = createFileRoute("/_auth/dashboard/pesanan/")({
  head: () => ({
    meta: [{ title: "Pesanan · ubeloom" }],
  }),
  component: OrdersComponent,
});

type Method = "Delivery" | "Pickup";
type Payment = "Lunas" | "Review" | "Belum bayar";

type Order = {
  invoice: string;
  customer: string;
  phone: string;
  method: Method;
  payment: Payment;
  status: string;
  destination: string;
  schedule: string;
  items: string;
  subtotal: number;
  shipping: number;
};

// Sample data until orders and batches live in the database.
const totalOrders = 54;

const orders: Order[] = [
  {
    invoice: "UBP-20261016-A7K9M2Q4",
    customer: "Rani A.",
    phone: "0812•••4521",
    method: "Delivery",
    payment: "Lunas",
    status: "Siap dikirim",
    destination: "Jl. Telekomunikasi No. 1, Bandung",
    schedule: "24 Okt · 13.00–16.00 WIB",
    items: "Lumpia Ubi Original × 2",
    subtotal: 160_000,
    shipping: 8_000,
  },
  {
    invoice: "UBP-20261016-D8P4L1S3",
    customer: "Bima R.",
    phone: "0813•••7710",
    method: "Pickup",
    payment: "Lunas",
    status: "Siap diambil",
    destination: "Pickup di toko ubeloom",
    schedule: "25 Okt · 10.00–15.00 WIB",
    items: "Lumpia Ubi Goreng × 8",
    subtotal: 224_000,
    shipping: 0,
  },
  {
    invoice: "UBP-20261016-Q2N7H5K8",
    customer: "Dewi S.",
    phone: "0857•••3302",
    method: "Delivery",
    payment: "Lunas",
    status: "Disiapkan",
    destination: "Jl. Sukabirus No. 12, Bandung",
    schedule: "24 Okt · 13.00–16.00 WIB",
    items: "Sparkling Starfruit × 6",
    subtotal: 96_000,
    shipping: 16_000,
  },
  {
    invoice: "UBP-20261016-M4V6C9T1",
    customer: "Aditya P.",
    phone: "0821•••9054",
    method: "Pickup",
    payment: "Review",
    status: "Menunggu",
    destination: "Pickup di toko ubeloom",
    schedule: "25 Okt · 10.00–15.00 WIB",
    items: "Lumpia Ubi Goreng × 10",
    subtotal: 280_000,
    shipping: 0,
  },
  {
    invoice: "UBP-20261016-E8R5S2P7",
    customer: "Sinta M.",
    phone: "0878•••1286",
    method: "Delivery",
    payment: "Belum bayar",
    status: "Menunggu",
    destination: "Jl. Mangga Dua No. 5, Bandung",
    schedule: "24 Okt · 13.00–16.00 WIB",
    items: "Lumpia Ubi Goreng × 3",
    subtotal: 84_000,
    shipping: 8_000,
  },
  {
    invoice: "UBP-20261016-K3B9L4Q6",
    customer: "Fajar T.",
    phone: "0812•••6639",
    method: "Pickup",
    payment: "Lunas",
    status: "Selesai",
    destination: "Pickup di toko ubeloom",
    schedule: "25 Okt · 10.00–15.00 WIB",
    items: "Lumpia Ubi Goreng × 2",
    subtotal: 56_000,
    shipping: 0,
  },
];

const tabs: { label: string; count: number; matches: (order: Order) => boolean }[] = [
  { label: "Semua", count: totalOrders, matches: () => true },
  { label: "Menunggu bayar", count: 12, matches: ({ payment }) => payment !== "Lunas" },
  {
    label: "Disiapkan",
    count: 19,
    matches: ({ status }) => ["Disiapkan", "Siap dikirim", "Siap diambil"].includes(status),
  },
  { label: "Pickup", count: 23, matches: ({ method }) => method === "Pickup" },
  { label: "Delivery", count: 19, matches: ({ method }) => method === "Delivery" },
];

const batchOptions = ["Oktober 2026", "September 2026"] as const;
const paymentOptions = ["Semua", "Lunas", "Review", "Belum bayar"] as const;
const methodOptions = ["Semua", "Pickup", "Delivery"] as const;
const scheduleOptions = ["Semua", "24 Okt", "25 Okt"] as const;

const exportButtonClassName =
  "rounded-full border border-deep-ube px-3.5 py-2.5 text-[11px]/none font-bold whitespace-pre text-deep-ube transition-colors hover:bg-vanilla";

const formatRupiah = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;

function OrdersComponent() {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState(tabs[0].label);
  const [batch, setBatch] = useState<string>(batchOptions[0]);
  const [payment, setPayment] = useState<string>("Semua");
  const [method, setMethod] = useState<string>("Semua");
  const [schedule, setSchedule] = useState<string>("Semua");
  const [selectedInvoice, setSelectedInvoice] = useState(orders[0].invoice);

  const tab = tabs.find(({ label }) => label === activeTab) ?? tabs[0];
  const search = query.trim().toLowerCase();
  const visibleOrders = orders.filter(
    (order) =>
      batch === batchOptions[0] &&
      tab.matches(order) &&
      (payment === "Semua" || order.payment === payment) &&
      (method === "Semua" || order.method === method) &&
      (schedule === "Semua" || order.schedule.startsWith(schedule)) &&
      [order.invoice, order.customer, order.phone.replaceAll("•", "")].some((value) =>
        value.toLowerCase().includes(search),
      ),
  );
  const selectedOrder = orders.find(({ invoice }) => invoice === selectedInvoice);

  return (
    <AdminPage>
      <PageHeading
        eyebrow="UBELOOM  /  ADMIN  /  PESANAN"
        title="Semua pesanan"
        description="Cari invoice, cek metode pemenuhan dan tindak lanjuti pesanan."
        actions={<BatchStatusPill />}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex h-[42px] w-full items-center gap-[9px] rounded-[9px] border border-ube-line px-3.5 transition-colors focus-within:border-ube-pop sm:w-[390px]">
          <Search aria-hidden className="size-4 shrink-0 text-plum" />
          <span className="sr-only">Cari pesanan</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari invoice, nama atau WhatsApp"
            className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-plum"
          />
        </label>
        <div className="flex flex-wrap gap-[9px]">
          <button type="button" className={exportButtonClassName}>
            Ekspor pesanan CSV
          </button>
          <button type="button" className={exportButtonClassName}>
            Ekspor produksi CSV
          </button>
          <Link
            to="/dashboard/pesanan/baru"
            className="flex items-center gap-[7px] rounded-full bg-deep-ube px-3.5 py-2.5 text-[11px]/none font-bold text-vanilla transition-colors hover:bg-ube-pop"
          >
            Buat invoice manual
            <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        </div>
      </div>

      <div role="tablist" aria-label="Status pesanan" className="flex flex-wrap gap-2">
        {tabs.map(({ label, count }) => (
          <FilterTab
            key={label}
            label={label}
            count={count}
            active={label === activeTab}
            onClick={() => setActiveTab(label)}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <FilterSelect label="Batch" options={batchOptions} value={batch} onChange={setBatch} />
        <FilterSelect
          label="Pembayaran"
          options={paymentOptions}
          value={payment}
          onChange={setPayment}
        />
        <FilterSelect
          label="Pemenuhan"
          options={methodOptions}
          value={method}
          onChange={setMethod}
        />
        <FilterSelect
          label="Jadwal"
          options={scheduleOptions}
          value={schedule}
          onChange={setSchedule}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[630fr_360fr]">
        <section
          aria-label="Daftar pesanan"
          className="min-w-0 overflow-hidden rounded-xl border border-ube-line bg-surface"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[630px] table-fixed border-collapse text-left">
              <thead className="bg-vanilla text-[9px] font-extrabold text-plum">
                <tr className="h-[43px]">
                  <th scope="col" className="w-[219px] pl-3.5 font-extrabold">
                    INVOICE / NAMA
                  </th>
                  <th scope="col" className="w-[95px] font-extrabold">
                    METODE
                  </th>
                  <th scope="col" className="w-[115px] font-extrabold">
                    PEMBAYARAN
                  </th>
                  <th scope="col" className="w-[100px] font-extrabold">
                    STATUS
                  </th>
                  <th scope="col" className="w-[100px] pr-3.5 font-extrabold">
                    TOTAL
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => {
                  const selected = order.invoice === selectedInvoice;
                  return (
                    <tr
                      key={order.invoice}
                      onClick={() => setSelectedInvoice(order.invoice)}
                      className={`h-[75px] cursor-pointer border-b border-ube-line transition-colors ${selected ? "bg-[#fbf1f8]" : "hover:bg-vanilla/60"}`}
                    >
                      <td className="py-2.5 pl-3.5">
                        <button
                          type="button"
                          aria-pressed={selected}
                          className="flex flex-col gap-[5px] text-left outline-none focus-visible:underline"
                        >
                          <span className="font-data text-[10px] font-bold text-deep-ube">
                            {order.invoice}
                          </span>
                          <span className="text-[10px] text-plum">{order.customer}</span>
                        </button>
                      </td>
                      <td className="text-[11px] font-bold text-ink">{order.method}</td>
                      <td
                        className={`text-[10px] font-bold ${order.payment === "Lunas" ? "text-deep-ube" : "text-plum"}`}
                      >
                        {order.payment}
                      </td>
                      <td className="text-[10px] font-semibold text-ink">{order.status}</td>
                      <td className="pr-3.5 text-[10px] font-bold text-ink">
                        {formatRupiah(order.subtotal + order.shipping)}
                      </td>
                    </tr>
                  );
                })}
                {visibleOrders.length === 0 && (
                  <tr className="h-[75px] border-b border-ube-line">
                    <td colSpan={5} className="px-3.5 text-center text-[11px] text-plum">
                      Tidak ada pesanan yang cocok dengan filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-4 px-3.5 py-[15px] text-[10px]">
            <p className="text-plum">
              {visibleOrders.length} dari {totalOrders} pesanan
            </p>
            <nav aria-label="Halaman pesanan" className="flex gap-2 font-bold text-deep-ube">
              <button type="button" aria-label="Halaman sebelumnya">
                ←
              </button>
              <button type="button" aria-current="page">
                1
              </button>
              <button type="button">2</button>
              <button type="button">3</button>
              <button type="button" aria-label="Halaman berikutnya">
                →
              </button>
            </nav>
          </div>
        </section>

        {selectedOrder && <SelectedOrder order={selectedOrder} />}
      </div>

      <p className="border-t border-ube-line pt-[15px] text-[11px] text-plum">
        Data kontak dan alamat hanya untuk pemenuhan pesanan. Ekspor bersifat admin-only dan
        aktivitas tercatat di audit log.
      </p>
    </AdminPage>
  );
}

function SelectedOrder({ order }: { order: Order }) {
  const paid = order.payment === "Lunas";
  const delivery = order.method === "Delivery";
  const details: { label: string; value: string }[] = [
    { label: "Pelanggan", value: `${order.customer} · ${order.phone}` },
    { label: "Tujuan", value: order.destination },
    { label: delivery ? "Jendela kirim" : "Jendela ambil", value: order.schedule },
    { label: "Isi pesanan", value: order.items },
    {
      label: "Subtotal + ongkir",
      value: `${formatRupiah(order.subtotal)} + ${formatRupiah(order.shipping)}`,
    },
    {
      label: paid ? "Total lunas" : "Total tagihan",
      value: formatRupiah(order.subtotal + order.shipping),
    },
  ];

  return (
    <section
      aria-labelledby="selected-order-invoice"
      className="flex flex-col gap-3.5 rounded-xl bg-vanilla p-5"
    >
      <p className="font-data text-[10px] font-extrabold whitespace-pre text-deep-ube">
        {`PESANAN TERPILIH  /  ${order.method.toUpperCase()}`}
      </p>
      <h2 id="selected-order-invoice" className="font-data text-sm font-bold break-all text-ink">
        {order.invoice}
      </h2>
      <StatusBadge tone={paid ? "ready" : "review"}>
        {order.payment.toUpperCase()} · {order.status.toUpperCase()}
      </StatusBadge>
      <hr className="border-ube-line" />
      <dl className="flex flex-col gap-3.5">
        {details.map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="text-[10px] font-semibold text-plum">{label}</dt>
            <dd className="text-xs font-bold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        className="w-fit rounded-full bg-deep-ube px-[17px] py-3 text-xs/none font-bold whitespace-pre text-vanilla transition-colors hover:bg-ube-pop"
      >
        {"Buka detail & status  →"}
      </button>
    </section>
  );
}
