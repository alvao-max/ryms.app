import { getDb, newId } from "../db";
import { bi } from "../i18n";
import { hashPassword, randomToken, sha256, verifyPassword } from "../crypto";
import { nowISO } from "../dates";

export interface User {
  id: string;
  email: string;
  name: string;
  is_demo: number;
  demo_group: string | null;
  demo_key: string | null;
  demo_label: string | null;
  onboarded: number;
  next_payday: string | null;
  ai_consent_at: string | null;
  created_at: string;
}

const COLS = "id, email, name, is_demo, demo_group, demo_key, demo_label, onboarded, next_payday, ai_consent_at, created_at";

export type BankEnv = "sandbox" | "live";
/** Vilken bankmiljö servern kör mot. Demo är aldrig en bankmiljö – den hör till demokonton. */
export function bankEnv(): BankEnv {
  return process.env.BANK_ENV === "production" ? "live" : "sandbox";
}
/** Datamiljöer som får räknas in för användaren. Demo, sandbox och skarp data blandas aldrig. */
export function envsFor(user: Pick<User, "is_demo">): string[] {
  return user.is_demo ? ["manual", "demo"] : ["manual", bankEnv()];
}

export function getUser(id: string): User | null {
  return (getDb().prepare(`SELECT ${COLS} FROM users WHERE id = ?`).get(id) as User | undefined) ?? null;
}

export class UserError extends Error {}

export function createUser(input: { email: string; password: string; name?: string; demo?: { group: string; key: string; label: string } }): User {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError(bi("Ange en giltig e-postadress.", "Enter a valid email address."));
  if (input.password.length < 8) throw new UserError(bi("Lösenordet behöver vara minst 8 tecken.", "The password needs at least 8 characters."));
  const db = getDb();
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) throw new UserError(bi("Det finns redan ett konto med den e-postadressen.", "An account with that email address already exists."));
  const id = newId();
  db.prepare(
    "INSERT INTO users (id, email, password_hash, name, created_at, is_demo, demo_group, demo_key, demo_label) VALUES (?,?,?,?,?,?,?,?,?)",
  ).run(id, email, hashPassword(input.password), input.name?.trim() ?? "", nowISO(), input.demo ? 1 : 0, input.demo?.group ?? null, input.demo?.key ?? null, input.demo?.label ?? null);
  return getUser(id)!;
}

export function authenticate(email: string, password: string): User | null {
  const row = getDb().prepare("SELECT id, password_hash, is_demo FROM users WHERE email = ?").get(email.trim().toLowerCase()) as
    | { id: string; password_hash: string; is_demo: number }
    | undefined;
  if (!row || row.is_demo) return null;
  return verifyPassword(password, row.password_hash) ? getUser(row.id) : null;
}

const SESSION_DAYS = 30;
export function createSession(userId: string): { token: string; expires: Date } {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  getDb().prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)").run(sha256(token), userId, expires.toISOString());
  return { token, expires };
}
export function userFromSessionToken(token: string | undefined | null): User | null {
  if (!token) return null;
  const row = getDb().prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?").get(sha256(token)) as { user_id: string; expires_at: string } | undefined;
  if (!row) return null;
  if (row.expires_at < nowISO()) {
    getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
    return null;
  }
  return getUser(row.user_id);
}
export function destroySession(token: string): void {
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}
/** Byter vilken användare en befintlig session pekar på (endast mellan demobudgetar i samma grupp). */
export function repointSession(token: string, userId: string): void {
  getDb().prepare("UPDATE sessions SET user_id = ? WHERE token_hash = ?").run(userId, sha256(token));
}

export function updateUser(userId: string, patch: Partial<Pick<User, "name" | "onboarded" | "next_payday" | "ai_consent_at">>): void {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (!keys.length) return;
  getDb()
    .prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
    .run(...keys.map((k) => patch[k] as string | number | null), userId);
}
