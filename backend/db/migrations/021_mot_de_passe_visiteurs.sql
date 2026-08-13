-- Identification des TOURISTES/VISITEURS par téléphone + MOT DE PASSE choisi
-- par le client (comme les hôtels) : aucun code SMS ni e-mail à recevoir —
-- ça marche partout dans le monde. Le hash n'est jamais renvoyé par l'API.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
