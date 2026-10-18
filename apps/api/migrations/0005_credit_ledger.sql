-- Journal des mouvements de jetons : une ligne par débit, remboursement ou crédit. Le Durable Object du compte reste l'autorité (il garde le solde
-- et la liste de ses opérations) ; ce journal en est une copie pour l'historique de l'utilisateur, les rapports et le contrôle (voir ledger.js).
-- Append-only : on n'efface ni ne modifie jamais une ligne ; une correction est une nouvelle ligne.
CREATE TABLE IF NOT EXISTS credit_ledger (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('debit', 'refund', 'credit')),
  reason        TEXT,                    -- credit : welcome | purchase | dev-seed ; debit et refund : NULL
  amount        REAL NOT NULL,           -- avec signe : débit négatif, remboursement et crédit positifs
  balance_after REAL NOT NULL,           -- solde du compte juste après le mouvement
  ref           TEXT NOT NULL,           -- clé d'idempotence, la même que celle du Durable Object : debit:<job> | refund:<job> | credit:<paiement>
  job_id        TEXT,
  payment_id    TEXT,
  created_at    INTEGER NOT NULL         -- millisecondes
);
-- Un mouvement n'entre qu'une fois, même si on tente de l'enregistrer de nouveau (nouvel essai, passage du contrôle).
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_ref ON credit_ledger (user_id, ref);
CREATE INDEX IF NOT EXISTS credit_ledger_user ON credit_ledger (user_id, id DESC);
