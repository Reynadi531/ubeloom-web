import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { Info, QrCode, Upload } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";

import { serverErrorMessage } from "@/components/admin/orders/form-errors";
import {
  Badge,
  type BadgeTone,
  ItemSummaryRow,
  LabeledValue,
  NumberedSteps,
  TotalRow,
} from "@/components/storefront/checkout-parts";
import PrivateNav from "@/components/storefront/private-nav";
import { type InvoiceData, MAX_PROOF_BYTES, getInvoice, submitProof } from "@/functions/checkout";
import { formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/invoice/$token")({
  loader: ({ params }) => getInvoice({ data: { token: params.token } }),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `Invoice ${loaderData.invoiceNumber} · ubeloom` : "Invoice · ubeloom" },
      // Private link: keep it out of search engines and referrers.
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: InvoiceComponent,
  notFoundComponent: InvoiceNotFound,
});

type PaymentState = {
  badge: string;
  tone: BadgeTone;
  explanation: string;
  printed: string;
};

function paymentState(invoice: InvoiceData): PaymentState {
  if (invoice.cancelled) {
    return {
      badge: "DIBATALKAN",
      tone: "neutral",
      explanation: "Pesanan ini dibatalkan. Hubungi bantuan bila ada pertanyaan.",
      printed: "DIBATALKAN",
    };
  }
  if (invoice.paymentStatus === "paid") {
    return {
      badge: "LUNAS",
      tone: "ube",
      explanation: "Pembayaran terverifikasi · pesanan masuk antrean produksi.",
      printed: "LUNAS",
    };
  }
  if (invoice.paymentStatus === "review") {
    return {
      badge: "DALAM PENINJAUAN",
      tone: "ube",
      explanation: "Bukti diterima · tim kami sedang memverifikasi. Belum lunas sampai disetujui.",
      printed: "DALAM PENINJAUAN / BELUM LUNAS",
    };
  }
  if (invoice.latestProof?.status === "rejected") {
    return {
      badge: "BUKTI DITOLAK",
      tone: "pink",
      explanation: `Bukti sebelumnya ditolak${invoice.latestProof.reviewNote ? `: ${invoice.latestProof.reviewNote}` : ""}. Unggah bukti yang benar.`,
      printed: "MENUNGGU PEMBAYARAN / BELUM LUNAS",
    };
  }
  return {
    badge: "MENUNGGU PEMBAYARAN",
    tone: "gold",
    explanation:
      "Belum dibayar · unggah bukti setelah transfer. Pesanan diproses setelah diverifikasi.",
    printed: "MENUNGGU PEMBAYARAN / BELUM LUNAS",
  };
}

const proofBadges = {
  pending: "DALAM PENINJAUAN",
  approved: "DISETUJUI",
  rejected: "DITOLAK",
} as const;

function InvoiceComponent() {
  const invoice = Route.useLoaderData();
  const state = paymentState(invoice);
  const isDelivery = invoice.method === "delivery";
  const total = formatRupiah(invoice.total);

  return (
    <div className="flex min-h-svh flex-col bg-white font-body text-ink">
      <PrivateNav />
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-[22px] px-5 pt-[38px] pb-12 lg:px-16 print:p-0">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-[5px]">
            <p className="font-data text-[11px] font-bold tracking-[1px] whitespace-pre text-ube-pop">
              {[
                invoice.batchOpen ? "PREORDER DIBUKA" : "PREORDER DITUTUP",
                isDelivery ? "PENGIRIMAN" : "AMBIL SENDIRI",
                "LANGKAH 03",
              ].join("  /  ")}
            </p>
            <h1 className="font-display text-[30px] font-bold lg:text-[35px]">
              Invoice preorder kamu
            </h1>
            <p className="text-[13px] text-plum">
              Pesanan dicatat.{" "}
              {invoice.paymentStatus === "paid"
                ? "Pembayaran sudah terverifikasi."
                : "Pembayaran masih menunggu verifikasi sebelum disiapkan."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="w-fit rounded-full border-[1.5px] border-deep-ube bg-surface px-[22px] py-[13px] text-[15px] font-bold text-deep-ube transition-colors hover:bg-vanilla print:hidden"
          >
            Cetak invoice
          </button>
        </div>

        <div
          id="status-pembayaran"
          role="status"
          className="flex items-center justify-between gap-4 rounded-[12px] bg-vanilla px-6 py-[18px] print:hidden"
        >
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Badge tone={state.tone}>{state.badge}</Badge>
            <p className="text-xs text-ink">{state.explanation}</p>
          </div>
          <Info aria-hidden className="size-[18px] shrink-0 text-deep-ube" />
        </div>

        <div className="flex flex-col gap-[22px] lg:flex-row lg:items-start">
          <div className="flex w-full flex-col gap-[18px] lg:w-[690px] lg:shrink-0">
            <article className="flex flex-col gap-4 rounded-[16px] border border-ube-line bg-surface p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h2 className="font-display text-xl font-bold">Rincian invoice preorder</h2>
                  <p className="font-data text-sm font-bold break-all text-deep-ube">
                    {invoice.invoiceNumber}
                  </p>
                </div>
                <Badge tone="neutral">{isDelivery ? "PENGIRIMAN" : "AMBIL SENDIRI"}</Badge>
              </div>
              <hr className="border-ube-line" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <LabeledValue label="Dibuat" value={invoice.createdAt} />
                <LabeledValue
                  label="Metode"
                  value={isDelivery ? "Diantar ke alamat" : "Ambil sendiri"}
                />
                <LabeledValue label="Atas nama" value={invoice.customerName} />
              </div>
              <hr className="border-ube-line" />
              <div className="flex flex-col gap-4 rounded-[10px] bg-vanilla px-4 py-3.5 sm:flex-row sm:gap-5">
                <LabeledValue
                  className="flex-1"
                  label={isDelivery ? "TUJUAN PENGIRIMAN" : "LOKASI AMBIL"}
                  value={
                    <>
                      {invoice.destination}
                      {invoice.recipient && (
                        <span className="block font-semibold text-plum">
                          Penerima: {invoice.recipient}
                        </span>
                      )}
                    </>
                  }
                />
                <LabeledValue
                  className="flex-1"
                  label={isDelivery ? "ESTIMASI TIBA" : "JADWAL AMBIL"}
                  value={invoice.window}
                />
              </div>
              <div className="flex flex-col gap-2.5">
                {invoice.items.map(({ id, productName, quantity, unitPrice }) => (
                  <ItemSummaryRow
                    key={id}
                    name={productName}
                    quantity={quantity}
                    unitPrice={unitPrice}
                  />
                ))}
                <InvoiceAmountRow label="Subtotal produk" amount={invoice.subtotal} />
                <InvoiceAmountRow
                  label={isDelivery ? "Biaya pengiriman" : "Ongkir · ambil sendiri"}
                  amount={invoice.shippingFee}
                />
                {invoice.discount > 0 && (
                  <InvoiceAmountRow
                    label={`Voucher ${invoice.voucherCode ?? ""}`.trim()}
                    amount={-invoice.discount}
                  />
                )}
              </div>
              <hr className="border-ube-line" />
              <TotalRow label="Total yang harus dibayar" amount={invoice.total} />
              <p className="text-[10px] text-plum">
                {isDelivery
                  ? "Biaya pengiriman sudah termasuk dalam total. Jangan transfer nominal berbeda."
                  : "Total tanpa ongkir. Jangan transfer nominal berbeda."}
              </p>
              <p className="font-data text-[10px] font-bold whitespace-pre-wrap text-deep-ube">
                STATUS PEMBAYARAN · {state.printed}
              </p>
            </article>

            <ProofUpload invoice={invoice} />
          </div>

          <div className="flex flex-1 flex-col gap-[18px] print:hidden">
            <section className="flex flex-col gap-3 rounded-[16px] border border-ube-line bg-white p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-xl font-bold">Bayar dengan QRIS</h2>
                <Badge tone="ube">{invoice.qrisImageUrl ? "QR RESMI" : "QR BELUM TERSEDIA"}</Badge>
              </div>
              <p className="font-data text-[10px] font-bold text-plum">
                NAMA MERCHANT YANG HARUS DICOCOKKAN
              </p>
              <p className="text-sm font-bold">
                {invoice.merchantName
                  ? `${invoice.merchantName} · cocokkan di aplikasi`
                  : "Diumumkan bersama QR resmi"}
              </p>
              {invoice.qrisImageUrl ? (
                <div className="flex flex-col items-center gap-2 rounded-[10px] border border-ube-line bg-white p-3">
                  <img
                    src={invoice.qrisImageUrl}
                    alt={`QRIS ${invoice.merchantName || "ubeloom"}`}
                    className="aspect-square w-full max-w-[280px] object-contain"
                  />
                  <a
                    href={invoice.qrisImageUrl}
                    download={`qris-${invoice.invoiceNumber}`}
                    className="text-xs font-bold text-deep-ube hover:text-ube-pop"
                  >
                    Simpan gambar QR
                  </a>
                </div>
              ) : (
                <div className="flex h-[216px] flex-col items-center justify-center gap-2 rounded-[10px] border border-ube-line bg-vanilla text-center">
                  <QrCode aria-hidden className="size-[54px] text-deep-ube" />
                  <p className="font-data text-xs font-bold text-deep-ube">QRIS BELUM TERSEDIA</p>
                  <p className="px-4 text-[10px] text-plum">
                    Jangan bayar sampai QR resmi tampil di invoice ini.
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 rounded-[10px] bg-vanilla px-4 py-[13px]">
                <p className="text-xs font-bold">Masukkan nominal tepat</p>
                <p className="font-display text-2xl font-bold text-deep-ube">{total}</p>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-plum">Batas pembayaran</p>
                <p className="text-right text-xs font-bold">{invoice.paymentDeadline}</p>
              </div>
              <p className="text-[10px] text-plum">
                Bayar sebelum batas waktu. Jika QR belum tampil, hubungi bantuan.
              </p>
              <Link
                to="/cara-pesan"
                className="flex w-full justify-center rounded-full border-[1.5px] border-deep-ube bg-surface px-[22px] py-[13px] text-[15px] font-bold text-deep-ube transition-colors hover:bg-vanilla"
              >
                Hubungi bantuan soal QRIS
              </Link>
            </section>

            <section className="flex flex-col gap-3.5 rounded-[16px] bg-surface p-6">
              <h2 className="font-display text-[19px] font-bold">Cara membayar</h2>
              <NumberedSteps
                className="gap-3.5"
                steps={[
                  invoice.qrisImageUrl
                    ? "Pindai QR di atas dengan aplikasi pembayaran."
                    : "Saat QRIS resmi tampil, pindai dengan aplikasi pembayaran.",
                  "Jika memakai satu ponsel, simpan gambar QR lalu impor bila didukung.",
                  `Masukkan tepat ${total}; pastikan merchant ubeloom sebelum membayar.`,
                ]}
              />
            </section>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-2.5 sm:flex-row sm:items-center print:hidden">
          <p className="text-[11px] text-plum">
            Invoice ini bersifat pribadi. Jangan bagikan tautan atau bukti bayar.
          </p>
          <a
            href="#status-pembayaran"
            className="text-xs font-bold text-deep-ube hover:text-ube-pop"
          >
            Lihat status pesanan →
          </a>
        </div>
      </main>
    </div>
  );
}

function InvoiceAmountRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5 text-xs text-ink">
      <p className="font-semibold">{label}</p>
      <p className="font-bold">{amount < 0 ? `−${formatRupiah(-amount)}` : formatRupiah(amount)}</p>
    </div>
  );
}

const fieldInputClassName =
  "h-12 w-full rounded-[10px] border border-ube-line bg-surface px-4 text-sm text-ink placeholder:text-plum focus:border-deep-ube focus:outline-none disabled:opacity-60";

/** `yyyy-mm-ddThh:mm` of now in WIB, the max for the payment time picker. */
function nowInWib() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function ProofUpload({ invoice }: { invoice: InvoiceData }) {
  const router = useRouter();
  const { token } = Route.useParams();
  const ids = useId();
  const [file, setFile] = useState<File>();
  const [paidAt, setPaidAt] = useState("");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const disabled = !invoice.canUpload || submitting;
  const badge = invoice.latestProof ? proofBadges[invoice.latestProof.status] : "BELUM ADA BUKTI";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return setError("Pilih foto bukti transfer.");
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      return setError("Bukti harus berupa foto JPG atau PNG.");
    }
    if (file.size > MAX_PROOF_BYTES) return setError("Ukuran foto maksimal 5 MB.");
    if (!paidAt) return setError("Isi waktu bayar.");

    setError(undefined);
    setSubmitting(true);
    try {
      const data = new FormData();
      data.set("token", token);
      data.set("file", file);
      // The picker is WIB wall-clock time regardless of the device time zone.
      data.set("paidAt", `${paidAt}:00+07:00`);
      data.set("reference", reference);
      await submitProof({ data });
      toast.success("Bukti terkirim. Tim kami segera memverifikasi.");
      setFile(undefined);
      setReference("");
      await router.invalidate();
    } catch (caught) {
      const message = serverErrorMessage(caught);
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-[13px] rounded-[16px] border border-ube-line bg-white p-6 print:hidden"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[19px] font-bold">Unggah bukti pembayaran</h2>
        <Badge tone="neutral">{badge}</Badge>
      </div>
      <p className="text-[11px] text-plum">
        {invoice.latestProof?.status === "pending"
          ? `Bukti dikirim ${invoice.latestProof.submittedAt} · menunggu verifikasi.`
          : invoice.paymentStatus === "paid"
            ? "Pembayaran sudah disetujui. Tidak perlu unggah lagi."
            : "Unggah setelah membayar · JPG atau PNG · maks. 5 MB"}
      </p>
      <label
        className={`flex h-[76px] items-center justify-center gap-3 rounded-[10px] border border-ube-line bg-vanilla px-4 text-[13px] font-bold text-deep-ube focus-within:border-deep-ube ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-deep-ube"}`}
      >
        <Upload aria-hidden className="size-[22px] shrink-0" />
        <span className="truncate">{file ? file.name : "Pilih foto bukti transfer"}</span>
        <input
          type="file"
          accept="image/jpeg,image/png"
          disabled={disabled}
          onChange={(event) => setFile(event.target.files?.[0])}
          className="sr-only"
        />
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-2">
          <label htmlFor={`${ids}-paid`} className="text-[13px] font-bold">
            Waktu bayar (WIB)
          </label>
          <input
            id={`${ids}-paid`}
            type="datetime-local"
            max={nowInWib()}
            disabled={disabled}
            value={paidAt}
            onChange={(event) => setPaidAt(event.target.value)}
            className={fieldInputClassName}
          />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <label htmlFor={`${ids}-ref`} className="text-[13px] font-bold">
            Referensi transaksi (opsional)
          </label>
          <input
            id={`${ids}-ref`}
            maxLength={120}
            placeholder="Nomor referensi"
            disabled={disabled}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            className={fieldInputClassName}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs font-semibold text-ube-pop">
          {error}
        </p>
      )}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-[11px] text-plum">Setelah diunggah: dalam peninjauan · belum lunas.</p>
        <button
          type="submit"
          disabled={disabled}
          className="w-fit rounded-full bg-deep-ube px-[22px] py-[13px] text-[15px] font-bold text-vanilla transition-colors hover:bg-ube-pop disabled:opacity-60"
        >
          {submitting ? "Mengirim…" : "Kirim bukti"}
        </button>
      </div>
    </form>
  );
}

function InvoiceNotFound() {
  return (
    <div className="flex min-h-svh flex-col bg-white font-body text-ink">
      <PrivateNav />
      <main className="mx-auto flex max-w-[640px] flex-1 flex-col items-start justify-center gap-3 px-5 py-16">
        <h1 className="font-display text-3xl font-bold">Invoice tidak ditemukan.</h1>
        <p className="text-sm text-plum">
          Periksa kembali tautan dari pesan konfirmasi. Tautan invoice bersifat pribadi.
        </p>
        <Link to="/menu" className="text-sm font-bold text-deep-ube hover:text-ube-pop">
          Kembali ke menu →
        </Link>
      </main>
    </div>
  );
}
