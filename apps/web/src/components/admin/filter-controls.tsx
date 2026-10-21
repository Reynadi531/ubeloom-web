import { ChevronDown } from "lucide-react";

/**
 * Native select styled as the design's "Admin / filter select".
 * The visible label reads "<label>: <selected option>".
 */
export function FilterSelect({
  label,
  options,
  value,
  onChange,
  className = "",
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label
      className={`relative flex h-10 items-center justify-between gap-2 rounded-lg border border-ube-line bg-white px-3 text-[13px] font-semibold text-ink transition-colors focus-within:border-ube-pop hover:bg-vanilla ${className}`}
    >
      <span className="truncate">
        {label}: {value}
      </span>
      <ChevronDown aria-hidden className="size-3.5 shrink-0 text-plum" />
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

/** Pill tab with a count (design: "Admin / filter tab"). */
export function FilterTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full px-3.5 py-[9px] text-[13px]/none font-bold whitespace-pre transition-colors ${active ? "bg-deep-ube text-vanilla" : "bg-vanilla text-deep-ube hover:bg-lilac/60"}`}
    >
      {count === undefined ? label : `${label}  ${count}`}
    </button>
  );
}
