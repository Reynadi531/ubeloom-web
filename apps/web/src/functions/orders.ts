import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAuthMiddleware } from "@/middleware/auth";

import {
  buildOrdersCsv,
  insertManualOrder,
  listOrdersPage,
  loadManualOrderForm,
} from "./orders.server";

/* -------------------------------------------------------------------------- */
/*                               Shared schemas                               */
/* -------------------------------------------------------------------------- */

export const orderTabs = [
  { key: "semua", label: "Semua" },
  { key: "menunggu-bayar", label: "Menunggu bayar" },
  { key: "disiapkan", label: "Disiapkan" },
  { key: "pickup", label: "Pickup" },
  { key: "delivery", label: "Delivery" },
] as const;

export type OrderTabKey = (typeof orderTabs)[number]["key"];

const tabKeys = orderTabs.map(({ key }) => key) as [OrderTabKey, ...OrderTabKey[]];

/** URL search params of the orders list; every field falls back to "no filter" when invalid. */
export const orderListFiltersSchema = z.object({
  batch: z.string().min(1).optional().catch(undefined),
  tab: z.enum(tabKeys).optional().catch(undefined),
  payment: z.enum(["unpaid", "review", "paid"]).optional().catch(undefined),
  method: z.enum(["pickup", "delivery"]).optional().catch(undefined),
  /** Schedule day in WIB, `yyyy-mm-dd`. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  q: z.string().max(100).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
});

export type OrderListFilters = z.infer<typeof orderListFiltersSchema>;

/** Payment methods offered on the manual order form. */
export const manualPaymentMethods = [
  "Transfer bank · BCA",
  "Transfer bank · Mandiri",
  "QRIS",
  "Tunai",
] as const;

const phoneSchema = z
  .string("Nomor WhatsApp wajib diisi.")
  .trim()
  .transform((value) => value.replace(/[\s().-]/g, ""))
  .pipe(
    z
      .string()
      .min(1, "Nomor WhatsApp wajib diisi.")
      .regex(/^(\+?62|0)8\d{7,12}$/, "Nomor WhatsApp tidak valid, contoh 081234567890."),
  )
  .transform((value) => value.replace(/^\+?62/, "0"));

export const createOrderSchema = z
  .object({
    batchId: z.string().min(1, "Batch tidak ditemukan."),
    customerName: z
      .string("Nama pelanggan wajib diisi.")
      .trim()
      .min(2, "Nama pelanggan minimal 2 karakter.")
      .max(100, "Nama pelanggan maksimal 100 karakter."),
    customerPhone: phoneSchema,
    method: z.enum(["pickup", "delivery"], "Pilih metode pemenuhan."),
    scheduleId: z.string("Pilih jadwal pemenuhan.").min(1, "Pilih jadwal pemenuhan."),
    address: z.string().trim().max(300, "Alamat maksimal 300 karakter.").optional(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z
            .number()
            .int("Jumlah item harus bilangan bulat.")
            .min(1, "Jumlah item minimal 1.")
            .max(999, "Jumlah item maksimal 999."),
        }),
      )
      .min(1, "Tambahkan minimal satu item pesanan.")
      .max(50, "Terlalu banyak item dalam satu pesanan."),
    paymentMethod: z.enum(manualPaymentMethods, "Pilih metode pembayaran."),
    /** Whole rupiah received; null when nothing has been paid yet. */
    amountReceived: z
      .number()
      .int("Nominal harus bilangan bulat.")
      .min(0, "Nominal tidak boleh negatif.")
      .max(1_000_000_000, "Nominal terlalu besar.")
      .nullable(),
    /** Name of the attached proof file; files are not stored yet. */
    proofFileName: z.string().trim().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.method === "delivery" && (value.address?.length ?? 0) < 5) {
      ctx.addIssue({
        code: "custom",
        path: ["address"],
        message: "Alamat pengiriman wajib diisi untuk delivery.",
      });
    }
  });

export type CreateOrderInput = z.input<typeof createOrderSchema>;

export type CreateOrderData = z.output<typeof createOrderSchema>;

/* -------------------------------------------------------------------------- */
/*                                Server fns                                  */
/* -------------------------------------------------------------------------- */

/** One page of the batch's orders plus tab counts and filter options. */
export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireAuthMiddleware])
  .validator(orderListFiltersSchema)
  .handler(({ data }) => listOrdersPage(data));

export type OrderListResult = Awaited<ReturnType<typeof listOrders>>;
export type OrderListRow = OrderListResult["orders"][number];

/** CSV of the filtered orders ("orders") or of item totals per schedule ("production"). */
export const exportOrdersCsv = createServerFn({ method: "GET" })
  .middleware([requireAuthMiddleware])
  .validator(orderListFiltersSchema.extend({ kind: z.enum(["orders", "production"]) }))
  .handler(({ data, context }) => buildOrdersCsv(data, data.kind, context.session.user.email));

/** Products, schedules and fees of the current batch for the manual order form. */
export const getManualOrderForm = createServerFn({ method: "GET" })
  .middleware([requireAuthMiddleware])
  .handler(() => loadManualOrderForm());

export type ManualOrderForm = Awaited<ReturnType<typeof getManualOrderForm>>;

/** Creates a manual order; see `insertManualOrder` for pricing and payment rules. */
export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(createOrderSchema)
  .handler(({ data, context }) => insertManualOrder(data, context.session.user.id));
