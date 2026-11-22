import { createSign } from "node:crypto";
import { bi } from "../../i18n";
import fs from "node:fs";
import { sha256 } from "../../crypto";
import { isDate } from "../../dates";
import type { BankTx } from "../transactions";
import { BankError, type BankInfo, type BankProvider, type ProviderAccount, type PsuContext } from "./provider";

/**
 * Enable Banking – kontoinformation (AIS) för svenska banker.
 * Dokumentation: https://enablebanking.com/docs/api/reference/
 *
 * Ryms anropar ENDAST: GET /aspsps, POST /auth, POST /sessions, GET /accounts/{uid}/balances,
 * GET /accounts/{uid}/transactions och DELETE /sessions/{id}. Betalningsändpunkterna (/payments)
 * anropas aldrig, och POST /auth innehåller bara AIS-objektet `access` (saldon + transaktioner).
 *
 * Fältnamnen följer leverantörens officiella exempelkod (github.com/enablebanking/enablebanking-api-samples).
 * Verifiera mot den aktuella API-referensen innan produktion – se README, "Aktivera riktig bankkoppling".
 */

const BASE = process.env.ENABLEBANKING_API_URL || "https://api.enablebanking.com";

function privateKey(): string | null {
  if (process.env.ENABLEBANKING_PRIVATE_KEY) return process.env.ENABLEBANKING_PRIVATE_KEY.replace(/\\n/g, "\n");
  const p = process.env.ENABLEBANKING_PRIVATE_KEY_PATH;
  if (p && fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  return null;
}
const appId = () => process.env.ENABLEBANKING_APP_ID || null;

function jwt(): string {
  const key = privateKey();
  const kid = appId();
  if (!key || !kid) throw new BankError("config", bi("Bankkopplingen är inte konfigurerad", "Bank connection is not configured"));
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ typ: "JWT", alg: "RS256", kid });
  const body = b64({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 300 });
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(key).toString("base64url");
  return `${head}.${body}.${sig}`;
}

function mapError(status: number, code: string | undefined): BankError {
  switch (code) {
    case "EXPIRED_SESSION":
    case "CLOSED_SESSION":
    case "REVOKED_SESSION":
    case "INVALID_SESSION":
      return new BankError("expired", bi("Samtycket har gått ut eller återkallats", "The consent has expired or been revoked"));
    case "ASPSP_ERROR":
    case "ASPSP_TIMEOUT":
      return new BankError("unavailable", bi("Banken svarar inte just nu", "The bank is not responding right now"));
    case "ASPSP_RATE_LIMIT_EXCEEDED":
      return new BankError("rate_limited", bi("Banken tillåter inte fler hämtningar just nu", "The bank does not allow more syncs right now"));
  }
  if (status === 429) return new BankError("rate_limited", bi("För många hämtningar just nu", "Too many syncs right now"));
  if (status === 401 || status === 403) return new BankError("expired", bi("Åtkomsten nekades", "Access was denied"));
  if (status >= 500 || status === 408) return new BankError("unavailable", bi("Tjänsten svarar inte just nu", "The service is not responding right now"));
  return new BankError("other", `Oväntat svar (${status})`);
}

async function call<T>(method: string, path: string, opts: { body?: unknown; query?: Record<string, string | undefined>; psu?: PsuContext } = {}): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v) url.searchParams.set(k, v);
  const headers: Record<string, string> = { Authorization: `Bearer ${jwt()}`, Accept: "application/json" };
  if (opts.body) headers["Content-Type"] = "application/json";
  if (opts.psu?.ip) headers["Psu-Ip-Address"] = opts.psu.ip;
  if (opts.psu?.userAgent) headers["Psu-User-Agent"] = opts.psu.userAgent;
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined, signal: AbortSignal.timeout(30_000), cache: "no-store" });
  } catch {
    throw new BankError("unavailable", bi("Kunde inte nå banktjänsten", "Could not reach the bank service"));
  }
  if (!res.ok) {
    let code: string | undefined;
    try {
      const j = (await res.json()) as { error?: string; code?: string | number };
      code = typeof j.error === "string" ? j.error : typeof j.code === "string" ? j.code : undefined;
    } catch {}
    // Loggar bara status och felkod – aldrig tokens, sessions-id eller kontouppgifter.
    console.warn(`[ryms] bank-API ${method} ${path.replace(/\/[0-9a-f-]{20,}/g, "/…")} → ${res.status}${code ? " " + code : ""}`);
    throw mapError(res.status, code);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** "123.45" → 12345 utan flyttal. */
export function decimalToOre(s: string): number | null {
  const m = /^(-?)(\d+)(?:\.(\d{1,2})\d*)?$/.exec(String(s).trim());
  if (!m) return null;
  const ore = Number(m[2]) * 100 + Number(((m[3] ?? "") + "00").slice(0, 2));
  return m[1] ? -ore : ore;
}

interface EbTransaction {
  entry_reference?: string | null;
  transaction_amount?: { amount?: string; currency?: string };
  credit_debit_indicator?: string;
  status?: string;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  remittance_information?: string[] | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
}

/** Gör om leverantörens transaktioner. `transaction_id` används inte som nyckel – den kan ändras enligt leverantören. */
export function mapTransactions(list: EbTransaction[]): BankTx[] {
  const out: BankTx[] = [];
  const seen = new Map<string, number>();
  for (const t of list) {
    if (t.transaction_amount?.currency !== "SEK") continue;
    const status = t.status === "BOOK" ? "booked" : t.status === "PDNG" || t.status === "HOLD" ? "pending" : null;
    if (!status) continue;
    const abs = decimalToOre(t.transaction_amount?.amount ?? "");
    const date = t.booking_date || t.value_date || t.transaction_date;
    if (abs == null || abs === 0 || !isDate(date)) continue;
    const debit = t.credit_debit_indicator === "DBIT";
    const amountOre = debit ? -Math.abs(abs) : Math.abs(abs);
    const description = ((t.remittance_information ?? []).filter(Boolean).join(" ") || (debit ? t.creditor?.name : t.debtor?.name) || "").trim().slice(0, 120);
    let externalId: string;
    if (status === "booked" && t.entry_reference) externalId = `ref:${t.entry_reference}`;
    else {
      // Reservnyckel: fingeravtryck + löpnummer för identiska rader samma dag.
      const fp = sha256([status === "booked" ? "b" : "p", date, amountOre, description].join("|")).slice(0, 24);
      const n = (seen.get(fp) ?? 0) + 1;
      seen.set(fp, n);
      externalId = `fp:${fp}:${n}`;
    }
    out.push({ externalId, status, amountOre, date, description });
  }
  return out;
}

const AVAILABLE = ["ITAV", "CLAV", "XPCD", "OPAV", "FWAV"];
const BOOKED = ["ITBD", "CLBD", "OPBD", "PRCD"];
export function pickBalance(balances: { balance_type?: string; balance_amount?: { amount?: string; currency?: string } }[]): { balanceOre: number; kind: "available" | "booked" } | null {
  for (const [types, kind] of [[AVAILABLE, "available"], [BOOKED, "booked"]] as const) {
    for (const type of types) {
      const b = balances.find((x) => x.balance_type === type && x.balance_amount?.currency === "SEK");
      const ore = b ? decimalToOre(b.balance_amount?.amount ?? "") : null;
      if (ore != null) return { balanceOre: ore, kind };
    }
  }
  return null;
}

function mask(s: string | undefined | null): string | null {
  if (!s) return null;
  const t = s.replace(/\s/g, "");
  return t.length > 4 ? `•••• ${t.slice(-4)}` : t;
}

export const enableBanking: BankProvider = {
  id: "enablebanking",
  displayName: "Enable Banking",
  configured: () => !!(appId() && privateKey()),

  async listBanks(): Promise<BankInfo[]> {
    const r = await call<{ aspsps: { name: string; country: string; psu_types?: string[]; maximum_consent_validity?: number }[] }>("GET", "/aspsps", { query: { country: "SE", psu_type: "personal" } });
    return (r.aspsps ?? [])
      .filter((a) => !a.psu_types || a.psu_types.includes("personal"))
      .map((a) => ({ name: a.name, country: a.country, maxConsentSeconds: a.maximum_consent_validity ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name, "sv"));
  },

  async startAuth({ bank, state, redirectUrl }) {
    const max = Math.min(bank.maxConsentSeconds ?? 90 * 86400, 180 * 86400);
    const validUntil = new Date(Date.now() + (max - 3600) * 1000).toISOString();
    const r = await call<{ url: string }>("POST", "/auth", {
      body: {
        // Endast läsrätt till kontoinformation: saldon och transaktioner. Inget betalningsobjekt.
        access: { valid_until: validUntil, balances: true, transactions: true },
        aspsp: { name: bank.name, country: bank.country },
        state,
        redirect_url: redirectUrl,
        psu_type: "personal",
        language: "sv",
      },
    });
    return { url: r.url, validUntil };
  },

  async createSession(code) {
    const r = await call<{
      session_id: string;
      accounts?: { uid?: string; identification_hash?: string; name?: string; currency?: string; cash_account_type?: string; product?: string; account_id?: { iban?: string; other?: { identification?: string } } }[];
    }>("POST", "/sessions", { body: { code } });
    const accounts: ProviderAccount[] = (r.accounts ?? [])
      .filter((a) => a.uid)
      .map((a) => {
        const label = `${a.name ?? ""} ${a.product ?? ""}`.toLocaleLowerCase("sv-SE");
        return {
          externalId: a.uid!,
          stableKey: a.identification_hash ?? null,
          name: a.name || a.product || "Konto",
          numberMasked: mask(a.account_id?.iban ?? a.account_id?.other?.identification),
          currency: a.currency ?? "SEK",
          typeGuess: a.cash_account_type === "SVGS" || /spar|saving/.test(label) ? "savings" : "spending",
        };
      });
    return { sessionId: r.session_id, accounts };
  },

  async fetchBalance(_sessionId, uid, psu) {
    const r = await call<{ balances: { balance_type?: string; balance_amount?: { amount?: string; currency?: string } }[] }>("GET", `/accounts/${encodeURIComponent(uid)}/balances`, { psu });
    const b = pickBalance(r.balances ?? []);
    if (!b) throw new BankError("other", bi("Inget saldo i SEK", "No balance in SEK"));
    return b;
  },

  async fetchTransactions(_sessionId, uid, dateFrom, psu) {
    const all: EbTransaction[] = [];
    let key: string | undefined;
    for (let page = 0; page < 50; page++) {
      const r = await call<{ transactions?: EbTransaction[]; continuation_key?: string | null }>("GET", `/accounts/${encodeURIComponent(uid)}/transactions`, { query: { date_from: dateFrom, continuation_key: key }, psu });
      all.push(...(r.transactions ?? []));
      if (!r.continuation_key) break;
      key = r.continuation_key;
    }
    return mapTransactions(all);
  },

  async revoke(sessionId) {
    await call<unknown>("DELETE", `/sessions/${encodeURIComponent(sessionId)}`);
  },
};
