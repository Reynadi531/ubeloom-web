import { createFileRoute } from "@tanstack/react-router";
import { ReactLenis } from "lenis/react";
import { CalendarDays, MapPin, Truck, type LucideIcon } from "lucide-react";

import { batchCopy } from "@/components/storefront/batch-copy";
import MenuProductCard from "@/components/storefront/menu-product-card";
import PreorderInvitation from "@/components/storefront/preorder-invitation";
import StorefrontFooter from "@/components/storefront/storefront-footer";
import type { Product } from "@/components/storefront/product-card";
import StorefrontNav from "@/components/storefront/storefront-nav";
import { getStorefront } from "@/functions/products";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/menu")({
  head: () =>
    seo({
      title: "Menu · ubeloom",
      description:
        "Menu lumpia ubi dan minuman segar dari batch preorder ubeloom. Pilih pickup atau delivery saat checkout.",
      path: "/menu",
    }),
  loader: () => getStorefront(),
  component: MenuComponent,
});

type BatchCopy = ReturnType<typeof batchCopy>;

const batchInformation = (
  batch: BatchCopy,
): { icon: LucideIcon; label: string; value: string }[] => [
  batch.open
    ? { icon: CalendarDays, label: "Preorder dibuka", value: `hingga ${batch.closesAtShort}` }
    : { icon: CalendarDays, label: "Preorder ditutup", value: `sejak ${batch.closesAtShort}` },
  { icon: MapPin, label: "Pickup tersedia", value: batch.pickupSummary },
  { icon: Truck, label: "Delivery tersedia", value: "Alamat & biaya saat checkout" },
];

function MenuComponent() {
  const { batch, products } = Route.useLoaderData();
  const copy = batchCopy(batch);

  return (
    <div className="flex min-h-svh flex-col bg-white font-body text-ink">
      <ReactLenis root options={{ anchors: true }} />
      <StorefrontNav />
      <main className="flex-1">
        <MenuHero batch={copy} />
        <BatchInformation batch={copy} />
        <ProductCatalog products={products} />
        <PreorderInvitation
          title="Sudah ketemu favoritmu?"
          description="Preorder tanpa akun. Pilih pickup atau delivery, cek invoice, lalu bayar via QRIS."
          href="#katalog"
        />
      </main>
      <StorefrontFooter />
    </div>
  );
}

function MenuHero({ batch }: { batch: BatchCopy }) {
  return (
    <section className="bg-vanilla">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-5 py-8 lg:h-[250px] lg:flex-row lg:items-center lg:gap-8 lg:px-16 lg:py-0">
        <div className="flex flex-col gap-3.5 lg:w-[580px] lg:shrink-0">
          <p className="text-[11px] font-bold text-ube-pop">
            {batch.open ? "MENU / BATCH PREORDER TERBUKA" : "MENU / BATCH PREORDER DITUTUP"}
          </p>
          <h1 className="font-display text-[34px]/[1.2] font-bold text-deep-ube lg:text-[43px]/[1.4]">
            Pilih yang bikin jedamu lebih seru.
          </h1>
          <p className="text-[15px]/[1.4] text-plum">
            Favorit untuk dinikmati sendiri atau dibagi. Pesan sekarang, lalu pilih pickup atau
            delivery saat checkout.
          </p>
        </div>

        <aside className="flex flex-col justify-center gap-[9px] rounded-[20px] bg-deep-ube px-6 py-6 lg:h-[164px] lg:flex-1 lg:px-[30px]">
          <p className="text-[11px] font-bold text-ube-gold">
            BATCH {batch.number} / {batch.open ? "OPEN PREORDER" : "PREORDER DITUTUP"}
          </p>
          <p className="font-display leading-[1.2] text-[22px] font-bold text-vanilla lg:text-[26px]">
            Manisnya tinggal selangkah.
          </p>
          <p className="text-sm/[1.4] text-vanilla">
            {batch.open ? "Pesan hingga" : "Preorder ditutup sejak"} {batch.closesAt}
            <br />
            Pickup {batch.pickupDate} di {batch.pickupLocation}; delivery tersedia.
          </p>
        </aside>
      </div>
    </section>
  );
}

function BatchInformation({ batch }: { batch: BatchCopy }) {
  return (
    <section aria-label="Info batch" className="border-b border-ube-line">
      <ul className="mx-auto flex max-w-[1280px] flex-col gap-4 px-5 py-5 lg:h-[78px] lg:flex-row lg:items-center lg:gap-6 lg:px-16 lg:py-0">
        {batchInformation(batch).map(({ icon: Icon, label, value }) => (
          <li key={label} className="flex items-center gap-3 lg:flex-1">
            <Icon aria-hidden className="size-[21px] shrink-0 text-deep-ube" />
            <div className="flex flex-col gap-[3px]">
              <span className="text-xs text-plum">{label}</span>
              <span className="text-[13px] font-bold text-deep-ube">{value}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProductCatalog({ products }: { products: Product[] }) {
  return (
    <section
      id="katalog"
      className="mx-auto flex max-w-[1280px] scroll-mt-4 flex-col gap-[22px] px-5 pt-8 pb-8 lg:px-16 lg:pt-11 lg:pb-[42px]"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-[5px]">
          <p className="text-[11px] font-bold text-ube-pop">01 / MENU KAMI</p>
          <h2 className="font-display leading-[1.2] text-[27px] font-bold text-deep-ube lg:text-[31px]">
            Dibuat untuk momen kecil yang spesial.
          </h2>
        </div>
        <p className="text-xs text-plum">Harga per porsi · stok mengikuti batch preorder</p>
      </div>

      <div className="grid gap-[22px] lg:grid-cols-2">
        {products.map((product) => (
          <MenuProductCard key={product.slug} product={product} />
        ))}
      </div>
    </section>
  );
}
