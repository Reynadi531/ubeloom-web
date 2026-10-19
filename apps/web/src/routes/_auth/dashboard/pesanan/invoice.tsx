import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ChevronDown, Download, FileCheck2 } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AdminPage } from "@/components/admin/admin-page";
import { fieldErrors, serverErrorMessage } from "@/components/admin/orders/form-errors";
import {
  type InvoiceForm,
  createInvoice,
  createInvoiceSchema,
  getInvoiceForm,
} from "@/functions/invoices";
import { formatLongDate, formatRupiah, fromDateInputValue } from "@/lib/format";

export const Route = createFileRoute("/_auth/dashboard/pesanan/invoice")({
  head: () => ({
    meta: [{ title: "Buat invoice · ubeloom" }],
  }),
  validateSearch: z.object({ orderId: z.string().min(1).optional().catch(undefined) }),
  loaderDeps: ({ search }) => ({ orderId: search.orderId }),
  loader: ({ deps }) => getInvoiceForm({ data: deps }),
  component: InvoiceRoute,
});

type InvoiceOrder = InvoiceForm["orders"][number];

type InvoiceDraft = {
  orderId: string;
  customerName: string;
  customerEmail: string;
  issuedOn: string;
  dueOn: string;
  memo: string;
};

/** Formats a `yyyy-mm-dd` input value as "24 Oktober 2026". */
function formatDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "—";
  const date = fromDateInputValue(value);
  return Number.isNaN(date.getTime()) ? "—" : formatLongDate(date);
}

const fieldClassName =
  "h-10 w-full rounded-[7px] border border-ube-line bg-surface px-3 text-[11px] font-semibold text-ink outline-none focus:border-ube-pop";
const fieldErrorClassName = "text-[10px] font-semibold text-[#b42318]";

function InvoiceRoute() {
  const form = Route.useLoaderData();
  // Remount when the preselected order changes so the draft re-prefills.
  return <InvoiceComponent key={form.selectedOrderId ?? "none"} form={form} />;
}

function InvoiceComponent({ form }: { form: InvoiceForm }) {
  const router = useRouter();
  const initialOrder = form.orders.find(({ id }) => id === form.selectedOrderId);
  const [invoice, setInvoice] = useState<InvoiceDraft>({
    orderId: initialOrder?.id ?? "",
    customerName: initialOrder?.customerName ?? "",
    customerEmail: initialOrder?.customerEmail ?? "",
    issuedOn: form.defaults.issuedOn,
    dueOn: form.defaults.dueOn,
    memo: form.defaults.memo,
  });
  const [issuedNumber, setIssuedNumber] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [printRequested, setPrintRequested] = useState(false);
  const order = form.orders.find(({ id }) => id === invoice.orderId);

  // Print after the issued number has rendered into the preview.
  useEffect(() => {
    if (!printRequested) return;
    setPrintRequested(false);
    window.print();
  }, [printRequested]);

  const update = (field: keyof InvoiceDraft) => (value: string) => {
    setIssuedNumber(undefined);
    setInvoice((current) => {
      if (field !== "orderId") return { ...current, [field]: value };
      const next = form.orders.find(({ id }) => id === value);
      return {
        ...current,
        orderId: value,
        customerName: next?.customerName ?? current.customerName,
        customerEmail: next?.customerEmail ?? current.customerEmail,
      };
    });
  };

  const publish = async () => {
    if (issuedNumber) {
      setPrintRequested(true);
      return;
    }
    const parsed = createInvoiceSchema.safeParse(invoice);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      toast.error(Object.values(next)[0] ?? "Periksa kembali detail invoice.");
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const created = await createInvoice({ data: invoice });
      setIssuedNumber(created.number);
      toast.success(`Invoice ${created.number} diterbitkan.`);
      setPrintRequested(true);
      // Refresh the suggested next number for the following draft.
      void router.invalidate();
    } catch (error) {
      const message = serverErrorMessage(error);
      setErrors({ form: message });
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const number = issuedNumber ?? form.nextNumber;

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
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void publish();
            }}
            className="flex flex-col gap-[17px] rounded-xl border border-ube-line bg-white p-[22px] xl:w-[490px] xl:shrink-0 print:hidden"
          >
            <h2 id="invoice-form-title" className="text-[17px] font-extrabold text-ink">
              Detail invoice
            </h2>
            <p className="text-[11px] text-plum">
              Informasi ini akan tampil pada dokumen pelanggan.
            </p>
            <Field
              label="Nomor invoice"
              hint={
                issuedNumber ? "Sudah diterbitkan." : "Nomor final diberikan otomatis saat terbit."
              }
            >
              {(id) => (
                <input id={id} readOnly value={number} className={`${fieldClassName} text-plum`} />
              )}
            </Field>
            <TextField
              label="Nama pelanggan"
              value={invoice.customerName}
              onChange={update("customerName")}
              autoComplete="name"
              error={errors.customerName}
            />
            <TextField
              label="Email pelanggan"
              type="email"
              value={invoice.customerEmail}
              onChange={update("customerEmail")}
              autoComplete="email"
              error={errors.customerEmail}
            />
            <TextField
              label="Tanggal terbit"
              type="date"
              value={invoice.issuedOn}
              onChange={update("issuedOn")}
              error={errors.issuedOn}
            />
            <TextField
              label="Jatuh tempo"
              type="date"
              value={invoice.dueOn}
              onChange={update("dueOn")}
              error={errors.dueOn}
            />
            <Field label="Pesanan terkait" error={errors.orderId}>
              {(id) => (
                <span className="relative flex">
                  <select
                    id={id}
                    value={invoice.orderId}
                    onChange={(event) => update("orderId")(event.target.value)}
                    className={`${fieldClassName} cursor-pointer appearance-none pr-8`}
                  >
                    {form.orders.length === 0 && (
                      <option value="" disabled>
                        Belum ada pesanan
                      </option>
                    )}
                    {form.orders.map(({ id: orderId, invoiceNumber, customerName }) => (
                      <option key={orderId} value={orderId}>
                        {invoiceNumber} · {customerName}
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
            <Field label="Catatan" error={errors.memo}>
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
              <p className="text-[10px] text-plum">Ukuran A4</p>
            </div>

            <InvoicePaper
              brandName={form.brandName}
              invoice={invoice}
              number={issuedNumber ?? `${form.nextNumber} (DRAF)`}
              order={order}
            />

            {/* No PDF service yet: the browser print dialog saves the page as PDF. */}
            <div className="flex flex-wrap items-center gap-2.5 print:hidden">
              <button
                type="button"
                disabled={submitting || !order}
                onClick={() => void publish()}
                className="flex items-center gap-2 rounded-lg bg-deep-ube px-[17px] py-[13px] text-[11px] font-extrabold text-vanilla transition-colors hover:bg-ube-pop disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FileCheck2 aria-hidden className="size-[15px]" />
                {submitting
                  ? "Menerbitkan…"
                  : issuedNumber
                    ? "Unduh PDF lagi"
                    : "Terbitkan & unduh PDF"}
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
            {errors.form && (
              <p role="alert" className={`${fieldErrorClassName} print:hidden`}>
                {errors.form}
              </p>
            )}
            <p className="text-[10px] text-plum print:hidden">
              Simpan sebagai PDF lewat dialog cetak. Penerbitan tercatat di riwayat pesanan.
            </p>
          </section>
        </div>
      </div>
    </AdminPage>
  );
}

function InvoicePaper({
  brandName,
  invoice,
  number,
  order,
}: {
  brandName: string;
  invoice: InvoiceDraft;
  number: string;
  order?: InvoiceOrder;
}) {
  return (
    <article className="flex min-h-[500px] flex-col gap-[15px] rounded-[5px] bg-white p-[26px] text-ink shadow-[0_4px_16px_#321d2d18] print:shadow-none">
      <p className="font-display text-[19px] font-bold text-deep-ube">{brandName.toUpperCase()}</p>
      <p className="text-2xl font-extrabold">INVOICE</p>
      <p className="text-[10px] font-bold break-all whitespace-pre-wrap text-plum">
        {`${number}     ·     ${formatDate(invoice.issuedOn).toUpperCase()}`}
      </p>
      <hr className="border-ube-line" />
      <p className="text-[11px]/[1.6] break-all whitespace-pre-line">
        {`DITAGIHKAN KEPADA\n${invoice.customerName || "—"}\n${invoice.customerEmail || "—"}`}
      </p>
      <p className="text-[11px]/[1.6] whitespace-pre-wrap">
        {`PESANAN  ${order?.invoiceNumber ?? "—"}`}
      </p>
      {order && (
        <ul className="flex flex-col gap-1 text-[11px]/[1.6]">
          {order.items.map(({ productName, quantity, lineTotal }) => (
            <li key={productName} className="flex justify-between gap-3">
              <span>
                {productName} · {quantity} × {formatRupiah(lineTotal / quantity)}
              </span>
              <span className="font-bold">{formatRupiah(lineTotal)}</span>
            </li>
          ))}
          {(order.shippingLabel || order.shippingFee > 0) && (
            <li className="flex justify-between gap-3">
              <span>{order.shippingLabel ?? "Ongkir"}</span>
              <span className="font-bold">{formatRupiah(order.shippingFee)}</span>
            </li>
          )}
          {order.vouchers.map(({ code, discount }) => (
            <li key={code} className="flex justify-between gap-3">
              <span>Voucher {code}</span>
              <span className="font-bold">−{formatRupiah(discount)}</span>
            </li>
          ))}
        </ul>
      )}
      <hr className="border-ube-line" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-extrabold">TOTAL TAGIHAN</p>
        <p className="text-xl font-extrabold text-deep-ube">{formatRupiah(order?.total ?? 0)}</p>
      </div>
      <p className="text-[10px] text-plum">Jatuh tempo: {formatDate(invoice.dueOn)}</p>
      {invoice.memo && <p className="text-[10px] whitespace-pre-line text-plum">{invoice.memo}</p>}
    </article>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();

  return (
    <div className="flex flex-col gap-[7px]">
      <label htmlFor={id} className="text-[11px] font-bold text-ink">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-[10px] text-plum">{hint}</p>}
      {error && <p className={fieldErrorClassName}>{error}</p>}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  error,
  type = "text",
  autoComplete = "off",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: "text" | "email" | "date";
  autoComplete?: string;
}) {
  return (
    <Field label={label} error={error}>
      {(id) => (
        <input
          id={id}
          type={type}
          value={value}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
          className={fieldClassName}
        />
      )}
    </Field>
  );
}
