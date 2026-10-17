import type { ReactNode } from "react";

/** Content column next to the admin sidebar; clears the fixed mobile header below `lg`. */
export function AdminPage({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main
      className={`flex min-w-0 flex-1 flex-col gap-5 px-5 pt-[88px] pb-7 lg:px-8 lg:pt-7 ${className}`}
    >
      {children}
    </main>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  /** Right-aligned slot: status pill or page actions. */
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex max-w-[690px] flex-col gap-1.5">
        <p className="font-data text-[10px] font-extrabold whitespace-pre text-deep-ube">
          {eyebrow}
        </p>
        <h1 className="font-display text-[30px]/[1.2] font-bold text-ink">{title}</h1>
        <p className="text-xs text-plum">{description}</p>
      </div>
      {actions}
    </div>
  );
}

export function BatchStatusPill({ label = "BATCH OKTOBER · DIBUKA" }: { label?: string }) {
  return (
    <p className="flex items-center gap-[7px] rounded-full bg-vanilla px-[13px] py-[9px] font-data text-[10px] font-bold text-deep-ube">
      <span aria-hidden className="size-[7px] rounded-full bg-ube-pop" />
      {label}
    </p>
  );
}
