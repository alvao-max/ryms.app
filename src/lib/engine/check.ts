import { categoryFigures } from "./budget";
import { leftUntilPayday, simulatePurchase } from "./cash";
import type { CheckInput, CheckResult } from "./types";

/**
 * Kärnan i "Ryms det?". Ren funktion: samma indata ger alltid samma svar.
 * Alla belopp är heltal i öre.
 */
export function checkPurchase(input: CheckInput): CheckResult {
  const price = input.priceOre;
  if (!Number.isInteger(price) || price <= 0) throw new Error("Priset måste vara ett positivt heltal i öre");

  // ---- Kategori ----
  const cat = input.category;
  const category: CheckResult["category"] = {
    status: "no_category",
    name: cat?.name ?? null,
    figures: null,
    availableOre: 0,
    afterOre: 0,
    shortfallOre: 0,
    usesReservedOre: 0,
    reservedFor: [],
    planned: null,
    overPlannedOre: 0,
  };

  if (cat && cat.budgetOre == null) {
    category.status = "no_budget";
  } else if (cat) {
    const planned = input.plannedPurchaseId ? cat.reservations.find((r) => r.id === input.plannedPurchaseId) ?? null : null;
    // Reservationer för ANDRA planerade köp än det här.
    const others = cat.reservations.filter((r) => r.id !== planned?.id);
    const f = categoryFigures(cat);
    const othersReserved = others.reduce((s, r) => s + r.maxOre, 0);
    const available = f.remainingOre - othersReserved; // inkl. den egna reservationen om köpet är planerat
    category.figures = f;
    category.planned = planned;
    category.availableOre = available;
    category.afterOre = available - price;
    category.reservedFor = others;

    if (price <= available) {
      if (planned) {
        if (price <= planned.maxOre) category.status = "fits_planned";
        else {
          category.status = "over_planned";
          category.overPlannedOre = price - planned.maxOre;
        }
      } else category.status = "fits";
    } else if (price <= f.remainingOre && othersReserved > 0) {
      category.status = "uses_reservation";
      category.usesReservedOre = price - Math.max(0, available);
    } else {
      category.status = "short";
      if (othersReserved > 0 && available < f.remainingOre) {
        // Räcker inte ens om reservationerna används.
        category.shortfallOre = price - Math.max(0, f.remainingOre);
        category.usesReservedOre = Math.max(0, Math.min(othersReserved, f.remainingOre));
      } else {
        category.shortfallOre = price - Math.max(0, available);
      }
      if (planned) category.overPlannedOre = Math.max(0, price - planned.maxOre);
    }
  }

  // ---- Pengar fram till lön ----
  const left = leftUntilPayday(input.cash);
  const cash: CheckResult["cash"] = {
    status: "unknown",
    leftBeforeOre: left.amountOre,
    leftAfterOre: left.amountOre - price,
    bill: null,
    shortfallOre: 0,
    savingShortOre: 0,
    savingPlannedOre: left.savingOre,
  };
  if (input.cash.known) {
    const base = simulatePurchase(input.cash, 0);
    const sim = simulatePurchase(input.cash, price);
    if (base.firstShort) {
      cash.status = "already_short";
      cash.bill = base.firstShort.event;
      cash.shortfallOre = base.firstShort.shortfallOre;
    } else if (sim.firstShort) {
      cash.status = "bill_short";
      cash.bill = sim.firstShort.event;
      cash.shortfallOre = sim.firstShort.shortfallOre;
    } else if (sim.savingShortOre > base.savingShortOre) {
      cash.status = "saving_short";
      cash.savingShortOre = sim.savingShortOre;
    } else {
      cash.status = "ok";
      cash.savingShortOre = sim.savingShortOre;
    }
  }

  // ---- Flyttförslag: bara om det finns tillräckligt med oreserverade pengar någon annanstans ----
  let move: CheckResult["move"] = null;
  const need = category.status === "short" ? category.shortfallOre + category.usesReservedOre : category.status === "uses_reservation" ? category.usesReservedOre : 0;
  const cashAllows = cash.status === "ok" || cash.status === "unknown";
  if (cat && need > 0 && cashAllows) {
    const donors = (input.otherCategories ?? [])
      .filter((c) => c.id !== cat.id && c.budgetOre != null)
      .map((c) => ({ c, free: categoryFigures(c).freeOre }))
      .filter((d) => d.free >= need)
      .sort((a, b) => b.free - a.free);
    if (donors[0]) move = { fromCategoryId: donors[0].c.id, fromName: donors[0].c.name, toCategoryId: cat.id, amountOre: need, fromFreeOre: donors[0].free };
  }

  // ---- Samlat svar ----
  let verdict: CheckResult["verdict"] = "yes";
  if (category.status === "short" || cash.status === "bill_short" || cash.status === "already_short") verdict = "no";
  else if (
    category.status === "uses_reservation" ||
    category.status === "over_planned" ||
    category.status === "no_budget" ||
    category.status === "no_category" ||
    cash.status === "saving_short"
  )
    verdict = "caution";

  return { verdict, priceOre: price, category, cash, move };
}
