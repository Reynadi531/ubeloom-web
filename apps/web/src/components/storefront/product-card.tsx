export interface Product {
  name: string;
  price: string;
  image: { mobile: string; desktop: string };
  variant: { mobile: string; desktop: string };
  description: { mobile: string; desktop: string };
  care: { mobile: string; desktop: string };
}

export default function ProductCard({ product }: { product: Product }) {
  const { name, price, image, variant, description, care } = product;

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-ube-line bg-surface lg:rounded-[18px]">
      <picture>
        <source media="(min-width: 1024px)" srcSet={image.desktop} />
        <img
          src={image.mobile}
          alt={name}
          loading="lazy"
          className="h-[148px] w-full object-cover lg:h-[260px]"
        />
      </picture>

      <div className="flex flex-col gap-[7px] px-[15px] pt-[13px] pb-[15px] lg:gap-2.5 lg:px-5 lg:pt-[17px] lg:pb-[18px]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-[3px]">
            <h3 className="font-display text-[19px] font-bold text-deep-ube lg:text-[22px]">
              {name}
            </h3>
            <p className="hidden font-body text-[11px] text-plum lg:block">{variant.desktop}</p>
          </div>
          <p className="shrink-0 font-data text-[14px] font-bold text-deep-ube lg:text-[17px]">
            {price}
          </p>
        </div>

        <p className="font-body text-[11px] text-plum lg:hidden">{variant.mobile}</p>
        <p className="font-body text-[11px] text-ink lg:leading-[15px]">
          <span className="lg:hidden">{description.mobile}</span>
          <span className="hidden lg:inline">{description.desktop}</span>
        </p>
        <p className="font-body text-[11px] text-plum lg:leading-[15px]">
          <span className="lg:hidden">{care.mobile}</span>
          <span className="hidden lg:inline">{care.desktop}</span>
        </p>

        <div className="flex items-center justify-between">
          <span className="font-data text-[10px] font-bold text-deep-ube lg:rounded-[7px] lg:bg-vanilla lg:px-2.5 lg:py-1.5">
            <span aria-hidden className="lg:hidden">
              ●{" "}
            </span>
            TERSEDIA
          </span>
          {/* Plain text until the preorder flow (design frame 02) exists to link to. */}
          <span className="font-body text-[11px] font-bold text-ube-pop">
            <span className="lg:hidden">Pilih saat pesan →</span>
            <span className="hidden lg:inline">Pilih saat preorder →</span>
          </span>
        </div>
      </div>
    </article>
  );
}
