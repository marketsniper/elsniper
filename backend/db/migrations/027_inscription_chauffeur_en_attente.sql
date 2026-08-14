-- Un chauffeur choisit son numéro et son mot de passe, puis doit photographier
-- son permis, son assurance et son véhicule. S'il ferme l'application entre les
-- deux (le cas le plus fréquent : il part chercher ses papiers), son mot de
-- passe n'existait nulle part — il ne pouvait plus se reconnecter.
-- Cette table garde l'inscription en attente jusqu'au dépôt du dossier.
CREATE TABLE IF NOT EXISTS driver_signups (
  phone TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
