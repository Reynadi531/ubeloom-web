import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronDown, CircleAlert, ExternalLink, Info, Save, Upload } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/admin-page";
import {
  PLACEHOLDER_IMAGE,
  type ProductDisplay,
  type ProductEditorData,
  type ProductIcon,
  getProductEditor,
  productIcons,
  saveProduct,
  saveProductSchema,
} from "@/functions/products";
import { formatRupiah } from "@/lib/format";

import { categoryOptions, unitOptions } from "./-components/batch-dialogs";
import {
  Field,
  OptionSelect,
  fieldClassName,
  firstIssue,
  inputClassName,
  parseOptionalInt,
  secondaryButtonClassName,
  useMutationRunner,
} from "./-components/fields";

const tabs = [
  { id: "info", label: "Informasi produk" },
  { id: "display", label: "Tampilan detail" },
  { id: "availability", label: "Ketersediaan" },
] as const;

type TabId = (typeof tabs)[number]["id"];
type EditorProduct = ProductEditorData["product"];
type EditorBatch = NonNullable<ProductEditorData["batch"]>;

type Availability = {
  inBatch: boolean;
  available: boolean;
  /** Raw input; empty keeps the product's default price. */
  price: string;
  /** Raw input; empty means unlimited. */
  capacity: string;
};

export const Route = createFileRoute("/_auth/dashboard/batch-produk/$slug")({
  loader: ({ params }) => getProductEditor({ data: { slug: params.slug } }),
  head: () => ({
    meta: [{ title: "Edit detail produk · ubeloom" }],
  }),
  component: ProductEditorComponent,
  notFoundComponent: ProductNotFound,
});

const iconLabels: Record<ProductIcon, string> = {
  sparkles: "Kilau",
  package: "Paket",
  "chef-hat": "Koki",
  heart: "Hati",
  "map-pin": "Lokasi",
  snowflake: "Dingin",
  "cup-soda": "Minuman",
};
const iconOptions = productIcons.map((value) => ({ value, label: iconLabels[value] }));

function ProductEditorComponent() {
  const data = Route.useLoaderData();

  // Remount on product switch so the form resets to that product's content.
  return <ProductEditor key={data.product.id} data={data} />;
}

function toAvailability(batch: ProductEditorData["batch"]): Availability {
  return {
    inBatch: !!batch?.entry,
    available: batch?.entry?.available ?? true,
    price: batch?.entry?.price == null ? "" : String(batch.entry.price),
    capacity: batch?.entry?.capacity == null ? "" : String(batch.entry.capacity),
  };
}

function ProductEditor({ data }: { data: ProductEditorData }) {
  const run = useMutationRunner();
  const [content, setContent] = useState<EditorProduct>(data.product);
  const [availability, setAvailability] = useState(() => toAvailability(data.batch));
  const [activeTab, setActiveTab] = useState<TabId>("info");
  const [saving, setSaving] = useState(false);
  const tabsId = useId();

  const update = <K extends keyof EditorProduct>(key: K, value: EditorProduct[K]) =>
    setContent((current) => ({ ...current, [key]: value }));
  const updateDisplay = <K extends keyof ProductDisplay>(key: K, value: ProductDisplay[K]) =>
    setContent((current) => ({ ...current, display: { ...current.display, [key]: value } }));

  const save = async () => {
    // The schema strips read-only fields (slug, code).
    const parsed = saveProductSchema.safeParse({
      ...content,
      availability: data.batch
        ? {
            batchId: data.batch.id,
            inBatch: availability.inBatch,
            available: availability.available,
            price: parseOptionalInt(availability.price),
            capacity: parseOptionalInt(availability.capacity),
          }
        : undefined,
    });
    if (!parsed.success) return void toast.error(firstIssue(parsed.error));
    setSaving(true);
    await run(() => saveProduct({ data: parsed.data }), "Perubahan produk disimpan");
    setSaving(false);
  };

  const image = content.imageUrl || PLACEHOLDER_IMAGE;
  const batchPrice = parseOptionalInt(availability.price);
  const previewPrice =
    availability.inBatch && batchPrice != null ? batchPrice : (content.price ?? 0);
  const priceHint =
    data.batch && availability.inBatch && batchPrice != null
      ? `Batch ${data.batch.name} memakai harga batch ${formatRupiah(batchPrice)}, bukan harga dasar. Kosongkan harga batch di Ketersediaan agar harga dasar dipakai.`
      : "Harga dasar; bisa diganti per batch di Ketersediaan.";

  const sidebar = (
    <div className="flex min-w-0 flex-col gap-[15px]">
      <LivePreview
        image={content.imageWideUrl || image}
        name={content.name}
        collection={
          content.display.collection ||
          `MENU  /  ${
            data.batch?.status !== "open"
              ? "PREORDER DITUTUP"
              : availability.inBatch && availability.available
                ? "TERSEDIA"
                : "HABIS"
          }`
        }
        tagline={content.tagline}
        price={formatRupiah(previewPrice)}
        unit={content.unit}
        description={content.description}
      />
      <PublicationStatus
        published={content.published}
        onToggle={() => update("published", !content.published)}
      />
    </div>
  );

  return (
    <AdminPage>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-bold tracking-[1.2px] whitespace-pre text-ube-pop">
            <Link to="/dashboard/batch-produk" className="transition-colors hover:text-deep-ube">
              BATCH &amp; PRODUK
            </Link>
            {"   /   DETAIL PRODUK"}
          </p>
          <h1 className="font-display text-[29px]/[1.2] font-bold text-ink">Edit detail produk</h1>
          <p className="text-xs text-plum">
            Atur informasi yang tampil di halaman produk pelanggan.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/menu/$slug"
            params={{ slug: content.slug }}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-[7px] rounded-[9px] border border-ube-line px-4 py-[11px] text-xs/[15px] font-bold text-deep-ube transition-colors hover:bg-vanilla"
          >
            <ExternalLink className="size-[15px]" />
            Lihat halaman
          </Link>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-[9px] bg-deep-ube px-[18px] py-3 text-xs/[15px] font-bold text-white transition-colors hover:bg-ube-pop disabled:opacity-50"
          >
            <Save className="size-[15px]" />
            {saving ? "Menyimpan…" : "Simpan perubahan"}
          </button>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Bagian editor produk"
        className="flex gap-[25px] overflow-x-auto border-b border-ube-line"
      >
        {tabs.map(({ id, label }) => {
          const active = id === activeTab;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`${tabsId}-${id}-tab`}
              aria-selected={active}
              aria-controls={`${tabsId}-${id}-panel`}
              onClick={() => setActiveTab(id)}
              className={`flex shrink-0 flex-col gap-3 px-0.5 pb-3.5 text-xs/[15px] whitespace-nowrap transition-colors ${active ? "font-bold text-deep-ube" : "font-semibold text-plum hover:text-deep-ube"}`}
            >
              {label}
              <span
                aria-hidden
                className={`h-0.5 w-full ${active ? "bg-deep-ube" : "bg-transparent"}`}
              />
            </button>
          );
        })}
      </div>

      <SelectedProduct
        image={image}
        name={content.name}
        code={content.code}
        category={categoryOptions.find(({ value }) => value === content.category)?.label ?? ""}
        published={content.published}
        slug={content.slug}
        products={data.products}
      />

      <div
        role="tabpanel"
        id={`${tabsId}-${activeTab}-panel`}
        aria-labelledby={`${tabsId}-${activeTab}-tab`}
      >
        <div className="grid items-start gap-[22px] xl:grid-cols-[596fr_384fr]">
          {activeTab === "info" && (
            <InfoTab content={content} image={image} priceHint={priceHint} update={update} />
          )}
          {activeTab === "display" && (
            <DisplayTab display={content.display} updateDisplay={updateDisplay} />
          )}
          {activeTab === "availability" && (
            <AvailabilityTab
              batch={data.batch}
              unit={content.unit}
              defaultPrice={content.price}
              availability={availability}
              onChange={setAvailability}
            />
          )}
          {sidebar}
        </div>
      </div>

      <p className="flex items-center gap-2 border-t border-ube-line pt-4 text-[11px] text-plum">
        <CircleAlert aria-hidden className="size-4 shrink-0 text-ube-pop" />
        Pratinjau memperlihatkan konten saat ini. Simpan perubahan untuk memperbarui halaman produk
        yang tayang.
      </p>
    </AdminPage>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-[5px]">
      <h2 className="font-display text-[19px]/[1.2] font-bold text-ink">{title}</h2>
      <p className="text-[11px] text-plum">{description}</p>
    </div>
  );
}

function InfoTab({
  content,
  image,
  priceHint,
  update,
}: {
  content: EditorProduct;
  image: string;
  priceHint: string;
  update: <K extends keyof EditorProduct>(key: K, value: EditorProduct[K]) => void;
}) {
  const [editingImage, setEditingImage] = useState(false);

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <SectionTitle
        title="Konten halaman detail"
        description="Perubahan di sini akan memperbarui halaman produk pelanggan."
      />

      <div className="flex flex-col gap-3 rounded-xl border border-ube-line p-3">
        <div className="flex items-center gap-[15px]">
          <img
            src={image}
            alt={content.name}
            width={98}
            height={98}
            className="size-[98px] shrink-0 rounded-lg object-cover"
          />
          <div className="flex min-w-0 flex-col gap-[7px]">
            <p className="text-[13px] font-bold text-ink">Foto utama produk</p>
            <p className="text-[11px] text-plum">Tampil di katalog dan halaman detail.</p>
            <button
              type="button"
              aria-expanded={editingImage}
              onClick={() => setEditingImage((value) => !value)}
              className={`${secondaryButtonClassName} w-fit`}
            >
              <Upload className="size-3.5" />
              Ganti foto
            </button>
          </div>
        </div>
        {editingImage && (
          <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
            <Field label="URL foto utama" hint="Path seperti /images/produk.webp atau URL https.">
              <input
                value={content.imageUrl}
                onChange={(event) => update("imageUrl", event.target.value)}
                className={inputClassName}
              />
            </Field>
            <Field label="URL foto lebar (desktop)" hint="Opsional; kosongkan untuk foto utama.">
              <input
                value={content.imageWideUrl}
                onChange={(event) => update("imageWideUrl", event.target.value)}
                className={inputClassName}
              />
            </Field>
          </div>
        )}
      </div>

      <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
        <Field label="Nama produk">
          <input
            value={content.name}
            onChange={(event) => update("name", event.target.value)}
            className={inputClassName}
          />
        </Field>
        <Field label="Kategori">
          <OptionSelect
            options={categoryOptions}
            value={content.category}
            onChange={(value) => update("category", value)}
          />
        </Field>
        <Field label={`Harga per ${content.unit}`} hint={priceHint}>
          <input
            value={formatRupiah(content.price)}
            inputMode="numeric"
            onChange={(event) => update("price", parseOptionalInt(event.target.value) ?? 0)}
            className={inputClassName}
          />
        </Field>
        <Field label="Satuan">
          <OptionSelect
            options={unitOptions}
            value={content.unit}
            onChange={(value) => update("unit", value)}
          />
        </Field>
      </div>

      <Field label="Kalimat pembuka">
        <input
          value={content.tagline}
          onChange={(event) => update("tagline", event.target.value)}
          className={inputClassName}
        />
      </Field>

      <Field label="Deskripsi panjang" hint="Ditampilkan di bawah harga pada halaman detail.">
        <textarea
          value={content.description}
          onChange={(event) => update("description", event.target.value)}
          className={`${fieldClassName} h-[91px] resize-none py-3 text-xs/[1.45]`}
        />
      </Field>

      <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
        <Field label="Cara menikmati">
          <input
            value={content.serving}
            onChange={(event) => update("serving", event.target.value)}
            className={inputClassName}
          />
        </Field>
        <Field label="Catatan alergen">
          <input
            value={content.allergen}
            onChange={(event) => update("allergen", event.target.value)}
            className={inputClassName}
          />
        </Field>
      </div>
    </section>
  );
}

function DisplayTab({
  display,
  updateDisplay,
}: {
  display: ProductDisplay;
  updateDisplay: <K extends keyof ProductDisplay>(key: K, value: ProductDisplay[K]) => void;
}) {
  const { highlights, facts } = display;

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <SectionTitle
        title="Tampilan detail"
        description="Atur label, sorotan dan informasi tambahan di halaman detail serta kartu menu."
      />

      <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
        <Field label="Label koleksi" hint="Contoh: MENU FAVORIT  /  PREORDER DIBUKA">
          <input
            value={display.collection}
            onChange={(event) => updateDisplay("collection", event.target.value)}
            className={inputClassName}
          />
        </Field>
        <Field label="Varian" hint="Tampil di kartu menu, contoh: Original · 1 kotak">
          <input
            value={display.variant}
            onChange={(event) => updateDisplay("variant", event.target.value)}
            className={inputClassName}
          />
        </Field>
      </div>

      <ListEditor
        title="Sorotan di bawah deskripsi"
        addLabel="+ Tambah sorotan"
        max={4}
        items={highlights}
        onChange={(items) => updateDisplay("highlights", items)}
        create={() => ({ icon: "sparkles", title: "", note: "" })}
        render={(item, set) => (
          <>
            <Field label="Judul">
              <input
                value={item.title}
                onChange={(event) => set({ ...item, title: event.target.value })}
                className={inputClassName}
              />
            </Field>
            <Field label="Catatan">
              <input
                value={item.note}
                onChange={(event) => set({ ...item, note: event.target.value })}
                className={inputClassName}
              />
            </Field>
          </>
        )}
      />

      <Field label="Judul bagian informasi">
        <input
          value={display.detailsTitle}
          onChange={(event) => updateDisplay("detailsTitle", event.target.value)}
          className={inputClassName}
        />
      </Field>

      <ListEditor
        title="Poin informasi"
        addLabel="+ Tambah poin"
        max={6}
        items={facts}
        onChange={(items) => updateDisplay("facts", items)}
        create={() => ({ icon: "heart", title: "", description: "" })}
        render={(item, set) => (
          <>
            <Field label="Judul">
              <input
                value={item.title}
                onChange={(event) => set({ ...item, title: event.target.value })}
                className={inputClassName}
              />
            </Field>
            <Field label="Keterangan">
              <textarea
                value={item.description}
                onChange={(event) => set({ ...item, description: event.target.value })}
                className={`${fieldClassName} h-[64px] resize-none py-2.5 text-xs/[1.45]`}
              />
            </Field>
          </>
        )}
      />
    </section>
  );
}

/** Editable list of icon + text rows (highlights, facts). */
function ListEditor<T extends { icon: ProductIcon }>({
  title,
  addLabel,
  max,
  items,
  onChange,
  create,
  render,
}: {
  title: string;
  addLabel: string;
  max: number;
  items: T[];
  onChange: (items: T[]) => void;
  create: () => T;
  render: (item: T, set: (item: T) => void) => ReactNode;
}) {
  const set = (index: number, item: T) =>
    onChange(items.map((current, position) => (position === index ? item : current)));

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold text-ink">{title}</p>
        <button
          type="button"
          disabled={items.length >= max}
          onClick={() => onChange([...items, create()])}
          className="text-[11px] font-bold text-deep-ube transition-colors hover:text-ube-pop disabled:opacity-40"
        >
          {addLabel}
        </button>
      </div>
      {items.length === 0 && <p className="text-[11px] text-plum">Belum ada isi.</p>}
      {items.map((item, index) => (
        <div
          // Rows have no stable id; index keys are fine since rows only append/remove.
          key={index}
          className="grid items-start gap-x-3 gap-y-3 rounded-xl border border-ube-line p-3 sm:grid-cols-[120px_1fr_1fr_auto]"
        >
          <Field label="Ikon">
            <OptionSelect
              options={iconOptions}
              value={item.icon}
              onChange={(icon) => set(index, { ...item, icon })}
            />
          </Field>
          {render(item, (next) => set(index, next))}
          <button
            type="button"
            onClick={() => onChange(items.filter((_, position) => position !== index))}
            className={`${secondaryButtonClassName} sm:mt-[21px]`}
          >
            Hapus
          </button>
        </div>
      ))}
    </div>
  );
}

function AvailabilityTab({
  batch,
  unit,
  defaultPrice,
  availability,
  onChange,
}: {
  batch: EditorBatch | null;
  unit: string;
  defaultPrice: number;
  availability: Availability;
  onChange: (availability: Availability) => void;
}) {
  if (!batch) {
    return (
      <section className="flex flex-col gap-[5px] rounded-xl border border-dashed border-ube-line px-5 py-10 text-center">
        <h2 className="font-display text-[19px]/[1.2] font-bold text-ink">Belum ada batch</h2>
        <p className="text-[11px] text-plum">
          Buat batch di halaman Batch &amp; produk untuk mengatur kapasitas dan harga batch.
        </p>
      </section>
    );
  }

  const set = <K extends keyof Availability>(key: K, value: Availability[K]) =>
    onChange({ ...availability, [key]: value });
  const capacity = parseOptionalInt(availability.capacity);

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <SectionTitle
        title="Ketersediaan"
        description={`Atur harga dan kapasitas produk untuk batch ${batch.name}.`}
      />

      <SwitchRow
        title="Dijual di batch ini"
        description={
          availability.inBatch
            ? "Produk masuk daftar jual batch ini."
            : "Produk tidak dijual di batch ini."
        }
        checked={availability.inBatch}
        onToggle={() => set("inBatch", !availability.inBatch)}
      />

      {availability.inBatch && (
        <>
          <SwitchRow
            title="Bisa dipesan"
            description={
              availability.available
                ? "Pelanggan bisa memesan produk ini selama batch dibuka."
                : "Produk tampil sebagai habis dan tidak bisa dipesan."
            }
            checked={availability.available}
            onToggle={() => set("available", !availability.available)}
          />
          <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
            <Field
              label="Harga batch"
              hint={`Kosongkan untuk memakai harga dasar ${formatRupiah(defaultPrice)}.`}
            >
              <input
                value={availability.price === "" ? "" : formatRupiah(Number(availability.price))}
                inputMode="numeric"
                placeholder={formatRupiah(defaultPrice)}
                onChange={(event) =>
                  set("price", String(parseOptionalInt(event.target.value) ?? ""))
                }
                className={inputClassName}
              />
            </Field>
            <Field label={`Kapasitas (${unit})`} hint="Kosongkan bila tidak dibatasi.">
              <input
                value={availability.capacity}
                inputMode="numeric"
                onChange={(event) =>
                  set("capacity", String(parseOptionalInt(event.target.value) ?? ""))
                }
                className={inputClassName}
              />
            </Field>
          </div>
          <p className="flex items-center gap-[7px] rounded-lg bg-vanilla px-3 py-[11px] text-[11px] font-bold text-deep-ube">
            <Info aria-hidden className="size-3.5 shrink-0" />
            {batch.sold} {unit} terpesan
            {capacity == null ? "" : ` · ${Math.max(0, capacity - batch.sold)} ${unit} tersisa`}
          </p>
        </>
      )}
    </section>
  );
}

function SwitchRow({
  title,
  description,
  checked,
  onToggle,
}: {
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const titleId = useId();
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-ube-line p-[17px]">
      <div className="flex flex-col gap-1">
        <p id={titleId} className="text-[13px] font-bold text-ink">
          {title}
        </p>
        <p className="text-[11px]/[1.45] text-plum">{description}</p>
      </div>
      <Switch checked={checked} onToggle={onToggle} labelledBy={titleId} />
    </div>
  );
}

function Switch({
  checked,
  onToggle,
  labelledBy,
}: {
  checked: boolean;
  onToggle: () => void;
  labelledBy: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={onToggle}
      className={`flex h-5 w-[34px] shrink-0 items-center rounded-full p-[3px] transition-colors ${checked ? "justify-end bg-deep-ube" : "justify-start bg-ube-line"}`}
    >
      <span aria-hidden className="size-3.5 rounded-full bg-white" />
    </button>
  );
}

function SelectedProduct({
  image,
  name,
  code,
  category,
  published,
  slug,
  products,
}: {
  image: string;
  name: string;
  code: string;
  category: string;
  published: boolean;
  slug: string;
  products: { slug: string; name: string }[];
}) {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[72px] flex-wrap items-center justify-between gap-3.5 border-b border-ube-line py-[7px]">
      <div className="flex min-w-0 items-center gap-[13px]">
        <img
          src={image}
          alt=""
          width={58}
          height={58}
          className="size-[58px] shrink-0 rounded-lg object-cover"
        />
        <div className="flex min-w-0 flex-col gap-[3px]">
          <h2 className="truncate text-base/[1.25] font-bold text-ink">{name}</h2>
          <p className="text-[11px] whitespace-pre text-plum">
            {code}
            {"  ·  "}
            {category}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3.5">
        <p className="flex items-center gap-1.5 rounded-[7px] bg-[#f5edf3] px-2.5 py-[7px] text-[11px]/[14px] font-bold text-deep-ube">
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${published ? "bg-ube-pop" : "bg-plum"}`}
          />
          {published ? "Tayang" : "Draf"}
        </p>
        <label className="relative flex items-center gap-[15px] rounded-lg border border-ube-line px-3 py-2.5 text-xs/[15px] font-semibold text-ink transition-colors focus-within:border-ube-pop hover:bg-vanilla">
          Ganti produk
          <ChevronDown aria-hidden className="size-[15px] text-plum" />
          <select
            aria-label="Ganti produk"
            value={slug}
            onChange={(event) =>
              navigate({
                to: "/dashboard/batch-produk/$slug",
                params: { slug: event.target.value },
              })
            }
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {products.map((product) => (
              <option key={product.slug} value={product.slug}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function LivePreview({
  image,
  name,
  collection,
  tagline,
  price,
  unit,
  description,
}: {
  image: string;
  name: string;
  collection: string;
  tagline: string;
  price: string;
  unit: string;
  description: string;
}) {
  return (
    <section className="flex flex-col gap-[15px]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-base/[1.2] font-bold text-ink">Pratinjau halaman</h2>
          <p className="text-[11px] text-plum">Tampilan desktop untuk pelanggan</p>
        </div>
        <span className="rounded-md bg-[#f5edf3] px-[9px] py-1.5 text-[9px]/[11px] font-bold tracking-[0.7px] text-deep-ube">
          LIVE PREVIEW
        </span>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-ube-line bg-white">
        <img
          src={image}
          alt={name}
          width={384}
          height={210}
          className="h-[210px] w-full object-cover"
        />
        <div className="flex flex-col gap-[9px] px-5 py-[19px]">
          <p className="text-[9px] font-bold tracking-[0.5px] whitespace-pre text-ube-pop">
            {collection}
          </p>
          <p className="font-display text-2xl/[1.2] font-bold break-words text-deep-ube">{name}</p>
          <p className="text-xs font-semibold text-ink">{tagline}</p>
          <p className="font-data text-base font-bold whitespace-pre-wrap text-deep-ube">
            {`${price}  / ${unit.toLowerCase()}`}
          </p>
          <span aria-hidden className="h-px bg-ube-line" />
          <p className="text-[11px]/[1.5] break-words text-plum">{description}</p>
          <span
            aria-hidden
            className="flex h-9 items-center justify-center rounded-full bg-deep-ube text-[11px] font-bold whitespace-pre text-white"
          >
            {"Pesan sekarang  →"}
          </span>
        </div>
      </div>
    </section>
  );
}

function PublicationStatus({ published, onToggle }: { published: boolean; onToggle: () => void }) {
  const titleId = useId();

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-ube-line p-[17px]">
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-[13px] font-bold text-ink">
          Status publikasi
        </h2>
        <Switch checked={published} onToggle={onToggle} labelledBy={titleId} />
      </div>
      <p className="text-[11px]/[1.45] text-plum">
        {published
          ? "Produk ini tampil di katalog dan bisa dipesan selama batch preorder dibuka."
          : "Produk ini disembunyikan dari katalog dan tidak bisa dipesan pelanggan."}
      </p>
      <p className="flex items-center gap-[7px] text-[10px] text-plum">
        <Info aria-hidden className="size-3.5 shrink-0" />
        Simpan perubahan untuk memperbarui halaman.
      </p>
    </section>
  );
}

function ProductNotFound() {
  return (
    <AdminPage>
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-ube-line px-5 py-10">
        <p className="text-[10px] font-bold tracking-[1.2px] text-ube-pop">BATCH &amp; PRODUK</p>
        <h1 className="font-display text-[24px]/[1.2] font-bold text-ink">
          Produk tidak ditemukan
        </h1>
        <p className="text-[11px] text-plum">
          Produk dengan alamat ini tidak ada atau sudah diganti namanya.
        </p>
        <Link
          to="/dashboard/batch-produk"
          className="text-[11px] font-bold text-deep-ube transition-colors hover:text-ube-pop"
        >
          {"← Kembali ke batch & produk"}
        </Link>
      </div>
    </AdminPage>
  );
}
