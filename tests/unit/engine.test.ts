import { describe, expect, it } from "vitest";
import { checkPurchase } from "@/lib/engine/check";
import { explainCheck } from "@/lib/engine/explain";
import { leftUntilPayday } from "@/lib/engine/cash";
import { categoryFigures } from "@/lib/engine/budget";
import { matchBankToManual } from "@/lib/engine/reconcile";
import { formatKr, parseKr } from "@/lib/money";
import type { CashSnapshot, CategorySnapshot } from "@/lib/engine/types";

const kr = (n: number) => n * 100;
const TODAY = "2026-11-18"; // onsdag
function cash(over: Partial<CashSnapshot> = {}): CashSnapshot {
  return {
    known: true, cashOre: kr(20000), baseOre: kr(20000), adjustments: [], estimate: false, notes: [],
    today: TODAY, payday: "2026-11-23", horizon: "2026-11-23", events: [], savings: [], ...over,
  };
}
function clothes(over: Partial<CategorySnapshot> = {}): CategorySnapshot {
  return { id: "klader", name: "Kläder", budgetOre: kr(1500), spentOre: kr(600), reservations: [], ...over };
}
const norm = (s: string) => s.replace(/ /g, " ");

describe("pengar", () => {
  it("formaterar svenska kronor från öre", () => {
    expect(norm(formatKr(120000))).toBe("1 200 kr");
    expect(norm(formatKr(69950))).toBe("699,50 kr");
    expect(norm(formatKr(-18000))).toBe("−180 kr");
    expect(norm(formatKr(123456789))).toBe("1 234 567,89 kr");
  });
  it("tolkar svensk inmatning utan flyttal", () => {
    expect(parseKr("1 200")).toBe(120000);
    expect(parseKr("699:-")).toBe(69900);
    expect(parseKr("699,5 kr")).toBe(69950);
    expect(parseKr("1.200,00")).toBe(120000);
    expect(parseKr("12.50")).toBe(1250);
    expect(parseKr("0,1")).toBe(10);
    expect(parseKr("abc")).toBeNull();
    expect(parseKr("-5")).toBeNull();
    expect(parseKr("")).toBeNull();
  });
});

describe("acceptansfall 1: jacka 699 kr", () => {
  it("mot 900 kr oreserverat blir exakt 201 kr kvar", () => {
    const r = checkPurchase({ itemName: "Jacka", priceOre: kr(699), category: clothes(), cash: cash({ savings: [{ goalId: "g", name: "Resa", plannedOre: kr(1000), savedOre: 0, remainingOre: kr(1000) }] }) });
    expect(r.verdict).toBe("yes");
    expect(r.category.availableOre).toBe(kr(900));
    expect(r.category.afterOre).toBe(kr(201));
    const e = explainCheck(r, cash());
    expect(norm(e.text)).toBe("Ja, det ryms. Du har 900 kr kvar till kläder. Efter köpet på 699 kr har du 201 kr kvar, och ditt planerade sparande på 1 000 kr ryms fortfarande.");
  });
  it("mot 400 kr fattas exakt 299 kr", () => {
    const c = cash();
    const r = checkPurchase({ itemName: "Jacka", priceOre: kr(699), category: clothes({ budgetOre: kr(1000) }), cash: c });
    expect(r.verdict).toBe("no");
    expect(r.category.status).toBe("short");
    expect(r.category.shortfallOre).toBe(kr(299));
    expect(norm(explainCheck(r, c).text)).toBe("Du har 400 kr kvar till kläder. Köpet kostar 699 kr, så det fattas 299 kr i budgeten för kläder.");
  });
  it("hanterar ören exakt", () => {
    const r = checkPurchase({ itemName: "X", priceOre: 69999, category: clothes({ budgetOre: 150001 }), cash: cash() });
    expect(r.category.afterOre).toBe(150001 - 60000 - 69999);
  });
});

describe("acceptansfall 2: reserverade kängor", () => {
  const boots = { id: "boots", name: "Vinterkängor", maxOre: kr(1200) };
  const cat = clothes({ spentOre: 0, reservations: [boots] });
  it("visar 300 kr kvar för andra kläder", () => {
    expect(categoryFigures(cat)).toMatchObject({ remainingOre: kr(1500), reservedOre: kr(1200), freeOre: kr(300) });
  });
  it("de planerade kängorna ryms i sin reservation", () => {
    const r = checkPurchase({ itemName: "Vinterkängor", priceOre: kr(1149), category: cat, plannedPurchaseId: "boots", cash: cash() });
    expect(r.verdict).toBe("yes");
    expect(r.category.status).toBe("fits_planned");
    expect(r.category.afterOre).toBe(kr(351)); // 300 + 51 som blev över
  });
  it("en orelaterad jacka för 699 kr skulle ta 399 kr av reservationen", () => {
    const c = cash();
    const r = checkPurchase({ itemName: "Jacka", priceOre: kr(699), category: cat, cash: c });
    expect(r.category.status).toBe("uses_reservation");
    expect(r.category.usesReservedOre).toBe(kr(399));
    expect(r.verdict).toBe("caution");
    const t = norm(explainCheck(r, c).text);
    expect(t).toContain("1 200 kr är reserverat för ”Vinterkängor”");
    expect(t).toContain("skulle ta 399 kr av pengarna för ”Vinterkängor”");
  });
  it("kängor över maxbeloppet tar mellanskillnaden från oreserverat", () => {
    const r = checkPurchase({ itemName: "Kängor", priceOre: kr(1400), category: cat, plannedPurchaseId: "boots", cash: cash() });
    expect(r.category.status).toBe("over_planned");
    expect(r.category.overPlannedOre).toBe(kr(200));
    expect(r.category.afterOre).toBe(kr(100));
  });
  it("räcker inte ens med reservationen", () => {
    const r = checkPurchase({ itemName: "Kappa", priceOre: kr(1800), category: cat, cash: cash() });
    expect(r.category.status).toBe("short");
    expect(r.category.shortfallOre).toBe(kr(300));
  });
});

describe("acceptansfall 3: räkning före lön", () => {
  const el = { id: "el", type: "bill" as const, label: "Elräkningen", date: "2026-11-20", amountOre: kr(850) };
  it("pekar ut räkning, datum och hur mycket som saknas", () => {
    const c = cash({ cashOre: kr(1369), baseOre: kr(1369), events: [el] });
    const r = checkPurchase({ itemName: "Jacka", priceOre: kr(699), category: clothes(), cash: c });
    expect(r.category.status).toBe("fits");
    expect(r.cash.status).toBe("bill_short");
    expect(r.cash.bill?.id).toBe("el");
    expect(r.cash.shortfallOre).toBe(kr(180));
    expect(r.verdict).toBe("no");
    const e = explainCheck(r, c);
    expect(norm(e.text)).toBe(
      "Det ryms i budgeten för kläder. Du har 900 kr kvar till kläder. Efter köpet på 699 kr har du 201 kr kvar. Däremot skulle du sakna 180 kr till elräkningen på fredag. Efter lönen på måndag kan du kolla igen.",
    );
  });
  it("tar hänsyn till när bekräftade insättningar kommer", () => {
    const late = { id: "in", type: "inflow" as const, label: "Swish", date: "2026-11-21", amountOre: kr(500) };
    const early = { ...late, date: "2026-11-19" };
    const base = { cashOre: kr(1369), baseOre: kr(1369) };
    const p = { itemName: "Jacka", priceOre: kr(699), category: clothes() };
    expect(checkPurchase({ ...p, cash: cash({ ...base, events: [el, late] }) }).cash.status).toBe("bill_short");
    expect(checkPurchase({ ...p, cash: cash({ ...base, events: [el, early] }) }).cash.status).toBe("ok");
  });
  it("kvar till lön = saldo − räkningar − återstående sparande", () => {
    const c = cash({ cashOre: kr(5000), events: [el], savings: [{ goalId: "g", name: "Resa", plannedOre: kr(1000), savedOre: kr(400), remainingOre: kr(600) }] });
    expect(leftUntilPayday(c).amountOre).toBe(kr(5000 - 850 - 600));
  });
  it("säger till om sparandet inte ryms", () => {
    const c = cash({ cashOre: kr(2000), events: [el], savings: [{ goalId: "g", name: "Resa", plannedOre: kr(1000), savedOre: 0, remainingOre: kr(1000) }] });
    const r = checkPurchase({ itemName: "Jacka", priceOre: kr(699), category: clothes(), cash: c });
    expect(r.cash.status).toBe("saving_short");
    expect(r.cash.savingShortOre).toBe(kr(549));
  });
  it("okänt saldo: svarar bara för budgeten och säger det", () => {
    const c = cash({ known: false, cashOre: 0 });
    const r = checkPurchase({ itemName: "Jacka", priceOre: kr(699), category: clothes(), cash: c });
    expect(r.cash.status).toBe("unknown");
    expect(explainCheck(r, c).notes.join(" ")).toContain("känner inte till ditt saldo");
  });
});

describe("flyttförslag", () => {
  const short = clothes({ budgetOre: kr(1000) }); // 400 kvar
  it("föreslås bara när en annan kategori har tillräckligt oreserverat", () => {
    const rich: CategorySnapshot = { id: "noje", name: "Nöje", budgetOre: kr(1000), spentOre: kr(200), reservations: [] };
    const reserved: CategorySnapshot = { ...rich, reservations: [{ id: "k", name: "Konsert", maxOre: kr(600) }] };
    const p = { itemName: "Jacka", priceOre: kr(699), category: short, cash: cash() };
    expect(checkPurchase({ ...p, otherCategories: [rich] }).move).toMatchObject({ fromCategoryId: "noje", amountOre: kr(299) });
    expect(checkPurchase({ ...p, otherCategories: [reserved] }).move).toBeNull(); // bara 200 oreserverat
    expect(checkPurchase({ ...p, otherCategories: [] }).move).toBeNull();
  });
});

describe("matchning bank ↔ manuellt", () => {
  it("parar entydiga köp automatiskt", () => {
    const o = matchBankToManual([{ id: "b", amountOre: -69900, date: "2026-11-19" }], [{ id: "m", amountOre: -69900, date: "2026-11-18" }]);
    expect(o.auto).toEqual([{ bankId: "b", manualId: "m" }]);
  });
  it("lämnar tvetydiga fall till användaren", () => {
    const o = matchBankToManual(
      [{ id: "b", amountOre: -69900, date: "2026-11-19" }],
      [{ id: "m1", amountOre: -69900, date: "2026-11-18" }, { id: "m2", amountOre: -69900, date: "2026-11-19" }],
    );
    expect(o.auto).toEqual([]);
    expect(o.ambiguous).toEqual([{ bankId: "b", candidates: ["m1", "m2"] }]);
  });
  it("matchar inte olika belopp eller för gamla köp", () => {
    expect(matchBankToManual([{ id: "b", amountOre: -69900, date: "2026-11-30" }], [{ id: "m", amountOre: -69900, date: "2026-11-18" }]).auto).toEqual([]);
    expect(matchBankToManual([{ id: "b", amountOre: -69800, date: "2026-11-18" }], [{ id: "m", amountOre: -69900, date: "2026-11-18" }]).auto).toEqual([]);
  });
});
