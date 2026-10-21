import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ChevronUp } from "lucide-react";
import { type ReactNode, useState } from "react";

import { AdminPage, BatchStatusPill, PageHeading } from "@/components/admin/admin-page";
import { CompactMetric } from "@/components/admin/metric-card";
import { type BatchOverview, type BatchStatus, getBatchOverview } from "@/functions/batches";
import { moveProduct } from "@/functions/products";
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
import { useMutationRunner } from "./-components/fields";

export const Route = createFileRoute("/_auth/dashboard/batch-produk/")({
  loader: () => getBatchOverview(),
  head: () => ({
    meta: [{ title: "Batch & produk · ubeloom" }],
  }),
  component: BatchProductsComponent,
});

type CatalogProduct = BatchOverview["products"][number];
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
  "w-fit text-[13px] font-bold whitespace-pre text-deep-ube transition-colors hover:text-ube-pop";

function BatchProductsComponent() {
  const { current, products, deliveryAreas } = Route.useLoaderData();
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
        <ProductCatalog products={products} />
        <BatchSettingsDialog open={dialog === "settings"} onClose={close} batch={null} />
      </AdminPage>
    );
  }

  const { batch, orders, slots, zones } = current;
  const activeSlots = slots.filter((slot) => slot.active).length;
  const activeZones = zones.filter((zone) => zone.active).length;

  const metrics: { label: string; value: string; detail: string }[] = [
    {
      label: "TERPESAN",
      value: String(orders.total),
      detail: `${orders.paid} lunas · ${orders.total - orders.paid} menunggu`,
    },
    capacityMetric(products.filter((product) => product.inBatch)),
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

      <ProductCatalog
        products={products}
        action={
          <button
            type="button"
            onClick={() => setDialog("product")}
            className={textActionClassName}
          >
            + Tambah varian
          </button>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className={`${cardClassName} flex flex-col gap-[13px] p-5`}>
          <h2 className="text-[17px]/[1.25] font-extrabold text-ink">
            Slot pickup
            {!batch.pickupEnabled && <MethodOffBadge />}
          </h2>
          <p className="text-[13px] text-plum">
            Lokasi utama: {batch.pickupLocation || "belum diatur"}
          </p>
          <ul className="flex flex-col gap-[13px]">
            {slots.map((slot) => (
              <li
                key={slot.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-vanilla px-3 py-[11px]"
              >
                <div className="flex flex-col gap-[3px]">
                  <span className="text-[13px] font-bold text-ink">
                    {formatWeekday(slot.startsAt)}, {formatWindow(slot.startsAt, slot.endsAt)}
                  </span>
                  {slot.location && <span className="text-xs text-plum">{slot.location}</span>}
                </div>
                <span className="shrink-0 text-xs font-bold text-deep-ube">
                  {slot.filled} / {slot.capacity} terisi{slot.active ? "" : " · nonaktif"}
                </span>
              </li>
            ))}
            {slots.length === 0 && (
              <li className="text-[13px] text-plum">Belum ada slot pickup.</li>
            )}
          </ul>
          <button type="button" onClick={() => setDialog("slots")} className={textActionClassName}>
            {"Kelola slot, lokasi & kapasitas  →"}
          </button>
        </section>

        <section className={`${cardClassName} flex flex-col gap-[13px] p-5`}>
          <h2 className="text-[17px]/[1.25] font-extrabold text-ink">
            Jadwal delivery
            {!batch.deliveryEnabled && <MethodOffBadge />}
          </h2>
          <p className="text-[13px] text-plum">
            Area tujuan &amp; ongkir:{" "}
            <Link to="/dashboard/pengaturan" className="font-bold text-deep-ube hover:text-ube-pop">
              {deliveryAreas.length > 0
                ? `${deliveryAreas.length} area di Pengaturan`
                : "atur di Pengaturan"}
            </Link>
          </p>
          <ul className="flex flex-col gap-[13px]">
            {zones.map((zone) => (
              <li
                key={zone.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-vanilla px-3 py-[11px]"
              >
                <div className="flex flex-col gap-[3px]">
                  <span className="text-[13px] font-bold text-ink">
                    {formatWeekday(zone.windowStartsAt)},{" "}
                    {formatWindow(zone.windowStartsAt, zone.windowEndsAt)}
                  </span>
                  <span className="text-xs text-plum">
                    {zone.areas.length > 0 ? zone.areas.join(", ") : "Semua area"}
                  </span>
                </div>
                {!zone.active && (
                  <span className="shrink-0 text-xs font-bold text-deep-ube">nonaktif</span>
                )}
              </li>
            ))}
            {zones.length === 0 && (
              <li className="text-[13px] text-plum">Belum ada jadwal delivery.</li>
            )}
          </ul>
          <button type="button" onClick={() => setDialog("zones")} className={textActionClassName}>
            {"Kelola jadwal delivery  →"}
          </button>
        </section>
      </div>

      <p className="max-w-[930px] border-t border-ube-line pt-[13px] text-[13px] text-plum">
        Perubahan harga berlaku untuk invoice baru saja. Tutup batch menghentikan pesanan baru,
        tetapi invoice lama tetap dapat dibayar hingga tenggatnya.
      </p>

      <BatchSettingsDialog open={dialog === "settings"} onClose={close} batch={batch} />
      <AddProductDialog
        open={dialog === "product"}
        onClose={close}
        batchId={batch.id}
        candidates={products.filter((product) => !product.inBatch)}
      />
      <PickupSlotsDialog
        open={dialog === "slots"}
        onClose={close}
        batchId={batch.id}
        slots={slots}
        defaultLocation={batch.pickupLocation}
      />
      <DeliveryZonesDialog
        open={dialog === "zones"}
        onClose={close}
        batchId={batch.id}
        zones={zones}
        deliveryAreas={deliveryAreas}
      />
    </AdminPage>
  );
}

function MethodOffBadge() {
  return (
    <span className="ml-2 rounded-full bg-vanilla px-2 py-0.5 align-middle text-xs font-bold text-plum">
      Nonaktif · atur di pengaturan batch
    </span>
  );
}

/** Units booked against the capacity of every capacity-limited product in the batch. */
function capacityMetric(products: CatalogProduct[]) {
  const limited = products.filter((product) => product.capacity != null);
  if (limited.length > 0) {
    const capacity = limited.reduce((total, product) => total + (product.capacity ?? 0), 0);
    const sold = limited.reduce((total, product) => total + product.sold, 0);
    const unlimited = products.length - limited.length;
    return {
      label: "KAPASITAS BATCH",
      value: `${sold} / ${capacity}`,
      detail: `${Math.max(0, capacity - sold)} unit tersisa${unlimited > 0 ? ` · ${unlimited} produk tanpa batas` : ""}`,
    };
  }
  const sold = products.reduce((total, product) => total + product.sold, 0);
  return { label: "KAPASITAS BATCH", value: "Tanpa batas", detail: `${sold} item terpesan` };
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
        <p className="text-[13px] text-plum">{schedule}</p>
      </div>
      <button
        type="button"
        onClick={onAction}
        className="rounded-full bg-deep-ube px-4 py-[11px] text-[13px]/[14px] font-bold text-vanilla transition-colors hover:bg-ube-pop"
      >
        {action}
      </button>
    </section>
  );
}

/** Every product in storefront order; the landing and menu pages list the published ones. */
function ProductCatalog({ products, action }: { products: CatalogProduct[]; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[19px]/[1.25] font-extrabold text-ink">Produk di storefront</h2>
          <p className="text-[13px] text-plum">
            Urutan di sini sama dengan urutan di landing page dan menu. Produk draf tidak tampil.
          </p>
        </div>
        {action}
      </div>

      <div className="grid gap-3.5 xl:grid-cols-2">
        {products.map((product, index) => (
          <ProductAdminCard
            key={product.id}
            product={product}
            first={index === 0}
            last={index === products.length - 1}
          />
        ))}
        {products.length === 0 && <p className="text-[13px] text-plum">Belum ada produk.</p>}
      </div>
    </section>
  );
}

function productStatus({ published, inBatch, available }: CatalogProduct) {
  if (!published) return "DRAF";
  if (!inBatch) return "DI LUAR BATCH";
  return available ? "AKTIF" : "NONAKTIF";
}

function productStock({ published, inBatch, unit, capacity, sold }: CatalogProduct) {
  if (!inBatch) {
    return published
      ? "Tidak dijual di batch ini · tampil HABIS di storefront"
      : "Tidak dijual di batch ini";
  }
  return capacity == null
    ? `Kapasitas tanpa batas · ${sold} ${unit} terpesan`
    : `${Math.max(0, capacity - sold)} ${unit} tersisa · harga tersimpan per invoice`;
}

const moveButtonClassName =
  "grid size-7 place-items-center rounded-full border border-ube-line text-deep-ube transition-colors hover:bg-vanilla disabled:pointer-events-none disabled:opacity-35";

function ProductAdminCard({
  product,
  first,
  last,
}: {
  product: CatalogProduct;
  first: boolean;
  last: boolean;
}) {
  const { id, slug, name, summary, unit, image, price } = product;
  const run = useMutationRunner();
  const [moving, setMoving] = useState(false);

  const move = async (direction: "up" | "down") => {
    setMoving(true);
    await run(() => moveProduct({ data: { id, direction } }), "Urutan produk diperbarui");
    setMoving(false);
  };

  return (
    <article className={`${cardClassName} flex flex-col overflow-hidden sm:h-[190px] sm:flex-row`}>
      <img
        src={image}
        alt={name}
        width={160}
        height={190}
        className="h-[180px] w-full shrink-0 object-cover sm:h-full sm:w-40"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-[9px] px-[19px] py-[17px]">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[17px]/[1.25] font-extrabold text-ink">{name}</h3>
          <span className="shrink-0 text-[11px]/[1.25] font-extrabold text-deep-ube">
            {productStatus(product)}
          </span>
        </div>
        <p className="text-[13px] text-plum">{summary}</p>
        <p className="text-base font-extrabold text-deep-ube">
          {formatRupiah(price)} / {unit}
        </p>
        <p className="text-xs text-plum">{productStock(product)}</p>
        <div className="mt-auto flex items-center justify-between gap-3">
          <Link
            to="/dashboard/batch-produk/$slug"
            params={{ slug }}
            className={textActionClassName}
          >
            {"Edit produk  →"}
          </Link>
          <div className="flex gap-1.5">
            <button
              type="button"
              aria-label={`Naikkan ${name}`}
              disabled={first || moving}
              onClick={() => move("up")}
              className={moveButtonClassName}
            >
              <ChevronUp aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              aria-label={`Turunkan ${name}`}
              disabled={last || moving}
              onClick={() => move("down")}
              className={moveButtonClassName}
            >
              <ChevronDown aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
