"use client";

import { useState, useTransition } from "react";
import { listBanksAction, startBankAction } from "@/app/actions";
import { useT } from "./Locale";

type Bank = { name: string; country: string; maxConsentSeconds: number | null };

/** Bankvalet. Inloggningen sker sedan hos banktjänsten och banken – aldrig i Ryms. */
export function BankConnect() {
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [pending, start] = useTransition();
  const t = useT();

  if (!banks)
    return (
      <>
        {error && <p className="error" role="alert">{error}</p>}
        <button
          className="btn"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await listBanksAction();
              if (r.error) setError(r.error);
              else setBanks(r.banks ?? []);
            })
          }
        >
          {pending ? t("Hämtar banker…", "Loading banks…") : t("Jag förstår – välj bank", "I understand – choose bank")}
        </button>
      </>
    );

  const shown = banks.filter((b) => b.name.toLocaleLowerCase("sv-SE").includes(filter.toLocaleLowerCase("sv-SE")));
  return (
    <section className="card">
      <div className="card-head">
        <h2>{t("Välj din bank", "Choose your bank")}</h2>
      </div>
      <label className="field">
        <span className="sr">{t("Sök bank", "Search bank")}</span>
        <input placeholder={t("Sök bank", "Search bank")} value={filter} onChange={(e) => setFilter(e.target.value)} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="rows">
        {shown.map((b) => (
          <button
            key={b.name}
            className="row"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await startBankAction(b);
                if (r.url) window.location.assign(r.url);
                else setError(r.error ?? t("Anslutningen kunde inte startas.", "The connection could not be started."));
              })
            }
          >
            <span className="grow title">{b.name}</span>
            <span className="muted">{t("Fortsätt hos banken", "Continue at the bank")}</span>
          </button>
        ))}
        {shown.length === 0 && <p className="empty">{t("Ingen bank matchar sökningen.", "No bank matches the search.")}</p>}
      </div>
    </section>
  );
}
