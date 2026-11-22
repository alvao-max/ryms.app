/** Datum hanteras som strängar: dag "YYYY-MM-DD", månad "YYYY-MM". Tidszon: Europe/Stockholm. */

const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const MONTHS_SHORT = ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Loc = "sv" | "en";
const WEEKDAYS = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];

export function todayISO(): string {
  const fake = process.env.RYMS_TODAY;
  if (fake && /^\d{4}-\d{2}-\d{2}$/.test(fake)) return fake;
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function isDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(`${y}-${String(m).padStart(2, "0")}`);
}
export function isMonth(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

function toUTC(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
/** Dag i månaden, klämd till månadens längd (31 → 30 i november). */
export function dateInMonth(month: string, day: number): string {
  const d = Math.max(1, Math.min(day, daysInMonth(month)));
  return `${month}-${String(d).padStart(2, "0")}`;
}
export function addDays(date: string, n: number): string {
  const d = toUTC(date);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}
export function diffDays(from: string, to: string): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / 86400000);
}
export function weekday(date: string): number {
  return toUTC(date).getUTCDay();
}
/** Lön som infaller på en helg betalas normalt ut fredagen innan. */
export function paydayFor(month: string, day: number): string {
  let d = dateInMonth(month, day);
  const wd = weekday(d);
  if (wd === 6) d = addDays(d, -1);
  if (wd === 0) d = addDays(d, -2);
  return d;
}

export function monthName(month: string, locale: Loc = "sv"): string {
  return (locale === "en" ? MONTHS_EN : MONTHS)[Number(month.slice(5, 7)) - 1];
}
export function formatMonth(month: string, locale: Loc = "sv"): string {
  return `${monthName(month, locale)} ${month.slice(0, 4)}`;
}
/** "25 november" / "25 November" */
export function formatDate(date: string, locale: Loc = "sv"): string {
  return `${Number(date.slice(8, 10))} ${(locale === "en" ? MONTHS_EN : MONTHS)[Number(date.slice(5, 7)) - 1]}`;
}
/** "25 nov" / "25 Nov" */
export function formatDateShort(date: string, locale: Loc = "sv"): string {
  return `${Number(date.slice(8, 10))} ${(locale === "en" ? MONTHS_SHORT_EN : MONTHS_SHORT)[Number(date.slice(5, 7)) - 1]}`;
}
export function weekdayName(date: string, locale: Loc = "sv"): string {
  return (locale === "en" ? WEEKDAYS_EN : WEEKDAYS)[weekday(date)];
}
/** "idag", "imorgon", "på fredag", annars "den 3 december" – eller "today", "tomorrow", "on Friday", "on 3 December". */
export function formatWhen(date: string, today: string, locale: Loc = "sv"): string {
  const diff = diffDays(today, date);
  if (locale === "en") {
    if (diff === 0) return "today";
    if (diff === 1) return "tomorrow";
    if (diff > 1 && diff < 7) return `on ${weekdayName(date, "en")}`;
    return `on ${formatDate(date, "en")}`;
  }
  if (diff === 0) return "idag";
  if (diff === 1) return "imorgon";
  if (diff > 1 && diff < 7) return `på ${weekdayName(date)}`;
  return `den ${formatDate(date)}`;
}
/** Tidsstämpel → "idag 14:32", "igår 09:10", "20 nov 14:32" i svensk tid. */
export function formatTimestamp(iso: string, today: string = todayISO(), locale: Loc = "sv"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const diff = diffDays(date, today);
  const day = diff === 0 ? (locale === "en" ? "today" : "idag") : diff === 1 ? (locale === "en" ? "yesterday" : "igår") : formatDateShort(date, locale);
  return `${day} ${time}`;
}
