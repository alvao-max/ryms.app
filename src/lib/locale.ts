import { cookies } from "next/headers";
import { CURRENCY_COOKIE, LOCALE_COOKIE, makeT, type Locale, type T } from "./i18n";
import { isCurrency, setCurrency, type Currency } from "./money";

/** Läser språk och visningsvaluta från kakorna. Valutan ställs samtidigt in för utskrift av belopp. */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const cur = jar.get(CURRENCY_COOKIE)?.value;
  setCurrency(isCurrency(cur) ? cur : "SEK");
  return jar.get(LOCALE_COOKIE)?.value === "en" ? "en" : "sv";
}
export async function getCurrency(): Promise<Currency> {
  const cur = (await cookies()).get(CURRENCY_COOKIE)?.value;
  return isCurrency(cur) ? cur : "SEK";
}
export async function getT(): Promise<{ t: T; locale: Locale }> {
  const locale = await getLocale();
  return { t: makeT(locale), locale };
}
