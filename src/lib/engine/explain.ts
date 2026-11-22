import { formatDate, formatWhen } from "../dates";
import { lower, makeT, type Locale } from "../i18n";
import { formatKr } from "../money";
import type { CashSnapshot, CheckResult } from "./types";

export interface Explanation {
  headline: string;
  text: string;
  /** raderna som förklarar svaret, i kronor */
  rows: { label: string; amountOre: number; strong?: boolean; negative?: boolean }[];
  notes: string[];
}

/**
 * Formulerar svaret (svenska eller engelska). Texten byggs enbart av belopp från
 * beräkningsmotorn – inga siffror hittas på eller räknas om här.
 */
export function explainCheck(r: CheckResult, cash: CashSnapshot, locale: Locale = "sv"): Explanation {
  const t = makeT(locale);
  const lc = (s: string | null) => lower(s, locale);
  const list = (names: string[]) => {
    const q = names.map((n) => `”${n}”`);
    if (q.length <= 1) return q.join("");
    return q.slice(0, -1).join(", ") + t(" och ", " and ") + q[q.length - 1];
  };
  const c = r.category;
  const price = formatKr(r.priceOre);
  const cat = lc(c.name);
  const parts: string[] = [];
  const rows: Explanation["rows"] = [];
  const notes: string[] = [];
  const cashBad = r.cash.status === "bill_short" || r.cash.status === "already_short";
  let headline = r.verdict === "yes" ? t("Ja, det ryms", "Yes, it fits") : r.verdict === "caution" ? t("Det ryms, men…", "It fits, but…") : t("Det ryms inte just nu", "It doesn't fit right now");
  const buy = t("Köpet", "The purchase");

  switch (c.status) {
    case "fits": {
      const hasRes = c.reservedFor.length > 0;
      const names = list(c.reservedFor.map((x) => x.name));
      const lead = cashBad ? t(`Det ryms i budgeten för ${cat}.`, `It fits your ${cat} budget.`) : t("Ja, det ryms.", "Yes, it fits.");
      parts.push(
        t(
          `${lead} Du har ${formatKr(c.availableOre)} kvar till ${cat}${hasRes ? ` utöver det som är reserverat för ${names}` : ""}. Efter köpet på ${price} har du ${formatKr(c.afterOre)} kvar`,
          `${lead} You have ${formatKr(c.availableOre)} left for ${cat}${hasRes ? ` on top of what is reserved for ${names}` : ""}. After this ${price} purchase you have ${formatKr(c.afterOre)} left`,
        ),
      );
      rows.push({ label: hasRes ? t(`Kvar till ${cat} (oreserverat)`, `Left for ${cat} (unreserved)`) : t(`Kvar till ${cat}`, `Left for ${cat}`), amountOre: c.availableOre });
      rows.push({ label: buy, amountOre: -r.priceOre, negative: true });
      rows.push({ label: t("Kvar efter köpet", "Left after the purchase"), amountOre: c.afterOre, strong: true });
      break;
    }
    case "fits_planned": {
      const p = c.planned!;
      const under = p.maxOre - r.priceOre;
      parts.push(
        t(
          `${cashBad ? "Det ryms i din plan." : "Ja, det ryms."} Du har reserverat ${formatKr(p.maxOre)} för ”${p.name}”. Köpet på ${price} ryms i reservationen${under > 0 ? `, och ${formatKr(under)} blir över till annat i ${cat}` : ""}`,
          `${cashBad ? "It fits your plan." : "Yes, it fits."} You have reserved ${formatKr(p.maxOre)} for ”${p.name}”. This ${price} purchase fits within the reservation${under > 0 ? `, and ${formatKr(under)} is freed up for other ${cat} spending` : ""}`,
        ),
      );
      rows.push({ label: t(`Reserverat för ”${p.name}”`, `Reserved for ”${p.name}”`), amountOre: p.maxOre });
      rows.push({ label: buy, amountOre: -r.priceOre, negative: true });
      rows.push({ label: t(`Kvar till annat i ${cat} efter köpet`, `Left for other ${cat} spending afterwards`), amountOre: c.afterOre, strong: true });
      break;
    }
    case "over_planned": {
      const p = c.planned!;
      parts.push(
        t(
          `Det ryms, men köpet på ${price} kostar ${formatKr(c.overPlannedOre)} mer än de ${formatKr(p.maxOre)} du planerade för ”${p.name}”. Mellanskillnaden tas från det som är kvar till ${cat}; efter köpet har du ${formatKr(c.afterOre)} kvar där`,
          `It fits, but this ${price} purchase costs ${formatKr(c.overPlannedOre)} more than the ${formatKr(p.maxOre)} you planned for ”${p.name}”. The difference comes out of what is left for ${cat}; afterwards you have ${formatKr(c.afterOre)} left there`,
        ),
      );
      rows.push({ label: t(`Reserverat för ”${p.name}”`, `Reserved for ”${p.name}”`), amountOre: p.maxOre });
      rows.push({ label: t(`Övrigt kvar till ${cat}`, `Other money left for ${cat}`), amountOre: c.availableOre - p.maxOre });
      rows.push({ label: buy, amountOre: -r.priceOre, negative: true });
      rows.push({ label: t("Kvar efter köpet", "Left after the purchase"), amountOre: c.afterOre, strong: true });
      break;
    }
    case "uses_reservation": {
      const f = c.figures!;
      const names = list(c.reservedFor.map((x) => x.name));
      const reserved = f.reservedOre - (c.planned?.maxOre ?? 0);
      headline = t("Det tar av en reservation", "It eats into a reservation");
      parts.push(
        t(
          `Du har ${formatKr(f.remainingOre)} kvar till ${cat}, men ${formatKr(reserved)} är reserverat för ${names}. Utan reservationen återstår ${formatKr(Math.max(0, c.availableOre))}, så köpet på ${price} skulle ta ${formatKr(c.usesReservedOre)} av pengarna för ${names}`,
          `You have ${formatKr(f.remainingOre)} left for ${cat}, but ${formatKr(reserved)} is reserved for ${names}. That leaves ${formatKr(Math.max(0, c.availableOre))} unreserved, so this ${price} purchase would take ${formatKr(c.usesReservedOre)} of the money set aside for ${names}`,
        ),
      );
      rows.push({ label: t(`Kvar till ${cat}`, `Left for ${cat}`), amountOre: f.remainingOre });
      rows.push({ label: t(`Reserverat för ${names}`, `Reserved for ${names}`), amountOre: -reserved, negative: true });
      rows.push({ label: t("Oreserverat", "Unreserved"), amountOre: c.availableOre });
      rows.push({ label: buy, amountOre: -r.priceOre, negative: true });
      rows.push({ label: t("Tas från reservationen", "Taken from the reservation"), amountOre: c.usesReservedOre, strong: true });
      break;
    }
    case "short": {
      const f = c.figures!;
      headline = t("Det ryms inte i budgeten", "It doesn't fit the budget");
      if (c.usesReservedOre > 0 || (c.reservedFor.length > 0 && c.availableOre < f.remainingOre)) {
        const names = list(c.reservedFor.map((x) => x.name));
        parts.push(
          t(
            `Du har ${formatKr(Math.max(0, f.remainingOre))} kvar till ${cat}, varav ${formatKr(f.remainingOre - c.availableOre)} är reserverat för ${names}. Köpet kostar ${price}, så det fattas ${formatKr(c.shortfallOre)} även om du använder reservationen`,
            `You have ${formatKr(Math.max(0, f.remainingOre))} left for ${cat}, of which ${formatKr(f.remainingOre - c.availableOre)} is reserved for ${names}. The purchase costs ${price}, so you are ${formatKr(c.shortfallOre)} short even if you use the reservation`,
          ),
        );
        rows.push({ label: t(`Kvar till ${cat} (inkl. reserverat)`, `Left for ${cat} (incl. reserved)`), amountOre: f.remainingOre });
      } else {
        parts.push(
          t(
            `Du har ${formatKr(Math.max(0, c.availableOre))} kvar till ${cat}. Köpet kostar ${price}, så det fattas ${formatKr(c.shortfallOre)} i budgeten för ${cat}`,
            `You have ${formatKr(Math.max(0, c.availableOre))} left for ${cat}. The purchase costs ${price}, so your ${cat} budget is ${formatKr(c.shortfallOre)} short`,
          ),
        );
        rows.push({ label: t(`Kvar till ${cat}`, `Left for ${cat}`), amountOre: c.availableOre });
      }
      rows.push({ label: buy, amountOre: -r.priceOre, negative: true });
      rows.push({ label: t("Fattas", "Short by"), amountOre: c.shortfallOre, strong: true });
      break;
    }
    case "no_budget":
      parts.push(t(`Du har ingen budget för ${cat} den här månaden, så vi kan bara jämföra med pengarna du har kvar till lön`, `You have no ${cat} budget this month, so we can only compare with what you have left until payday`));
      break;
    case "no_category":
      parts.push(t("Köpet har ingen kategori, så vi kan bara jämföra med pengarna du har kvar till lön", "The purchase has no category, so we can only compare with what you have left until payday"));
      break;
  }

  const when = (d: string) => formatWhen(d, cash.today, locale);
  const paydayText = cash.payday ? t(`Efter lönen ${when(cash.payday)} kan du kolla igen.`, `Check again after payday ${when(cash.payday)}.`) : "";
  const categoryOk = c.status === "fits" || c.status === "fits_planned";
  switch (r.cash.status) {
    case "ok": {
      if (categoryOk && r.cash.savingPlannedOre > 0) {
        parts[parts.length - 1] += t(`, och ditt planerade sparande på ${formatKr(r.cash.savingPlannedOre)} ryms fortfarande`, `, and your planned saving of ${formatKr(r.cash.savingPlannedOre)} still fits`);
      }
      if (c.status === "no_budget" || c.status === "no_category") {
        parts.push(
          t(
            `Efter köpet på ${price} har du ${formatKr(r.cash.leftAfterOre)} kvar till lön, när räkningar och planerat sparande är undantagna`,
            `After this ${price} purchase you have ${formatKr(r.cash.leftAfterOre)} left until payday, once bills and planned saving are set aside`,
          ),
        );
        rows.push({ label: t("Kvar till lön nu", "Left until payday now"), amountOre: r.cash.leftBeforeOre });
        rows.push({ label: buy, amountOre: -r.priceOre, negative: true });
        rows.push({ label: t("Kvar till lön efter köpet", "Left until payday afterwards"), amountOre: r.cash.leftAfterOre, strong: true });
      }
      break;
    }
    case "bill_short": {
      const b = r.cash.bill!;
      if (categoryOk) headline = t("Vänta till efter lön", "Wait until after payday");
      parts.push(
        t(
          `Däremot skulle du sakna ${formatKr(r.cash.shortfallOre)} till ${lc(b.label)} ${b.overdue ? "som redan har förfallit" : when(b.date)}. ${paydayText}`,
          `However, you would be ${formatKr(r.cash.shortfallOre)} short for ${lc(b.label)} ${b.overdue ? "which is already overdue" : when(b.date)}. ${paydayText}`,
        ).trim(),
      );
      rows.push({ label: t(`Saknas till ${lc(b.label)} (${b.overdue ? "förfallen" : formatDate(b.date)})`, `Short for ${lc(b.label)} (${b.overdue ? "overdue" : formatDate(b.date, "en")})`), amountOre: r.cash.shortfallOre, strong: true });
      break;
    }
    case "already_short": {
      const b = r.cash.bill!;
      if (categoryOk) headline = t("Vänta till efter lön", "Wait until after payday");
      parts.push(
        t(
          `Redan utan köpet saknas ${formatKr(r.cash.shortfallOre)} till ${lc(b.label)} ${b.overdue ? "som har förfallit" : when(b.date)}. ${paydayText}`,
          `Even without this purchase you are ${formatKr(r.cash.shortfallOre)} short for ${lc(b.label)} ${b.overdue ? "which is overdue" : when(b.date)}. ${paydayText}`,
        ).trim(),
      );
      rows.push({ label: t(`Saknas redan till ${lc(b.label)}`, `Already short for ${lc(b.label)}`), amountOre: r.cash.shortfallOre, strong: true });
      break;
    }
    case "saving_short":
      parts.push(
        t(
          `Däremot ryms inte hela ditt planerade sparande på ${formatKr(r.cash.savingPlannedOre)} före lön – det skulle fattas ${formatKr(r.cash.savingShortOre)}`,
          `However, your planned saving of ${formatKr(r.cash.savingPlannedOre)} would no longer fit before payday – it would be ${formatKr(r.cash.savingShortOre)} short`,
        ),
      );
      rows.push({ label: t("Fattas till planerat sparande", "Short for planned saving"), amountOre: r.cash.savingShortOre, strong: true });
      break;
    case "unknown":
      notes.push(t("Vi känner inte till ditt saldo, så svaret gäller bara budgeten – inte räkningar och pengar fram till lön.", "We don't know your balance, so this answer only covers the budget – not bills or cash until payday."));
      break;
  }

  if (r.move) {
    notes.push(
      t(
        `Du har ${formatKr(r.move.fromFreeOre)} oreserverat i ${lc(r.move.fromName)}. Om du vill kan du flytta ${formatKr(r.move.amountOre)} därifrån.`,
        `You have ${formatKr(r.move.fromFreeOre)} unreserved in ${lc(r.move.fromName)}. If you like, you can move ${formatKr(r.move.amountOre)} from there.`,
      ),
    );
  }
  if (cash.known && cash.estimate) notes.push(t("Saldot är en uppskattning. ", "The balance is an estimate. ") + cash.notes.join(" "));

  const text = parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (/[.!?…]$/.test(p) ? p : p + "."))
    .join(" ");
  return { headline, text, rows, notes };
}
