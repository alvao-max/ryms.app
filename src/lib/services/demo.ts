import { randomToken } from "../crypto";
import { getDb, newId } from "../db";
import { addDays, addMonths, dateInMonth, monthOf, nowISO, paydayFor, todayISO, weekday } from "../dates";
import { makeT, type Locale } from "../i18n";
import { deleteAllImages } from "./images";
import { createBill, createCategory, createGoal, createPlannedPurchase, getMonthPlan, setBillPaid, setPlanValue } from "./plan";
import { importBankTransactions, type BankTx } from "./transactions";
import { createUser, getUser, updateUser, type User } from "./users";

/**
 * Demoläget: fyra påhittade budgetar för samma person, så att samma köp kan prövas mot olika lägen.
 * All data är fiktiv och ligger i miljön "demo" – den blandas aldrig med sandbox- eller skarp bankdata.
 */
export const DEMO_BUDGETS = [
  { key: "rymlig", label: "Gott om utrymme", labelEn: "Plenty of room", blurb: "900 kr kvar till kläder", blurbEn: "900 kr left for clothes" },
  { key: "liten", label: "Mindre klädbudget", labelEn: "Smaller clothes budget", blurb: "400 kr kvar till kläder", blurbEn: "400 kr left for clothes" },
  { key: "kangor", label: "Kängorna är planerade", labelEn: "The boots are planned", blurb: "1 200 kr reserverat", blurbEn: "1 200 kr reserved" },
  { key: "tajt", label: "Tajt före lön", labelEn: "Tight before payday", blurb: "elräkning före lönen", blurbEn: "electricity bill before payday" },
] as const;
export type DemoKey = (typeof DEMO_BUDGETS)[number]["key"];

const kr = (n: number) => n * 100;

export function createDemoGroup(today: string = todayISO(), locale: Locale = "sv"): User {
  cleanupOldDemos();
  const group = newId();
  let first: User | null = null;
  for (const b of DEMO_BUDGETS) {
    const user = createUser({ email: `demo-${group}-${b.key}@ryms.invalid`, password: randomToken(24), name: "Elsa", demo: { group, key: b.key, label: locale === "en" ? b.labelEn : b.label } });
    seedDemo(user, b.key, today, locale);
    first ??= getUser(user.id);
  }
  return first!;
}

export function demoSiblings(user: User): User[] {
  if (!user.is_demo || !user.demo_group) return [];
  const rows = getDb().prepare("SELECT id FROM users WHERE demo_group = ?").all(user.demo_group) as { id: string }[];
  const users = rows.map((r) => getUser(r.id)!).filter(Boolean);
  return DEMO_BUDGETS.flatMap((b) => users.filter((u) => u.demo_key === b.key));
}

function cleanupOldDemos(): void {
  const cutoff = new Date(Date.now() - 3 * 86400000).toISOString();
  const old = getDb().prepare("SELECT id FROM users WHERE is_demo = 1 AND created_at < ?").all(cutoff) as { id: string }[];
  for (const o of old) {
    deleteAllImages(o.id);
    getDb().prepare("DELETE FROM users WHERE id = ?").run(o.id);
  }
}

function seedDemo(user: User, key: DemoKey, today: string, locale: Locale = "sv"): void {
  const t = makeT(locale);
  const db = getDb();
  const month = monthOf(today);
  const start = addMonths(month, -2); // mallen har gällt ett par månader
  const first = dateInMonth(month, 1);
  /** n dagar sedan, men aldrig före månadens första dag */
  const ago = (n: number) => {
    const d = addDays(today, -n);
    return d < first ? first : d;
  };
  // Lön om fyra dagar – eller måndagen efter, om det blir en helg.
  let payday = addDays(today, 4);
  if (weekday(payday) === 6) payday = addDays(payday, 2);
  if (weekday(payday) === 0) payday = addDays(payday, 1);
  const lastMonth = addMonths(month, -1);

  // ---- Plan (mall) ----
  setPlanValue(user.id, { kind: "income", refId: "salary", month: start, scope: "template", amountOre: kr(28500), day: 25 });
  const cat: Record<string, string> = {};
  for (const [name, icon, amount, en] of [
    ["Mat", "mat", 3500, "Food"],
    ["Kläder", "klader", 1500, "Clothes"],
    ["Nöje", "noje", 1000, "Fun"],
    ["Transport", "transport", 800, "Transport"],
    ["Hem", "hem", 600, "Home"],
  ] as const) {
    // Interna nycklar är svenska; bara det sparade namnet följer språket.
    cat[name] = createCategory(user.id, t(name, en), icon);
    setPlanValue(user.id, { kind: "category", refId: cat[name], month: start, scope: "template", amountOre: kr(amount) });
  }
  const dayOf = (d: string) => Number(d.slice(8, 10));
  const el = createBill(user.id, { name: t("Elräkningen", "Electricity bill"), amountOre: kr(850), day: dayOf(addDays(today, 2)), month: start, scope: "template" });
  const mobil = createBill(user.id, { name: t("Mobilabonnemang", "Mobile plan"), amountOre: kr(299), day: dayOf(addDays(today, 1)), month: start, scope: "template" });
  const hyra = createBill(user.id, { name: t("Hyra", "Rent"), amountOre: kr(7800), day: dayOf(addDays(today, 7)), month: start, scope: "template" });
  const bredband = createBill(user.id, { name: t("Bredband", "Broadband"), amountOre: kr(399), day: dayOf(ago(6)), month: start, scope: "template" });
  // Det som redan förfallit den här månaden (och allt förra månaden) är betalt.
  for (const m of [lastMonth, month]) {
    for (const b of getMonthPlan(user.id, m).bills) if (m === lastMonth || b.dueDate < today || b.id === bredband) setBillPaid(user.id, b.id, m, true, b.dueDate);
  }
  void el;
  void mobil;
  void hyra;

  const resa = createGoal(user.id, { name: t("Resa till Lissabon", "Trip to Lisbon"), targetOre: kr(12000), startOre: kr(4200), monthlyOre: kr(1000), month: start });
  const buffert = createGoal(user.id, { name: t("Buffert", "Buffer"), targetOre: kr(20000), startOre: kr(6500), monthlyOre: kr(500), month: start });

  // ---- Det som skiljer budgetarna åt ----
  const clothes: [number, string][] = key === "kangor" ? [] : [[-349, "H&M STOCKHOLM"], [-450, "ZALANDO SE"], [199, "ZALANDO SE"]];
  if (key === "liten") setPlanValue(user.id, { kind: "category", refId: cat["Kläder"], month, scope: "month", amountOre: kr(1000) }); // bara den här månaden
  if (key === "kangor") createPlannedPurchase(user.id, { name: t("Vinterkängor", "Winter boots"), categoryId: cat["Kläder"], maxOre: kr(1200), month });
  const balance = key === "tajt" ? kr(1668) : kr(9480);

  // ---- Demobank (påhittad) ----
  const connId = newId();
  const at = nowISO();
  db.prepare("INSERT INTO bank_connections (id, user_id, environment, provider, bank_name, status, last_sync_at, created_at) VALUES (?,?,'demo','demo','Demobanken','active',?,?)").run(connId, user.id, at, at);
  const spend = newId();
  const save = newId();
  db.prepare("INSERT INTO accounts (id, user_id, connection_id, environment, external_id, name, number_masked, type, selected, balance_ore, balance_kind, balance_at) VALUES (?,?,?,'demo','demo-lon','Lönekonto','•••• 4471','spending',1,?,'available',?)").run(spend, user.id, connId, balance, at);
  db.prepare("INSERT INTO accounts (id, user_id, connection_id, environment, external_id, name, number_masked, type, selected, balance_ore, balance_kind, balance_at) VALUES (?,?,?,'demo','demo-spar','Sparkonto','•••• 9023','savings',1,?,'available',?)").run(save, user.id, connId, kr(10700) + (key === "tajt" ? kr(1500) : 0), at);

  let n = 0;
  const tx = (amount: number, date: string, description: string, status: BankTx["status"] = "booked"): BankTx => ({ externalId: `demo-${++n}`, status, amountOre: kr(amount), date, description });
  const lm = (day: number) => dateInMonth(lastMonth, day);
  const spendTx: BankTx[] = [
    tx(28500, paydayFor(lastMonth, 25), "LÖN ARBETSGIVAREN AB"),
    tx(-7800, lm(28), "HYRA BOSTADSBOLAGET"),
    tx(-612, lm(27), "ICA NÄRA SÖDERMALM"),
    tx(-389, lm(29), "WILLYS HORNSTULL"),
    tx(-1500, lm(26), "ÖVERFÖRING SPARKONTO"),
    tx(-438, ago(16), "ICA NÄRA SÖDERMALM"),
    tx(-527, ago(12), "COOP KONSUM"),
    tx(-399, ago(6), "BREDBAND BREDBANDSBOLAGET"),
    tx(-611, ago(8), "WILLYS HORNSTULL"),
    tx(-430, ago(14), "SL RESEKASSA"),
    tx(-200, ago(9), "FILMSTADEN SÖDER"),
    tx(-389, ago(4), "ICA NÄRA SÖDERMALM"),
    tx(-185, ago(1), "HEMKÖP", "pending"),
    // Två handlare som appen inte känner igen – de dyker upp som frågor på startsidan.
    tx(-249, ago(5), "BLOMSTERLANDET"),
    tx(-59, ago(2), "PRESSBYRÅN CENTRALEN"),
    ...clothes.map(([a, d], i) => tx(a, ago(11 - i * 3), d)),
  ];
  const saveTx: BankTx[] = [tx(1500, lm(26), "ÖVERFÖRING FRÅN LÖNEKONTO")];
  if (key === "tajt") {
    // Månadens sparande är redan gjort: pengarna har faktiskt flyttats till sparkontot.
    spendTx.push(tx(-1000, ago(3), "ÖVERFÖRING SPARKONTO RESA"), tx(-500, ago(3), "ÖVERFÖRING SPARKONTO BUFFERT"));
    saveTx.push(tx(1000, ago(3), "ÖVERFÖRING FRÅN LÖNEKONTO"), tx(500, ago(3), "ÖVERFÖRING FRÅN LÖNEKONTO"));
  }
  importBankTransactions(user, save, saveTx);
  importBankTransactions(user, spend, spendTx);
  // Knyt sparöverföringarna till rätt mål (två mål → Ryms gissar inte själv).
  db.prepare("UPDATE transactions SET kind = 'saving', goal_id = ? WHERE user_id = ? AND account_id = ? AND amount_ore = ?").run(resa, user.id, spend, kr(-1000));
  db.prepare("UPDATE transactions SET kind = 'saving', goal_id = ? WHERE user_id = ? AND account_id = ? AND amount_ore = ?").run(buffert, user.id, spend, kr(-500));
  db.prepare("UPDATE transactions SET kind = 'transfer', goal_id = NULL WHERE user_id = ? AND account_id = ? AND amount_ore = ?").run(user.id, spend, kr(-1500));
  // Koppla betalda räkningar till sina banktransaktioner där de finns.
  db.prepare("UPDATE transactions SET bill_id = ?, category_id = NULL WHERE user_id = ? AND description LIKE 'BREDBAND%'").run(bredband, user.id);
  db.prepare("UPDATE transactions SET bill_id = ?, category_id = NULL WHERE user_id = ? AND description LIKE 'HYRA%'").run(hyra, user.id);

  updateUser(user.id, { onboarded: 1, next_payday: payday });
}

/**
 * "Hämta från demobanken": simulerar att kortköp du registrerat för hand nu dyker upp på kontot.
 * Går genom samma import och avstämning som riktig bankdata.
 */
export function syncDemoBank(user: User): { inserted: number; autoMatched: number; needsConfirmation: number } {
  if (!user.is_demo) throw new Error("Endast demo");
  const db = getDb();
  const acc = db.prepare("SELECT id, balance_ore FROM accounts WHERE user_id = ? AND environment = 'demo' AND type = 'spending' AND connection_id IN (SELECT id FROM bank_connections WHERE user_id = ? AND status = 'active')").get(user.id, user.id) as { id: string; balance_ore: number } | undefined;
  if (!acc) return { inserted: 0, autoMatched: 0, needsConfirmation: 0 };
  const manual = db.prepare("SELECT id, amount_ore, date FROM transactions WHERE user_id = ? AND source = 'manual' AND merged_into IS NULL AND kind = 'expense' AND amount_ore < 0 AND bill_id IS NULL").all(user.id) as { id: string; amount_ore: number; date: string }[];
  const have = new Set((db.prepare("SELECT external_id FROM transactions WHERE user_id = ? AND account_id = ?").all(user.id, acc.id) as { external_id: string }[]).map((r) => r.external_id));
  const fresh = manual.filter((m) => !have.has(`demo-kort-${m.id}`));
  const existing = db.prepare("SELECT external_id AS externalId, status, amount_ore AS amountOre, date, description FROM transactions WHERE user_id = ? AND account_id = ? AND source = 'bank'").all(user.id, acc.id) as BankTx[];
  const incoming: BankTx[] = [...existing, ...fresh.map((m) => ({ externalId: `demo-kort-${m.id}`, status: "booked" as const, amountOre: m.amount_ore, date: m.date, description: "KORTKÖP BUTIK" }))];
  const stats = importBankTransactions(user, acc.id, incoming);
  const at = nowISO();
  db.prepare("UPDATE accounts SET balance_ore = ?, balance_at = ? WHERE id = ?").run(acc.balance_ore + fresh.reduce((s, m) => s + m.amount_ore, 0), at, acc.id);
  db.prepare("UPDATE accounts SET balance_at = ? WHERE user_id = ? AND environment = 'demo'").run(at, user.id);
  db.prepare("UPDATE bank_connections SET last_sync_at = ? WHERE user_id = ? AND environment = 'demo' AND status = 'active'").run(at, user.id);
  return { inserted: stats.inserted, autoMatched: stats.autoMatched, needsConfirmation: stats.needsConfirmation };
}
