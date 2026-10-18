-- Bibliothèque Yeleen : personnages, objets (vus en images : rendus 3D sur fond transparent) et vidéos proposés à tous les utilisateurs.
-- Modifiable sans déploiement : INSERT ou UPDATE ici (ou un outil d'administration plus tard). `url` renseignée = vrai fichier ; sinon `art` :
-- exemple fabriqué par l'application (placeholder = 1, étiqueté « Exemple » dans l'interface).
CREATE TABLE IF NOT EXISTS catalog_items (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('image', 'video')),
  category    TEXT NOT NULL CHECK (category IN ('character', 'object', 'video')),
  name        TEXT NOT NULL,
  url         TEXT,                         -- adresse du fichier (R2 derrière le CDN, ou autre)
  secs        REAL,                         -- durée d'une vidéo
  art         TEXT,                         -- JSON : exemple fabriqué (placeholder)
  seed        INTEGER,
  placeholder INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0,
  published   INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS catalog_published ON catalog_items (published, sort);

INSERT OR IGNORE INTO catalog_items (id, kind, category, name, secs, art, seed, placeholder, sort, published, created_at) VALUES
  ('perso-1', 'image', 'character', 'Exploratrice', NULL, '{"palette": "image", "index": 1}', 0, 1, 0, 1, 0),
  ('perso-2', 'image', 'character', 'Commerçant du marché', NULL, '{"palette": "image", "index": 2}', 0, 1, 1, 1, 0),
  ('perso-3', 'image', 'character', 'Étudiante', NULL, '{"palette": "image", "index": 3}', 0, 1, 2, 1, 0),
  ('perso-4', 'image', 'character', 'Cheffe cuisinière', NULL, '{"palette": "image", "index": 4}', 0, 1, 3, 1, 0),
  ('perso-5', 'image', 'character', 'Musicien', NULL, '{"palette": "image", "index": 5}', 0, 1, 4, 1, 0),
  ('perso-6', 'image', 'character', 'Aînée du village', NULL, '{"palette": "image", "index": 6}', 0, 1, 5, 1, 0),
  ('objet-1', 'image', 'object', 'Lanterne', NULL, '{"palette": "image", "index": 7}', 0, 1, 10, 1, 0),
  ('objet-2', 'image', 'object', 'Valise en cuir', NULL, '{"palette": "image", "index": 8}', 0, 1, 11, 1, 0),
  ('objet-3', 'image', 'object', 'Théière', NULL, '{"palette": "image", "index": 9}', 0, 1, 12, 1, 0),
  ('objet-4', 'image', 'object', 'Mobylette', NULL, '{"palette": "image", "index": 10}', 0, 1, 13, 1, 0),
  ('objet-5', 'image', 'object', 'Radio à lampes', NULL, '{"palette": "image", "index": 11}', 0, 1, 14, 1, 0),
  ('objet-6', 'image', 'object', 'Ballon de football', NULL, '{"palette": "image", "index": 12}', 0, 1, 15, 1, 0),
  ('video-1', 'video', 'video', 'Village à l’aube', 8, '{"palette": "video", "index": 2}', 100, 1, 20, 1, 0),
  ('video-2', 'video', 'video', 'Marché animé', 6, '{"palette": "video", "index": 3}', 137, 1, 21, 1, 0),
  ('video-3', 'video', 'video', 'Pluie sur la ville', 10, '{"palette": "video", "index": 4}', 174, 1, 22, 1, 0);
