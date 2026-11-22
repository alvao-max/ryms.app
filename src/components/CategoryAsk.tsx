"use client";

import { useState, useTransition } from "react";
import { answerCategoryAction } from "@/app/actions";
import { formatDateShort } from "@/lib/dates";
import { formatKr } from "@/lib/money";
import { CategoryIcon } from "./icons";
import { useLocale, useT } from "./Locale";

interface Props {
  tx: { id: string; description: string; amount_ore: number; date: string };
  total: number;
  categories: { id: string; name: string; icon: string }[];
}

/** Frågar om ett köp som appen inte kunde placera. Ett tryck räcker, och svaret gäller handlaren framöver. */
export function CategoryAsk({ tx, total, categories }: Props) {
  const t = useT();
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const answer = (categoryId: string | null) =>
    start(async () => {
      setError(null);
      const r = await answerCategoryAction(tx.id, categoryId);
      if (r?.error) setError(r.error);
    });
  return (
    <section className="card ask-card" data-testid="category-ask" aria-busy={pending}>
      <div className="ask-top">
        <span className="caps lilac">{t("Vad var det här köpet?", "What was this purchase?")}</span>
        {total > 1 && (
          <span className="faint num" style={{ fontSize: 12 }}>
            {t(`1 av ${total}`, `1 of ${total}`)}
          </span>
        )}
      </div>
      <div className="ask-tx">
        <div className="grow">
          <div className="title" data-testid="ask-description">
            {tx.description || t("Köp utan text", "Purchase without text")}
          </div>
          <div className="sub">{formatDateShort(tx.date, locale)}</div>
        </div>
        <div className="amt num">{formatKr(-tx.amount_ore)}</div>
      </div>
      <div className="ask-pills">
        {categories.map((c) => (
          <button key={c.id} type="button" className="pill" disabled={pending} onClick={() => answer(c.id)} data-testid={`ask-${c.name}`}>
            <CategoryIcon icon={c.icon} size={16} />
            {c.name}
          </button>
        ))}
        <button type="button" className="pill quiet" disabled={pending} onClick={() => answer(null)}>
          {t("Inte ett köp", "Not a purchase")}
        </button>
      </div>
      {error && (
        <p className="error" role="alert" style={{ marginTop: 10 }}>
          {error}
        </p>
      )}
      <p className="faint" style={{ fontSize: 12, marginTop: 12 }}>
        {t("Ryms kommer ihåg ditt svar för samma butik nästa gång.", "Ryms remembers your answer for the same shop next time.")}
      </p>
    </section>
  );
}
