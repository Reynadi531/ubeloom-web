import type { ReactNode } from "react";

const toneClassNames = {
  /** Default design tone: awaiting action. */
  review: "bg-[#fff1d3] text-[#855814]",
  ready: "bg-deep-ube text-vanilla",
  gold: "bg-ube-gold font-extrabold text-ink",
  neutral: "bg-vanilla text-deep-ube",
  muted: "bg-surface text-plum",
} as const;

export type StatusTone = keyof typeof toneClassNames;

export function StatusBadge({
  tone = "review",
  children,
  className = "",
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-md px-2 py-1.5 text-[10px]/none font-bold whitespace-nowrap ${toneClassNames[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
