import { createFileRoute, useRouter } from "@tanstack/react-router";
import { CloudUpload, Minus, Plus } from "lucide-react";
import { type FormEvent, type ReactNode, type Ref, useRef, useState } from "react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/admin-page";
import { fieldErrors, serverErrorMessage } from "@/components/admin/orders/form-errors";
import {
  type CreateOrderInput,
  createOrder,
  createOrderSchema,
  getManualOrderForm,
  manualPaymentMethods,
} from "@/functions/orders";
import { formatRupiah } from "@/lib/format";
import type { FulfillmentMethod } from "@/lib/orders";

export const Route = createFileRoute("/_auth/dashboard/pesanan/baru")({
  head: () => ({
    meta: [{ title: "Buat pesanan baru · ubeloom" }],
  }),
  loader: () => getManualOrderForm(),
  component: ManualOrderComponent,
});

const fulfillmentOptions: { value: FulfillmentMethod; label: string }[] = [
  { value: "pickup", label: "Pickup di toko" },
  { value: "delivery", label: "Delivery" },
];

const MAX_PROOF_BYTES = 10 * 1024 * 1024;

const cardClassName = "flex flex-col rounded-xl border border-ube-line bg-white p-[18px]";
const fieldLabelClassName = "text-[10px] font-bold text-plum";
const fieldErrorClassName = "text-[10px] font-semibold text-[#b42318]";
const inputClassName =
  "h-[42px] w-full rounded-lg border border-ube-line bg-surface px-[11px] text-xs text-ink outline-none transition-colors focus:border-ube-pop";

function ManualOrderComponent() {
  const form = Route.useLoaderData();
  const router = useRouter();
  const productSelectRef = useRef<HTMLSelectElement>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [fulfillment, setFulfillment] = useState<FulfillmentMethod>("pickup");
  const [scheduleId, setScheduleId] = useState("");
  const [address, setAddress] = useState("");
  const [items, setItems] = useState<{ id: string; quantity: number }[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string>(manualPaymentMethods[0]);
  /** Digits typed by the admin; undefined follows the order total. */
  const [amountInput, setAmountInput] = useState<string>();
  const [proof, setProof] = useState<File>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const canOrder = form.batch?.isOpen === true;
  const scheduleOptions =
    fulfillment === "pickup"
      ? form.pickupSlots.map(({ id, label, remaining }) => ({
          value: id,
          label: `${label}${remaining > 0 ? ` · sisa ${remaining}` : " · penuh"}`,
        }))
      : form.deliveryZones.map(({ id, label }) => ({ value: id, label }));
  const scheduleLabel = scheduleOptions.find(({ value }) => value === scheduleId)?.label;
  const shippingFee =
    fulfillment === "delivery"
      ? (form.deliveryZones.find(({ id }) => id === scheduleId)?.fee ?? 0)
      : 0;

  const lines = items.flatMap(({ id, quantity }) => {
    const product = form.products.find((candidate) => candidate.id === id);
    return product ? [{ ...product, quantity, total: product.price * quantity }] : [];
  });
  const subtotal = lines.reduce((sum, { total }) => sum + total, 0);
  const orderTotal = subtotal + shippingFee;
  const amountDigits = amountInput ?? (orderTotal > 0 ? String(orderTotal) : "");
  const amount = amountDigits ? Number(amountDigits) : null;
  const isCash = paymentMethod === "Tunai";

  const changeQuantity = (id: string, delta: number) =>
    setItems((current) =>
      current.some((item) => item.id === id)
        ? current
            .map((item) => (item.id === id ? { ...item, quantity: item.quantity + delta } : item))
            .filter(({ quantity }) => quantity > 0)
        : delta > 0
          ? [...current, { id, quantity: delta }]
          : current,
    );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.batch) return;
    if (proof && proof.size > MAX_PROOF_BYTES) {
      setErrors({ form: "Bukti transaksi maksimal 10 MB." });
      return;
    }
    const input: CreateOrderInput = {
      batchId: form.batch.id,
      customerName: name,
      customerPhone: phone,
      method: fulfillment,
      scheduleId,
      address: fulfillment === "delivery" ? address : undefined,
      items: items.map(({ id, quantity }) => ({ productId: id, quantity })),
      paymentMethod: paymentMethod as CreateOrderInput["paymentMethod"],
      amountReceived: amount,
      proofFileName: proof?.name,
    };
    const parsed = createOrderSchema.safeParse(input);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      toast.error(Object.values(next)[0] ?? "Periksa kembali data pesanan.");
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const created = await createOrder({ data: input });
      toast.success(`Pesanan ${created.invoiceNumber} tersimpan.`);
      await router.navigate({ to: "/dashboard/pesanan", search: { q: created.invoiceNumber } });
    } catch (error) {
      const message = serverErrorMessage(error);
      setErrors({ form: message });
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const paymentNote =
    amount === null
      ? {
          title: "Belum ada pembayaran",
          body: "Pesanan tersimpan dengan status belum bayar. Kosongkan nominal bila pelanggan belum membayar.",
        }
      : isCash
        ? {
            title: "Tunai langsung lunas",
            body: "Pembayaran tunai dicatat disetujui dan pesanan tersimpan sebagai lunas.",
          }
        : {
            title: "Bukti akan ditinjau",
            body: "Pesanan tersimpan dengan status menunggu verifikasi setelah dikirim.",
          };

  return (
    <AdminPage className="bg-surface font-wordmark">
      <div className="flex flex-col gap-[5px]">
        <p className="text-[10px] font-extrabold tracking-[1.4px] text-ube-pop">
          PESANAN · INPUT MANUAL
        </p>
        <h1 className="text-[26px]/[1.2] font-extrabold text-ink">Buat pesanan baru</h1>
        <p className="text-xs text-plum">
          Catat pesanan di luar checkout dan lampirkan bukti transaksi.
        </p>
      </div>

      {!canOrder && (
        <p
          role="status"
          className="rounded-[10px] bg-[#fff1d3] px-3.5 py-3 text-xs font-bold text-[#855814]"
        >
          {form.batch
            ? `Batch ${form.batch.name} sedang tidak dibuka. Buka batch terlebih dahulu untuk mencatat pesanan.`
            : "Belum ada batch. Buat dan buka batch terlebih dahulu untuk mencatat pesanan."}
        </p>
      )}

      <form
        noValidate
        onSubmit={submit}
        className="grid items-start gap-4 xl:grid-cols-[640fr_354fr]"
      >
        <div className="flex min-w-0 flex-col gap-3.5">
          <section aria-labelledby="customer-heading" className={`${cardClassName} gap-[11px]`}>
            <SectionHeading id="customer-heading">{"01  ·  Data pelanggan"}</SectionHeading>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="flex flex-col gap-[5px]">
                <span className={fieldLabelClassName}>Nama pelanggan</span>
                <input
                  required
                  autoComplete="off"
                  value={name}
                  placeholder="Nama lengkap"
                  aria-invalid={Boolean(errors.customerName)}
                  onChange={(event) => setName(event.target.value)}
                  className={inputClassName}
                />
                <FieldError message={errors.customerName} />
              </label>
              <label className="flex flex-col gap-[5px]">
                <span className={fieldLabelClassName}>Nomor WhatsApp</span>
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={phone}
                  placeholder="0812 3456 7890"
                  aria-invalid={Boolean(errors.customerPhone)}
                  onChange={(event) => setPhone(event.target.value)}
                  className={inputClassName}
                />
                <FieldError message={errors.customerPhone} />
              </label>
            </div>
            <p id="fulfillment-label" className={fieldLabelClassName}>
              Metode pemenuhan
            </p>
            <div
              role="group"
              aria-labelledby="fulfillment-label"
              className="flex min-h-10 flex-wrap items-center gap-x-[22px] gap-y-1 rounded-lg border border-ube-gold bg-vanilla px-3 py-2.5 text-xs font-bold text-ink focus-within:border-ube-pop"
            >
              <OverlaySelect
                label="Metode pemenuhan"
                value={fulfillment}
                options={fulfillmentOptions}
                onChange={(value) => {
                  setFulfillment(value as FulfillmentMethod);
                  setScheduleId("");
                }}
              >
                {fulfillmentOptions.find(({ value }) => value === fulfillment)?.label}
              </OverlaySelect>
              <span aria-hidden>·</span>
              <OverlaySelect
                label="Jadwal"
                value={scheduleId}
                options={scheduleOptions}
                placeholder={scheduleOptions.length > 0 ? "Pilih jadwal" : "Belum ada jadwal"}
                onChange={setScheduleId}
              >
                {`${scheduleLabel ?? "Pilih jadwal"}  ▾`}
              </OverlaySelect>
            </div>
            <FieldError message={errors.method ?? errors.scheduleId} />
            {fulfillment === "pickup" && form.batch?.pickupLocation && (
              <p className="text-[10px] text-plum">Lokasi pickup: {form.batch.pickupLocation}</p>
            )}
            {fulfillment === "delivery" && (
              <label className="flex flex-col gap-[5px]">
                <span className={fieldLabelClassName}>Alamat pengiriman</span>
                <textarea
                  required
                  rows={2}
                  value={address}
                  placeholder="Jalan, nomor rumah, patokan"
                  aria-invalid={Boolean(errors.address)}
                  onChange={(event) => setAddress(event.target.value)}
                  className={`${inputClassName} h-auto resize-none py-2.5`}
                />
                <FieldError message={errors.address} />
              </label>
            )}
          </section>

          <section aria-labelledby="items-heading" className={`${cardClassName} gap-3`}>
            <SectionHeading id="items-heading">{"02  ·  Item pesanan"}</SectionHeading>
            <OverlaySelect
              label="Pilih produk & varian"
              value=""
              options={form.products.map(({ id, name: productName, price, remaining }) => ({
                value: id,
                label: `${productName} · ${formatRupiah(price)}${remaining === null ? "" : ` · sisa ${remaining}`}`,
              }))}
              placeholder={
                form.products.length > 0 ? "Pilih produk & varian" : "Belum ada produk di batch"
              }
              onChange={(id) => changeQuantity(id, 1)}
              selectRef={productSelectRef}
              className={`${inputClassName} flex items-center text-plum focus-within:border-ube-pop`}
            >
              {"Pilih produk & varian  ▾"}
            </OverlaySelect>
            {lines.length > 0 && (
              <ul aria-label="Item dipilih" className="flex flex-col">
                {lines.map(({ id, name: productName, quantity, total, remaining }) => (
                  <li
                    key={id}
                    className="flex h-[52px] items-center justify-between gap-3 text-[11px]"
                  >
                    <span className="min-w-0 flex-1 font-bold text-ink">{productName}</span>
                    <span className="flex items-center gap-2 text-plum">
                      <QuantityButton
                        label={`Kurangi ${productName}`}
                        onClick={() => changeQuantity(id, -1)}
                      >
                        <Minus aria-hidden className="size-3" />
                      </QuantityButton>
                      × {quantity}
                      <QuantityButton
                        label={`Tambah ${productName}`}
                        disabled={remaining !== null && quantity >= remaining}
                        onClick={() => changeQuantity(id, 1)}
                      >
                        <Plus aria-hidden className="size-3" />
                      </QuantityButton>
                    </span>
                    <span className="flex-1 text-right font-bold text-ink">
                      {formatRupiah(total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <FieldError message={errors.items} />
            <button
              type="button"
              onClick={() => productSelectRef.current?.focus()}
              className="w-fit text-[11px] font-bold whitespace-pre text-ube-pop transition-colors hover:text-deep-ube"
            >
              {"＋  Tambah item lain"}
            </button>
            <div className="flex items-center justify-between gap-4 rounded-[9px] bg-vanilla px-3.5 py-3">
              <div className="flex flex-col gap-0.5">
                <p className="text-xs font-bold text-ink">Total pesanan</p>
                {shippingFee > 0 && (
                  <p className="text-[10px] text-plum">
                    {formatRupiah(subtotal)} + ongkir {formatRupiah(shippingFee)}
                  </p>
                )}
              </div>
              <p className="text-[17px] font-extrabold text-deep-ube">{formatRupiah(orderTotal)}</p>
            </div>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-3.5">
          <section aria-labelledby="payment-heading" className={`${cardClassName} gap-3`}>
            <SectionHeading id="payment-heading">{"03  ·  Pembayaran"}</SectionHeading>
            <p className={fieldLabelClassName}>Metode pembayaran</p>
            <OverlaySelect
              label="Metode pembayaran"
              value={paymentMethod}
              options={manualPaymentMethods}
              onChange={setPaymentMethod}
              className={`${inputClassName} flex items-center focus-within:border-ube-pop`}
            >
              {`${paymentMethod}  ▾`}
            </OverlaySelect>
            <label htmlFor="amount-received" className={fieldLabelClassName}>
              Nominal diterima
            </label>
            <input
              id="amount-received"
              inputMode="numeric"
              value={amount === null ? "" : formatRupiah(amount)}
              placeholder="Kosongkan jika belum dibayar"
              aria-invalid={Boolean(errors.amountReceived)}
              onChange={(event) => setAmountInput(event.target.value.replace(/\D/g, ""))}
              className={`${inputClassName} font-bold`}
            />
            <FieldError message={errors.amountReceived} />
            <p id="proof-label" className={fieldLabelClassName}>
              Bukti transaksi
            </p>
            <label className="flex h-[164px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[10px] border border-ube-line bg-vanilla px-4 text-center transition-colors focus-within:border-ube-pop hover:border-ube-pop">
              <CloudUpload aria-hidden className="size-[26px] text-ube-pop" />
              <span className="text-xs font-bold break-all text-ink">
                {proof ? proof.name : "Unggah bukti pembayaran"}
              </span>
              <span className="text-[10px] text-plum">PNG, JPG atau PDF · maks. 10 MB</span>
              <input
                type="file"
                aria-labelledby="proof-label"
                accept="image/png,image/jpeg,application/pdf"
                onChange={(event) => setProof(event.target.files?.[0])}
                className="sr-only"
              />
            </label>
          </section>

          <div className="flex flex-col gap-[5px] rounded-[10px] bg-vanilla p-3.5">
            <p className="text-xs font-extrabold text-deep-ube">{paymentNote.title}</p>
            <p className="text-[10px] text-plum">{paymentNote.body}</p>
          </div>

          {errors.form && (
            <p role="alert" className={fieldErrorClassName}>
              {errors.form}
            </p>
          )}
          <button
            type="submit"
            disabled={!canOrder || submitting}
            className="h-12 rounded-[10px] bg-deep-ube text-[13px] font-extrabold whitespace-pre text-white transition-colors hover:bg-ube-pop disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Menyimpan…" : "Simpan & kirim pesanan  →"}
          </button>
          <p className="text-[10px] text-plum">Pastikan data pelanggan dan nominal sesuai bukti.</p>
        </div>
      </form>
    </AdminPage>
  );
}

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-[15px]/[1.3] font-extrabold whitespace-pre text-ink">
      {children}
    </h2>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className={fieldErrorClassName}>{message}</span>;
}

function QuantityButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-6 items-center justify-center rounded-full border border-ube-line text-deep-ube transition-colors hover:bg-vanilla disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Native select hidden over custom text, so the trigger reads exactly like the design. */
function OverlaySelect({
  label,
  value,
  options,
  placeholder,
  onChange,
  selectRef,
  className = "",
  children,
}: {
  label: string;
  value: string;
  options: readonly (string | { value: string; label: string })[];
  placeholder?: string;
  onChange: (value: string) => void;
  selectRef?: Ref<HTMLSelectElement>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`relative whitespace-pre ${className}`}>
      {children}
      <select
        ref={selectRef}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 w-full cursor-pointer opacity-0"
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) =>
          typeof option === "string" ? (
            <option key={option}>{option}</option>
          ) : (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ),
        )}
      </select>
    </span>
  );
}
