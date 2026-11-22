"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isDate, isMonth, monthOf, nowISO, todayISO } from "@/lib/dates";
import { CURRENCY_COOKIE, LOCALE_COOKIE, makeT, pick, type Locale, type T } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/locale";
import { cookies } from "next/headers";
import { isCurrency, parseKr } from "@/lib/money";
import { deleteAccount } from "@/lib/services/account";
import { BankError, deleteImportedBankData, disconnectBank, listBanks, selectAccounts, setManualBalance, startConnection, syncConnection } from "@/lib/services/bank";
import { createDemoGroup, demoSiblings, syncDemoBank } from "@/lib/services/demo";
import { deleteAllImages, deleteImage } from "@/lib/services/images";
import { bankStatus } from "@/lib/services/overview";
import { archiveCategory, archiveGoal, createBill, createCategory, createGoal, createPlannedPurchase, PlanError, setBillPaid, setPlanValue, updateGoal, updatePlannedPurchase, clearMonthOverride, getMonthPlan, type PlanKind, type Scope } from "@/lib/services/plan";
import { deleteCheck, evaluate, moveBudget, plannedCandidates, PurchaseError, recordBought, saveForLater, skipCheck, type CheckRequest, type Evaluation } from "@/lib/services/purchases";
import { answerCategory, addManualTx, deleteManualTx, resolveMatch, TxError, updateTx } from "@/lib/services/transactions";
import { authenticate, createUser, repointSession, updateUser, UserError } from "@/lib/services/users";
import type { TxKind } from "@/lib/engine/classify";
import { appUrl, psuContext, requireUser, sessionToken, signIn, signOut } from "@/lib/session";

export type ActionResult = { error?: string; ok?: boolean; message?: string } | void;

function fail(e: unknown, locale: Locale = "sv"): { error: string } {
  const t = makeT(locale);
  if (e instanceof PlanError || e instanceof PurchaseError || e instanceof TxError || e instanceof UserError) return { error: pick(e.message, locale) };
  if (e instanceof BankError) return { error: pick(e.message, locale) };
  if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e; // redirect/notFound
  console.error("[ryms] oväntat fel:", (e as Error)?.name);
  return { error: t("Något gick fel. Försök igen.", "Something went wrong. Please try again.") };
}
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
function refresh() {
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------- språk

export async function setLocaleAction(locale: Locale): Promise<void> {
  (await cookies()).set(LOCALE_COOKIE, locale === "en" ? "en" : "sv", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function setCurrencyAction(currency: string): Promise<void> {
  (await cookies()).set(CURRENCY_COOKIE, isCurrency(currency) ? currency : "SEK", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------- konto

const attempts = new Map<string, { n: number; at: number }>();
export async function loginAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const email = str(fd, "email").toLowerCase();
  const a = attempts.get(email);
  if (a && a.n >= 8 && Date.now() - a.at < 10 * 60_000) return { error: t("För många försök. Vänta några minuter och försök igen.", "Too many attempts. Wait a few minutes and try again.") };
  const user = authenticate(email, String(fd.get("password") ?? ""));
  if (!user) {
    attempts.set(email, { n: (a && Date.now() - a.at < 10 * 60_000 ? a.n : 0) + 1, at: Date.now() });
    return { error: t("Fel e-postadress eller lösenord.", "Wrong email or password.") };
  }
  attempts.delete(email);
  await signIn(user.id);
  redirect(user.onboarded ? "/" : "/kom-igang");
}

export async function signupAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  try {
    const user = createUser({ email: str(fd, "email"), password: String(fd.get("password") ?? ""), name: str(fd, "name") });
    await signIn(user.id);
  } catch (e) {
    return fail(e, locale);
  }
  redirect("/kom-igang");
}

export async function logoutAction(): Promise<void> {
  const { t, locale } = await getT();
  await signOut();
  redirect("/valkommen");
}

export async function startDemoAction(): Promise<void> {
  const { t, locale } = await getT();
  const user = createDemoGroup(todayISO(), locale);
  await signIn(user.id);
  redirect("/");
}

/** Byter demobudget. Bara mellan budgetarna i den egna demogruppen. */
export async function switchDemoAction(key: string, returnTo?: string): Promise<void> {
  const { t, locale } = await getT();
  const user = await requireUser();
  const target = demoSiblings(user).find((u) => u.demo_key === key);
  const token = await sessionToken();
  if (target && token) repointSession(token, target.id);
  refresh();
  if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) redirect(returnTo);
}

// ---------------------------------------------------------------- kom igång

export interface OnboardingInput {
  name: string;
  payday: string;
  income: string;
  balance: string;
  bills: { name: string; amount: string; day: string }[];
  categories: { name: string; icon: string; amount: string }[];
  goal: { name: string; target: string; monthly: string; saved: string } | null;
}
export async function completeOnboardingAction(input: OnboardingInput): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  try {
    const today = todayISO();
    const month = monthOf(today);
    if (!isDate(input.payday) || input.payday <= today) return { error: t("Välj ett datum för nästa lön, senare än idag.", "Pick a date for your next payday, later than today.") };
    const income = parseKr(input.income);
    if (income == null || income === 0) return { error: t("Ange din väntade lön efter skatt.", "Enter your expected pay after tax.") };
    const payDay = Number(input.payday.slice(8, 10));
    setPlanValue(user.id, { kind: "income", refId: "salary", month, scope: "template", amountOre: income, day: payDay });
    for (const c of input.categories) {
      const amount = parseKr(c.amount);
      if (!c.name.trim() || amount == null) continue;
      const id = createCategory(user.id, c.name, c.icon);
      setPlanValue(user.id, { kind: "category", refId: id, month, scope: "template", amountOre: amount });
    }
    for (const b of input.bills) {
      const amount = parseKr(b.amount);
      const day = Number(b.day);
      if (!b.name.trim() || amount == null || !Number.isInteger(day) || day < 1 || day > 31) continue;
      createBill(user.id, { name: b.name, amountOre: amount, day, month, scope: "template" });
    }
    if (input.goal?.name.trim()) {
      createGoal(user.id, { name: input.goal.name, targetOre: parseKr(input.goal.target) ?? 0, startOre: parseKr(input.goal.saved) ?? 0, monthlyOre: parseKr(input.goal.monthly) ?? 0, month });
    }
    const balance = parseKr(input.balance);
    if (balance != null && input.balance.trim()) setManualBalance(user.id, balance);
    updateUser(user.id, { name: input.name.trim().slice(0, 40), next_payday: input.payday, onboarded: 1 });
  } catch (e) {
    return fail(e, locale);
  }
  refresh();
  redirect("/");
}

// ---------------------------------------------------------------- plan

export async function setPlanValueAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  try {
    const kind = str(fd, "kind") as PlanKind;
    const month = str(fd, "month");
    const scope = (str(fd, "scope") === "template" ? "template" : "month") as Scope;
    if (!["category", "bill", "income", "saving"].includes(kind) || !isMonth(month)) return { error: t("Ogiltig begäran.", "Invalid request.") };
    if (month < monthOf(todayISO()) && scope === "template") return { error: t("En månad som redan passerat kan bara ändras för just den månaden.", "A month that has already passed can only be changed for that month.") };
    const removed = str(fd, "removed") === "1";
    const amount = removed ? 0 : parseKr(str(fd, "amount"));
    if (amount == null) return { error: t("Ange ett belopp, till exempel 1 500.", "Enter an amount, for example 1 500.") };
    const dayRaw = str(fd, "day");
    const day = dayRaw ? Number(dayRaw) : null;
    if (fd.get("reset") === "1") clearMonthOverride(user.id, kind, str(fd, "refId"), month);
    else setPlanValue(user.id, { kind, refId: str(fd, "refId"), month, scope, amountOre: amount, day, removed });
    if (kind === "income" && scope === "template" && day && user.next_payday && user.next_payday.slice(0, 7) > month) updateUser(user.id, { next_payday: null });
  } catch (e) {
    return fail(e, locale);
  }
  refresh();
}

export async function setPaydayAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  const date = str(fd, "payday");
  if (!isDate(date) || date <= todayISO()) return { error: t("Välj ett datum senare än idag.", "Pick a date later than today.") };
  updateUser(user.id, { next_payday: date });
  refresh();
}

export async function addCategoryAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  try {
    const month = str(fd, "month");
    const amount = parseKr(str(fd, "amount"));
    if (amount == null || !isMonth(month)) return { error: t("Ange en budget för kategorin.", "Enter a budget for the category.") };
    const id = createCategory(user.id, str(fd, "name"), str(fd, "icon") || "dot");
    setPlanValue(user.id, { kind: "category", refId: id, month, scope: str(fd, "scope") === "month" ? "month" : "template", amountOre: amount });
  } catch (e) {
    return fail(e, locale);
  }
  refresh();
}
export async function archiveCategoryAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  archiveCategory(user.id, str(fd, "id"));
  refresh();
}

export async function addBillAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  try {
    const amount = parseKr(str(fd, "amount"));
    const day = Number(str(fd, "day"));
    const month = str(fd, "month");
    if (amount == null || amount === 0) return { error: t("Ange räkningens belopp.", "Enter the bill amount.") };
    if (!Number.isInteger(day) || day < 1 || day > 31) return { error: t("Ange vilken dag i månaden den förfaller (1–31).", "Enter the day of the month it is due (1–31).") };
    if (!isMonth(month)) return { error: t("Ogiltig månad.", "Invalid month.") };
    createBill(user.id, { name: str(fd, "name"), amountOre: amount, day, month, scope: str(fd, "scope") === "month" ? "month" : "template", direction: str(fd, "direction") === "in" ? "in" : "out" });
  } catch (e) {
    return fail(e, locale);
  }
  refresh();
}

export async function toggleBillPaidAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  try {
    const month = str(fd, "month");
    const billId = str(fd, "billId");
    const paid = str(fd, "paid") === "1";
    const today = todayISO();
    const bill = getMonthPlan(user.id, month).bills.find((b) => b.id === billId);
    if (!bill) return { error: t("Räkningen hittades inte.", "The bill was not found.") };
    if (paid) {
      // Utan bankkoppling vet Ryms inte att pengarna lämnat kontot – då registreras betalningen manuellt.
      const mode = bankStatus(user).mode;
      const txId = mode === "none" || mode === "manual" ? addManualTx(user.id, { amountOre: bill.direction === "in" ? bill.amountOre : -bill.amountOre, date: today, description: bill.name, kind: bill.direction === "in" ? "income" : "expense", billId }) : null;
      setBillPaid(user.id, billId, month, true, today, txId);
    } else {
      if (bill.paid?.txId) {
        try {
          deleteManualTx(user.id, bill.paid.txId);
        } catch {}
      }
      setBillPaid(user.id, billId, month, false, today);
    }
  } catch (e) {
    return fail(e, locale);
  }
  refresh();
}

export async function addGoalAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  try {
    const target = parseKr(str(fd, "target"));
    if (target == null) return { error: t("Ange hur mycket du vill spara totalt.", "Enter how much you want to save in total.") };
    createGoal(user.id, { name: str(fd, "name"), targetOre: target, startOre: parseKr(str(fd, "saved")) ?? 0, monthlyOre: parseKr(str(fd, "monthly")) ?? 0, month: str(fd, "month") || monthOf(todayISO()) });
  } catch (e) {
    return fail(e, locale);
  }
  refresh();
}
export async function updateGoalAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  try {
    if (str(fd, "archive") === "1") archiveGoal(user.id, str(fd, "id"));
    else updateGoal(user.id, str(fd, "id"), { name: str(fd, "name") || undefined, targetOre: parseKr(str(fd, "target")) ?? undefined });
  } catch (e) {
    return fail(e, locale);
  }
  refresh();
}

/** Faktisk insättning till ett sparmål – skilt från det planerade sparandet. */
export async function addSavingDepositAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  try {
    const amount = parseKr(str(fd, "amount"));
    if (amount == null || amount === 0) return { error: t("Ange hur mycket du har satt in.", "Enter how much you have deposited.") };
    addManualTx(user.id, { amountOre: -amount, date: todayISO(), description: t("Insättning till sparande", "Deposit to savings"), kind: "saving", goalId: str(fd, "goalId") });
  } catch (e) {
    return fail(e, locale);
  }
  refresh();
}

export async function addPlannedAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  try {
    const max = parseKr(str(fd, "max"));
    if (max == null || max === 0) return { error: t("Ange det högsta du vill lägga.", "Enter the most you want to spend.") };
    createPlannedPurchase(user.id, { name: str(fd, "name"), categoryId: str(fd, "categoryId"), maxOre: max, month: str(fd, "month") });
  } catch (e) {
    return fail(e, locale);
  }
  refresh();
}
export async function updatePlannedAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  try {
    if (str(fd, "cancel") === "1") updatePlannedPurchase(user.id, str(fd, "id"), { status: "cancelled" });
    else {
      const max = parseKr(str(fd, "max"));
      if (max == null || max === 0) return { error: t("Ange det högsta du vill lägga.", "Enter the most you want to spend.") };
      updatePlannedPurchase(user.id, str(fd, "id"), { name: str(fd, "name") || undefined, maxOre: max });
    }
  } catch (e) {
    return fail(e, locale);
  }
  refresh();
}

// ---------------------------------------------------------------- Ryms det?

export interface CheckResponse {
  error?: string;
  evaluation?: Evaluation;
  /** samma köp mot de andra demobudgetarna */
  comparisons?: { key: string; label: string; verdict: string; headline: string; text: string }[];
}

function sanitize(req: CheckRequest): CheckRequest {
  return { itemName: String(req?.itemName ?? ""), priceOre: Number(req?.priceOre), categoryId: req?.categoryId ? String(req.categoryId) : null, plannedPurchaseId: req?.plannedPurchaseId ? String(req.plannedPurchaseId) : null };
}

/** Räknar ut svaret. Läser bara – ingenting i budgeten ändras. */
export async function evaluateAction(raw: CheckRequest, categoryName?: string | null): Promise<CheckResponse> {
  const { t, locale } = await getT();
  const user = await requireUser();
  try {
    const req = sanitize(raw);
    const today = todayISO();
    const evaluation = evaluate(user, req, today, locale);
    const comparisons: CheckResponse["comparisons"] = [];
    for (const sib of demoSiblings(user)) {
      if (sib.id === user.id) continue;
      const cats = getMonthPlan(sib.id, monthOf(today)).categories;
      const cat = cats.find((c) => c.name === (evaluation.categoryName ?? categoryName));
      const e = evaluate(sib, { itemName: req.itemName, priceOre: req.priceOre, categoryId: cat?.id ?? null }, today, locale);
      comparisons.push({ key: sib.demo_key!, label: sib.demo_label!, verdict: e.result.verdict, headline: e.explanation.headline, text: e.explanation.text });
    }
    return { evaluation, comparisons };
  } catch (e) {
    return fail(e, locale);
  }
}

export async function plannedCandidatesAction(itemName: string, categoryId: string | null) {
  const { t, locale } = await getT();
  const user = await requireUser();
  return plannedCandidates(user, String(itemName ?? ""), categoryId ? String(categoryId) : null, todayISO());
}

export async function boughtAction(raw: CheckRequest & { checkId?: string | null }): Promise<CheckResponse & { ok?: boolean }> {
  const { t, locale } = await getT();
  const user = await requireUser();
  try {
    const req = sanitize(raw);
    recordBought(user, { ...req, checkId: raw.checkId ? String(raw.checkId) : null }, todayISO());
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, locale);
  }
}

export async function saveLaterAction(raw: CheckRequest & { checkId?: string | null; imageId?: string | null; source?: string }): Promise<{ error?: string; ok?: boolean }> {
  const { t, locale } = await getT();
  const user = await requireUser();
  try {
    saveForLater(user, { ...sanitize(raw), checkId: raw.checkId ? String(raw.checkId) : null, imageId: raw.imageId ? String(raw.imageId) : null, source: ["photo", "screenshot", "manual"].includes(String(raw.source)) ? String(raw.source) : "manual" });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, locale);
  }
}

export async function skipAction(checkId: string | null): Promise<{ ok: boolean }> {
  const { t, locale } = await getT();
  const user = await requireUser();
  if (checkId) skipCheck(user, String(checkId));
  refresh();
  return { ok: true };
}

export async function moveBudgetAction(input: { fromCategoryId: string; toCategoryId: string; amountOre: number }): Promise<{ error?: string; ok?: boolean }> {
  const { t, locale } = await getT();
  const user = await requireUser();
  try {
    moveBudget(user, { fromCategoryId: String(input.fromCategoryId), toCategoryId: String(input.toCategoryId), amountOre: Number(input.amountOre) }, todayISO());
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, locale);
  }
}

export async function deleteCheckAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  const imageId = deleteCheck(user, str(fd, "id"));
  if (imageId) deleteImage(user.id, imageId);
  refresh();
}
export async function deleteCheckImageAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  deleteImage(user.id, str(fd, "imageId"));
  refresh();
}

export async function aiConsentAction(agree: boolean): Promise<void> {
  const { t, locale } = await getT();
  const user = await requireUser();
  updateUser(user.id, { ai_consent_at: agree ? nowISO() : null });
  refresh();
}

// ---------------------------------------------------------------- transaktioner

export async function addTxAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  try {
    const amount = parseKr(str(fd, "amount"));
    if (amount == null || amount === 0) return { error: t("Ange ett belopp.", "Enter an amount.") };
    const kind = str(fd, "kind") as TxKind;
    if (!["expense", "income", "refund", "saving"].includes(kind)) return { error: t("Ogiltig typ.", "Invalid type.") };
    const date = str(fd, "date") || todayISO();
    if (!isDate(date) || date > todayISO()) return { error: t("Ange ett datum, senast idag.", "Enter a date, no later than today.") };
    const negative = kind === "expense" || kind === "saving";
    addManualTx(user.id, { amountOre: negative ? -amount : amount, date, description: str(fd, "description") || (kind === "income" ? t("Insättning", "Deposit") : kind === "saving" ? t("Sparande", "Saving") : t("Köp", "Purchase")), kind, categoryId: kind === "expense" || kind === "refund" ? str(fd, "categoryId") || null : null, goalId: kind === "saving" ? str(fd, "goalId") || null : null });
  } catch (e) {
    return fail(e, locale);
  }
  refresh();
}
export async function updateTxAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  try {
    if (str(fd, "delete") === "1") deleteManualTx(user.id, str(fd, "id"));
    else updateTx(user.id, str(fd, "id"), { kind: str(fd, "kind") as TxKind, categoryId: str(fd, "categoryId") || null, goalId: str(fd, "goalId") || null });
  } catch (e) {
    return fail(e, locale);
  }
  refresh();
}
/** Svar på frågan "Vad var det här köpet?". */
export async function answerCategoryAction(txId: string, categoryId: string | null): Promise<{ error?: string; ok?: boolean }> {
  const { locale } = await getT();
  const user = await requireUser();
  try {
    answerCategory(user, String(txId), categoryId ? String(categoryId) : null);
  } catch (e) {
    return fail(e, locale);
  }
  refresh();
  return { ok: true };
}
export async function resolveMatchAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  try {
    resolveMatch(user.id, str(fd, "bankTxId"), str(fd, "manualTxId") || null);
  } catch (e) {
    return fail(e, locale);
  }
  refresh();
}

// ---------------------------------------------------------------- bank & integritet

export async function setBalanceAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  const amount = parseKr(str(fd, "amount"));
  if (amount == null) return { error: t("Ange ditt saldo, till exempel 4 250.", "Enter your balance, for example 4 250.") };
  setManualBalance(user.id, amount);
  refresh();
}

export async function demoSyncAction(): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  if (!user.is_demo) return { error: t("Finns bara i demoläget.", "Only available in the demo.") };
  const s = syncDemoBank(user);
  refresh();
  if (s.needsConfirmation) return { ok: true, message: t("Hämtat. Ett köp behöver din bekräftelse under Transaktioner.", "Synced. One purchase needs your confirmation under Transactions.") };
  if (s.autoMatched) return { ok: true, message: s.autoMatched === 1 ? t("Hämtat. Ett köp du registrerat matchades mot banken – det räknas en gång.", "Synced. A purchase you recorded was matched with the bank – it is counted once.") : t(`Hämtat. ${s.autoMatched} köp matchades mot banken – de räknas en gång.`, `Synced. ${s.autoMatched} purchases were matched with the bank – they are counted once.`) };
  return { ok: true, message: t("Hämtat. Inget nytt sedan sist.", "Synced. Nothing new since last time.") };
}

export async function listBanksAction(): Promise<{ error?: string; banks?: { name: string; country: string; maxConsentSeconds: number | null }[] }> {
  const { t, locale } = await getT();
  await requireUser();
  try {
    return { banks: await listBanks() };
  } catch (e) {
    return { error: e instanceof BankError && e.code === "config" ? t("Bankkopplingen är inte aktiverad i den här installationen.", "Bank connection is not enabled in this installation.") : t("Banklistan kunde inte hämtas just nu. Försök igen om en stund.", "The bank list could not be loaded right now. Try again in a moment.") };
  }
}

export async function startBankAction(bank: { name: string; country: string; maxConsentSeconds: number | null }): Promise<{ error?: string; url?: string }> {
  const { t, locale } = await getT();
  const user = await requireUser();
  try {
    const url = await startConnection(user, { name: String(bank.name), country: String(bank.country), maxConsentSeconds: bank.maxConsentSeconds == null ? null : Number(bank.maxConsentSeconds) }, await appUrl());
    return { url };
  } catch (e) {
    return { error: e instanceof BankError && e.code === "unavailable" ? t("Banken går inte att nå just nu. Försök igen om en stund.", "The bank cannot be reached right now. Try again in a moment.") : t("Anslutningen kunde inte startas.", "The connection could not be started.") };
  }
}

export async function selectAccountsAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  const connectionId = str(fd, "connectionId");
  try {
    const ids = fd.getAll("accountId").map(String);
    selectAccounts(user.id, connectionId, ids.map((id) => ({ accountId: id, selected: fd.get(`sel-${id}`) === "on", type: fd.get(`type-${id}`) === "savings" ? "savings" : "spending" })));
    await syncConnection(user, connectionId, await psuContext());
  } catch (e) {
    return fail(e, locale);
  }
  refresh();
  redirect("/installningar?bank=klar");
}

const syncMessages = (t: T): Record<string, string> => ({
  expired: t("Samtycket hos banken har gått ut. Anslut igen för att fortsätta hämta.", "The bank consent has expired. Connect again to keep syncing."),
  unavailable: t("Banken svarar inte just nu. Dina senaste uppgifter ligger kvar – försök igen om en stund.", "The bank is not responding right now. Your latest data is kept – try again in a moment."),
  rate_limited: t("Banken tillåter inte fler hämtningar just nu. Försök igen senare idag.", "The bank does not allow more syncs right now. Try again later today."),
  config: t("Bankkopplingen är inte aktiverad i den här installationen.", "Bank connection is not enabled in this installation."),
  other: t("Hämtningen misslyckades. Försök igen.", "The sync failed. Please try again."),
});
export async function syncNowAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  const r = await syncConnection(user, str(fd, "connectionId"), await psuContext());
  refresh();
  if (!r.ok) return { error: syncMessages(t)[r.code ?? "other"] };
  return { ok: true, message: r.needsConfirmation ? t("Hämtat. Ett köp behöver din bekräftelse under Transaktioner.", "Synced. One purchase needs your confirmation under Transactions.") : r.inserted ? t(`Hämtat. ${r.inserted} nya transaktioner.`, `Synced. ${r.inserted} new transactions.`) : t("Hämtat. Inget nytt sedan sist.", "Synced. Nothing new since last time.") };
}

export async function disconnectAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  try {
    const r = await disconnectBank(user, str(fd, "connectionId"));
    refresh();
    return r.revoked
      ? { ok: true, message: t("Banken är frånkopplad. Ryms hämtar ingenting mer.", "The bank is disconnected. Ryms no longer fetches anything.") }
      : { ok: true, message: t("Banken är frånkopplad hos Ryms och inget mer hämtas. Vi kunde inte bekräfta att samtycket stängdes hos banken – du kan också återkalla det i din internetbank.", "The bank is disconnected in Ryms and nothing more is fetched. We could not confirm that the consent was closed at the bank – you can also revoke it in your online bank.") };
  } catch (e) {
    return fail(e, locale);
  }
}

export async function deleteBankDataAction(): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  try {
    await deleteImportedBankData(user);
  } catch (e) {
    return fail(e, locale);
  }
  refresh();
  return { ok: true, message: t("All importerad bankdata är raderad.", "All imported bank data has been deleted.") };
}

export async function deleteImagesAction(): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  const n = deleteAllImages(user.id);
  refresh();
  return { ok: true, message: n === 0 ? t("Det fanns inga sparade bilder.", "There were no saved images.") : n === 1 ? t("1 bild raderad.", "1 image deleted.") : t(`${n} bilder raderade.`, `${n} images deleted.`) };
}

export async function deleteAccountAction(fd: FormData): Promise<ActionResult> {
  const { t, locale } = await getT();
  const user = await requireUser();
  if (!["radera", "delete"].includes(str(fd, "confirm").toLowerCase())) return { error: t("Skriv RADERA för att bekräfta.", "Type DELETE to confirm.") };
  await deleteAccount(user);
  await signOut();
  redirect("/valkommen?raderat=1");
}
