import { Link, createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { ChevronDown, CircleAlert, ExternalLink, Info, Save, Upload } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import { AdminPage } from "@/components/admin/admin-page";
import type { Product } from "@/components/storefront/product-card";
import { products } from "@/components/storefront/products";

type ProductContent = {
  code: string;
  category: string;
  price: string;
  unit: string;
  tagline: string;
  description: string;
  serving: string;
  allergen: string;
  published: boolean;
};

// Sample data until product detail content lives in the database.
const productContents: Record<string, ProductContent> = {
  "lumpia-ubi-goreng": {
    code: "PRD-001",
    category: "Camilan",
    price: "Rp 28.000",
    unit: "Porsi",
    tagline: "Renyah di luar, lembut manis di dalam.",
    description:
      "Lumpia ubi hangat dengan kulit keemasan yang garing dan isian ubi manis nan lembut. Cocok untuk jeda sore, berbagi dengan teman, atau dinikmati sendiri.",
    serving: "Terbaik disantap hangat",
    allergen: "Konfirmasi sebelum rilis",
    published: true,
  },
  "sparkling-starfruit": {
    code: "PRD-002",
    category: "Minuman",
    price: "Rp 16.000",
    unit: "Cup",
    tagline: "Segar bergelembung, manis asam belimbing.",
    description:
      "Belimbing, chia seed, air soda dan es dalam satu cup. Teman segar untuk lumpia hangat di siang hari.",
    serving: "Sajikan dingin, konsumsi hari yang sama",
    allergen: "Konfirmasi sebelum rilis",
    published: true,
  },
};

const categories = ["Camilan", "Minuman"] as const;
const units = ["Porsi", "Kotak", "Cup"] as const;

const tabs = [
  { id: "info", label: "Informasi produk" },
  { id: "display", label: "Tampilan detail" },
  { id: "availability", label: "Ketersediaan" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export const Route = createFileRoute("/_auth/dashboard/batch-produk/$slug")({
  loader: ({ params }) => {
    const product = products.find(({ slug }) => slug === params.slug);
    const content = productContents[params.slug];
    if (!product || !content) throw notFound();
    return { product, content };
  },
  head: () => ({
    meta: [{ title: "Edit detail produk · ubeloom" }],
  }),
  component: ProductEditorComponent,
});

const fieldClassName =
  "w-full rounded-lg border border-ube-line bg-white px-3 text-xs text-ink outline-none transition-colors focus:border-ube-pop";
const inputClassName = `${fieldClassName} h-[41px] font-medium`;

function ProductEditorComponent() {
  const { product, content } = Route.useLoaderData();

  // Remount on product switch so the form resets to that product's content.
  return <ProductEditor key={product.slug} product={product} initialContent={content} />;
}

function ProductEditor({
  product,
  initialContent,
}: {
  product: Product;
  initialContent: ProductContent;
}) {
  const [name, setName] = useState(product.name);
  const [content, setContent] = useState(initialContent);
  const [activeTab, setActiveTab] = useState<TabId>("info");
  const tabsId = useId();

  const update = <K extends keyof ProductContent>(key: K, value: ProductContent[K]) =>
    setContent((current) => ({ ...current, [key]: value }));

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
            params={{ slug: product.slug }}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-[7px] rounded-[9px] border border-ube-line px-4 py-[11px] text-xs/[15px] font-bold text-deep-ube transition-colors hover:bg-vanilla"
          >
            <ExternalLink className="size-[15px]" />
            Lihat halaman
          </Link>
          <button
            type="button"
            className="flex items-center gap-2 rounded-[9px] bg-deep-ube px-[18px] py-3 text-xs/[15px] font-bold text-white transition-colors hover:bg-ube-pop"
          >
            <Save className="size-[15px]" />
            Simpan perubahan
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
        image={product.image.mobile}
        name={name}
        code={content.code}
        category={content.category}
        published={content.published}
        slug={product.slug}
      />

      <div
        role="tabpanel"
        id={`${tabsId}-${activeTab}-panel`}
        aria-labelledby={`${tabsId}-${activeTab}-tab`}
      >
        {activeTab === "info" ? (
          <div className="grid items-start gap-[22px] xl:grid-cols-[596fr_384fr]">
            <section className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-[5px]">
                <h2 className="font-display text-[19px]/[1.2] font-bold text-ink">
                  Konten halaman detail
                </h2>
                <p className="text-[11px] text-plum">
                  Perubahan di sini akan memperbarui halaman produk pelanggan.
                </p>
              </div>

              <div className="flex items-center gap-[15px] rounded-xl border border-ube-line p-3">
                <img
                  src={product.image.mobile}
                  alt={name}
                  width={98}
                  height={98}
                  className="size-[98px] shrink-0 rounded-lg object-cover"
                />
                <div className="flex min-w-0 flex-col gap-[7px]">
                  <p className="text-[13px] font-bold text-ink">Foto utama produk</p>
                  <p className="text-[11px] text-plum">Tampil di katalog dan halaman detail.</p>
                  <button
                    type="button"
                    className="flex w-fit items-center gap-1.5 rounded-[7px] border border-ube-line px-[11px] py-2 text-[11px]/[14px] font-bold text-deep-ube transition-colors hover:bg-vanilla"
                  >
                    <Upload className="size-3.5" />
                    Ganti foto
                  </button>
                </div>
              </div>

              <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
                <Field label="Nama produk">
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className={inputClassName}
                  />
                </Field>
                <Field label="Kategori">
                  <OptionSelect
                    options={categories}
                    value={content.category}
                    onChange={(value) => update("category", value)}
                  />
                </Field>
                <Field label="Harga per porsi">
                  <input
                    value={content.price}
                    inputMode="numeric"
                    onChange={(event) => update("price", event.target.value)}
                    className={inputClassName}
                  />
                </Field>
                <Field label="Satuan">
                  <OptionSelect
                    options={units}
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

              <Field
                label="Deskripsi panjang"
                hint="Ditampilkan di bawah harga pada halaman detail."
              >
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

            <div className="flex min-w-0 flex-col gap-[15px]">
              <LivePreview
                image={product.image.desktop}
                name={name}
                tagline={content.tagline}
                price={content.price}
                unit={content.unit}
                description={content.description}
              />
              <PublicationStatus
                published={content.published}
                onToggle={() => update("published", !content.published)}
              />
            </div>
          </div>
        ) : (
          <TabPlaceholder tab={activeTab} />
        )}
      </div>

      <p className="flex items-center gap-2 border-t border-ube-line pt-4 text-[11px] text-plum">
        <CircleAlert aria-hidden className="size-4 shrink-0 text-ube-pop" />
        Pratinjau memperlihatkan konten saat ini. Simpan perubahan untuk memperbarui halaman produk
        yang tayang.
      </p>
    </AdminPage>
  );
}

function SelectedProduct({
  image,
  name,
  code,
  category,
  published,
  slug,
}: {
  image: string;
  name: string;
  code: string;
  category: string;
  published: boolean;
  slug: string;
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

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[11px] font-bold text-ink">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-plum">{hint}</span>}
    </label>
  );
}

/** Native select drawn like the design's text input with a "⌄" suffix. */
function OptionSelect({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <span className={`${inputClassName} relative flex items-center focus-within:border-ube-pop`}>
      <span className="whitespace-pre">{`${value}  ⌄`}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </span>
  );
}

function LivePreview({
  image,
  name,
  tagline,
  price,
  unit,
  description,
}: {
  image: string;
  name: string;
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
            {"MENU FAVORIT  /  PREORDER DIBUKA"}
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
        <button
          type="button"
          role="switch"
          aria-checked={published}
          aria-labelledby={titleId}
          onClick={onToggle}
          className={`flex h-5 w-[34px] shrink-0 items-center rounded-full p-[3px] transition-colors ${published ? "justify-end bg-deep-ube" : "justify-start bg-ube-line"}`}
        >
          <span aria-hidden className="size-3.5 rounded-full bg-white" />
        </button>
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

function TabPlaceholder({ tab }: { tab: Exclude<TabId, "info"> }) {
  const copy = {
    display: {
      title: "Tampilan detail",
      description: "Atur galeri foto, sorotan dan urutan informasi di halaman detail.",
    },
    availability: {
      title: "Ketersediaan",
      description: "Atur kapasitas per batch, batas pesanan dan jadwal penjualan produk.",
    },
  }[tab];

  return (
    <section className="flex flex-col gap-[5px] rounded-xl border border-dashed border-ube-line px-5 py-10 text-center">
      <h2 className="font-display text-[19px]/[1.2] font-bold text-ink">{copy.title}</h2>
      <p className="text-[11px] text-plum">{copy.description} Segera hadir.</p>
    </section>
  );
}
