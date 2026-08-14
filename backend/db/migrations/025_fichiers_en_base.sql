-- Documents (permis, assurance, photo véhicule, carte NIDA) stockés EN BASE.
--
-- Pourquoi : sans stockage S3 configuré, les fichiers étaient écrits sur le
-- disque du serveur — or ce disque est REMIS À ZÉRO à chaque déploiement
-- (les documents disparaissaient) et l'URL renvoyée pointait sur
-- « localhost », donc impossible à ouvrir depuis un téléphone.
-- La base, elle, est persistante : les documents y survivent.
CREATE TABLE IF NOT EXISTS uploaded_files (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mime_type  TEXT NOT NULL,
  size       INTEGER NOT NULL,
  data       BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
