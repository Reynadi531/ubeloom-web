import { createFileRoute } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { AdminPage, PageHeading } from "@/components/admin/admin-page";
import { StatusBadge, type StatusTone } from "@/components/admin/status-badge";
import {
  type SaveVoucherInput,
  type VoucherRow,
  type VouchersPage,
  deleteVoucher,
  getVouchers,
  saveVoucher,
  saveVoucherSchema,
  setVoucherActive,
} from "@/functions/vouchers";
import { formatDateTime, formatRupiah } from "@/lib/format";
import { type VoucherDiscountType, type VoucherScope, discountLabel } from "@/lib/vouchers";

import {
  AdminDialog,
  Field,
  OptionSelect,
  firstIssue,
  fromWib,
  inputClassName,
  parseOptionalInt,
  primaryButtonClassName,
  secondaryButtonClassName,
  toDateTimeInputValue,
  useMutationRunner,
} from "./batch-produk/-components/fields";

export const Route = createFileRoute("/_auth/dashboard/voucher")({
  head: () => ({
    meta: [{ title: "Voucher · ubeloom" }],
  }),
  loader: () => getVouchers(),
  component: VouchersComponent,
});

type Product = VouchersPage["products"][number];

const cardClassName = "rounded-[13px] border border-ube-line bg-surface";

const scopeOptions: { value: VoucherScope; label: string }[] = [
  { value: "order", label: "Semua produk · satu diskon" },
  { value: "products", label: "Per produk · diskon masing-masing" },
];

const discountTypeOptions: { value: VoucherDiscountType; label: string }[] = [
  { value: "percentage", label: "Persen (%)" },
  { value: "fixed", label: "Potongan (Rp)" },
];

function VouchersComponent() {
  const { vouchers, products } = Route.useLoaderData();
  // `undefined` = closed, `null` = creating, a row = editing.
  const [editing, setEditing] = useState<VoucherRow | null | undefined>(undefined);
  const active = vouchers.filter((row) => voucherState(row).key === "active").length;

  return (
    <AdminPage>
      <PageHeading
        eyebrow="UBELOOM  /  ADMIN  /  VOUCHER"
        title="Voucher"
        description="Kode promo yang dimasukkan pelanggan saat checkout. Diskon hanya memotong harga produk, bukan ongkir."
        actions={
          <button type="button" onClick={() => setEditing(null)} className={primaryButtonClassName}>
            <Plus className="size-4" />
            Buat voucher
          </button>
        }
      />

      <p className="text-[11px] text-plum">
        {vouchers.length} voucher · {active} sedang berlaku. Kuota dihitung dari pesanan yang tidak
        dibatalkan; membatalkan pesanan mengembalikan kuotanya.
      </p>

      {vouchers.length === 0 ? (
        <section className={`${cardClassName} flex flex-col items-start gap-2 p-5`}>
          <h2 className="text-[15px] font-extrabold text-ink">Belum ada voucher</h2>
          <p className="text-[11px] text-plum">
            Buat potongan persen atau rupiah untuk semua produk, atau atur diskon berbeda untuk tiap
            produk.
          </p>
        </section>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {vouchers.map((row) => (
            <VoucherCard key={row.id} voucher={row} onEdit={() => setEditing(row)} />
          ))}
        </ul>
      )}

      <AdminDialog
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={editing ? `Ubah voucher ${editing.code}` : "Buat voucher"}
        description="Waktu dalam WIB. Perubahan berlaku untuk checkout berikutnya; pesanan lama tidak berubah."
        className="w-[min(640px,calc(100vw-32px))]"
      >
        <VoucherForm
          key={editing?.id ?? "new"}
          voucher={editing ?? null}
          products={products}
          onDone={() => setEditing(undefined)}
        />
      </AdminDialog>
    </AdminPage>
  );
}

function voucherState(row: VoucherRow): { key: string; label: string; tone: StatusTone } {
  const now = Date.now();
  if (!row.active) return { key: "off", label: "Nonaktif", tone: "muted" };
  if (row.endsAt && new Date(row.endsAt).getTime() < now) {
    return { key: "ended", label: "Berakhir", tone: "muted" };
  }
  if (row.quota !== null && row.used >= row.quota) {
    return { key: "full", label: "Kuota habis", tone: "neutral" };
  }
  if (row.startsAt && new Date(row.startsAt).getTime() > now) {
    return { key: "scheduled", label: "Terjadwal", tone: "review" };
  }
  return { key: "active", label: "Berlaku", tone: "ready" };
}

function VoucherCard({ voucher, onEdit }: { voucher: VoucherRow; onEdit: () => void }) {
  const run = useMutationRunner();
  const [pending, setPending] = useState(false);
  const state = voucherState(voucher);

  const mutate = async (mutation: () => Promise<unknown>, success: string) => {
    setPending(true);
    await run(mutation, success);
    setPending(false);
  };

  const remove = () => {
    if (!window.confirm(`Hapus voucher ${voucher.code}? Tindakan ini tidak bisa dibatalkan.`)) {
      return;
    }
    void mutate(() => deleteVoucher({ data: { id: voucher.id } }), "Voucher dihapus");
  };

  const period =
    voucher.startsAt || voucher.endsAt
      ? `${voucher.startsAt ? formatDateTime(voucher.startsAt) : "Sekarang"} – ${voucher.endsAt ? formatDateTime(voucher.endsAt) : "tanpa batas"}`
      : "Tanpa batas waktu";
  const usage = voucher.quota === null ? null : Math.min(1, voucher.used / voucher.quota);

  return (
    <li className={`${cardClassName} flex flex-col gap-3 p-[18px]`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-data text-[15px] font-bold break-all text-deep-ube">{voucher.code}</p>
          {voucher.description && <p className="text-[11px] text-plum">{voucher.description}</p>}
        </div>
        <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
      </div>

      <div className="rounded-lg bg-vanilla px-3 py-[11px]">
        {voucher.scope === "order" && voucher.discountType && voucher.value ? (
          <p className="text-[11px] font-bold text-ink">
            Diskon {discountLabel(voucher.discountType, voucher.value)} semua produk
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {voucher.items.map((item) => (
              <li key={item.productId} className="flex justify-between gap-3 text-[11px]">
                <span className="truncate text-ink">{item.productName}</span>
                <span className="shrink-0 font-bold text-deep-ube">
                  −{discountLabel(item.discountType, item.value, true)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-[10px] text-plum">
          {[
            voucher.minSubtotal > 0 && `Min. belanja ${formatRupiah(voucher.minSubtotal)}`,
            voucher.maxDiscount !== null && `Maks. diskon ${formatRupiah(voucher.maxDiscount)}`,
          ]
            .filter(Boolean)
            .join(" · ") || "Tanpa minimal belanja"}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between gap-3 text-[10px] font-bold">
          <span className="text-plum">KUOTA TERPAKAI</span>
          <span className="text-deep-ube">
            {voucher.used} / {voucher.quota ?? "∞"}
          </span>
        </div>
        {usage !== null && (
          <div
            role="progressbar"
            aria-label={`Kuota ${voucher.code}`}
            aria-valuemin={0}
            aria-valuemax={voucher.quota ?? 0}
            aria-valuenow={voucher.used}
            className="h-1.5 overflow-hidden rounded-full bg-vanilla"
          >
            <div className="h-full bg-ube-pop" style={{ width: `${usage * 100}%` }} />
          </div>
        )}
        <p className="text-[10px] text-plum">{period}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onEdit}
          className={secondaryButtonClassName}
        >
          Ubah
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            mutate(
              () => setVoucherActive({ data: { id: voucher.id, active: !voucher.active } }),
              voucher.active ? "Voucher dinonaktifkan" : "Voucher diaktifkan",
            )
          }
          className={secondaryButtonClassName}
        >
          {voucher.active ? "Nonaktifkan" : "Aktifkan"}
        </button>
        {voucher.used === 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="text-[11px] font-bold text-plum transition-colors hover:text-[#b42318] disabled:opacity-50"
          >
            Hapus
          </button>
        )}
      </div>
    </li>
  );
}

type ItemDraft = { productId: string; discountType: VoucherDiscountType; value: string };

const parseNumber = (value: string) => parseOptionalInt(value) ?? Number.NaN;

function VoucherForm({
  voucher,
  products,
  onDone,
}: {
  voucher: VoucherRow | null;
  products: Product[];
  onDone: () => void;
}) {
  const run = useMutationRunner();
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    code: voucher?.code ?? "",
    description: voucher?.description ?? "",
    scope: (voucher?.scope ?? "order") as VoucherScope,
    discountType: (voucher?.discountType ?? "percentage") as VoucherDiscountType,
    value: voucher?.value ? String(voucher.value) : "",
    maxDiscount: voucher?.maxDiscount != null ? String(voucher.maxDiscount) : "",
    minSubtotal: voucher?.minSubtotal ? String(voucher.minSubtotal) : "",
    quota: voucher?.quota != null ? String(voucher.quota) : "",
    startsAt: voucher?.startsAt ? toDateTimeInputValue(voucher.startsAt) : "",
    endsAt: voucher?.endsAt ? toDateTimeInputValue(voucher.endsAt) : "",
    active: voucher?.active ?? true,
  });
  const [items, setItems] = useState<ItemDraft[]>(
    () =>
      voucher?.items.map(({ productId, discountType, value }) => ({
        productId,
        discountType,
        value: String(value),
      })) ?? [],
  );
  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const editItem = (index: number, patch: Partial<ItemDraft>) =>
    setItems((current) =>
      current.map((item, position) => (position === index ? { ...item, ...patch } : item)),
    );

  const unused = products.filter(({ id }) => !items.some((item) => item.productId === id));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const input: SaveVoucherInput = {
      id: voucher?.id,
      code: form.code,
      description: form.description,
      scope: form.scope,
      discountType: form.discountType,
      // Only the chosen scope's fields are sent; the other side would fail as empty.
      value: form.scope === "order" ? parseNumber(form.value) : 0,
      items:
        form.scope === "products"
          ? items.map((item) => ({
              productId: item.productId,
              discountType: item.discountType,
              value: parseNumber(item.value),
            }))
          : [],
      maxDiscount: parseOptionalInt(form.maxDiscount),
      minSubtotal: parseOptionalInt(form.minSubtotal) ?? 0,
      quota: parseOptionalInt(form.quota),
      startsAt: form.startsAt ? fromWib(form.startsAt) : null,
      endsAt: form.endsAt ? fromWib(form.endsAt) : null,
      active: form.active,
    };
    const parsed = saveVoucherSchema.safeParse(input);
    if (!parsed.success) return void toast.error(firstIssue(parsed.error));
    setPending(true);
    const ok = await run(
      () => saveVoucher({ data: input }),
      voucher ? "Voucher disimpan" : "Voucher dibuat",
    );
    setPending(false);
    if (ok) onDone();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Kode voucher" hint="Huruf, angka, - atau _. Tidak peka huruf besar/kecil.">
          <input
            value={form.code}
            maxLength={32}
            autoCapitalize="characters"
            placeholder="Contoh: UBELOOM10"
            onChange={(event) => update("code", event.target.value.toUpperCase())}
            className={`${inputClassName} font-data uppercase`}
          />
        </Field>
        <Field label="Deskripsi untuk pelanggan" hint="Tampil saat kode dipakai di checkout.">
          <input
            value={form.description}
            maxLength={120}
            placeholder="Contoh: Diskon 10% semua menu"
            onChange={(event) => update("description", event.target.value)}
            className={inputClassName}
          />
        </Field>
      </div>

      <Field label="Cakupan diskon">
        <OptionSelect
          ariaLabel="Cakupan diskon"
          options={scopeOptions}
          value={form.scope}
          onChange={(value) => update("scope", value)}
        />
      </Field>

      {form.scope === "order" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Jenis diskon">
            <OptionSelect
              ariaLabel="Jenis diskon"
              options={discountTypeOptions}
              value={form.discountType}
              onChange={(value) => update("discountType", value)}
            />
          </Field>
          <Field
            label={form.discountType === "percentage" ? "Diskon (%)" : "Potongan (Rp)"}
            hint={
              form.discountType === "percentage"
                ? "Dari subtotal produk."
                : "Sekali per pesanan, dari subtotal produk."
            }
          >
            <input
              inputMode="numeric"
              value={form.value}
              placeholder={form.discountType === "percentage" ? "10" : "15000"}
              onChange={(event) => update("value", event.target.value.replace(/\D/g, ""))}
              className={inputClassName}
            />
          </Field>
        </div>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[11px] font-bold text-ink">Diskon per produk</legend>
          <span className="text-[10px] text-plum">
            Persen memotong total baris produk; potongan rupiah berlaku untuk setiap item (tidak
            melebihi harga item).
          </span>
          {items.map((item, index) => {
            const options = products
              .filter(
                ({ id }) => id === item.productId || !items.some((other) => other.productId === id),
              )
              .map(({ id, name }) => ({ value: id, label: name }));
            const name =
              products.find(({ id }) => id === item.productId)?.name ?? "Produk terhapus";
            return (
              <div key={index} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <div className="w-full sm:flex-1">
                  {options.some(({ value }) => value === item.productId) ? (
                    <OptionSelect
                      ariaLabel={`Produk promo ${index + 1}`}
                      options={options}
                      value={item.productId}
                      onChange={(value) => editItem(index, { productId: value })}
                    />
                  ) : (
                    <span className={`${inputClassName} flex items-center text-plum`}>{name}</span>
                  )}
                </div>
                <div className="w-[130px] shrink-0">
                  <OptionSelect
                    ariaLabel={`Jenis diskon produk ${index + 1}`}
                    options={discountTypeOptions}
                    value={item.discountType}
                    onChange={(value) => editItem(index, { discountType: value })}
                  />
                </div>
                <input
                  aria-label={`Nilai diskon produk ${index + 1}`}
                  inputMode="numeric"
                  value={item.value}
                  placeholder={item.discountType === "percentage" ? "%" : "Rp / item"}
                  onChange={(event) =>
                    editItem(index, { value: event.target.value.replace(/\D/g, "") })
                  }
                  className={`${inputClassName} w-0 min-w-[90px] flex-1 sm:w-[110px] sm:flex-none`}
                />
                <button
                  type="button"
                  aria-label={`Hapus produk promo ${index + 1}`}
                  onClick={() =>
                    setItems((current) => current.filter((_, position) => position !== index))
                  }
                  className="flex size-[41px] shrink-0 items-center justify-center rounded-lg border border-ube-line text-plum hover:text-ube-pop"
                >
                  <X className="size-4" />
                </button>
              </div>
            );
          })}
          {unused.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                setItems((current) => [
                  ...current,
                  { productId: unused[0].id, discountType: "percentage", value: "" },
                ])
              }
              className="flex w-fit items-center gap-1.5 text-[11px] font-bold text-deep-ube hover:text-ube-pop"
            >
              <Plus className="size-3.5" />
              Tambah produk
            </button>
          ) : (
            products.length === 0 && (
              <span className="text-[10px] text-plum">Belum ada produk di katalog.</span>
            )
          )}
        </fieldset>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="Minimal belanja (Rp)"
          hint={form.scope === "products" ? "Dari produk promo saja." : "Kosong = tanpa minimal."}
        >
          <input
            inputMode="numeric"
            value={form.minSubtotal}
            placeholder="0"
            onChange={(event) => update("minSubtotal", event.target.value.replace(/\D/g, ""))}
            className={inputClassName}
          />
        </Field>
        <Field label="Maksimal diskon (Rp)" hint="Kosong = tanpa batas.">
          <input
            inputMode="numeric"
            value={form.maxDiscount}
            placeholder="Tanpa batas"
            onChange={(event) => update("maxDiscount", event.target.value.replace(/\D/g, ""))}
            className={inputClassName}
          />
        </Field>
        <Field
          label="Kuota pemakaian"
          hint={
            voucher ? `Terpakai ${voucher.used}. Kosong = tanpa batas.` : "Kosong = tanpa batas."
          }
        >
          <input
            inputMode="numeric"
            value={form.quota}
            placeholder="Tanpa batas"
            onChange={(event) => update("quota", event.target.value.replace(/\D/g, ""))}
            className={inputClassName}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Mulai berlaku" hint="Kosong = langsung berlaku.">
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={(event) => update("startsAt", event.target.value)}
            className={inputClassName}
          />
        </Field>
        <Field label="Berakhir" hint="Kosong = tanpa batas waktu.">
          <input
            type="datetime-local"
            value={form.endsAt}
            onChange={(event) => update("endsAt", event.target.value)}
            className={inputClassName}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-xs font-semibold text-ink">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(event) => update("active", event.target.checked)}
          className="size-4 accent-deep-ube"
        />
        Aktif (bisa dipakai pelanggan)
      </label>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className={secondaryButtonClassName}>
          Batal
        </button>
        <button type="submit" disabled={pending} className={primaryButtonClassName}>
          {pending ? "Menyimpan…" : voucher ? "Simpan voucher" : "Buat voucher"}
        </button>
      </div>
    </form>
  );
}
