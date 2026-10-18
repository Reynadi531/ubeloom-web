import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { CASH_PAYMENT_METHOD } from "@/lib/orders";
import { MAX_PRODUCT_IMAGE_BYTES } from "@/lib/product-images";
import { deleteImages, storeImage } from "@/lib/product-images.server";
import { getShopSettings, replaceQrisImage, saveShopSettings } from "@/lib/settings.server";
import { requireAuthMiddleware } from "@/middleware/auth";

const feeSchema = z
  .number("Ongkir wajib diisi.")
  .int("Ongkir harus bilangan bulat.")
  .min(0, "Ongkir tidak boleh negatif.")
  .max(1_000_000, "Ongkir maksimal Rp 1.000.000.");

/** Case-insensitive uniqueness check for lists edited in Pengaturan. */
const uniqueNames = (names: string[]) =>
  new Set(names.map((name) => name.toLowerCase())).size === names.length;

export const shopSettingsSchema = z.object({
  brandName: z
    .string()
    .trim()
    .min(1, "Nama brand wajib diisi.")
    .max(60, "Nama brand maksimal 60 karakter."),
  qrisMerchantName: z.string().trim().max(80, "Nama merchant maksimal 80 karakter."),
  paymentMethods: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Nama metode bayar tidak boleh kosong.")
        .max(60, "Nama metode bayar maksimal 60 karakter.")
        .refine(
          (value) => value.toLowerCase() !== CASH_PAYMENT_METHOD.toLowerCase(),
          `${CASH_PAYMENT_METHOD} selalu tersedia; tidak perlu ditambahkan.`,
        ),
    )
    .max(10, "Maksimal 10 metode bayar.")
    .refine(
      (values) => new Set(values.map((value) => value.toLowerCase())).size === values.length,
      {
        message: "Metode bayar tidak boleh ganda.",
      },
    ),
  deliveryRates: z
    .array(
      z.object({
        area: z
          .string()
          .trim()
          .min(1, "Nama area tidak boleh kosong.")
          .max(80, "Nama area maksimal 80 karakter."),
        fee: feeSchema,
      }),
    )
    .max(30, "Maksimal 30 tarif area.")
    .refine((rates) => uniqueNames(rates.map(({ area }) => area)), {
      message: "Nama area tidak boleh ganda.",
    }),
  couriers: z
    .array(
      z.object({
        name: z
          .string()
          .trim()
          .min(1, "Nama kurir tidak boleh kosong.")
          .max(60, "Nama kurir maksimal 60 karakter."),
        fee: feeSchema,
      }),
    )
    .max(10, "Maksimal 10 opsi kurir.")
    .refine((options) => uniqueNames(options.map(({ name }) => name)), {
      message: "Nama kurir tidak boleh ganda.",
    }),
  invoiceMemo: z.string().trim().max(300, "Catatan invoice maksimal 300 karakter."),
});

export type ShopSettingsInput = z.input<typeof shopSettingsSchema>;

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireAuthMiddleware])
  .handler(() => getShopSettings());

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(shopSettingsSchema)
  .handler(async ({ data, context }) => {
    await saveShopSettings(data, context.session.user.id);
    return { ok: true };
  });

/** Uploads (multipart) a QRIS code image and makes it the one shown on invoices. */
export const uploadQrisImage = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator((input: FormData) => {
    if (!(input instanceof FormData)) throw new Error("Format unggahan tidak valid.");
    return z
      .object({
        file: z
          .instanceof(File, { message: "Pilih gambar QRIS." })
          .refine((file) => file.size > 0, "Pilih gambar QRIS.")
          .refine(
            (file) => file.size <= MAX_PRODUCT_IMAGE_BYTES,
            `Gambar maksimal ${MAX_PRODUCT_IMAGE_BYTES / 1024 / 1024} MB.`,
          ),
      })
      .parse({ file: input.get("file") });
  })
  .handler(async ({ data, context }) => {
    const key = await storeImage(data.file, "qris");
    let previous: string | null;
    try {
      previous = await replaceQrisImage(key, context.session.user.id);
    } catch (error) {
      await deleteImages([key]);
      throw error;
    }
    if (previous) await deleteImages([previous]);
    return { key };
  });

/** Removes the QRIS image; invoices fall back to "QRIS belum tersedia". */
export const removeQrisImage = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .handler(async ({ context }) => {
    const previous = await replaceQrisImage(null, context.session.user.id);
    if (previous) await deleteImages([previous]);
    return { ok: true };
  });
