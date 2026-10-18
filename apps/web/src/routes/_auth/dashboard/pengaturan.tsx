import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { AdminPage, PageHeading } from "@/components/admin/admin-page";
import { fieldErrors, serverErrorMessage } from "@/components/admin/orders/form-errors";
import { getSettings, shopSettingsSchema, updateSettings } from "@/functions/settings";

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
