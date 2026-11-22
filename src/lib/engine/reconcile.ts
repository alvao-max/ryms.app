import { diffDays } from "../dates";

export interface MatchItem {
  id: string;
  /** signerat belopp i öre (köp är negativa) */
  amountOre: number;
  date: string;
}
export interface MatchOutcome {
  /** entydiga par: exakt en kandidat åt båda håll */
  auto: { bankId: string; manualId: string }[];
  /** kräver att användaren bekräftar */
  ambiguous: { bankId: string; candidates: string[] }[];
}

/** Banktransaktionen får vara daterad en dag före till fem dagar efter det manuella köpet. */
export function isCandidate(bank: MatchItem, manual: MatchItem): boolean {
  if (bank.amountOre !== manual.amountOre) return false;
  const d = diffDays(manual.date, bank.date);
  return d >= -1 && d <= 5;
}

/**
 * Parar ihop banktransaktioner med manuellt registrerade köp.
 * Aldrig gissningar: om något är tvetydigt lämnas det till användaren.
 */
export function matchBankToManual(bank: MatchItem[], manual: MatchItem[]): MatchOutcome {
  const byBank = new Map<string, string[]>();
  const byManual = new Map<string, string[]>();
  for (const b of bank) {
    for (const m of manual) {
      if (!isCandidate(b, m)) continue;
      byBank.set(b.id, [...(byBank.get(b.id) ?? []), m.id]);
      byManual.set(m.id, [...(byManual.get(m.id) ?? []), b.id]);
    }
  }
  const out: MatchOutcome = { auto: [], ambiguous: [] };
  for (const b of bank) {
    const cands = byBank.get(b.id);
    if (!cands?.length) continue;
    if (cands.length === 1 && byManual.get(cands[0])!.length === 1) out.auto.push({ bankId: b.id, manualId: cands[0] });
    else out.ambiguous.push({ bankId: b.id, candidates: cands });
  }
  return out;
}
