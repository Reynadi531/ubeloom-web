import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Download, FileCheck2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { AdminPage } from "@/components/admin/admin-page";

export const Route = createFileRoute("/_auth/dashboard/pesanan/invoice")({
  head: () => ({
    meta: [{ title: "Buat invoice · ubeloom" }],
  }),
  component: InvoiceComponent,
});

// Sample data until orders and invoices live in the database.
const orders: { id: string; product: string; quantity: number; total: number }[] = [
  { id: "ORD-10284", product: "Ube Cloud Cake", quantity: 1, total: 285_000 },
  { id: "ORD-10279", product: "Lumpia Ubi Goreng", quantity: 2, total: 56_000 },
  { id: "ORD-10291", product: "Sparkling Starfruit", quantity: 3, total: 48_000 },
];

const initialInvoice = {
  number: "INV-2026-0048",
  customerName: "Alya Maharani",
  customerEmail: "alya.maharani@email.com",
  issuedOn: "2026-10-24",
  dueOn: "2026-10-31",
  orderId: orders[0].id,
  memo: "Terima kasih telah memilih Ube Pop!",
};

type InvoiceDraft = typeof initialInvoice;

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Formats a `yyyy-mm-dd` input value as "24 Oktober 2026". */
function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "—";
  return dateFormatter.format(new Date(year, month - 1, day));
}

const formatRupiah = (amount: number) => `Rp ${amount.toLocaleString("id-ID")}`;

const fieldClassName =
  "h-10 w-full rounded-[7px] border border-ube-line bg-surface px-3 text-[11px] font-semibold text-ink outline-none focus:border-ube-pop";

function InvoiceComponent() {
  const [invoice, setInvoice] = useState<InvoiceDraft>(initialInvoice);
  const order = orders.find(({ id }) => id === invoice.orderId) ?? orders[0];

  const update = (field: keyof InvoiceDraft) => (value: string) =>
    setInvoice((current) => ({ ...current, [field]: value }));

  return (
    <AdminPage className="bg-surface font-wordmark print:p-0">
      <div className="flex flex-col gap-[18px]">
        <div className="flex flex-col gap-[5px] print:hidden">
          <p className="text-[10px] font-bold tracking-[1.5px] whitespace-pre text-plum">
            {"KEUANGAN  /  DOKUMEN"}
          </p>
          <h1 className="text-[28px]/[1.35] font-extrabold text-ink">Buat invoice</h1>
          <p className="text-xs text-plum">
            Susun detail tagihan, tinjau sebelum diterbitkan, lalu unduh PDF untuk pelanggan.
          </p>
        </div>

        <div className="flex flex-col gap-[18px] xl:min-h-[720px] xl:flex-row">
          <form
            aria-labelledby="invoice-form-title"
            onSubmit={(event) => event.preventDefault()}
            className="flex flex-col gap-[17px] rounded-xl border border-ube-line bg-white p-[22px] xl:w-[490px] xl:shrink-0 print:hidden"
          >
            <h2 id="invoice-form-title" className="text-[17px] font-extrabold text-ink">
              Detail invoice
            </h2>
            <p className="text-[11px] text-plum">
              Informasi ini akan tampil pada dokumen pelanggan.
            </p>
            <TextField label="Nomor invoice" value={invoice.number} onChange={update("number")} />
            <TextField
              label="Nama pelanggan"
              value={invoice.customerName}
              onChange={update("customerName")}
              autoComplete="name"
            />
            <TextField
              label="Email pelanggan"
              type="email"
              value={invoice.customerEmail}
              onChange={update("customerEmail")}
              autoComplete="email"
            />
            <TextField
              label="Tanggal terbit"
              type="date"
              value={invoice.issuedOn}
              onChange={update("issuedOn")}
            />
            <TextField
              label="Jatuh tempo"
              type="date"
              value={invoice.dueOn}
              onChange={update("dueOn")}
            />
            <Field label="Pesanan terkait">
              {(id) => (
                <span className="relative flex">
                  <select
                    id={id}
                    value={invoice.orderId}
                    onChange={(event) => update("orderId")(event.target.value)}
                    className={`${fieldClassName} cursor-pointer appearance-none pr-8`}
                  >
                    {orders.map(({ id: orderId, product }) => (
                      <option key={orderId} value={orderId}>
                        {orderId} · {product}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-plum"
                  />
                </span>
              )}
            </Field>
            <Field label="Catatan">
              {(id) => (
                <textarea
                  id={id}
                  value={invoice.memo}
                  onChange={(event) => update("memo")(event.target.value)}
                  className="h-[58px] w-full resize-none rounded-[7px] border border-ube-line bg-surface p-3 text-[11px] text-plum outline-none focus:border-ube-pop"
                />
              )}
            </Field>
          </form>

          <section
            aria-labelledby="invoice-preview-title"
            className="flex min-w-0 flex-1 flex-col gap-3.5 rounded-xl bg-[#f8f4f7] p-[22px] print:bg-transparent print:p-0"
          >
            <div className="flex items-center justify-between gap-3 print:hidden">
              <h2
                id="invoice-preview-title"
                className="text-[10px] font-extrabold tracking-[1px] text-plum"
              >
                PRATINJAU DOKUMEN
              </h2>
              <p className="text-[10px] whitespace-pre text-plum">{"A4  ·  1 halaman"}</p>
            </div>

            <InvoicePaper invoice={invoice} order={order} />

            {/* No PDF service yet: the browser print dialog saves the page as PDF. */}
            <div className="flex flex-wrap items-center gap-2.5 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-2 rounded-lg bg-deep-ube px-[17px] py-[13px] text-[11px] font-extrabold text-vanilla transition-colors hover:bg-ube-pop"
              >
                <FileCheck2 aria-hidden className="size-[15px]" />
                Terbitkan &amp; unduh PDF
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-[7px] rounded-lg border border-ube-line bg-white px-[15px] py-[13px] text-[11px] font-bold text-deep-ube transition-colors hover:bg-vanilla"
              >
                <Download aria-hidden className="size-3.5" />
                Unduh draf
              </button>
            </div>
            <p className="text-[10px] text-plum print:hidden">
              PDF akan dibuat setelah detail invoice dikonfirmasi. Penerbitan tercatat di aktivitas
              admin.
            </p>
          </section>
        </div>
      </div>
    </AdminPage>
  );
}

function InvoicePaper({
  invoice,
  order,
}: {
  invoice: InvoiceDraft;
  order: (typeof orders)[number];
}) {
  return (
    <article className="flex min-h-[500px] flex-col gap-[15px] rounded-[5px] bg-white p-[26px] text-ink shadow-[0_4px_16px_#321d2d18] print:shadow-none">
      <p className="font-display text-[19px] font-bold text-deep-ube">UBE POP</p>
      <p className="text-2xl font-extrabold">INVOICE</p>
      <p className="text-[10px] font-bold break-all whitespace-pre-wrap text-plum">
        {`${invoice.number || "—"}     ·     ${formatDate(invoice.issuedOn).toUpperCase()}`}
      </p>
      <hr className="border-ube-line" />
      <p className="text-[11px]/[1.6] break-all whitespace-pre-line">
        {`DITAGIHKAN KEPADA\n${invoice.customerName || "—"}\n${invoice.customerEmail || "—"}`}
      </p>
      <p className="text-[11px]/[1.6] whitespace-pre-wrap">
        {`PESANAN  ${order.id}\n${order.product}  ·  ${order.quantity} pesanan`}
      </p>
      <hr className="border-ube-line" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-extrabold">TOTAL TAGIHAN</p>
        <p className="text-xl font-extrabold text-deep-ube">{formatRupiah(order.total)}</p>
      </div>
      <p className="text-[10px] text-plum">Jatuh tempo: {formatDate(invoice.dueOn)}</p>
    </article>
  );
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();

  return (
    <div className="flex flex-col gap-[7px]">
      <label htmlFor={id} className="text-[11px] font-bold text-ink">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  autoComplete = "off",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "date";
  autoComplete?: string;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <input
          id={id}
          type={type}
          value={value}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          className={fieldClassName}
        />
      )}
    </Field>
  );
}
