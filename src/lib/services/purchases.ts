import { getDb, newId } from "../db";
import { bi } from "../i18n";
import { monthOf, nowISO } from "../dates";
import { categoryFigures } from "../engine/budget";
import { checkPurchase } from "../engine/check";
import type { Locale } from "../i18n";
import { explainCheck, type Explanation } from "../engine/explain";
import type { CheckResult } from "../engine/types";
import { cashSnapshot, categorySnapshots } from "./overview";
import { getMonthPlan, setPlanValue } from "./plan";
import { addManualTx } from "./transactions";
import { envsFor, type User } from "./users";

export class PurchaseError extends Error {}

export interface CheckRequest {
  itemName: string;
  priceOre: number;
  categoryId: string | null;
  plannedPurchaseId?: string | null;
}
export interface Evaluation {
  request: CheckRequest;
  categoryName: string | null;
  result: CheckResult;
  explanation: Explanation;
}

function validate(req: CheckRequest): CheckRequest {
  const itemName = String(req.itemName ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!itemName) throw new PurchaseError(bi("Skriv vad det är du vill köpa.", "Enter what you want to buy."));
  if (!Number.isInteger(req.priceOre) || req.priceOre <= 0) throw new PurchaseError(bi("Ange vad den kostar.", "Enter what it costs."));
  if (req.priceOre > 100_000_000_00) throw new PurchaseError(bi("Beloppet är för stort.", "The amount is too large."));
  return { itemName, priceOre: req.priceOre, categoryId: req.categoryId || null, plannedPurchaseId: req.plannedPurchaseId || null };
}

/** Räknar ut svaret mot budgeten som den ser ut just nu. Ändrar ingenting. */
export function evaluate(user: User, raw: CheckRequest, today: string, locale: Locale = "sv"): Evaluation {
  const req = validate(raw);
  const month = monthOf(today);
  const plan = getMonthPlan(user.id, month);
  const cats = categorySnapshots(user.id, plan, envsFor(user));
  const category = req.categoryId ? cats.find((c) => c.id === req.categoryId) ?? null : null;
  if (req.categoryId && !category) throw new PurchaseError(bi("Kategorin hittades inte.", "The category was not found."));
  let plannedId = req.plannedPurchaseId ?? null;
  if (plannedId && !category?.reservations.some((r) => r.id === plannedId)) plannedId = null; // redan köpt, borttagen eller annan kategori
  const cash = cashSnapshot(user, today, locale);
  const result = checkPurchase({ itemName: req.itemName, priceOre: req.priceOre, category, plannedPurchaseId: plannedId, cash, otherCategories: cats });
  return { request: { ...req, plannedPurchaseId: plannedId }, categoryName: category?.name ?? null, result, explanation: explainCheck(result, cash, locale) };
}

/** Planerade köp som kan vara det användaren håller i handen. Användaren bekräftar alltid själv. */
export function plannedCandidates(user: User, itemName: string, categoryId: string | null, today: string): { id: string; name: string; maxOre: number; categoryId: string; likely: boolean }[] {
  const plan = getMonthPlan(user.id, monthOf(today));
  const words = (s: string) => s.toLocaleLowerCase("sv-SE").split(/[^a-zåäöé0-9]+/).filter((w) => w.length >= 4);
  const item = words(itemName);
  return plan.planned
    .filter((p) => p.status === "planned")
    .map((p) => {
      const pw = words(p.name);
      const overlap = item.some((a) => pw.some((b) => a.includes(b) || b.includes(a) || stem(a) === stem(b)));
      return { id: p.id, name: p.name, maxOre: p.maxOre, categoryId: p.categoryId, likely: overlap };
    })
    .filter((p) => p.likely || (categoryId && p.categoryId === categoryId));
}
function stem(w: string): string {
  return w.replace(/(arna|erna|orna|or|ar|er|en|et|an|na|n|a)$/u, "");
}

/** "Jag köpte den" – enda stället där ett köp från kollen påverkar budgeten. */
export function recordBought(user: User, raw: CheckRequest & { checkId?: string | null }, today: string): { txId: string; checkId: string } {
  const req = validate(raw);
  const db = getDb();
  if (req.categoryId && !db.prepare("SELECT 1 FROM categories WHERE id = ? AND user_id = ?").get(req.categoryId, user.id)) throw new PurchaseError(bi("Kategorin hittades inte.", "The category was not found."));
  return db.transaction(() => {
    let plannedId: string | null = null;
    if (req.plannedPurchaseId) {
      // Reservationen används exakt en gång: bara ett köp som fortfarande är 'planned' kan knytas.
      const upd = db.prepare("UPDATE planned_purchases SET status = 'bought' WHERE id = ? AND user_id = ? AND status = 'planned'").run(req.plannedPurchaseId, user.id);
      if (upd.changes === 1) plannedId = req.plannedPurchaseId;
    }
    const txId = addManualTx(user.id, { amountOre: -req.priceOre, date: today, description: req.itemName, itemName: req.itemName, kind: "expense", categoryId: req.categoryId, plannedPurchaseId: plannedId });
    if (plannedId) db.prepare("UPDATE planned_purchases SET tx_id = ? WHERE id = ? AND user_id = ?").run(txId, plannedId, user.id);
    const now = nowISO();
    let checkId = raw.checkId ?? null;
    if (checkId && db.prepare("SELECT 1 FROM checks WHERE id = ? AND user_id = ?").get(checkId, user.id)) {
      db.prepare("UPDATE checks SET status = 'bought', item_name = ?, price_ore = ?, category_id = ?, planned_purchase_id = ?, tx_id = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(req.itemName, req.priceOre, req.categoryId, plannedId, txId, now, checkId, user.id);
    } else {
      checkId = newId();
      db.prepare("INSERT INTO checks (id, user_id, item_name, price_ore, category_id, planned_purchase_id, status, tx_id, created_at, updated_at) VALUES (?,?,?,?,?,?,'bought',?,?,?)").run(checkId, user.id, req.itemName, req.priceOre, req.categoryId, plannedId, txId, now, now);
    }
    return { txId, checkId };
  })();
}

/** "Spara till senare" – påverkar inte budgeten. */
export function saveForLater(user: User, raw: CheckRequest & { checkId?: string | null; imageId?: string | null; source?: string }): string {
  const req = validate(raw);
  const db = getDb();
  if (raw.imageId && !db.prepare("SELECT 1 FROM images WHERE id = ? AND user_id = ?").get(raw.imageId, user.id)) throw new PurchaseError(bi("Bilden hittades inte.", "The image was not found."));
  if (req.categoryId && !db.prepare("SELECT 1 FROM categories WHERE id = ? AND user_id = ?").get(req.categoryId, user.id)) throw new PurchaseError(bi("Kategorin hittades inte.", "The category was not found."));
  const now = nowISO();
  if (raw.checkId && db.prepare("SELECT 1 FROM checks WHERE id = ? AND user_id = ? AND status != 'bought'").get(raw.checkId, user.id)) {
    db.prepare("UPDATE checks SET status = 'saved', item_name = ?, price_ore = ?, category_id = ?, planned_purchase_id = ?, image_id = COALESCE(?, image_id), updated_at = ? WHERE id = ? AND user_id = ?").run(req.itemName, req.priceOre, req.categoryId, req.plannedPurchaseId, raw.imageId ?? null, now, raw.checkId, user.id);
    return raw.checkId;
  }
  const id = newId();
  db.prepare("INSERT INTO checks (id, user_id, item_name, price_ore, category_id, planned_purchase_id, status, source, image_id, created_at, updated_at) VALUES (?,?,?,?,?,?,'saved',?,?,?,?)").run(id, user.id, req.itemName, req.priceOre, req.categoryId, req.plannedPurchaseId, raw.source ?? "manual", raw.imageId ?? null, now, now);
  return id;
}

/** "Avstå" – inget köp och ingen insättning till sparande. Bara en markering på den sparade saken. */
export function skipCheck(user: User, checkId: string): void {
  getDb().prepare("UPDATE checks SET status = 'skipped', updated_at = ? WHERE id = ? AND user_id = ? AND status = 'saved'").run(nowISO(), checkId, user.id);
}

export interface SavedCheck {
  id: string;
  item_name: string;
  price_ore: number;
  category_id: string | null;
  planned_purchase_id: string | null;
  status: "saved" | "bought" | "skipped";
  image_id: string | null;
  created_at: string;
  updated_at: string;
}
export function getCheck(user: User, id: string): SavedCheck | null {
  return (getDb().prepare("SELECT id, item_name, price_ore, category_id, planned_purchase_id, status, image_id, created_at, updated_at FROM checks WHERE id = ? AND user_id = ?").get(id, user.id) as SavedCheck | undefined) ?? null;
}
export function listChecks(user: User, status: SavedCheck["status"]): SavedCheck[] {
  return getDb().prepare("SELECT id, item_name, price_ore, category_id, planned_purchase_id, status, image_id, created_at, updated_at FROM checks WHERE user_id = ? AND status = ? ORDER BY updated_at DESC LIMIT 100").all(user.id, status) as SavedCheck[];
}
export function deleteCheck(user: User, id: string): string | null {
  const row = getCheck(user, id);
  if (!row) return null;
  getDb().prepare("DELETE FROM checks WHERE id = ? AND user_id = ?").run(id, user.id);
  return row.image_id;
}

/** Flyttar budget mellan två kategorier, bara för den här månaden och bara av oreserverade pengar. */
export function moveBudget(user: User, input: { fromCategoryId: string; toCategoryId: string; amountOre: number }, today: string): void {
  if (!Number.isInteger(input.amountOre) || input.amountOre <= 0) throw new PurchaseError(bi("Ogiltigt belopp", "Invalid amount"));
  const month = monthOf(today);
  const plan = getMonthPlan(user.id, month);
  const cats = categorySnapshots(user.id, plan, envsFor(user));
  const from = cats.find((c) => c.id === input.fromCategoryId);
  const to = cats.find((c) => c.id === input.toCategoryId);
  if (!from || !to || from.id === to.id || from.budgetOre == null) throw new PurchaseError(bi("Kategorin hittades inte.", "The category was not found."));
  if (categoryFigures(from).freeOre < input.amountOre) throw new PurchaseError(bi("Det finns inte tillräckligt med oreserverade pengar att flytta.", "There is not enough unreserved money to move."));
  getDb().transaction(() => {
    setPlanValue(user.id, { kind: "category", refId: from.id, month, scope: "month", amountOre: from.budgetOre! - input.amountOre });
    setPlanValue(user.id, { kind: "category", refId: to.id, month, scope: "month", amountOre: (to.budgetOre ?? 0) + input.amountOre });
  })();
}
