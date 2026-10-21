import { useRouter } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { z } from "zod";

export const fieldClassName =
  "w-full rounded-lg border border-ube-line bg-white px-3 text-sm text-ink outline-none transition-colors focus:border-ube-pop";
export const inputClassName = `${fieldClassName} h-[41px] font-medium`;
export const primaryButtonClassName =
  "flex items-center justify-center gap-2 rounded-[9px] bg-deep-ube px-[18px] py-3 text-sm/[15px] font-bold text-white transition-colors hover:bg-ube-pop disabled:opacity-50";
export const secondaryButtonClassName =
  "flex items-center justify-center gap-1.5 rounded-[7px] border border-ube-line px-[11px] py-2 text-[13px]/[14px] font-bold text-deep-ube transition-colors hover:bg-vanilla disabled:opacity-50";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[13px] font-bold text-ink">{label}</span>
      {children}
      {hint && <span className="text-xs text-plum">{hint}</span>}
    </label>
  );
}

/** Native select drawn like the design's text input with a "⌄" suffix. */
export function OptionSelect<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <span className={`${inputClassName} relative flex items-center focus-within:border-ube-pop`}>
      <span className="truncate whitespace-pre">{`${current?.label ?? value}  ⌄`}</span>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/** Modal built on the native `<dialog>`; closes on Escape and backdrop click. */
export function AdminDialog({
  open,
  onClose,
  title,
  description,
  children,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={`m-auto max-h-[calc(100svh-32px)] w-[min(560px,calc(100vw-32px))] rounded-[14px] border border-ube-line bg-white p-0 font-body text-ink backdrop:bg-ink/40 ${className}`}
    >
      {open && (
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-[5px]">
              <h2 className="font-display text-[19px]/[1.2] font-bold text-ink">{title}</h2>
              {description && <p className="text-[13px] text-plum">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="text-lg/none font-bold text-plum transition-colors hover:text-deep-ube"
            >
              ×
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** First validation message of a failed zod parse, for toasts. */
export function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Data belum valid";
}

/** Runs a mutation, toasts the outcome and reloads route loaders on success. */
export function useMutationRunner() {
  const router = useRouter();
  return async (mutation: () => Promise<unknown>, success: string) => {
    try {
      await mutation();
      toast.success(success);
      await router.invalidate();
      return true;
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "Gagal menyimpan");
      return false;
    }
  };
}

const TIME_ZONE = "Asia/Jakarta";

/** `yyyy-mm-ddThh:mm` in WIB, for `<input type="datetime-local">`. */
export const toDateTimeInputValue = (value: Date | string) =>
  `${toDateValue(value)}T${toTimeValue(value)}`;

/** `yyyy-mm-dd` in WIB. */
export const toDateValue = (value: Date | string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date(value));

/** `hh:mm` (24h) in WIB. */
export const toTimeValue = (value: Date | string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));

/** Parses WIB `yyyy-mm-dd` + `hh:mm` (or a `datetime-local` value) into a Date. */
export const fromWib = (date: string, time?: string) =>
  new Date(`${time ? `${date}T${time}` : date}:00+07:00`);

/** Parses an optional whole-number input; empty string → null. */
export const parseOptionalInt = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : null;
};
