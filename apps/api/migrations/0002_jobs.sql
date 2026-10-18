-- Historique des générations : une copie dans D1 de ce que tient le Durable Object du compte (qui reste l'autorité : argent et état en cours).
-- Écrite à la création, puis à chaque fin (terminée, échouée, annulée). Sert à retrouver ses générations après un rechargement.
CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,                -- sub Clerk
  kind        TEXT NOT NULL,                -- image | video | audio | tryon | workflow
  model_id    TEXT NOT NULL,
  endpoint    TEXT,
  request_id  TEXT,                         -- identifiant de la demande chez fal
  status      TEXT NOT NULL,                -- IN_QUEUE | IN_PROGRESS | COMPLETED | FAILED | CANCELED
  cost        REAL NOT NULL,                -- jetons débités
  count       INTEGER NOT NULL DEFAULT 1,
  prompt      TEXT,                         -- texte envoyé (les plans d'une vidéo, séparés par « / »), 2 000 caractères au plus
  params      TEXT,                         -- JSON : résolution, format, durée…
  failure     TEXT,
  refund      REAL NOT NULL DEFAULT 0,      -- jetons rendus
  outputs     TEXT,                         -- JSON : fichiers produits
  created_at  INTEGER NOT NULL,
  started_at  INTEGER,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS jobs_user_created ON jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs (status) WHERE status IN ('IN_QUEUE', 'IN_PROGRESS');
