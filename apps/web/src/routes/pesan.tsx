import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { ChevronDown, Store, Truck, type LucideIcon } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { fieldErrors, serverErrorMessage } from "@/components/admin/orders/form-errors";
import { ItemSummaryRow, NumberedSteps, TotalRow } from "@/components/storefront/checkout-parts";
import PreorderInvitation from "@/components/storefront/preorder-invitation";
import StorefrontFooter from "@/components/storefront/storefront-footer";
import {
  type CheckoutData,
  MAX_NOTES_LENGTH,
  type PlaceOrderInput,
  getCheckout,
  placeOrder,
  placeOrderSchema,
} from "@/functions/checkout";
import { formatRupiah } from "@/lib/format";
import { type FulfillmentMethod, windowServesArea } from "@/lib/orders";
import { cn } from "@web-kwu/ui/lib/utils";

export const Route = createFileRoute("/pesan")({
  validateSearch: z.object({
    /** Product slug to preselect, from the product detail page. */
    produk: z.string().optional().catch(undefined),
    jumlah: z.number().int().min(1).max(99).optional().catch(undefined),
  }),
  head: () => ({
    meta: [
      { title: "Pesan · ubeloom" },
      {
        name: "description",
        content: "Pilih produk, pengiriman atau ambil sendiri, lalu buat invoice.",
      },
    ],
  }),
  loader: () => getCheckout(),
  component: CheckoutComponent,
});

const afterSubmitSteps = [
  "Terima invoice dan tautan status pribadi.",
  "Bayar sesuai nominal melalui QRIS.",
  "Unggah bukti; tim kami memverifikasi pembayaran.",
];

const inputClassName =
  "h-12 w-full rounded-[10px] border border-ube-line bg-surface px-4 text-sm text-ink placeholder:text-plum focus:border-deep-ube focus:outline-none aria-invalid:border-blush-pink";
const compactInputClassName =
  "h-[43px] w-full rounded-[8px] border border-ube-line bg-white px-[13px] text-xs text-ink placeholder:text-plum focus:border-deep-ube focus:outline-none aria-invalid:border-blush-pink";

function CheckoutComponent() {
  const checkout = Route.useLoaderData();

  return (
    <div className="flex min-h-svh flex-col bg-vanilla font-body text-ink">
      <header className="border-b border-ube-line">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5 lg:h-[72px] lg:px-16">
          <Link to="/" aria-label="ubeloom beranda">
            <img
              src="/images/ubeloom-logo.webp"
              alt="ubeloom"
              width={54}
              height={54}
              className="size-12 lg:size-[54px]"
            />
          </Link>
          <Link
            to="/menu"
            className="text-[13px] font-bold text-deep-ube transition-colors hover:text-ube-pop"
          >
            ← Kembali ke katalog
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {checkout ? (
          <CheckoutForm checkout={checkout} />
        ) : (
          <div className="mx-auto max-w-[1280px] px-5 py-16 lg:px-16">
            <PreorderInvitation
              title="Preorder sedang ditutup."
              description="Batch berikutnya segera dibuka. Lihat menu untuk jadwal terbaru."
              href="/menu"
            />
          </div>
        )}
      </main>
      <StorefrontFooter />
    </div>
  );
}

function CheckoutForm({ checkout }: { checkout: CheckoutData }) {
  const router = useRouter();
  const search = Route.useSearch();
  const confirmRef = useRef<HTMLDialogElement>(null);

  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const preselected = checkout.products.find(({ slug }) => slug === search.produk);
    return preselected ? { [preselected.id]: search.jumlah ?? 1 } : {};
  });
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [method, setMethod] = useState<FulfillmentMethod>(
    checkout.deliveryAreas.length ? "delivery" : "pickup",
  );
  const [areaName, setAreaName] = useState(checkout.deliveryAreas[0]?.name ?? "");
  const windowsFor = (name: string) =>
    checkout.deliveryWindows.filter(({ areas }) => windowServesArea(areas, name));
  const [zoneId, setZoneId] = useState(
    () => windowsFor(checkout.deliveryAreas[0]?.name ?? "")[0]?.id ?? "",
  );
  const [slotId, setSlotId] = useState(
    checkout.pickupSlots.find(({ remaining }) => remaining > 0)?.id ?? "",
  );
  const [courierName, setCourierName] = useState(checkout.couriers[0]?.name ?? "");
  const [address, setAddress] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [drawOptIn, setDrawOptIn] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const area = checkout.deliveryAreas.find(({ name }) => name === areaName);
  const areaWindows = windowsFor(areaName);
  const zone = areaWindows.find(({ id }) => id === zoneId);
  const slot = checkout.pickupSlots.find(({ id }) => id === slotId);
  const courier = checkout.couriers.find(({ name }) => name === courierName);
  const shippingFee = method === "delivery" ? (area?.fee ?? 0) + (courier?.fee ?? 0) : 0;
  const lines = checkout.products.flatMap((product) => {
    const quantity = quantities[product.id] ?? 0;
    return quantity > 0 ? [{ ...product, quantity }] : [];
  });
  const subtotal = lines.reduce((sum, { price, quantity }) => sum + price * quantity, 0);
  const minFee = Math.min(...checkout.deliveryAreas.map(({ fee }) => fee));

  const changeQuantity = (productId: string, delta: number, max: number) =>
    setQuantities((current) => ({
      ...current,
      [productId]: Math.min(max, Math.max(0, (current[productId] ?? 0) + delta)),
    }));

  const input = (): PlaceOrderInput => ({
    batchId: checkout.batch.id,
    customerName,
    customerPhone,
    method,
    scheduleId: method === "delivery" ? zoneId : slotId,
    deliveryArea: method === "delivery" ? areaName : undefined,
    address: method === "delivery" ? address : undefined,
    recipientName: method === "delivery" ? recipientName : undefined,
    recipientPhone: method === "delivery" ? recipientPhone : undefined,
    courier: method === "delivery" && courier ? courier.name : undefined,
    items: lines.map(({ id, quantity }) => ({ productId: id, quantity })),
    notes: notes || undefined,
    termsAccepted: termsAccepted as true,
    drawOptIn,
  });

  const review = (event: FormEvent) => {
    event.preventDefault();
    const parsed = placeOrderSchema.safeParse(input());
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      toast.error(Object.values(next)[0] ?? "Periksa kembali data pesanan.");
      return;
    }
    setErrors({});
    confirmRef.current?.showModal();
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const { token } = await placeOrder({ data: input() });
      confirmRef.current?.close();
      await router.navigate({ to: "/invoice/$token", params: { token } });
    } catch (error) {
      const message = serverErrorMessage(error);
      confirmRef.current?.close();
      setErrors({ form: message });
      toast.error(message);
      await router.invalidate();
    } finally {
      setSubmitting(false);
    }
  };

  const scheduleSummary =
    method === "delivery"
      ? {
          heading: `DIANTAR · AREA ${areaName.toUpperCase()}`,
          slot: zone?.label ?? "Pilih jendela pengiriman",
        }
      : {
          heading: `AMBIL SENDIRI · ${(slot?.location ?? checkout.batch.pickupLocation).toUpperCase()}`,
          slot: slot?.label ?? "Pilih slot ambil",
        };

  return (
    <>
      <div className="mx-auto flex max-w-[1280px] flex-col gap-2 px-5 pt-[25px] pb-5 lg:px-16">
        <p className="font-data text-[9px] font-bold tracking-[1.2px] text-ube-pop">
          PREORDER DIBUKA / LANGKAH 1 DARI 2
        </p>
        <h1 className="font-display text-[30px] font-bold text-ink lg:text-4xl">
          Pilih cara pesananmu sampai.
        </h1>
        <p className="text-xs text-plum">
          Pilih produk, tentukan pengiriman atau ambil sendiri, lalu periksa total sebelum membuat
          invoice.
        </p>
      </div>

      <form
        noValidate
        onSubmit={review}
        className="mx-auto flex max-w-[1280px] flex-col gap-7 px-5 pt-2.5 pb-11 lg:flex-row lg:items-start lg:px-16"
      >
        <div className="flex w-full flex-col gap-5 lg:w-[680px] lg:shrink-0">
          {/* 01 Pilih produk */}
          <section aria-labelledby="checkout-products" className="flex flex-col gap-2">
            <SectionHeading id="checkout-products" title="01  Pilih produk">
              Batch {checkout.batch.name} · tersedia
            </SectionHeading>
            <ul>
              {checkout.products.map((product) => {
                const quantity = quantities[product.id] ?? 0;
                const max = Math.min(99, product.remaining ?? 99);
                return (
                  <li
                    key={product.id}
                    className="flex items-center gap-3.5 border-b border-ube-line py-2"
                  >
                    <img
                      src={product.image}
                      alt=""
                      width={58}
                      height={58}
                      className="size-[58px] shrink-0 rounded-[12px] object-cover"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                      <p className="text-[15px] font-bold text-ink">{product.name}</p>
                      {product.variant && <p className="text-xs text-plum">{product.variant}</p>}
                      <p className="text-xs font-bold text-deep-ube">
                        {formatRupiah(product.price)} / {product.unit}
                        {product.remaining !== null && product.remaining <= 10 && (
                          <span className="font-semibold text-plum">
                            {" "}
                            · {product.remaining > 0 ? `sisa ${product.remaining}` : "habis"}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex h-[34px] shrink-0 items-center gap-[13px] rounded-[9px] border border-ube-line px-2.5">
                      <button
                        type="button"
                        aria-label={`Kurangi ${product.name}`}
                        disabled={quantity === 0}
                        onClick={() => changeQuantity(product.id, -1, max)}
                        className="text-[19px] font-bold text-deep-ube disabled:opacity-30"
                      >
                        −
                      </button>
                      <output
                        aria-live="polite"
                        aria-label={`Jumlah ${product.name}`}
                        className="w-4 text-center text-sm font-bold text-ink"
                      >
                        {quantity}
                      </output>
                      <button
                        type="button"
                        aria-label={`Tambah ${product.name}`}
                        disabled={quantity >= max}
                        onClick={() => changeQuantity(product.id, 1, max)}
                        className="text-lg font-bold text-deep-ube disabled:opacity-30"
                      >
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <FieldMessage error={errors.items}>
              Jumlah minimal 1 per varian; stok dan batas per pesanan dicek saat dikirim.
            </FieldMessage>
          </section>

          {/* 02 Data pemesan */}
          <section aria-labelledby="checkout-contact" className="flex flex-col gap-2">
            <SectionHeading id="checkout-contact" title="02  Data pemesan">
              * Wajib diisi
            </SectionHeading>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Field label="Nama lengkap *" error={errors.customerName} className="flex-1">
                {(props) => (
                  <input
                    {...props}
                    autoComplete="name"
                    placeholder="Nama sesuai pesanan"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    className={inputClassName}
                  />
                )}
              </Field>
              <Field label="Nomor WhatsApp *" error={errors.customerPhone} className="flex-1">
                {(props) => (
                  <input
                    {...props}
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="08xx atau +62xx"
                    value={customerPhone}
                    onChange={(event) => setCustomerPhone(event.target.value)}
                    className={inputClassName}
                  />
                )}
              </Field>
            </div>
            <p className="text-[11px] font-semibold text-plum">
              Gunakan nama dan WhatsApp aktif untuk menerima invoice serta pembaruan pesanan.
            </p>
          </section>

          {/* 03 Cara menerima pesanan */}
          <section aria-labelledby="checkout-method" className="flex flex-col gap-2">
            <h2 id="checkout-method" className="font-display text-xl font-bold text-ink">
              03 Cara menerima pesanan *
            </h2>
            <div
              role="radiogroup"
              aria-labelledby="checkout-method"
              className="flex flex-col gap-3 sm:flex-row"
            >
              <MethodOption
                icon={Truck}
                title="Diantar ke alamat"
                detail={
                  checkout.deliveryAreas.length
                    ? `Area terjangkau · ongkir ${method === "delivery" && area ? formatRupiah(area.fee) : `mulai ${formatRupiah(minFee)}`}`
                    : "Belum tersedia untuk batch ini"
                }
                selected={method === "delivery"}
                disabled={!checkout.deliveryAreas.length}
                onSelect={() => setMethod("delivery")}
              />
              <MethodOption
                icon={Store}
                title="Ambil sendiri"
                detail="Gratis · pilih slot dan lokasi"
                selected={method === "pickup"}
                disabled={!checkout.pickupSlots.length}
                onSelect={() => setMethod("pickup")}
              />
            </div>

            {method === "delivery" ? (
              <div className="flex flex-col gap-2 rounded-[12px] border border-ube-line bg-surface p-3">
                <p className="text-[15px] font-bold text-deep-ube">
                  Alamat &amp; penerima pengiriman
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <Field
                    label="Kecamatan / area tujuan *"
                    compact
                    error={errors.deliveryArea}
                    className="flex-1"
                  >
                    {(props) => (
                      <SelectBox
                        {...props}
                        value={areaName}
                        onChange={(name) => {
                          setAreaName(name);
                          // Keep the window when it also serves the new area.
                          const windows = windowsFor(name);
                          if (!windows.some(({ id }) => id === zoneId)) {
                            setZoneId(windows[0]?.id ?? "");
                          }
                        }}
                        options={checkout.deliveryAreas.map(({ name }) => ({
                          value: name,
                          label: name,
                        }))}
                      />
                    )}
                  </Field>
                  <div className="flex flex-col gap-1 rounded-[8px] bg-vanilla px-3 py-2.5 sm:w-[210px]">
                    <p className="text-[10px] font-bold text-ube-pop">
                      {courier ? "ONGKIR AREA + KURIR" : "ONGKIR AREA"}
                    </p>
                    <p className="text-[15px] font-bold text-deep-ube">
                      {formatRupiah(shippingFee)}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-plum">
                  Cakupan: {checkout.deliveryAreas.map(({ name }) => name).join(", ")}. Di luar
                  area? Pilih ambil sendiri; ongkir diperbarui sesuai area.
                </p>
                <Field label="Alamat lengkap *" compact error={errors.address}>
                  {(props) => (
                    <textarea
                      {...props}
                      rows={2}
                      autoComplete="street-address"
                      maxLength={300}
                      placeholder="Nama jalan, nomor, RT/RW, kelurahan, patokan..."
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                      className={cn(compactInputClassName, "h-auto min-h-[55px] resize-y py-3")}
                    />
                  )}
                </Field>
                <Field label="Nama penerima *" compact error={errors.recipientName}>
                  {(props) => (
                    <input
                      {...props}
                      placeholder="Nama yang menerima paket"
                      value={recipientName}
                      onChange={(event) => setRecipientName(event.target.value)}
                      className={compactInputClassName}
                    />
                  )}
                </Field>
                <Field label="WhatsApp penerima *" compact error={errors.recipientPhone}>
                  {(props) => (
                    <input
                      {...props}
                      type="tel"
                      inputMode="tel"
                      placeholder="08xx atau +62xx"
                      value={recipientPhone}
                      onChange={(event) => setRecipientPhone(event.target.value)}
                      className={compactInputClassName}
                    />
                  )}
                </Field>
                <Field label="Jendela pengiriman *" compact error={errors.scheduleId}>
                  {(props) => (
                    <SelectBox
                      {...props}
                      value={zoneId}
                      onChange={setZoneId}
                      options={areaWindows.map(({ id, label }) => ({
                        value: id,
                        label,
                      }))}
                    />
                  )}
                </Field>
                {checkout.couriers.length > 0 && (
                  <Field label="Kurir *" compact error={errors.courier}>
                    {(props) => (
                      <SelectBox
                        {...props}
                        value={courierName}
                        onChange={setCourierName}
                        options={checkout.couriers.map(({ name, fee }) => ({
                          value: name,
                          label: fee > 0 ? `${name} · +${formatRupiah(fee)}` : name,
                        }))}
                      />
                    )}
                  </Field>
                )}
                <p className="text-[11px] text-plum">
                  Waktu tiba perkiraan; kurir akan menghubungi penerima sebelum tiba.
                </p>
              </div>
            ) : (
              <Field label="Slot & lokasi ambil" error={errors.scheduleId}>
                {(props) => (
                  <SelectBox
                    {...props}
                    value={slotId}
                    onChange={setSlotId}
                    tall
                    options={checkout.pickupSlots.map(({ id, label, location, remaining }) => ({
                      value: id,
                      label: `Ambil sendiri: ${label} / ${location}${remaining > 0 ? "" : " · penuh"}`,
                      disabled: remaining === 0,
                    }))}
                  />
                )}
              </Field>
            )}
            <p className="text-[11px] text-plum">
              Bila ambil sendiri dipilih, tentukan slot dan lokasi di atas; ongkir menjadi Rp 0.
            </p>
          </section>

          <Field label="Catatan pesanan (opsional)" error={errors.notes}>
            {(props) => (
              <textarea
                {...props}
                rows={2}
                maxLength={MAX_NOTES_LENGTH}
                placeholder={`Contoh: patokan rumah, instruksi kurir, atau permintaan khusus (maks. ${MAX_NOTES_LENGTH} karakter)`}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="min-h-[50px] w-full resize-y rounded-[10px] border border-ube-line bg-surface p-2.5 text-[13px] text-ink placeholder:text-plum focus:border-deep-ube focus:outline-none"
              />
            )}
          </Field>

          <div className="flex flex-col gap-2 border-t border-ube-line pt-[13px]">
            <Checkbox
              checked={termsAccepted}
              onChange={setTermsAccepted}
              invalid={!!errors.termsAccepted}
            >
              Saya menyetujui batas pembayaran, pengiriman/ambil sendiri, dan aturan pembatalan.
            </Checkbox>
            <Checkbox checked={drawOptIn} onChange={setDrawOptIn}>
              Saya ingin ikut undian berhadiah (opsional; tidak memengaruhi pesanan).
            </Checkbox>
            <p className="text-xs font-bold text-deep-ube">
              <Link to="/cara-pesan" className="hover:text-ube-pop">
                Syarat preorder
              </Link>
              {" · "}
              <Link to="/cara-pesan" className="hover:text-ube-pop">
                Kebijakan privasi
              </Link>
              {" · "}
              <Link to="/cara-pesan" className="hover:text-ube-pop">
                Aturan undian
              </Link>
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 pt-[5px]">
            {errors.form && (
              <p role="alert" className="text-xs font-semibold text-ube-pop">
                {errors.form}
              </p>
            )}
            <p className="text-[11px] text-plum">
              Periksa detail dan total di langkah berikutnya sebelum invoice dibuat.
            </p>
            <button
              type="submit"
              className="rounded-full bg-deep-ube px-[22px] py-[13px] text-[15px] font-bold text-vanilla transition-colors hover:bg-ube-pop"
            >
              Lanjut konfirmasi →
            </button>
          </div>
        </div>

        <aside className="flex flex-1 flex-col gap-4 lg:sticky lg:top-6">
          <section
            aria-label="Ringkasan pesanan"
            className="flex flex-col gap-[11px] rounded-[16px] border border-ube-line bg-vanilla p-4"
          >
            <p className="font-data text-[11px] font-bold text-ube-pop">RINGKASAN PESANAN</p>
            <h2 className="font-display text-2xl font-bold text-ink">Hampir siap dinikmati!</h2>
            <p className="text-xs text-plum">
              Batch {checkout.batch.name} · Preorder tutup {checkout.batch.closesAt}
            </p>
            <hr className="border-ube-line" />
            {lines.length ? (
              lines.map(({ id, name, quantity, price }) => (
                <ItemSummaryRow key={id} name={name} quantity={quantity} unitPrice={price} />
              ))
            ) : (
              <p className="text-xs text-plum">Belum ada produk dipilih.</p>
            )}
            <AmountRow label="Subtotal produk" amount={subtotal} />
            <AmountRow
              label={
                method === "delivery"
                  ? `Ongkir · ${[areaName, courier?.name].filter(Boolean).join(" · ")}`
                  : "Ongkir · ambil sendiri"
              }
              amount={shippingFee}
            />
            <hr className="border-ube-line" />
            <TotalRow label="Total pembayaran" amount={subtotal + shippingFee} />
            <div className="flex flex-col gap-[5px] rounded-[8px] bg-white px-3 py-2.5">
              <p className="font-data text-[10px] font-bold text-ube-pop">
                {scheduleSummary.heading}
              </p>
              <p className="text-xs font-bold text-ink">{scheduleSummary.slot}</p>
            </div>
            <div className="flex flex-col gap-[5px] rounded-[9px] bg-[#FFF1D7] p-3.5">
              <p className="font-data text-[10px] font-bold text-deep-ube">BATAS PEMBAYARAN</p>
              <p className="text-sm font-bold text-ink">{checkout.batch.paymentDeadline}</p>
              <p className="text-[11px] text-plum">
                Dalam 24 jam setelah invoice, paling lambat waktu di atas.
              </p>
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-[12px] border border-ube-line bg-surface p-3.5">
            <h2 className="font-display text-[17px] font-bold text-ink">
              Setelah konfirmasi pesanan
            </h2>
            <NumberedSteps steps={afterSubmitSteps} className="gap-3" />
          </section>
        </aside>
      </form>

      <dialog
        ref={confirmRef}
        aria-labelledby="confirm-title"
        className="m-auto w-[min(440px,calc(100vw-32px))] rounded-[16px] border border-ube-line bg-vanilla p-5 font-body text-ink backdrop:bg-ink/40"
      >
        <p className="font-data text-[9px] font-bold tracking-[1.2px] text-ube-pop">
          LANGKAH 2 DARI 2
        </p>
        <h2 id="confirm-title" className="mt-1 font-display text-2xl font-bold">
          Konfirmasi pesanan
        </h2>
        <div className="mt-4 flex flex-col gap-[11px]">
          {lines.map(({ id, name, quantity, price }) => (
            <ItemSummaryRow key={id} name={name} quantity={quantity} unitPrice={price} />
          ))}
          <AmountRow label="Ongkir" amount={shippingFee} />
          <hr className="border-ube-line" />
          <TotalRow label="Total pembayaran" amount={subtotal + shippingFee} />
          <div className="flex flex-col gap-[5px] rounded-[8px] bg-white px-3 py-2.5">
            <p className="font-data text-[10px] font-bold text-ube-pop">
              {scheduleSummary.heading}
            </p>
            <p className="text-xs font-bold text-ink">{scheduleSummary.slot}</p>
            <p className="text-xs text-plum">
              {customerName} · {customerPhone}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => confirmRef.current?.close()}
            className="rounded-full border-[1.5px] border-deep-ube bg-surface px-5 py-3 text-sm font-bold text-deep-ube"
          >
            Ubah
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="rounded-full bg-deep-ube px-5 py-3 text-sm font-bold text-vanilla transition-colors hover:bg-ube-pop disabled:opacity-60"
          >
            {submitting ? "Membuat invoice…" : "Buat invoice →"}
          </button>
        </div>
      </dialog>
    </>
  );
}

function SectionHeading({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-1">
      <h2 id={id} className="font-display text-xl font-bold whitespace-pre text-ink">
        {title}
      </h2>
      <p className="text-xs text-plum">{children}</p>
    </div>
  );
}

function FieldMessage({ error, children }: { error?: string; children: ReactNode }) {
  return error ? (
    <p role="alert" className="text-[11px] font-semibold text-ube-pop">
      {error}
    </p>
  ) : (
    <p className="text-[11px] text-plum">{children}</p>
  );
}

function Field({
  label,
  error,
  compact,
  className,
  children,
}: {
  label: string;
  error?: string;
  compact?: boolean;
  className?: string;
  children: (props: {
    id: string;
    "aria-invalid"?: true;
    "aria-describedby"?: string;
  }) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2", className)}>
      <label htmlFor={id} className={cn("font-bold text-ink", compact ? "text-xs" : "text-[13px]")}>
        {label}
      </label>
      {children({
        id,
        ...(error && { "aria-invalid": true, "aria-describedby": `${id}-error` }),
      })}
      {error && (
        <p id={`${id}-error`} className="text-[11px] font-semibold text-ube-pop">
          {error}
        </p>
      )}
    </div>
  );
}

function SelectBox({
  value,
  onChange,
  options,
  tall,
  ...props
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  tall?: boolean;
}) {
  return (
    <div className="relative">
      <select
        {...props}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "w-full appearance-none border border-ube-line pr-9 text-ink focus:border-deep-ube focus:outline-none aria-invalid:border-blush-pink",
          tall
            ? "h-[50px] rounded-[10px] bg-surface px-2.5 text-xs font-semibold"
            : "h-[43px] rounded-[8px] bg-white px-[13px] text-xs",
        )}
      >
        {options.length === 0 && <option value="">Belum ada jadwal</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-deep-ube"
      />
    </div>
  );
}

function MethodOption({
  icon: Icon,
  title,
  detail,
  selected,
  disabled,
  onSelect,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex h-[72px] flex-1 items-center gap-[11px] rounded-[11px] p-3 text-left transition-colors disabled:opacity-50",
        selected ? "border-2 border-deep-ube bg-vanilla" : "border border-ube-line bg-surface",
      )}
    >
      <Icon
        aria-hidden
        className={cn("size-[21px] shrink-0", selected ? "text-deep-ube" : "text-plum")}
      />
      <span className="flex flex-1 flex-col gap-1">
        <span className="text-sm font-bold text-ink">{title}</span>
        <span className="text-[11px] text-plum">{detail}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "size-[17px] shrink-0 rounded-full border-2",
          selected
            ? "border-deep-ube bg-deep-ube shadow-[inset_0_0_0_2px_var(--color-vanilla)]"
            : "border-ube-line bg-surface",
        )}
      />
    </button>
  );
}

function Checkbox({
  checked,
  onChange,
  invalid,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  invalid?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-[11px] text-xs text-ink">
      <input
        type="checkbox"
        checked={checked}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.checked)}
        className="size-[19px] shrink-0 cursor-pointer appearance-none rounded-[4px] border-[1.5px] border-deep-ube bg-surface bg-center bg-no-repeat checked:bg-deep-ube checked:bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2016%2016%22%20fill=%22none%22%20stroke=%22%23fff9ed%22%20stroke-width=%222.5%22%3E%3Cpath%20d=%22M3.5%208.5l3%203%206-7%22/%3E%3C/svg%3E')] aria-invalid:border-blush-pink"
      />
      <span>{children}</span>
    </label>
  );
}

function AmountRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-xs text-plum">{label}</p>
      <p className="text-[13px] font-bold text-ink">{formatRupiah(amount)}</p>
    </div>
  );
}
