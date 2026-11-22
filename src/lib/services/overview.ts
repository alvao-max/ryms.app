import { getDb } from "../db";
import { addDays, addMonths, dateInMonth, daysInMonth, diffDays, formatDateShort, formatTimestamp, monthName, monthOf } from "../dates";
import { categoryFigures } from "../engine/budget";
import { leftUntilPayday } from "../engine/cash";
import type { CashSnapshot, CategoryFigures, CategorySnapshot, LeftUntilPayday, SavingLine, TimelineEvent } from "../engine/types";
import { makeT, type Locale } from "../i18n";
import { getMonthPlan, nextPayday, type MonthPlan } from "./plan";
import { envsFor, type User } from "./users";

const inList = (xs: string[]) => xs.map(() => "?").join(",");

/** Förbrukat per kategori: köp minus återbetalningar. Räkningar, överföringar, sparande,
 *  sammanslagna dubbletter och transaktioner som väntar på bekräftelse räknas inte. */
export function spentByCategory(userId: string, month: string, envs: string[]): Map<string | null, number> {
  const rows = getDb()
    .prepare(
      `SELECT category_id AS c, -SUM(amount_ore) AS spent FROM transactions
       WHERE user_id = ? AND substr(date, 1, 7) = ? AND kind IN ('expense','refund')
         AND merged_into IS NULL AND match_hold = 0 AND bill_id IS NULL AND environment IN (${inList(envs)})
       GROUP BY category_id`,
    )
    .all(userId, month, ...envs) as { c: string | null; spent: number }[];
  return new Map(rows.map((r) => [r.c, r.spent]));
}

export function categorySnapshots(userId: string, plan: MonthPlan, envs: string[]): (CategorySnapshot & { icon: string })[] {
  const spent = spentByCategory(userId, plan.month, envs);
  return plan.categories.map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    budgetOre: c.budgetOre,
    spentOre: spent.get(c.id) ?? 0,
    reservations: plan.planned.filter((p) => p.categoryId === c.id && p.status === "planned").map((p) => ({ id: p.id, name: p.name, maxOre: p.maxOre })),
  }));
}

interface AccountRow {
  id: string;
  environment: string;
  name: string;
  balance_ore: number;
  balance_kind: string;
  balance_at: string;
  conn_status: string | null;
}

export function cashSnapshot(user: User, today: string, locale: Locale = "sv"): CashSnapshot {
  const t = makeT(locale);
  const ts = (iso: string) => formatTimestamp(iso, today, locale);
  const db = getDb();
  const envs = envsFor(user);
  const month = monthOf(today);
  const pd = nextPayday(user.id, today, user.next_payday);
  const horizon = pd?.date ?? addDays(dateInMonth(month, daysInMonth(month)), 1);

  // ---- Saldo ----
  const all = db
    .prepare(
      `SELECT a.id, a.environment, a.name, a.balance_ore, a.balance_kind, a.balance_at, c.status AS conn_status
       FROM accounts a LEFT JOIN bank_connections c ON c.id = a.connection_id
       WHERE a.user_id = ? AND a.selected = 1 AND a.type = 'spending' AND a.balance_ore IS NOT NULL AND a.environment IN (${inList(envs)})`,
    )
    .all(user.id, ...envs) as AccountRow[];
  const bank = all.filter((a) => a.environment !== "manual");
  const used = bank.length ? bank : all;
  const notes: string[] = [];
  const adjustments: CashSnapshot["adjustments"] = [];
  let estimate = false;
  const baseOre = used.reduce((s, a) => s + a.balance_ore, 0);
  const known = used.length > 0;

  if (known) {
    const since = used.reduce((m, a) => (a.balance_at > m ? a.balance_at : m), "");
    if (bank.length) {
      for (const a of bank.filter((x) => x.balance_kind === "booked")) {
        const p = db.prepare("SELECT COALESCE(SUM(amount_ore), 0) AS s, COUNT(*) AS n FROM transactions WHERE user_id = ? AND account_id = ? AND status = 'pending'").get(user.id, a.id) as { s: number; n: number };
        if (p.n) {
          adjustments.push({ label: t(`Väntande transaktioner (${a.name})`, `Pending transactions (${a.name})`), amountOre: p.s });
          estimate = true;
          notes.push(t("Väntande transaktioner är inräknade och kan ändras när banken bokför dem.", "Pending transactions are included and may change when the bank books them."));
        }
      }
      if (bank.some((a) => a.conn_status && a.conn_status !== "active")) {
        estimate = true;
        notes.push(t(`Banken är inte ansluten just nu – saldot är från ${ts(since)}.`, `The bank is not connected right now – the balance is from ${ts(since)}.`));
      } else if (Date.now() - new Date(since).getTime() > 36 * 3600 * 1000) {
        estimate = true;
        notes.push(t(`Senaste bankhämtningen var ${ts(since)}.`, `The last bank sync was ${ts(since)}.`));
      }
    } else {
      estimate = true;
      notes.push(t(`Bygger på saldot du själv angav ${ts(since)}.`, `Based on the balance you entered ${ts(since)}.`));
    }
    // Manuellt registrerat efter saldots tidpunkt syns inte i saldot ännu.
    const m = db
      .prepare(
        `SELECT COALESCE(SUM(amount_ore), 0) AS s, COUNT(*) AS n FROM transactions
         WHERE user_id = ? AND source = 'manual' AND merged_into IS NULL AND kind != 'transfer' AND created_at > ?`,
      )
      .get(user.id, since) as { s: number; n: number };
    if (m.n) {
      adjustments.push({ label: bank.length ? t("Registrerat av dig efter senaste bankhämtningen", "Recorded by you since the last bank sync") : t("Registrerat av dig sedan saldot angavs", "Recorded by you since the balance was entered"), amountOre: m.s });
      estimate = true;
    }
  } else {
    notes.push(t("Saldo saknas. Ange ditt saldo eller anslut en bank för att se vad du har kvar till lön.", "No balance yet. Enter your balance or connect a bank to see what you have left until payday."));
  }

  // ---- Räkningar och bekräftade insättningar före lön ----
  const events: TimelineEvent[] = [];
  for (let m = month; m <= monthOf(horizon); m = addMonths(m, 1)) {
    for (const b of getMonthPlan(user.id, m).bills) {
      if (b.paid || b.dueDate >= horizon) continue;
      const overdue = b.dueDate < today;
      if (b.direction === "in") {
        if (!overdue) events.push({ id: `${b.id}:${m}`, type: "inflow", label: b.name, date: b.dueDate, amountOre: b.amountOre });
      } else {
        events.push({ id: `${b.id}:${m}`, type: "bill", label: b.name, date: overdue ? today : b.dueDate, amountOre: b.amountOre, overdue });
      }
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date));

  return {
    known,
    cashOre: baseOre + adjustments.reduce((s, a) => s + a.amountOre, 0),
    baseOre,
    adjustments,
    estimate,
    notes,
    today,
    payday: pd?.date ?? null,
    horizon,
    events,
    savings: savingLines(user, month),
  };
}

/** Planerat sparande (plan) och faktiskt sparande (insättningar) hålls isär. */
export function savingLines(user: User, month: string): SavingLine[] {
  const envs = envsFor(user);
  const plan = getMonthPlan(user.id, month);
  const saved = getDb()
    .prepare(
      `SELECT goal_id AS g, -SUM(amount_ore) AS s FROM transactions
       WHERE user_id = ? AND kind = 'saving' AND goal_id IS NOT NULL AND merged_into IS NULL AND substr(date, 1, 7) = ? AND environment IN (${inList(envs)})
       GROUP BY goal_id`,
    )
    .all(user.id, month, ...envs) as { g: string; s: number }[];
  return plan.savings
    .filter((s) => s.plannedOre > 0)
    .map((s) => {
      const savedOre = saved.find((x) => x.g === s.goalId)?.s ?? 0;
      return { goalId: s.goalId, name: s.name, plannedOre: s.plannedOre, savedOre, remainingOre: Math.max(0, s.plannedOre - savedOre) };
    });
}

export interface GoalProgress {
  id: string;
  name: string;
  targetOre: number;
  /** faktiskt insatt totalt (startbelopp + insättningar − uttag) */
  savedOre: number;
  plannedThisMonthOre: number;
  savedThisMonthOre: number;
}
export function goalProgress(user: User, month: string): GoalProgress[] {
  const envs = envsFor(user);
  const db = getDb();
  const goals = db.prepare("SELECT id, name, target_ore, start_ore FROM goals WHERE user_id = ? AND archived = 0 ORDER BY created_at").all(user.id) as { id: string; name: string; target_ore: number; start_ore: number }[];
  const plan = getMonthPlan(user.id, month);
  return goals.map((g) => {
    const tot = db
      .prepare(
        `SELECT COALESCE(-SUM(amount_ore), 0) AS total, COALESCE(-SUM(CASE WHEN substr(date, 1, 7) = ? THEN amount_ore ELSE 0 END), 0) AS m
         FROM transactions WHERE user_id = ? AND goal_id = ? AND kind = 'saving' AND merged_into IS NULL AND environment IN (${inList(envs)})`,
      )
      .get(month, user.id, g.id, ...envs) as { total: number; m: number };
    return { id: g.id, name: g.name, targetOre: g.target_ore, savedOre: g.start_ore + tot.total, plannedThisMonthOre: plan.savings.find((s) => s.goalId === g.id)?.plannedOre ?? 0, savedThisMonthOre: tot.m };
  });
}

export interface BankStatus {
  mode: "none" | "manual" | "demo" | "sandbox" | "live";
  status: "active" | "expired" | "error" | "disconnected" | "pending" | null;
  bankName: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  connectionId: string | null;
  consentExpiresAt: string | null;
}
export function bankStatus(user: User): BankStatus {
  const db = getDb();
  const envs = envsFor(user).filter((e) => e !== "manual");
  const c = db
    .prepare(
      `SELECT id, environment, bank_name, status, last_sync_at, last_sync_error, consent_expires_at FROM bank_connections
       WHERE user_id = ? AND environment IN (${inList(envs)}) AND status != 'pending' ORDER BY created_at DESC LIMIT 1`,
    )
    .get(user.id, ...envs) as { id: string; environment: BankStatus["mode"]; bank_name: string; status: BankStatus["status"]; last_sync_at: string | null; last_sync_error: string | null; consent_expires_at: string | null } | undefined;
  if (c) return { mode: c.environment, status: c.status, bankName: c.bank_name, lastSyncAt: c.last_sync_at, lastSyncError: c.last_sync_error, connectionId: c.id, consentExpiresAt: c.consent_expires_at };
  const manual = db.prepare("SELECT balance_at FROM accounts WHERE user_id = ? AND environment = 'manual' AND balance_ore IS NOT NULL").get(user.id) as { balance_at: string } | undefined;
  return { mode: manual ? "manual" : "none", status: null, bankName: null, lastSyncAt: manual?.balance_at ?? null, lastSyncError: null, connectionId: null, consentExpiresAt: null };
}

export interface CalcRow {
  label: string;
  amountOre: number;
  note?: string;
  total?: boolean;
}
export interface Overview {
  today: string;
  month: string;
  payday: string | null;
  daysToPayday: number | null;
  cash: CashSnapshot;
  left: LeftUntilPayday;
  leftCalc: CalcRow[];
  balanceCalc: CalcRow[];
  categories: (CategorySnapshot & { icon: string; figures: CategoryFigures; calc: CalcRow[] })[];
  goals: GoalProgress[];
  income: { expectedOre: number | null; receivedOre: number };
  bank: BankStatus;
  uncategorized: number;
  pendingMatches: number;
}

export function buildOverview(user: User, today: string, locale: Locale = "sv"): Overview {
  const t = makeT(locale);
  const db = getDb();
  const envs = envsFor(user);
  const month = monthOf(today);
  const plan = getMonthPlan(user.id, month);
  const cash = cashSnapshot(user, today, locale);
  const left = leftUntilPayday(cash);

  const balanceCalc: CalcRow[] = cash.known
    ? [{ label: t("Saldo på dina konton", "Balance in your accounts"), amountOre: cash.baseOre }, ...cash.adjustments, { label: t("Disponibelt nu", "Available now"), amountOre: cash.cashOre, total: true }]
    : [];
  const leftCalc: CalcRow[] = cash.known
    ? [
        { label: t("Disponibelt nu", "Available now"), amountOre: cash.cashOre },
        ...cash.events.map((e) => ({
          label: e.label,
          amountOre: e.type === "bill" ? -e.amountOre : e.amountOre,
          note: e.type === "bill" ? (e.overdue ? t("förfallen, inte markerad som betald", "overdue, not marked as paid") : t(`räkning ${formatDateShort(e.date)}`, `bill ${formatDateShort(e.date, "en")}`)) : t(`bekräftad insättning ${formatDateShort(e.date)}`, `confirmed deposit ${formatDateShort(e.date, "en")}`),
        })),
        ...cash.savings.filter((s) => s.remainingOre > 0).map((s) => ({ label: t(`Planerat sparande: ${s.name}`, `Planned saving: ${s.name}`), amountOre: -s.remainingOre, note: s.savedOre > 0 ? t("återstår av månadens plan", "remaining of this month's plan") : t("inte insatt än", "not deposited yet") })),
        { label: t("Kvar till lön", "Left until payday"), amountOre: left.amountOre, total: true },
      ]
    : [];

  const categories = categorySnapshots(user.id, plan, envs).map((c) => {
    const figures = categoryFigures(c);
    const calc: CalcRow[] = [
      { label: t(`Budget för ${monthName(month)}`, `Budget for ${monthName(month, "en")}`), amountOre: figures.budgetOre },
      { label: t("Köp hittills (minus återbetalningar)", "Purchases so far (minus refunds)"), amountOre: -figures.spentOre },
      { label: t("Kvar i kategorin", "Left in the category"), amountOre: figures.remainingOre, total: true },
      ...c.reservations.map((r) => ({ label: t(`Reserverat: ${r.name}`, `Reserved: ${r.name}`), amountOre: -r.maxOre, note: t("planerat köp", "planned purchase") })),
      ...(c.reservations.length ? [{ label: t("Kvar till annat", "Left for other things"), amountOre: figures.freeOre, total: true }] : []),
    ];
    return { ...c, figures, calc };
  });

  const received = db
    .prepare(`SELECT COALESCE(SUM(amount_ore), 0) AS s FROM transactions WHERE user_id = ? AND kind = 'income' AND merged_into IS NULL AND substr(date, 1, 7) = ? AND environment IN (${inList(envs)})`)
    .get(user.id, month, ...envs) as { s: number };
  const unc = db
    .prepare(`SELECT COUNT(*) AS n FROM transactions WHERE user_id = ? AND kind = 'expense' AND category_id IS NULL AND bill_id IS NULL AND merged_into IS NULL AND substr(date, 1, 7) = ? AND environment IN (${inList(envs)})`)
    .get(user.id, month, ...envs) as { n: number };
  const holds = db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE user_id = ? AND match_hold = 1").get(user.id) as { n: number };

  return {
    today,
    month,
    payday: cash.payday,
    daysToPayday: cash.payday ? diffDays(today, cash.payday) : null,
    cash,
    left,
    leftCalc,
    balanceCalc,
    categories,
    goals: goalProgress(user, month),
    income: { expectedOre: plan.income?.amountOre ?? null, receivedOre: received.s },
    bank: bankStatus(user),
    uncategorized: unc.n,
    pendingMatches: holds.n,
  };
}
