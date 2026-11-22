import { getDb, newId } from "../db";
import { bi } from "../i18n";
import { diffDays, isDate, monthOf, nowISO } from "../dates";
import { classify, normalizeDescription, type ClassifyContext, type TxKind } from "../engine/classify";
import { matchBankToManual } from "../engine/reconcile";
import { getMonthPlan } from "./plan";
import { envsFor, type User } from "./users";

export class TxError extends Error {}

export interface TxRow {
  id: string;
  account_id: string | null;
  source: "manual" | "bank";
  environment: string;
  external_id: string | null;
  status: "pending" | "booked";
  amount_ore: number;
  date: string;
  description: string;
  item_name: string | null;
  category_id: string | null;
  kind: TxKind;
  goal_id: string | null;
  planned_purchase_id: string | null;
  bill_id: string | null;
  merged_into: string | null;
  match_hold: number;
  created_at: string;
}

const inList = (xs: string[]) => xs.map(() => "?").join(",");

function ownsCategory(userId: string, id: string | null | undefined): boolean {
  return !id || !!getDb().prepare("SELECT 1 FROM categories WHERE id = ? AND user_id = ?").get(id, userId);
}
function ownsGoal(userId: string, id: string | null | undefined): boolean {
  return !id || !!getDb().prepare("SELECT 1 FROM goals WHERE id = ? AND user_id = ?").get(id, userId);
}

export function addManualTx(
  userId: string,
  input: { amountOre: number; date: string; description: string; kind: TxKind; categoryId?: string | null; itemName?: string | null; goalId?: string | null; plannedPurchaseId?: string | null; billId?: string | null },
): string {
  if (!Number.isInteger(input.amountOre) || input.amountOre === 0) throw new TxError(bi("Ogiltigt belopp", "Invalid amount"));
  if (!isDate(input.date)) throw new TxError(bi("Ogiltigt datum", "Invalid date"));
  if (!ownsCategory(userId, input.categoryId) || !ownsGoal(userId, input.goalId)) throw new TxError(bi("Hittades inte", "Not found"));
  const id = newId();
  getDb()
    .prepare(
      `INSERT INTO transactions (id, user_id, account_id, source, environment, status, amount_ore, date, description, item_name, category_id, kind, goal_id, planned_purchase_id, bill_id, created_at)
       VALUES (?,?,NULL,'manual','manual','booked',?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(id, userId, input.amountOre, input.date, input.description.trim().slice(0, 120), input.itemName ?? null, input.categoryId ?? null, input.kind, input.goalId ?? null, input.plannedPurchaseId ?? null, input.billId ?? null, nowISO());
  return id;
}

export function getTx(userId: string, id: string): TxRow | null {
  return (getDb().prepare("SELECT * FROM transactions WHERE id = ? AND user_id = ?").get(id, userId) as TxRow | undefined) ?? null;
}

export function updateTx(userId: string, id: string, patch: { categoryId?: string | null; kind?: TxKind; goalId?: string | null }): void {
  const db = getDb();
  const tx = getTx(userId, id);
  if (!tx) throw new TxError(bi("Hittades inte", "Not found"));
  if (!ownsCategory(userId, patch.categoryId) || !ownsGoal(userId, patch.goalId)) throw new TxError(bi("Hittades inte", "Not found"));
  let kind = patch.kind ?? tx.kind;
  // Riktningen måste stämma: ett avdrag kan inte vara inkomst eller återbetalning.
  if (tx.amount_ore < 0 && (kind === "income" || kind === "refund")) kind = "expense";
  if (tx.amount_ore > 0 && kind === "expense") kind = "refund";
  const categoryId = kind === "expense" || kind === "refund" ? (patch.categoryId !== undefined ? patch.categoryId : tx.category_id) : null;
  const goalId = kind === "saving" ? (patch.goalId !== undefined ? patch.goalId : tx.goal_id) : null;
  db.prepare("UPDATE transactions SET kind = ?, category_id = ?, goal_id = ? WHERE id = ? AND user_id = ?").run(kind, categoryId, goalId, id, userId);
}

/** Tar bort en manuellt registrerad transaktion och allt den låste (planerat köp, betald räkning). */
export function deleteManualTx(userId: string, id: string): void {
  const db = getDb();
  const tx = getTx(userId, id);
  if (!tx) throw new TxError(bi("Hittades inte", "Not found"));
  if (tx.source !== "manual") throw new TxError(bi("Banktransaktioner kan inte tas bort en och en", "Bank transactions cannot be deleted one by one"));
  db.transaction(() => {
    db.prepare("UPDATE planned_purchases SET status = 'planned', tx_id = NULL WHERE user_id = ? AND tx_id = ?").run(userId, id);
    db.prepare("DELETE FROM bill_payments WHERE user_id = ? AND tx_id = ?").run(userId, id);
    db.prepare("UPDATE checks SET status = 'saved', tx_id = NULL WHERE user_id = ? AND tx_id = ?").run(userId, id);
    db.prepare("DELETE FROM transactions WHERE id = ? AND user_id = ?").run(id, userId);
    releaseEmptyHolds(userId);
  })();
}

export interface TxListItem extends TxRow {
  category_name: string | null;
  goal_name: string | null;
  bill_name: string | null;
  account_name: string | null;
  reconciled: number;
}
export function listTransactions(user: User, opts: { limit?: number } = {}): TxListItem[] {
  const envs = envsFor(user);
  return getDb()
    .prepare(
      `SELECT t.*, c.name AS category_name, g.name AS goal_name, b.name AS bill_name, a.name AS account_name,
              EXISTS (SELECT 1 FROM transactions m WHERE m.merged_into = t.id) AS reconciled
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN goals g ON g.id = t.goal_id
       LEFT JOIN bills b ON b.id = t.bill_id
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.user_id = ? AND t.merged_into IS NULL AND t.environment IN (${inList(envs)})
       ORDER BY t.date DESC, t.created_at DESC LIMIT ?`,
    )
    .all(user.id, ...envs, opts.limit ?? 200) as TxListItem[];
}

// ---------------------------------------------------------------------------
// Bankimport
// ---------------------------------------------------------------------------

export interface BankTx {
  /** stabil nyckel per konto (se leverantörens rekommendation; reservnyckel = fingeravtryck) */
  externalId: string;
  status: "pending" | "booked";
  /** signerat belopp i öre: köp negativa, insättningar positiva */
  amountOre: number;
  date: string;
  description: string;
}
export interface ImportStats {
  inserted: number;
  updated: number;
  removedPending: number;
  autoMatched: number;
  needsConfirmation: number;
}

function classifyContext(user: User): ClassifyContext {
  const db = getDb();
  const categories = db.prepare("SELECT id, name FROM categories WHERE user_id = ? AND archived = 0").all(user.id) as { id: string; name: string }[];
  const rows = db
    .prepare("SELECT description, category_id FROM transactions WHERE user_id = ? AND kind = 'expense' AND source = 'bank' ORDER BY date ASC")
    .all(user.id) as { description: string; category_id: string | null }[];
  const learned = new Map<string, string>();
  const recentExpenses = new Map<string, string | null>();
  for (const r of rows) {
    const n = normalizeDescription(r.description);
    if (!n) continue;
    recentExpenses.set(n, r.category_id);
    if (r.category_id) learned.set(n, r.category_id);
  }
  return { categories, learned, recentExpenses };
}

/**
 * Importerar ett kontos transaktioner. Idempotent: samma data två gånger ändrar ingenting.
 * - Kända transaktioner uppdateras på sin nyckel (ingen dubblett).
 * - En väntande transaktion som bokförts under ny nyckel byts ut, inte läggs till.
 * - Köp som användaren redan registrerat för hand slås ihop med banktransaktionen.
 */
export function importBankTransactions(user: User, accountId: string, incoming: BankTx[]): ImportStats {
  const db = getDb();
  const account = db.prepare("SELECT id, environment, type FROM accounts WHERE id = ? AND user_id = ?").get(accountId, user.id) as { id: string; environment: string; type: string } | undefined;
  if (!account) throw new TxError(bi("Kontot hittades inte", "The account was not found"));
  if (account.environment === "manual") throw new TxError(bi("Fel kontotyp", "Wrong account type"));
  const stats: ImportStats = { inserted: 0, updated: 0, removedPending: 0, autoMatched: 0, needsConfirmation: 0 };

  db.transaction(() => {
    const ctx = classifyContext(user);
    const existing = db.prepare("SELECT * FROM transactions WHERE user_id = ? AND account_id = ? AND source = 'bank'").all(user.id, accountId) as TxRow[];
    const byExt = new Map(existing.map((t) => [t.external_id!, t]));
    const incomingIds = new Set(incoming.map((t) => t.externalId));
    const converted = new Set<string>();
    const newIds: string[] = [];
    const seen = new Set<string>();

    for (const t of [...incoming].sort((a, b) => a.date.localeCompare(b.date))) {
      if (!t.externalId || !isDate(t.date) || !Number.isInteger(t.amountOre) || t.amountOre === 0 || seen.has(t.externalId)) continue;
      seen.add(t.externalId);
      const known = byExt.get(t.externalId);
      if (known) {
        if (known.status !== t.status || known.date !== t.date || known.amount_ore !== t.amountOre || known.description !== t.description) {
          db.prepare("UPDATE transactions SET status = ?, date = ?, amount_ore = ?, description = ? WHERE id = ?").run(t.status, t.date, t.amountOre, t.description, known.id);
          stats.updated++;
        }
        continue;
      }
      if (t.status === "booked") {
        // Samma köp som tidigare låg som väntande, men med ny nyckel från banken?
        const pending = existing.find((p) => p.status === "pending" && !converted.has(p.id) && !incomingIds.has(p.external_id!) && p.amount_ore === t.amountOre && Math.abs(diffDays(p.date, t.date)) <= 7);
        if (pending) {
          converted.add(pending.id);
          db.prepare("UPDATE transactions SET external_id = ?, status = 'booked', date = ?, description = ? WHERE id = ?").run(t.externalId, t.date, t.description, pending.id);
          stats.updated++;
          continue;
        }
      }
      const cls = classify(t, ctx);
      const id = newId();
      db.prepare(
        `INSERT INTO transactions (id, user_id, account_id, source, environment, external_id, status, amount_ore, date, description, category_id, kind, created_at)
         VALUES (?,?,?,'bank',?,?,?,?,?,?,?,?,?)`,
      ).run(id, user.id, accountId, account.environment, t.externalId, t.status, t.amountOre, t.date, t.description, cls.categoryId, cls.kind, nowISO());
      newIds.push(id);
      stats.inserted++;
      if (cls.kind === "expense") ctx.recentExpenses.set(normalizeDescription(t.description), cls.categoryId);
    }

    // Väntande transaktioner som banken inte längre rapporterar har fallit bort.
    for (const p of existing) {
      if (p.status !== "pending" || incomingIds.has(p.external_id!) || converted.has(p.id)) continue;
      db.prepare("UPDATE transactions SET merged_into = NULL WHERE user_id = ? AND merged_into = ?").run(user.id, p.id);
      db.prepare("UPDATE planned_purchases SET tx_id = (SELECT id FROM transactions m WHERE m.planned_purchase_id = planned_purchases.id AND m.source = 'manual' LIMIT 1) WHERE user_id = ? AND tx_id = ?").run(user.id, p.id);
      db.prepare("DELETE FROM transactions WHERE id = ?").run(p.id);
      stats.removedPending++;
    }

    if (newIds.length) {
      pairTransfers(user, newIds);
      matchBills(user, newIds);
      const r = reconcileNew(user, newIds);
      stats.autoMatched = r.auto;
      stats.needsConfirmation = r.held;
    }
  })();
  return stats;
}

/** Överföringar mellan användarens egna konton ska varken räknas som köp eller inkomst. */
function pairTransfers(user: User, newIds: string[]): void {
  const db = getDb();
  const envs = envsFor(user);
  const rows = db
    .prepare(
      `SELECT t.id, t.account_id, t.amount_ore, t.date, t.kind, a.type AS account_type FROM transactions t JOIN accounts a ON a.id = t.account_id
       WHERE t.user_id = ? AND t.source = 'bank' AND t.kind IN ('expense','income','transfer','saving') AND t.bill_id IS NULL AND t.environment IN (${inList(envs)})
       ORDER BY t.date`,
    )
    .all(user.id, ...envs) as { id: string; account_id: string; amount_ore: number; date: string; kind: TxKind; account_type: string }[];
  const fresh = new Set(newIds);
  const used = new Set<string>();
  const goals = db.prepare("SELECT id FROM goals WHERE user_id = ? AND archived = 0").all(user.id) as { id: string }[];
  for (const out of rows) {
    if (out.amount_ore >= 0 || used.has(out.id)) continue;
    const inc = rows.find((x) => !used.has(x.id) && x.amount_ore === -out.amount_ore && x.account_id !== out.account_id && Math.abs(diffDays(out.date, x.date)) <= 2 && (fresh.has(x.id) || fresh.has(out.id)));
    if (!inc) continue;
    used.add(out.id);
    used.add(inc.id);
    const toSavings = inc.account_type === "savings" && out.account_type === "spending";
    const fromSavings = out.account_type === "savings" && inc.account_type === "spending";
    const goalId = goals.length === 1 ? goals[0].id : null;
    if (toSavings) {
      // Faktiskt sparande: pengar som verkligen flyttats till ett sparkonto.
      db.prepare("UPDATE transactions SET kind = 'saving', category_id = NULL, goal_id = COALESCE(goal_id, ?) WHERE id = ?").run(goalId, out.id);
      db.prepare("UPDATE transactions SET kind = 'transfer', category_id = NULL WHERE id = ?").run(inc.id);
    } else if (fromSavings) {
      db.prepare("UPDATE transactions SET kind = 'transfer', category_id = NULL WHERE id = ?").run(out.id);
      db.prepare("UPDATE transactions SET kind = 'saving', category_id = NULL, goal_id = COALESCE(goal_id, ?) WHERE id = ?").run(goalId, inc.id);
    } else {
      db.prepare("UPDATE transactions SET kind = 'transfer', category_id = NULL WHERE id IN (?, ?)").run(out.id, inc.id);
    }
  }
}

/** En banktransaktion med exakt räkningens belopp och namn markerar räkningen som betald. */
function matchBills(user: User, newIds: string[]): void {
  const db = getDb();
  const txs = db.prepare(`SELECT * FROM transactions WHERE id IN (${inList(newIds)}) AND kind IN ('expense','income') AND status = 'booked'`).all(...newIds) as TxRow[];
  for (const t of txs) {
    const month = monthOf(t.date);
    const bills = getMonthPlan(user.id, month).bills.filter((b) => !b.paid && (b.direction === "out" ? t.amount_ore === -b.amountOre : t.amount_ore === b.amountOre));
    const texts = db.prepare("SELECT id, match_text FROM bills WHERE user_id = ?").all(user.id) as { id: string; match_text: string }[];
    const desc = t.description.toLocaleLowerCase("sv-SE");
    const hits = bills.filter((b) => {
      const mt = texts.find((x) => x.id === b.id)?.match_text;
      return mt && desc.includes(mt);
    });
    if (hits.length !== 1) continue;
    db.prepare("UPDATE transactions SET bill_id = ?, category_id = NULL WHERE id = ?").run(hits[0].id, t.id);
    db.prepare("INSERT OR IGNORE INTO bill_payments (id, user_id, bill_id, month, paid_date, tx_id) VALUES (?,?,?,?,?,?)").run(newId(), user.id, hits[0].id, month, t.date, t.id);
  }
}

function mergeManualIntoBank(userId: string, bankId: string, manualId: string): void {
  const db = getDb();
  const m = getTx(userId, manualId);
  const b = getTx(userId, bankId);
  if (!m || !b || m.source !== "manual" || b.source !== "bank" || m.merged_into) throw new TxError(bi("Kan inte slå ihop", "Cannot merge"));
  db.prepare(
    `UPDATE transactions SET category_id = COALESCE(?, category_id), item_name = COALESCE(?, item_name), planned_purchase_id = COALESCE(?, planned_purchase_id),
       bill_id = COALESCE(?, bill_id), goal_id = COALESCE(?, goal_id), kind = ?, match_hold = 0 WHERE id = ?`,
  ).run(m.category_id, m.item_name, m.planned_purchase_id, m.bill_id, m.goal_id, m.kind, bankId);
  db.prepare("UPDATE transactions SET merged_into = ? WHERE id = ?").run(bankId, manualId);
  db.prepare("UPDATE planned_purchases SET tx_id = ? WHERE user_id = ? AND tx_id = ?").run(bankId, userId, manualId);
  db.prepare("UPDATE checks SET tx_id = ? WHERE user_id = ? AND tx_id = ?").run(bankId, userId, manualId);
  db.prepare("UPDATE bill_payments SET tx_id = ? WHERE user_id = ? AND tx_id = ?").run(bankId, userId, manualId);
  db.prepare("DELETE FROM match_candidates WHERE bank_tx_id = ? OR manual_tx_id = ?").run(bankId, manualId);
}

function releaseEmptyHolds(userId: string): void {
  getDb()
    .prepare("UPDATE transactions SET match_hold = 0 WHERE user_id = ? AND match_hold = 1 AND NOT EXISTS (SELECT 1 FROM match_candidates c WHERE c.bank_tx_id = transactions.id)")
    .run(userId);
}

function reconcileNew(user: User, newIds: string[]): { auto: number; held: number } {
  const db = getDb();
  const fresh = db.prepare(`SELECT id, amount_ore AS amountOre, date FROM transactions WHERE id IN (${inList(newIds)}) AND amount_ore < 0 AND kind IN ('expense','saving') AND bill_id IS NULL`).all(...newIds) as { id: string; amountOre: number; date: string }[];
  const held = db.prepare("SELECT id, amount_ore AS amountOre, date FROM transactions WHERE user_id = ? AND match_hold = 1").all(user.id) as { id: string; amountOre: number; date: string }[];
  const manual = db
    .prepare("SELECT id, amount_ore AS amountOre, date FROM transactions WHERE user_id = ? AND source = 'manual' AND merged_into IS NULL AND amount_ore < 0 AND kind IN ('expense','saving')")
    .all(user.id) as { id: string; amountOre: number; date: string }[];
  const outcome = matchBankToManual([...held, ...fresh], manual);
  const freshIds = new Set(fresh.map((f) => f.id));
  let auto = 0;
  let heldCount = 0;
  for (const a of outcome.auto) {
    if (!freshIds.has(a.bankId)) continue;
    mergeManualIntoBank(user.id, a.bankId, a.manualId);
    auto++;
  }
  for (const amb of outcome.ambiguous) {
    db.prepare("UPDATE transactions SET match_hold = 1 WHERE id = ?").run(amb.bankId);
    for (const c of amb.candidates) db.prepare("INSERT OR IGNORE INTO match_candidates (bank_tx_id, manual_tx_id, user_id) VALUES (?,?,?)").run(amb.bankId, c, user.id);
    if (freshIds.has(amb.bankId)) heldCount++;
  }
  return { auto, held: heldCount };
}

export interface PendingMatch {
  bank: TxRow;
  candidates: (TxRow & { category_name: string | null })[];
}
export function pendingMatches(userId: string): PendingMatch[] {
  const db = getDb();
  const banks = db.prepare("SELECT * FROM transactions WHERE user_id = ? AND match_hold = 1 ORDER BY date DESC").all(userId) as TxRow[];
  return banks.map((bank) => ({
    bank,
    candidates: db
      .prepare(
        `SELECT t.*, c.name AS category_name FROM match_candidates mc JOIN transactions t ON t.id = mc.manual_tx_id LEFT JOIN categories c ON c.id = t.category_id
         WHERE mc.bank_tx_id = ? AND mc.user_id = ? AND t.merged_into IS NULL`,
      )
      .all(bank.id, userId) as PendingMatch["candidates"],
  }));
}

/** Användarens svar på "Är det här samma köp?". manualTxId = null betyder "nej, ett annat köp". */
export function resolveMatch(userId: string, bankTxId: string, manualTxId: string | null): void {
  const db = getDb();
  const bank = getTx(userId, bankTxId);
  if (!bank || !bank.match_hold) throw new TxError(bi("Hittades inte", "Not found"));
  db.transaction(() => {
    if (manualTxId) {
      if (!db.prepare("SELECT 1 FROM match_candidates WHERE bank_tx_id = ? AND manual_tx_id = ? AND user_id = ?").get(bankTxId, manualTxId, userId)) throw new TxError(bi("Hittades inte", "Not found"));
      mergeManualIntoBank(userId, bankTxId, manualTxId);
    } else {
      db.prepare("DELETE FROM match_candidates WHERE bank_tx_id = ? AND user_id = ?").run(bankTxId, userId);
      db.prepare("UPDATE transactions SET match_hold = 0 WHERE id = ? AND user_id = ?").run(bankTxId, userId);
    }
    releaseEmptyHolds(userId);
  })();
}

// ---------------------------------------------------------------------------
// Köp som appen inte kunde kategorisera: fråga användaren, och kom ihåg svaret
// ---------------------------------------------------------------------------

export interface UnknownTx {
  id: string;
  description: string;
  amount_ore: number;
  date: string;
}
/** Köp utan kategori, nyast först. */
export function uncategorizedTx(user: User, limit = 20): UnknownTx[] {
  const envs = envsFor(user);
  return getDb()
    .prepare(
      `SELECT id, COALESCE(item_name, description) AS description, amount_ore, date FROM transactions
       WHERE user_id = ? AND kind = 'expense' AND category_id IS NULL AND bill_id IS NULL AND merged_into IS NULL AND match_hold = 0
         AND environment IN (${inList(envs)})
       ORDER BY date DESC, created_at DESC LIMIT ?`,
    )
    .all(user.id, ...envs, limit) as UnknownTx[];
}

/**
 * Användarens svar på "Vad var det här köpet?". Samma handlare får samma kategori –
 * både för köp som redan väntar på svar och (via inlärningen vid import) för kommande köp.
 * categoryId = null betyder "inte ett köp" (överföring).
 */
export function answerCategory(user: User, txId: string, categoryId: string | null): { alsoUpdated: number } {
  const db = getDb();
  const tx = getTx(user.id, txId);
  if (!tx) throw new TxError(bi("Hittades inte", "Not found"));
  if (!ownsCategory(user.id, categoryId)) throw new TxError(bi("Hittades inte", "Not found"));
  return db.transaction(() => {
    if (!categoryId) {
      db.prepare("UPDATE transactions SET kind = 'transfer', category_id = NULL WHERE id = ? AND user_id = ?").run(txId, user.id);
      return { alsoUpdated: 0 };
    }
    db.prepare("UPDATE transactions SET kind = 'expense', category_id = ? WHERE id = ? AND user_id = ?").run(categoryId, txId, user.id);
    const key = normalizeDescription(tx.description);
    let alsoUpdated = 0;
    if (key && tx.source === "bank") {
      for (const other of uncategorizedTx(user, 500)) {
        const row = getTx(user.id, other.id);
        if (row && row.source === "bank" && row.id !== txId && normalizeDescription(row.description) === key) {
          db.prepare("UPDATE transactions SET category_id = ? WHERE id = ? AND user_id = ?").run(categoryId, row.id, user.id);
          alsoUpdated++;
        }
      }
    }
    return { alsoUpdated };
  })();
}
