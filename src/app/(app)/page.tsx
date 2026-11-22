import Link from "next/link";
import { setBalanceAction } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { CalcButton } from "@/components/Calc";
import { CategoryAsk } from "@/components/CategoryAsk";
import { DemoStrip, Top } from "@/components/Frame";
import { AskIcon, CategoryIcon, InfoIcon, NextIcon, WalletIcon } from "@/components/icons";
import { Landscape, type Tone } from "@/components/Landscape";
import { SheetButton } from "@/components/Sheet";
import { formatDateShort, formatTimestamp, formatWhen, monthName, todayISO } from "@/lib/dates";
import type { Locale, T } from "@/lib/i18n";
import { getT } from "@/lib/locale";
import { currencySymbol, formatKr, oreToInput } from "@/lib/money";
import { buildOverview, type Overview } from "@/lib/services/overview";
import { uncategorizedTx } from "@/lib/services/transactions";
import { currentUser } from "@/lib/session";
import { Landing } from "@/components/Landing";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function mood(o: Overview, t: T, locale: Locale): { tone: Tone; headline: string; text: string } {
  const days = o.daysToPayday;
  const when = o.payday ? formatWhen(o.payday, o.today, locale) : "";
  const payday = o.payday
    ? t(`Lön ${when}${days && days > 1 ? ` – om ${days} dagar` : ""}.`, `Payday ${when}${days && days > 1 ? ` – in ${days} days` : ""}.`)
    : t("Fram till månadens slut.", "Until the end of the month.");
  if (!o.left.known)
    return { tone: "mist", headline: t("Vad finns på kontot?", "What's in your account?"), text: t("Ange ditt saldo eller anslut en bank, så räknar Ryms ut vad du har kvar till lön.", "Enter your balance or connect a bank, and Ryms works out what you have left until payday.") };
  const set: string[] = [];
  if (o.left.billsOre > 0) set.push(t(`räkningar på ${formatKr(o.left.billsOre)}`, `bills of ${formatKr(o.left.billsOre)}`));
  if (o.left.savingOre > 0) set.push(t(`planerat sparande på ${formatKr(o.left.savingOre)}`, `planned saving of ${formatKr(o.left.savingOre)}`));
  const joined = set.join(t(" och ", " and "));
  const aside = set.length ? " " + t(`${cap(joined)} är redan undantagna.`, `${cap(joined)} ${set.length > 1 ? "are" : "is"} already set aside.`) : "";
  if (o.left.amountOre < 0)
    return {
      tone: "ember",
      headline: t("Det går inte ihop ännu", "It doesn't add up yet"),
      text: t(`${payday} Det fattas ${formatKr(-o.left.amountOre)} för att täcka ${joined || "det som väntar"}.`, `${payday} You are ${formatKr(-o.left.amountOre)} short of covering ${joined || "what's coming"}.`),
    };
  const perDay = days && days > 0 ? Math.floor(o.left.amountOre / days) : o.left.amountOre;
  if (perDay < 100_00) return { tone: "dusk", headline: t("Tajt fram till lön", "Tight until payday"), text: `${payday}${aside}` };
  return { tone: "meadow", headline: t("Det finns utrymme", "There's room"), text: `${payday}${aside}` };
}

function bankLine(o: Overview, t: T, locale: Locale): { badge: string; text: string } {
  const b = o.bank;
  const when = b.lastSyncAt ? formatTimestamp(b.lastSyncAt, o.today, locale) : null;
  const synced = when ? t(`hämtat ${when}`, `synced ${when}`) : t("ingen hämtning än", "not synced yet");
  if (b.mode === "demo") return { badge: t("Demobank", "Demo bank"), text: `${t("Påhittade uppgifter", "Fictional data")} · ${synced}` };
  if (b.mode === "manual") return { badge: t("Eget saldo", "Own balance"), text: t(`Angavs ${when}`, `Entered ${when}`) };
  if (b.mode === "none") return { badge: t("Ingen bank", "No bank"), text: t("Du kan använda Ryms utan bank", "You can use Ryms without a bank") };
  const last = `${b.bankName} · ${t("senast hämtat", "last synced")} ${when ?? t("aldrig", "never")}`;
  if (b.status === "expired") return { badge: t("Samtycket har gått ut", "Consent has expired"), text: last };
  if (b.status === "disconnected") return { badge: t("Frånkopplad", "Disconnected"), text: last };
  if (b.lastSyncError) return { badge: t("Fördröjd data", "Delayed data"), text: last };
  return { badge: b.mode === "sandbox" ? t("Sandbox – testdata", "Sandbox – test data") : t("Bank ansluten", "Bank connected"), text: `${b.bankName} · ${synced}` };
}

export default async function Home() {
  // Utloggade besökare ser landningssidan; inloggade ser sin översikt.
  const user = await currentUser();
  if (!user) return <Landing />;
  const { t, locale } = await getT();
  const o = buildOverview(user, todayISO(), locale);
  const m = mood(o, t, locale);
  const bl = bankLine(o, t, locale);
  const budgeted = o.categories.filter((c) => c.budgetOre != null);
  const mName = monthName(o.month, locale);
  const totalBudget = budgeted.reduce((s, c) => s + c.figures.budgetOre, 0);
  const totalSpent = budgeted.reduce((s, c) => s + Math.max(0, c.figures.spentOre), 0);
  const used = totalBudget > 0 ? Math.min(1, totalSpent / totalBudget) : 0;
  const unknown = uncategorizedTx(user);
  const calcTitle = (name: string) => t(`${name} i ${mName}`, `${name} in ${mName}`);

  return (
    <div className="shell home">
      <DemoStrip user={user} />
      <section className="hero">
        <Landscape tone={m.tone} />
        <Top user={user} />
        {budgeted.length > 0 && (
          <div className="chips" aria-label={t(`Kvar per kategori i ${mName}`, `Left per category in ${mName}`)}>
            {budgeted.map((c) => (
              <CalcButton
                key={c.id}
                className="chip"
                title={calcTitle(c.name)}
                rows={c.calc}
                ariaLabel={t(`${c.name}: ${formatKr(c.figures.freeOre)} kvar${c.figures.reservedOre ? " till annat" : ""}. Visa uträkning.`, `${c.name}: ${formatKr(c.figures.freeOre)} left${c.figures.reservedOre ? " for other things" : ""}. Show calculation.`)}
              >
                <span className={`chip-ring${c.figures.freeOre < 0 ? " neg" : ""}`}>
                  <CategoryIcon icon={c.icon} size={15} />
                  <strong className="num">{formatKr(Math.trunc(c.figures.freeOre / 100) * 100, { unit: false })}</strong>
                </span>
                <span>{c.name}</span>
              </CalcButton>
            ))}
          </div>
        )}

        {totalBudget > 0 && (
          <svg className="arc" viewBox="0 0 360 132" role="img" aria-label={t(`${formatKr(totalSpent)} av månadens budget på ${formatKr(totalBudget)} är använt`, `${formatKr(totalSpent)} of this month's ${formatKr(totalBudget)} budget is used`)}>
            <path d="M30 118 Q180 -26 330 118" fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="1.300" />
            <path d="M30 118 Q180 -26 330 118" fill="none" stroke="#f4f0e6" strokeWidth="4.500" strokeLinecap="round" pathLength={100} strokeDasharray={`${Math.max(0.5, used * 100)} 100`} />
            {[
              [84, 62],
              [146, 36],
              [214, 36],
              [276, 62],
            ].map(([x, y]) => (
              <circle key={x} cx={x} cy={y} r="1.600" fill="rgba(255,255,255,.85)" />
            ))}
            <text x="18" y="112" transform="rotate(-48 18 112)" textAnchor="middle">
              0
            </text>
            <text x="343" y="110" transform="rotate(48 343 110)" textAnchor="middle">
              {formatKr(Math.trunc(totalBudget / 100) * 100, { unit: false })}
            </text>
          </svg>
        )}

        <div className="hero-main">
          <span className="glyph">
            <WalletIcon size={15} />
          </span>
          <span className="caps">{t("Kvar till lön", "Left until payday")}</span>
          {o.left.known ? (
            <CalcButton className="figure num" title={t("Kvar till lön", "Left until payday")} rows={o.leftCalc} notes={o.cash.notes} testId="left-figure" ariaLabel={t(`Kvar till lön: ${formatKr(o.left.amountOre)}. Visa uträkning.`, `Left until payday: ${formatKr(o.left.amountOre)}. Show calculation.`)}>
              <span className="tap">{formatKr(o.left.amountOre, { unit: false })}</span>
              <small>{currencySymbol()}</small>
            </CalcButton>
          ) : (
            <span className="figure">–</span>
          )}
          {o.left.known && o.cash.estimate && (
            <span className="badge" style={{ marginTop: 6 }}>
              {t("Uppskattning", "Estimate")}
            </span>
          )}
          <h1>{m.headline}</h1>
          <p>{m.text}</p>
          <Link href="/ryms-det" className="cta" data-testid="cta">
            <AskIcon size={20} />
            Ryms det?
          </Link>
        </div>
      </section>

      <div className="stack">
        {unknown.length > 0 && budgeted.length > 0 && <CategoryAsk key={unknown[0].id} tx={unknown[0]} total={unknown.length} categories={budgeted.map((c) => ({ id: c.id, name: c.name, icon: c.icon }))} />}
        {(o.pendingMatches > 0 || (o.uncategorized > 0 && budgeted.length === 0)) && (
          <Link href="/transaktioner" className="note warn wide">
            <InfoIcon size={18} />
            <span>
              {o.pendingMatches > 0 && (
                <>
                  {o.pendingMatches === 1
                    ? t("Ett köp från banken kan vara ett du redan registrerat.", "One purchase from the bank may be one you already recorded.")
                    : t(`${o.pendingMatches} köp från banken kan vara sådana du redan registrerat.`, `${o.pendingMatches} purchases from the bank may be ones you already recorded.`)}{" "}
                  {t("Bekräfta så att det inte räknas två gånger.", "Confirm so nothing is counted twice.")}{" "}
                </>
              )}
              {o.uncategorized > 0 && (
                <>
                  {o.uncategorized === 1 ? t("Ett köp saknar kategori", "One purchase has no category") : t(`${o.uncategorized} köp saknar kategori`, `${o.uncategorized} purchases have no category`)}{" "}
                  {t("och syns därför inte i någon budget.", "and so doesn't show in any budget.")}
                </>
              )}
            </span>
          </Link>
        )}

        <section className="card glow">
          <div className="lead-row">
            <span className="ico-dot">
              <WalletIcon size={18} />
            </span>
            <div>
              <div className="title">{t("På kontot", "In your account")}</div>
              <span className="caps" data-testid="bank-badge">
                {bl.badge}
              </span>
            </div>
            <Link href="/installningar" aria-label={t("Inställningar", "Settings")}>
              <NextIcon size={20} />
            </Link>
          </div>
          <div className="rows">
            <div className="row">
              <div className="grow">
                <div className="title">{t("Saldo just nu", "Balance right now")}</div>
                <div className="sub">{bl.text}</div>
              </div>
              {o.cash.known ? (
                <CalcButton className="amt num tap" title={t("På kontot", "In your account")} rows={o.balanceCalc} notes={o.cash.notes} ariaLabel={t("Visa hur saldot är uträknat", "Show how the balance is calculated")}>
                  {formatKr(o.cash.cashOre)}
                  {o.cash.estimate && <small>{t("uppskattning", "estimate")}</small>}
                </CalcButton>
              ) : (
                <span className="amt faint">{t("saknas", "missing")}</span>
              )}
            </div>
            {o.cash.known && (
              <div className="row">
                <div className="grow">
                  <div className="title">{t("Kvar till lön", "Left until payday")}</div>
                  <div className="sub">{t("efter räkningar och planerat sparande", "after bills and planned saving")}</div>
                </div>
                <CalcButton className="amt num tap" title={t("Kvar till lön", "Left until payday")} rows={o.leftCalc} notes={o.cash.notes}>
                  {formatKr(o.left.amountOre)}
                </CalcButton>
              </div>
            )}
          </div>
          {(o.bank.mode === "none" || o.bank.mode === "manual") && (
            <div className="btn-row two" style={{ marginTop: 12 }}>
              <SheetButton className="btn ghost small" title={t("Ditt saldo", "Your balance")} label={o.bank.mode === "manual" ? t("Uppdatera saldo", "Update balance") : t("Ange saldo", "Enter balance")}>
                <p className="muted" style={{ marginBottom: 14 }}>
                  {t("Skriv vad som finns på kontot du betalar med just nu. Ryms räknar sedan av de köp du registrerar.", "Enter what is in the account you pay from right now. Ryms then deducts the purchases you record.")}
                </p>
                <ActionForm action={setBalanceAction} submit={t("Spara saldo", "Save balance")}>
                  <label className="field kr">
                    <span>{t("Saldo", "Balance")}</span>
                    <input name="amount" inputMode="decimal" autoComplete="off" defaultValue={o.cash.known ? oreToInput(o.cash.cashOre) : ""} required />
                  </label>
                </ActionForm>
              </SheetButton>
              <Link href="/installningar/bank" className="btn ghost small">
                {t("Anslut bank", "Connect bank")}
              </Link>
            </div>
          )}
          {o.bank.status === "expired" && (
            <Link href="/installningar/bank" className="btn ghost small" style={{ marginTop: 12 }}>
              {t("Anslut banken igen", "Reconnect the bank")}
            </Link>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>{t("Före lön", "Before payday")}</h2>
            {o.payday && (
              <span className="muted num" style={{ fontSize: 13 }}>
                {t("lön", "payday")} {formatDateShort(o.payday, locale)}
              </span>
            )}
          </div>
          {o.cash.events.length === 0 && o.cash.savings.every((s) => s.remainingOre === 0) ? (
            <p className="empty">{t("Inga räkningar eller planerat sparande väntar före lön.", "No bills or planned saving are due before payday.")}</p>
          ) : (
            <div className="rows">
              {o.cash.events.map((e) => (
                <div className="row" key={e.id}>
                  <div className="grow">
                    <div className="title">{e.label}</div>
                    <div className="sub">
                      {e.type === "inflow" ? t("Bekräftad insättning", "Confirmed deposit") : e.overdue ? t("Förfallen – inte markerad som betald", "Overdue – not marked as paid") : t("Räkning", "Bill")} ·{" "}
                      {e.overdue ? t("nu", "now") : formatWhen(e.date, o.today, locale).replace(/^(på|den|on) /, "")}
                    </div>
                  </div>
                  <div className="amt num">{formatKr(e.type === "inflow" ? e.amountOre : -e.amountOre, { sign: true })}</div>
                </div>
              ))}
              {o.cash.savings
                .filter((s) => s.remainingOre > 0)
                .map((s) => (
                  <div className="row" key={s.goalId}>
                    <div className="grow">
                      <div className="title">{s.name}</div>
                      <div className="sub">{t("Planerat sparande – inte insatt än", "Planned saving – not deposited yet")}</div>
                    </div>
                    <div className="amt num">{formatKr(-s.remainingOre)}</div>
                  </div>
                ))}
            </div>
          )}
        </section>

        <section className="card wide">
          <div className="card-head">
            <h2>{t(`Budget i ${mName}`, `Budget in ${mName}`)}</h2>
            <Link href="/plan">{t("Ändra plan", "Edit plan")}</Link>
          </div>
          {budgeted.length === 0 ? (
            <p className="empty">{t("Du har inga budgetkategorier än. Lägg till dem under Plan.", "You have no budget categories yet. Add them under Plan.")}</p>
          ) : (
            <div className="rows">
              {budgeted.map((c) => {
                const f = c.figures;
                const pct = (n: number) => `${f.budgetOre > 0 ? Math.max(0, Math.min(100, (n / f.budgetOre) * 100)) : 0}%`;
                const names = c.reservations.map((r) => r.name).join(", ");
                return (
                  <CalcButton key={c.id} className="row" title={calcTitle(c.name)} rows={c.calc} testId={`cat-${c.name}`}>
                    <span className="ico-dot">
                      <CategoryIcon icon={c.icon} />
                    </span>
                    <span className="grow">
                      <span className="title" style={{ display: "block" }}>
                        {c.name}
                      </span>
                      <span className="sub" style={{ display: "block" }}>
                        {c.reservations.length > 0
                          ? t(`${formatKr(f.reservedOre)} reserverat för ${names}`, `${formatKr(f.reservedOre)} reserved for ${names}`)
                          : t(`${formatKr(f.spentOre)} av ${formatKr(f.budgetOre)} använt`, `${formatKr(f.spentOre)} of ${formatKr(f.budgetOre)} used`)}
                      </span>
                      <span className="bar">
                        <i className={f.remainingOre < 0 ? "over" : ""} style={{ width: pct(f.spentOre) }} />
                        <i className="res" style={{ width: pct(Math.min(f.reservedOre, Math.max(0, f.remainingOre))) }} />
                      </span>
                    </span>
                    <span className="amt num">
                      <span className="tap" style={f.freeOre < 0 ? { color: "var(--bad)" } : undefined}>
                        {formatKr(f.freeOre)}
                      </span>
                      <small>{c.reservations.length > 0 ? t("kvar till annat", "left for other things") : t("kvar", "left")}</small>
                    </span>
                  </CalcButton>
                );
              })}
            </div>
          )}
        </section>

        <section className="card wide">
          <div className="card-head">
            <h2>{t("Sparmål", "Savings goals")}</h2>
            <Link href="/plan#sparmal">{t("Visa", "View")}</Link>
          </div>
          {o.goals.length === 0 ? (
            <p className="empty">{t("Inget sparmål än. Lägg till ett under Plan, så håller Ryms plats för det före lön.", "No savings goal yet. Add one under Plan and Ryms will keep room for it before payday.")}</p>
          ) : (
            <div className="rows">
              {o.goals.map((g) => (
                <div className="row" key={g.id}>
                  <div className="grow">
                    <div className="title">{g.name}</div>
                    <div className="bar">
                      <i className="sun" style={{ width: `${g.targetOre > 0 ? Math.min(100, (g.savedOre / g.targetOre) * 100) : 0}%` }} />
                    </div>
                    <div className="sub" style={{ marginTop: 7 }}>
                      {t(`Plan i ${mName}: ${formatKr(g.plannedThisMonthOre)} · insatt: ${formatKr(g.savedThisMonthOre)}`, `Plan in ${mName}: ${formatKr(g.plannedThisMonthOre)} · deposited: ${formatKr(g.savedThisMonthOre)}`)}
                    </div>
                  </div>
                  <div className="amt num">
                    {formatKr(g.savedOre)}
                    <small>
                      {t("av", "of")} {formatKr(g.targetOre)}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
