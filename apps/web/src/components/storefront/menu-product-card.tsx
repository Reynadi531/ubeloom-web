import type { Product } from "./product-card";

// Larger catalog card for the Menu page; the landing page keeps the compact ProductCard.
export default function MenuProductCard({ product }: { product: Product }) {
  const { name, price, image, variant, description, care } = product;

  return (
    <article className="flex flex-col overflow-hidden rounded-[18px] border border-ube-line bg-surface">
      <picture>
        <source media="(min-width: 1024px)" srcSet={image.desktop} />
        <img
          src={image.mobile}
          alt={name}
          loading="lazy"
          className="h-[200px] w-full object-cover lg:h-[270px]"
        />
      </picture>

      <div className="flex flex-col gap-[11px] px-5 pt-[18px] pb-5 lg:px-6 lg:pt-[22px] lg:pb-6">
        <div className="flex justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="font-body text-xl/[1.25] font-bold text-deep-ube lg:text-2xl/[1.25]">
              {name}
            </h3>
            <p className="font-body text-xs text-plum">{variant.desktop}</p>
          </div>
          <p className="shrink-0 font-body text-base/[1.25] font-bold text-deep-ube lg:text-lg/[1.25]">
            {price}
          </p>
        </div>

        <p className="font-body text-sm/[1.4] text-ink">{description.desktop}</p>
        <p className="font-body text-xs/[1.4] text-plum">{care.desktop}</p>

        <div className="flex items-center justify-between">
          <span className="rounded-[7px] bg-vanilla px-2.5 py-1.5 font-body text-[10px] font-bold text-deep-ube">
            TERSEDIA
          </span>
          {/* Plain text until the preorder flow (design frame 02) exists to link to. */}
          <span className="font-body text-[13px] font-bold text-ube-pop">
            Pilih saat preorder →
          </span>
        </div>
      </div>
    </article>
  );
}
