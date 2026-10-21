/** Selectable payment attempt in the review queue (design: "Admin / payment review row"). */
export function PaymentReviewRow({
  invoice,
  time,
  customer,
  amount,
  status,
  selected,
  onSelect,
}: {
  invoice: string;
  time: string;
  customer: string;
  amount: string;
  status: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex w-full flex-col gap-2 rounded-[10px] border border-ube-line p-[15px] text-left transition-colors ${selected ? "bg-vanilla" : "bg-surface hover:bg-vanilla/60"}`}
    >
      <span className="flex w-full items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate font-bold text-deep-ube">{invoice}</span>
        <span className="shrink-0 text-plum">{time}</span>
      </span>
      <span className="flex w-full items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-bold text-ink">
          {customer} · {amount}
        </span>
        <span className="shrink-0 text-xs font-bold text-ube-pop">{status}</span>
      </span>
    </button>
  );
}
