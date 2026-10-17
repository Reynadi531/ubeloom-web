import { createFileRoute } from "@tanstack/react-router";
import { Check, Image, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { AdminPage, BatchStatusPill, PageHeading } from "@/components/admin/admin-page";
import { CompactMetric } from "@/components/admin/metric-card";
import { PaymentReviewRow } from "@/components/admin/payment-review/payment-review-row";
import { StatusBadge } from "@/components/admin/status-badge";

export const Route = createFileRoute("/_auth/dashboard/verifikasi-bayar")({
  head: () => ({
    meta: [{ title: "Verifikasi pembayaran · ubeloom" }],
  }),
  component: PaymentReviewComponent,
});

type PaymentAttempt = {
  invoice: string;
  attempt: number;
  time: string;
  customer: string;
  amount: string;
  status: string;
  claimed: string;
  customerReference: string;
  merchantMutation: string;
  orderMethod: string;
};

// Sample data until payment attempts live in the database.
const metrics: { label: string; value: string; detail: string }[] = [
  { label: "MENUNGGU REVIEW", value: "7 bukti", detail: "3 perlu ditangani hari ini" },
  { label: "DISETUJUI HARI INI", value: "12", detail: "Mutasi merchant cocok" },
  { label: "DITOLAK", value: "2", detail: "Riwayat percobaan tersimpan" },
];

const attempts: PaymentAttempt[] = [
  {
    invoice: "UBP-20261016-A7K9M2Q4",
    attempt: 1,
    time: "09.46 WIB",
    customer: "Rani A.",
    amount: "Rp 168.000",
    status: "Perlu review",
    claimed: "Rp 168.000 · 16 Okt 09.46",
    customerReference: "TRX-948231",
    merchantMutation: "Belum dikonfirmasi",
    orderMethod: "Delivery · ongkir Rp 8.000",
  },
  {
    invoice: "UBP-20261016-D8P4L1S3",
    attempt: 1,
    time: "10.12 WIB",
    customer: "Bima R.",
    amount: "Rp 224.000",
    status: "Perlu review",
    claimed: "Rp 224.000 · 16 Okt 10.12",
    customerReference: "TRX-948377",
    merchantMutation: "Belum dikonfirmasi",
    orderMethod: "Pickup · Sabtu 10.00–15.00",
  },
  {
    invoice: "UBP-20261016-M4V6C9T1",
    attempt: 2,
    time: "08.31 WIB",
    customer: "Aditya P.",
    amount: "Rp 280.000",
    status: "Bukti ulang",
    claimed: "Rp 280.000 · 16 Okt 08.31",
    customerReference: "TRX-947905",
    merchantMutation: "Belum dikonfirmasi",
    orderMethod: "Delivery · ongkir Rp 12.000",
  },
  {
    invoice: "UBP-20261016-E8R5S2P7",
    attempt: 2,
    time: "Kemarin",
    customer: "Sinta M.",
    amount: "Rp 92.000",
    status: "Ditolak sebelumnya",
    claimed: "Rp 92.000 · 15 Okt 19.20",
    customerReference: "TRX-946112",
    merchantMutation: "Belum dikonfirmasi",
    orderMethod: "Pickup · Sabtu 10.00–15.00",
  },
];

const checklist = [
  "Nominal dan mata uang cocok dengan invoice",
  "Mutasi merchant diterima dan waktunya sesuai",
  "Referensi transaksi belum dipakai invoice lain",
];

const cardClassName = "rounded-[14px] border border-ube-line bg-surface";
const inputClassName =
  "h-10 w-full rounded-lg border border-ube-line px-3 text-[11px] text-ink outline-none placeholder:text-plum focus:border-ube-pop";

function PaymentReviewComponent() {
  const [query, setQuery] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState(attempts[0].invoice);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleAttempts = attempts.filter(({ invoice, customerReference }) =>
    `${invoice} ${customerReference}`.toLowerCase().includes(normalizedQuery),
  );
  const selected = attempts.find(({ invoice }) => invoice === selectedInvoice) ?? attempts[0];

  return (
    <AdminPage>
      <PageHeading
        eyebrow="UBELOOM  /  ADMIN  /  VERIFIKASI BAYAR"
        title="Verifikasi pembayaran"
        description="Cocokkan bukti dengan mutasi QRIS merchant sebelum menyetujui."
        actions={<BatchStatusPill />}
      />

      <section className="grid gap-3 sm:grid-cols-3">
        {metrics.map((metric) => (
          <CompactMetric key={metric.label} {...metric} />
        ))}
      </section>

      <p className="flex items-center gap-2.5 rounded-[10px] bg-vanilla px-[17px] py-[13px] text-[11px] font-semibold text-deep-ube">
        <ShieldCheck aria-hidden className="size-[18px] shrink-0" />
        Unggah bukti ≠ pembayaran lunas. Setujui hanya setelah nominal, waktu, merchant dan
        referensi transaksi cocok.
      </p>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <section className="flex flex-col gap-[11px] xl:w-[350px] xl:shrink-0">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-extrabold text-ink">Antrean bukti bayar</h2>
            <p className="text-[10px] font-bold text-deep-ube">7 baru</p>
          </div>
          <label className="sr-only" htmlFor="payment-search">
            Cari invoice atau referensi
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
              key={attempt.invoice}
              {...attempt}
              selected={attempt.invoice === selected.invoice}
              onSelect={() => setSelectedInvoice(attempt.invoice)}
            />
          ))}
          {visibleAttempts.length === 0 && (
            <p className="py-4 text-center text-[11px] text-plum">
              Tidak ada bukti bayar yang cocok.
            </p>
          )}
        </section>

        {/* Keyed so the checklist and reference reset when another attempt is opened. */}
        <PaymentDetail key={selected.invoice} attempt={selected} />
      </div>

      <footer className="border-t border-ube-line pt-[13px] text-[11px] text-plum">
        <p className="max-w-[950px]">
          Peninjau, waktu, referensi merchant dan alasan penolakan disimpan. Transfer yang sama
          tidak dapat melunasi dua invoice.
        </p>
      </footer>
    </AdminPage>
  );
}

function PaymentDetail({ attempt }: { attempt: PaymentAttempt }) {
  const [checked, setChecked] = useState<boolean[]>(() => checklist.map(() => false));
  const [merchantReference, setMerchantReference] = useState("");

  // Approval needs every check plus the verified merchant reference.
  const canApprove = checked.every(Boolean) && merchantReference.trim() !== "";

  const comparison: [string, string][] = [
    ["Total invoice", attempt.amount],
    ["Diklaim dibayar", attempt.claimed],
    ["Merchant QRIS", "ubeloom · cocokkan nama"],
    ["Ref. pelanggan", attempt.customerReference],
    ["Mutasi merchant", attempt.merchantMutation],
    ["Metode pesanan", attempt.orderMethod],
  ];

  return (
    <section
      aria-labelledby="payment-detail-title"
      className={`${cardClassName} flex min-w-0 flex-1 flex-col gap-3.5 p-5`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[10px] font-extrabold whitespace-pre text-plum">
            {`PERCOBAAN #${attempt.attempt}  /  INVOICE`}
          </p>
          <h2 id="payment-detail-title" className="text-base font-bold break-all text-ink">
            {attempt.invoice}
          </h2>
        </div>
        <StatusBadge tone="gold" className="rounded-[7px] px-2.5 py-[7px]">
          UNDER REVIEW
        </StatusBadge>
      </div>

      <div className="flex flex-col gap-3.5 sm:flex-row">
        <div className="flex h-[200px] flex-col items-center justify-center gap-[9px] rounded-[9px] bg-vanilla sm:w-[215px] sm:shrink-0">
          <Image aria-hidden className="size-[26px] text-deep-ube" />
          <p className="text-xs font-bold text-ink">Bukti bayar privat</p>
          <p className="text-[10px] text-plum">JPG/PNG · maks. 5 MB</p>
        </div>
        <dl className="flex min-w-0 flex-1 flex-col gap-2.5 text-[10px]">
          {comparison.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="shrink-0 text-plum">{label}</dt>
              <dd className="text-right font-bold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div
        role="group"
        aria-labelledby="approval-checklist-title"
        className="flex flex-col gap-[9px] rounded-[9px] bg-vanilla p-3.5"
      >
        <h3 id="approval-checklist-title" className="text-xs font-extrabold text-ink">
          Sebelum menyetujui
        </h3>
        {checklist.map((item, index) => (
          <label
            key={item}
            className="flex cursor-pointer items-center gap-2 text-[10px] text-plum"
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

      <div className="flex flex-wrap justify-end gap-2.5">
        <button
          type="button"
          className="rounded-full border border-deep-ube bg-surface px-4 py-[11px] text-[11px] font-bold text-deep-ube transition-colors hover:bg-vanilla"
        >
          Tolak dengan alasan
        </button>
        <button
          type="button"
          disabled={!canApprove}
          className="rounded-full bg-deep-ube px-4 py-[11px] text-[11px] font-bold text-vanilla transition-colors not-disabled:hover:bg-ube-pop disabled:cursor-not-allowed disabled:opacity-50"
        >
          Setujui pembayaran
        </button>
      </div>
    </section>
  );
}
