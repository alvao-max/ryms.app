import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA } from "./schema";

type DB = Database.Database;
const g = globalThis as unknown as { __rymsDb?: DB };

export function dataDir(): string {
  return process.env.RYMS_DATA_DIR ? path.resolve(process.env.RYMS_DATA_DIR) : path.resolve(process.cwd(), "data");
}

export function getDb(): DB {
  if (g.__rymsDb) return g.__rymsDb;
  const file = process.env.RYMS_DB ?? path.join(dataDir(), "ryms.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  g.__rymsDb = db;
  return db;
}

/** Endast för tester. */
export function resetDbForTests(): void {
  g.__rymsDb?.close();
  g.__rymsDb = undefined;
}

export function newId(): string {
  return crypto.randomUUID();
}
