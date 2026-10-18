-- Bibliothèque Yeleen (personnages, objets, vidéos proposés à tous) et favoris des utilisateurs, dans les deux bibliothèques.
-- Identique au schéma déjà en production (base « yeleen ») : IF NOT EXISTS, sans effet là où les tables existent.
CREATE TABLE IF NOT EXISTS catalog_items (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('image', 'video')),
  category    TEXT NOT NULL CHECK (category IN ('character', 'object', 'video')),
  name        TEXT NOT NULL,
  url         TEXT,                   -- adresse du fichier (R2 derrière le CDN, ou autre)
  secs        REAL,                   -- durée d'une vidéo
  art         TEXT,                   -- JSON : exemple fabriqué (placeholder)
  seed        INTEGER,
  placeholder INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0,
  published   INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS catalog_published ON catalog_items (published, sort);

CREATE TABLE IF NOT EXISTS favorites (
  user_id    TEXT NOT NULL,
  scope      TEXT NOT NULL CHECK (scope IN ('mine', 'yeleen')),
  item_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, scope, item_id)
);
