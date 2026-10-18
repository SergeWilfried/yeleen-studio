-- Utilisateurs : une ligne par compte Clerk, créée à la première requête authentifiée.
-- `id` est le champ `sub` du jeton de session (« user_… ») : le même identifiant que le Durable Object du compte (portefeuille, générations).
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  created_at   INTEGER NOT NULL,   -- millisecondes
  last_seen_at INTEGER NOT NULL,   -- mis à jour au plus toutes les 10 minutes
  email        TEXT,               -- seulement si le jeton le porte (réglage « session token » de Clerk), sinon NULL
  name         TEXT,
  country      TEXT,               -- pays (code ISO) à la première connexion, d'après Cloudflare
  welcomed_at  INTEGER             -- crédit de bienvenue accordé (WELCOME_JETONS), sinon NULL
);
CREATE INDEX IF NOT EXISTS users_created_at ON users (created_at);
