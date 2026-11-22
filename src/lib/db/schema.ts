/** Alla tabeller med användardata har user_id och raderas kaskadvis med användaren. */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  demo_group TEXT,
  demo_key TEXT,
  demo_label TEXT,
  onboarded INTEGER NOT NULL DEFAULT 0,
  next_payday TEXT,
  ai_consent_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'dot',
  sort INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  match_text TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL DEFAULT 'out' CHECK (direction IN ('out','in'))
);
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_ore INTEGER NOT NULL DEFAULT 0,
  start_ore INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
-- Manadsplanen. scope='template' galler fran och med month tills en nyare mall finns.
-- scope='month' galler bara just den manaden och gar fore mallen.
CREATE TABLE IF NOT EXISTS plan_values (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('category','bill','income','saving')),
  ref_id TEXT NOT NULL,
  month TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('template','month')),
  amount_ore INTEGER NOT NULL DEFAULT 0,
  day INTEGER,
  removed INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, kind, ref_id, month, scope)
);
CREATE TABLE IF NOT EXISTS planned_purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_id TEXT NOT NULL,
  max_ore INTEGER NOT NULL,
  month TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','bought','cancelled')),
  tx_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bill_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bill_id TEXT NOT NULL,
  month TEXT NOT NULL,
  paid_date TEXT NOT NULL,
  tx_id TEXT,
  UNIQUE (user_id, bill_id, month)
);
CREATE TABLE IF NOT EXISTS bank_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('demo','sandbox','live')),
  provider TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  bank_country TEXT NOT NULL DEFAULT 'SE',
  status TEXT NOT NULL CHECK (status IN ('pending','active','expired','error','disconnected')),
  session_enc TEXT,
  state_hash TEXT,
  consent_expires_at TEXT,
  last_sync_at TEXT,
  last_sync_error TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id TEXT REFERENCES bank_connections(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('manual','demo','sandbox','live')),
  external_id TEXT,
  stable_key TEXT,
  name TEXT NOT NULL,
  number_masked TEXT,
  type TEXT NOT NULL DEFAULT 'spending' CHECK (type IN ('spending','savings')),
  selected INTEGER NOT NULL DEFAULT 0,
  balance_ore INTEGER,
  balance_kind TEXT NOT NULL DEFAULT 'available',
  balance_at TEXT
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('manual','bank')),
  environment TEXT NOT NULL,
  external_id TEXT,
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('pending','booked')),
  amount_ore INTEGER NOT NULL,
  date TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  item_name TEXT,
  category_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('expense','income','refund','transfer','saving')),
  goal_id TEXT,
  planned_purchase_id TEXT,
  bill_id TEXT,
  merged_into TEXT,
  match_hold INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (account_id, external_id)
);
CREATE INDEX IF NOT EXISTS tx_user_date ON transactions (user_id, date);
CREATE TABLE IF NOT EXISTS match_candidates (
  bank_tx_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  manual_tx_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (bank_tx_id, manual_tx_id)
);
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  price_ore INTEGER NOT NULL,
  category_id TEXT,
  planned_purchase_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('saved','bought','skipped')),
  source TEXT NOT NULL DEFAULT 'manual',
  image_id TEXT,
  tx_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;
