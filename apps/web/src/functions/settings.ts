import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { CASH_PAYMENT_METHOD } from "@/lib/orders";
import { getShopSettings, saveShopSettings } from "@/lib/settings.server";
import { requireAuthMiddleware } from "@/middleware/auth";

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
