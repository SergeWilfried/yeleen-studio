-- Bibliothèque de l'utilisateur (« Ma bibliothèque ») : ce qu'il a importé et ce qu'il a généré. Les fichiers sont dans R2 (`r2_key`).
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
  job_id       TEXT,                        -- génération d'origine (assets générés)
  idx          INTEGER,                     -- rang de la sortie dans la génération
  created_at   INTEGER NOT NULL,
  deleted_at   INTEGER                      -- suppression douce : le fichier est effacé plus tard
);
CREATE INDEX IF NOT EXISTS assets_user_created ON assets (user_id, created_at DESC);
-- Une sortie de génération n'entre qu'une fois dans la bibliothèque, même si la fin de la génération est constatée plusieurs fois.
CREATE UNIQUE INDEX IF NOT EXISTS assets_job_output ON assets (job_id, idx) WHERE job_id IS NOT NULL;

-- Favoris des deux bibliothèques : `mine` (un asset de l'utilisateur) ou `yeleen` (un élément du catalogue).
CREATE TABLE IF NOT EXISTS favorites (
  user_id    TEXT NOT NULL,
  scope      TEXT NOT NULL CHECK (scope IN ('mine', 'yeleen')),
  item_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, scope, item_id)
);
