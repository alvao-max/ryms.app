import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ryms-test-"));
process.env.RYMS_DATA_DIR = tmp;
process.env.RYMS_DB = ":memory:";
process.env.RYMS_TODAY = "2026-11-18"; // onsdag

import { getDb } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { deleteAccount } from "@/lib/services/account";
import { toSuggestion } from "@/lib/services/analyze";
import { completeConnection, deleteImportedBankData, disconnectBank, listAccounts, selectAccounts, setManualBalance, setProviderForTests, startConnection, syncConnection, getConnection } from "@/lib/services/bank";
import { mapTransactions, pickBalance } from "@/lib/services/bank/enablebanking";
import { BankError, type BankProvider } from "@/lib/services/bank/provider";
import { createDemoGroup, demoSiblings, syncDemoBank } from "@/lib/services/demo";
import { deleteAllImages, deleteImage, readImage, saveImage, validateImage } from "@/lib/services/images";
import { bankStatus, buildOverview, spentByCategory } from "@/lib/services/overview";
import { createBill, createCategory, createPlannedPurchase, getMonthPlan, setPlanValue } from "@/lib/services/plan";
import { evaluate, getCheck, listChecks, moveBudget, plannedCandidates, recordBought, saveForLater } from "@/lib/services/purchases";
import { addManualTx, getTx, importBankTransactions, listTransactions, pendingMatches, resolveMatch, updateTx, type BankTx } from "@/lib/services/transactions";
import { createUser, envsFor, type User } from "@/lib/services/users";

const TODAY = "2026-11-18";
const kr = (n: number) => n * 100;
const norm = (s: string) => s.replace(/ /g, " ");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

let demo: Record<string, User>;
const catId = (u: User, name: string) => (getDb().prepare("SELECT id FROM categories WHERE user_id = ? AND name = ?").get(u.id, name) as { id: string }).id;
const jacket = (u: User) => ({ itemName: "Vinterjacka", priceOre: kr(699), categoryId: catId(u, "Kläder") });
const spent = (u: User, name: string) => spentByCategory(u.id, "2026-11", envsFor(u)).get(catId(u, name)) ?? 0;

beforeAll(() => {
  const first = createDemoGroup(TODAY);
  demo = Object.fromEntries(demoSiblings(first).map((u) => [u.demo_key!, u]));
});

describe("demobudgetarna: samma jacka, olika svar", () => {
  it("rymlig: 900 kr kvar → 201 kr kvar efter köpet", () => {
    const e = evaluate(demo.rymlig, jacket(demo.rymlig), TODAY);
    expect(e.result.verdict).toBe("yes");
    expect(e.result.category.availableOre).toBe(kr(900));
    expect(e.result.category.afterOre).toBe(kr(201));
    expect(norm(e.explanation.text)).toContain("Du har 900 kr kvar till kläder. Efter köpet på 699 kr har du 201 kr kvar");
  });
  it("liten: 400 kr kvar → det fattas 299 kr, och flytt föreslås bara från oreserverade pengar", () => {
    const e = evaluate(demo.liten, jacket(demo.liten), TODAY);
    expect(e.result.category.status).toBe("short");
    expect(e.result.category.shortfallOre).toBe(kr(299));
    expect(e.result.move?.amountOre).toBe(kr(299));
  });
  it("kängor: 1 500 kr varav 1 200 reserverat → jackan tar 399 kr av reservationen", () => {
    const u = demo.kangor;
    const cat = buildOverview(u, TODAY).categories.find((c) => c.name === "Kläder")!;
    expect(cat.figures).toMatchObject({ budgetOre: kr(1500), reservedOre: kr(1200), freeOre: kr(300) });
    const e = evaluate(u, jacket(u), TODAY);
    expect(e.result.category.status).toBe("uses_reservation");
    expect(e.result.category.usesReservedOre).toBe(kr(399));
  });
  it("tajt: ryms i kategorin men 180 kr saknas till elräkningen på fredag", () => {
    const e = evaluate(demo.tajt, jacket(demo.tajt), TODAY);
    expect(e.result.category.status).toBe("fits");
    expect(e.result.cash.status).toBe("bill_short");
    expect(e.result.cash.bill).toMatchObject({ label: "Elräkningen", date: "2026-11-20" });
    expect(e.result.cash.shortfallOre).toBe(kr(180));
    expect(norm(e.explanation.text)).toContain("Däremot skulle du sakna 180 kr till elräkningen på fredag. Efter lönen på måndag kan du kolla igen.");
  });
  it("håller isär saldo, kategorisaldo och kvar till lön", () => {
    const o = buildOverview(demo.rymlig, TODAY);
    expect(o.cash.cashOre).toBe(kr(9480));
    expect(o.left.amountOre).toBe(kr(9480 - 299 - 850 - 1000 - 500));
    expect(o.leftCalc.at(-1)).toMatchObject({ label: "Kvar till lön", amountOre: o.left.amountOre });
    expect(o.bank.mode).toBe("demo");
  });
  it("håller isär planerat och faktiskt sparande", () => {
    const resa = (u: User) => buildOverview(u, TODAY).goals.find((g) => g.name.startsWith("Resa"))!;
    expect(resa(demo.rymlig)).toMatchObject({ plannedThisMonthOre: kr(1000), savedThisMonthOre: 0, savedOre: kr(4200) });
    expect(resa(demo.tajt)).toMatchObject({ plannedThisMonthOre: kr(1000), savedThisMonthOre: kr(1000), savedOre: kr(5200) });
  });
  it("återbetalningar, väntande köp och överföringar räknas rätt", () => {
    expect(spent(demo.rymlig, "Kläder")).toBe(kr(349 + 450 - 199));
    expect(spent(demo.rymlig, "Mat")).toBe(kr(438 + 527 + 611 + 389 + 185));
    const kinds = listTransactions(demo.tajt).filter((t) => /ÖVERFÖRING/.test(t.description)).map((t) => t.kind);
    expect(kinds.every((k) => k === "saving" || k === "transfer")).toBe(true);
  });
});

describe("acceptansfall 2: de planerade kängorna använder reservationen exakt en gång", () => {
  it("köpet släpper reservationen och räknas en gång", () => {
    const u = demo.kangor;
    const c = plannedCandidates(u, "Vinterkängor", catId(u, "Kläder"), TODAY);
    expect(c).toHaveLength(1);
    expect(c[0].likely).toBe(true);
    const req = { itemName: "Vinterkängor", priceOre: kr(1149), categoryId: catId(u, "Kläder"), plannedPurchaseId: c[0].id };
    expect(evaluate(u, req, TODAY).result.category.status).toBe("fits_planned");
    recordBought(u, req, TODAY);
    let cat = buildOverview(u, TODAY).categories.find((x) => x.name === "Kläder")!;
    expect(cat.figures).toMatchObject({ spentOre: kr(1149), reservedOre: 0, freeOre: kr(351) });
    // Ett andra köp med samma planerade id får ingen reservation att använda.
    recordBought(u, { ...req, priceOre: kr(100) }, TODAY);
    cat = buildOverview(u, TODAY).categories.find((x) => x.name === "Kläder")!;
    expect(cat.figures).toMatchObject({ spentOre: kr(1249), reservedOre: 0, freeOre: kr(251) });
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM transactions WHERE user_id = ? AND planned_purchase_id = ?").get(u.id, c[0].id)).toEqual({ n: 1 });
  });
});

describe("acceptansfall 4: rätta pris, spara och kolla igen mot aktuell budget", () => {
  it("läser aldrig in ett pris som inte finns", () => {
    expect(toSuggestion({ item_name: "Lampa", prices: [], category: "Hem" }, ["Hem"]).question?.kind).toBe("missing_price");
    const multi = toSuggestion({ item_name: "Lurar", prices: [{ amount: "1 299", currency: "SEK", label: "" }, { amount: "899", currency: "SEK", label: "medlem" }], category: "" }, []);
    expect(multi.priceOre).toBeNull();
    expect(multi.question?.kind).toBe("multiple_prices");
    expect(toSuggestion({ item_name: "Bok", prices: [{ amount: "49.95", currency: "EUR", label: "" }], category: "" }, []).priceOre).toBeNull();
    expect(toSuggestion({ item_name: "Jacka", prices: [{ amount: "699:-", currency: "SEK", label: "" }], category: "kläder" }, ["Kläder"])).toMatchObject({ priceOre: kr(699), categoryName: "Kläder", question: null });
  });
  it("sparad sak räknas om när budgeten ändras", () => {
    const u = demo.liten;
    const misread = { ...jacket(u), priceOre: kr(6990) };
    const id = saveForLater(u, { ...misread, priceOre: kr(699) }); // användaren rättade 6 990 → 699
    const before = buildOverview(u, TODAY);
    expect(getCheck(u, id)).toMatchObject({ price_ore: kr(699), status: "saved" });
    expect(buildOverview(u, TODAY).categories).toEqual(before.categories); // att spara ändrar inte budgeten
    expect(evaluate(u, jacket(u), TODAY).result.verdict).toBe("no");
    moveBudget(u, { fromCategoryId: catId(u, "Nöje"), toCategoryId: catId(u, "Kläder"), amountOre: kr(299) }, TODAY);
    const saved = listChecks(u, "saved")[0];
    const again = evaluate(u, { itemName: saved.item_name, priceOre: saved.price_ore, categoryId: saved.category_id }, TODAY);
    expect(again.result.verdict).toBe("yes");
    expect(again.result.category.afterOre).toBe(0);
    expect(() => moveBudget(u, { fromCategoryId: catId(u, "Nöje"), toCategoryId: catId(u, "Kläder"), amountOre: kr(5000) }, TODAY)).toThrow();
  });
});

describe("acceptansfall 5: manuellt köp + bankimport = ett köp", () => {
  it("räknas en gång, även när importen upprepas", () => {
    const u = demo.rymlig;
    const before = spent(u, "Kläder");
    const { txId } = recordBought(u, jacket(u), TODAY);
    expect(spent(u, "Kläder")).toBe(before + kr(699)); // syns direkt
    const cashAfterManual = buildOverview(u, TODAY).cash.cashOre;
    expect(cashAfterManual).toBe(kr(9480 - 699));

    const s1 = syncDemoBank(u);
    expect(s1).toMatchObject({ inserted: 1, autoMatched: 1, needsConfirmation: 0 });
    expect(spent(u, "Kläder")).toBe(before + kr(699));
    expect(buildOverview(u, TODAY).cash.cashOre).toBe(cashAfterManual);
    const merged = getTx(u.id, txId)!;
    expect(merged.merged_into).not.toBeNull();
    expect(getTx(u.id, merged.merged_into!)).toMatchObject({ source: "bank", item_name: "Vinterjacka", category_id: catId(u, "Kläder") });

    const s2 = syncDemoBank(u);
    expect(s2).toMatchObject({ inserted: 0, autoMatched: 0 });
    expect(spent(u, "Kläder")).toBe(before + kr(699));
    expect(buildOverview(u, TODAY).cash.cashOre).toBe(cashAfterManual);
    expect(listTransactions(u).filter((t) => t.amount_ore === kr(-699))).toHaveLength(1);
  });

  it("frågar när matchningen är tvetydig och dubbelräknar inte under tiden", () => {
    const u = createUser({ email: "tvetydig@example.com", password: "hemligt-losen" });
    const c = createCategory(u.id, "Nöje");
    setPlanValue(u.id, { kind: "category", refId: c, month: "2026-11", scope: "template", amountOre: kr(1000) });
    const acc = bankAccount(u);
    const m1 = addManualTx(u.id, { amountOre: kr(-150), date: TODAY, description: "Bio", kind: "expense", categoryId: c });
    addManualTx(u.id, { amountOre: kr(-150), date: TODAY, description: "Lunch", kind: "expense", categoryId: c });
    const total = () => spentByCategory(u.id, "2026-11", ["manual", "sandbox"]).get(c) ?? 0;
    expect(total()).toBe(kr(300));
    const s = importBankTransactions(u, acc, [{ externalId: "x1", status: "booked", amountOre: kr(-150), date: TODAY, description: "KORTKÖP" }]);
    expect(s).toMatchObject({ autoMatched: 0, needsConfirmation: 1 });
    expect(total()).toBe(kr(300));
    const pm = pendingMatches(u.id);
    expect(pm).toHaveLength(1);
    expect(pm[0].candidates).toHaveLength(2);
    resolveMatch(u.id, pm[0].bank.id, m1);
    expect(total()).toBe(kr(300));
    expect(pendingMatches(u.id)).toHaveLength(0);
    // "Nej, ett annat köp" räknar banktransaktionen som ett eget köp.
    importBankTransactions(u, acc, [
      { externalId: "x1", status: "booked", amountOre: kr(-150), date: TODAY, description: "KORTKÖP" },
      { externalId: "x2", status: "booked", amountOre: kr(-150), date: TODAY, description: "KORTKÖP 2" },
      { externalId: "x3", status: "booked", amountOre: kr(-150), date: TODAY, description: "KORTKÖP 3" },
    ]);
    for (const p of pendingMatches(u.id)) resolveMatch(u.id, p.bank.id, null);
    expect(pendingMatches(u.id)).toHaveLength(0);
    expect(listTransactions(u).filter((t) => t.kind === "expense")).toHaveLength(4);
  });

  it("väntande → bokförd med ny nyckel blir ingen dubblett, och återbetalning minskar förbrukat", () => {
    const u = createUser({ email: "pending@example.com", password: "hemligt-losen" });
    const c = createCategory(u.id, "Kläder");
    const acc = bankAccount(u);
    const tx = (o: Partial<BankTx>): BankTx => ({ externalId: "p1", status: "pending", amountOre: kr(-450), date: TODAY, description: "ZALANDO SE", ...o });
    importBankTransactions(u, acc, [tx({})]);
    importBankTransactions(u, acc, [tx({ externalId: "b1", status: "booked", date: "2026-11-19" })]);
    const rows = listTransactions(u);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "booked", external_id: "b1", category_id: c });
    importBankTransactions(u, acc, [tx({ externalId: "b1", status: "booked", date: "2026-11-19" }), tx({ externalId: "b2", status: "booked", amountOre: kr(199), date: "2026-11-20" })]);
    expect(listTransactions(u).find((t) => t.external_id === "b2")).toMatchObject({ kind: "refund", category_id: c });
    expect(spentByCategory(u.id, "2026-11", ["manual", "sandbox"]).get(c)).toBe(kr(251));
    // En väntande transaktion som banken tar bort försvinner.
    importBankTransactions(u, acc, [tx({ externalId: "p9", amountOre: kr(-80) })]);
    importBankTransactions(u, acc, []);
    expect(listTransactions(u).some((t) => t.external_id === "p9")).toBe(false);
  });

  it("en bankrad säger inget om vilken vara som köptes", () => {
    const u = createUser({ email: "vara@example.com", password: "hemligt-losen" });
    const c = createCategory(u.id, "Kläder");
    const pp = createPlannedPurchase(u.id, { name: "Vinterkängor", categoryId: c, maxOre: kr(1200), month: "2026-11" });
    importBankTransactions(u, bankAccount(u), [{ externalId: "s1", status: "booked", amountOre: kr(-1149), date: TODAY, description: "SCORETT STOCKHOLM" }]);
    expect(getMonthPlan(u.id, "2026-11").planned.find((p) => p.id === pp)?.status).toBe("planned");
    expect(listTransactions(u)[0]).toMatchObject({ item_name: null, planned_purchase_id: null });
  });
});

function bankAccount(u: User, env = "sandbox"): string {
  const db = getDb();
  const conn = crypto.randomUUID();
  const acc = crypto.randomUUID();
  db.prepare("INSERT INTO bank_connections (id, user_id, environment, provider, bank_name, status, created_at) VALUES (?,?,?,'test','Testbank','active',?)").run(conn, u.id, env, new Date().toISOString());
  db.prepare("INSERT INTO accounts (id, user_id, connection_id, environment, external_id, name, type, selected, balance_ore, balance_at) VALUES (?,?,?,?,'ext','Konto','spending',1,?,?)").run(acc, u.id, conn, env, kr(5000), new Date().toISOString());
  return acc;
}

describe("acceptansfall 6a: en månad ändras utan att andra påverkas", () => {
  it("bara november, och mall från november rör inte oktober", () => {
    const u = createUser({ email: "plan@example.com", password: "hemligt-losen" });
    const c = createCategory(u.id, "Kläder");
    const budget = (m: string) => getMonthPlan(u.id, m).categories[0].budgetOre;
    setPlanValue(u.id, { kind: "category", refId: c, month: "2026-09", scope: "template", amountOre: kr(1500) });
    setPlanValue(u.id, { kind: "category", refId: c, month: "2026-11", scope: "month", amountOre: kr(900) });
    expect([budget("2026-10"), budget("2026-11"), budget("2026-12")]).toEqual([kr(1500), kr(900), kr(1500)]);
    setPlanValue(u.id, { kind: "category", refId: c, month: "2026-12", scope: "template", amountOre: kr(2000) });
    expect([budget("2026-10"), budget("2026-11"), budget("2026-12"), budget("2027-01")]).toEqual([kr(1500), kr(900), kr(2000), kr(2000)]);
    expect(budget("2026-08")).toBeNull();
    const bill = createBill(u.id, { name: "Tandläkare", amountOre: kr(950), day: 12, month: "2026-11", scope: "month" });
    expect(getMonthPlan(u.id, "2026-11").bills.map((b) => b.id)).toEqual([bill]);
    expect(getMonthPlan(u.id, "2026-12").bills).toEqual([]);
    expect(getMonthPlan(u.id, "2026-10").bills).toEqual([]);
  });
});

describe("acceptansfall 6b: bank, bilder och åtkomst mellan användare", () => {
  const calls: string[] = [];
  let failNext: BankError | null = null;
  const fake: BankProvider = {
    id: "fake",
    displayName: "Fake",
    configured: () => true,
    listBanks: async () => [{ name: "Testbanken", country: "SE", maxConsentSeconds: 7776000 }],
    startAuth: async ({ state }) => ({ url: `https://bank.example/auth?state=${state}`, validUntil: "2027-01-01T00:00:00.000Z" }),
    createSession: async () => ({
      sessionId: "hemlig-session",
      accounts: [
        { externalId: "uid-1", stableKey: "hash-1", name: "Lönekonto", numberMasked: "•••• 1234", currency: "SEK", typeGuess: "spending" },
        { externalId: "uid-2", stableKey: "hash-2", name: "Sparkonto", numberMasked: "•••• 5678", currency: "SEK", typeGuess: "savings" },
      ],
    }),
    fetchBalance: async (_s, uid) => {
      calls.push(`balance:${uid}`);
      if (failNext) throw failNext;
      return { balanceOre: kr(4321), kind: "available" };
    },
    fetchTransactions: async (_s, uid) => {
      calls.push(`tx:${uid}`);
      return uid === "uid-1" ? [{ externalId: "t1", status: "booked", amountOre: kr(-120), date: TODAY, description: "ICA NÄRA" }] : [];
    },
    revoke: async (s) => {
      calls.push(`revoke:${s}`);
    },
  };
  let alice: User;
  let bob: User;
  let connId: string;

  it("ansluter med state, väljer konton, synkar och krypterar sessionen", async () => {
    setProviderForTests(fake);
    alice = createUser({ email: "alice@example.com", password: "hemligt-losen" });
    bob = createUser({ email: "bob@example.com", password: "hemligt-losen" });
    createCategory(alice.id, "Mat");
    expect(bankStatus(alice).mode).toBe("none");
    const url = await startConnection(alice, { name: "Testbanken", country: "SE", maxConsentSeconds: null }, "http://localhost:3000");
    const state = new URL(url).searchParams.get("state")!;
    // Någon annan kan inte slutföra Alices anslutning, och fel state avvisas.
    expect(await completeConnection(bob, { code: "c", state })).toEqual({ ok: false, reason: "unknown_state" });
    expect(await completeConnection(alice, { code: "c", state: "fel" })).toEqual({ ok: false, reason: "unknown_state" });
    expect(bankStatus(alice).mode).toBe("none"); // inte "ansluten" förrän det faktiskt lyckats
    const done = await completeConnection(alice, { code: "c", state });
    expect(done.ok).toBe(true);
    connId = (done as { connectionId: string }).connectionId;
    const raw = getDb().prepare("SELECT session_enc FROM bank_connections WHERE id = ?").get(connId) as { session_enc: string };
    expect(raw.session_enc).not.toContain("hemlig-session");
    expect(decryptSecret(raw.session_enc)).toBe("hemlig-session");
    expect(encryptSecret("a")).not.toBe(encryptSecret("a"));

    const accs = listAccounts(alice.id, connId);
    expect(accs.every((a) => a.selected === 0)).toBe(true); // inget läses förrän användaren valt konton
    selectAccounts(alice.id, connId, [{ accountId: accs.find((a) => a.name === "Lönekonto")!.id, selected: true, type: "spending" }]);
    const r = await syncConnection(alice, connId);
    expect(r).toMatchObject({ ok: true, inserted: 1 });
    expect(calls.filter((c) => c.includes("uid-2"))).toEqual([]); // det ovalda kontot hämtas aldrig
    expect(bankStatus(alice)).toMatchObject({ mode: "sandbox", status: "active", bankName: "Testbanken" });
    expect(buildOverview(alice, TODAY).cash.cashOre).toBe(kr(4321));
  });

  it("avbruten inloggning, utgånget samtycke och bank som inte svarar", async () => {
    const carl = createUser({ email: "carl@example.com", password: "hemligt-losen" });
    const url = await startConnection(carl, { name: "Testbanken", country: "SE", maxConsentSeconds: null }, "http://localhost:3000");
    const state = new URL(url).searchParams.get("state")!;
    expect(await completeConnection(carl, { error: "access_denied", state })).toEqual({ ok: false, reason: "cancelled" });
    expect(bankStatus(carl).mode).toBe("none");

    failNext = new BankError("unavailable", "x");
    expect(await syncConnection(alice, connId)).toMatchObject({ ok: false, code: "unavailable" });
    expect(getConnection(alice.id, connId)).toMatchObject({ status: "active", last_sync_error: "unavailable" });
    expect(buildOverview(alice, TODAY).cash.cashOre).toBe(kr(4321)); // äldre data ligger kvar
    failNext = new BankError("expired", "x");
    expect(await syncConnection(alice, connId)).toMatchObject({ ok: false, code: "expired" });
    expect(getConnection(alice.id, connId)?.status).toBe("expired");
    failNext = null;
    expect(await syncConnection(alice, connId)).toMatchObject({ ok: true });
  });

  it("en användare kommer inte åt en annans transaktioner, bank eller bilder", async () => {
    const tx = listTransactions(alice)[0];
    expect(getTx(bob.id, tx.id)).toBeNull();
    expect(() => updateTx(bob.id, tx.id, { kind: "transfer" })).toThrow();
    expect(listTransactions(bob)).toEqual([]);
    expect(getConnection(bob.id, connId)).toBeNull();
    expect(listAccounts(bob.id, connId)).toEqual([]);
    expect(await syncConnection(bob, connId)).toMatchObject({ ok: false });
    await expect(disconnectBank(bob, connId)).rejects.toThrow();
    const aliceCat = catId(alice, "Mat");
    expect(() => addManualTx(bob.id, { amountOre: -100, date: TODAY, description: "x", kind: "expense", categoryId: aliceCat })).toThrow();
    expect(() => setPlanValue(bob.id, { kind: "category", refId: aliceCat, month: "2026-11", scope: "month", amountOre: 1 })).toThrow();
    expect(() => evaluate(bob, { itemName: "x", priceOre: 100, categoryId: aliceCat }, TODAY)).toThrow();

    const img = saveImage(alice.id, JPEG);
    expect(readImage(alice.id, img)?.mime).toBe("image/jpeg");
    expect(readImage(bob.id, img)).toBeNull();
    expect(deleteImage(bob.id, img)).toBe(false);
    expect(() => saveForLater(bob, { itemName: "x", priceOre: 100, categoryId: null, imageId: img })).toThrow();
    const check = saveForLater(alice, { itemName: "Jacka", priceOre: kr(699), categoryId: null, imageId: img });
    expect(getCheck(bob, check)).toBeNull();
    expect(() => validateImage(Buffer.from("<svg onload=alert(1)>"))).toThrow();
    expect(() => validateImage(Buffer.alloc(9 * 1024 * 1024, 0xff))).toThrow();

    // Radera sparade bilder: filen och kopplingen försvinner, den sparade saken finns kvar.
    expect(deleteAllImages(alice.id)).toBe(1);
    expect(readImage(alice.id, img)).toBeNull();
    expect(fs.existsSync(path.join(tmp, "uploads", alice.id))).toBe(false);
    expect(getCheck(alice, check)).toMatchObject({ image_id: null, status: "saved" });
  });

  it("koppla från stoppar hämtningar; radering av data och konto är separata steg", async () => {
    calls.length = 0;
    const d = await disconnectBank(alice, connId);
    expect(d.revoked).toBe(true);
    expect(calls).toEqual(["revoke:hemlig-session"]);
    expect((getDb().prepare("SELECT session_enc FROM bank_connections WHERE id = ?").get(connId) as { session_enc: null }).session_enc).toBeNull();
    calls.length = 0;
    expect(await syncConnection(alice, connId)).toMatchObject({ ok: false });
    expect(calls).toEqual([]); // inga fler anrop till banken
    expect(bankStatus(alice).status).toBe("disconnected");
    expect(listTransactions(alice).length).toBe(1); // datan finns kvar tills den raderas

    addManualTx(alice.id, { amountOre: -5000, date: TODAY, description: "Kaffe", kind: "expense" });
    await deleteImportedBankData(alice);
    expect(listTransactions(alice).map((t) => t.source)).toEqual(["manual"]);
    expect(bankStatus(alice).mode).toBe("none");
    setManualBalance(alice.id, kr(2000));
    expect(bankStatus(alice).mode).toBe("manual");

    await deleteAccount(alice);
    const left = (t: string) => (getDb().prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`).get(alice.id) as { n: number }).n;
    for (const t of ["transactions", "accounts", "bank_connections", "categories", "checks", "images", "sessions", "plan_values"]) expect(left(t)).toBe(0);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM users WHERE id = ?").get(bob.id)).toEqual({ n: 1 });
    setProviderForTests(null);
  });

  it("demo-, sandbox- och skarp data blandas inte", () => {
    const u = createUser({ email: "miljo@example.com", password: "hemligt-losen" });
    const c = createCategory(u.id, "Mat");
    const live = bankAccount(u, "live");
    importBankTransactions(u, live, [{ externalId: "l1", status: "booked", amountOre: kr(-100), date: TODAY, description: "ICA" }]);
    expect(envsFor(u)).toEqual(["manual", "sandbox"]);
    expect(spentByCategory(u.id, "2026-11", envsFor(u)).get(c)).toBeUndefined();
    expect(buildOverview(u, TODAY).cash.known).toBe(false);
    expect(bankStatus(u).mode).toBe("none"); // en skarp anslutning visas inte som ansluten i sandbox
    expect(envsFor(demo.rymlig)).toEqual(["manual", "demo"]);
  });
});

describe("leverantörens data", () => {
  it("tolkar belopp utan flyttal och använder stabila nycklar", () => {
    const base = { transaction_amount: { amount: "699.90", currency: "SEK" }, credit_debit_indicator: "DBIT", booking_date: TODAY, remittance_information: ["KORTKÖP", "H&M"] };
    const out = mapTransactions([
      { ...base, status: "BOOK", entry_reference: "E1" },
      { ...base, status: "BOOK" },
      { ...base, status: "BOOK" },
      { ...base, status: "PDNG", booking_date: null, value_date: TODAY },
      { ...base, status: "BOOK", transaction_amount: { amount: "10.00", currency: "EUR" } },
      { ...base, status: "RJCT" },
      { ...base, status: "BOOK", credit_debit_indicator: "CRDT", transaction_amount: { amount: "0.1", currency: "SEK" }, entry_reference: "E2" },
    ]);
    expect(out.map((t) => t.amountOre)).toEqual([-69990, -69990, -69990, -69990, 10]);
    expect(new Set(out.map((t) => t.externalId)).size).toBe(5);
    expect(out[0].externalId).toBe("ref:E1");
    expect(mapTransactions([{ ...base, status: "BOOK" }])[0].externalId).toBe(out[1].externalId); // samma rad → samma nyckel
    expect(pickBalance([{ balance_type: "CLBD", balance_amount: { amount: "100.00", currency: "SEK" } }, { balance_type: "ITAV", balance_amount: { amount: "80.50", currency: "SEK" } }])).toEqual({ balanceOre: 8050, kind: "available" });
  });
});

describe("okända köp: fråga och kom ihåg", () => {
  it("svaret gäller alla väntande köp från samma handlare och nästa import", async () => {
    const { answerCategory, uncategorizedTx } = await import("@/lib/services/transactions");
    const u = createUser({ email: "okand@example.com", password: "hemligt-losen" });
    const other = createUser({ email: "okand2@example.com", password: "hemligt-losen" });
    const hem = createCategory(u.id, "Hem");
    const acc = bankAccount(u);
    const tx = (id: string, desc: string, date = TODAY): BankTx => ({ externalId: id, status: "booked", amountOre: kr(-100), date, description: desc });
    importBankTransactions(u, acc, [tx("a", "BLOMSTERLANDET 123"), tx("b", "BLOMSTERLANDET 456", "2026-11-17"), tx("c", "KIOSKEN")]);
    expect(uncategorizedTx(u)).toHaveLength(3);
    const first = uncategorizedTx(u).find((t) => t.description.startsWith("BLOMSTER"))!;
    expect(() => answerCategory(other, first.id, null)).toThrow(); // någon annans köp
    expect(answerCategory(u, first.id, hem)).toEqual({ alsoUpdated: 1 });
    expect(uncategorizedTx(u).map((t) => t.description)).toEqual(["KIOSKEN"]);
    expect(spentByCategory(u.id, "2026-11", ["manual", "sandbox"]).get(hem)).toBe(kr(200));
    importBankTransactions(u, acc, [tx("a", "BLOMSTERLANDET 123"), tx("b", "BLOMSTERLANDET 456", "2026-11-17"), tx("c", "KIOSKEN"), tx("d", "BLOMSTERLANDET 789")]);
    expect(listTransactions(u).find((t) => t.external_id === "d")?.category_id).toBe(hem); // inlärt
    answerCategory(u, uncategorizedTx(u)[0].id, null); // "inte ett köp"
    expect(uncategorizedTx(u)).toHaveLength(0);
  });
});
