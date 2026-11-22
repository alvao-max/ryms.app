import Link from "next/link";
import { selectAccountsAction } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { BankConnect } from "@/components/BankConnect";
import { DemoStrip, Top } from "@/components/Frame";
import { CheckIcon, CloseIcon, InfoIcon } from "@/components/icons";
import { getConnection, listAccounts, liveBankingAvailable } from "@/lib/services/bank";
import type { T } from "@/lib/i18n";
import { getT } from "@/lib/locale";
import { bankEnv } from "@/lib/services/users";
import { requireUser } from "@/lib/session";

const errors = (t: T): Record<string, string> => ({
  avbruten: t("Du avbröt inloggningen hos banken. Ingenting har anslutits.", "You cancelled the login at the bank. Nothing has been connected."),
  misslyckades: t("Anslutningen gick inte att slutföra. Ingenting har anslutits – försök gärna igen.", "The connection could not be completed. Nothing has been connected – please try again."),
  okand: t("Anslutningen kunde inte kopplas till din inloggning. Börja om härifrån.", "The connection could not be tied to your login. Start again from here."),
});

export default async function BankPage({ searchParams }: { searchParams: Promise<{ steg?: string; id?: string; fel?: string }> }) {
  const user = await requireUser();
  const { t } = await getT();
  const ERRORS = errors(t);
  const q = await searchParams;
  const conn = q.steg === "konton" && q.id ? getConnection(user.id, q.id) : null;
  const accounts = conn ? listAccounts(user.id, conn.id) : [];
  const available = liveBankingAvailable();
  const sandbox = bankEnv() === "sandbox";

  return (
    <div className="shell">
      <DemoStrip user={user} />
      <Top user={user} />
      <main className="page">
        <div className="page-head">
          <h1>{conn ? t("Välj konton", "Choose accounts") : t("Anslut din bank", "Connect your bank")}</h1>
          <p>{conn ? t("Ryms läser bara de konton du väljer här.", "Ryms only reads the accounts you choose here.") : t("Frivilligt. Ryms fungerar också med ett saldo du anger själv.", "Optional. Ryms also works with a balance you enter yourself.")}</p>
        </div>
        <div className="stack">
          {q.fel && (
            <p className="note warn" role="alert">
              <InfoIcon size={16} />
              <span>{ERRORS[q.fel] ?? ERRORS.misslyckades}</span>
            </p>
          )}

          {conn ? (
            <section className="card">
              <ActionForm action={selectAccountsAction} submit={t("Spara och hämta", "Save and sync")} keepOpen>
                <input type="hidden" name="connectionId" value={conn.id} />
                {accounts.length === 0 && <p className="empty">{t("Banken visade inga konton i svenska kronor.", "The bank showed no accounts in Swedish kronor.")}</p>}
                {accounts.map((a) => (
                  <div key={a.id} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 12, marginBottom: 12 }}>
                    <input type="hidden" name="accountId" value={a.id} />
                    <label className="check">
                      <input type="checkbox" name={`sel-${a.id}`} defaultChecked={!!a.selected} />
                      <span>
                        <b>{a.name}</b> <span className="muted">{a.number_masked}</span>
                      </span>
                    </label>
                    <div className="seg" style={{ marginBottom: 0 }}>
                      <label>
                        <input type="radio" name={`type-${a.id}`} value="spending" defaultChecked={a.type === "spending"} />
                        {t("Konto jag betalar med", "Account I pay from")}
                      </label>
                      <label>
                        <input type="radio" name={`type-${a.id}`} value="savings" defaultChecked={a.type === "savings"} />
                        {t("Sparkonto", "Savings account")}
                      </label>
                    </div>
                  </div>
                ))}
                <p className="faint" style={{ fontSize: 12.5, marginBottom: 14 }}>
                  {t("Överföringar till ett sparkonto räknas som faktiskt sparande, inte som köp. Konton du inte väljer hämtas aldrig.", "Transfers to a savings account count as actual saving, not as purchases. Accounts you do not choose are never fetched.")}
                </p>
              </ActionForm>
            </section>
          ) : (
            <>
              <section className="card glow">
                <div className="card-head">
                  <h2>{t("Så fungerar det", "How it works")}</h2>
                  {sandbox && <span className="badge lilac">{t("Sandbox – testdata", "Sandbox – test data")}</span>}
                </div>
                <p style={{ marginBottom: 14 }}>
                  {t("Anslutningen sköts av ", "The connection is handled by ")}
                  <b>Enable Banking</b>
                  {t(
                    ", en kontoinformationstjänst som står under finansiell tillsyn inom EU. Du loggar in hos din bank med BankID på bankens egen sida och godkänner där vad som får delas.",
                    ", an account information service under financial supervision in the EU. You log in to your bank with BankID on the bank's own page and approve there what may be shared.",
                  )}
                </p>
                <div className="rows">
                  {[
                    t("vilka konton du har valt att dela", "which accounts you have chosen to share"),
                    t("saldon på de kontona", "balances on those accounts"),
                    t("transaktioner: datum, belopp och bankens text", "transactions: date, amount and the bank's text"),
                  ].map((x) => (
                    <div className="row" key={x}>
                      <span className="ico-dot" style={{ color: "var(--good)" }}>
                        <CheckIcon size={18} />
                      </span>
                      <span className="grow">{t("Ryms kan läsa:", "Ryms can read:")} {x}</span>
                    </div>
                  ))}
                  {[
                    t("betala, föra över eller flytta pengar", "pay, transfer or move money"),
                    t("ändra kortinställningar eller stoppa köp", "change card settings or block purchases"),
                    t("se ditt BankID, lösenord eller kortnummer", "see your BankID, password or card number"),
                  ].map((x) => (
                    <div className="row" key={x}>
                      <span className="ico-dot" style={{ color: "var(--bad)" }}>
                        <CloseIcon size={18} />
                      </span>
                      <span className="grow">{t("Ryms kan inte:", "Ryms cannot:")} {x}</span>
                    </div>
                  ))}
                </div>
                <p className="muted" style={{ fontSize: 13.5, marginTop: 14 }}>
                  {t(
                    "Varför? För att räkna ut vad du har kvar till lön och hålla budgeten uppdaterad utan att du behöver skriva in varje köp. Du skriver aldrig in bankuppgifter i Ryms. Samtycket gäller en begränsad tid och du kan koppla från när du vill under Inställningar.",
                    "Why? To work out what you have left until payday and keep the budget up to date without you entering every purchase. You never enter bank details in Ryms. The consent is valid for a limited time and you can disconnect whenever you like under Settings.",
                  )}
                </p>
              </section>

              {user.is_demo ? (
                <p className="note lilac">
                  <InfoIcon size={16} />
                  <span>{t("I demon används en påhittad demobank. Skapa ett eget konto för att ansluta en riktig bank.", "The demo uses a made-up demo bank. Create your own account to connect a real bank.")}</span>
                </p>
              ) : available ? (
                <BankConnect />
              ) : (
                <p className="note">
                  <InfoIcon size={16} />
                  <span>
                    {t(
                      "Bankkopplingen är inte aktiverad i den här installationen ännu. Fram till dess använder du Ryms med ett saldo du anger själv – allt annat fungerar som vanligt.",
                      "The bank connection is not enabled in this installation yet. Until then you use Ryms with a balance you enter yourself – everything else works as usual.",
                    )}
                  </span>
                </p>
              )}
              <Link href="/installningar" className="btn quiet">
                {t("Tillbaka", "Back")}
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
