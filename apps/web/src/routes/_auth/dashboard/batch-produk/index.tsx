import { Link, createFileRoute } from "@tanstack/react-router";

import { AdminPage, BatchStatusPill, PageHeading } from "@/components/admin/admin-page";
import { CompactMetric } from "@/components/admin/metric-card";

export const Route = createFileRoute("/_auth/dashboard/batch-produk/")({
  head: () => ({
    meta: [{ title: "Batch & produk · ubeloom" }],
  }),
  component: BatchProductsComponent,
});

// Sample data until batches, products and fulfillment settings live in the database.
const activeBatch = {
  title: "Batch Oktober 2026 · sedang menerima preorder",
  schedule: "Buka 16 Okt · tutup 22 Okt, 20.00 WIB · cutoff pembayaran 23 Okt, 20.00 WIB",
};

const metrics: { label: string; value: string; detail: string }[] = [
  { label: "TERPESAN", value: "54", detail: "42 lunas · 12 menunggu" },
  { label: "KAPASITAS LUMPIA", value: "126 / 200", detail: "74 kotak tersisa" },
  { label: "PICKUP", value: "23", detail: "2 slot aktif" },
  { label: "DELIVERY", value: "19", detail: "2 area aktif" },
];

const batchProducts: {
  slug: string;
  name: string;
  description: string;
  price: string;
  stock: string;
  image: string;
}[] = [
  {
    slug: "lumpia-ubi-goreng",
    name: "Lumpia Ubi Goreng",
    description: "Lumpia goreng isi ubi manis · Original",
    price: "Rp 28.000 / kotak",
    stock: "74 kotak tersisa · harga tersimpan per invoice",
    image: "/images/lumpia-ubi-goreng.webp",
  },
  {
    slug: "sparkling-starfruit",
    name: "Sparkling Starfruit",
    description: "Belimbing, chia seed dan air soda",
    price: "Rp 16.000 / cup",
    stock: "58 cup tersisa · harga tersimpan per invoice",
    image: "/images/sparkling-starfruit.webp",
  },
];

const pickupSlots: { label: string; capacity: string }[] = [
  { label: "Sabtu, 24 Okt · 10.00–12.00", capacity: "30 / 50 terisi" },
  { label: "Sabtu, 24 Okt · 13.00–15.00", capacity: "18 / 50 terisi" },
];

const deliveryZones: { name: string; window: string; fee: string }[] = [
  { name: "Bandung kota", window: "24 Okt · 13.00–16.00", fee: "Rp 8.000" },
  { name: "Sekitar kampus", window: "25 Okt · 09.00–12.00", fee: "Rp 5.000" },
];

const cardClassName = "rounded-[13px] border border-ube-line bg-surface";
const textActionClassName =
  "w-fit text-[11px] font-bold whitespace-pre text-deep-ube transition-colors hover:text-ube-pop";

function BatchProductsComponent() {
  return (
    <AdminPage>
      <PageHeading
        eyebrow="UBELOOM  /  ADMIN  /  BATCH & PRODUK"
        title="Batch & produk"
        description="Atur preorder yang masih dibuka, kapasitas, harga dan area layanan."
        actions={<BatchStatusPill />}
      />

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] bg-vanilla px-5 py-4">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[17px]/[1.25] font-extrabold text-ink">{activeBatch.title}</h2>
          <p className="text-[11px] text-plum">{activeBatch.schedule}</p>
        </div>
        <button
          type="button"
          className="rounded-full bg-deep-ube px-4 py-[11px] text-[11px]/[14px] font-bold text-vanilla transition-colors hover:bg-ube-pop"
        >
          Ubah pengaturan
        </button>
      </section>

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
          <button type="button" className={textActionClassName}>
            + Tambah varian
          </button>
        </div>

        <div className="grid gap-3.5 xl:grid-cols-2">
          {batchProducts.map((product) => (
            <ProductAdminCard key={product.slug} {...product} />
          ))}
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className={`${cardClassName} flex flex-col gap-[13px] p-5`}>
          <h2 className="text-[17px]/[1.25] font-extrabold text-ink">Slot pickup</h2>
          <p className="text-[11px] text-plum">Lokasi: Kampus Telkom, Bandung</p>
          <ul className="flex flex-col gap-[13px]">
            {pickupSlots.map(({ label, capacity }) => (
              <li
                key={label}
                className="flex items-center justify-between gap-3 rounded-lg bg-vanilla px-3 py-[11px]"
              >
                <span className="text-[11px] font-bold text-ink">{label}</span>
                <span className="shrink-0 text-[10px] font-bold text-deep-ube">{capacity}</span>
              </li>
            ))}
          </ul>
          <button type="button" className={textActionClassName}>
            {"Kelola slot & kapasitas  →"}
          </button>
        </section>

        <section className={`${cardClassName} flex flex-col gap-[13px] p-5`}>
          <h2 className="text-[17px]/[1.25] font-extrabold text-ink">Area &amp; jadwal delivery</h2>
          <p className="text-[11px] text-plum">
            Ongkir dihitung dan ditampilkan sebelum invoice dibuat.
          </p>
          <ul className="flex flex-col gap-[13px]">
            {deliveryZones.map(({ name, window, fee }) => (
              <li
                key={name}
                className="flex items-center justify-between gap-3 rounded-lg bg-vanilla px-3 py-2.5"
              >
                <div className="flex flex-col gap-[3px]">
                  <span className="text-[11px] font-bold text-ink">{name}</span>
                  <span className="text-[10px] text-plum">{window}</span>
                </div>
                <span className="shrink-0 text-xs font-extrabold text-deep-ube">{fee}</span>
              </li>
            ))}
          </ul>
          <button type="button" className={textActionClassName}>
            {"Kelola zona, ongkir & kapasitas  →"}
          </button>
        </section>
      </div>

      <p className="max-w-[930px] border-t border-ube-line pt-[13px] text-[11px] text-plum">
        Perubahan harga berlaku untuk invoice baru saja. Tutup batch menghentikan pesanan baru,
        tetapi invoice lama tetap dapat dibayar hingga tenggatnya.
      </p>
    </AdminPage>
  );
}

function ProductAdminCard({
  slug,
  name,
  description,
  price,
  stock,
  image,
}: (typeof batchProducts)[number]) {
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
          <span className="text-[9px]/[1.25] font-extrabold text-deep-ube">AKTIF</span>
        </div>
        <p className="text-[11px] text-plum">{description}</p>
        <p className="text-base font-extrabold text-deep-ube">{price}</p>
        <p className="text-[10px] text-plum">{stock}</p>
        <Link to="/dashboard/batch-produk/$slug" params={{ slug }} className={textActionClassName}>
          {"Edit produk  →"}
        </Link>
      </div>
    </article>
  );
}
