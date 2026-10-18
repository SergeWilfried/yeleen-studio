-- Recharges Mobile Money (paygate), copiées du Durable Object du compte : rapports, rapprochement quotidien avec paygate, support.
CREATE TABLE IF NOT EXISTS topups (
  reference    TEXT PRIMARY KEY,      -- « yl_… », la référence envoyée à paygate
  account      TEXT NOT NULL,
  pack         TEXT NOT NULL,
  amount_fcfa  INTEGER NOT NULL,
  jetons       REAL NOT NULL,
  country      TEXT,
  operator     TEXT,
  phone        TEXT,                  -- E.164 du payeur
  status       TEXT NOT NULL,         -- pending, awaiting_code, processing, completed, failed, expired
  failure      TEXT,
  late         INTEGER NOT NULL DEFAULT 0,
  paygate_id   TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS topups_account_created ON topups (account, created_at);
CREATE INDEX IF NOT EXISTS topups_status_updated ON topups (status, updated_at);
