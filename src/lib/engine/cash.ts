import type { CashSnapshot, LeftUntilPayday, TimelineEvent } from "./types";

function ordered(events: TimelineEvent[]): TimelineEvent[] {
  // Samma dag: insättningar räknas före räkningar.
  return [...events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.type === b.type ? 0 : a.type === "inflow" ? -1 : 1));
}

/** "Kvar till lön": saldo − räkningar före lön + bekräftade insättningar − planerat sparande som återstår. */
export function leftUntilPayday(cash: CashSnapshot): LeftUntilPayday {
  const billsOre = cash.events.filter((e) => e.type === "bill").reduce((s, e) => s + e.amountOre, 0);
  const inflowOre = cash.events.filter((e) => e.type === "inflow").reduce((s, e) => s + e.amountOre, 0);
  const savingOre = cash.savings.reduce((s, g) => s + g.remainingOre, 0);
  return {
    known: cash.known,
    cashOre: cash.cashOre,
    billsOre,
    inflowOre,
    savingOre,
    amountOre: cash.cashOre - billsOre + inflowOre - savingOre,
  };
}

export interface Simulation {
  /** första räkningen som inte kan betalas, och hur mycket som saknas den dagen */
  firstShort: { event: TimelineEvent; shortfallOre: number } | null;
  /** saldo efter alla händelser fram till lön, före sparande */
  endOre: number;
  savingShortOre: number;
}

/** Går igenom händelserna i datumordning efter ett köp idag. */
export function simulatePurchase(cash: CashSnapshot, purchaseOre: number): Simulation {
  let running = cash.cashOre - purchaseOre;
  let firstShort: Simulation["firstShort"] = null;
  for (const e of ordered(cash.events)) {
    running += e.type === "inflow" ? e.amountOre : -e.amountOre;
    if (e.type === "bill" && running < 0 && !firstShort) firstShort = { event: e, shortfallOre: -running };
  }
  const savingOre = cash.savings.reduce((s, g) => s + g.remainingOre, 0);
  const savingShortOre = Math.min(savingOre, Math.max(0, savingOre - Math.max(0, running)));
  return { firstShort, endOre: running, savingShortOre };
}
