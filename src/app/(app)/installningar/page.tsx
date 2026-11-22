import Link from "next/link";
import { deleteAccountAction, deleteBankDataAction, deleteImagesAction, demoSyncAction, disconnectAction, logoutAction, setBalanceAction, syncNowAction } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { ConsentToggle } from "@/components/ConsentToggle";
import { DemoStrip, Top } from "@/components/Frame";
import { InfoIcon } from "@/components/icons";
import { CurrencySwitch, LanguageSwitch } from "@/components/Locale";
import { SheetButton } from "@/components/Sheet";
import { formatDate, formatTimestamp, todayISO } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getT } from "@/lib/locale";
import { formatKr, oreToInput } from "@/lib/money";
import { aiConfigured } from "@/lib/services/analyze";
import { listAccounts, liveBankingAvailable } from "@/lib/services/bank";
import { countImages } from "@/lib/services/images";
import { bankStatus } from "@/lib/services/overview";
import { requireUser } from "@/lib/session";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ bank?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getT();
  const q = await searchParams;
  const today = todayISO();
  const b = bankStatus(user);
  const accounts = b.connectionId ? listAccounts(user.id, b.connectionId).filter((a) => a.selected) : [];
  const manual = getDb().prepare("SELECT balance_ore FROM accounts WHERE user_id = ? AND environment = 'manual'").get(user.id) as { balance_ore: number | null } | undefined;
  const images = countImages(user.id);
  const bankRows = (getDb().prepare("SELECT COUNT(*) AS n FROM transactions WHERE user_id = ? AND source = 'bank'").get(user.id) as { n: number }).n;
  const isBank = b.mode === "demo" || b.mode === "sandbox" || b.mode === "live";
  const connected = isBank && b.status === "active";
  const ts = (iso: string) => formatTimestamp(iso, today, locale);

  // "Bank ansluten" visas bara för en riktig, lyckad anslutning i skarp miljö.
  const badge =
    b.mode === "demo"
      ? { cls: "lilac", text: b.status === "active" ? t("Demobank", "Demo bank") : t("Demobank frånkopplad", "Demo bank disconnected") }
      : !isBank
        ? { cls: "", text: t("Ingen bank ansluten", "No bank connected") }
        : b.status === "expired"
          ? { cls: "warn", text: t("Samtycket har gått ut", "Consent has expired") }
          : b.status === "disconnected"
            ? { cls: "", text: t("Frånkopplad", "Disconnected") }
            : b.mode === "sandbox"
              ? { cls: "lilac", text: t("Sandbox ansluten – testdata", "Sandbox connected – test data") }
              : { cls: "good", text: t("Bank ansluten", "Bank connected") };

  return (
    <div className="shell">
      <DemoStrip user={user} />
      <Top user={user} />
      <main className="page">
        <div className="page-head">
          <h1>{t("Inställningar", "Settings")}</h1>
          <p>{t("Du bestämmer vad Ryms får läsa och vad som sparas.", "You decide what Ryms may read and what is saved.")}</p>
        </div>
        <div className="stack">
          {q.bank === "klar" && (
            <p className="note lilac" role="status">
              <InfoIcon size={16} />
              <span>{t("Kontona är valda och första hämtningen är gjord.", "The accounts are selected and the first sync is done.")}</span>
            </p>
          )}

          {/* ───── Bank ───── */}
          <section className="card glow" data-testid="bank-card">
            <div className="card-head">
              <h2>Bank</h2>
              <span className={`badge ${badge.cls}`} data-testid="bank-status">{badge.text}</span>
            </div>
            {isBank ? (
              <>
                <div className="rows">
                  <div className="row">
                    <div className="grow">
                      <div className="title">{b.mode === "demo" ? t("Demobanken", "Demo bank") : b.bankName}</div>
                      <div className="sub">
                        {b.mode === "demo"
                          ? t("Påhittade uppgifter – ingen riktig bank", "Made-up data – not a real bank")
                          : b.mode === "sandbox"
                            ? t("Banktjänstens testmiljö – inga riktiga pengar", "The bank service's test environment – no real money")
                            : t("Läsbehörighet via Enable Banking", "Read-only access via Enable Banking")}
                      </div>
                    </div>
                  </div>
                  <div className="row">
                    <div className="grow title">{t("Senaste lyckade hämtning", "Last successful sync")}</div>
                    <div className="amt" data-testid="last-sync">{b.lastSyncAt ? ts(b.lastSyncAt) : t("ingen än", "none yet")}</div>
                  </div>
                  {b.consentExpiresAt && b.status !== "disconnected" && (
                    <div className="row">
                      <div className="grow title">{t("Samtycket gäller till", "Consent valid until")}</div>
                      <div className="amt">{formatDate(b.consentExpiresAt.slice(0, 10), locale)}</div>
                    </div>
                  )}
                  {accounts.map((a) => (
                    <div className="row" key={a.id}>
                      <div className="grow">
                        <div className="title">{b.mode === "demo" ? (a.type === "savings" ? t("Sparkonto", "Savings account") : t("Lönekonto", "Current account")) : a.name}</div>
                        <div className="sub">
                          {a.number_masked} · {a.type === "savings" ? t("sparkonto", "savings account") : t("konto du betalar med", "account you pay from")}
                        </div>
                      </div>
                      <div className="amt num">{a.balance_ore != null ? formatKr(a.balance_ore) : "–"}</div>
                    </div>
                  ))}
                </div>
                {b.lastSyncError && b.status === "active" && (
                  <p className="note warn" style={{ marginTop: 12 }}>
                    <InfoIcon size={16} />
                    <span>{t("Den senaste hämtningen misslyckades, så uppgifterna kan vara försenade. Det du ser är från den senaste lyckade hämtningen.", "The latest sync failed, so the data may be delayed. What you see is from the last successful sync.")}</span>
                  </p>
                )}
                {b.status === "expired" && (
                  <p className="note warn" style={{ marginTop: 12 }}>
                    <InfoIcon size={16} />
                    <span>{t("Bankens samtycke har gått ut eller dragits tillbaka. Ryms hämtar inget nytt förrän du ansluter igen.", "The bank consent has expired or been withdrawn. Ryms fetches nothing new until you connect again.")}</span>
                  </p>
                )}
                {b.status === "disconnected" && (
                  <p className="note" style={{ marginTop: 12 }}>
                    <InfoIcon size={16} />
                    <span>{t("Banken är frånkopplad och inget mer hämtas. Det som redan importerats finns kvar tills du raderar det nedan.", "The bank is disconnected and nothing more is fetched. What was already imported stays until you delete it below.")}</span>
                  </p>
                )}
                <div className="btn-row" style={{ marginTop: 14 }}>
                  {connected && b.mode === "demo" && <ActionForm action={demoSyncAction} submit={t("Hämta från demobanken", "Sync from the demo bank")} submitClass="btn ghost" keepOpen />}
                  {connected && b.mode !== "demo" && (
                    <ActionForm action={syncNowAction} submit={t("Hämta nu", "Sync now")} submitClass="btn ghost" keepOpen>
                      <input type="hidden" name="connectionId" value={b.connectionId!} />
                    </ActionForm>
                  )}
                  {b.mode !== "demo" && (b.status === "expired" || b.status === "disconnected") && (
                    <Link href="/installningar/bank" className="btn">
                      {t("Anslut igen", "Connect again")}
                    </Link>
                  )}
                  {b.mode !== "demo" && connected && (
                    <Link href={`/installningar/bank?steg=konton&id=${b.connectionId}`} className="btn ghost">
                      {t("Ändra vilka konton som läses", "Change which accounts are read")}
                    </Link>
                  )}
                  {b.status !== "disconnected" && (
                    <ActionForm
                      action={disconnectAction}
                      submit={b.mode === "demo" ? t("Koppla från demobanken", "Disconnect the demo bank") : t("Koppla från banken", "Disconnect the bank")}
                      submitClass="btn quiet"
                      confirm={t("Koppla från? Ryms slutar hämta från banken. Det som redan importerats ligger kvar tills du raderar det.", "Disconnect? Ryms stops fetching from the bank. What was already imported stays until you delete it.")}
                      keepOpen
                    >
                      <input type="hidden" name="connectionId" value={b.connectionId!} />
                    </ActionForm>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="muted" style={{ marginBottom: 14 }}>
                  {user.is_demo
                    ? t("Demobanken är borttagen. Starta en ny demo för att börja om, eller ange ett eget saldo.", "The demo bank has been removed. Start a new demo to begin again, or enter your own balance.")
                    : liveBankingAvailable()
                      ? t("Anslut en bank för att hämta saldo och köp automatiskt – eller fortsätt med ett saldo du anger själv.", "Connect a bank to fetch balance and purchases automatically – or continue with a balance you enter yourself.")
                      : t("Bankkoppling är inte aktiverad i den här installationen. Du använder Ryms med ett saldo du anger själv.", "Bank connection is not enabled in this installation. You use Ryms with a balance you enter yourself.")}
                </p>
                <div className="btn-row">
                  {!user.is_demo && (
                    <Link href="/installningar/bank" className="btn">
                      {liveBankingAvailable() ? t("Anslut bank", "Connect bank") : t("Läs hur bankkopplingen fungerar", "Read how the bank connection works")}
                    </Link>
                  )}
                  <SheetButton className="btn ghost" title={t("Ditt saldo", "Your balance")} label={manual?.balance_ore != null ? t(`Eget saldo: ${formatKr(manual.balance_ore)}`, `Own balance: ${formatKr(manual.balance_ore)}`) : t("Ange saldo själv", "Enter balance yourself")}>
                    <p className="muted" style={{ marginBottom: 14 }}>{t("Vad finns på kontot du betalar med just nu?", "How much is in the account you pay from right now?")}</p>
                    <ActionForm action={setBalanceAction} submit={t("Spara saldo", "Save balance")}>
                      <label className="field kr">
                        <span>{t("Saldo", "Balance")}</span>
                        <input name="amount" inputMode="decimal" defaultValue={oreToInput(manual?.balance_ore)} required />
                      </label>
                    </ActionForm>
                  </SheetButton>
                </div>
              </>
            )}
            <p className="faint" style={{ fontSize: 12.5, marginTop: 14 }}>
              {t(
                "Ryms har bara läsbehörighet. Appen kan inte betala, föra över pengar, ändra kort eller stoppa köp – och du skriver aldrig in BankID, lösenord eller kortuppgifter här.",
                "Ryms has read-only access. The app cannot pay, transfer money, change cards or block purchases – and you never enter BankID, passwords or card details here.",
              )}
            </p>
          </section>

          {/* ───── Språk ───── */}
          <section className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <h2 className="serif" style={{ fontSize: 24 }}>{t("Språk", "Language")}</h2>
              <LanguageSwitch />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
              <h2 className="serif" style={{ fontSize: 24 }}>{t("Valuta", "Currency")}</h2>
              <CurrencySwitch />
            </div>
            <p className="faint" style={{ fontSize: 12.5, marginTop: 12 }}>
              {t("Valutan ändrar bara hur belopp visas. Inget räknas om, och bankkopplingen hämtar konton i svenska kronor.", "The currency only changes how amounts are shown. Nothing is converted, and the bank connection reads accounts in Swedish kronor.")}
            </p>
          </section>

          {/* ───── Bilder och AI ───── */}
          <section className="card">
            <div className="card-head">
              <h2>{t("Bilder", "Images")}</h2>
            </div>
            <p className="muted" style={{ marginBottom: 12 }}>
              {t(
                "När du fotar en vara skickas bilden till Anthropics AI-tjänst Claude för att känna igen vara och pris. Det enda som följer med är namnen på dina budgetkategorier – aldrig saldon, transaktioner eller bankuppgifter. Bilden sparas inte hos Ryms om du inte väljer det. Själva uträkningen görs alltid av Ryms, inte av AI.",
                "When you photograph an item, the image is sent to Anthropic's AI service Claude to recognise the item and price. The only thing sent along is the names of your budget categories – never balances, transactions or bank details. Ryms does not keep the image unless you choose to. The calculation itself is always done by Ryms, not by AI.",
              )}
            </p>
            <div className="rows">
              <div className="row">
                <div className="grow">
                  <div className="title">{t("Bildanalys", "Image analysis")}</div>
                  <div className="sub">
                    {!aiConfigured()
                      ? t("Inte påslagen i den här installationen", "Not enabled in this installation")
                      : user.ai_consent_at
                        ? t(`Godkänd ${ts(user.ai_consent_at)}`, `Approved ${ts(user.ai_consent_at)}`)
                        : t("Du får frågan första gången du fotar", "You will be asked the first time you take a photo")}
                  </div>
                </div>
                {user.ai_consent_at && <ConsentToggle />}
              </div>
              <div className="row">
                <div className="grow">
                  <div className="title">{t("Sparade bilder", "Saved images")}</div>
                  <div className="sub">{t("Bara du kan se dem", "Only you can see them")}</div>
                </div>
                <div className="amt" data-testid="image-count">{images} {t("st", images === 1 ? "image" : "images")}</div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <ActionForm action={deleteImagesAction} submit={t("Radera alla sparade bilder", "Delete all saved images")} submitClass="btn ghost" confirm={t("Radera alla sparade bilder? Sakerna du sparat finns kvar, utan bild.", "Delete all saved images? The items you saved remain, without an image.")} keepOpen />
            </div>
          </section>

          {/* ───── Radera ───── */}
          <section className="card">
            <div className="card-head">
              <h2>{t("Radera uppgifter", "Delete data")}</h2>
            </div>
            <div className="rows">
              <div className="row" style={{ display: "block" }}>
                <div className="title">{t("Importerad bankdata", "Imported bank data")}</div>
                <div className="sub" style={{ marginBottom: 10 }}>
                  {bankRows > 0 ? t(`${bankRows} transaktioner från banken.`, `${bankRows} transactions from the bank.`) : t("Ingen importerad bankdata.", "No imported bank data.")}{" "}
                  {t(
                    "Raderar konton, saldon och transaktioner från banken och kopplar från om banken är ansluten. Din plan och köp du registrerat själv finns kvar.",
                    "Deletes accounts, balances and transactions from the bank, and disconnects if the bank is connected. Your plan and purchases you recorded yourself remain.",
                  )}
                </div>
                <ActionForm action={deleteBankDataAction} submit={t("Radera importerad bankdata", "Delete imported bank data")} submitClass="btn ghost" confirm={t("Radera all importerad bankdata? Det går inte att ångra.", "Delete all imported bank data? This cannot be undone.")} keepOpen />
              </div>
              <div className="row" style={{ display: "block" }}>
                <div className="title">{t("Hela kontot", "The whole account")}</div>
                <div className="sub" style={{ marginBottom: 10 }}>{t("Raderar plan, köp, sparade saker, bilder, bankdata och inloggning. Bankens samtycke avslutas.", "Deletes plan, purchases, saved items, images, bank data and login. The bank consent is ended.")}</div>
                <SheetButton className="btn danger" title={t("Radera kontot", "Delete account")} label={t("Radera kontot…", "Delete account…")}>
                  <p className="muted" style={{ marginBottom: 14 }}>{t("Allt raderas direkt och går inte att få tillbaka. Skriv RADERA för att bekräfta.", "Everything is deleted immediately and cannot be recovered. Type DELETE to confirm.")}</p>
                  <ActionForm action={deleteAccountAction} submit={t("Radera kontot för gott", "Delete the account for good")} submitClass="btn danger">
                    <label className="field">
                      <span>{t("Bekräfta", "Confirm")}</span>
                      <input name="confirm" autoComplete="off" autoCapitalize="characters" placeholder={t("RADERA", "DELETE")} required />
                    </label>
                  </ActionForm>
                </SheetButton>
              </div>
            </div>
          </section>

          <form action={logoutAction}>
            <button className="btn quiet">{user.is_demo ? t("Avsluta demon", "Exit the demo") : t(`Logga ut (${user.email})`, `Log out (${user.email})`)}</button>
          </form>
        </div>
      </main>
    </div>
  );
}
