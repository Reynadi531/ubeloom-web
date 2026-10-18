import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ImagePlus, Plus, QrCode, Trash2, X } from "lucide-react";
import { type ChangeEvent, type FormEvent, useId, useState } from "react";
import { toast } from "sonner";

import { AdminPage, PageHeading } from "@/components/admin/admin-page";
import { fieldErrors, serverErrorMessage } from "@/components/admin/orders/form-errors";
import {
  getSettings,
  removeQrisImage,
  shopSettingsSchema,
  updateSettings,
  uploadQrisImage,
} from "@/functions/settings";
import { MAX_PRODUCT_IMAGE_BYTES, PRODUCT_IMAGE_ACCEPT, qrisImageUrl } from "@/lib/product-images";

export const Route = createFileRoute("/_auth/dashboard/pengaturan")({
  head: () => ({
    meta: [{ title: "Pengaturan · ubeloom" }],
  }),
  loader: () => getSettings(),
  component: SettingsComponent,
});

const cardClassName = "flex flex-col gap-4 rounded-xl border border-ube-line bg-white p-[18px]";
const fieldLabelClassName = "text-[10px] font-bold text-plum";
const fieldErrorClassName = "text-[10px] font-semibold text-[#b42318]";
const inputClassName =
  "h-[42px] w-full rounded-lg border border-ube-line bg-surface px-[11px] text-xs text-ink outline-none transition-colors focus:border-ube-pop";

function SettingsComponent() {
  const settings = Route.useLoaderData();
  const router = useRouter();
  const [brandName, setBrandName] = useState(settings.brandName);
  const [qrisMerchantName, setQrisMerchantName] = useState(settings.qrisMerchantName);
  const [paymentMethods, setPaymentMethods] = useState(settings.paymentMethods);
  const [invoiceMemo, setInvoiceMemo] = useState(settings.invoiceMemo);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const input = { brandName, qrisMerchantName, paymentMethods, invoiceMemo };
    const parsed = shopSettingsSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await updateSettings({ data: input });
      toast.success("Pengaturan tersimpan.");
      await router.invalidate();
    } catch (error) {
      toast.error(serverErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPage>
      <PageHeading
        eyebrow="ADMIN / PENGATURAN"
        title="Pengaturan toko"
        description="Detail bisnis yang tampil di invoice, checkout, dan verifikasi pembayaran."
      />

      <form onSubmit={submit} noValidate className="flex max-w-[720px] flex-col gap-4">
        <section className={cardClassName}>
          <h2 className="text-sm font-bold text-ink">Identitas</h2>
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClassName}>Nama brand di invoice</span>
            <input
              value={brandName}
              maxLength={60}
              onChange={(event) => setBrandName(event.target.value)}
              className={inputClassName}
            />
            {errors.brandName && <span className={fieldErrorClassName}>{errors.brandName}</span>}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClassName}>Catatan penutup invoice</span>
            <textarea
              rows={3}
              maxLength={300}
              value={invoiceMemo}
              placeholder="Kosongkan bila tidak perlu."
              onChange={(event) => setInvoiceMemo(event.target.value)}
              className={`${inputClassName} h-auto py-2.5`}
            />
            {errors.invoiceMemo && (
              <span className={fieldErrorClassName}>{errors.invoiceMemo}</span>
            )}
          </label>
        </section>

        <section className={cardClassName}>
          <h2 className="text-sm font-bold text-ink">Pembayaran</h2>
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClassName}>Nama merchant QRIS</span>
            <input
              value={qrisMerchantName}
              maxLength={80}
              placeholder="Persis seperti yang muncul di aplikasi pembayaran"
              onChange={(event) => setQrisMerchantName(event.target.value)}
              className={inputClassName}
            />
            <span className="text-[10px] text-plum">
              Pelanggan dan peninjau mencocokkan nama ini. Kosong = tampil "belum diatur".
            </span>
            {errors.qrisMerchantName && (
              <span className={fieldErrorClassName}>{errors.qrisMerchantName}</span>
            )}
          </label>

          <QrisImageField imageKey={settings.qrisImageKey} />

          <fieldset className="flex flex-col gap-1.5">
            <legend className={`${fieldLabelClassName} mb-1.5`}>
              Metode bayar pesanan manual (Tunai selalu tersedia)
            </legend>
            {paymentMethods.map((method, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  aria-label={`Metode bayar ${index + 1}`}
                  value={method}
                  maxLength={60}
                  placeholder="Contoh: Transfer bank · BCA"
                  onChange={(event) =>
                    setPaymentMethods((current) =>
                      current.map((value, position) =>
                        position === index ? event.target.value : value,
                      ),
                    )
                  }
                  className={inputClassName}
                />
                <button
                  type="button"
                  aria-label={`Hapus metode bayar ${index + 1}`}
                  onClick={() =>
                    setPaymentMethods((current) =>
                      current.filter((_, position) => position !== index),
                    )
                  }
                  className="flex size-[42px] shrink-0 items-center justify-center rounded-lg border border-ube-line text-plum hover:text-ube-pop"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            {paymentMethods.length < 10 && (
              <button
                type="button"
                onClick={() => setPaymentMethods((current) => [...current, ""])}
                className="flex w-fit items-center gap-1.5 text-[11px] font-bold text-deep-ube hover:text-ube-pop"
              >
                <Plus className="size-3.5" />
                Tambah metode bayar
              </button>
            )}
            {errors.paymentMethods && (
              <span className={fieldErrorClassName}>{errors.paymentMethods}</span>
            )}
          </fieldset>
        </section>

        <button
          type="submit"
          disabled={saving}
          className="w-fit rounded-full bg-deep-ube px-5 py-3 text-xs font-bold text-vanilla transition-colors hover:bg-ube-pop disabled:opacity-60"
        >
          {saving ? "Menyimpan…" : "Simpan pengaturan"}
        </button>
      </form>
    </AdminPage>
  );
}

/**
 * QRIS code shown on invoices. Uploads and removals apply immediately, independent
 * of the settings form below.
 */
function QrisImageField({ imageKey }: { imageKey: string | null }) {
  const router = useRouter();
  const inputId = useId();
  const [busy, setBusy] = useState(false);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
      toast.error(`Gambar maksimal ${MAX_PRODUCT_IMAGE_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setBusy(true);
    try {
      const data = new FormData();
      data.set("file", file);
      await uploadQrisImage({ data });
      toast.success(imageKey ? "QRIS diganti." : "QRIS diunggah.");
      await router.invalidate();
    } catch (error) {
      toast.error(serverErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Hapus gambar QRIS? Invoice akan menampilkan "QRIS belum tersedia".')) {
      return;
    }
    setBusy(true);
    try {
      await removeQrisImage();
      toast.success("QRIS dihapus.");
      await router.invalidate();
    } catch (error) {
      toast.error(serverErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className={fieldLabelClassName}>Gambar QRIS</span>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex size-[160px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ube-line bg-surface">
          {imageKey ? (
            <img
              src={qrisImageUrl(imageKey)}
              alt="QRIS toko"
              className="size-full object-contain"
            />
          ) : (
            <QrCode aria-hidden className="size-10 text-plum" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span className="max-w-[320px] text-[10px] text-plum">
            Tampil di invoice untuk dipindai pelanggan. JPG, PNG atau WEBP, maksimal{" "}
            {MAX_PRODUCT_IMAGE_BYTES / 1024 / 1024} MB. Perubahan langsung berlaku.
          </span>
          <input
            id={inputId}
            type="file"
            accept={PRODUCT_IMAGE_ACCEPT}
            disabled={busy}
            onChange={upload}
            className="sr-only"
          />
          <label
            htmlFor={inputId}
            aria-disabled={busy}
            className="flex w-fit cursor-pointer items-center gap-1.5 rounded-full border-[1.5px] border-deep-ube px-4 py-2 text-[11px] font-bold text-deep-ube transition-colors hover:bg-vanilla aria-disabled:pointer-events-none aria-disabled:opacity-60"
          >
            <ImagePlus className="size-3.5" />
            {busy ? "Memproses…" : imageKey ? "Ganti QRIS" : "Unggah QRIS"}
          </label>
          {imageKey && (
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="flex w-fit items-center gap-1.5 text-[11px] font-bold text-plum hover:text-[#b42318] disabled:opacity-60"
            >
              <Trash2 className="size-3.5" />
              Hapus QRIS
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
