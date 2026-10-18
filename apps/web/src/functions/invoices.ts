import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { fromDateInputValue } from "@/lib/format";
import { requireAuthMiddleware } from "@/middleware/auth";

import { issueInvoice, loadInvoiceForm } from "./invoices.server";

const dateInput = (message: string) =>
  z
    .string(message)
    .regex(/^\d{4}-\d{2}-\d{2}$/, message)
    .refine((value) => !Number.isNaN(fromDateInputValue(value).getTime()), message);

export const createInvoiceSchema = z
  .object({
    orderId: z.string("Pilih pesanan terkait.").min(1, "Pilih pesanan terkait."),
    customerName: z
      .string("Nama pelanggan wajib diisi.")
      .trim()
      .min(2, "Nama pelanggan minimal 2 karakter.")
      .max(100, "Nama pelanggan maksimal 100 karakter."),
    customerEmail: z
      .union([z.literal(""), z.email("Format email pelanggan tidak valid.")])
      .optional(),
    issuedOn: dateInput("Tanggal terbit tidak valid."),
    dueOn: dateInput("Tanggal jatuh tempo tidak valid."),
    memo: z.string().trim().max(500, "Catatan maksimal 500 karakter.").default(""),
  })
  .refine(({ issuedOn, dueOn }) => dueOn >= issuedOn, {
    path: ["dueOn"],
    message: "Jatuh tempo tidak boleh sebelum tanggal terbit.",
  });

export type CreateInvoiceInput = z.input<typeof createInvoiceSchema>;
export type CreateInvoiceData = z.output<typeof createInvoiceSchema>;

/** Orders of the current batch for the picker, the next number preview and default dates. */
export const getInvoiceForm = createServerFn({ method: "GET" })
  .middleware([requireAuthMiddleware])
  .validator(z.object({ orderId: z.string().optional() }))
  .handler(({ data }) => loadInvoiceForm(data.orderId));

export type InvoiceForm = Awaited<ReturnType<typeof getInvoiceForm>>;

/** Issues an invoice document numbered `INV-YYYY-NNNN`, sequential per issue year. */
export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .validator(createInvoiceSchema)
  .handler(({ data, context }) => issueInvoice(data, context.session.user.id));
