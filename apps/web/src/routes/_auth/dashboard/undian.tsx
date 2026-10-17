import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, Check } from "lucide-react";
import { type ReactNode, useState } from "react";

import { AdminPage, BatchStatusPill, PageHeading } from "@/components/admin/admin-page";
import { CompactMetric } from "@/components/admin/metric-card";

export const Route = createFileRoute("/_auth/dashboard/undian")({
  head: () => ({
    meta: [{ title: "Undian invoice · ubeloom" }],
  }),
  component: DrawComponent,
});

// Sample data until batches, invoices and draws live in the database.
const batch = {
  name: "Oktober 2026",
  isOpen: true,
  cutoffDate: "23 Okt",
  cutoffTime: "20.00 WIB",
};

const pool = {
  paid: 42,
  optedIn: 31,
  unpaid: 12,
  inReview: 7,
};

const initialRules = {
  entryRule: "1 per invoice lunas + opt-in",
  verificationDeadline: "23 Okt 2026 · 20.00 WIB",
  claimDeadline: "30 Okt 2026 · 20.00 WIB",
};

const initialPrizes = ["Paket ubeloom", "Voucher Rp 50.000", "Merchandise"];

const executionSteps = [
  "Selesaikan antrean verifikasi & cutoff",
  "Bekukan daftar invoice dan versi aturan",
  "Cek ulang kelayakan, acak aman di server",
  "Simpan hasil sekali sebelum ditampilkan",
];

const maxWinners = 10;

const cardClassName = "rounded-[13px] p-5";
const fieldBoxClassName =
  "flex w-full items-center gap-1 rounded-lg bg-vanilla px-3 py-[9px] text-xs/[15px] font-bold text-ink transition-shadow focus-within:ring-2 focus-within:ring-ube-pop/30";
const fieldInputClassName = "min-w-0 flex-1 bg-transparent outline-none";

function DrawComponent() {
  const [rules, setRules] = useState(initialRules);
  const [prizes, setPrizes] = useState(initialPrizes);
  const [completedSteps, setCompletedSteps] = useState(0);

  const freezeBlocker = batch.isOpen
    ? "tersedia setelah cutoff"
    : pool.inReview > 0
      ? "antrean review harus nol"
      : undefined;

  const setRule = (key: keyof typeof initialRules) => (value: string) =>
    setRules((current) => ({ ...current, [key]: value }));

  const setWinnerCount = (value: number) => {
    const count = Math.min(Math.max(Math.trunc(value) || 1, 1), maxWinners);
    setPrizes((current) =>
      Array.from({ length: count }, (_, index) => current[index] ?? initialPrizes[index] ?? ""),
    );
  };

  return (
    <AdminPage>
      <PageHeading
        eyebrow="UBELOOM  /  ADMIN  /  UNDIAN"
        title="Undian invoice"
        description="Bekukan entri yang memenuhi syarat, lalu simpan hasil secara aman."
        actions={<BatchStatusPill />}
      />

      {batch.isOpen && (
        <div className="flex items-center gap-[11px] rounded-xl bg-vanilla px-[19px] py-[15px]">
          <CalendarClock aria-hidden className="size-5 shrink-0 text-deep-ube" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-[15px] font-extrabold text-ink">
              Batch Oktober masih dibuka — undian belum dapat dijalankan
            </p>
            <p className="text-[11px] text-plum">
              Selesaikan preorder, batas pembayaran dan verifikasi dulu. Pool final baru dibekukan
              setelah cutoff.
            </p>
          </div>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CompactMetric
          label="LUNAS & OPT-IN"
          value={String(pool.optedIn)}
          detail="Sementara, masih berubah"
          valueClassName="text-[22px]/[1.25]"
        />
        <CompactMetric
          label="ANTREAN REVIEW"
          value={String(pool.inReview)}
          detail="Wajib nol sebelum freeze"
          valueClassName="text-[22px]/[1.25]"
        />
        <CompactMetric
          label="HADIAH"
          value={String(prizes.length)}
          detail="Pemenang unik"
          valueClassName="text-[22px]/[1.25]"
        />
        <CompactMetric
          label="CUTOFF RENCANA"
          value={batch.cutoffDate}
          detail={batch.cutoffTime}
          valueClassName="text-[22px]/[1.25]"
        />
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[540fr_446fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <section
            className={`${cardClassName} flex flex-col gap-[13px] border border-ube-line bg-surface`}
          >
            <h2 className="text-lg font-extrabold text-ink">Aturan &amp; hadiah</h2>
            <Field id="draw-batch" label="Batch" help="Hanya invoice dari batch ini">
              <input
                id="draw-batch"
                aria-describedby="draw-batch-help"
                value={batch.name}
                readOnly
                className={fieldInputClassName}
              />
            </Field>
            <Field
              id="draw-entry-rule"
              aria-describedby="draw-entry-rule-help"
              label="Aturan entri"
              help="Minimum nilai / batas per WhatsApp perlu konfirmasi"
            >
              <input
                id="draw-entry-rule"
                value={rules.entryRule}
                onChange={(event) => setRule("entryRule")(event.target.value)}
                className={fieldInputClassName}
              />
            </Field>
            <Field
              id="draw-verification-deadline"
              aria-describedby="draw-verification-deadline-help"
              label="Batas verifikasi"
              help="Setelah preorder dan pembayaran ditutup"
            >
              <input
                id="draw-verification-deadline"
                value={rules.verificationDeadline}
                onChange={(event) => setRule("verificationDeadline")(event.target.value)}
                className={fieldInputClassName}
              />
            </Field>
            <Field
              id="draw-winner-count"
              aria-describedby="draw-winner-count-help"
              label="Jumlah pemenang"
              help="Setiap invoice menang maksimal sekali"
            >
              <input
                id="draw-winner-count"
                type="number"
                min={1}
                max={maxWinners}
                value={prizes.length}
                onChange={(event) => setWinnerCount(event.target.valueAsNumber)}
                className="w-[2ch] [appearance:textfield] bg-transparent outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span>hadiah</span>
            </Field>
            <Field
              id="draw-claim-deadline"
              aria-describedby="draw-claim-deadline-help"
              label="Batas klaim"
              help="Klaim lewat kontak pesanan tersimpan"
            >
              <input
                id="draw-claim-deadline"
                value={rules.claimDeadline}
                onChange={(event) => setRule("claimDeadline")(event.target.value)}
                className={fieldInputClassName}
              />
            </Field>
          </section>

          <section
            className={`${cardClassName} flex flex-col gap-2.5 border border-ube-line bg-surface`}
          >
            <h2 className="text-base font-extrabold text-ink">Hadiah yang dipublikasikan</h2>
            <ol className="flex flex-col gap-2.5">
              {prizes.map((prize, index) => {
                const rank = String(index + 1).padStart(2, "0");
                return (
                  <li key={rank} className="flex items-center justify-between gap-4 text-[11px]">
                    <span className="font-extrabold text-deep-ube">{rank}</span>
                    <input
                      aria-label={`Hadiah ${rank}`}
                      value={prize}
                      placeholder="Nama hadiah"
                      onChange={(event) =>
                        setPrizes((current) =>
                          current.map((name, i) => (i === index ? event.target.value : name)),
                        )
                      }
                      className="min-w-0 flex-1 rounded bg-transparent text-right font-bold text-ink outline-none placeholder:text-plum focus-visible:ring-2 focus-visible:ring-ube-pop/30"
                    />
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section className={`${cardClassName} flex flex-col gap-[13px] bg-vanilla`}>
            <h2 className="text-[10px] font-extrabold text-deep-ube">
              PRATINJAU · BELUM DIBEKUKAN
            </h2>
            <p className="text-[31px]/[1.2] font-extrabold text-deep-ube">{pool.optedIn} invoice</p>
            <p className="text-[11px]/[1.45] text-plum">
              Angka ini dapat berubah. Pool final hanya memuat pesanan lunas, opt-in, bukan test,
              dan tidak dibatalkan atau refund.
            </p>
            <hr className="border-ube-line" />
            <dl className="flex flex-col gap-[13px]">
              <PoolCount label="Invoice lunas" value={pool.paid} />
              <PoolCount label="Opt-in undian" value={pool.optedIn} />
              <PoolCount label="Belum dibayar" value={pool.unpaid} />
              <PoolCount label="Perlu review" value={pool.inReview} />
            </dl>
          </section>

          <section className={`${cardClassName} flex flex-col gap-3 border border-ube-line`}>
            <h2 className="text-[17px] font-extrabold text-ink">Alur eksekusi aman</h2>
            {/* Steps are ticked in order; unticking one also unticks the steps after it. */}
            <ol className="flex flex-col gap-3">
              {executionSteps.map((step, index) => {
                const done = index < completedSteps;
                return (
                  <li key={step}>
                    <label
                      className={`flex w-fit items-center gap-2.5 ${index > completedSteps ? "cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <input
                        type="checkbox"
                        checked={done}
                        disabled={index > completedSteps}
                        onChange={() => setCompletedSteps(done ? index : index + 1)}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden
                        className={`flex size-[22px] shrink-0 items-center justify-center rounded-md text-[10px] font-extrabold transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ube-pop/40 ${done ? "bg-deep-ube text-vanilla" : "bg-ube-gold text-ink"}`}
                      >
                        {done ? <Check className="size-3" strokeWidth={3} /> : index + 1}
                      </span>
                      <span
                        className={`text-[11px] font-semibold ${done ? "text-ink" : "text-plum"}`}
                      >
                        {step}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ol>
          </section>

          <button
            type="button"
            disabled={freezeBlocker !== undefined}
            className="rounded-full border border-transparent bg-deep-ube px-4 py-3 text-[11px] font-bold text-vanilla transition-colors enabled:hover:bg-ube-pop disabled:cursor-not-allowed disabled:border-ube-line disabled:bg-vanilla disabled:text-plum"
          >
            {freezeBlocker ? `Bekukan entri · ${freezeBlocker}` : "Bekukan entri"}
          </button>
        </div>
      </div>

      <footer className="border-t border-ube-line pt-[13px]">
        <p className="max-w-[900px] text-[11px] text-plum">
          Hasil publik hanya menampilkan nomor invoice dan hadiah. Reviewer melihat agregat; kontak,
          bukti dan tautan privat tetap tersembunyi.
        </p>
      </footer>
    </AdminPage>
  );
}

function Field({
  id,
  label,
  help,
  children,
}: {
  id: string;
  label: string;
  help: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[5px]">
      <label htmlFor={id} className="text-[10px] font-bold text-plum">
        {label}
      </label>
      <div className={fieldBoxClassName}>{children}</div>
      <p id={`${id}-help`} className="text-[10px] text-plum">
        {help}
      </p>
    </div>
  );
}

function PoolCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[11px] text-plum">{label}</dt>
      <dd className="text-xs font-extrabold text-ink">{value}</dd>
    </div>
  );
}
