import Link from "next/link";
import { deleteCheckAction, deleteCheckImageAction } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { DemoStrip, Top } from "@/components/Frame";
import { SavedIcon } from "@/components/icons";
import { SheetButton } from "@/components/Sheet";
import { formatTimestamp, todayISO } from "@/lib/dates";
import { getT } from "@/lib/locale";
import { formatKr } from "@/lib/money";
import { evaluate, listChecks } from "@/lib/services/purchases";
import { requireUser } from "@/lib/session";

export default async function SavedPage() {
  const user = await requireUser();
  const { t, locale } = await getT();
  const today = todayISO();
  const VERDICT = {
    yes: ["good", t("Ryms nu", "Fits now")],
    caution: ["warn", t("Ryms, men…", "Fits, but…")],
    no: ["bad", t("Ryms inte nu", "Doesn't fit now")],
  } as const;
  const saved = listChecks(user, "saved").map((c) => {
    // Räknas om mot budgeten som den ser ut just nu – inget svar sparas.
    let verdict: keyof typeof VERDICT | null = null;
    let text = "";
    try {
      const e = evaluate(user, { itemName: c.item_name, priceOre: c.price_ore, categoryId: c.category_id, plannedPurchaseId: c.planned_purchase_id }, today, locale);
      verdict = e.result.verdict;
      text = e.explanation.text;
    } catch {
      text = t("Kategorin finns inte längre. Öppna och välj en ny.", "The category no longer exists. Open it and choose a new one.");
    }
    return { ...c, verdict, text };
  });
  const skipped = listChecks(user, "skipped").slice(0, 10);

  return (
    <div className="shell">
      <DemoStrip user={user} />
      <Top user={user} />
      <main className="page">
        <div className="page-head">
          <h1>{t("Sparat", "Saved")}</h1>
          <p>{t("Saker du funderar på. Svaret räknas om mot din budget varje gång du tittar.", "Things you are thinking about. The answer is recalculated against your budget every time you look.")}</p>
        </div>
        <div className="stack">
          {saved.length === 0 ? (
            <section className="card" style={{ textAlign: "center", padding: "34px 24px" }}>
              <span className="ico-dot" style={{ margin: "0 auto 14px" }}>
                <SavedIcon />
              </span>
              <p className="serif" style={{ fontSize: 26, marginBottom: 8 }}>{t("Inget sparat än", "Nothing saved yet")}</p>
              <p className="muted" style={{ marginBottom: 18 }}>{t("När du kollar ett köp kan du välja ”Spara till senare”.", "When you check a purchase you can choose ”Save for later”.")}</p>
              <Link href="/ryms-det" className="btn">
                Ryms det?
              </Link>
            </section>
          ) : (
            saved.map((c) => (
              <section className="card" key={c.id} data-testid="saved-item">
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.image_id && <img src={`/api/images/${c.image_id}`} alt="" className="thumb" />}
                  <div className="grow" style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                      <h2 className="serif" style={{ fontSize: 25 }}>{c.item_name}</h2>
                      <span className="num" style={{ fontWeight: 500 }}>{formatKr(c.price_ore)}</span>
                    </div>
                    {c.verdict && (
                      <span className={`badge ${VERDICT[c.verdict][0]}`} style={{ marginTop: 8 }} data-testid="saved-verdict">
                        {VERDICT[c.verdict][1]}
                      </span>
                    )}
                    <p className="muted" style={{ fontSize: 13.5, marginTop: 8 }}>{c.text}</p>
                    <p className="faint" style={{ fontSize: 12, marginTop: 6 }}>
                      {t("Sparad", "Saved")} {formatTimestamp(c.updated_at, today, locale)}
                    </p>
                  </div>
                </div>
                <div className="btn-row two" style={{ marginTop: 14 }}>
                  <Link href={`/ryms-det?sak=${c.id}`} className="btn small" style={{ width: "100%" }} data-testid="recheck">
                    {t("Kolla igen", "Check again")}
                  </Link>
                  <SheetButton className="btn ghost small" title={c.item_name} label={t("Ta bort…", "Remove…")}>
                    {c.image_id && (
                      <ActionForm action={deleteCheckImageAction} submit={t("Radera bara bilden", "Delete only the photo")} submitClass="btn ghost" confirm={t("Radera bilden? Saken finns kvar.", "Delete the photo? The item stays.")}>
                        <input type="hidden" name="imageId" value={c.image_id} />
                      </ActionForm>
                    )}
                    <div style={{ height: 10 }} />
                    <ActionForm action={deleteCheckAction} submit={c.image_id ? t("Ta bort saken och bilden", "Remove the item and the photo") : t("Ta bort saken", "Remove the item")} submitClass="btn danger">
                      <input type="hidden" name="id" value={c.id} />
                    </ActionForm>
                  </SheetButton>
                </div>
              </section>
            ))
          )}
          {skipped.length > 0 && (
            <section className="card">
              <div className="card-head">
                <h2>{t("Avstått", "Skipped")}</h2>
              </div>
              <div className="rows">
                {skipped.map((c) => (
                  <div className="row" key={c.id}>
                    <div className="grow">
                      <div className="title">{c.item_name}</div>
                      <div className="sub">{t("Inget köp, ingen insättning till sparande", "No purchase, no deposit to savings")}</div>
                    </div>
                    <div className="amt num muted">{formatKr(c.price_ore)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
