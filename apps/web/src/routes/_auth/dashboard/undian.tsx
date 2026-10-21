import { createFileRoute, useRouter } from "@tanstack/react-router";
import { CalendarClock, Check, Ticket } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AdminPage, BatchStatusPill, PageHeading } from "@/components/admin/admin-page";
import { CompactMetric } from "@/components/admin/metric-card";
import { createDraw, freezeDraw, getDrawPage, runDraw, saveDrawRules } from "@/functions/draw";
import { formatDateTime, formatDayMonth, formatLongDate, formatTime } from "@/lib/format";

export const Route = createFileRoute("/_auth/dashboard/undian")({
  validateSearch: z.object({ batch: z.string().optional() }),
  loaderDeps: ({ search }) => ({ batchId: search.batch }),
  loader: ({ deps }) => getDrawPage({ data: deps }),
  head: () => ({
    meta: [{ title: "Undian invoice · ubeloom" }],
  }),
  component: DrawComponent,
});

type DrawPage = Awaited<ReturnType<typeof getDrawPage>>;
type BatchInfo = NonNullable<DrawPage["batch"]>;
type Pool = Extract<DrawPage, { pool: object }>["pool"];
type Draw = NonNullable<Extract<DrawPage, { pool: object }>["draw"]>;

const executionSteps = [
  "Selesaikan antrean verifikasi & cutoff",
  "Bekukan daftar invoice dan versi aturan",
  "Cek ulang kelayakan, acak aman di server",
  "Simpan hasil sekali sebelum ditampilkan",
];

const batchStatusLabels: Record<BatchInfo["status"], string> = {
  draft: "DRAF",
  open: "DIBUKA",
  closed: "DITUTUP",
  archived: "DIARSIPKAN",
};

const cardClassName = "rounded-[13px] p-5";
const fieldBoxClassName =
  "flex w-full items-center gap-1 rounded-lg bg-vanilla px-3 py-[9px] text-sm/[15px] font-bold text-ink transition-shadow focus-within:ring-2 focus-within:ring-ube-pop/30";
const fieldInputClassName = "min-w-0 flex-1 bg-transparent outline-none";
const primaryButtonClassName =
  "rounded-full border border-transparent bg-deep-ube px-4 py-3 text-[13px] font-bold text-vanilla transition-colors enabled:hover:bg-ube-pop disabled:cursor-not-allowed disabled:border-ube-line disabled:bg-vanilla disabled:text-plum";

const wibInputFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** `yyyy-mm-ddThh:mm` in WIB for `<input type="datetime-local">`. */
const toDateTimeInputValue = (value: Date) => wibInputFormatter.format(value).replace(" ", "T");

/** Parses a `datetime-local` value as WIB. */
const fromDateTimeInputValue = (value: string) => new Date(`${value}:00+07:00`);

/** "23 Okt 2026 · 20.00 WIB" */
const formatDeadline = (value: Date) =>
  `${formatLongDate(value).replace(/ (\S+) /, (_, month: string) => ` ${month.slice(0, 3)} `)} · ${formatTime(value)} WIB`;

const errorMessage = (error: unknown) =>
  error instanceof Error && error.message ? error.message : "Terjadi kesalahan. Coba lagi.";

function DrawComponent() {
  const page = Route.useLoaderData();

  if (!page.batch) {
    return (
      <AdminPage>
        <DrawHeading />
        <Notice
          title="Belum ada batch preorder"
          description="Undian invoice tersedia setelah batch dibuat dan preorder berjalan."
        />
      </AdminPage>
    );
  }

  const { batch, pool, draw } = page;

  return (
    <AdminPage>
      <DrawHeading
        status={
          <BatchStatusPill
            label={`BATCH ${batch.name.toUpperCase()} · ${batchStatusLabels[batch.status]}`}
          />
        }
      />

      {!batch.cutoffPassed && (draw === null || draw.status === "draft") && (
        <Notice
          title={`Batch ${batch.name} masih dibuka — undian belum dapat dijalankan`}
          description="Selesaikan preorder, batas pembayaran dan verifikasi dulu. Pool final baru dibekukan setelah cutoff."
        />
      )}

      {draw ? (
        <DrawWorkspace
          // Remount the form whenever the saved rules or status change.
          key={`${draw.id}-${draw.rulesVersion}-${draw.status}`}
          batch={batch}
          pool={pool}
          draw={draw}
        />
      ) : (
        <CreateDraw batch={batch} pool={pool} />
      )}

      <footer className="border-t border-ube-line pt-[13px]">
        <p className="max-w-[900px] text-[13px] text-plum">
          Hasil publik hanya menampilkan nomor invoice dan hadiah. Reviewer melihat agregat; kontak,
          bukti dan tautan privat tetap tersembunyi.
        </p>
      </footer>
    </AdminPage>
  );
}

function DrawHeading({ status }: { status?: ReactNode }) {
  return (
    <PageHeading
      eyebrow="UBELOOM  /  ADMIN  /  UNDIAN"
      title="Undian invoice"
      description="Bekukan entri yang memenuhi syarat, lalu simpan hasil secara aman."
      actions={status}
    />
  );
}

function Notice({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-[11px] rounded-xl bg-vanilla px-[19px] py-[15px]">
      <CalendarClock aria-hidden className="size-5 shrink-0 text-deep-ube" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[15px] font-extrabold text-ink">{title}</p>
        <p className="text-[13px] text-plum">{description}</p>
      </div>
      {action}
    </div>
  );
}

function CreateDraw({ batch, pool }: { batch: BatchInfo; pool: Pool }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const create = async () => {
    setPending(true);
    try {
      await createDraw({ data: { batchId: batch.id } });
      toast.success("Undian dibuat sebagai draf.");
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PoolMetrics batch={batch} pool={pool} prizeCount={0} />
      <Notice
        title={`Belum ada undian untuk Batch ${batch.name}`}
        description="Buat draf dengan aturan dan hadiah bawaan, lalu sesuaikan sebelum pool dibekukan."
        action={
          <button
            type="button"
            onClick={create}
            disabled={pending}
            className={`${primaryButtonClassName} flex items-center gap-2`}
          >
            <Ticket aria-hidden className="size-3.5" />
            {pending ? "Membuat…" : "Buat undian"}
          </button>
        }
      />
    </>
  );
}

function PoolMetrics({
  batch,
  pool,
  prizeCount,
  frozenPoolSize,
}: {
  batch: BatchInfo;
  pool: Pool;
  prizeCount: number;
  frozenPoolSize?: number | null;
}) {
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <CompactMetric
        label="LUNAS & OPT-IN"
        value={String(frozenPoolSize ?? pool.optedIn)}
        detail={frozenPoolSize == null ? "Sementara, masih berubah" : "Pool dibekukan"}
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
        value={String(prizeCount)}
        detail="Pemenang unik"
        valueClassName="text-[22px]/[1.25]"
      />
      <CompactMetric
        label="CUTOFF RENCANA"
        value={formatDayMonth(batch.freezeOpensAt)}
        detail={`${formatTime(batch.freezeOpensAt)} WIB`}
        valueClassName="text-[22px]/[1.25]"
      />
    </section>
  );
}

function DrawWorkspace({ batch, pool, draw }: { batch: BatchInfo; pool: Pool; draw: Draw }) {
  const router = useRouter();
  const editable = draw.status === "draft";
  const initialRules = {
    entryRule: draw.entryRule,
    verificationDeadline: toDateTimeInputValue(draw.verificationDeadline),
    claimDeadline: toDateTimeInputValue(draw.claimDeadline),
  };
  const initialPrizes = draw.prizes.map(({ name }) => name);
  const [rules, setRules] = useState(initialRules);
  const [prizes, setPrizes] = useState(initialPrizes);
  const [pending, setPending] = useState<"save" | "freeze" | "draw" | null>(null);

  const dirty =
    rules.entryRule !== initialRules.entryRule ||
    rules.verificationDeadline !== initialRules.verificationDeadline ||
    rules.claimDeadline !== initialRules.claimDeadline ||
    prizes.length !== initialPrizes.length ||
    prizes.some((name, index) => name !== initialPrizes[index]);

  const setRule = (key: keyof typeof initialRules) => (value: string) =>
    setRules((current) => ({ ...current, [key]: value }));

  const setWinnerCount = (value: number) => {
    const count = Math.min(Math.max(Math.trunc(value) || 1, 1), draw.maxWinners);
    setPrizes((current) => Array.from({ length: count }, (_, index) => current[index] ?? ""));
  };

  const run = async (kind: "save" | "freeze" | "draw", action: () => Promise<string>) => {
    setPending(kind);
    try {
      toast.success(await action());
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(null);
    }
  };

  const save = () =>
    run("save", async () => {
      if (!rules.verificationDeadline || !rules.claimDeadline) {
        throw new Error("Isi batas verifikasi dan batas klaim.");
      }
      const result = await saveDrawRules({
        data: {
          drawId: draw.id,
          entryRule: rules.entryRule,
          verificationDeadline: fromDateTimeInputValue(rules.verificationDeadline),
          claimDeadline: fromDateTimeInputValue(rules.claimDeadline),
          prizes,
        },
      });
      return result.changed
        ? `Aturan disimpan · versi ${result.rulesVersion}.`
        : "Tidak ada perubahan aturan.";
    });

  const freeze = () => {
    if (
      !window.confirm(
        "Bekukan pool sekarang? Daftar invoice dan aturan tidak dapat diubah setelah dibekukan.",
      )
    ) {
      return;
    }
    run("freeze", async () => {
      const result = await freezeDraw({ data: { drawId: draw.id } });
      return `Pool dibekukan · ${result.poolSize} invoice.`;
    });
  };

  const execute = () => {
    if (
      !window.confirm("Jalankan undian sekarang? Hasil disimpan sekali dan tidak dapat diulang.")
    ) {
      return;
    }
    run("draw", async () => {
      const result = await runDraw({ data: { drawId: draw.id } });
      return result.excluded > 0
        ? `${result.winners} pemenang tersimpan · ${result.excluded} invoice gugur saat cek ulang.`
        : `${result.winners} pemenang tersimpan.`;
    });
  };

  const freezeBlocker = dirty ? "simpan aturan dulu" : draw.freezeBlocker;
  const completedSteps =
    draw.status === "drawn" ? 4 : draw.status === "frozen" ? 2 : draw.freezeBlocker ? 0 : 1;

  return (
    <>
      <PoolMetrics
        batch={batch}
        pool={pool}
        prizeCount={prizes.length}
        frozenPoolSize={draw.frozenPoolSize}
      />

      <div className="grid items-start gap-4 xl:grid-cols-[540fr_446fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <section
            className={`${cardClassName} flex flex-col gap-[13px] border border-ube-line bg-surface`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold text-ink">Aturan &amp; hadiah</h2>
              <p className="font-data text-xs font-bold text-plum">
                VERSI {draw.rulesVersion}
                {editable ? "" : " · TERKUNCI"}
              </p>
            </div>
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
              label="Aturan entri"
              help="Minimum nilai / batas per WhatsApp perlu konfirmasi"
            >
              <input
                id="draw-entry-rule"
                aria-describedby="draw-entry-rule-help"
                value={rules.entryRule}
                readOnly={!editable}
                onChange={(event) => setRule("entryRule")(event.target.value)}
                className={fieldInputClassName}
              />
            </Field>
            <Field
              id="draw-verification-deadline"
              label="Batas verifikasi"
              help="Setelah preorder dan pembayaran ditutup"
            >
              <DeadlineInput
                id="draw-verification-deadline"
                editable={editable}
                value={rules.verificationDeadline}
                saved={draw.verificationDeadline}
                onChange={setRule("verificationDeadline")}
              />
            </Field>
            <Field
              id="draw-winner-count"
              label="Jumlah pemenang"
              help="Setiap invoice menang maksimal sekali"
            >
              <input
                id="draw-winner-count"
                aria-describedby="draw-winner-count-help"
                type="number"
                min={1}
                max={draw.maxWinners}
                value={prizes.length}
                readOnly={!editable}
                onChange={(event) => setWinnerCount(event.target.valueAsNumber)}
                className="w-[2ch] [appearance:textfield] bg-transparent outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span>hadiah</span>
            </Field>
            <Field
              id="draw-claim-deadline"
              label="Batas klaim"
              help="Klaim lewat kontak pesanan tersimpan"
            >
              <DeadlineInput
                id="draw-claim-deadline"
                editable={editable}
                value={rules.claimDeadline}
                saved={draw.claimDeadline}
                onChange={setRule("claimDeadline")}
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
                  <li key={rank} className="flex items-center justify-between gap-4 text-[13px]">
                    <span className="font-extrabold text-deep-ube">{rank}</span>
                    <input
                      aria-label={`Hadiah ${rank}`}
                      value={prize}
                      placeholder="Nama hadiah"
                      readOnly={!editable}
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
            {editable && (
              <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-ube-line pt-2.5">
                {dirty && (
                  <button
                    type="button"
                    onClick={() => {
                      setRules(initialRules);
                      setPrizes(initialPrizes);
                    }}
                    className="text-[13px] font-semibold text-plum transition-colors hover:text-deep-ube"
                  >
                    Batalkan
                  </button>
                )}
                <button
                  type="button"
                  onClick={save}
                  disabled={!dirty || pending !== null}
                  className={primaryButtonClassName}
                >
                  {pending === "save" ? "Menyimpan…" : "Simpan aturan & hadiah"}
                </button>
              </div>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section className={`${cardClassName} flex flex-col gap-[13px] bg-vanilla`}>
            <PoolPreview draw={draw} pool={pool} />
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
            <ol className="flex flex-col gap-3">
              {executionSteps.map((step, index) => {
                const done = index < completedSteps;
                return (
                  <li key={step} className="flex w-fit items-center gap-2.5">
                    <span
                      aria-hidden
                      className={`flex size-[22px] shrink-0 items-center justify-center rounded-md text-xs font-extrabold transition-colors ${done ? "bg-deep-ube text-vanilla" : "bg-ube-gold text-ink"}`}
                    >
                      {done ? <Check className="size-3" strokeWidth={3} /> : index + 1}
                    </span>
                    <span
                      className={`text-[13px] font-semibold ${done ? "text-ink" : "text-plum"}`}
                    >
                      {step}
                      <span className="sr-only">{done ? " · selesai" : " · belum"}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          {draw.status === "draft" && (
            <button
              type="button"
              onClick={freeze}
              disabled={freezeBlocker !== undefined || pending !== null}
              className={primaryButtonClassName}
            >
              {pending === "freeze"
                ? "Membekukan…"
                : freezeBlocker
                  ? `Bekukan entri · ${freezeBlocker}`
                  : "Bekukan entri"}
            </button>
          )}
          {draw.status === "frozen" && (
            <button
              type="button"
              onClick={execute}
              disabled={pending !== null}
              className={primaryButtonClassName}
            >
              {pending === "draw" ? "Mengundi…" : `Undi sekarang · ${draw.frozenPoolSize} invoice`}
            </button>
          )}
          {draw.status === "drawn" && draw.drawnAt && (
            <button type="button" disabled className={primaryButtonClassName}>
              Undian selesai · {formatDateTime(draw.drawnAt)}
            </button>
          )}
        </div>
      </div>

      {draw.status === "drawn" && <Winners winners={draw.winners} />}
    </>
  );
}

function DeadlineInput({
  id,
  editable,
  value,
  saved,
  onChange,
}: {
  id: string;
  editable: boolean;
  value: string;
  saved: Date;
  onChange: (value: string) => void;
}) {
  if (!editable) {
    return (
      <input
        id={id}
        aria-describedby={`${id}-help`}
        value={formatDeadline(saved)}
        readOnly
        className={fieldInputClassName}
      />
    );
  }
  return (
    <>
      <input
        id={id}
        aria-describedby={`${id}-help`}
        type="datetime-local"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={fieldInputClassName}
      />
      <span>WIB</span>
    </>
  );
}

function PoolPreview({ draw, pool }: { draw: Draw; pool: Pool }) {
  if (draw.status === "draft") {
    return (
      <>
        <h2 className="text-xs font-extrabold text-deep-ube">PRATINJAU · BELUM DIBEKUKAN</h2>
        <p className="text-[31px]/[1.2] font-extrabold text-deep-ube">{pool.optedIn} invoice</p>
        <p className="text-[13px]/[1.45] text-plum">
          Angka ini dapat berubah. Pool final hanya memuat pesanan lunas, opt-in, dan tidak
          dibatalkan.
        </p>
      </>
    );
  }
  const drawn = draw.status === "drawn" && draw.drawnAt;
  return (
    <>
      <h2 className="text-xs font-extrabold text-deep-ube">
        {drawn
          ? `POOL FINAL · DIUNDI ${formatDateTime(drawn).toUpperCase()}`
          : `DIBEKUKAN · ${draw.frozenAt ? formatDateTime(draw.frozenAt).toUpperCase() : ""}`}
      </h2>
      <p className="text-[31px]/[1.2] font-extrabold text-deep-ube">
        {draw.frozenPoolSize ?? 0} invoice
      </p>
      <p className="text-[13px]/[1.45] text-plum">
        Pool terkunci bersama aturan versi {draw.rulesVersion}. Kelayakan setiap invoice dicek ulang
        saat pengundian; pesanan yang dibatalkan gugur. Angka di bawah tetap langsung.
      </p>
    </>
  );
}

function Winners({ winners }: { winners: Draw["winners"] }) {
  return (
    <section className={`${cardClassName} flex flex-col gap-3 border border-ube-line bg-surface`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold text-ink">Pemenang</h2>
        <p className="text-[13px] text-plum">Tersimpan di server · nama pelanggan disamarkan</p>
      </div>
      <ol className="flex flex-col">
        {winners.map(({ position, invoiceNumber, customer, prize }) => (
          <li
            key={position}
            className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 border-t border-ube-line py-2.5 text-[13px] sm:grid-cols-[auto_1fr_1fr_auto]"
          >
            <span className="font-extrabold text-deep-ube">
              {String(position).padStart(2, "0")}
            </span>
            <span className="font-data font-bold text-ink">{invoiceNumber}</span>
            <span className="text-plum max-sm:col-start-2">{customer}</span>
            <span className="font-bold text-ink max-sm:col-start-2 sm:text-right">{prize}</span>
          </li>
        ))}
      </ol>
    </section>
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
      <label htmlFor={id} className="text-xs font-bold text-plum">
        {label}
      </label>
      <div className={fieldBoxClassName}>{children}</div>
      <p id={`${id}-help`} className="text-xs text-plum">
        {help}
      </p>
    </div>
  );
}

function PoolCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[13px] text-plum">{label}</dt>
      <dd className="text-sm font-extrabold text-ink">{value}</dd>
    </div>
  );
}
