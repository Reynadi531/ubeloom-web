import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminPage, BatchStatusPill, PageHeading } from "@/components/admin/admin-page";
import { FilterSelect, FilterTab } from "@/components/admin/filter-controls";
import { downloadText, serverErrorMessage } from "@/components/admin/orders/form-errors";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  type OrderListFilters,
  type OrderListRow,
  exportOrdersCsv,
  listOrders,
  orderListFiltersSchema,
  orderTabs,
} from "@/functions/orders";
import { formatRupiah } from "@/lib/format";
import {
  type FulfillmentMethod,
  type PaymentStatus,
  fulfillmentStatusLabels,
  methodLabels,
  paymentStatusLabels,
} from "@/lib/orders";

export const Route = createFileRoute("/_auth/dashboard/pesanan/")({
  head: () => ({
    meta: [{ title: "Pesanan · ubeloom" }],
  }),
  validateSearch: orderListFiltersSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listOrders({ data: deps }),
  component: OrdersComponent,
});

const ALL = "Semua";

const batchStatusLabels = {
  draft: "DRAF",
  open: "DIBUKA",
  closed: "DITUTUP",
  archived: "DIARSIPKAN",
} as const;

const paymentEntries = Object.entries(paymentStatusLabels) as [PaymentStatus, string][];
const methodEntries = Object.entries(methodLabels) as [FulfillmentMethod, string][];
const paymentOptions = [ALL, ...paymentEntries.map(([, label]) => label)];
const methodOptions = [ALL, ...methodEntries.map(([, label]) => label)];

const exportButtonClassName =
  "rounded-full border border-deep-ube px-3.5 py-2.5 text-[11px]/none font-bold whitespace-pre text-deep-ube transition-colors hover:bg-vanilla disabled:cursor-wait disabled:opacity-60";

/** Page numbers around the current page, at most five. */
function pageWindow(page: number, pageCount: number) {
  const start = Math.max(1, Math.min(page - 2, pageCount - 4));
  return Array.from({ length: Math.min(5, pageCount) }, (_, index) => start + index);
}

function OrdersComponent() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [query, setQuery] = useState(search.q ?? "");
  const [selectedId, setSelectedId] = useState<string>();
  const [exporting, setExporting] = useState<"orders" | "production">();

  const setFilters = (patch: Partial<OrderListFilters>) =>
    navigate({
      search: (previous) => ({ ...previous, ...patch, page: patch.page }),
      replace: true,
    });

  // Debounce typing into the URL so the loader refetches once per pause.
  useEffect(() => {
    const next = query.trim() || undefined;
    if (next === (search.q?.trim() || undefined)) return;
    const timeout = setTimeout(
      () =>
        navigate({
          search: (previous) => ({ ...previous, q: next, page: undefined }),
          replace: true,
        }),
      300,
    );
    return () => clearTimeout(timeout);
  }, [query, search.q, navigate]);

  const activeTab = search.tab ?? "semua";
  const selectedOrder = data.orders.find(({ id }) => id === selectedId) ?? data.orders[0];
  const batchOptions = data.batches.length > 0 ? data.batches.map(({ name }) => name) : ["—"];
  const scheduleOptions = [ALL, ...data.scheduleOptions.map(({ label }) => label)];

  const exportCsv = async (kind: "orders" | "production") => {
    setExporting(kind);
    try {
      const { filename, csv } = await exportOrdersCsv({
        data: { ...search, batch: data.batch?.id, kind },
      });
      downloadText(filename, csv);
      toast.success(`${filename} diunduh.`);
    } catch (error) {
      toast.error(serverErrorMessage(error));
    } finally {
      setExporting(undefined);
    }
  };

  return (
    <AdminPage>
      <PageHeading
        eyebrow="UBELOOM  /  ADMIN  /  PESANAN"
        title="Semua pesanan"
        description="Cari invoice, cek metode pemenuhan dan tindak lanjuti pesanan."
        actions={
          <BatchStatusPill
            label={
              data.batch
                ? `BATCH ${data.batch.name.toUpperCase()} · ${batchStatusLabels[data.batch.status]}`
                : "BELUM ADA BATCH"
            }
          />
        }
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
          <button
            type="button"
            disabled={!data.batch || exporting !== undefined}
            onClick={() => exportCsv("orders")}
            className={exportButtonClassName}
          >
            {exporting === "orders" ? "Menyiapkan CSV…" : "Ekspor pesanan CSV"}
          </button>
          <button
            type="button"
            disabled={!data.batch || exporting !== undefined}
            onClick={() => exportCsv("production")}
            className={exportButtonClassName}
          >
            {exporting === "production" ? "Menyiapkan CSV…" : "Ekspor produksi CSV"}
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
        {orderTabs.map(({ key, label }) => (
          <FilterTab
            key={key}
            label={label}
            count={data.tabCounts[key]}
            active={key === activeTab}
            onClick={() => setFilters({ tab: key === "semua" ? undefined : key })}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <FilterSelect
          label="Batch"
          options={batchOptions}
          value={data.batch?.name ?? "—"}
          onChange={(name) =>
            setFilters({
              batch: data.batches.find((candidate) => candidate.name === name)?.id,
              date: undefined,
            })
          }
        />
        <FilterSelect
          label="Pembayaran"
          options={paymentOptions}
          value={search.payment ? paymentStatusLabels[search.payment] : ALL}
          onChange={(label) =>
            setFilters({ payment: paymentEntries.find(([, value]) => value === label)?.[0] })
          }
        />
        <FilterSelect
          label="Pemenuhan"
          options={methodOptions}
          value={search.method ? methodLabels[search.method] : ALL}
          onChange={(label) =>
            setFilters({ method: methodEntries.find(([, value]) => value === label)?.[0] })
          }
        />
        <FilterSelect
          label="Jadwal"
          options={scheduleOptions}
          value={data.scheduleOptions.find(({ value }) => value === search.date)?.label ?? ALL}
          onChange={(label) =>
            setFilters({
              date: data.scheduleOptions.find((option) => option.label === label)?.value,
            })
          }
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
                {data.orders.map((order) => {
                  const selected = order.id === selectedOrder?.id;
                  return (
                    <tr
                      key={order.id}
                      onClick={() => setSelectedId(order.id)}
                      className={`h-[75px] cursor-pointer border-b border-ube-line transition-colors ${selected ? "bg-[#fbf1f8]" : "hover:bg-vanilla/60"}`}
                    >
                      <td className="py-2.5 pl-3.5">
                        <button
                          type="button"
                          aria-pressed={selected}
                          className="flex flex-col gap-[5px] text-left outline-none focus-visible:underline"
                        >
                          <span className="font-data text-[10px] font-bold text-deep-ube">
                            {order.invoiceNumber}
                          </span>
                          <span className="text-[10px] text-plum">{order.customerName}</span>
                        </button>
                      </td>
                      <td className="text-[11px] font-bold text-ink">
                        {methodLabels[order.method]}
                      </td>
                      <td
                        className={`text-[10px] font-bold ${order.paymentStatus === "paid" ? "text-deep-ube" : "text-plum"}`}
                      >
                        {paymentStatusLabels[order.paymentStatus]}
                      </td>
                      <td className="text-[10px] font-semibold text-ink">
                        {fulfillmentStatusLabels[order.fulfillmentStatus]}
                      </td>
                      <td className="pr-3.5 text-[10px] font-bold text-ink">
                        {formatRupiah(order.total)}
                      </td>
                    </tr>
                  );
                })}
                {data.orders.length === 0 && (
                  <tr className="h-[75px] border-b border-ube-line">
                    <td colSpan={5} className="px-3.5 text-center text-[11px] text-plum">
                      {data.batch
                        ? "Tidak ada pesanan yang cocok dengan filter."
                        : "Belum ada batch. Buat batch terlebih dahulu."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-4 px-3.5 py-[15px] text-[10px]">
            <p className="text-plum">
              {data.orders.length} dari {data.filteredTotal} pesanan
            </p>
            {data.pageCount > 1 && (
              <nav aria-label="Halaman pesanan" className="flex gap-2 font-bold text-deep-ube">
                <button
                  type="button"
                  aria-label="Halaman sebelumnya"
                  disabled={data.page <= 1}
                  onClick={() => setFilters({ page: data.page - 1 })}
                  className="disabled:opacity-40"
                >
                  ←
                </button>
                {pageWindow(data.page, data.pageCount).map((page) => (
                  <button
                    key={page}
                    type="button"
                    aria-current={page === data.page ? "page" : undefined}
                    onClick={() => setFilters({ page })}
                    className={page === data.page ? "underline underline-offset-4" : ""}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Halaman berikutnya"
                  disabled={data.page >= data.pageCount}
                  onClick={() => setFilters({ page: data.page + 1 })}
                  className="disabled:opacity-40"
                >
                  →
                </button>
              </nav>
            )}
          </div>
        </section>

        {selectedOrder && <SelectedOrder order={selectedOrder} />}
      </div>

      <p className="border-t border-ube-line pt-[15px] text-[11px] text-plum">
        Data kontak dan alamat hanya untuk pemenuhan pesanan. Ekspor bersifat admin-only dan
        tercatat di log server.
      </p>
    </AdminPage>
  );
}

function SelectedOrder({ order }: { order: OrderListRow }) {
  const paid = order.paymentStatus === "paid";
  const delivery = order.method === "delivery";
  const cancelled = order.fulfillmentStatus === "cancelled";
  const paymentLabel = paymentStatusLabels[order.paymentStatus];
  const statusLabel = fulfillmentStatusLabels[order.fulfillmentStatus];
  const details: { label: string; value: string }[] = [
    { label: "Pelanggan", value: `${order.customerName} · ${order.customerPhone}` },
    { label: "Tujuan", value: order.destination },
    { label: delivery ? "Jendela kirim" : "Jendela ambil", value: order.schedule },
    { label: "Isi pesanan", value: order.itemsSummary || "—" },
    {
      label: "Subtotal + ongkir",
      value: `${formatRupiah(order.subtotal)} + ${formatRupiah(order.shippingFee)}`,
    },
    { label: paid ? "Total lunas" : "Total tagihan", value: formatRupiah(order.total) },
  ];

  return (
    <section
      aria-labelledby="selected-order-invoice"
      className="flex flex-col gap-3.5 rounded-xl bg-vanilla p-5"
    >
      <p className="font-data text-[10px] font-extrabold whitespace-pre text-deep-ube">
        {`PESANAN TERPILIH  /  ${methodLabels[order.method].toUpperCase()}`}
      </p>
      <h2 id="selected-order-invoice" className="font-data text-sm font-bold break-all text-ink">
        {order.invoiceNumber}
      </h2>
      <StatusBadge tone={cancelled ? "muted" : paid ? "ready" : "review"}>
        {paymentLabel.toUpperCase()} · {statusLabel.toUpperCase()}
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
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Payment review and fulfillment status each live on their own admin page. */}
        <Link
          to={paid ? "/dashboard/produksi-kirim" : "/dashboard/verifikasi-bayar"}
          className="w-fit rounded-full bg-deep-ube px-[17px] py-3 text-xs/none font-bold whitespace-pre text-vanilla transition-colors hover:bg-ube-pop"
        >
          {"Buka detail & status  →"}
        </Link>
        <Link
          to="/dashboard/pesanan/invoice"
          search={{ orderId: order.id }}
          className="w-fit rounded-full border border-deep-ube px-[15px] py-[11px] text-xs/none font-bold whitespace-pre text-deep-ube transition-colors hover:bg-white"
        >
          Buat invoice
        </Link>
      </div>
    </section>
  );
}
