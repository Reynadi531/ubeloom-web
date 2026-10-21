import type { LucideIcon } from "lucide-react";

const cardClassName = "flex flex-col rounded-xl border border-ube-line bg-surface";

/** Metric with an icon, used for headline counts (design: "Admin / metric"). */
export function MetricCard({
  label,
  value,
  context,
  icon: Icon,
}: {
  label: string;
  value: string;
  context: string;
  icon: LucideIcon;
}) {
  return (
    <div className={`${cardClassName} min-h-[105px] gap-1.5 px-[15px] py-[13px]`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-extrabold tracking-[1px] text-plum">{label}</p>
        <Icon className="size-[15px] shrink-0 text-deep-ube" />
      </div>
      <p className="text-[22px]/[1.25] font-extrabold text-deep-ube">{value}</p>
      <p className="text-xs font-medium text-plum">{context}</p>
    </div>
  );
}

/** Icon-less metric (design: "Admin / compact metric"). */
export function CompactMetric({
  label,
  value,
  detail,
  valueClassName = "text-[23px]/[1.25]",
}: {
  label: string;
  value: string;
  detail: string;
  /** Font size override; the design uses 20–23px depending on the page. */
  valueClassName?: string;
}) {
  return (
    <div className={`${cardClassName} gap-[7px] px-[18px] py-[15px]`}>
      <p className="text-[11px] font-extrabold text-plum">{label}</p>
      <p className={`${valueClassName} font-extrabold text-deep-ube`}>{value}</p>
      <p className="text-xs text-plum">{detail}</p>
    </div>
  );
}
