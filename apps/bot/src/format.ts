/** Telegram message bodies. All times render in WIB (Asia/Jakarta). */
import {
  type FulfillmentStatus,
  type PaymentStatus,
  fulfillmentStatusLabels,
  paymentChecklist,
  paymentStatusLabels,
} from "@web-kwu/shop/rules";

import type { BatchRow, VoucherRow } from "./queries";
import { escapeHtml } from "./telegram";

const TIME_ZONE = "Asia/Jakarta";

export const formatRupiah = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;

const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TIME_ZONE,
});

/** "24 Okt 13.00" */
export const formatDateTime = (value: Date) =>
  dateTimeFormatter.format(value).replace(",", "").replace(":", ".");

export type OrderRow = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  method: "pickup" | "delivery";
  deliveryArea: string | null;
  address: string | null;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  total: number;
  notes: string | null;
  createdById: string | null;
  createdAt: Date;
  batch: { name: string };
  pickupSlot: { startsAt: Date } | null;
  deliveryZone: { windowStartsAt: Date } | null;
  items: { productName: string; quantity: number; lineTotal: number }[];
};

export type PendingPayment = {
  id: string;
  attempt: number;
  claimedAmount: number;
  claimedPaidAt: Date;
  customerReference: string;
  createdAt: Date;
  order: {
    invoiceNumber: string;
    customerName: string;
    customerPhone: string;
    paymentMethod: string;
    total: number;
  };
};

const link = (href: string, label: string) => `<a href="${escapeHtml(href)}">${label}</a>`;

export const orderUrl = (dashboardUrl: string, invoiceNumber: string) =>
  `${dashboardUrl}/dashboard/pesanan?q=${encodeURIComponent(invoiceNumber)}`;

export const paymentUrl = (dashboardUrl: string, attemptId: string) =>
  `${dashboardUrl}/dashboard/verifikasi-bayar?attempt=${encodeURIComponent(attemptId)}`;

/** Order card; `title` distinguishes a new-order alert from a looked-up order. */
export function orderMessage(row: OrderRow, dashboardUrl: string, title: string) {
  const e = escapeHtml;
  const schedule =
    row.method === "pickup"
      ? `🏪 Ambil sendiri${row.pickupSlot ? ` · ${formatDateTime(row.pickupSlot.startsAt)}` : ""}`
      : `🛵 Antar${row.deliveryArea ? ` · ${e(row.deliveryArea)}` : ""}${
          row.deliveryZone ? ` · ${formatDateTime(row.deliveryZone.windowStartsAt)}` : ""
        }`;
  const items = row.items.map(
    (item) => `• ${item.quantity}× ${e(item.productName)} — ${formatRupiah(item.lineTotal)}`,
  );

  return [
    `${title}${row.createdById ? " (manual)" : ""}`,
    `<code>${e(row.invoiceNumber)}</code> · ${e(row.batch.name)}`,
    "",
    `👤 ${e(row.customerName)} · ${e(row.customerPhone)}`,
    schedule,
    ...(row.method === "delivery" && row.address ? [`📍 ${e(row.address)}`] : []),
    "",
    ...items,
    "",
    `💰 <b>${formatRupiah(row.total)}</b> · ${e(row.paymentMethod)} · ${paymentStatusLabels[row.paymentStatus]}`,
    `📦 ${fulfillmentStatusLabels[row.fulfillmentStatus]}`,
    ...(row.notes ? [`📝 ${e(row.notes)}`] : []),
    "",
    link(orderUrl(dashboardUrl, row.invoiceNumber), "Buka di dashboard →"),
  ].join("\n");
}

/** Customer references are free text; keep captions under Telegram's 1024-char limit. */
const MAX_REFERENCE_LENGTH = 120;

export function paymentMessage(row: PendingPayment, dashboardUrl: string) {
  const e = escapeHtml;
  const amount =
    row.claimedAmount === row.order.total
      ? `${formatRupiah(row.claimedAmount)} ✅ sesuai total`
      : `${formatRupiah(row.claimedAmount)} ⚠️ total ${formatRupiah(row.order.total)}`;
  const reference =
    Array.from(row.customerReference).length > MAX_REFERENCE_LENGTH
      ? `${Array.from(row.customerReference).slice(0, MAX_REFERENCE_LENGTH).join("")}…`
      : row.customerReference;

  return [
    `💳 <b>Verifikasi bayar</b> · percobaan #${row.attempt}`,
    `<code>${e(row.order.invoiceNumber)}</code>`,
    "",
    `👤 ${e(row.order.customerName)} · ${e(row.order.customerPhone)}`,
    `💰 ${amount}`,
    `🏦 ${e(row.order.paymentMethod)} · ref <code>${e(reference)}</code>`,
    `🕒 Dibayar ${formatDateTime(row.claimedPaidAt)}`,
    "",
    link(paymentUrl(dashboardUrl, row.id), "Buka di dashboard →"),
  ].join("\n");
}

export function approveConfirmMessage(invoiceNumber: string, merchantReference: string) {
  return [
    `Setujui pembayaran <code>${escapeHtml(invoiceNumber)}</code>?`,
    `Referensi merchant: <code>${escapeHtml(merchantReference)}</code>`,
    "",
    "Pastikan:",
    ...paymentChecklist.map((item) => `☑️ ${item}`),
  ].join("\n");
}

export type DailySummary = {
  orders: number;
  revenue: number;
  unpaid: number;
  review: number;
  paid: number;
};

export function summaryMessage(summary: DailySummary, pendingCount: number) {
  return [
    "📊 <b>Ringkasan hari ini</b>",
    "",
    `🛒 ${summary.orders} pesanan · ${formatRupiah(summary.revenue)}`,
    `⏳ Belum bayar: ${summary.unpaid}`,
    `🔎 Ditinjau: ${summary.review}`,
    `✅ Lunas: ${summary.paid}`,
    "",
    `💳 Antrean verifikasi (semua): ${pendingCount}`,
  ].join("\n");
}

export const batchStatusLabels = {
  draft: "Draf",
  open: "Dibuka",
  closed: "Ditutup",
  archived: "Diarsipkan",
} as const;

export function batchListMessage(rows: BatchRow[]) {
  if (rows.length === 0) return "Belum ada batch.";
  const lines = rows.map(
    (row) =>
      `• <b>${escapeHtml(row.name)}</b> · ${batchStatusLabels[row.status]} · ${row.orders} pesanan\n  ${formatDateTime(row.opensAt)} – ${formatDateTime(row.closesAt)}`,
  );
  return [
    "🗓 <b>Batch</b>",
    "",
    ...lines,
    "",
    "Membuka batch otomatis menutup batch lain yang sedang dibuka.",
  ].join("\n");
}

export function voucherListMessage(rows: VoucherRow[]) {
  if (rows.length === 0) return "Belum ada voucher.";
  return [
    "🎟 <b>Voucher</b>",
    "",
    ...rows.map(
      (row) =>
        `${row.active ? "🟢" : "⚪️"} <code>${escapeHtml(row.code)}</code>${
          row.description ? ` — ${escapeHtml(row.description)}` : ""
        }`,
    ),
    "",
    "Ketuk voucher untuk mengaktifkan / menonaktifkan.",
  ].join("\n");
}

export const helpMessage = [
  "🤖 <b>Perintah</b>",
  "",
  "/pending — pembayaran yang menunggu verifikasi (bisa setujui/tolak)",
  "/order &lt;invoice / nama / no. HP&gt; — cari pesanan, ubah status",
  "/ringkasan — ringkasan pesanan hari ini",
  "/batch — buka / tutup batch",
  "/voucher — aktifkan / nonaktifkan voucher",
  "/start — tampilkan chat id",
].join("\n");
