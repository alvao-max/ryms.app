import type { CategoryFigures, CategorySnapshot } from "./types";

export function categoryFigures(c: CategorySnapshot): CategoryFigures {
  const budgetOre = c.budgetOre ?? 0;
  const reservedOre = c.reservations.reduce((s, r) => s + r.maxOre, 0);
  const remainingOre = budgetOre - c.spentOre;
  return { budgetOre, spentOre: c.spentOre, reservedOre, remainingOre, freeOre: remainingOre - reservedOre };
}
