import type { ReactNode } from "react";

import { formatRupiah } from "@/lib/format";
import { cn } from "@web-kwu/ui/lib/utils";

const badgeTones = {
  gold: "bg-ube-gold text-ink",
  ube: "bg-deep-ube text-vanilla",
  pink: "bg-blush-pink text-ink",
  neutral: "border border-ube-line bg-surface text-deep-ube",
} as const;

export type BadgeTone = keyof typeof badgeTones;

/** Monospace status chip (design: Badge / Gold, Ube, Pink, Neutral). */
export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-[8px] px-[11px] py-[7px] font-data text-[11px] font-bold",
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  );
}

/** One product line: name, "2 × Rp 28.000", line total (Customer flow / item summary row). */
export function ItemSummaryRow({
  name,
  quantity,
  unitPrice,
}: {
  name: string;
  quantity: number;
  unitPrice: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-[3px]">
        <p className="text-[13px] font-bold text-ink">{name}</p>
        <p className="text-xs text-plum">
          {quantity} × {formatRupiah(unitPrice)}
        </p>
      </div>
      <p className="text-[13px] font-bold text-ink">{formatRupiah(quantity * unitPrice)}</p>
    </div>
  );
}

/** Customer flow / total row. */
export function TotalRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm font-bold text-ink">{label}</p>
      <p className="font-display text-[25px] font-bold text-deep-ube">{formatRupiah(amount)}</p>
    </div>
  );
}

/** Customer flow / labeled value. */
export function LabeledValue({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-[5px]", className)}>
      <p className="text-[11px] font-semibold text-plum">{label}</p>
      <p className="text-xs font-bold text-ink">{value}</p>
    </div>
  );
}

/** Numbered guidance steps ("01 …", "02 …"). */
export function NumberedSteps({ steps, className }: { steps: string[]; className?: string }) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {steps.map((step, index) => (
        <li key={step} className="flex items-start gap-3">
          <span className="pt-px font-data text-[11px] font-bold text-ube-pop">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="flex-1 text-xs leading-[17px] text-ink">{step}</span>
        </li>
      ))}
    </ol>
  );
}
