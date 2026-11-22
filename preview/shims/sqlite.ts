// better-sqlite3-kompatibelt skal runt sql.js (SQLite i webbläsaren, bara i minnet).
type SqlJsDb = {
  prepare(sql: string): { bind(p: unknown[]): void; step(): boolean; getAsObject(): Record<string, unknown>; free(): void };
  run(sql: string, p?: unknown[]): void;
  exec(sql: string): void;
  getRowsModified(): number;
  close(): void;
};
let SQL: { Database: new () => SqlJsDb } | null = null;
export function setSqlModule(m: unknown) {
  SQL = m as typeof SQL;
}
const norm = (p: unknown[]) => p.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v));

export default class Database {
  private db: SqlJsDb;
  private depth = 0;
  constructor() {
    if (!SQL) throw new Error("sql.js är inte laddat");
    this.db = new SQL.Database();
  }
  pragma() {}
  exec(sql: string) {
    this.db.exec(sql);
  }
  close() {
    this.db.close();
  }
  prepare(sql: string) {
    const db = this.db;
    const rows = (params: unknown[], first: boolean) => {
      const st = db.prepare(sql);
      try {
        st.bind(norm(params));
        const out: Record<string, unknown>[] = [];
        while (st.step()) {
          out.push(st.getAsObject());
          if (first) break;
        }
        return out;
      } finally {
        st.free();
      }
    };
    return {
      get: (...p: unknown[]) => rows(p, true)[0],
      all: (...p: unknown[]) => rows(p, false),
      run: (...p: unknown[]) => {
        db.run(sql, norm(p));
        return { changes: db.getRowsModified() };
      },
    };
  }
  transaction<A extends unknown[], R>(fn: (...a: A) => R) {
    return (...a: A): R => {
      const name = `sp${this.depth++}`;
      this.db.exec(`SAVEPOINT ${name}`);
      try {
        const r = fn(...a);
        this.db.exec(`RELEASE ${name}`);
        return r;
      } catch (e) {
        this.db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
        throw e;
      } finally {
        this.depth--;
      }
    };
  }
}
