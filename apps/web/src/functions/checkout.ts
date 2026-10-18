import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { insertCheckoutOrder, insertProof, loadCheckout, loadInvoice } from "./checkout.server";
import { phoneSchema } from "./orders";
import { voucherCodeSchema } from "./vouchers";

/* -------------------------------------------------------------------------- */
/*                               Shared schemas                               */
/* -------------------------------------------------------------------------- */

export const MAX_NOTES_LENGTH = 300;
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

export const placeOrderSchema = z
  .object({
    batchId: z.string().min(1, "Batch tidak ditemukan."),
    customerName: z
      .string("Nama lengkap wajib diisi.")
      .trim()
      .min(2, "Nama lengkap minimal 2 karakter.")
      .max(100, "Nama lengkap maksimal 100 karakter."),
    customerPhone: phoneSchema,
    method: z.enum(["pickup", "delivery"], "Pilih cara menerima pesanan."),
    scheduleId: z.string("Pilih jadwal.").min(1, "Pilih jadwal."),
    address: z.string().trim().max(300, "Alamat maksimal 300 karakter.").optional(),
    recipientName: z.string().trim().max(100, "Nama penerima maksimal 100 karakter.").optional(),
    recipientPhone: z.string().trim().optional(),
    /** Area name from Pengaturan; required for delivery, priced on the server. */
    deliveryArea: z.string().trim().max(80).optional(),
    /** Courier option name from Pengaturan; required on the server when any exist. */
    courier: z.string().trim().max(60).optional(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().int().min(1, "Jumlah minimal 1.").max(99, "Jumlah maksimal 99."),
        }),
      )
      .min(1, "Pilih minimal satu produk.")
      .max(20),
    notes: z
      .string()
      .trim()
      .max(MAX_NOTES_LENGTH, `Catatan maksimal ${MAX_NOTES_LENGTH} karakter.`)
      .optional(),
    /** Applied voucher code; the discount is recomputed on the server. */
    voucherCode: voucherCodeSchema.optional(),
    termsAccepted: z.literal(true, "Setujui syarat preorder untuk melanjutkan."),
    drawOptIn: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.method !== "delivery") return;
    if (!value.deliveryArea) {
      ctx.addIssue({ code: "custom", path: ["deliveryArea"], message: "Pilih area tujuan." });
    }
    if ((value.address?.length ?? 0) < 10) {
      ctx.addIssue({ code: "custom", path: ["address"], message: "Alamat lengkap wajib diisi." });
    }
    if ((value.recipientName?.length ?? 0) < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["recipientName"],
        message: "Nama penerima wajib diisi.",
      });
    }
    const phone = phoneSchema.safeParse(value.recipientPhone ?? "");
    if (!phone.success) {
      ctx.addIssue({
        code: "custom",
        path: ["recipientPhone"],
        message: "WhatsApp penerima tidak valid, contoh 081234567890.",
      });
    }
  })
  .transform((value) => ({
    ...value,
    recipientPhone:
      value.method === "delivery" ? phoneSchema.parse(value.recipientPhone) : undefined,
  }));

export type PlaceOrderInput = z.input<typeof placeOrderSchema>;
export type PlaceOrderData = z.output<typeof placeOrderSchema>;

/** Shape of the private invoice access token; anything else cannot match an invoice. */
export const invoiceTokenSchema = z.string().min(16).max(128);

const submitProofSchema = z.object({
  token: invoiceTokenSchema,
  file: z
    .instanceof(File, { message: "Pilih foto bukti transfer." })
    .refine((file) => file.size > 0, "Pilih foto bukti transfer.")
    .refine((file) => file.size <= MAX_PROOF_BYTES, "Ukuran foto maksimal 5 MB."),
  paidAt: z.coerce
    .date("Waktu bayar tidak valid.")
    .refine((value) => value.getTime() <= Date.now() + 5 * 60 * 1000, "Waktu bayar di masa depan."),
  reference: z.string().trim().max(120, "Referensi maksimal 120 karakter."),
});

export type SubmitProofData = z.output<typeof submitProofSchema>;

/* -------------------------------------------------------------------------- */
/*                                Server fns                                  */
/* -------------------------------------------------------------------------- */

/** Products, slots and delivery areas of the open batch; null when preorder is closed. */
export const getCheckout = createServerFn({ method: "GET" }).handler(() => loadCheckout());

export type CheckoutData = NonNullable<Awaited<ReturnType<typeof getCheckout>>>;

/** Places a customer order and returns the private invoice token. */
export const placeOrder = createServerFn({ method: "POST" })
  .validator(placeOrderSchema)
  .handler(({ data }) => insertCheckoutOrder(data));

/** Private invoice behind the access token from checkout. */
export const getInvoice = createServerFn({ method: "GET" })
  .validator(z.object({ token: invoiceTokenSchema }))
  .handler(({ data }) => loadInvoice(data.token));

export type InvoiceData = Awaited<ReturnType<typeof getInvoice>>;

/** Uploads a payment proof (multipart) and puts the order in review. */
export const submitProof = createServerFn({ method: "POST" })
  .validator((input: FormData) => {
    if (!(input instanceof FormData)) throw new Error("Format unggahan tidak valid.");
    return submitProofSchema.parse({
      token: input.get("token"),
      file: input.get("file"),
      paidAt: input.get("paidAt"),
      reference: input.get("reference") ?? "",
    });
  })
  .handler(({ data }) => insertProof(data));
