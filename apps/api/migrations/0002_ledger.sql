-- Grand livre des jetons : une ligne par débit, remboursement ou crédit (recharge, bienvenue). Copie, pour l'analyse et le rapprochement,
-- de ce qu'a décidé le Durable Object du compte, seul écrivain du solde. La clé (compte, nature, référence) rend chaque copie idempotente.
CREATE TABLE IF NOT EXISTS ledger (
  account TEXT NOT NULL,              -- `sub` Clerk, comme users.id
  kind    TEXT NOT NULL CHECK (kind IN ('debit', 'refund', 'credit')),
  ref     TEXT NOT NULL,              -- génération (débit, remboursement) ou paiement (« yl_… », « welcome », « dev-seed »)
  delta   REAL NOT NULL,              -- jetons : négatif pour un débit
  balance REAL,                       -- solde juste après ; NULL pour les lignes reprises de l'historique
  at      INTEGER NOT NULL,           -- millisecondes
  PRIMARY KEY (account, kind, ref)
);
CREATE INDEX IF NOT EXISTS ledger_account_at ON ledger (account, at);
CREATE INDEX IF NOT EXISTS ledger_at ON ledger (at);
