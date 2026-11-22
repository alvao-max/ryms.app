import { decryptSecret, encryptSecret, randomToken, sha256 } from "../../crypto";
import { bi } from "../../i18n";
import { getDb, newId } from "../../db";
import { addDays, nowISO, todayISO } from "../../dates";
import { importBankTransactions, type BankTx } from "../transactions";
import { bankEnv, type User } from "../users";
import { enableBanking } from "./enablebanking";
import { BankError, type BankInfo, type BankProvider, type PsuContext } from "./provider";

export { BankError } from "./provider";

let override: BankProvider | null = null;
/** Endast för tester. */
export function setProviderForTests(p: BankProvider | null): void {
  override = p;
}
export function provider(): BankProvider {
  return override ?? enableBanking;
}
/** Kan riktiga banker anslutas i den här installationen? */
export function liveBankingAvailable(): boolean {
  return provider().configured();
}

export interface Connection {
  id: string;
  user_id: string;
  environment: "demo" | "sandbox" | "live";
  provider: string;
  bank_name: string;
  bank_country: string;
  status: "pending" | "active" | "expired" | "error" | "disconnected";
  consent_expires_at: string | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
  created_at: string;
}
const CONN_COLS = "id, user_id, environment, provider, bank_name, bank_country, status, consent_expires_at, last_sync_at, last_sync_error, created_at";

export function getConnection(userId: string, id: string): Connection | null {
  return (getDb().prepare(`SELECT ${CONN_COLS} FROM bank_connections WHERE id = ? AND user_id = ?`).get(id, userId) as Connection | undefined) ?? null;
}

export interface AccountInfo {
  id: string;
  name: string;
  number_masked: string | null;
  type: "spending" | "savings";
  selected: number;
  balance_ore: number | null;
  balance_at: string | null;
}
export function listAccounts(userId: string, connectionId: string): AccountInfo[] {
  return getDb().prepare("SELECT id, name, number_masked, type, selected, balance_ore, balance_at FROM accounts WHERE user_id = ? AND connection_id = ? ORDER BY name").all(userId, connectionId) as AccountInfo[];
}

export async function listBanks(): Promise<BankInfo[]> {
  return provider().listBanks();
}

/** Startar anslutningen. Användaren skickas sedan till leverantörens/bankens egen inloggning (BankID sker där, aldrig i Ryms). */
export async function startConnection(user: User, bank: BankInfo, appUrl: string): Promise<string> {
  if (user.is_demo) throw new BankError("config", bi("Demokonton kan inte ansluta riktiga banker", "Demo accounts cannot connect real banks"));
  const p = provider();
  if (!p.configured()) throw new BankError("config", bi("Bankkopplingen är inte konfigurerad", "Bank connection is not configured"));
  const state = randomToken(24);
  const { url, validUntil } = await p.startAuth({ bank, state, redirectUrl: `${appUrl.replace(/\/$/, "")}/api/bank/callback` });
  const db = getDb();
  db.prepare("DELETE FROM bank_connections WHERE user_id = ? AND status = 'pending'").run(user.id);
  db.prepare(
    "INSERT INTO bank_connections (id, user_id, environment, provider, bank_name, bank_country, status, state_hash, consent_expires_at, created_at) VALUES (?,?,?,?,?,?,'pending',?,?,?)",
  ).run(newId(), user.id, bankEnv(), p.id, bank.name, bank.country, sha256(state), validUntil, nowISO());
  return url;
}

export type CallbackOutcome = { ok: true; connectionId: string } | { ok: false; reason: "cancelled" | "failed" | "unknown_state" };

/** Tar emot återhoppet från banken. `state` måste höra till en väntande anslutning för just den inloggade användaren. */
export async function completeConnection(user: User, params: { code?: string | null; state?: string | null; error?: string | null }): Promise<CallbackOutcome> {
  const db = getDb();
  const pending = params.state
    ? (db.prepare(`SELECT ${CONN_COLS} FROM bank_connections WHERE user_id = ? AND status = 'pending' AND state_hash = ?`).get(user.id, sha256(params.state)) as Connection | undefined)
    : undefined;
  if (!pending) return { ok: false, reason: "unknown_state" };
  if (params.error || !params.code) {
    db.prepare("DELETE FROM bank_connections WHERE id = ?").run(pending.id);
    return { ok: false, reason: params.error === "access_denied" ? "cancelled" : "failed" };
  }
  try {
    const session = await provider().createSession(params.code);
    db.transaction(() => {
      // En ny anslutning ersätter en tidigare till samma miljö. Befintliga konton känns igen på sin stabila nyckel.
      const old = db.prepare("SELECT id FROM bank_connections WHERE user_id = ? AND environment = ? AND id != ? AND status != 'pending'").all(user.id, pending.environment, pending.id) as { id: string }[];
      for (const a of session.accounts.filter((x) => x.currency === "SEK")) {
        const prev = a.stableKey
          ? (db.prepare("SELECT id FROM accounts WHERE user_id = ? AND environment = ? AND stable_key = ?").get(user.id, pending.environment, a.stableKey) as { id: string } | undefined)
          : undefined;
        if (prev) db.prepare("UPDATE accounts SET connection_id = ?, external_id = ?, name = ?, number_masked = ? WHERE id = ?").run(pending.id, a.externalId, a.name, a.numberMasked, prev.id);
        else
          db.prepare("INSERT INTO accounts (id, user_id, connection_id, environment, external_id, stable_key, name, number_masked, type, selected) VALUES (?,?,?,?,?,?,?,?,?,0)").run(newId(), user.id, pending.id, pending.environment, a.externalId, a.stableKey, a.name, a.numberMasked, a.typeGuess);
      }
      for (const o of old) db.prepare("DELETE FROM bank_connections WHERE id = ?").run(o.id);
      db.prepare("UPDATE bank_connections SET status = 'active', session_enc = ?, state_hash = NULL WHERE id = ?").run(encryptSecret(session.sessionId), pending.id);
    })();
    return { ok: true, connectionId: pending.id };
  } catch {
    db.prepare("DELETE FROM bank_connections WHERE id = ?").run(pending.id);
    return { ok: false, reason: "failed" };
  }
}

/** Användaren väljer själv vilka konton Ryms får läsa, och vilka som är sparkonton. */
export function selectAccounts(userId: string, connectionId: string, choices: { accountId: string; selected: boolean; type: "spending" | "savings" }[]): void {
  const db = getDb();
  if (!getConnection(userId, connectionId)) throw new BankError("other", bi("Hittades inte", "Not found"));
  db.transaction(() => {
    for (const c of choices) {
      db.prepare("UPDATE accounts SET selected = ?, type = ? WHERE id = ? AND user_id = ? AND connection_id = ?").run(c.selected ? 1 : 0, c.type === "savings" ? "savings" : "spending", c.accountId, userId, connectionId);
      // Avvalda konton ska inte lämna data kvar.
      if (!c.selected) {
        db.prepare("UPDATE transactions SET merged_into = NULL WHERE user_id = ? AND merged_into IN (SELECT id FROM transactions WHERE account_id = ?)").run(userId, c.accountId);
        db.prepare("DELETE FROM transactions WHERE user_id = ? AND account_id = ?").run(userId, c.accountId);
        db.prepare("UPDATE accounts SET balance_ore = NULL, balance_at = NULL WHERE id = ? AND user_id = ?").run(c.accountId, userId);
      }
    }
  })();
}

export interface SyncResult {
  ok: boolean;
  code?: BankError["code"];
  inserted: number;
  autoMatched: number;
  needsConfirmation: number;
}

/**
 * Hämtar saldo och transaktioner för de valda kontona. Frånkopplade anslutningar hämtas aldrig.
 * `psu` anges bara när användaren själv startat hämtningen.
 */
export async function syncConnection(user: User, connectionId: string, psu?: PsuContext): Promise<SyncResult> {
  const db = getDb();
  const conn = getConnection(user.id, connectionId);
  const res: SyncResult = { ok: false, inserted: 0, autoMatched: 0, needsConfirmation: 0 };
  if (!conn || conn.status === "disconnected" || conn.status === "pending" || conn.environment === "demo") return { ...res, code: "other" };
  if (conn.environment !== bankEnv()) return { ...res, code: "config" };
  const enc = (db.prepare("SELECT session_enc FROM bank_connections WHERE id = ?").get(conn.id) as { session_enc: string | null }).session_enc;
  if (!enc) return { ...res, code: "expired" };
  if (conn.consent_expires_at && conn.consent_expires_at < nowISO()) {
    db.prepare("UPDATE bank_connections SET status = 'expired' WHERE id = ?").run(conn.id);
    return { ...res, code: "expired" };
  }
  const p = provider();
  const sessionId = decryptSecret(enc);
  const accounts = db.prepare("SELECT id, external_id FROM accounts WHERE user_id = ? AND connection_id = ? AND selected = 1").all(user.id, conn.id) as { id: string; external_id: string }[];
  const from = addDays(conn.last_sync_at ? conn.last_sync_at.slice(0, 10) : todayISO(), conn.last_sync_at ? -14 : -90);
  try {
    const fetched: { accountId: string; balance: { balanceOre: number; kind: string }; txs: BankTx[] }[] = [];
    for (const a of accounts) {
      fetched.push({ accountId: a.id, balance: await p.fetchBalance(sessionId, a.external_id, psu), txs: await p.fetchTransactions(sessionId, a.external_id, from, psu) });
    }
    const at = nowISO();
    for (const f of fetched) {
      const s = importBankTransactions(user, f.accountId, f.txs);
      res.inserted += s.inserted;
      res.autoMatched += s.autoMatched;
      res.needsConfirmation += s.needsConfirmation;
      db.prepare("UPDATE accounts SET balance_ore = ?, balance_kind = ?, balance_at = ? WHERE id = ?").run(f.balance.balanceOre, f.balance.kind, at, f.accountId);
    }
    db.prepare("UPDATE bank_connections SET status = 'active', last_sync_at = ?, last_sync_error = NULL WHERE id = ?").run(at, conn.id);
    return { ...res, ok: true };
  } catch (e) {
    const code = e instanceof BankError ? e.code : "other";
    // Utgånget samtycke kräver ny inloggning; tillfälliga fel behåller anslutningen och den äldre datan.
    db.prepare("UPDATE bank_connections SET status = ?, last_sync_error = ? WHERE id = ?").run(code === "expired" ? "expired" : conn.status === "expired" ? "expired" : "active", code, conn.id);
    return { ...res, code };
  }
}

/**
 * Kopplar från banken: sessionen avslutas hos leverantören (som stänger bankens samtycke),
 * den krypterade sessionsnyckeln raderas och inga fler hämtningar görs. Importerad data ligger kvar
 * tills användaren raderar den separat.
 */
export async function disconnectBank(user: User, connectionId: string): Promise<{ revoked: boolean }> {
  const db = getDb();
  const conn = getConnection(user.id, connectionId);
  if (!conn) throw new BankError("other", bi("Hittades inte", "Not found"));
  let revoked = conn.environment === "demo";
  const enc = (db.prepare("SELECT session_enc FROM bank_connections WHERE id = ?").get(conn.id) as { session_enc: string | null }).session_enc;
  if (enc && conn.environment !== "demo") {
    try {
      await provider().revoke(decryptSecret(enc));
      revoked = true;
    } catch (e) {
      // Ett redan avslutat samtycke räknas som återkallat.
      revoked = e instanceof BankError && e.code === "expired";
    }
  } else if (!enc) revoked = true;
  db.prepare("UPDATE bank_connections SET status = 'disconnected', session_enc = NULL, state_hash = NULL WHERE id = ?").run(conn.id);
  return { revoked };
}

/** Raderar all importerad bankdata (transaktioner, konton, anslutningar). Manuellt registrerade köp finns kvar. */
export async function deleteImportedBankData(user: User): Promise<void> {
  const db = getDb();
  const conns = db.prepare("SELECT id, status FROM bank_connections WHERE user_id = ?").all(user.id) as { id: string; status: string }[];
  for (const c of conns) if (c.status !== "disconnected" && c.status !== "pending") await disconnectBank(user, c.id);
  db.transaction(() => {
    db.prepare("UPDATE transactions SET merged_into = NULL WHERE user_id = ? AND merged_into IN (SELECT id FROM transactions WHERE user_id = ? AND source = 'bank')").run(user.id, user.id);
    db.prepare(
      `UPDATE planned_purchases SET tx_id = (SELECT m.id FROM transactions m WHERE m.planned_purchase_id = planned_purchases.id AND m.source = 'manual' LIMIT 1)
       WHERE user_id = ? AND tx_id IN (SELECT id FROM transactions WHERE user_id = ? AND source = 'bank')`,
    ).run(user.id, user.id);
    db.prepare("UPDATE planned_purchases SET status = 'planned' WHERE user_id = ? AND status = 'bought' AND tx_id IS NULL").run(user.id);
    db.prepare("DELETE FROM bill_payments WHERE user_id = ? AND tx_id IN (SELECT id FROM transactions WHERE user_id = ? AND source = 'bank')").run(user.id, user.id);
    db.prepare("DELETE FROM transactions WHERE user_id = ? AND source = 'bank'").run(user.id);
    db.prepare("DELETE FROM accounts WHERE user_id = ? AND environment != 'manual'").run(user.id);
    db.prepare("DELETE FROM bank_connections WHERE user_id = ?").run(user.id);
  })();
}

/** Användarens eget angivna saldo (när ingen bank är ansluten). */
export function setManualBalance(userId: string, balanceOre: number): void {
  if (!Number.isInteger(balanceOre)) throw new BankError("other", bi("Ogiltigt belopp", "Invalid amount"));
  const db = getDb();
  const row = db.prepare("SELECT id FROM accounts WHERE user_id = ? AND environment = 'manual'").get(userId) as { id: string } | undefined;
  if (row) db.prepare("UPDATE accounts SET balance_ore = ?, balance_at = ?, selected = 1 WHERE id = ?").run(balanceOre, nowISO(), row.id);
  else db.prepare("INSERT INTO accounts (id, user_id, environment, name, type, selected, balance_ore, balance_kind, balance_at) VALUES (?,?,'manual','Eget saldo','spending',1,?,'available',?)").run(newId(), userId, balanceOre, nowISO());
}
