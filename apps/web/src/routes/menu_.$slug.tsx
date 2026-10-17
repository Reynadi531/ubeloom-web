import { Link, createFileRoute } from "@tanstack/react-router";
import { ReactLenis } from "lenis/react";
import {
  ChefHat,
  CupSoda,
  Heart,
  MapPin,
  Package,
  Snowflake,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import StorefrontFooter from "@/components/storefront/storefront-footer";
import StorefrontNav from "@/components/storefront/storefront-nav";
import { getProduct, type ProductDetail, type ProductIcon } from "@/functions/get-product";

export const Route = createFileRoute("/menu_/$slug")({
  loader: ({ params }) => getProduct({ data: { slug: params.slug } }),
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.name} · ubeloom` },
          { name: "description", content: `${loaderData.subtitle} ${loaderData.story}` },
        ]
      : [],
  }),
  component: ProductDetailComponent,
});

const icons: Record<ProductIcon, LucideIcon> = {
  sparkles: Sparkles,
  package: Package,
  "chef-hat": ChefHat,
  heart: Heart,
  "map-pin": MapPin,
  snowflake: Snowflake,
  "cup-soda": CupSoda,
};

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

function ProductDetailComponent() {
  const product = Route.useLoaderData();

  return (
    <div className="flex min-h-svh flex-col bg-white font-body text-ink">
      <ReactLenis root />
      <StorefrontNav />
      <main className="flex-1">
        <Breadcrumb name={product.name} />
        <ProductHero product={product} />
        <ProductFacts details={product.details} />
      </main>
      <StorefrontFooter />
    </div>
  );
}

function Breadcrumb({ name }: { name: string }) {
  return (
    <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-5 py-5 lg:h-[72px] lg:px-16 lg:py-0">
      <nav aria-label="Breadcrumb" className="text-xs font-semibold text-plum">
        <ol className="flex flex-wrap items-center gap-x-3">
          <li>
            <Link to="/" className="hover:text-ube-pop">
              Beranda
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link to="/menu" className="hover:text-ube-pop">
              Menu
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page">{name}</li>
        </ol>
      </nav>
      <Link
        to="/menu"
        className="hidden shrink-0 text-[13px] font-bold text-deep-ube hover:text-ube-pop sm:inline"
      >
        ← Kembali ke menu
      </Link>
    </div>
  );
}

function ProductHero({ product }: { product: ProductDetail }) {
  const { name, collection, subtitle, price, portionLabel, story, image, highlights } = product;

  return (
    <section className="mx-auto flex max-w-[1280px] flex-col gap-8 px-5 pb-10 lg:flex-row lg:gap-[62px] lg:px-16 lg:pt-2.5 lg:pb-[54px]">
      <figure className="flex flex-col gap-[13px] lg:w-[518px] lg:shrink-0">
        <img
          src={image.src}
          alt={image.alt}
          className="aspect-square w-full rounded-[20px] object-cover lg:aspect-auto lg:h-[506px]"
        />
        <figcaption className="flex items-center justify-between font-data text-[10px] text-plum">
          <span className="font-bold tracking-[1px] uppercase">{name} · Foto produk</span>
          <span className="font-semibold">01 / 01</span>
        </figcaption>
      </figure>

      <div className="flex flex-1 flex-col gap-[9px]">
        <p className="flex items-center gap-2 font-data text-[11px] font-bold tracking-[0.7px] whitespace-pre text-ube-pop">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-ube-pop" />
          {collection}
        </p>
        <h1 className="font-display text-[38px]/[1.08] font-bold text-deep-ube lg:text-[46px]/[1.08]">
          {name}
        </h1>
        <p className="text-lg/[1.35] font-semibold">{subtitle}</p>

        <p className="flex items-center gap-3.5 pt-5 pb-[19px]">
          <span className="font-data text-[26px] font-bold text-deep-ube">
            {rupiah.format(price)}
          </span>
          <span className="text-[13px] font-medium text-plum">{portionLabel}</span>
        </p>

        <hr className="border-ube-line" />
        <p className="text-[15px]/[1.65]">{story}</p>

        <ul className="flex gap-7 pt-5 pb-[22px]">
          {highlights.map(({ icon, title, note }) => {
            const Icon = icons[icon];
            return (
              <li key={title} className="flex flex-1 items-center gap-2.5">
                <Icon aria-hidden className="size-5 shrink-0 text-deep-ube" />
                <div className="flex flex-col gap-[3px]">
                  <span className="text-xs font-bold">{title}</span>
                  <span className="text-[11px] text-plum">{note}</span>
                </div>
              </li>
            );
          })}
        </ul>

        <hr className="border-ube-line" />
        <PreorderAction name={name} />
        <p className="text-[11px]/[1.5] text-plum">
          Pilih pickup atau delivery saat checkout. Bayar maks. 24 jam setelah pesan.
        </p>
      </div>
    </section>
  );
}

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 20;

function PreorderAction({ name }: { name: string }) {
  const [quantity, setQuantity] = useState(MIN_QUANTITY);

  return (
    <div className="flex items-center gap-4 pt-[23px]">
      <div className="flex h-[50px] shrink-0 items-center gap-[23px] rounded-full border border-ube-line px-[18px]">
        <button
          type="button"
          aria-label="Kurangi jumlah"
          disabled={quantity <= MIN_QUANTITY}
          onClick={() => setQuantity((value) => value - 1)}
          className="text-[21px] font-medium text-plum disabled:opacity-40"
        >
          −
        </button>
        <output aria-live="polite" className="w-4 text-center font-data text-[15px] font-bold">
          {quantity}
        </output>
        <button
          type="button"
          aria-label="Tambah jumlah"
          disabled={quantity >= MAX_QUANTITY}
          onClick={() => setQuantity((value) => value + 1)}
          className="text-xl font-medium text-deep-ube disabled:opacity-40"
        >
          +
        </button>
      </div>
      {/* No preorder flow (design frame 02) to hand off to yet, so confirm with a toast. */}
      <button
        type="button"
        onClick={() => toast.success(`${quantity} × ${name} siap dipesan.`)}
        className="h-[50px] flex-1 rounded-full bg-deep-ube px-[22px] text-[15px] font-bold whitespace-pre text-vanilla transition-colors hover:bg-ube-pop"
      >
        Pesan sekarang →
      </button>
    </div>
  );
}

function ProductFacts({ details }: { details: ProductDetail["details"] }) {
  return (
    <section className="bg-vanilla">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-[25px] px-5 py-[34px] lg:min-h-[297px] lg:px-16">
        <p className="font-data text-[10px] font-bold tracking-[1.2px] text-ube-pop">
          SEBELUM KAMU PESAN
        </p>
        <h2 className="font-display text-[24px]/[1.2] font-bold text-deep-ube lg:text-[28px]/[1.2]">
          {details.title}
        </h2>
        <ul className="grid gap-[26px] lg:grid-cols-3">
          {details.facts.map(({ icon, title, description }) => {
            const Icon = icons[icon];
            return (
              <li
                key={title}
                className="flex flex-col gap-[9px] border-t border-ube-line pt-[17px] pb-2"
              >
                <Icon aria-hidden className="size-5 text-deep-ube" />
                <h3 className="text-[15px] font-bold">{title}</h3>
                <p className="text-xs/[1.55] text-plum">{description}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
