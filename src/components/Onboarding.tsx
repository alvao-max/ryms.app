"use client";

import { useState, useTransition } from "react";
import { completeOnboardingAction, logoutAction, type OnboardingInput } from "@/app/actions";
import { makeT, type Locale } from "@/lib/i18n";
import { parseKr } from "@/lib/money";
import { BackIcon, PlusIcon, TrashIcon } from "./icons";
import { Mark } from "./Chrome";

const STEPS = ["hej", "lon", "rakningar", "budget", "sparmal", "saldo"];

export function Onboarding({ name, today, suggestedPayday, locale = "sv" }: { name: string; today: string; suggestedPayday: string; locale?: Locale }) {
  const t = makeT(locale);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [d, setD] = useState<OnboardingInput>({
    name,
    payday: suggestedPayday,
    income: "",
    balance: "",
    bills: [
      { name: t("Hyra", "Rent"), amount: "", day: "28" },
      { name: t("El", "Electricity"), amount: "", day: "28" },
      { name: t("Mobil", "Mobile"), amount: "", day: "28" },
    ],
    categories: [
      { name: t("Mat", "Food"), icon: "mat", amount: "3500" },
      { name: t("Kläder", "Clothes"), icon: "klader", amount: "800" },
      { name: t("Nöje", "Fun"), icon: "noje", amount: "1000" },
      { name: "Transport", icon: "transport", amount: "800" },
      { name: t("Hem", "Home"), icon: "hem", amount: "500" },
    ],
    goal: { name: "", target: "", monthly: "", saved: "" },
  });
  const set = (patch: Partial<OnboardingInput>) => setD((x) => ({ ...x, ...patch }));

  function next() {
    setError(null);
    if (step === 1) {
      if (!d.payday || d.payday <= today) return setError(t("Välj ett datum för nästa lön, senare än idag.", "Choose a date for your next payday, later than today."));
      if (!parseKr(d.income)) return setError(t("Ange din väntade lön efter skatt, till exempel 27 500.", "Enter your expected pay after tax, for example 27 500."));
    }
    if (step === 3 && !d.categories.some((c) => c.name.trim() && parseKr(c.amount) != null)) return setError(t("Lägg till minst en kategori med ett belopp.", "Add at least one category with an amount."));
    if (step < STEPS.length - 1) return setStep(step + 1);
    start(async () => {
      const r = await completeOnboardingAction({ ...d, goal: d.goal?.name.trim() ? d.goal : null });
      if (r?.error) setError(r.error);
    });
  }

  return (
    <main className="auth" data-testid="onboarding" data-step={step}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
        {step > 0 ? (
          <button className="iconbtn" onClick={() => { setError(null); setStep(step - 1); }} aria-label={t("Tillbaka", "Back")} style={{ marginLeft: -10 }}>
            <BackIcon />
          </button>
        ) : (
          <Mark />
        )}
        <span className="caps faint">
          {step + 1} {t("av", "of")} {STEPS.length}
        </span>
      </div>
      <div className="steps" aria-hidden>
        {STEPS.map((s, i) => (
          <i key={s} className={i <= step ? "on" : ""} />
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
      >
        {step === 0 && (
          <>
            <h1>{t("Välkommen till Ryms", "Welcome to Ryms")}</h1>
            <p className="muted" style={{ marginBottom: 24 }}>
              {t("Vi sätter upp din månad på ett par minuter: lön, räkningar, budget och sparande. Sedan kan du fråga ”Ryms det?” när du står i butiken. Allt går att ändra efteråt.", "We set up your month in a couple of minutes: pay, bills, budget and savings. Then you can ask ”Ryms det?” – does it fit? – when you are standing in the shop. Everything can be changed later.")}
            </p>
            <label className="field">
              <span>{t("Vad heter du?", "What is your name?")}</span>
              <input value={d.name} onChange={(e) => set({ name: e.target.value })} autoComplete="given-name" maxLength={40} />
            </label>
          </>
        )}

        {step === 1 && (
          <>
            <h1>{t("När kommer lönen?", "When is payday?")}</h1>
            <p className="muted" style={{ marginBottom: 24 }}>{t("Ryms räknar ut vad du har kvar fram till nästa lön.", "Ryms works out what you have left until your next payday.")}</p>
            <label className="field">
              <span>{t("Nästa lönedag", "Next payday")}</span>
              <input type="date" value={d.payday} min={today} onChange={(e) => set({ payday: e.target.value })} required data-testid="ob-payday" />
            </label>
            <label className="field kr">
              <span>{t("Väntad lön efter skatt", "Expected pay after tax")}</span>
              <input inputMode="decimal" value={d.income} onChange={(e) => set({ income: e.target.value })} placeholder="27 500" data-testid="ob-income" />
            </label>
          </>
        )}

        {step === 2 && (
          <>
            <h1>{t("Återkommande räkningar", "Recurring bills")}</h1>
            <p className="muted" style={{ marginBottom: 20 }}>{t("Belopp och vilken dag i månaden de förfaller. Hoppa över dem du inte har.", "Amount and the day of the month they are due. Skip the ones you don't have.")}</p>
            <div className="listbox">
              {d.bills.map((b, i) => (
                <div className="lineitem three" key={i}>
                  <input aria-label={t("Räkning", "Bill")} placeholder={t("Namn", "Name")} value={b.name} onChange={(e) => set({ bills: d.bills.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  <input aria-label={t(`Belopp för ${b.name}`, `Amount for ${b.name}`)} placeholder="kr" inputMode="decimal" value={b.amount} onChange={(e) => set({ bills: d.bills.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })} data-testid={`ob-bill-${i}`} />
                  <input aria-label={t(`Förfallodag för ${b.name}`, `Due day for ${b.name}`)} placeholder={t("dag", "day")} inputMode="numeric" value={b.day} onChange={(e) => set({ bills: d.bills.map((x, j) => (j === i ? { ...x, day: e.target.value } : x)) })} />
                  <button type="button" className="iconbtn" aria-label={t(`Ta bort ${b.name}`, `Remove ${b.name}`)} onClick={() => set({ bills: d.bills.filter((_, j) => j !== i) })}>
                    <TrashIcon size={18} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="btn ghost small" onClick={() => set({ bills: [...d.bills, { name: "", amount: "", day: "28" }] })}>
              <PlusIcon size={16} /> {t("Lägg till räkning", "Add bill")}
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <h1>{t("Budget per kategori", "Budget per category")}</h1>
            <p className="muted" style={{ marginBottom: 20 }}>{t("Hur mycket vill du lägga per månad? Det här blir din återkommande mall.", "How much do you want to spend per month? This becomes your recurring template.")}</p>
            <div className="listbox">
              {d.categories.map((c, i) => (
                <div className="lineitem" key={i}>
                  <input aria-label={t("Kategori", "Category")} placeholder={t("Kategori", "Category")} value={c.name} onChange={(e) => set({ categories: d.categories.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  <input aria-label={t(`Budget för ${c.name}`, `Budget for ${c.name}`)} placeholder="kr" inputMode="decimal" value={c.amount} onChange={(e) => set({ categories: d.categories.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })} data-testid={`ob-cat-${c.name}`} />
                  <button type="button" className="iconbtn" aria-label={t(`Ta bort ${c.name}`, `Remove ${c.name}`)} onClick={() => set({ categories: d.categories.filter((_, j) => j !== i) })}>
                    <TrashIcon size={18} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="btn ghost small" onClick={() => set({ categories: [...d.categories, { name: "", icon: "dot", amount: "" }] })}>
              <PlusIcon size={16} /> {t("Lägg till kategori", "Add category")}
            </button>
          </>
        )}

        {step === 4 && (
          <>
            <h1>{t("Vad vill du spara till?", "What are you saving for?")}</h1>
            <p className="muted" style={{ marginBottom: 20 }}>{t("Valfritt. Ryms håller plats för det planerade sparandet före lön – men flyttar aldrig några pengar.", "Optional. Ryms keeps room for the planned saving before payday – but never moves any money.")}</p>
            <label className="field">
              <span>{t("Sparmål", "Savings goal")}</span>
              <input value={d.goal?.name ?? ""} onChange={(e) => set({ goal: { ...d.goal!, name: e.target.value } })} placeholder={t("t.ex. Resa", "e.g. Trip")} maxLength={60} />
            </label>
            <div className="field-row">
              <label className="field kr">
                <span>{t("Mål", "Target")}</span>
                <input inputMode="decimal" value={d.goal?.target ?? ""} onChange={(e) => set({ goal: { ...d.goal!, target: e.target.value } })} />
              </label>
              <label className="field kr">
                <span>{t("Per månad", "Per month")}</span>
                <input inputMode="decimal" value={d.goal?.monthly ?? ""} onChange={(e) => set({ goal: { ...d.goal!, monthly: e.target.value } })} />
              </label>
            </div>
            <label className="field kr">
              <span>{t("Redan sparat", "Already saved")}</span>
              <input inputMode="decimal" value={d.goal?.saved ?? ""} onChange={(e) => set({ goal: { ...d.goal!, saved: e.target.value } })} />
            </label>
          </>
        )}

        {step === 5 && (
          <>
            <h1>{t("Vad finns på kontot?", "What is in your account?")}</h1>
            <p className="muted" style={{ marginBottom: 20 }}>
              {t("Skriv saldot på kontot du betalar med, så kan Ryms räkna ut vad du har kvar till lön. Du kan hoppa över det, eller ansluta en bank senare under Inställningar.", "Enter the balance of the account you pay with, so Ryms can work out what you have left until payday. You can skip this, or connect a bank later under Settings.")}
            </p>
            <label className="field kr">
              <span>{t("Saldo just nu (valfritt)", "Balance right now (optional)")}</span>
              <input inputMode="decimal" value={d.balance} onChange={(e) => set({ balance: e.target.value })} data-testid="ob-balance" />
            </label>
          </>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" disabled={pending} style={{ marginTop: 14 }} data-testid="ob-next">
          {pending ? t("Sparar…", "Saving…") : step === STEPS.length - 1 ? t("Klar – visa min översikt", "Done – show my overview") : t("Fortsätt", "Continue")}
        </button>
      </form>
      {step === 0 && (
        <form action={logoutAction}>
          <button className="btn quiet" style={{ marginTop: 8 }}>
            {t("Logga ut", "Log out")}
          </button>
        </form>
      )}
    </main>
  );
}
