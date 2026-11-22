import { addTxAction, resolveMatchAction, updateTxAction } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { DemoStrip, Top } from "@/components/Frame";
import { SheetButton } from "@/components/Sheet";
import { formatDate, formatDateShort, monthOf, todayISO, weekdayName } from "@/lib/dates";
import { getDb } from "@/lib/db";
import type { T } from "@/lib/i18n";
import { getT } from "@/lib/locale";
import { formatKr } from "@/lib/money";
import { getMonthPlan } from "@/lib/services/plan";
import { listTransactions, pendingMatches, type TxListItem } from "@/lib/services/transactions";
import { requireUser } from "@/lib/session";

function label(tx: TxListItem, t: T): string {
  if (tx.match_hold) return t("Väntar på din bekräftelse", "Waiting for your confirmation");
  if (tx.bill_name) return t(`Räkning: ${tx.bill_name}`, `Bill: ${tx.bill_name}`);
  switch (tx.kind) {
    case "expense":
      return tx.category_name ?? t("Saknar kategori", "No category");
    case "refund":
      return `${t("Återbetalning", "Refund")}${tx.category_name ? ` · ${tx.category_name}` : ""}`;
    case "income":
      return t("Inkomst", "Income");
    case "transfer":
      return t("Överföring mellan egna konton", "Transfer between your own accounts");
    case "saving":
      return `${t("Sparande", "Saving")}${tx.goal_name ? ` · ${tx.goal_name}` : t(" · inget mål valt", " · no goal chosen")}`;
  }
}

export default async function TransactionsPage() {
  const user = await requireUser();
  const { t, locale } = await getT();
  const today = todayISO();
  const txs = listTransactions(user, { limit: 150 });
  const matches = pendingMatches(user.id);
  const categories = getMonthPlan(user.id, monthOf(today)).categories;
  const goals = getDb().prepare("SELECT id, name FROM goals WHERE user_id = ? AND archived = 0").all(user.id) as { id: string; name: string }[];
  const groups = new Map<string, TxListItem[]>();
  for (const tx of txs) groups.set(tx.date, [...(groups.get(tx.date) ?? []), tx]);
  const fallback = t("Transaktion", "Transaction");

  return (
    <div className="shell">
      <DemoStrip user={user} />
      <Top user={user} />
      <main className="page">
        <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
          <div>
            <h1>{t("Transaktioner", "Transactions")}</h1>
            <p>{t("Köp från banken och sådant du registrerat själv.", "Purchases from the bank and things you have recorded yourself.")}</p>
          </div>
          <SheetButton className="btn small" title={t("Lägg till själv", "Add manually")} label={t("Lägg till", "Add")} testId="add-tx">
            <ActionForm action={addTxAction} submit={t("Lägg till", "Add")}>
              <div className="seg">
                <label>
                  <input type="radio" name="kind" value="expense" defaultChecked />
                  {t("Köp", "Purchase")}
                </label>
                <label>
                  <input type="radio" name="kind" value="income" />
                  {t("Inkomst", "Income")}
                </label>
                <label>
                  <input type="radio" name="kind" value="refund" />
                  {t("Återbet.", "Refund")}
                </label>
              </div>
              <label className="field">
                <span>{t("Vad", "What")}</span>
                <input name="description" maxLength={80} placeholder={t("t.ex. Lunch", "e.g. Lunch")} />
              </label>
              <div className="field-row">
                <label className="field kr">
                  <span>{t("Belopp", "Amount")}</span>
                  <input name="amount" inputMode="decimal" required />
                </label>
                <label className="field">
                  <span>{t("Datum", "Date")}</span>
                  <input name="date" type="date" defaultValue={today} max={today} required />
                </label>
              </div>
              <label className="field">
                <span>{t("Kategori (för köp och återbetalningar)", "Category (for purchases and refunds)")}</span>
                <select name="categoryId">
                  <option value="">{t("Ingen kategori", "No category")}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </ActionForm>
          </SheetButton>
        </div>

        <div className="stack">
          {matches.map((m) => (
            <section className="card glow" key={m.bank.id} data-testid="match-card">
              <span className="caps lilac">{t("Är det här samma köp?", "Is this the same purchase?")}</span>
              <p style={{ margin: "10px 0 4px" }}>
                {t("Banken visar", "The bank shows")} <b className="num">{formatKr(-m.bank.amount_ore)}</b> {t("den", "on")} {formatDate(m.bank.date, locale)} ({m.bank.description || t("utan text", "no text")}).
              </p>
              <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
                {t(
                  `Du har registrerat ${m.candidates.length === 1 ? "ett köp" : `${m.candidates.length} köp`} på samma belopp. Ryms gissar inte – välj själv, så räknas det en gång.`,
                  `You have recorded ${m.candidates.length === 1 ? "one purchase" : `${m.candidates.length} purchases`} for the same amount. Ryms doesn't guess – you choose, and it is counted once.`,
                )}
              </p>
              <div className="btn-row">
                {m.candidates.map((c) => (
                  <ActionForm
                    key={c.id}
                    action={resolveMatchAction}
                    submit={t(`Ja, det är ”${c.item_name ?? c.description}” (${formatDateShort(c.date)})`, `Yes, it is ”${c.item_name ?? c.description}” (${formatDateShort(c.date, "en")})`)}
                    submitClass="btn ghost"
                    keepOpen
                  >
                    <input type="hidden" name="bankTxId" value={m.bank.id} />
                    <input type="hidden" name="manualTxId" value={c.id} />
                  </ActionForm>
                ))}
                <ActionForm action={resolveMatchAction} submit={t("Nej, det är ett annat köp", "No, it is a different purchase")} submitClass="btn quiet" keepOpen>
                  <input type="hidden" name="bankTxId" value={m.bank.id} />
                </ActionForm>
              </div>
            </section>
          ))}

          {txs.length === 0 ? (
            <section className="card">
              <p className="empty">{t("Inga transaktioner än. Köp du registrerar via ”Ryms det?” hamnar här.", "No transactions yet. Purchases you record through ”Ryms det?” end up here.")}</p>
            </section>
          ) : (
            <section className="card" style={{ paddingTop: 6 }}>
              {[...groups.entries()].map(([date, list]) => (
                <div key={date}>
                  <div className="date-head">{date === today ? t("Idag", "Today") : `${weekdayName(date, locale)} ${formatDate(date, locale)}`}</div>
                  <div className="rows">
                    {list.map((tx) => (
                      <SheetButton
                        key={tx.id}
                        className="row"
                        title={tx.item_name ?? (tx.description || fallback)}
                        label={
                          <>
                            <span className="grow">
                              <span className="title" style={{ display: "block" }}>{tx.item_name ?? (tx.description || fallback)}</span>
                              <span className="sub" style={{ display: "block" }}>
                                {label(tx, t)}
                                {tx.status === "pending" ? t(" · väntande", " · pending") : ""}
                                {tx.source === "manual" ? t(" · registrerat av dig", " · recorded by you") : tx.reconciled ? t(" · bekräftat av banken", " · confirmed by the bank") : ""}
                              </span>
                            </span>
                            <span className="amt num" style={tx.amount_ore > 0 ? { color: "var(--good)" } : undefined}>
                              {formatKr(tx.amount_ore, { sign: true })}
                            </span>
                          </>
                        }
                      >
                        <p className="muted" style={{ marginBottom: 14, fontSize: 13.5 }}>
                          {formatKr(tx.amount_ore, { sign: true })} · {formatDate(tx.date, locale)}
                          {tx.account_name ? ` · ${tx.account_name}` : ""}
                          {tx.item_name && tx.description && tx.description !== tx.item_name ? t(` · banktext: ${tx.description}`, ` · bank text: ${tx.description}`) : ""}
                        </p>
                        <ActionForm action={updateTxAction} submit={t("Spara", "Save")}>
                          <input type="hidden" name="id" value={tx.id} />
                          <label className="field">
                            <span>{t("Vad är det här?", "What is this?")}</span>
                            <select name="kind" defaultValue={tx.kind}>
                              {tx.amount_ore < 0 ? (
                                <>
                                  <option value="expense">{t("Köp", "Purchase")}</option>
                                  <option value="saving">{t("Insättning till sparande", "Deposit to savings")}</option>
                                  <option value="transfer">{t("Överföring mellan egna konton", "Transfer between your own accounts")}</option>
                                </>
                              ) : (
                                <>
                                  <option value="income">{t("Inkomst", "Income")}</option>
                                  <option value="refund">{t("Återbetalning av ett köp", "Refund of a purchase")}</option>
                                  <option value="transfer">{t("Överföring mellan egna konton", "Transfer between your own accounts")}</option>
                                  <option value="saving">{t("Uttag från sparande", "Withdrawal from savings")}</option>
                                </>
                              )}
                            </select>
                          </label>
                          <label className="field">
                            <span>{t("Kategori (köp och återbetalningar)", "Category (purchases and refunds)")}</span>
                            <select name="categoryId" defaultValue={tx.category_id ?? ""}>
                              <option value="">{t("Ingen kategori", "No category")}</option>
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          {goals.length > 0 && (
                            <label className="field">
                              <span>{t("Sparmål (sparande)", "Savings goal (saving)")}</span>
                              <select name="goalId" defaultValue={tx.goal_id ?? ""}>
                                <option value="">{t("Inget mål", "No goal")}</option>
                                {goals.map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {g.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </ActionForm>
                        {tx.source === "manual" && (
                          <ActionForm action={updateTxAction} submit={t("Ta bort", "Remove")} submitClass="btn quiet" confirm={t("Ta bort transaktionen? Budgeten räknas om.", "Remove the transaction? The budget is recalculated.")}>
                            <input type="hidden" name="id" value={tx.id} />
                            <input type="hidden" name="delete" value="1" />
                          </ActionForm>
                        )}
                      </SheetButton>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
