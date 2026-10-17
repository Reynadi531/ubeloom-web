import { Link } from "@tanstack/react-router";

interface PreorderInvitationProps {
  title: string;
  description: string;
  /** In-page anchor (e.g. "#katalog") or a storefront route. */
  href: "/menu" | `#${string}`;
}

export default function PreorderInvitation({ title, description, href }: PreorderInvitationProps) {
  const ctaClassName =
    "w-fit shrink-0 rounded-full bg-deep-ube px-[22px] py-[13px] font-body text-[15px] font-bold text-vanilla transition-colors hover:bg-ube-pop";

  return (
    <section className="border-y border-ube-line bg-vanilla">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-5 px-5 py-7 lg:min-h-[174px] lg:flex-row lg:items-center lg:justify-between lg:gap-10 lg:px-16 lg:py-[30px]">
        <div className="flex max-w-[700px] flex-col gap-[9px]">
          <h2 className="font-display leading-[1.2] text-[25px] font-bold text-deep-ube lg:text-[30px]">
            {title}
          </h2>
          <p className="font-body text-sm/[1.4] text-plum">{description}</p>
        </div>
        {href === "/menu" ? (
          <Link to={href} className={ctaClassName}>
            Mulai preorder →
          </Link>
        ) : (
          <a href={href} className={ctaClassName}>
            Mulai preorder →
          </a>
        )}
      </div>
    </section>
  );
}
