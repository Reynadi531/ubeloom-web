import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { VOUCHER_CODE_PATTERN, normalizeVoucherCode } from "@/lib/vouchers";
import { requireAuthMiddleware } from "@/middleware/auth";

import {
  checkVoucherForCart,
  listVouchersPage,
  removeVoucher,
  toggleVoucher,
  upsertVoucher,
} from "./vouchers.server";

/* -------------------------------------------------------------------------- */
/*                               Shared schemas                               */
/* -------------------------------------------------------------------------- */

export const voucherCodeSchema = z
  .string("Kode voucher wajib diisi.")
  .transform(normalizeVoucherCode)
  .pipe(
    z
      .string()
      .regex(VOUCHER_CODE_PATTERN, "Kode voucher 3–32 karakter: huruf, angka, tanda - atau _."),
  );

const rupiahSchema = (label: string) =>
  z
    .number(`${label} wajib diisi.`)
    .int(`${label} harus bilangan bulat.`)
    .min(0, `${label} tidak boleh negatif.`)
    .max(100_000_000, `${label} terlalu besar.`);

const discountTypeSchema = z.enum(["percentage", "fixed"], "Pilih jenis diskon.");

/** Percent 1–100, or a rupiah cut of at least Rp 1. */
function discountValueIssue(discountType: "percentage" | "fixed", value: number) {
  if (!Number.isInteger(value)) return "Nilai diskon harus bilangan bulat.";
  if (discountType === "percentage")
    return value >= 1 && value <= 100 ? null : "Persentase diskon 1–100.";
  return value >= 1 && value <= 100_000_000 ? null : "Potongan harga minimal Rp 1.";
}

export const saveVoucherSchema = z
  .object({
    id: z.string().optional(),
    code: voucherCodeSchema,
    description: z.string().trim().max(120, "Deskripsi maksimal 120 karakter."),
    scope: z.enum(["order", "products"], "Pilih cakupan voucher."),
    /** Scope `order` only. */
    discountType: discountTypeSchema,
    value: z.number("Nilai diskon wajib diisi."),
    /** Scope `products` only: one discount per product. */
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          discountType: discountTypeSchema,
          value: z.number("Nilai diskon produk wajib diisi."),
        }),
      )
      .max(100, "Maksimal 100 produk."),
    maxDiscount: rupiahSchema("Maksimal diskon").nullable(),
    minSubtotal: rupiahSchema("Minimal belanja"),
    quota: z
      .number()
      .int("Kuota harus bilangan bulat.")
      .min(1, "Kuota minimal 1; kosongkan untuk tanpa batas.")
      .max(1_000_000, "Kuota terlalu besar.")
      .nullable(),
    startsAt: z.coerce.date("Waktu mulai tidak valid.").nullable(),
    endsAt: z.coerce.date("Waktu berakhir tidak valid.").nullable(),
    active: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "order") {
      const issue = discountValueIssue(value.discountType, value.value);
      if (issue) ctx.addIssue({ code: "custom", path: ["value"], message: issue });
    } else {
      if (value.items.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["items"],
          message: "Tambah minimal satu produk promo.",
        });
      }
      const seen = new Set<string>();
      for (const item of value.items) {
        if (seen.has(item.productId)) {
          ctx.addIssue({
            code: "custom",
            path: ["items"],
            message: "Produk promo tidak boleh ganda.",
          });
          break;
        }
        seen.add(item.productId);
        const issue = discountValueIssue(item.discountType, item.value);
        if (issue) {
          ctx.addIssue({ code: "custom", path: ["items"], message: issue });
          break;
        }
      }
    }
    if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "Waktu berakhir harus setelah waktu mulai.",
      });
    }
  })
  // Fields of the other scope are cleared, not kept stale.
  .transform(({ discountType, value, items, ...rest }) =>
    rest.scope === "order"
      ? { ...rest, discountType, value, items: [] }
      : { ...rest, discountType: null, value: null, items },
  );

export type SaveVoucherInput = z.input<typeof saveVoucherSchema>;
export type SaveVoucherData = z.output<typeof saveVoucherSchema>;

export const checkVoucherSchema = z.object({
  batchId: z.string().min(1),
  code: voucherCodeSchema,
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1, "Pilih produk dulu sebelum memakai voucher.")
    .max(20),
});

export type CheckVoucherData = z.output<typeof checkVoucherSchema>;

/* -------------------------------------------------------------------------- */
/*                                Server fns                                  */
/* -------------------------------------------------------------------------- */

/** Every voucher with its usage, plus the catalog for the product picker. */
export const getVouchers = createServerFn({ method: "GET" })
  .middleware([requireAuthMiddleware])
  .handler(() => listVouchersPage());

export type VouchersPage = Awaited<ReturnType<typeof getVouchers>>;
export type VoucherRow = VouchersPage["vouchers"][number];

export const saveVoucher = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(saveVoucherSchema)
  .handler(({ data, context }) => upsertVoucher(data, context.session.user.id));

export const setVoucherActive = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(z.object({ id: z.string().min(1), active: z.boolean() }))
  .handler(({ data }) => toggleVoucher(data.id, data.active));

/** Deletes a voucher no order has used; used ones can only be deactivated. */
export const deleteVoucher = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(({ data }) => removeVoucher(data.id));

/** Public: previews a voucher's discount on a checkout cart; placement re-checks it. */
export const checkVoucher = createServerFn({ method: "POST" })
  .validator(checkVoucherSchema)
  .handler(({ data }) => checkVoucherForCart(data));
