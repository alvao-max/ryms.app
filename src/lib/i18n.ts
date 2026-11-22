/** Svenska är grundspråket. Engelska väljs av användaren och sparas i en kaka. */
export type Locale = "sv" | "en";
export type T = (sv: string, en: string) => string;

export const LOCALE_COOKIE = "ryms_lang";
export const CURRENCY_COOKIE = "ryms_cur";
export const makeT =
  (locale: Locale): T =>
  (sv, en) =>
    locale === "en" ? en : sv;

const SEP = "\u0001";
/** Tvåspråkigt meddelande i en sträng – används för fel som kastas i tjänstelagret. */
export const bi = (sv: string, en: string): string => `${sv}${SEP}${en}`;
export function pick(message: string, locale: Locale): string {
  const [sv, en] = message.split(SEP);
  return locale === "en" && en ? en : sv;
}
export const lower = (s: string | null | undefined, locale: Locale = "sv") => (s ?? "").toLocaleLowerCase(locale === "en" ? "en-GB" : "sv-SE");
