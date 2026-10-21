import { createFileRoute, useRouter } from "@tanstack/react-router";
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
import { toast } from "sonner";
import { z } from "zod";

import { AdminPage } from "@/components/admin/admin-page";
import { FilterSelect } from "@/components/admin/filter-controls";
import { MetricCard } from "@/components/admin/metric-card";
import { StatusBadge, type StatusTone } from "@/components/admin/status-badge";
import {
  type BoardStatus,
  type FulfillmentOrder,
  type ProductionRow,
  fulfillmentBoardSearchSchema,
  getFulfillmentBoard,
  transitionFulfillment,
} from "@/functions/fulfillment";
import {
  formatDayMonth,
  formatRupiah,
  formatTime,
  formatWeekday,
  formatWindow,
  maskPhone,
} from "@/lib/format";
import {
  type FulfillmentMethod,
  type FulfillmentStatus,
  fulfillmentStatusLabels,
  fulfillmentTransitions,
  methodLabels,
} from "@/lib/orders";

export const Route = createFileRoute("/_auth/dashboard/produksi-kirim")({
  head: () => ({
    meta: [{ title: "Pickup & pengantaran · ubeloom" }],
  }),
  validateSearch: fulfillmentBoardSearchSchema.extend({
    order: z.string().min(1).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({
    batch: search.batch,
    method: search.method,
    status: search.status,
  }),
  loader: ({ deps }) => getFulfillmentBoard({ data: deps }),
  component: FulfillmentComponent,
});

type Order = FulfillmentOrder;

const boardStatusLabels: Record<BoardStatus, string> = {
  ...fulfillmentStatusLabels,
  awaiting_payment: "Menunggu bayar",
  // Paid but not yet in production.
  pending: "Antre produksi",
};

/** Badge per board status. */
const statusBadges: Record<BoardStatus, { tone: StatusTone; className?: string }> = {
  awaiting_payment: { tone: "muted" },
  pending: { tone: "review" },
  preparing: { tone: "neutral" },
  ready_pickup: { tone: "gold", className: "font-bold!" },
  ready_delivery: { tone: "ready" },
  in_transit: { tone: "neutral" },
  picked_up: { tone: "muted" },
  delivered: { tone: "muted" },
  cancelled: { tone: "muted" },
};

const ALL = "Semua";
const methodOptions = [ALL, methodLabels.pickup, methodLabels.delivery] as const;
const statusFilterOrder: BoardStatus[] = [
  "awaiting_payment",
  "pending",
  "preparing",
  "ready_pickup",
  "ready_delivery",
  "in_transit",
  "picked_up",
  "delivered",
  "cancelled",
];
const statusOptions = [ALL, ...statusFilterOrder.map((status) => boardStatusLabels[status])];

const batchHeadings = {
  draft: { eyebrow: "BATCH DRAF", word: "draf" },
  open: { eyebrow: "PREORDER DIBUKA", word: "dibuka" },
  closed: { eyebrow: "PREORDER DITUTUP", word: "ditutup" },
  archived: { eyebrow: "BATCH DIARSIPKAN", word: "diarsipkan" },
} as const;

/** Primary button label for each forward step. */
const actionLabels: Partial<Record<FulfillmentStatus, string>> = {
  preparing: "Mulai siapkan",
  ready_pickup: "Tandai siap diambil",
  ready_delivery: "Tandai siap dikirim",
  picked_up: "Tandai sudah diambil",
  in_transit: "Tandai dikirim",
  delivered: "Tandai terkirim",
};

/** Who receives the order at each handover step. */
const handoverLabels: Partial<Record<FulfillmentStatus, string>> = {
  picked_up: "Nama pengambil",
  in_transit: "Nama kurir / petugas pengantar",
  delivered: "Nama penerima",
};

const PAGE_SIZE = 10;
const PRODUCTION_PREVIEW = 6;

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
const columnHeadingClassName = "text-left text-[11px] font-extrabold text-plum";
const filterSelectClassName = "h-[38px]! w-full px-[11px]! sm:w-auto";
const inputClassName =
  "flex h-9 items-center rounded-[7px] border border-ube-line bg-white px-2.5 transition-colors focus-within:border-ube-pop";

/** Builds a CSV client-side and hands it to the browser as a download. */
function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          // Neutralise spreadsheet formulas in customer-supplied text.
          const text = String(cell).replace(/^[=+\-@\t\r]/, "'$&");
          return `"${text.replaceAll('"', '""')}"`;
        })
        .join(","),
    )
    .join("\n");
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function scheduleOf(order: Order) {
  if (order.method === "pickup") {
    return order.pickupSlot
      ? { startsAt: order.pickupSlot.startsAt, endsAt: order.pickupSlot.endsAt }
      : null;
  }
  return order.deliveryZone
    ? { startsAt: order.deliveryZone.windowStartsAt, endsAt: order.deliveryZone.windowEndsAt }
    : null;
}

/** "24 Okt · 13.00" */
function scheduleLabel(order: Order) {
  const schedule = scheduleOf(order);
  return schedule
    ? `${formatDayMonth(schedule.startsAt)} · ${formatTime(schedule.startsAt)}`
    : "Belum dijadwalkan";
}

function windowLabel(order: Order) {
  const schedule = scheduleOf(order);
  return schedule ? `${formatWindow(schedule.startsAt, schedule.endsAt)} WIB` : "Belum dijadwalkan";
}

function destinationLabel(order: Order, pickupLocation: string) {
  if (order.method === "pickup") {
    return `Pickup · ${order.pickupSlot?.location || pickupLocation || "lokasi belum diatur"}`;
  }
  return order.address || "Alamat belum diisi";
}

/** "Delivery · 24 Okt, 13.00–16.00" */
function productionScheduleLabel(row: ProductionRow) {
  const method = methodLabels[row.method];
  if (!row.startsAt || !row.endsAt) return `${method} · belum dijadwalkan`;
  return `${method} · ${formatDayMonth(row.startsAt)}, ${formatTime(row.startsAt)}–${formatTime(row.endsAt)}`;
}

function exportOrders(batchName: string, orders: Order[], pickupLocation: string) {
  downloadCsv(`pesanan-batch-${slugify(batchName)}.csv`, [
    [
      "Invoice",
      "Pelanggan",
      "WhatsApp",
      "Metode",
      "Status",
      "Jadwal",
      "Subtotal",
      "Ongkir",
      "Total",
      "Tujuan",
      "Item",
    ],
    ...orders.map((order) => [
      order.invoiceNumber,
      order.customerName,
      order.customerPhone,
      methodLabels[order.method],
      boardStatusLabels[order.boardStatus],
      scheduleOf(order) ? windowLabel(order) : "",
      order.subtotal,
      order.shippingFee,
      order.total,
      destinationLabel(order, pickupLocation),
      order.items.map((item) => `${item.quantity}× ${item.productName}`).join("; "),
    ]),
  ]);
}

function exportProduction(batchName: string, production: ProductionRow[]) {
  downloadCsv(`produksi-batch-${slugify(batchName)}.csv`, [
    ["Varian", "Metode / jadwal", "Lunas (item)"],
    ...production.map((row) => [row.productName, productionScheduleLabel(row), row.quantity]),
  ]);
}

function matchesQuery(order: Order, needle: string) {
  if (needle === "") return true;
  const digits = needle.replace(/\D/g, "");
  return (
    `${order.invoiceNumber} ${order.customerName}`.toLowerCase().includes(needle) ||
    (digits.length >= 3 && order.customerPhone.replace(/\D/g, "").includes(digits))
  );
}

function FulfillmentComponent() {
  const board = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [query, setQuery] = useState("");

  if (!board.batch || !board.metrics) {
    return (
      <AdminPage className="gap-[19px]!">
        <h1 className="text-[30px]/[1.25] font-extrabold text-ink">Pickup &amp; pengantaran</h1>
        <p className="text-sm font-medium text-plum">
          Belum ada batch. Buat batch terlebih dahulu untuk mengelola pemenuhan pesanan.
        </p>
      </AdminPage>
    );
  }

  const { batch, metrics, orders, production, nextPickup, batches } = board;
  const heading = batchHeadings[batch.status];

  const metricCards: { label: string; value: string; context: string; icon: LucideIcon }[] = [
    {
      label: "PESANAN AKTIF",
      value: `${metrics.active} pesanan`,
      context: `${metrics.awaitingPayment} menunggu pembayaran`,
      icon: Wallet,
    },
    {
      label: "PICKUP TERJADWAL",
      value: `${metrics.pickupScheduled} pesanan`,
      context: nextPickup
        ? `Slot ${formatWeekday(nextPickup.startsAt)} · ${formatTime(nextPickup.startsAt)}–${formatTime(nextPickup.endsAt)}`
        : "Belum ada slot mendatang",
      icon: RotateCcw,
    },
    {
      label: "PERLU DIKIRIM",
      value: `${metrics.toDeliver} pesanan`,
      context: `${metrics.readyForCourier} siap diserahkan kurir`,
      icon: Clock3,
    },
    {
      label: "MENUNGGU REVIEW",
      value: `${metrics.pendingProofs} bukti`,
      context: "Belum masuk produksi",
      icon: Boxes,
    },
  ];

  const needle = query.trim().toLowerCase();
  const visibleOrders = orders.filter((order) => matchesQuery(order, needle));
  const selectedOrder =
    orders.find(({ id }) => id === search.order) ?? visibleOrders[0] ?? orders[0];

  const batchName = (id: string | undefined) =>
    batches.find((entry) => entry.id === id)?.name ?? batch.name;

  function setFilters(next: Partial<z.infer<typeof fulfillmentBoardSearchSchema>>) {
    void navigate({
      search: (prev) => ({ ...prev, ...next, order: undefined }),
      replace: true,
      resetScroll: false,
    });
  }

  return (
    <AdminPage className="gap-[19px]!">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex max-w-[660px] flex-col gap-[5px]">
          <p className="text-xs font-extrabold tracking-[1.5px] whitespace-pre text-deep-ube">
            {heading.eyebrow} / OPERASI
          </p>
          <h1 className="text-[30px]/[1.25] font-extrabold text-ink">Pickup &amp; pengantaran</h1>
          <p className="text-sm font-medium text-plum">
            Kelola pesanan lunas untuk diambil atau dikirim.{" "}
            {batch.status === "open"
              ? `Batch ${batch.name} masih menerima preorder hingga ${formatDayMonth(batch.closesAt)}, ${formatTime(batch.closesAt)} WIB.`
              : `Batch ${batch.name} ${heading.word}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-[9px]">
          <OutlineButton
            onClick={() => exportOrders(batch.name, visibleOrders, batch.pickupLocation)}
          >
            Ekspor pesanan CSV
          </OutlineButton>
          <OutlineButton onClick={() => exportProduction(batch.name, production)}>
            Ekspor produksi CSV
          </OutlineButton>
        </div>
      </div>

      <section aria-label="Ringkasan pemenuhan" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metricCards.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h2 className="text-[19px]/[1.25] font-extrabold text-ink">Antrean pemenuhan</h2>
          <p className="text-[13px] font-medium text-plum">
            Batch {heading.word} · {metrics.paid} lunas · {metrics.awaitingPayment} menunggu bayar
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
              className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-ink outline-none placeholder:text-plum"
            />
          </label>
          <FilterSelect
            label="Batch"
            options={batches.map(({ name }) => name)}
            value={batchName(batch.id)}
            onChange={(name) =>
              setFilters({ batch: batches.find((entry) => entry.name === name)?.id })
            }
            className={`${filterSelectClassName} sm:w-[174px]!`}
          />
          <FilterSelect
            label="Metode"
            options={methodOptions}
            value={search.method ? methodLabels[search.method] : ALL}
            onChange={(label) =>
              setFilters({
                method: (Object.keys(methodLabels) as FulfillmentMethod[]).find(
                  (key) => methodLabels[key] === label,
                ),
              })
            }
            className={`${filterSelectClassName} sm:w-[171px]!`}
          />
          <FilterSelect
            label="Status"
            options={statusOptions}
            value={search.status ? boardStatusLabels[search.status] : ALL}
            onChange={(label) =>
              setFilters({
                status: statusFilterOrder.find((key) => boardStatusLabels[key] === label),
              })
            }
            className={`${filterSelectClassName} sm:w-[170px]!`}
          />
        </div>
      </div>

      <div className="grid gap-[15px] xl:grid-cols-[590fr_397fr]">
        {/* Keyed so paging restarts whenever the result set changes. */}
        <OrdersQueue
          key={`${batch.id}|${search.method}|${search.status}|${needle}`}
          orders={visibleOrders}
          selectedId={selectedOrder?.id}
          onSelect={(id) =>
            void navigate({
              search: (prev) => ({ ...prev, order: id }),
              replace: true,
              resetScroll: false,
            })
          }
        />
        {selectedOrder ? (
          <DeliveryDetail
            key={`${selectedOrder.id}|${selectedOrder.fulfillmentStatus}`}
            order={selectedOrder}
            pickupLocation={batch.pickupLocation}
          />
        ) : (
          <section
            className={`${cardClassName} flex min-h-[200px] min-w-0 items-center justify-center bg-surface p-[17px] text-[13px] font-medium text-plum`}
          >
            Belum ada pesanan untuk ditampilkan.
          </section>
        )}
      </div>

      <div className="grid gap-[15px] xl:grid-cols-[590fr_397fr]">
        <ProductionTable production={production} />
        <section className="flex flex-col gap-3 rounded-xl bg-vanilla p-[18px]">
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden className="size-[18px] shrink-0 text-deep-ube" />
            <h2 className="text-base/[1.25] font-extrabold text-ink">Kontrol pemenuhan</h2>
          </div>
          {rules.map(({ title, detail }) => (
            <div key={title} className="flex flex-col gap-[3px]">
              <h3 className="text-[13px] font-extrabold text-deep-ube">{title}</h3>
              <p className="text-xs/[1.35] font-medium text-plum">{detail}</p>
            </div>
          ))}
        </section>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-plum">
        <span>Akses administrator saja · waktu ditampilkan dalam WIB</span>
        <span>Bukti bayar privat • ekspor data hanya untuk admin</span>
      </footer>
    </AdminPage>
  );
}

function OrdersQueue({
  orders,
  selectedId,
  onSelect,
}: {
  orders: Order[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageOrders = orders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleKeyDown(event: KeyboardEvent, id: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
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
            {pageOrders.map((order) => {
              const selected = order.id === selectedId;
              const badge = statusBadges[order.boardStatus];
              return (
                <tr
                  key={order.id}
                  tabIndex={0}
                  aria-selected={selected}
                  onClick={() => onSelect(order.id)}
                  onKeyDown={(event) => handleKeyDown(event, order.id)}
                  className={`h-[81px] cursor-pointer border-b border-ube-line transition-colors outline-none focus-visible:bg-vanilla ${selected ? "bg-[#fbf1f8]" : "hover:bg-surface"}`}
                >
                  <td className="py-3 pr-2.5 pl-4">
                    <p className="font-data text-[13px] font-extrabold text-deep-ube">
                      {order.invoiceNumber}
                    </p>
                    <p className="mt-1.5 text-xs font-medium text-plum">
                      {order.customerName} · {maskPhone(order.customerPhone)}
                    </p>
                  </td>
                  <td className="pr-2.5 text-[13px] font-bold text-ink">
                    {methodLabels[order.method]}
                  </td>
                  <td className="pr-2.5">
                    <StatusBadge tone={badge.tone} className={badge.className}>
                      {boardStatusLabels[order.boardStatus]}
                    </StatusBadge>
                  </td>
                  <td className="pr-4 text-xs font-semibold text-plum">{scheduleLabel(order)}</td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr className="h-[81px] border-b border-ube-line">
                <td colSpan={4} className="px-4 text-[13px] font-medium text-plum">
                  Tidak ada pesanan yang cocok dengan pencarian atau filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-[13px] text-xs">
        <p className="font-medium text-plum">
          Menampilkan {pageOrders.length} dari {orders.length} pesanan
        </p>
        {pageCount > 1 && (
          <nav aria-label="Halaman antrean" className="flex items-center gap-3.5 font-bold">
            <PagerButton disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
              Sebelumnya
            </PagerButton>
            <span className="flex items-center gap-1.5">
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
                <PagerButton
                  key={number}
                  current={number === currentPage}
                  onClick={() => setPage(number)}
                >
                  {number}
                </PagerButton>
              ))}
            </span>
            <PagerButton
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              Berikutnya →
            </PagerButton>
          </nav>
        )}
      </div>
    </section>
  );
}

function PagerButton({
  current = false,
  disabled = false,
  onClick,
  children,
}: {
  current?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={current ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`transition-colors hover:text-ube-pop disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-deep-ube ${current ? "text-ube-pop underline" : "text-deep-ube"}`}
    >
      {children}
    </button>
  );
}

function DeliveryDetail({ order, pickupLocation }: { order: Order; pickupLocation: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [handoverTo, setHandoverTo] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isPickup = order.method === "pickup";
  const paid = order.paymentStatus === "paid";
  const steps = fulfillmentTransitions[order.method][order.fulfillmentStatus] ?? [];
  const next = steps.find((step) => step !== "cancelled");
  const canCancel = steps.includes("cancelled");
  const isCourierHandover = next === "in_transit";
  const needsName = isCourierHandover && handoverTo.trim() === "";
  const handoverLabel = next ? handoverLabels[next] : undefined;
  const summary =
    order.boardStatus === "awaiting_payment"
      ? order.paymentStatus === "review"
        ? "MENUNGGU REVIEW BAYAR"
        : "MENUNGGU BAYAR"
      : order.boardStatus === "cancelled"
        ? "DIBATALKAN"
        : `LUNAS · ${boardStatusLabels[order.boardStatus].toUpperCase()}`;

  const details: [label: string, value: string][] = [
    [
      isPickup ? "Pengambil / kontak" : "Penerima / kontak",
      `${order.customerName} · ${maskPhone(order.customerPhone)}`,
    ],
    ["Subtotal + ongkir", `${formatRupiah(order.subtotal)} + ${formatRupiah(order.shippingFee)}`],
    [isPickup ? "Lokasi ambil" : "Alamat tujuan", destinationLabel(order, pickupLocation)],
    [isPickup ? "Jendela ambil" : "Jendela kirim", windowLabel(order)],
  ];
  if (order.handover) {
    details.push([
      "Serah-terima",
      `${order.handover.handoverTo ?? "—"} · ${formatDayMonth(order.handover.createdAt)} ${formatTime(order.handover.createdAt)} WIB`,
    ]);
  }

  async function move(to: FulfillmentStatus) {
    if (to === "cancelled" && !window.confirm(`Batalkan pesanan ${order.invoiceNumber}?`)) return;
    setSubmitting(true);
    try {
      await transitionFulfillment({
        data: {
          orderId: order.id,
          from: order.fulfillmentStatus,
          to,
          handoverTo: handoverTo.trim() || undefined,
          note: note.trim() || undefined,
        },
      });
      toast.success(`${order.invoiceNumber}: ${fulfillmentStatusLabels[to]}.`);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message ? error.message : "Gagal mengubah status.",
      );
    } finally {
      setSubmitting(false);
      await router.invalidate();
    }
  }

  return (
    <section
      aria-labelledby="delivery-detail-title"
      className={`${cardClassName} flex min-w-0 flex-col gap-[11px] bg-surface p-[17px]`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id="delivery-detail-title" className="text-[17px]/[1.25] font-extrabold text-ink">
          {isPickup ? "Detail pengambilan" : "Detail pengantaran"}
        </h2>
        <p className="text-[11px] font-extrabold tracking-[0.5px] text-deep-ube">{summary}</p>
      </div>
      <p className="font-data text-[13px] font-bold text-deep-ube">{order.invoiceNumber}</p>
      <hr className="border-ube-line" />
      <dl className="flex flex-col gap-[11px] text-xs">
        {details.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="shrink-0 font-medium text-plum">{label}</dt>
            <dd className="text-right font-bold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex h-[39px] items-center gap-[9px] rounded-[7px] border border-ube-line bg-white px-2.5 text-left text-xs font-bold text-deep-ube transition-colors hover:bg-vanilla"
      >
        <MapPin aria-hidden className="size-[15px] shrink-0" />
        {isPickup ? "Lihat detail pesanan & catatan" : "Lihat detail alamat & instruksi kurir"}{" "}
        {expanded ? "↑" : "↗"}
      </button>
      {expanded && (
        <dl className="flex flex-col gap-2 rounded-[7px] border border-ube-line bg-white p-2.5 text-xs">
          <ExpandedRow label="WhatsApp" value={order.customerPhone} />
          {!isPickup && (
            <>
              <ExpandedRow label="Area" value={order.deliveryArea ?? "—"} />
              {order.courier && <ExpandedRow label="Kurir" value={order.courier} />}
              <ExpandedRow label="Alamat lengkap" value={order.address ?? "—"} />
            </>
          )}
          <ExpandedRow label="Pembayaran" value={order.paymentMethod} />
          <ExpandedRow
            label="Item"
            value={order.items.map((item) => `${item.quantity}× ${item.productName}`).join(", ")}
          />
          <ExpandedRow label="Catatan pelanggan" value={order.notes || "—"} />
          {order.handover?.note && (
            <ExpandedRow label="Catatan serah-terima" value={order.handover.note} />
          )}
        </dl>
      )}
      <p className="text-xs/[1.35] font-medium text-plum">
        {isPickup
          ? "Hanya pesanan lunas dapat diambil. Cocokkan invoice dan nama pengambil, lalu catat serah-terima."
          : "Hanya pesanan lunas dapat dikirim. Konfirmasi alamat dan wilayah, lalu catat petugas, waktu serah-terima serta bukti pengantaran."}
      </p>

      {next || canCancel ? (
        <>
          {handoverLabel && (
            <label className={inputClassName}>
              <span className="sr-only">{handoverLabel}</span>
              <input
                type="text"
                value={handoverTo}
                onChange={(event) => setHandoverTo(event.target.value)}
                placeholder={`${handoverLabel} (${isCourierHandover ? "wajib" : "opsional"})`}
                className="min-w-0 flex-1 bg-transparent text-xs font-medium text-ink outline-none placeholder:text-plum"
              />
            </label>
          )}
          <label className={inputClassName}>
            <span className="sr-only">
              {isPickup
                ? "Catatan serah-terima (opsional)"
                : "Catatan kurir atau nomor resi internal (opsional)"}
            </span>
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                isPickup
                  ? "Catatan serah-terima (opsional)"
                  : "Catatan kurir / nomor resi internal (opsional)"
              }
              className="min-w-0 flex-1 bg-transparent text-xs font-medium text-ink outline-none placeholder:text-plum"
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            {canCancel && (
              <OutlineButton disabled={submitting} onClick={() => move("cancelled")}>
                Batalkan pesanan
              </OutlineButton>
            )}
            {next && (
              <button
                type="button"
                disabled={!paid || needsName || submitting}
                title={
                  !paid ? "Pesanan belum lunas" : needsName ? "Isi nama kurir dahulu" : undefined
                }
                onClick={() => move(next)}
                className="rounded-full bg-deep-ube px-[22px] py-[13px] text-sm/[15px] font-bold text-vanilla transition-colors hover:bg-ube-pop disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-deep-ube"
              >
                {actionLabels[next]}
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="rounded-[7px] bg-vanilla px-2.5 py-2 text-xs font-bold text-deep-ube">
          {order.fulfillmentStatus === "cancelled"
            ? "Pesanan dibatalkan."
            : "Pesanan sudah selesai."}
        </p>
      )}
    </section>
  );
}

function ExpandedRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 font-medium text-plum">{label}</dt>
      <dd className="text-right font-semibold break-words text-ink">{value}</dd>
    </div>
  );
}

function ProductionTable({ production }: { production: ProductionRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? production : production.slice(0, PRODUCTION_PREVIEW);

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
          <p className="text-xs font-medium text-plum">
            Kuantitas lunas menurut varian dan metode pemenuhan
          </p>
        </div>
        {production.length > PRODUCTION_PREVIEW && (
          <button
            type="button"
            aria-expanded={showAll}
            onClick={() => setShowAll((value) => !value)}
            className="shrink-0 text-xs font-bold whitespace-pre text-deep-ube transition-colors hover:text-ube-pop"
          >
            {showAll ? "Ringkas ↑" : "Lihat semua jadwal ↗"}
          </button>
        )}
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
            {rows.map((row) => {
              const schedule = productionScheduleLabel(row);
              return (
                <tr
                  key={`${row.productName}-${schedule}`}
                  className="h-[50px] border-b border-ube-line"
                >
                  <th scope="row" className="pl-4 text-left text-[13px] font-bold text-ink">
                    {row.productName}
                  </th>
                  <td className="text-xs font-medium text-plum">{schedule}</td>
                  <td className="pr-4 text-[13px] font-extrabold text-deep-ube">
                    {row.quantity} item
                  </td>
                </tr>
              );
            })}
            {production.length === 0 && (
              <tr className="h-[50px] border-b border-ube-line">
                <td colSpan={3} className="px-4 text-[13px] font-medium text-plum">
                  Belum ada pesanan lunas di batch ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Outline pill button (design: outline button component). */
function OutlineButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border-[1.5px] border-deep-ube bg-surface px-[20.5px] py-[11.5px] text-sm/[15px] font-bold whitespace-nowrap text-deep-ube transition-colors hover:bg-vanilla disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}
