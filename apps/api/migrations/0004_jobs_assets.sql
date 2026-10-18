-- Générations et fichiers, copiés du Durable Object du compte (seul juge des générations et du solde) : historique, « Ma bibliothèque », support.
-- Identique au schéma déjà en production (base « yeleen ») : IF NOT EXISTS, sans effet là où les tables existent.
CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,          -- sub Clerk
  kind        TEXT NOT NULL,          -- image | video | audio | tryon | workflow
  model_id    TEXT NOT NULL,
  endpoint    TEXT,
  request_id  TEXT,                   -- identifiant de la demande chez fal
  status      TEXT NOT NULL,          -- IN_QUEUE | IN_PROGRESS | COMPLETED | FAILED | CANCELED
  cost        REAL NOT NULL,          -- jetons débités
  count       INTEGER NOT NULL DEFAULT 1,
  prompt      TEXT,                   -- texte envoyé (les plans d'une vidéo, séparés par « / »), 2 000 caractères au plus
  params      TEXT,                   -- JSON : résolution, format, durée…
  failure     TEXT,
  refund      REAL NOT NULL DEFAULT 0, -- jetons rendus
  outputs     TEXT,                   -- JSON : fichiers produits
  created_at  INTEGER NOT NULL,
  started_at  INTEGER,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS jobs_user_created ON jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs (status) WHERE status IN ('IN_QUEUE', 'IN_PROGRESS');

CREATE TABLE IF NOT EXISTS assets (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('image', 'video', 'audio')),
  source       TEXT NOT NULL CHECK (source IN ('upload', 'generated')),
  name         TEXT NOT NULL,
  r2_key       TEXT NOT NULL,
  content_type TEXT,
  bytes        INTEGER,
  width        INTEGER,
  height       INTEGER,
  secs         REAL,
  prompt       TEXT,
  model        TEXT,
  job_id       TEXT,                  -- génération d'origine (assets générés)
  idx          INTEGER,               -- rang de la sortie dans la génération
  created_at   INTEGER NOT NULL,
  deleted_at   INTEGER                -- suppression douce : le fichier est effacé plus tard
);
CREATE INDEX IF NOT EXISTS assets_user_created ON assets (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS assets_job_output ON assets (job_id, idx) WHERE job_id IS NOT NULL;
