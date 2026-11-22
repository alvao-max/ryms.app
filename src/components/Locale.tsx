"use client";

import { createContext, useContext, useTransition, type ReactNode } from "react";
import { setCurrencyAction, setLocaleAction } from "@/app/actions";
import { makeT, type Locale, type T } from "@/lib/i18n";
import { CURRENCIES, setCurrency, type Currency } from "@/lib/money";

const Ctx = createContext<Locale>("sv");

const CurCtx = createContext<Currency>("SEK");

export function LocaleProvider({ locale, currency = "SEK", children }: { locale: Locale; currency?: Currency; children: ReactNode }) {
  setCurrency(currency); // gäller all utskrift av belopp i klientkomponenterna
  return (
    <Ctx.Provider value={locale}>
      <CurCtx.Provider value={currency}>{children}</CurCtx.Provider>
    </Ctx.Provider>
  );
}
export const useCurrency = (): Currency => useContext(CurCtx);

/** Valutaväljare. Ändrar bara hur belopp visas – inget räknas om. */
export function CurrencySwitch() {
  const locale = useLocale();
  const currency = useCurrency();
  const [pending, start] = useTransition();
  return (
    <select className="cur-select" value={currency} disabled={pending} onChange={(e) => start(() => setCurrencyAction(e.target.value))} aria-label={locale === "en" ? "Currency" : "Valuta"} data-testid="currency">
      {(Object.keys(CURRENCIES) as Currency[]).map((c) => (
        <option key={c} value={c}>
          {c} – {CURRENCIES[c].name[locale === "en" ? 1 : 0]}
        </option>
      ))}
    </select>
  );
}
export const useLocale = (): Locale => useContext(Ctx);
export const useT = (): T => makeT(useContext(Ctx));

/** Språkväljare: Svenska / English. */
export function LanguageSwitch({ className = "lang" }: { className?: string }) {
  const locale = useLocale();
  const [pending, start] = useTransition();
  return (
    <div className={className} role="group" aria-label={locale === "en" ? "Language" : "Språk"} data-testid="lang">
      {(["sv", "en"] as const).map((l) => (
        <button key={l} type="button" aria-pressed={locale === l} disabled={pending} onClick={() => start(() => setLocaleAction(l))} data-testid={`lang-${l}`}>
          {l === "sv" ? "Svenska" : "English"}
        </button>
      ))}
    </div>
  );
}
