import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import {
  addBatchProduct,
  addBatchProductSchema,
  type BatchOverview,
  type BatchStatus,
  deleteDeliveryZone,
  deletePickupSlot,
  saveBatch,
  saveBatchSchema,
  saveDeliveryZone,
  saveDeliveryZoneSchema,
  savePickupSlot,
  savePickupSlotSchema,
} from "@/functions/batches";
import { productCategories, productUnits } from "@/functions/products";

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
  toDateValue,
  toTimeValue,
  useMutationRunner,
} from "./fields";
import { ProductImagesField } from "./product-images-field";

type LoadedOverview = NonNullable<BatchOverview["current"]>;
type BatchRow = LoadedOverview["batch"];
type SlotRow = LoadedOverview["slots"][number];
type ZoneRow = LoadedOverview["zones"][number];

export const batchStatusOptions: { value: BatchStatus; label: string }[] = [
  { value: "draft", label: "Draf" },
  { value: "open", label: "Dibuka" },
  { value: "closed", label: "Ditutup" },
  { value: "archived", label: "Diarsipkan" },
];

const categoryLabels = { camilan: "Camilan", minuman: "Minuman" } as const;
const unitLabels = { porsi: "Porsi", kotak: "Kotak", cup: "Cup" } as const;
export const categoryOptions = productCategories.map((value) => ({
  value,
  label: categoryLabels[value],
}));
export const unitOptions = productUnits.map((value) => ({ value, label: unitLabels[value] }));

const checkboxClassName = "size-4 accent-deep-ube";

// ---------------------------------------------------------------------------
// Batch settings
// ---------------------------------------------------------------------------

export function BatchSettingsDialog({
  open,
  onClose,
  batch,
}: {
  open: boolean;
  onClose: () => void;
  batch: BatchRow | null;
}) {
  return (
    <AdminDialog
      open={open}
      onClose={onClose}
      title={batch ? "Pengaturan batch" : "Buat batch"}
      description="Waktu dalam WIB. Membuka batch ini akan menutup batch lain yang masih dibuka."
    >
      <BatchSettingsForm batch={batch} onDone={onClose} />
    </AdminDialog>
  );
}

function BatchSettingsForm({ batch, onDone }: { batch: BatchRow | null; onDone: () => void }) {
  const run = useMutationRunner();
  const [pending, setPending] = useState(false);
  const now = new Date();
  const [form, setForm] = useState({
    name: batch?.name ?? "",
    status: (batch?.status ?? "draft") as BatchStatus,
    opensAt: toDateTimeInputValue(batch?.opensAt ?? now),
    closesAt: toDateTimeInputValue(batch?.closesAt ?? new Date(now.getTime() + 6 * 864e5)),
    paymentCutoffAt: toDateTimeInputValue(
      batch?.paymentCutoffAt ?? new Date(now.getTime() + 7 * 864e5),
    ),
    pickupLocation: batch?.pickupLocation ?? "",
    pickupEnabled: batch?.pickupEnabled ?? true,
    deliveryEnabled: batch?.deliveryEnabled ?? true,
  });
  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = saveBatchSchema.safeParse({
      id: batch?.id,
      ...form,
      opensAt: fromWib(form.opensAt),
      closesAt: fromWib(form.closesAt),
      paymentCutoffAt: fromWib(form.paymentCutoffAt),
    });
    if (!parsed.success) return void toast.error(firstIssue(parsed.error));
    setPending(true);
    const ok = await run(() => saveBatch({ data: parsed.data }), "Pengaturan batch disimpan");
    setPending(false);
    if (ok) onDone();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
        <Field label="Nama batch" hint="Contoh: Oktober 2026">
          <input
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            className={inputClassName}
            required
          />
        </Field>
        <Field label="Status">
          <OptionSelect
            options={batchStatusOptions}
            value={form.status}
            onChange={(value) => update("status", value)}
          />
        </Field>
        <Field label="Buka">
          <input
            type="datetime-local"
            value={form.opensAt}
            onChange={(event) => update("opensAt", event.target.value)}
            className={inputClassName}
            required
          />
        </Field>
        <Field label="Tutup">
          <input
            type="datetime-local"
            value={form.closesAt}
            onChange={(event) => update("closesAt", event.target.value)}
            className={inputClassName}
            required
          />
        </Field>
        <Field label="Cutoff pembayaran">
          <input
            type="datetime-local"
            value={form.paymentCutoffAt}
            onChange={(event) => update("paymentCutoffAt", event.target.value)}
            className={inputClassName}
            required
          />
        </Field>
        <Field label="Lokasi pickup">
          <input
            value={form.pickupLocation}
            onChange={(event) => update("pickupLocation", event.target.value)}
            className={inputClassName}
          />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[13px] font-bold text-ink">Cara pengiriman</legend>
        <label className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
          <input
            type="checkbox"
            checked={form.pickupEnabled}
            onChange={(event) => update("pickupEnabled", event.target.checked)}
            className={checkboxClassName}
          />
          Ambil sendiri (pickup)
        </label>
        <label className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
          <input
            type="checkbox"
            checked={form.deliveryEnabled}
            onChange={(event) => update("deliveryEnabled", event.target.checked)}
            className={checkboxClassName}
          />
          Diantar (delivery)
        </label>
        <span className="text-xs text-plum">
          Cara yang dimatikan tidak bisa dipilih di checkout maupun pesanan manual.
        </span>
      </fieldset>
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={primaryButtonClassName}>
          {batch ? "Simpan pengaturan" : "Buat batch"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Pickup slots
// ---------------------------------------------------------------------------

export function PickupSlotsDialog({
  open,
  onClose,
  batchId,
  slots,
  defaultLocation,
}: {
  open: boolean;
  onClose: () => void;
  batchId: string;
  slots: SlotRow[];
  /** Batch pickup location used by slots without their own. */
  defaultLocation: string;
}) {
  return (
    <AdminDialog
      open={open}
      onClose={onClose}
      title="Slot pickup & kapasitas"
      description="Kosongkan lokasi untuk memakai lokasi pickup batch. Slot nonaktif tidak bisa dipilih pelanggan. Slot yang sudah dipakai pesanan tidak bisa dihapus."
      className="w-[min(960px,calc(100vw-32px))]"
    >
      <ul className="flex flex-col gap-2.5">
        {slots.map((slot) => (
          <PickupSlotForm
            key={slot.id}
            batchId={batchId}
            slot={slot}
            defaultLocation={defaultLocation}
          />
        ))}
        <PickupSlotForm
          key={`new-${slots.length}`}
          batchId={batchId}
          defaultLocation={defaultLocation}
        />
      </ul>
    </AdminDialog>
  );
}

function PickupSlotForm({
  batchId,
  slot,
  defaultLocation,
}: {
  batchId: string;
  slot?: SlotRow;
  defaultLocation: string;
}) {
  const run = useMutationRunner();
  const [pending, setPending] = useState(false);
  const base = slot?.startsAt ?? new Date();
  const [form, setForm] = useState({
    date: toDateValue(base),
    start: slot ? toTimeValue(slot.startsAt) : "10:00",
    end: slot ? toTimeValue(slot.endsAt) : "12:00",
    location: slot?.location ?? "",
    capacity: String(slot?.capacity ?? 50),
    active: slot?.active ?? true,
  });
  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = savePickupSlotSchema.safeParse({
      id: slot?.id,
      batchId,
      startsAt: fromWib(form.date, form.start),
      endsAt: fromWib(form.date, form.end),
      location: form.location,
      capacity: parseOptionalInt(form.capacity) ?? 0,
      active: form.active,
    });
    if (!parsed.success) return void toast.error(firstIssue(parsed.error));
    setPending(true);
    await run(
      () => savePickupSlot({ data: parsed.data }),
      slot ? "Slot pickup disimpan" : "Slot pickup ditambahkan",
    );
    setPending(false);
  };

  const remove = async () => {
    if (!slot) return;
    setPending(true);
    await run(() => deletePickupSlot({ data: { id: slot.id } }), "Slot pickup dihapus");
    setPending(false);
  };

  return (
    <li className="rounded-lg bg-vanilla px-3 py-[11px]">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2.5">
        <Field label="Tanggal">
          <input
            type="date"
            value={form.date}
            onChange={(event) => update("date", event.target.value)}
            className={`${inputClassName} w-[140px]`}
            required
          />
        </Field>
        <Field label="Mulai">
          <input
            type="time"
            value={form.start}
            onChange={(event) => update("start", event.target.value)}
            className={`${inputClassName} w-[92px]`}
            required
          />
        </Field>
        <Field label="Selesai">
          <input
            type="time"
            value={form.end}
            onChange={(event) => update("end", event.target.value)}
            className={`${inputClassName} w-[92px]`}
            required
          />
        </Field>
        <Field label="Lokasi">
          <input
            value={form.location}
            maxLength={160}
            placeholder={defaultLocation || "Lokasi batch"}
            onChange={(event) => update("location", event.target.value)}
            className={`${inputClassName} w-[180px]`}
          />
        </Field>
        <Field label="Kapasitas">
          <input
            inputMode="numeric"
            value={form.capacity}
            onChange={(event) => update("capacity", event.target.value)}
            className={`${inputClassName} w-[76px]`}
            required
          />
        </Field>
        <label className="flex h-[41px] items-center gap-1.5 text-[13px] font-bold text-ink">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) => update("active", event.target.checked)}
            className={checkboxClassName}
          />
          Aktif
        </label>
        <div className="ml-auto flex h-[41px] items-center gap-2">
          {slot && (
            <span className="text-xs font-bold text-deep-ube">
              {slot.filled} / {slot.capacity} terisi
            </span>
          )}
          <button type="submit" disabled={pending} className={secondaryButtonClassName}>
            {slot ? "Simpan" : "+ Tambah slot"}
          </button>
          {slot && (
            <button
              type="button"
              disabled={pending}
              onClick={remove}
              className={secondaryButtonClassName}
            >
              Hapus
            </button>
          )}
        </div>
      </form>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Delivery windows
// ---------------------------------------------------------------------------

export function DeliveryZonesDialog({
  open,
  onClose,
  batchId,
  zones,
  deliveryAreas,
}: {
  open: boolean;
  onClose: () => void;
  batchId: string;
  zones: ZoneRow[];
  /** Area names from Pengaturan a window can be limited to. */
  deliveryAreas: string[];
}) {
  return (
    <AdminDialog
      open={open}
      onClose={onClose}
      title="Jadwal delivery"
      description="Centang area yang dilayani tiap jadwal; tanpa centang = semua area. Area tujuan dan ongkir diatur di Pengaturan. Jadwal yang sudah dipakai pesanan tidak bisa dihapus."
      className="w-[min(860px,calc(100vw-32px))]"
    >
      <ul className="flex flex-col gap-2.5">
        {zones.map((zone) => (
          <DeliveryZoneForm
            key={zone.id}
            batchId={batchId}
            zone={zone}
            deliveryAreas={deliveryAreas}
          />
        ))}
        <DeliveryZoneForm
          key={`new-${zones.length}`}
          batchId={batchId}
          deliveryAreas={deliveryAreas}
        />
      </ul>
    </AdminDialog>
  );
}

function DeliveryZoneForm({
  batchId,
  zone,
  deliveryAreas,
}: {
  batchId: string;
  zone?: ZoneRow;
  deliveryAreas: string[];
}) {
  const run = useMutationRunner();
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    date: toDateValue(zone?.windowStartsAt ?? new Date()),
    start: zone ? toTimeValue(zone.windowStartsAt) : "13:00",
    end: zone ? toTimeValue(zone.windowEndsAt) : "16:00",
    areas: zone?.areas ?? [],
    active: zone?.active ?? true,
  });
  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = saveDeliveryZoneSchema.safeParse({
      id: zone?.id,
      batchId,
      windowStartsAt: fromWib(form.date, form.start),
      windowEndsAt: fromWib(form.date, form.end),
      areas: form.areas,
      active: form.active,
    });
    if (!parsed.success) return void toast.error(firstIssue(parsed.error));
    setPending(true);
    await run(
      () => saveDeliveryZone({ data: parsed.data }),
      zone ? "Jadwal delivery disimpan" : "Jadwal delivery ditambahkan",
    );
    setPending(false);
  };

  const remove = async () => {
    if (!zone) return;
    setPending(true);
    await run(() => deleteDeliveryZone({ data: { id: zone.id } }), "Jadwal delivery dihapus");
    setPending(false);
  };

  return (
    <li className="rounded-lg bg-vanilla px-3 py-2.5">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2.5">
        <Field label="Tanggal">
          <input
            type="date"
            value={form.date}
            onChange={(event) => update("date", event.target.value)}
            className={`${inputClassName} w-[140px]`}
            required
          />
        </Field>
        <Field label="Mulai">
          <input
            type="time"
            value={form.start}
            onChange={(event) => update("start", event.target.value)}
            className={`${inputClassName} w-[92px]`}
            required
          />
        </Field>
        <Field label="Selesai">
          <input
            type="time"
            value={form.end}
            onChange={(event) => update("end", event.target.value)}
            className={`${inputClassName} w-[92px]`}
            required
          />
        </Field>
        <label className="flex h-[41px] items-center gap-1.5 text-[13px] font-bold text-ink">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) => update("active", event.target.checked)}
            className={checkboxClassName}
          />
          Aktif
        </label>
        <div className="ml-auto flex h-[41px] items-center gap-2">
          <button type="submit" disabled={pending} className={secondaryButtonClassName}>
            {zone ? "Simpan" : "+ Tambah jadwal"}
          </button>
          {zone && (
            <button
              type="button"
              disabled={pending}
              onClick={remove}
              className={secondaryButtonClassName}
            >
              Hapus
            </button>
          )}
        </div>
        <fieldset className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5">
          <legend className="sr-only">Area dilayani</legend>
          <span className="text-[13px] font-bold text-ink">Area:</span>
          {[...new Set([...deliveryAreas, ...form.areas])].map((area) => (
            <label key={area} className="flex items-center gap-1.5 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={form.areas.includes(area)}
                onChange={(event) =>
                  update(
                    "areas",
                    event.target.checked
                      ? [...form.areas, area]
                      : form.areas.filter((name) => name !== area),
                  )
                }
                className={checkboxClassName}
              />
              {area}
              {!deliveryAreas.includes(area) && " (tidak ada di Pengaturan)"}
            </label>
          ))}
          {form.areas.length === 0 && <span className="text-xs text-plum">Semua area</span>}
        </fieldset>
      </form>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Add product to batch
// ---------------------------------------------------------------------------

const NEW_PRODUCT = "__new__";

export function AddProductDialog({
  open,
  onClose,
  batchId,
  candidates,
}: {
  open: boolean;
  onClose: () => void;
  batchId: string;
  /** Existing products not yet sold in this batch. */
  candidates: { id: string; name: string }[];
}) {
  return (
    <AdminDialog
      open={open}
      onClose={onClose}
      title="Tambah produk ke batch"
      description="Produk baru dibuat sebagai draf; lengkapi detailnya lalu tayangkan dari editor produk."
    >
      <AddProductForm batchId={batchId} candidates={candidates} onDone={onClose} />
    </AdminDialog>
  );
}

function AddProductForm({
  batchId,
  candidates,
  onDone,
}: {
  batchId: string;
  candidates: { id: string; name: string }[];
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const run = useMutationRunner();
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [choice, setChoice] = useState(candidates[0]?.id ?? NEW_PRODUCT);
  const [form, setForm] = useState({
    name: "",
    category: "camilan" as (typeof productCategories)[number],
    unit: "porsi" as (typeof productUnits)[number],
    price: "",
    capacity: "",
    images: [] as string[],
  });
  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const isNew = choice === NEW_PRODUCT;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = addBatchProductSchema.safeParse({
      batchId,
      productId: isNew ? undefined : choice,
      newProduct: isNew
        ? {
            name: form.name,
            category: form.category,
            unit: form.unit,
            price: parseOptionalInt(form.price) ?? 0,
            images: form.images,
          }
        : undefined,
      capacity: parseOptionalInt(form.capacity),
    });
    if (!parsed.success) return void toast.error(firstIssue(parsed.error));
    setPending(true);
    let slug: string | undefined;
    const ok = await run(async () => {
      ({ slug } = await addBatchProduct({ data: parsed.data }));
    }, "Produk ditambahkan ke batch");
    setPending(false);
    if (!ok || !slug) return;
    onDone();
    if (isNew) await navigate({ to: "/dashboard/batch-produk/$slug", params: { slug } });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Produk">
        <OptionSelect
          options={[
            ...candidates.map(({ id, name }) => ({ value: id, label: name })),
            { value: NEW_PRODUCT, label: "Produk baru…" },
          ]}
          value={choice}
          onChange={setChoice}
        />
      </Field>
      {isNew && (
        <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
          <Field label="Nama produk">
            <input
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              className={inputClassName}
              required
            />
          </Field>
          <Field label="Harga per satuan (Rp)">
            <input
              inputMode="numeric"
              value={form.price}
              placeholder="0"
              onChange={(event) => update("price", event.target.value)}
              className={inputClassName}
              required
            />
          </Field>
          <Field label="Kategori">
            <OptionSelect
              options={categoryOptions}
              value={form.category}
              onChange={(value) => update("category", value)}
            />
          </Field>
          <Field label="Satuan">
            <OptionSelect
              options={unitOptions}
              value={form.unit}
              onChange={(value) => update("unit", value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <ProductImagesField
              name={form.name}
              images={form.images}
              onChange={(change) =>
                setForm((current) => ({ ...current, images: change(current.images) }))
              }
              uploading={uploading}
              setUploading={setUploading}
            />
          </div>
        </div>
      )}
      <Field label="Kapasitas batch" hint="Kosongkan bila tidak dibatasi.">
        <input
          inputMode="numeric"
          value={form.capacity}
          onChange={(event) => update("capacity", event.target.value)}
          className={inputClassName}
        />
      </Field>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || uploading > 0}
          className={primaryButtonClassName}
        >
          {uploading > 0 ? "Mengunggah foto…" : "Tambahkan"}
        </button>
      </div>
    </form>
  );
}
