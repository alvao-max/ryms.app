import { getDb, newId } from "../db";
import { bi } from "../i18n";
import { addMonths, dateInMonth, isMonth, nowISO, paydayFor } from "../dates";

export type PlanKind = "category" | "bill" | "income" | "saving";
export type Scope = "template" | "month";
export class PlanError extends Error {}

interface PlanRow {
  kind: PlanKind;
  ref_id: string;
  month: string;
  scope: Scope;
  amount_ore: number;
  day: number | null;
  removed: number;
}

/**
 * Gällande värde per rad för en månad: månadens egen ändring går före mallen,
 * och mallen är den senaste som börjat gälla (month <= M).
 */
function resolve(userId: string, month: string): Map<string, PlanRow> {
  const rows = getDb()
    .prepare(
      `SELECT kind, ref_id, month, scope, amount_ore, day, removed FROM plan_values
       WHERE user_id = ? AND ((scope = 'template' AND month <= ?) OR (scope = 'month' AND month = ?))
       ORDER BY month ASC`,
    )
    .all(userId, month, month) as PlanRow[];
  const out = new Map<string, PlanRow>();
  for (const r of rows) if (r.scope === "template") out.set(`${r.kind}:${r.ref_id}`, r);
  for (const r of rows) if (r.scope === "month") out.set(`${r.kind}:${r.ref_id}`, r);
  return out;
}

export interface MonthPlan {
  month: string;
  categories: { id: string; name: string; icon: string; budgetOre: number | null; scope: Scope | null }[];
  bills: { id: string; name: string; direction: "out" | "in"; amountOre: number; day: number; dueDate: string; scope: Scope; paid: { date: string; txId: string | null } | null }[];
  income: { amountOre: number; day: number; payday: string; scope: Scope } | null;
  savings: { goalId: string; name: string; plannedOre: number; scope: Scope | null }[];
  planned: { id: string; name: string; categoryId: string; maxOre: number; status: "planned" | "bought" | "cancelled"; txId: string | null }[];
}

export function getMonthPlan(userId: string, month: string): MonthPlan {
  if (!isMonth(month)) throw new PlanError(bi("Ogiltig månad", "Invalid month"));
  const db = getDb();
  const values = resolve(userId, month);
  const active = (kind: PlanKind, ref: string) => {
    const v = values.get(`${kind}:${ref}`);
    return v && !v.removed ? v : null;
  };

  const cats = db.prepare("SELECT id, name, icon FROM categories WHERE user_id = ? AND archived = 0 ORDER BY sort, name").all(userId) as { id: string; name: string; icon: string }[];
  const bills = db.prepare("SELECT id, name, direction FROM bills WHERE user_id = ?").all(userId) as { id: string; name: string; direction: "out" | "in" }[];
  const goals = db.prepare("SELECT id, name FROM goals WHERE user_id = ? AND archived = 0 ORDER BY created_at").all(userId) as { id: string; name: string }[];
  const payments = db.prepare("SELECT bill_id, paid_date, tx_id FROM bill_payments WHERE user_id = ? AND month = ?").all(userId, month) as { bill_id: string; paid_date: string; tx_id: string | null }[];
  const planned = db
    .prepare("SELECT id, name, category_id, max_ore, status, tx_id FROM planned_purchases WHERE user_id = ? AND month = ? AND status != 'cancelled' ORDER BY created_at")
    .all(userId, month) as { id: string; name: string; category_id: string; max_ore: number; status: "planned" | "bought"; tx_id: string | null }[];

  const inc = active("income", "salary");
  return {
    month,
    categories: cats.map((c) => {
      const v = active("category", c.id);
      return { ...c, budgetOre: v ? v.amount_ore : null, scope: v?.scope ?? null };
    }),
    bills: bills
      .flatMap((b) => {
        const v = active("bill", b.id);
        if (!v) return [];
        const day = v.day ?? 28;
        const p = payments.find((x) => x.bill_id === b.id);
        return [{ id: b.id, name: b.name, direction: b.direction, amountOre: v.amount_ore, day, dueDate: dateInMonth(month, day), scope: v.scope, paid: p ? { date: p.paid_date, txId: p.tx_id } : null }];
      })
      .sort((a, b) => a.day - b.day || a.name.localeCompare(b.name, "sv")),
    income: inc ? { amountOre: inc.amount_ore, day: inc.day ?? 25, payday: paydayFor(month, inc.day ?? 25), scope: inc.scope } : null,
    savings: goals.map((g) => {
      const v = active("saving", g.id);
      return { goalId: g.id, name: g.name, plannedOre: v ? v.amount_ore : 0, scope: v?.scope ?? null };
    }),
    planned: planned.map((p) => ({ id: p.id, name: p.name, categoryId: p.category_id, maxOre: p.max_ore, status: p.status, txId: p.tx_id })),
  };
}

function assertOwns(userId: string, kind: PlanKind, refId: string): void {
  if (kind === "income") {
    if (refId !== "salary") throw new PlanError(bi("Okänd inkomstrad", "Unknown income line"));
    return;
  }
  const table = kind === "category" ? "categories" : kind === "bill" ? "bills" : "goals";
  if (!getDb().prepare(`SELECT 1 FROM ${table} WHERE id = ? AND user_id = ?`).get(refId, userId)) throw new PlanError(bi("Hittades inte", "Not found"));
}

/**
 * Sätter ett planvärde.
 * - scope 'month': bara den månaden. Varken tidigare eller senare månader ändras.
 * - scope 'template': från och med månaden och framåt. Tidigare månader behåller sin
 *   historik, och månader som redan har en egen ändring behåller den.
 */
export function setPlanValue(
  userId: string,
  input: { kind: PlanKind; refId: string; month: string; scope: Scope; amountOre: number; day?: number | null; removed?: boolean },
): void {
  if (!isMonth(input.month)) throw new PlanError(bi("Ogiltig månad", "Invalid month"));
  if (!Number.isInteger(input.amountOre) || input.amountOre < 0) throw new PlanError(bi("Ogiltigt belopp", "Invalid amount"));
  if (input.day != null && (!Number.isInteger(input.day) || input.day < 1 || input.day > 31)) throw new PlanError(bi("Ogiltig dag", "Invalid day"));
  assertOwns(userId, input.kind, input.refId);
  const db = getDb();
  db.transaction(() => {
    if (input.scope === "template") {
      // Den nya mallen ska gälla den här månaden – ta bort månadens eventuella egna ändring.
      db.prepare("DELETE FROM plan_values WHERE user_id = ? AND kind = ? AND ref_id = ? AND month = ? AND scope = 'month'").run(userId, input.kind, input.refId, input.month);
    }
    db.prepare(
      `INSERT INTO plan_values (id, user_id, kind, ref_id, month, scope, amount_ore, day, removed) VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT (user_id, kind, ref_id, month, scope) DO UPDATE SET amount_ore = excluded.amount_ore, day = excluded.day, removed = excluded.removed`,
    ).run(newId(), userId, input.kind, input.refId, input.month, input.scope, input.amountOre, input.day ?? null, input.removed ? 1 : 0);
  })();
}

/** Tar bort månadens egna ändring så att mallen gäller igen. */
export function clearMonthOverride(userId: string, kind: PlanKind, refId: string, month: string): void {
  getDb().prepare("DELETE FROM plan_values WHERE user_id = ? AND kind = ? AND ref_id = ? AND month = ? AND scope = 'month'").run(userId, kind, refId, month);
}

const clean = (s: string, max = 60) => s.trim().replace(/\s+/g, " ").slice(0, max);

export function createCategory(userId: string, name: string, icon = "dot"): string {
  const n = clean(name, 30);
  if (!n) throw new PlanError(bi("Ange ett namn", "Enter a name"));
  const db = getDb();
  const existing = db.prepare("SELECT id FROM categories WHERE user_id = ? AND lower(name) = lower(?) AND archived = 0").get(userId, n) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = newId();
  const sort = (db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM categories WHERE user_id = ?").get(userId) as { s: number }).s;
  db.prepare("INSERT INTO categories (id, user_id, name, icon, sort) VALUES (?,?,?,?,?)").run(id, userId, n, icon, sort);
  return id;
}
export function archiveCategory(userId: string, id: string): void {
  getDb().prepare("UPDATE categories SET archived = 1 WHERE id = ? AND user_id = ?").run(id, userId);
}

export function createBill(userId: string, input: { name: string; amountOre: number; day: number; month: string; scope: Scope; direction?: "out" | "in" }): string {
  const n = clean(input.name);
  if (!n) throw new PlanError(bi("Ange ett namn", "Enter a name"));
  const id = newId();
  const db = getDb();
  db.transaction(() => {
    db.prepare("INSERT INTO bills (id, user_id, name, match_text, direction) VALUES (?,?,?,?,?)").run(id, userId, n, n.toLocaleLowerCase("sv-SE").split(" ")[0], input.direction ?? "out");
    setPlanValue(userId, { kind: "bill", refId: id, month: input.month, scope: input.scope, amountOre: input.amountOre, day: input.day });
  })();
  return id;
}
export function renameBill(userId: string, id: string, name: string): void {
  const n = clean(name);
  if (n) getDb().prepare("UPDATE bills SET name = ?, match_text = ? WHERE id = ? AND user_id = ?").run(n, n.toLocaleLowerCase("sv-SE").split(" ")[0], id, userId);
}

export function setBillPaid(userId: string, billId: string, month: string, paid: boolean, date: string, txId: string | null = null): void {
  assertOwns(userId, "bill", billId);
  const db = getDb();
  if (paid) {
    db.prepare(
      "INSERT INTO bill_payments (id, user_id, bill_id, month, paid_date, tx_id) VALUES (?,?,?,?,?,?) ON CONFLICT (user_id, bill_id, month) DO UPDATE SET paid_date = excluded.paid_date, tx_id = excluded.tx_id",
    ).run(newId(), userId, billId, month, date, txId);
  } else {
    db.prepare("UPDATE transactions SET bill_id = NULL WHERE user_id = ? AND bill_id = ? AND substr(date, 1, 7) = ?").run(userId, billId, month);
    db.prepare("DELETE FROM bill_payments WHERE user_id = ? AND bill_id = ? AND month = ?").run(userId, billId, month);
  }
}

export function createGoal(userId: string, input: { name: string; targetOre: number; startOre?: number; monthlyOre?: number; month: string }): string {
  const n = clean(input.name);
  if (!n) throw new PlanError(bi("Ange ett namn", "Enter a name"));
  if (!Number.isInteger(input.targetOre) || input.targetOre < 0) throw new PlanError(bi("Ogiltigt belopp", "Invalid amount"));
  const id = newId();
  const db = getDb();
  db.transaction(() => {
    db.prepare("INSERT INTO goals (id, user_id, name, target_ore, start_ore, created_at) VALUES (?,?,?,?,?,?)").run(id, userId, n, input.targetOre, input.startOre ?? 0, nowISO());
    if (input.monthlyOre) setPlanValue(userId, { kind: "saving", refId: id, month: input.month, scope: "template", amountOre: input.monthlyOre });
  })();
  return id;
}
export function updateGoal(userId: string, id: string, patch: { name?: string; targetOre?: number }): void {
  const db = getDb();
  if (patch.name && clean(patch.name)) db.prepare("UPDATE goals SET name = ? WHERE id = ? AND user_id = ?").run(clean(patch.name), id, userId);
  if (patch.targetOre != null && Number.isInteger(patch.targetOre) && patch.targetOre >= 0) db.prepare("UPDATE goals SET target_ore = ? WHERE id = ? AND user_id = ?").run(patch.targetOre, id, userId);
}
export function archiveGoal(userId: string, id: string): void {
  getDb().prepare("UPDATE goals SET archived = 1 WHERE id = ? AND user_id = ?").run(id, userId);
}

export function createPlannedPurchase(userId: string, input: { name: string; categoryId: string; maxOre: number; month: string }): string {
  const n = clean(input.name);
  if (!n) throw new PlanError(bi("Ange vad du planerar att köpa", "Enter what you plan to buy"));
  if (!Number.isInteger(input.maxOre) || input.maxOre <= 0) throw new PlanError(bi("Ange ett maxbelopp", "Enter a maximum amount"));
  if (!isMonth(input.month)) throw new PlanError(bi("Ogiltig månad", "Invalid month"));
  assertOwns(userId, "category", input.categoryId);
  const id = newId();
  getDb().prepare("INSERT INTO planned_purchases (id, user_id, name, category_id, max_ore, month, created_at) VALUES (?,?,?,?,?,?,?)").run(id, userId, n, input.categoryId, input.maxOre, input.month, nowISO());
  return id;
}
export function updatePlannedPurchase(userId: string, id: string, patch: { name?: string; maxOre?: number; status?: "planned" | "cancelled" }): void {
  const db = getDb();
  const row = db.prepare("SELECT status FROM planned_purchases WHERE id = ? AND user_id = ?").get(id, userId) as { status: string } | undefined;
  if (!row) throw new PlanError(bi("Hittades inte", "Not found"));
  if (row.status === "bought") throw new PlanError(bi("Köpet är redan gjort", "The purchase has already been made"));
  if (patch.name && clean(patch.name)) db.prepare("UPDATE planned_purchases SET name = ? WHERE id = ? AND user_id = ?").run(clean(patch.name), id, userId);
  if (patch.maxOre != null) {
    if (!Number.isInteger(patch.maxOre) || patch.maxOre <= 0) throw new PlanError(bi("Ange ett maxbelopp", "Enter a maximum amount"));
    db.prepare("UPDATE planned_purchases SET max_ore = ? WHERE id = ? AND user_id = ?").run(patch.maxOre, id, userId);
  }
  if (patch.status) db.prepare("UPDATE planned_purchases SET status = ? WHERE id = ? AND user_id = ?").run(patch.status, id, userId);
}

/** Nästa lönedag strikt efter idag. Ett uttryckligt angivet datum går före det beräknade. */
export function nextPayday(userId: string, today: string, explicit: string | null): { date: string; computed: boolean } | null {
  if (explicit && explicit > today) return { date: explicit, computed: false };
  let month = today.slice(0, 7);
  for (let i = 0; i < 3; i++) {
    const inc = getMonthPlan(userId, month).income;
    if (inc && inc.payday > today) return { date: inc.payday, computed: true };
    if (!inc && i === 0 && !explicit) return null;
    month = addMonths(month, 1);
  }
  return null;
}
