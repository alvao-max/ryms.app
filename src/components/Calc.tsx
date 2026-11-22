import type { ReactNode } from "react";
import { getT } from "@/lib/locale";
import { formatKr } from "@/lib/money";
import type { CalcRow } from "@/lib/services/overview";
import { InfoIcon } from "./icons";
import { SheetButton } from "./Sheet";

export function CalcRows({ rows }: { rows: CalcRow[] }) {
  return (
    <div className="calc rows">
      {rows.map((r, i) => (
        <div key={i} className={`row${r.total ? " total" : ""}`}>
          <div className="grow">
            <div className="title">{r.label}</div>
            {r.note && <div className="sub">{r.note}</div>}
          </div>
          <div className="amt num">{formatKr(r.amountOre, { sign: !r.total && i > 0 })}</div>
        </div>
      ))}
    </div>
  );
}

/** Varje siffra går att trycka på för att se hur den räknats fram. */
export async function CalcButton({ title, rows, notes, className, children, ariaLabel, testId }: { title: string; rows: CalcRow[]; notes?: string[]; className?: string; children: ReactNode; ariaLabel?: string; testId?: string }) {
  const { t } = await getT();
  return (
    <SheetButton className={className} title={title} label={children} ariaLabel={ariaLabel} testId={testId}>
      <p className="muted" style={{ marginBottom: 8, fontSize: 13.5 }}>
        {t("Så här är beloppet uträknat.", "This is how the amount is calculated.")}
      </p>
      <CalcRows rows={rows} />
      {notes?.map((n, i) => (
        <p key={i} className="note" style={{ marginTop: 10 }}>
          <InfoIcon size={16} />
          <span>{n}</span>
        </p>
      ))}
    </SheetButton>
  );
}
