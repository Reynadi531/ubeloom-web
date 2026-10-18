import { createFileRoute } from "@tanstack/react-router";
import { ReactLenis } from "lenis/react";
import { CalendarDays, MapPin, Truck, type LucideIcon } from "lucide-react";

import { batchCopy } from "@/components/storefront/batch-copy";
import ProductCard, { type Product } from "@/components/storefront/product-card";
import StorefrontFooter from "@/components/storefront/storefront-footer";
import StorefrontNav from "@/components/storefront/storefront-nav";
import { getStorefront } from "@/functions/products";
import { DEFAULT_DESCRIPTION, LOGO_IMAGE, SITE_NAME, absoluteUrl, jsonLd, seo } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () => {
    const { meta, links } = seo({
      title: "ubeloom · Preorder lumpia ubi & minuman segar",
      description: DEFAULT_DESCRIPTION,
      path: "/",
    });
    return {
      meta,
      links: [...links, { rel: "preload", as: "image", href: "/images/hero-lumpia.webp" }],
      scripts: [
        jsonLd({
          "@graph": [
            { "@type": "WebSite", name: SITE_NAME, url: absoluteUrl("/"), inLanguage: "id-ID" },
            {
              "@type": "Organization",
              name: SITE_NAME,
              url: absoluteUrl("/"),
              logo: absoluteUrl(LOGO_IMAGE),
            },
          ],
        }),
      ],
    };
  },
  loader: () => getStorefront(),
  component: HomeComponent,
});

type BatchCopy = ReturnType<typeof batchCopy>;

const batchDetails = (batch: BatchCopy): { icon: LucideIcon; label: string; value: string }[] => [
  {
    icon: CalendarDays,
    label: batch.open ? "Preorder masih dibuka · hingga" : "Preorder ditutup · sejak",
    value: batch.closesAt,
  },
  { icon: MapPin, label: "Pickup tersedia", value: batch.pickupSummary },
  { icon: Truck, label: "Delivery tersedia", value: "Alamat & biaya saat checkout" },
];

const fulfillmentOptions = (
  batch: BatchCopy,
): {
  icon: LucideIcon;
  title: { mobile: string; desktop: string };
  detail: { mobile: string; desktop: string };
}[] => [
  {
    icon: MapPin,
    title: { mobile: `Pickup di ${batch.pickupLocation}`, desktop: "Ambil di kampus" },
    detail: {
      mobile: `${batch.pickupDate} · pilih slot pengambilan`,
      desktop: `${batch.pickupDate} · pilih slot saat checkout`,
    },
  },
  {
    icon: Truck,
    title: { mobile: "Delivery ke alamatmu", desktop: "Kirim ke alamatmu" },
    detail: {
      mobile: "Cek area & ongkir saat checkout",
      desktop: "Cek area dan ongkir saat checkout",
    },
  },
];

function HomeComponent() {
  const { batch, products } = Route.useLoaderData();
  const copy = batchCopy(batch);

  return (
    <div className="flex min-h-svh flex-col bg-white font-body text-ink">
      {/* Lenis honours each section's scroll-margin-top when following #anchor links. */}
      <ReactLenis root options={{ anchors: true }} />
      <StorefrontNav />
      <main className="flex flex-1 flex-col">
        <Hero batch={copy} />
        <BatchDetails batch={copy} />
        <Catalog products={products} />
        <Fulfillment batch={copy} />
      </main>
      <StorefrontFooter />
    </div>
  );
}

function Hero({ batch }: { batch: BatchCopy }) {
  return (
    <section className="mx-auto grid w-full max-w-[1280px] gap-[13px] px-5 py-[25px] lg:min-h-[400px] lg:grid-cols-[minmax(0,560px)_1fr] lg:items-center lg:gap-[42px] lg:px-16 lg:pt-[42px] lg:pb-10">
      <div className="flex flex-col items-start gap-[13px] lg:gap-[18px]">
        <p className="flex items-center gap-[7px] rounded-full bg-vanilla px-[11px] py-[7px] font-data text-[10px] font-bold text-deep-ube lg:gap-2 lg:px-3.5 lg:py-2 lg:text-[11px]">
          <span aria-hidden className="size-[7px] rounded-full bg-ube-pop lg:size-2" />
          <span className="lg:hidden">
            BATCH {batch.number} · {batch.open ? "MASIH BISA PREORDER" : "PREORDER DITUTUP"}
          </span>
          <span className="hidden lg:inline">
            BATCH {batch.number} · {batch.open ? "PREORDER MASIH DIBUKA" : "PREORDER DITUTUP"}
          </span>
        </p>
        <h1 className="font-display text-[34px]/[36px] font-bold text-deep-ube lg:text-[46px]/[49px]">
          <span className="lg:hidden">Preorder buka. Jeda manis menunggu.</span>
          <span className="hidden lg:inline">Jeda manisnya sudah bisa kamu pesan.</span>
        </h1>
        <p className="text-[13px]/[19px] text-plum lg:text-[15px]/[23px]">
          <span className="lg:hidden">
            Lumpia ubi renyah dan minuman segar. Pilih favoritmu, lalu tentukan pickup atau delivery
            saat checkout.
          </span>
          <span className="hidden lg:inline">
            Lumpia ubi hangat dan minuman segar untuk hari yang lebih seru. Preorder sekarang, lalu
            pilih pickup atau delivery saat checkout.
          </span>
        </p>
        <div className="flex items-center gap-3.5">
          <a
            href="#menu"
            className="rounded-full bg-deep-ube px-[22px] py-[13px] text-[15px] font-bold text-vanilla transition-colors hover:bg-ube-pop"
          >
            <span className="lg:hidden">Preorder sekarang →</span>
            <span className="hidden lg:inline">Preorder batch {batch.number} →</span>
          </a>
          <a
            href="#menu"
            className="hidden text-sm font-bold text-deep-ube hover:underline lg:inline"
          >
            Lihat menu ↗
          </a>
        </div>
      </div>
      <img
        src="/images/hero-lumpia.webp"
        alt="Lumpia ubi dalam wadah kotak-kotak dengan saus ubi ungu"
        width={1200}
        height={1200}
        fetchPriority="high"
        className="h-[205px] w-full rounded-[17px] bg-deep-ube object-cover object-top lg:h-[318px] lg:rounded-[22px] lg:object-[center_8%]"
      />
    </section>
  );
}

function BatchDetails({ batch }: { batch: BatchCopy }) {
  return (
    <section
      id="cara-pesan"
      aria-label="Info batch"
      className="bg-vanilla lg:border-y lg:border-ube-line"
    >
      <ul className="flex flex-col gap-3 px-5 py-[17px] lg:hidden">
        <li className="flex items-center gap-2.5 text-xs font-semibold text-deep-ube">
          <CalendarDays aria-hidden className="size-[18px] shrink-0" />
          {batch.open ? "Masih buka hingga" : "Preorder ditutup ·"} {batch.closesAtShort}
        </li>
        <li className="flex items-center gap-2.5 text-xs font-semibold text-deep-ube">
          <MapPin aria-hidden className="size-[18px] shrink-0" />
          Pickup {batch.pickupDate} · delivery juga tersedia
        </li>
      </ul>

      <ul className="mx-auto hidden h-[81px] max-w-[1280px] items-center justify-between px-16 lg:flex">
        {batchDetails(batch).map(({ icon: Icon, label, value }) => (
          <li key={label} className="flex items-center gap-3">
            <Icon aria-hidden className="size-[21px] shrink-0 text-deep-ube" />
            <div className="flex flex-col gap-[3px]">
              <span className="text-[11px] text-plum">{label}</span>
              <span className="text-[13px] font-bold text-deep-ube">{value}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Catalog({ products }: { products: Product[] }) {
  return (
    <section
      id="menu"
      className="order-1 mx-auto flex w-full max-w-[1280px] scroll-mt-4 flex-col gap-3.5 px-5 pt-[26px] pb-5 lg:order-none lg:gap-5 lg:px-16 lg:pt-[34px] lg:pb-7"
    >
      <div className="flex flex-col gap-3.5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3.5 lg:gap-1">
          <p className="font-data text-[10px] font-bold text-ube-pop lg:text-[11px]">
            <span className="lg:hidden">01 / MENU KAMI</span>
            <span className="hidden lg:inline">01 / PILIH FAVORITMU</span>
          </p>
          <h2 className="font-display text-[27px] font-bold text-deep-ube lg:text-[29px]">
            <span className="lg:hidden">Pilih favoritmu.</span>
            <span className="hidden lg:inline">Menu yang bikin hari lebih manis.</span>
          </h2>
        </div>
        <p className="hidden text-xs text-plum lg:block">
          Harga per porsi · pesan selagi batch dibuka
        </p>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-2 lg:gap-5">
        {products.map((product) => (
          <ProductCard key={product.slug} product={product} />
        ))}
      </div>
    </section>
  );
}

function Fulfillment({ batch }: { batch: BatchCopy }) {
  return (
    <section id="pickup-delivery" className="scroll-mt-4 lg:border-t lg:border-ube-line">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-5 py-[22px] lg:flex-row lg:items-center lg:gap-9 lg:px-16 lg:py-7">
        <div className="flex flex-col gap-3 lg:flex-1 lg:gap-[5px]">
          <h2 className="font-display text-[22px] font-bold text-deep-ube lg:text-[21px]">
            <span className="lg:hidden">Pilih cara terima pesanan</span>
            <span className="hidden lg:inline">Dua cara menikmati ubeloom.</span>
          </h2>
          <p className="text-xs/[17px] text-plum lg:text-[13px]/5">
            <span className="lg:hidden">
              Tentukan pilihanmu saat checkout. Preorder batch {batch.number}{" "}
              {batch.open ? "masih dibuka" : "sudah ditutup"}.
            </span>
            <span className="hidden lg:inline">
              Pilih pickup di {batch.pickupLocation} atau delivery ke alamatmu saat checkout. Bayar
              maks. 24 jam setelah pesan.
            </span>
          </p>
        </div>

        <ul className="flex flex-col gap-3 lg:w-[650px] lg:shrink lg:flex-row">
          {fulfillmentOptions(batch).map(({ icon: Icon, title, detail }) => (
            <li
              key={title.desktop}
              className="flex items-center gap-3 rounded-xl border border-ube-line bg-vanilla px-[15px] py-[13px] lg:flex-1 lg:flex-col lg:items-start lg:gap-[9px] lg:rounded-[14px] lg:px-[18px] lg:py-4"
            >
              <Icon aria-hidden className="size-[21px] shrink-0 text-deep-ube lg:hidden" />
              <div className="flex flex-col gap-[3px] lg:hidden">
                <span className="text-[13px] font-bold text-deep-ube">{title.mobile}</span>
                <span className="text-[11px] text-plum">{detail.mobile}</span>
              </div>

              <span className="hidden items-center gap-[9px] lg:flex">
                <Icon aria-hidden className="size-[19px] shrink-0 text-deep-ube" />
                <span className="font-display text-[17px] font-bold text-deep-ube">
                  {title.desktop}
                </span>
              </span>
              <span className="hidden text-[11px] text-plum lg:block">{detail.desktop}</span>
            </li>
          ))}
        </ul>

        <p className="text-[11px]/4 text-plum lg:hidden">
          Bayar maks. 24 jam setelah pesan · invoice dikirim setelah checkout.
        </p>
      </div>
    </section>
  );
}
