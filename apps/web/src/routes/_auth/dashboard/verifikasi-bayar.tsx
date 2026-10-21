import { createFileRoute, useRouter } from "@tanstack/react-router";
import { paymentChecklist, rejectionReasons } from "@web-kwu/shop/rules";
import { AlertTriangle, Check, FileText, Image, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AdminPage, BatchStatusPill, PageHeading } from "@/components/admin/admin-page";
import { CompactMetric } from "@/components/admin/metric-card";
import { PaymentReviewRow } from "@/components/admin/payment-review/payment-review-row";
import { StatusBadge, type StatusTone } from "@/components/admin/status-badge";
import {
  type PaymentReviewAttempt,
  RECENT_REJECTION_DAYS,
  approvePayment,
  getPaymentReview,
  rejectPayment,
} from "@/functions/payments";
import {
  formatDayMonth,
  formatRupiah,
  formatTime,
  formatWeekday,
  toDateInputValue,
} from "@/lib/format";

export const Route = createFileRoute("/_auth/dashboard/verifikasi-bayar")({
  head: () => ({
    meta: [{ title: "Verifikasi pembayaran · ubeloom" }],
  }),
  validateSearch: z.object({ attempt: z.string().min(1).optional().catch(undefined) }),
  loader: () => getPaymentReview(),
  component: PaymentReviewComponent,
});

const batchStatusLabels = {
  draft: "DRAF",
  open: "DIBUKA",
  closed: "DITUTUP",
  archived: "DIARSIPKAN",
} as const;

const detailBadges: Record<PaymentReviewAttempt["status"], { tone: StatusTone; label: string }> = {
  pending: { tone: "gold", label: "UNDER REVIEW" },
  approved: { tone: "ready", label: "DISETUJUI" },
  rejected: { tone: "muted", label: "DITOLAK" },
};

const cardClassName = "rounded-[14px] border border-ube-line bg-surface";
const inputClassName =
  "h-10 w-full rounded-lg border border-ube-line px-3 text-[13px] text-ink outline-none placeholder:text-plum focus:border-ube-pop";

/** "Rani A." — first name plus last initial for list views. */
function shortName(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

/** Queue label from the design: first proof, re-submitted proof, or rejected. */
function queueStatus(attempt: PaymentReviewAttempt) {
  if (attempt.status === "rejected") return "Ditolak sebelumnya";
  return attempt.attempt > 1 ? "Bukti ulang" : "Perlu review";
}

/** "09.46 WIB" today, "Kemarin" yesterday, otherwise "15 Okt". */
function queueTime(value: Date, todayStart: Date) {
  const day = toDateInputValue(value);
  if (day === toDateInputValue(todayStart)) return `${formatTime(value)} WIB`;
  const yesterday = new Date(todayStart.getTime() - 12 * 60 * 60 * 1000);
  if (day === toDateInputValue(yesterday)) return "Kemarin";
  return formatDayMonth(value);
}

function orderMethodLabel(order: PaymentReviewAttempt["order"]) {
  if (order.method === "delivery") {
    return `Delivery · ongkir ${formatRupiah(order.shippingFee)}`;
  }
  const slot = order.pickupSlot;
  return slot
    ? `Pickup · ${formatWeekday(slot.startsAt)} ${formatTime(slot.startsAt)}–${formatTime(slot.endsAt)}`
    : "Pickup";
}

/** Server errors arrive as plain messages; validation errors as a JSON list of issues. */
function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("[")) {
    try {
      const [issue] = JSON.parse(message) as { message?: string }[];
      if (issue?.message) return issue.message;
    } catch {
      // Not JSON; fall through to the raw message.
    }
  }
  return message || "Terjadi kesalahan. Coba lagi.";
}

function PaymentReviewComponent() {
  const { batch, metrics, attempts, todayStart, merchantName } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [query, setQuery] = useState("");

  const pendingCount = metrics.pending;
  const metricCards = [
    {
      label: "MENUNGGU REVIEW",
      value: `${pendingCount} bukti`,
      detail:
        metrics.pendingBeforeToday > 0
          ? `${metrics.pendingBeforeToday} masuk sebelum hari ini`
          : "Semua masuk hari ini",
    },
    {
      label: "DISETUJUI HARI INI",
      value: String(metrics.approvedToday),
      detail: "Dengan referensi mutasi merchant",
    },
    {
      label: `DITOLAK · ${RECENT_REJECTION_DAYS} HARI`,
      value: String(metrics.rejectedRecent),
      detail: "Riwayat percobaan tersimpan",
    },
  ];

  const normalizedQuery = query.trim().toLowerCase();
  const visibleAttempts = attempts.filter((attempt) =>
    `${attempt.order.invoiceNumber} ${attempt.order.customerName} ${attempt.customerReference} ${attempt.merchantReference ?? ""}`
      .toLowerCase()
      .includes(normalizedQuery),
  );
  const selected = attempts.find(({ id }) => id === search.attempt) ?? attempts[0];

  const selectAttempt = (id: string) =>
    navigate({ search: { attempt: id }, replace: true, resetScroll: false });

  return (
    <AdminPage>
      <PageHeading
        eyebrow="UBELOOM  /  ADMIN  /  VERIFIKASI BAYAR"
        title="Verifikasi pembayaran"
        description="Cocokkan bukti dengan mutasi QRIS merchant sebelum menyetujui. Antrean mencakup semua batch."
        actions={
          batch ? (
            <BatchStatusPill
              label={`BATCH ${batch.name.toUpperCase()} · ${batchStatusLabels[batch.status]}`}
            />
          ) : undefined
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        {metricCards.map((metric) => (
          <CompactMetric key={metric.label} {...metric} />
        ))}
      </section>

      <p className="flex items-center gap-2.5 rounded-[10px] bg-vanilla px-[17px] py-[13px] text-[13px] font-semibold text-deep-ube">
        <ShieldCheck aria-hidden className="size-[18px] shrink-0" />
        Unggah bukti ≠ pembayaran lunas. Setujui hanya setelah nominal, waktu, merchant dan
        referensi transaksi cocok.
      </p>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <section className="flex flex-col gap-[11px] xl:w-[350px] xl:shrink-0">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-extrabold text-ink">Antrean bukti bayar</h2>
            <p className="text-xs font-bold text-deep-ube">
              {pendingCount} menunggu
              {metrics.resubmitted > 0 && ` · ${metrics.resubmitted} kirim ulang`}
            </p>
          </div>
          <label className="sr-only" htmlFor="payment-search">
            Cari invoice, pelanggan atau referensi
          </label>
          <input
            id="payment-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari invoice / referensi..."
            className={inputClassName}
          />
          {visibleAttempts.map((attempt) => (
            <PaymentReviewRow
              key={attempt.id}
              invoice={attempt.order.invoiceNumber}
              time={queueTime(attempt.createdAt, todayStart)}
              customer={shortName(attempt.order.customerName)}
              amount={formatRupiah(attempt.claimedAmount)}
              status={queueStatus(attempt)}
              selected={attempt.id === selected?.id}
              onSelect={() => selectAttempt(attempt.id)}
            />
          ))}
          {visibleAttempts.length === 0 && (
            <p className="py-4 text-center text-[13px] text-plum">
              {attempts.length === 0
                ? "Belum ada bukti bayar yang menunggu review."
                : "Tidak ada bukti bayar yang cocok."}
            </p>
          )}
        </section>

        {selected ? (
          // Keyed so the checklist and reference reset when another attempt is opened.
          <PaymentDetail key={selected.id} attempt={selected} merchantName={merchantName} />
        ) : (
          <section
            className={`${cardClassName} flex min-h-[200px] min-w-0 flex-1 items-center justify-center p-5 text-[13px] text-plum`}
          >
            Pilih bukti bayar dari antrean untuk ditinjau.
          </section>
        )}
      </div>

      <footer className="border-t border-ube-line pt-[13px] text-[13px] text-plum">
        <p className="max-w-[950px]">
          Peninjau, waktu, referensi merchant dan alasan penolakan disimpan. Transfer yang sama
          tidak dapat melunasi dua invoice.
        </p>
      </footer>
    </AdminPage>
  );
}

function PaymentDetail({
  attempt,
  merchantName,
}: {
  attempt: PaymentReviewAttempt;
  merchantName: string;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState<boolean[]>(() => paymentChecklist.map(() => false));
  const [merchantReference, setMerchantReference] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(rejectionReasons[0]);
  const [rejectNote, setRejectNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { order } = attempt;
  const pending = attempt.status === "pending";
  const amountMatches = attempt.claimedAmount === order.total;
  const cancelled = order.fulfillmentStatus === "cancelled";
  // Approval needs every check plus the verified merchant reference.
  const canApprove =
    pending &&
    amountMatches &&
    !cancelled &&
    checked.every(Boolean) &&
    merchantReference.trim() !== "";
  const badge = detailBadges[attempt.status];

  const comparison: [string, string][] = [
    ["Total invoice", formatRupiah(order.total)],
    [
      "Diklaim dibayar",
      `${formatRupiah(attempt.claimedAmount)} · ${formatDayMonth(attempt.claimedPaidAt)} ${formatTime(attempt.claimedPaidAt)}`,
    ],
    [
      "Merchant QRIS",
      merchantName ? `${merchantName} · cocokkan nama` : "Belum diatur di Pengaturan",
    ],
    ["Ref. pelanggan", attempt.customerReference],
    ["Mutasi merchant", attempt.merchantReference ?? "Belum dikonfirmasi"],
    ["Metode pesanan", orderMethodLabel(order)],
  ];

  async function run(action: () => Promise<unknown>, success: string) {
    setSubmitting(true);
    try {
      await action();
      toast.success(success);
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
      // The attempt may have been reviewed elsewhere; refresh the queue either way.
      await router.invalidate();
    } finally {
      setSubmitting(false);
    }
  }

  const approve = () =>
    run(
      () =>
        approvePayment({
          data: {
            attemptId: attempt.id,
            merchantReference: merchantReference.trim(),
            checklistConfirmed: true,
          },
        }),
      `Pembayaran ${order.invoiceNumber} disetujui.`,
    );

  const reject = () =>
    run(
      () =>
        rejectPayment({
          data: { attemptId: attempt.id, reason, note: rejectNote.trim() || undefined },
        }),
      `Bukti ${order.invoiceNumber} ditolak.`,
    );

  return (
    <section
      aria-labelledby="payment-detail-title"
      className={`${cardClassName} flex min-w-0 flex-1 flex-col gap-3.5 p-5`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-extrabold whitespace-pre text-plum">
            {`PERCOBAAN #${attempt.attempt}  /  INVOICE`}
          </p>
          <h2 id="payment-detail-title" className="text-base font-bold break-all text-ink">
            {order.invoiceNumber}
          </h2>
        </div>
        <StatusBadge tone={badge.tone} className="rounded-[7px] px-2.5 py-[7px]">
          {badge.label}
        </StatusBadge>
      </div>

      <div className="flex flex-col gap-3.5 sm:flex-row">
        {attempt.proofUrl ? (
          <a
            href={attempt.proofUrl}
            target="_blank"
            rel="noreferrer"
            className="block h-[200px] overflow-hidden rounded-[9px] bg-vanilla sm:w-[215px] sm:shrink-0"
          >
            {new URL(attempt.proofUrl).pathname.endsWith(".pdf") ? (
              <span className="flex size-full flex-col items-center justify-center gap-[9px]">
                <FileText aria-hidden className="size-[26px] text-deep-ube" />
                <span className="text-sm font-bold text-ink">Bukti PDF</span>
                <span className="text-xs text-plum">Buka di tab baru</span>
              </span>
            ) : (
              <img
                src={attempt.proofUrl}
                alt={`Bukti bayar ${order.invoiceNumber}`}
                className="size-full object-contain"
              />
            )}
          </a>
        ) : (
          <div className="flex h-[200px] flex-col items-center justify-center gap-[9px] rounded-[9px] bg-vanilla sm:w-[215px] sm:shrink-0">
            <Image aria-hidden className="size-[26px] text-deep-ube" />
            <p className="text-sm font-bold text-ink">Bukti bayar privat</p>
            <p className="text-xs text-plum">Belum ada gambar terlampir</p>
          </div>
        )}
        <dl className="flex min-w-0 flex-1 flex-col gap-2.5 text-xs">
          {comparison.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="shrink-0 text-plum">{label}</dt>
              <dd className="text-right font-bold break-all text-ink">{value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-plum">Pelanggan</dt>
            <dd className="text-right font-bold text-ink">
              {order.customerName} · {order.customerPhone}
            </dd>
          </div>
        </dl>
      </div>

      {pending && cancelled && (
        <p className="flex items-center gap-2 rounded-[9px] bg-[#fff1d3] px-3.5 py-2.5 text-xs font-semibold text-[#855814]">
          <AlertTriangle aria-hidden className="size-3.5 shrink-0" />
          Pesanan ini sudah dibatalkan. Tolak bukti dan proses pengembalian dana bila perlu.
        </p>
      )}

      {pending && !amountMatches && (
        <p className="flex items-center gap-2 rounded-[9px] bg-[#fff1d3] px-3.5 py-2.5 text-xs font-semibold text-[#855814]">
          <AlertTriangle aria-hidden className="size-3.5 shrink-0" />
          Nominal diklaim berbeda {formatRupiah(Math.abs(order.total - attempt.claimedAmount))} dari
          total invoice. Tolak dan minta bukti ulang.
        </p>
      )}

      {!pending && (
        <p className="rounded-[9px] bg-vanilla px-3.5 py-2.5 text-xs text-plum">
          {attempt.status === "rejected" ? "Ditolak" : "Disetujui"}
          {attempt.reviewedBy ? ` oleh ${attempt.reviewedBy}` : ""}
          {attempt.reviewedAt
            ? ` · ${formatDayMonth(attempt.reviewedAt)} ${formatTime(attempt.reviewedAt)} WIB`
            : ""}
          {attempt.reviewNote ? ` — ${attempt.reviewNote}` : ""}.
          {attempt.status === "rejected" && " Menunggu bukti ulang dari pelanggan."}
        </p>
      )}

      {pending && (
        <>
          <div
            role="group"
            aria-labelledby="approval-checklist-title"
            className="flex flex-col gap-[9px] rounded-[9px] bg-vanilla p-3.5"
          >
            <h3 id="approval-checklist-title" className="text-sm font-extrabold text-ink">
              Sebelum menyetujui
            </h3>
            {paymentChecklist.map((item, index) => (
              <label
                key={item}
                className="flex cursor-pointer items-center gap-2 text-xs text-plum"
              >
                <span className="relative flex size-3.5 shrink-0">
                  <input
                    type="checkbox"
                    checked={checked[index]}
                    onChange={(event) =>
                      setChecked((current) =>
                        current.map((value, i) => (i === index ? event.target.checked : value)),
                      )
                    }
                    className="peer size-3.5 cursor-pointer appearance-none rounded-[3px] border border-deep-ube bg-transparent checked:bg-deep-ube focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ube-pop"
                  />
                  <Check
                    aria-hidden
                    strokeWidth={3}
                    className="pointer-events-none absolute inset-0 m-auto size-2.5 text-vanilla opacity-0 peer-checked:opacity-100"
                  />
                </span>
                {item}
              </label>
            ))}
          </div>

          <label className="sr-only" htmlFor="merchant-reference">
            Referensi merchant terverifikasi
          </label>
          <input
            id="merchant-reference"
            value={merchantReference}
            onChange={(event) => setMerchantReference(event.target.value)}
            placeholder="Masukkan referensi merchant terverifikasi (wajib saat setuju)"
            className={inputClassName}
          />

          {rejecting && (
            <div
              role="group"
              aria-labelledby="reject-title"
              className="flex flex-col gap-2 rounded-[9px] border border-ube-line bg-white p-3.5"
            >
              <h3 id="reject-title" className="text-sm font-extrabold text-ink">
                Alasan penolakan
              </h3>
              <label className="sr-only" htmlFor="reject-reason">
                Alasan
              </label>
              <select
                id="reject-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className={inputClassName}
              >
                {rejectionReasons.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
              <label className="sr-only" htmlFor="reject-note">
                Catatan untuk pelanggan
              </label>
              <textarea
                id="reject-note"
                value={rejectNote}
                onChange={(event) => setRejectNote(event.target.value)}
                rows={2}
                placeholder="Catatan untuk pelanggan (opsional)"
                className={`${inputClassName} h-auto py-2`}
              />
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2.5">
            {rejecting ? (
              <>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setRejecting(false)}
                  className="rounded-full px-4 py-[11px] text-[13px] font-bold text-plum transition-colors hover:text-deep-ube disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={reject}
                  className="rounded-full border border-deep-ube bg-surface px-4 py-[11px] text-[13px] font-bold text-deep-ube transition-colors hover:bg-vanilla disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Konfirmasi tolak
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={() => setRejecting(true)}
                className="rounded-full border border-deep-ube bg-surface px-4 py-[11px] text-[13px] font-bold text-deep-ube transition-colors hover:bg-vanilla disabled:cursor-not-allowed disabled:opacity-50"
              >
                Tolak dengan alasan
              </button>
            )}
            <button
              type="button"
              disabled={!canApprove || submitting || rejecting}
              onClick={approve}
              className="rounded-full bg-deep-ube px-4 py-[11px] text-[13px] font-bold text-vanilla transition-colors not-disabled:hover:bg-ube-pop disabled:cursor-not-allowed disabled:opacity-50"
            >
              Setujui pembayaran
            </button>
          </div>
        </>
      )}
    </section>
  );
}
