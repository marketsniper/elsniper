-- Généralisation du MOT DE PASSE : après les visiteurs (021), les
-- CHAUFFEURS s'identifient aussi par numéro + mot de passe choisi (fini le
-- code SMS). Les locaux utilisent la colonne users.password_hash déjà en
-- place. Le hash n'est jamais renvoyé par l'API.
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS password_hash TEXT;
