import { createFileRoute } from "@tanstack/react-router";
import { CloudUpload } from "lucide-react";
import { type ReactNode, type Ref, useRef, useState } from "react";

import { AdminPage } from "@/components/admin/admin-page";

export const Route = createFileRoute("/_auth/dashboard/pesanan/baru")({
  head: () => ({
    meta: [{ title: "Buat pesanan baru · ubeloom" }],
  }),
  component: ManualOrderComponent,
});

// Sample data until products and batch schedules live in the database.
const products: { id: string; name: string; price: number }[] = [
  { id: "ube-pop-classic", name: "Ube Pop · Classic 250 g", price: 49_000 },
  { id: "ube-pop-ube", name: "Ube Pop · Ube edition 250 g", price: 52_000 },
  { id: "lumpia-ubi-goreng", name: "Lumpia Ubi Goreng", price: 28_000 },
  { id: "sparkling-starfruit", name: "Sparkling Starfruit", price: 16_000 },
];

const fulfillmentOptions = ["Pickup di toko", "Delivery"] as const;
const scheduleOptions = ["Sabtu 24 Okt · 10.00–15.00", "Minggu 25 Okt · 10.00–15.00"] as const;
const paymentMethods = ["Transfer bank · BCA", "Transfer bank · Mandiri", "QRIS", "Tunai"] as const;

const cardClassName = "flex flex-col rounded-xl border border-ube-line bg-white p-[18px]";
const fieldLabelClassName = "text-[10px] font-bold text-plum";
const inputClassName =
  "h-[42px] w-full rounded-lg border border-ube-line bg-surface px-[11px] text-xs text-ink outline-none transition-colors focus:border-ube-pop";

const formatRupiah = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;

function ManualOrderComponent() {
  const productSelectRef = useRef<HTMLSelectElement>(null);
  const [name, setName] = useState("Alya Rahmawati");
  const [phone, setPhone] = useState("08•• •••• 4821");
  const [fulfillment, setFulfillment] = useState<string>(fulfillmentOptions[0]);
  const [schedule, setSchedule] = useState("");
  const [items, setItems] = useState<{ id: string; quantity: number }[]>([
    { id: "ube-pop-classic", quantity: 2 },
    { id: "ube-pop-ube", quantity: 1 },
  ]);
  const [paymentMethod, setPaymentMethod] = useState<string>(paymentMethods[0]);
  const [proof, setProof] = useState<File>();

  const lines = items.flatMap(({ id, quantity }) => {
    const product = products.find((candidate) => candidate.id === id);
    return product ? [{ ...product, quantity, total: product.price * quantity }] : [];
  });
  const orderTotal = lines.reduce((sum, { total }) => sum + total, 0);
  const [amount, setAmount] = useState(formatRupiah(orderTotal));

  const addItem = (id: string) =>
    setItems((current) =>
      current.some((item) => item.id === id)
        ? current.map((item) => (item.id === id ? { ...item, quantity: item.quantity + 1 } : item))
        : [...current, { id, quantity: 1 }],
    );

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

      <form
        // Saving waits for the orders API; the browser still checks required fields.
        onSubmit={(event) => event.preventDefault()}
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
                  onChange={(event) => setName(event.target.value)}
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-[5px]">
                <span className={fieldLabelClassName}>Nomor WhatsApp</span>
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className={inputClassName}
                />
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
                onChange={setFulfillment}
              >
                {fulfillment}
              </OverlaySelect>
              <span aria-hidden>·</span>
              <OverlaySelect
                label="Jadwal"
                value={schedule}
                options={scheduleOptions}
                placeholder="Pilih jadwal"
                onChange={setSchedule}
              >
                {`${schedule || "Pilih jadwal"}  ▾`}
              </OverlaySelect>
            </div>
          </section>

          <section aria-labelledby="items-heading" className={`${cardClassName} gap-3`}>
            <SectionHeading id="items-heading">{"02  ·  Item pesanan"}</SectionHeading>
            <OverlaySelect
              label="Pilih produk & varian"
              value=""
              options={products.map(({ id, name: productName }) => ({
                value: id,
                label: productName,
              }))}
              placeholder="Pilih produk & varian"
              onChange={addItem}
              selectRef={productSelectRef}
              className={`${inputClassName} flex items-center text-plum focus-within:border-ube-pop`}
            >
              {"Pilih produk & varian  ▾"}
            </OverlaySelect>
            {lines.length > 0 && (
              <ul aria-label="Item dipilih" className="flex flex-col">
                {lines.map(({ id, name: productName, quantity, total }) => (
                  <li
                    key={id}
                    className="flex h-[52px] items-center justify-between gap-3 text-[11px]"
                  >
                    <span className="min-w-0 flex-1 font-bold text-ink">{productName}</span>
                    <span className="text-plum">× {quantity}</span>
                    <span className="flex-1 text-right font-bold text-ink">
                      {formatRupiah(total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => productSelectRef.current?.focus()}
              className="w-fit text-[11px] font-bold whitespace-pre text-ube-pop transition-colors hover:text-deep-ube"
            >
              {"＋  Tambah item lain"}
            </button>
            <div className="flex items-center justify-between gap-4 rounded-[9px] bg-vanilla px-3.5 py-3">
              <p className="text-xs font-bold text-ink">Total pesanan</p>
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
              options={paymentMethods}
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
              required
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={`${inputClassName} font-bold`}
            />
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
            <p className="text-xs font-extrabold text-deep-ube">Bukti akan ditinjau</p>
            <p className="text-[10px] text-plum">
              Pesanan tersimpan dengan status menunggu verifikasi setelah dikirim.
            </p>
          </div>

          <button
            type="submit"
            className="h-12 rounded-[10px] bg-deep-ube text-[13px] font-extrabold whitespace-pre text-white transition-colors hover:bg-ube-pop"
          >
            {"Simpan & kirim pesanan  →"}
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
