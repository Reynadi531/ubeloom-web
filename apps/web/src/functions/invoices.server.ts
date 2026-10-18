/** Server-only invoice logic behind the server fns in `./invoices`. */
import { invoice, orderEvent } from "@web-kwu/db/schema/shop";
import { sql } from "drizzle-orm";

import { getCurrentBatch } from "@/lib/batches.server";
import { getShopSettings } from "@/lib/settings.server";
import { fromDateInputValue, toDateInputValue } from "@/lib/format";
import { db } from "@/services";

import type { CreateInvoiceData } from "./invoices";
import { isUniqueViolation } from "./orders.server";

const INVOICE_PREFIX = "INV";

/** Next `INV-YYYY-NNNN` for the year; pass a transaction to read under its lock. */
async function nextInvoiceNumber(executor: Pick<typeof db, "select">, year: string) {
  const prefix = `${INVOICE_PREFIX}-${year}-`;
  const [row] = await executor
    .select({
      last: sql<
        number | null
      >`max(substring(${invoice.number} from ${prefix.length + 1}::int)::int)`,
    })
    .from(invoice)
    .where(sql`${invoice.number} ~ ${`^${prefix}[0-9]+$`}`);
  const next = Number(row?.last ?? 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

function summarize(items: { productName: string; quantity: number }[]) {
  return items.map(({ productName, quantity }) => `${productName} × ${quantity}`).join(", ");
}

/** Orders of the current batch (plus a preselected one from elsewhere) for the invoice form. */
export async function loadInvoiceForm(orderId?: string) {
  const [current, settings] = await Promise.all([getCurrentBatch(), getShopSettings()]);
  const orders = current
    ? await db.query.order.findMany({
        where: { batchId: current.id },
        with: { items: true },
        orderBy: { createdAt: "desc" },
      })
    : [];
  if (orderId && !orders.some(({ id }) => id === orderId)) {
    const extra = await db.query.order.findFirst({
      where: { id: orderId },
      with: { items: true },
    });
    if (extra) orders.unshift(extra);
  }

  const today = new Date();
  const issuedOn = toDateInputValue(today);
  const dueOn = toDateInputValue(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000));
  const selected = orders.find(({ id }) => id === orderId) ?? orders[0];

  return {
    batchName: current?.name ?? null,
    brandName: settings.brandName,
    nextNumber: await nextInvoiceNumber(db, issuedOn.slice(0, 4)),
    defaults: { issuedOn, dueOn, memo: settings.invoiceMemo },
    selectedOrderId: selected?.id ?? null,
    orders: orders.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      customerName: row.customerName,
      customerEmail: row.customerEmail ?? "",
      itemsSummary: summarize(row.items),
      items: row.items.map(({ productName, quantity, unitPrice, lineTotal }) => ({
        productName,
        quantity,
        unitPrice,
        lineTotal,
      })),
      subtotal: row.subtotal,
      shippingFee: row.shippingFee,
      /** "Ongkir · Sekitar kampus · GoSend" for delivery; null for pickup. */
      shippingLabel:
        row.method === "delivery"
          ? ["Ongkir", row.deliveryArea, row.courier].filter(Boolean).join(" · ")
          : null,
      total: row.total,
    })),
  };
}

/** Inserts the invoice with the next sequential number of its issue year. */
export async function issueInvoice(data: CreateInvoiceData, actorId: string) {
  const relatedOrder = await db.query.order.findFirst({
    where: { id: data.orderId },
    columns: { id: true },
  });
  if (!relatedOrder) throw new Error("Pesanan terkait tidak ditemukan.");
  const year = data.issuedOn.slice(0, 4);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        // Serialise numbering per year; the unique index on `number` is the backstop.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invoice-number-${year}`}))`);
        const number = await nextInvoiceNumber(tx, year);
        const [created] = await tx
          .insert(invoice)
          .values({
            number,
            orderId: relatedOrder.id,
            customerName: data.customerName,
            customerEmail: data.customerEmail || null,
            issuedOn: fromDateInputValue(data.issuedOn),
            dueOn: fromDateInputValue(data.dueOn),
            memo: data.memo,
            createdById: actorId,
          })
          .returning({ id: invoice.id, number: invoice.number });
        await tx.insert(orderEvent).values({
          orderId: relatedOrder.id,
          type: "invoice_issued",
          note: `Invoice ${number} diterbitkan`,
          actorId,
        });
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }
  throw new Error("Gagal menerbitkan nomor invoice. Silakan coba lagi.");
}
