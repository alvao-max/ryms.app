import { diffDays, formatWhen, todayISO } from "@/lib/dates";
import { getLocale, getT } from "@/lib/locale";
import { formatKr } from "@/lib/money";
import { cashSnapshot } from "@/lib/services/overview";
import { pendingMatches, uncategorizedTx } from "@/lib/services/transactions";
import { DEMO_BUDGETS } from "@/lib/services/demo";
import type { User } from "@/lib/services/users";
import { DemoBar, TopBar } from "./Chrome";

export async function DemoStrip({ user }: { user: User }) {
  if (!user.is_demo) return null;
  const locale = await getLocale();
  return <DemoBar current={user.demo_key ?? ""} budgets={DEMO_BUDGETS.map((b) => ({ key: b.key, label: locale === "en" ? ((b as { labelEn?: string }).labelEn ?? b.label) : b.label }))} />;
}

export interface Notice {
  title: string;
  text: string;
  href: string;
}

/** Toppfältet. Klockan till vänster samlar det som väntar på användaren just nu. */
export async function Top({ user }: { user: User }) {
  const { t, locale } = await getT();
  const today = todayISO();
  const notices: Notice[] = [];
  const matches = pendingMatches(user.id).length;
  if (matches > 0)
    notices.push({
      title: matches === 1 ? t("Ett köp att bekräfta", "One purchase to confirm") : t(`${matches} köp att bekräfta`, `${matches} purchases to confirm`),
      text: t("Banken visar köp som kan vara sådana du redan registrerat.", "The bank shows purchases that may be ones you already recorded."),
      href: "/transaktioner",
    });
  const unknown = uncategorizedTx(user, 99).length;
  if (unknown > 0)
    notices.push({
      title: unknown === 1 ? t("Ett köp saknar kategori", "One purchase has no category") : t(`${unknown} köp saknar kategori`, `${unknown} purchases have no category`),
      text: t("Välj kategori så räknas de in i rätt budget.", "Pick a category so they count towards the right budget."),
      href: "/",
    });
  for (const e of cashSnapshot(user, today, locale).events) {
    if (e.type !== "bill") continue;
    const days = diffDays(today, e.date);
    if (!e.overdue && days > 3) continue;
    notices.push({
      title: e.overdue ? t(`${e.label} har förfallit`, `${e.label} is overdue`) : t(`${e.label} förfaller ${formatWhen(e.date, today)}`, `${e.label} is due ${formatWhen(e.date, today, "en")}`),
      text: e.overdue ? t(`${formatKr(e.amountOre)} – inte markerad som betald.`, `${formatKr(e.amountOre)} – not marked as paid.`) : formatKr(e.amountOre),
      href: "/plan",
    });
  }
  return <TopBar name={user.name} email={user.email} demo={!!user.is_demo} notices={notices} />;
}
