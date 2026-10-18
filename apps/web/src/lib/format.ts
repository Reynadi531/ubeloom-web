/** Shared display formatters. All times render in WIB (Asia/Jakarta). */

const TIME_ZONE = "Asia/Jakarta";

export const formatRupiah = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;

const dayMonthFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: TIME_ZONE,
});
const longDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TIME_ZONE,
});
const weekdayFormatter = new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: TIME_ZONE });
const timeFormatter = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TIME_ZONE,
});

const toDate = (value: Date | string) => (typeof value === "string" ? new Date(value) : value);

/** "24 Okt" */
export const formatDayMonth = (value: Date | string) =>
  dayMonthFormatter.format(toDate(value)).replace(/\.$/, "");

/** "24 Oktober 2026" */
export const formatLongDate = (value: Date | string) => longDateFormatter.format(toDate(value));

/** "Sabtu" */
export const formatWeekday = (value: Date | string) => weekdayFormatter.format(toDate(value));

/** "13.00" */
export const formatTime = (value: Date | string) =>
  timeFormatter.format(toDate(value)).replace(":", ".");

/** "24 Okt · 13.00–16.00" */
export const formatWindow = (start: Date | string, end: Date | string) =>
  `${formatDayMonth(start)} · ${formatTime(start)}–${formatTime(end)}`;

/** "24 Okt · 20.00 WIB" */
export const formatDateTime = (value: Date | string) =>
  `${formatDayMonth(value)} · ${formatTime(value)} WIB`;

/** Masks a phone number for list views: "0812•••4521". */
export const maskPhone = (phone: string) =>
  phone.length <= 8 ? phone : `${phone.slice(0, 4)}•••${phone.slice(-4)}`;

/** `yyyy-mm-dd` in WIB, for `<input type="date">` values. */
export const toDateInputValue = (value: Date | string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(toDate(value));

/** Parses a `yyyy-mm-dd` input value as midnight WIB. */
export const fromDateInputValue = (value: string) => new Date(`${value}T00:00:00+07:00`);
