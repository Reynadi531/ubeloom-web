/** Telegram message bodies. All times render in WIB (Asia/Jakarta). */
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

const paymentLabels = { unpaid: "Belum bayar", review: "Ditinjau", paid: "Lunas" } as const;

export type NewOrder = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  method: "pickup" | "delivery";
  deliveryArea: string | null;
  address: string | null;
  paymentMethod: string;
  paymentStatus: keyof typeof paymentLabels;
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

export function orderMessage(row: NewOrder, dashboardUrl: string) {
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
  const url = `${dashboardUrl}/dashboard/pesanan?q=${encodeURIComponent(row.invoiceNumber)}`;

  return [
    `🛒 <b>Pesanan baru${row.createdById ? " (manual)" : ""}</b>`,
    `<code>${e(row.invoiceNumber)}</code> · ${e(row.batch.name)}`,
    "",
    `👤 ${e(row.customerName)} · ${e(row.customerPhone)}`,
    schedule,
    ...(row.method === "delivery" && row.address ? [`📍 ${e(row.address)}`] : []),
    "",
    ...items,
    "",
    `💰 <b>${formatRupiah(row.total)}</b> · ${e(row.paymentMethod)} · ${paymentLabels[row.paymentStatus]}`,
    ...(row.notes ? [`📝 ${e(row.notes)}`] : []),
    "",
    link(url, "Buka pesanan →"),
  ].join("\n");
}

export function paymentMessage(row: PendingPayment, dashboardUrl: string) {
  const e = escapeHtml;
  const amount =
    row.claimedAmount === row.order.total
      ? `${formatRupiah(row.claimedAmount)} ✅ sesuai total`
      : `${formatRupiah(row.claimedAmount)} ⚠️ total ${formatRupiah(row.order.total)}`;
  const url = `${dashboardUrl}/dashboard/verifikasi-bayar?attempt=${encodeURIComponent(row.id)}`;

  return [
    `💳 <b>Verifikasi bayar</b> · percobaan #${row.attempt}`,
    `<code>${e(row.order.invoiceNumber)}</code>`,
    "",
    `👤 ${e(row.order.customerName)} · ${e(row.order.customerPhone)}`,
    `💰 ${amount}`,
    `🏦 ${e(row.order.paymentMethod)} · ref <code>${e(row.customerReference)}</code>`,
    `🕒 Dibayar ${formatDateTime(row.claimedPaidAt)}`,
    "",
    link(url, "Tinjau pembayaran →"),
  ].join("\n");
}

export function pendingListMessage(rows: PendingPayment[], dashboardUrl: string) {
  if (rows.length === 0) return "✅ Tidak ada pembayaran yang menunggu verifikasi.";
  const lines = rows.map((row) => {
    const url = `${dashboardUrl}/dashboard/verifikasi-bayar?attempt=${encodeURIComponent(row.id)}`;
    return `• ${link(url, escapeHtml(row.order.invoiceNumber))} · ${escapeHtml(
      row.order.customerName,
    )} · ${formatRupiah(row.claimedAmount)} · ${formatDateTime(row.createdAt)}`;
  });
  return [`💳 <b>${rows.length} pembayaran menunggu verifikasi</b>`, "", ...lines].join("\n");
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
