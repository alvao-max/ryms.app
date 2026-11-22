import Link from "next/link";
import { addBillAction, addCategoryAction, addGoalAction, addPlannedAction, addSavingDepositAction, archiveCategoryAction, setPaydayAction, setPlanValueAction, toggleBillPaidAction, updateGoalAction, updatePlannedAction } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { DemoStrip, Top } from "@/components/Frame";
import { BackIcon, CategoryIcon, CATEGORY_ICONS, CheckIcon, InfoIcon, NextIcon } from "@/components/icons";
import { SheetButton } from "@/components/Sheet";
import { addMonths, formatDate, formatDateShort, isMonth, monthName, monthOf, todayISO } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { categoryFigures } from "@/lib/engine/budget";
import type { Locale, T } from "@/lib/i18n";
import { getT } from "@/lib/locale";
import { formatKr, oreToInput } from "@/lib/money";
import { categorySnapshots, goalProgress } from "@/lib/services/overview";
import { getMonthPlan, nextPayday, type Scope } from "@/lib/services/plan";
import { envsFor } from "@/lib/services/users";
import { requireUser } from "@/lib/session";

function ScopeField({ month, past, current, t, locale }: { month: string; past: boolean; current?: Scope | null; t: T; locale: Locale }) {
  const m = monthName(month, locale);
  if (past) return <input type="hidden" name="scope" value="month" />;
  return (
    <>
      <span className="label">{t("Gäller", "Applies to")}</span>
      <div className="seg" style={{ marginTop: 6 }}>
        <label>
          <input type="radio" name="scope" value="month" defaultChecked={current === "month"} />
          {t(`Bara ${m}`, `Only ${m}`)}
        </label>
        <label>
          <input type="radio" name="scope" value="template" defaultChecked={current !== "month"} />
          {t(`Varje månad från ${m}`, `Every month from ${m}`)}
        </label>
      </div>
    </>
  );
}
const Hidden = ({ v }: { v: Record<string, string> }) => (
  <>
    {Object.entries(v).map(([k, val]) => (
      <input key={k} type="hidden" name={k} value={val} />
    ))}
  </>
);

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getT();
  const today = todayISO();
  const thisMonth = monthOf(today);
  const q = await searchParams;
  const month = isMonth(q.m) ? q.m : thisMonth;
  const past = month < thisMonth;
  const mName = monthName(month, locale);
  const plan = getMonthPlan(user.id, month);
  const envs = envsFor(user);
  const cats = categorySnapshots(user.id, plan, envs);
  const goals = goalProgress(user, month);
  const received = (
    getDb()
      .prepare(`SELECT COALESCE(SUM(amount_ore), 0) AS s FROM transactions WHERE user_id = ? AND kind = 'income' AND merged_into IS NULL AND substr(date, 1, 7) = ? AND environment IN (${envs.map(() => "?").join(",")})`)
      .get(user.id, month, ...envs) as { s: number }
  ).s;
  const payday = nextPayday(user.id, today, user.next_payday);
  const totalBudget = cats.reduce((s, c) => s + (c.budgetOre ?? 0), 0);
  const totalBills = plan.bills.filter((b) => b.direction === "out").reduce((s, b) => s + b.amountOre, 0);
  const totalSaving = plan.savings.reduce((s, g) => s + g.plannedOre, 0);
  const unplanned = plan.income ? plan.income.amountOre - totalBudget - totalBills - totalSaving : null;
  const scopeProps = { month, past, t, locale };
  const save = t("Spara", "Save");
  const add = t("Lägg till", "Add");
  const ICON_NAMES: Record<string, string> = {
    mat: t("Mat", "Food"),
    klader: t("Kläder", "Clothes"),
    noje: t("Nöje", "Fun"),
    transport: "Transport",
    hem: t("Hem", "Home"),
    halsa: t("Hälsa", "Health"),
    dot: t("Annat", "Other"),
  };

  return (
    <div className="shell">
      <DemoStrip user={user} />
      <Top user={user} />
      <main className="page">
        <div className="month-nav">
          <Link className="iconbtn" href={`/plan?m=${addMonths(month, -1)}`} aria-label={t("Föregående månad", "Previous month")}>
            <BackIcon />
          </Link>
          <div style={{ textAlign: "center" }}>
            <span className="caps faint">{t("Månadsplan", "Monthly plan")}</span>
            <h1 data-testid="plan-month">
              {mName} {month.slice(0, 4)}
            </h1>
          </div>
          <Link className="iconbtn" href={`/plan?m=${addMonths(month, 1)}`} aria-label={t("Nästa månad", "Next month")}>
            <NextIcon />
          </Link>
        </div>

        <div className="stack">
          {month !== thisMonth && (
            <p className="note lilac">
              <InfoIcon size={16} />
              <span>
                {past
                  ? t(`Det här är historiken för ${mName}. En ändring här gäller bara ${mName}.`, `This is the history for ${mName}. A change here only applies to ${mName}.`)
                  : t(`Det här är planen för ${mName}. Du väljer själv om en ändring ska gälla bara ${mName} eller framåt.`, `This is the plan for ${mName}. You choose whether a change applies only to ${mName} or from then on.`)}{" "}
                <Link href="/plan" className="linkish">
                  {t(`Till ${monthName(thisMonth, locale)}`, `Go to ${monthName(thisMonth, locale)}`)}
                </Link>
              </span>
            </p>
          )}

          {/* ───── Inkomst ───── */}
          <section className="card glow">
            <div className="card-head">
              <h2>{t("Inkomst", "Income")}</h2>
            </div>
            <div className="rows">
              <SheetButton
                className="row"
                title={t("Väntad lön", "Expected salary")}
                testId="edit-income"
                label={
                  <>
                    <span className="grow">
                      <span className="title" style={{ display: "block" }}>{t("Väntad lön", "Expected salary")}</span>
                      <span className="sub" style={{ display: "block" }}>{plan.income ? t(`Lönedag ${formatDate(plan.income.payday)}`, `Payday ${formatDate(plan.income.payday, "en")}`) : t("Inte angiven", "Not set")}</span>
                    </span>
                    <span className="amt num tap">{plan.income ? formatKr(plan.income.amountOre) : t("Ange", "Set")}</span>
                  </>
                }
              >
                <ActionForm action={setPlanValueAction} submit={save}>
                  <Hidden v={{ kind: "income", refId: "salary", month }} />
                  <div className="field-row">
                    <label className="field kr">
                      <span>{t("Lön efter skatt", "Salary after tax")}</span>
                      <input name="amount" inputMode="decimal" defaultValue={oreToInput(plan.income?.amountOre)} required />
                    </label>
                    <label className="field">
                      <span>{t("Lönedag (1–31)", "Payday (1–31)")}</span>
                      <input name="day" inputMode="numeric" defaultValue={plan.income?.day ?? 25} required />
                    </label>
                  </div>
                  <ScopeField {...scopeProps} current={plan.income?.scope} />
                </ActionForm>
              </SheetButton>
              <div className="row">
                <div className="grow">
                  <div className="title">{t(`Mottaget i ${mName}`, `Received in ${mName}`)}</div>
                  <div className="sub">{t("Faktiska insättningar som räknats som inkomst", "Actual deposits counted as income")}</div>
                </div>
                <div className="amt num">{formatKr(received)}</div>
              </div>
              {month === thisMonth && (
                <SheetButton
                  className="row"
                  title={t("Nästa lön", "Next payday")}
                  label={
                    <>
                      <span className="grow">
                        <span className="title" style={{ display: "block" }}>{t("Nästa lön", "Next payday")}</span>
                        <span className="sub" style={{ display: "block" }}>{payday ? (payday.computed ? t("Beräknat från lönedagen", "Calculated from your payday") : t("Datum du själv angett", "A date you entered")) : t("Okänt", "Unknown")}</span>
                      </span>
                      <span className="amt num tap">{payday ? formatDateShort(payday.date, locale) : t("Ange", "Set")}</span>
                    </>
                  }
                >
                  <p className="muted" style={{ marginBottom: 14 }}>{t("”Kvar till lön” räknas fram till det här datumet.", "”Left until payday” is calculated up to this date.")}</p>
                  <ActionForm action={setPaydayAction} submit={save}>
                    <label className="field">
                      <span>{t("Datum", "Date")}</span>
                      <input type="date" name="payday" defaultValue={payday?.date} min={today} required />
                    </label>
                  </ActionForm>
                </SheetButton>
              )}
            </div>
            {unplanned != null && (
              <p className="sub muted" style={{ marginTop: 10, fontSize: 12.5 }}>
                {t(
                  `Räkningar ${formatKr(totalBills)} + budget ${formatKr(totalBudget)} + sparande ${formatKr(totalSaving)} · ${unplanned >= 0 ? `${formatKr(unplanned)} av lönen är inte inplanerat` : `${formatKr(-unplanned)} mer än lönen är inplanerat`}`,
                  `Bills ${formatKr(totalBills)} + budget ${formatKr(totalBudget)} + saving ${formatKr(totalSaving)} · ${unplanned >= 0 ? `${formatKr(unplanned)} of your salary is unplanned` : `${formatKr(-unplanned)} more than your salary is planned`}`,
                )}
              </p>
            )}
          </section>

          {/* ───── Räkningar ───── */}
          <section className="card">
            <div className="card-head">
              <h2>{t("Räkningar", "Bills")}</h2>
              <SheetButton className="linkish" title={t("Ny räkning", "New bill")} label={add} testId="add-bill">
                <ActionForm action={addBillAction} submit={add}>
                  <Hidden v={{ month }} />
                  <div className="seg">
                    <label>
                      <input type="radio" name="direction" value="out" defaultChecked />
                      {t("Räkning", "Bill")}
                    </label>
                    <label>
                      <input type="radio" name="direction" value="in" />
                      {t("Bekräftad insättning", "Confirmed deposit")}
                    </label>
                  </div>
                  <label className="field">
                    <span>{t("Namn", "Name")}</span>
                    <input name="name" placeholder={t("t.ex. Elräkningen", "e.g. Electricity bill")} required maxLength={60} />
                  </label>
                  <div className="field-row">
                    <label className="field kr">
                      <span>{t("Belopp", "Amount")}</span>
                      <input name="amount" inputMode="decimal" required />
                    </label>
                    <label className="field">
                      <span>{t("Dag i månaden", "Day of the month")}</span>
                      <input name="day" inputMode="numeric" placeholder="28" required />
                    </label>
                  </div>
                  <ScopeField {...scopeProps} />
                  <p className="faint" style={{ fontSize: 12.5, margin: "-4px 0 14px" }}>{t("Lägg bara in insättningar du vet kommer, till exempel ett beslutat bidrag.", "Only add deposits you know are coming, such as an approved benefit.")}</p>
                </ActionForm>
              </SheetButton>
            </div>
            {plan.bills.length === 0 ? (
              <p className="empty">{t(`Inga räkningar i ${mName}.`, `No bills in ${mName}.`)}</p>
            ) : (
              <div className="rows">
                {plan.bills.map((b) => (
                  <div className="row" key={b.id}>
                    <ActionForm action={toggleBillPaidAction} submitClass="ico-dot" submit={b.paid ? <CheckIcon size={18} /> : <span className="sr">{t("Markera som betald", "Mark as paid")}</span>} keepOpen>
                      <Hidden v={{ billId: b.id, month, paid: b.paid ? "0" : "1" }} />
                    </ActionForm>
                    <SheetButton
                      className="grow"
                      title={b.name}
                      label={
                        <span style={{ display: "flex", gap: 12, alignItems: "center", textAlign: "left" }}>
                          <span className="grow">
                            <span className="title" style={{ display: "block" }}>{b.name}</span>
                            <span className="sub" style={{ display: "block" }}>
                              {b.direction === "in" ? t("Insättning", "Deposit") : t("Förfaller", "Due")} {formatDateShort(b.dueDate, locale)}
                              {b.paid ? ` · ${b.direction === "in" ? t("mottagen", "received") : t("betald", "paid")}` : b.dueDate < today ? t(" · inte markerad som betald", " · not marked as paid") : ""}
                              {b.scope === "month" ? t(` · bara ${mName}`, ` · only ${mName}`) : ""}
                            </span>
                          </span>
                          <span className="amt num tap">{formatKr(b.direction === "in" ? b.amountOre : -b.amountOre, { sign: b.direction === "in" })}</span>
                        </span>
                      }
                    >
                      <ActionForm action={setPlanValueAction} submit={save}>
                        <Hidden v={{ kind: "bill", refId: b.id, month }} />
                        <div className="field-row">
                          <label className="field kr">
                            <span>{t("Belopp", "Amount")}</span>
                            <input name="amount" inputMode="decimal" defaultValue={oreToInput(b.amountOre)} required />
                          </label>
                          <label className="field">
                            <span>{t("Dag i månaden", "Day of the month")}</span>
                            <input name="day" inputMode="numeric" defaultValue={b.day} required />
                          </label>
                        </div>
                        <ScopeField {...scopeProps} current={b.scope} />
                      </ActionForm>
                      <ActionForm
                        action={setPlanValueAction}
                        submit={past ? t(`Ta bort i ${mName}`, `Remove in ${mName}`) : t(`Ta bort från och med ${mName}`, `Remove from ${mName} onwards`)}
                        submitClass="btn quiet"
                        confirm={t(
                          `Ta bort ${b.name}${past ? ` i ${mName}` : ` från och med ${mName}`}? Tidigare månader ändras inte.`,
                          `Remove ${b.name}${past ? ` in ${mName}` : ` from ${mName} onwards`}? Earlier months are not changed.`,
                        )}
                      >
                        <Hidden v={{ kind: "bill", refId: b.id, month, removed: "1", scope: past ? "month" : "template", day: String(b.day) }} />
                      </ActionForm>
                    </SheetButton>
                  </div>
                ))}
              </div>
            )}
            <p className="faint" style={{ fontSize: 12.5, marginTop: 10 }}>{t("Tryck på ringen för att markera en räkning som betald.", "Tap the circle to mark a bill as paid.")}</p>
          </section>

          {/* ───── Budget ───── */}
          <section className="card">
            <div className="card-head">
              <h2>Budget</h2>
              <SheetButton className="linkish" title={t("Ny kategori", "New category")} label={add} testId="add-category">
                <ActionForm action={addCategoryAction} submit={add}>
                  <Hidden v={{ month }} />
                  <label className="field">
                    <span>{t("Namn", "Name")}</span>
                    <input name="name" placeholder={t("t.ex. Husdjur", "e.g. Pets")} required maxLength={30} />
                  </label>
                  <label className="field kr">
                    <span>{t("Budget per månad", "Budget per month")}</span>
                    <input name="amount" inputMode="decimal" required />
                  </label>
                  <label className="field">
                    <span>{t("Symbol", "Icon")}</span>
                    <select name="icon" defaultValue="dot">
                      {CATEGORY_ICONS.map((i) => (
                        <option key={i} value={i}>
                          {ICON_NAMES[i] ?? i}
                        </option>
                      ))}
                    </select>
                  </label>
                  <ScopeField {...scopeProps} />
                </ActionForm>
              </SheetButton>
            </div>
            {cats.length === 0 ? (
              <p className="empty">{t("Inga kategorier än.", "No categories yet.")}</p>
            ) : (
              <div className="rows">
                {cats.map((c) => {
                  const f = categoryFigures(c);
                  const scope = plan.categories.find((x) => x.id === c.id)?.scope ?? null;
                  return (
                    <SheetButton
                      key={c.id}
                      className="row"
                      title={t(`${c.name} i ${mName}`, `${c.name} in ${mName}`)}
                      testId={`budget-${c.name}`}
                      label={
                        <>
                          <span className="ico-dot">
                            <CategoryIcon icon={c.icon} />
                          </span>
                          <span className="grow">
                            <span className="title" style={{ display: "block" }}>{c.name}</span>
                            <span className="sub" style={{ display: "block" }}>
                              {c.budgetOre == null
                                ? t("Ingen budget", "No budget")
                                : t(`${formatKr(f.spentOre)} använt${f.reservedOre ? ` · ${formatKr(f.reservedOre)} reserverat` : ""}`, `${formatKr(f.spentOre)} spent${f.reservedOre ? ` · ${formatKr(f.reservedOre)} reserved` : ""}`)}
                              {scope === "month" ? t(` · ändrad bara i ${mName}`, ` · changed only in ${mName}`) : ""}
                            </span>
                          </span>
                          <span className="amt num tap">{c.budgetOre == null ? t("Ange", "Set") : formatKr(c.budgetOre)}</span>
                        </>
                      }
                    >
                      <ActionForm action={setPlanValueAction} submit={save}>
                        <Hidden v={{ kind: "category", refId: c.id, month }} />
                        <label className="field kr">
                          <span>Budget</span>
                          <input name="amount" inputMode="decimal" defaultValue={oreToInput(c.budgetOre)} required data-testid="budget-amount" />
                        </label>
                        <ScopeField {...scopeProps} current={scope} />
                      </ActionForm>
                      {scope === "month" && !past && (
                        <ActionForm action={setPlanValueAction} submit={t(`Återgå till den vanliga budgeten i ${mName}`, `Go back to the usual budget in ${mName}`)} submitClass="btn quiet">
                          <Hidden v={{ kind: "category", refId: c.id, month, reset: "1", amount: "0", scope: "month" }} />
                        </ActionForm>
                      )}
                      <ActionForm action={archiveCategoryAction} submit={t("Dölj kategorin", "Hide the category")} submitClass="btn quiet" confirm={t(`Dölja ${c.name}? Tidigare köp finns kvar.`, `Hide ${c.name}? Earlier purchases are kept.`)}>
                        <Hidden v={{ id: c.id }} />
                      </ActionForm>
                    </SheetButton>
                  );
                })}
              </div>
            )}
          </section>

          {/* ───── Planerade köp ───── */}
          <section className="card">
            <div className="card-head">
              <h2>{t("Planerade köp", "Planned purchases")}</h2>
              {cats.length > 0 && !past && (
                <SheetButton className="linkish" title={t("Planera ett köp", "Plan a purchase")} label={add} testId="add-planned">
                  <p className="muted" style={{ marginBottom: 14 }}>
                    {t(`Beloppet reserveras i kategorins budget för ${mName}, så att det inte går åt till annat.`, `The amount is reserved in the category's budget for ${mName}, so it isn't spent on something else.`)}
                  </p>
                  <ActionForm action={addPlannedAction} submit={t("Reservera", "Reserve")}>
                    <Hidden v={{ month }} />
                    <label className="field">
                      <span>{t("Vad ska du köpa?", "What are you buying?")}</span>
                      <input name="name" placeholder={t("t.ex. Vinterkängor", "e.g. Winter boots")} required maxLength={60} />
                    </label>
                    <div className="field-row">
                      <label className="field kr">
                        <span>{t("Högst", "At most")}</span>
                        <input name="max" inputMode="decimal" required />
                      </label>
                      <label className="field">
                        <span>{t("Kategori", "Category")}</span>
                        <select name="categoryId" required>
                          {cats.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </ActionForm>
                </SheetButton>
              )}
            </div>
            {plan.planned.length === 0 ? (
              <p className="empty">{t(`Inget planerat i ${mName}. Ett planerat köp reserverar en del av kategorins budget.`, `Nothing planned in ${mName}. A planned purchase reserves part of the category's budget.`)}</p>
            ) : (
              <div className="rows">
                {plan.planned.map((p) => {
                  const cat = cats.find((c) => c.id === p.categoryId);
                  if (p.status === "bought")
                    return (
                      <div className="row" key={p.id}>
                        <div className="grow">
                          <div className="title">{p.name}</div>
                          <div className="sub">
                            {cat?.name} · {t("köpt, reservationen är använd", "bought, the reservation is used")}
                          </div>
                        </div>
                        <span className="badge good">{t("Köpt", "Bought")}</span>
                      </div>
                    );
                  return (
                    <SheetButton
                      key={p.id}
                      className="row"
                      title={p.name}
                      label={
                        <>
                          <span className="grow">
                            <span className="title" style={{ display: "block" }}>{p.name}</span>
                            <span className="sub" style={{ display: "block" }}>
                              {cat?.name} · {t(`reserverat i ${mName}`, `reserved in ${mName}`)}
                            </span>
                          </span>
                          <span className="amt num tap">
                            {formatKr(p.maxOre)}
                            <small>{t("högst", "at most")}</small>
                          </span>
                        </>
                      }
                    >
                      <ActionForm action={updatePlannedAction} submit={save}>
                        <Hidden v={{ id: p.id }} />
                        <label className="field">
                          <span>{t("Vad", "What")}</span>
                          <input name="name" defaultValue={p.name} required maxLength={60} />
                        </label>
                        <label className="field kr">
                          <span>{t("Högst", "At most")}</span>
                          <input name="max" inputMode="decimal" defaultValue={oreToInput(p.maxOre)} required />
                        </label>
                      </ActionForm>
                      <ActionForm action={updatePlannedAction} submit={t("Ta bort planen", "Remove the plan")} submitClass="btn quiet" confirm={t("Ta bort det planerade köpet? Reservationen släpps.", "Remove the planned purchase? The reservation is released.")}>
                        <Hidden v={{ id: p.id, cancel: "1" }} />
                      </ActionForm>
                    </SheetButton>
                  );
                })}
              </div>
            )}
          </section>

          {/* ───── Sparmål ───── */}
          <section className="card" id="sparmal">
            <div className="card-head">
              <h2>{t("Sparmål", "Savings goals")}</h2>
              <SheetButton className="linkish" title={t("Nytt sparmål", "New savings goal")} label={add} testId="add-goal">
                <ActionForm action={addGoalAction} submit={add}>
                  <Hidden v={{ month }} />
                  <label className="field">
                    <span>{t("Vad sparar du till?", "What are you saving for?")}</span>
                    <input name="name" placeholder={t("t.ex. Resa", "e.g. A trip")} required maxLength={60} />
                  </label>
                  <div className="field-row">
                    <label className="field kr">
                      <span>{t("Mål", "Target")}</span>
                      <input name="target" inputMode="decimal" required />
                    </label>
                    <label className="field kr">
                      <span>{t("Redan sparat", "Already saved")}</span>
                      <input name="saved" inputMode="decimal" />
                    </label>
                  </div>
                  <label className="field kr">
                    <span>{t("Planerat per månad", "Planned per month")}</span>
                    <input name="monthly" inputMode="decimal" />
                  </label>
                </ActionForm>
              </SheetButton>
            </div>
            {goals.length === 0 ? (
              <p className="empty">{t("Inget sparmål än.", "No savings goal yet.")}</p>
            ) : (
              <div className="rows">
                {goals.map((g) => {
                  const scope = plan.savings.find((s) => s.goalId === g.id)?.scope ?? null;
                  return (
                    <div className="row" key={g.id} style={{ display: "block" }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                        <SheetButton className="grow title tap" title={g.name} label={g.name}>
                          <ActionForm action={updateGoalAction} submit={save}>
                            <Hidden v={{ id: g.id }} />
                            <label className="field">
                              <span>{t("Namn", "Name")}</span>
                              <input name="name" defaultValue={g.name} required maxLength={60} />
                            </label>
                            <label className="field kr">
                              <span>{t("Mål", "Target")}</span>
                              <input name="target" inputMode="decimal" defaultValue={oreToInput(g.targetOre)} required />
                            </label>
                          </ActionForm>
                          <ActionForm action={updateGoalAction} submit={t("Avsluta sparmålet", "End the savings goal")} submitClass="btn quiet" confirm={t(`Avsluta ${g.name}? Det planerade sparandet tas bort ur planen.`, `End ${g.name}? The planned saving is removed from the plan.`)}>
                            <Hidden v={{ id: g.id, archive: "1" }} />
                          </ActionForm>
                        </SheetButton>
                        <span className="amt num">
                          {formatKr(g.savedOre)} <span className="muted" style={{ fontWeight: 400 }}>{t("av", "of")} {formatKr(g.targetOre)}</span>
                        </span>
                      </div>
                      <div className="bar">
                        <i className="sun" style={{ width: `${g.targetOre > 0 ? Math.min(100, (g.savedOre / g.targetOre) * 100) : 0}%` }} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                        <SheetButton
                          className="note"
                          title={t(`Planerat sparande: ${g.name}`, `Planned saving: ${g.name}`)}
                          label={
                            <span style={{ textAlign: "left" }}>
                              <span className="caps faint" style={{ fontSize: 10 }}>{t(`Planerat i ${mName}`, `Planned in ${mName}`)}</span>
                              <br />
                              <b className="num tap" style={{ color: "var(--text)" }}>{formatKr(g.plannedThisMonthOre)}</b>
                            </span>
                          }
                        >
                          <p className="muted" style={{ marginBottom: 14 }}>{t("Det här är din plan. Ryms håller plats för beloppet före lön, men flyttar inga pengar.", "This is your plan. Ryms keeps room for the amount before payday, but moves no money.")}</p>
                          <ActionForm action={setPlanValueAction} submit={save}>
                            <Hidden v={{ kind: "saving", refId: g.id, month }} />
                            <label className="field kr">
                              <span>{t("Planerat sparande", "Planned saving")}</span>
                              <input name="amount" inputMode="decimal" defaultValue={oreToInput(g.plannedThisMonthOre)} required />
                            </label>
                            <ScopeField {...scopeProps} current={scope} />
                          </ActionForm>
                        </SheetButton>
                        <SheetButton
                          className="note"
                          title={t(`Insatt: ${g.name}`, `Deposited: ${g.name}`)}
                          label={
                            <span style={{ textAlign: "left" }}>
                              <span className="caps faint" style={{ fontSize: 10 }}>{t(`Insatt i ${mName}`, `Deposited in ${mName}`)}</span>
                              <br />
                              <b className="num tap" style={{ color: "var(--text)" }}>{formatKr(g.savedThisMonthOre)}</b>
                            </span>
                          }
                        >
                          <p className="muted" style={{ marginBottom: 14 }}>
                            {t(
                              "Insatt är pengar som faktiskt har flyttats till sparandet – från banken eller registrerat av dig. Att avstå från ett köp räknas inte som sparande.",
                              "Deposited means money that has actually been moved to savings – from the bank or recorded by you. Skipping a purchase does not count as saving.",
                            )}
                          </p>
                          {month === thisMonth && (
                            <ActionForm action={addSavingDepositAction} submit={t("Registrera insättning", "Record deposit")}>
                              <Hidden v={{ goalId: g.id }} />
                              <label className="field kr">
                                <span>{t("Jag har satt in", "I have deposited")}</span>
                                <input name="amount" inputMode="decimal" required />
                              </label>
                            </ActionForm>
                          )}
                        </SheetButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
