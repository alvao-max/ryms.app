/** Enkel, förutsägbar klassning av banktransaktioner. Inga AI-anrop – bankdata lämnar aldrig servern. */

export type TxKind = "expense" | "income" | "refund" | "transfer" | "saving";

/** Handlarnyckelord → kategorisymbol. */
const KEYWORDS: [RegExp, string][] = [
  [/\b(ica|coop|willys|hemk[öo]p|lidl|city gross|mathem|tempo|matdax)\b/, "mat"],
  [/\b(sl|v[äa]sttrafik|sk[åa]netrafiken|sj|circle k|okq8|preem|voi|bolt)\b/, "transport"],
  [/\b(h&m|h & m|hm|zalando|lindex|kappahl|dressmann|weekday|stadium|intersport|arket|cos|scorett|din sko|nilson)\b/, "klader"],
  [/\b(spotify|netflix|sf bio|filmstaden|hbo|viaplay|steam|ticketmaster|bokus|adlibris)\b/, "noje"],
  [/\b(ikea|clas ohlson|jysk|rusta|bauhaus|hornbach|biltema)\b/, "hem"],
  [/\b(apotek|apoteket|kronans|apotea)\b/, "halsa"],
];
/** Kategorinamn som hör till varje symbol, på svenska och engelska. */
export const CATEGORY_NAMES: Record<string, string[]> = {
  mat: ["mat", "food", "groceries"],
  transport: ["transport"],
  klader: ["kläder", "clothes", "clothing"],
  noje: ["nöje", "fun", "entertainment"],
  hem: ["hem", "home"],
  halsa: ["hälsa", "health"],
};

export function normalizeDescription(s: string): string {
  return s
    .toLocaleLowerCase("sv-SE")
    .replace(/kortk[öo]p|reserverat belopp|swish (till|från)/g, " ")
    .replace(/[0-9*#/\\:,.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ClassifyContext {
  /** användarens kategorier */
  categories: { id: string; name: string }[];
  /** inlärt från användarens egna val: normaliserad beskrivning → kategori */
  learned: Map<string, string>;
  /** tidigare köp (normaliserad beskrivning → kategori) för att känna igen återbetalningar */
  recentExpenses: Map<string, string | null>;
}

export function classify(tx: { amountOre: number; description: string }, ctx: ClassifyContext): { kind: TxKind; categoryId: string | null } {
  const n = normalizeDescription(tx.description);
  if (tx.amountOre >= 0) {
    if (/\bl[öo]n\b|salary|l[öo]neutbetalning/.test(n)) return { kind: "income", categoryId: null };
    if (/[öo]verf[öo]ring/.test(n)) return { kind: "transfer", categoryId: null };
    if (ctx.recentExpenses.has(n) && n) return { kind: "refund", categoryId: ctx.recentExpenses.get(n) ?? null };
    return { kind: "income", categoryId: null };
  }
  if (/sparkonto|sparande|till spar/.test(n)) return { kind: "saving", categoryId: null };
  if (/[öo]verf[öo]ring/.test(n)) return { kind: "transfer", categoryId: null };
  const learned = ctx.learned.get(n);
  if (learned && ctx.categories.some((c) => c.id === learned)) return { kind: "expense", categoryId: learned };
  for (const [re, name] of KEYWORDS) {
    if (re.test(n)) {
      const c = ctx.categories.find((x) => CATEGORY_NAMES[name].includes(x.name.toLocaleLowerCase("sv-SE")));
      if (c) return { kind: "expense", categoryId: c.id };
    }
  }
  return { kind: "expense", categoryId: null };
}
