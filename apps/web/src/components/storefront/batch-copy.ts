import type { StorefrontBatch } from "@/functions/products";

/** Storefront wording for the current batch, with fallbacks when no batch exists yet. */
export function batchCopy(batch: StorefrontBatch | null) {
  const pickupLocation = batch?.pickupLocation ?? "Kampus ubeloom";
  return {
    number: batch?.number ?? "01",
    open: batch?.open ?? false,
    /** "24 Okt 2026 · 20.00 WIB" */
    closesAt: batch?.closesAt ?? "jadwal menyusul",
    /** "24 Okt · 20.00 WIB" */
    closesAtShort: batch?.closesAtShort ?? "jadwal menyusul",
    /** "26 Okt" */
    pickupDate: batch?.pickupDate ?? "Jadwal menyusul",
    /** "26 Okt 2026" */
    pickupDateLong: batch?.pickupDateLong ?? "Jadwal menyusul",
    pickupLocation,
    /** "26 Okt · Kampus ubeloom" */
    pickupSummary: batch?.pickupDate ? `${batch.pickupDate} · ${pickupLocation}` : pickupLocation,
  };
}
