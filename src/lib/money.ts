/**
 * Alla belopp i Ryms är heltal i öre. Inga flyttal används i beräkningar.
 */
export type Ore = number;

const NBSP = " ";
const MINUS = "−";

/**
 * Visningsvaluta. Påverkar bara hur belopp skrivs ut – ingenting räknas om.
 * Sätts per sidvisning från användarens val (kaka); standard är svenska kronor.
 */
export const CURRENCIES = {
  SEK: { symbol: "kr", prefix: false, name: ["Svenska kronor", "Swedish kronor"] },
  NOK: { symbol: "kr", prefix: false, name: ["Norska kronor", "Norwegian kroner"] },
  DKK: { symbol: "kr", prefix: false, name: ["Danska kronor", "Danish kroner"] },
  EUR: { symbol: "€", prefix: false, name: ["Euro", "Euro"] },
  USD: { symbol: "$", prefix: true, name: ["Amerikanska dollar", "US dollars"] },
  GBP: { symbol: "£", prefix: true, name: ["Brittiska pund", "British pounds"] },
} as const;
export type Currency = keyof typeof CURRENCIES;
export const isCurrency = (c: unknown): c is Currency => typeof c === "string" && c in CURRENCIES;
let current: Currency = "SEK";
export function setCurrency(c: Currency): void {
  current = c;
}
export const currentCurrency = (): Currency => current;
export const currencySymbol = (): string => CURRENCIES[current].symbol;

/** "1 200 kr", "699,50 kr", "−180 kr" – eller "1 200 €", "$1 200". Deterministisk (ingen Intl/ICU). */
export function formatKr(ore: Ore, opts: { sign?: boolean; unit?: boolean } = {}): string {
  if (!Number.isInteger(ore)) throw new Error("Belopp måste vara heltal i öre");
  const abs = Math.abs(ore);
  const kr = Math.trunc(abs / 100);
  const rest = abs % 100;
  const grouped = String(kr).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const decimals = rest === 0 ? "" : "," + String(rest).padStart(2, "0");
  const prefix = ore < 0 ? MINUS : opts.sign && ore > 0 ? "+" : "";
  if (opts.unit === false) return `${prefix}${grouped}${decimals}`;
  const cur = CURRENCIES[current];
  return cur.prefix ? `${prefix}${cur.symbol}${grouped}${decimals}` : `${prefix}${grouped}${decimals}${NBSP}${cur.symbol}`;
}

/** Värde för inmatningsfält: "1200" eller "699,50". */
export function oreToInput(ore: Ore | null | undefined): string {
  if (ore == null) return "";
  const abs = Math.abs(ore);
  const kr = Math.trunc(abs / 100);
  const rest = abs % 100;
  return (ore < 0 ? "-" : "") + kr + (rest ? "," + String(rest).padStart(2, "0") : "");
}

/**
 * Tolkar svensk inmatning: "1 200", "1 200,50", "699:-", "699 kr", "1.200,00", "12.50".
 * Returnerar null om texten inte är ett entydigt, icke-negativt belopp.
 */
export function parseKr(input: string | null | undefined): Ore | null {
  if (input == null) return null;
  let s = String(input).trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/[\s  ]/g, "").replace(/^[€$£]/, "").replace(/(kr|sek|nok|dkk|eur|usd|gbp|:-|kronor|[€$£])$/g, "").replace(/:-$/, "");
  if (!/^[0-9.,]+$/.test(s)) return null;
  let whole = s;
  let frac = "";
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0) {
    // komma är decimaltecken, punkter är tusentalsavgränsare
    whole = s.slice(0, lastComma).replace(/\./g, "");
    frac = s.slice(lastComma + 1);
    if (whole.includes(",")) return null;
  } else if (lastDot >= 0) {
    const after = s.slice(lastDot + 1);
    if (after.length === 3) {
      whole = s.replace(/\./g, ""); // "1.200" = ettusen tvåhundra
    } else {
      whole = s.slice(0, lastDot);
      frac = after;
      if (whole.includes(".")) return null;
    }
  }
  if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(frac)) return null;
  const ore = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(ore)) return null;
  return ore;
}
