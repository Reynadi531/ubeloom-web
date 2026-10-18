import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AdminPage, BatchStatusPill, PageHeading } from "@/components/admin/admin-page";
import { CompactMetric } from "@/components/admin/metric-card";
import { type BatchOverview, type BatchStatus, getBatchOverview } from "@/functions/batches";
import { PLACEHOLDER_IMAGE } from "@/functions/products";
import {
  formatDayMonth,
  formatRupiah,
  formatTime,
  formatWeekday,
  formatWindow,
} from "@/lib/format";

import {
  AddProductDialog,
  BatchSettingsDialog,
  DeliveryZonesDialog,
  PickupSlotsDialog,
} from "./-components/batch-dialogs";

export const Route = createFileRoute("/_auth/dashboard/batch-produk/")({
  loader: () => getBatchOverview(),
  head: () => ({
    meta: [{ title: "Batch & produk · ubeloom" }],
  }),
  component: BatchProductsComponent,
});

type LoadedOverview = NonNullable<BatchOverview["current"]>;
type BatchProduct = LoadedOverview["products"][number];
type Dialog = "settings" | "product" | "slots" | "zones" | null;

const statusPill: Record<BatchStatus, string> = {
  draft: "DRAF",
  open: "DIBUKA",
  closed: "DITUTUP",
  archived: "DIARSIPKAN",
};

const statusPhrase: Record<BatchStatus, string> = {
  draft: "belum dibuka",
  open: "sedang menerima preorder",
  closed: "preorder ditutup",
  archived: "diarsipkan",
};

const at = (value: Date) => `${formatDayMonth(value)}, ${formatTime(value)} WIB`;

const cardClassName = "rounded-[13px] border border-ube-line bg-surface";
const textActionClassName =
  "w-fit text-[11px] font-bold whitespace-pre text-deep-ube transition-colors hover:text-ube-pop";

function BatchProductsComponent() {
  const { current, allProducts } = Route.useLoaderData();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  const heading = (pill: string) => (
    <PageHeading
      eyebrow="UBELOOM  /  ADMIN  /  BATCH & PRODUK"
      title="Batch & produk"
      description="Atur preorder yang masih dibuka, kapasitas, harga dan area layanan."
      actions={<BatchStatusPill label={pill} />}
    />
  );

  if (!current) {
    return (
      <AdminPage>
        {heading("BELUM ADA BATCH")}
        <BatchBanner
          title="Belum ada batch"
          schedule="Buat batch pertama untuk mulai menerima preorder."
          action="Buat batch"
          onAction={() => setDialog("settings")}
        />
        <BatchSettingsDialog open={dialog === "settings"} onClose={close} batch={null} />
      </AdminPage>
    );
  }

  const { batch, orders, products, slots, zones } = current;
  const activeSlots = slots.filter((slot) => slot.active).length;
  const activeZones = zones.filter((zone) => zone.active).length;
  const productIds = new Set(products.map(({ id }) => id));

  const metrics: { label: string; value: string; detail: string }[] = [
    {
      label: "TERPESAN",
      value: String(orders.total),
      detail: `${orders.paid} lunas · ${orders.total - orders.paid} menunggu`,
    },
    capacityMetric(products),
    { label: "PICKUP", value: String(orders.pickup), detail: `${activeSlots} slot aktif` },
    { label: "DELIVERY", value: String(orders.delivery), detail: `${activeZones} area aktif` },
  ];

  return (
    <AdminPage>
      {heading(`BATCH ${batch.name.toUpperCase()} · ${statusPill[batch.status]}`)}

      <BatchBanner
        title={`Batch ${batch.name} · ${statusPhrase[batch.status]}`}
        schedule={`Buka ${formatDayMonth(batch.opensAt)} · tutup ${at(batch.closesAt)} · cutoff pembayaran ${at(batch.paymentCutoffAt)}`}
        action="Ubah pengaturan"
        onAction={() => setDialog("settings")}
      />

      <section
        aria-label="Ringkasan operasional batch"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {metrics.map(({ label, value, detail }) => (
          <CompactMetric
            key={label}
            label={label}
            value={value}
            detail={detail}
            valueClassName="text-xl/[1.25]"
          />
        ))}
      </section>

      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[19px]/[1.25] font-extrabold text-ink">Produk yang dijual</h2>
          <button
            type="button"
            onClick={() => setDialog("product")}
            className={textActionClassName}
          >
            + Tambah varian
          </button>
        </div>

        <div className="grid gap-3.5 xl:grid-cols-2">
          {products.map((product) => (
            <ProductAdminCard key={product.id} product={product} />
          ))}
          {products.length === 0 && (
            <p className="text-[11px] text-plum">Belum ada produk yang dijual di batch ini.</p>
          )}
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className={`${cardClassName} flex flex-col gap-[13px] p-5`}>
          <h2 className="text-[17px]/[1.25] font-extrabold text-ink">Slot pickup</h2>
          <p className="text-[11px] text-plum">Lokasi: {batch.pickupLocation || "belum diatur"}</p>
          <ul className="flex flex-col gap-[13px]">
            {slots.map((slot) => (
              <li
                key={slot.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-vanilla px-3 py-[11px]"
              >
                <span className="text-[11px] font-bold text-ink">
                  {formatWeekday(slot.startsAt)}, {formatWindow(slot.startsAt, slot.endsAt)}
                </span>
                <span className="shrink-0 text-[10px] font-bold text-deep-ube">
                  {slot.filled} / {slot.capacity} terisi{slot.active ? "" : " · nonaktif"}
                </span>
              </li>
            ))}
            {slots.length === 0 && (
              <li className="text-[11px] text-plum">Belum ada slot pickup.</li>
            )}
          </ul>
          <button type="button" onClick={() => setDialog("slots")} className={textActionClassName}>
            {"Kelola slot & kapasitas  →"}
          </button>
        </section>

        <section className={`${cardClassName} flex flex-col gap-[13px] p-5`}>
          <h2 className="text-[17px]/[1.25] font-extrabold text-ink">Area &amp; jadwal delivery</h2>
          <p className="text-[11px] text-plum">
            Ongkir dihitung dan ditampilkan sebelum invoice dibuat.
          </p>
          <ul className="flex flex-col gap-[13px]">
            {zones.map((zone) => (
              <li
                key={zone.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-vanilla px-3 py-2.5"
              >
                <div className="flex flex-col gap-[3px]">
                  <span className="text-[11px] font-bold text-ink">
                    {zone.name}
                    {zone.active ? "" : " · nonaktif"}
                  </span>
                  <span className="text-[10px] text-plum">
                    {formatWindow(zone.windowStartsAt, zone.windowEndsAt)}
                  </span>
                </div>
                <span className="shrink-0 text-xs font-extrabold text-deep-ube">
                  {formatRupiah(zone.fee)}
                </span>
              </li>
            ))}
            {zones.length === 0 && (
              <li className="text-[11px] text-plum">Belum ada area delivery.</li>
            )}
          </ul>
          <button type="button" onClick={() => setDialog("zones")} className={textActionClassName}>
            {"Kelola zona, ongkir & kapasitas  →"}
          </button>
        </section>
      </div>

      <p className="max-w-[930px] border-t border-ube-line pt-[13px] text-[11px] text-plum">
        Perubahan harga berlaku untuk invoice baru saja. Tutup batch menghentikan pesanan baru,
        tetapi invoice lama tetap dapat dibayar hingga tenggatnya.
      </p>

      <BatchSettingsDialog open={dialog === "settings"} onClose={close} batch={batch} />
      <AddProductDialog
        open={dialog === "product"}
        onClose={close}
        batchId={batch.id}
        candidates={allProducts.filter(({ id }) => !productIds.has(id))}
      />
      <PickupSlotsDialog
        open={dialog === "slots"}
        onClose={close}
        batchId={batch.id}
        slots={slots}
      />
      <DeliveryZonesDialog
        open={dialog === "zones"}
        onClose={close}
        batchId={batch.id}
        zones={zones}
      />
    </AdminPage>
  );
}

/** Capacity of the first capacity-limited product, e.g. "KAPASITAS LUMPIA 126 / 200". */
function capacityMetric(products: BatchProduct[]) {
  const limited = products.find((product) => product.capacity != null);
  if (limited?.capacity != null) {
    return {
      label: `KAPASITAS ${limited.name.split(" ")[0]?.toUpperCase()}`,
      value: `${limited.sold} / ${limited.capacity}`,
      detail: `${Math.max(0, limited.capacity - limited.sold)} ${limited.unit} tersisa`,
    };
  }
  const sold = products.reduce((total, product) => total + product.sold, 0);
  return { label: "KAPASITAS", value: "Tanpa batas", detail: `${sold} item terpesan` };
}

function BatchBanner({
  title,
  schedule,
  action,
  onAction,
}: {
  title: string;
  schedule: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] bg-vanilla px-5 py-4">
      <div className="flex flex-col gap-[5px]">
        <h2 className="text-[17px]/[1.25] font-extrabold text-ink">{title}</h2>
        <p className="text-[11px] text-plum">{schedule}</p>
      </div>
      <button
        type="button"
        onClick={onAction}
        className="rounded-full bg-deep-ube px-4 py-[11px] text-[11px]/[14px] font-bold text-vanilla transition-colors hover:bg-ube-pop"
      >
        {action}
      </button>
    </section>
  );
}

function ProductAdminCard({ product }: { product: BatchProduct }) {
  const { slug, name, summary, unit, imageUrl, published, available, price, capacity, sold } =
    product;
  const stock =
    capacity == null
      ? `Kapasitas tanpa batas · ${sold} ${unit} terpesan`
      : `${Math.max(0, capacity - sold)} ${unit} tersisa · harga tersimpan per invoice`;

  return (
    <article className={`${cardClassName} flex flex-col overflow-hidden sm:h-[190px] sm:flex-row`}>
      <img
        src={imageUrl ?? PLACEHOLDER_IMAGE}
        alt={name}
        width={160}
        height={190}
        className="h-[180px] w-full shrink-0 object-cover sm:h-full sm:w-40"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-[9px] px-[19px] py-[17px]">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[17px]/[1.25] font-extrabold text-ink">{name}</h3>
          <span className="text-[9px]/[1.25] font-extrabold text-deep-ube">
            {!published ? "DRAF" : available ? "AKTIF" : "NONAKTIF"}
          </span>
        </div>
        <p className="text-[11px] text-plum">{summary}</p>
        <p className="text-base font-extrabold text-deep-ube">
          {formatRupiah(price)} / {unit}
        </p>
        <p className="text-[10px] text-plum">{stock}</p>
        <Link to="/dashboard/batch-produk/$slug" params={{ slug }} className={textActionClassName}>
          {"Edit produk  →"}
        </Link>
      </div>
    </article>
  );
}
