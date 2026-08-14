-- Identification simplifiée des clients : un IDENTIFIANT choisi
-- (ex. « amina2026 ») + mot de passe, au lieu de l'indicatif + numéro de
-- téléphone qui embrouillait touristes et locaux.
--
-- Le téléphone reste utile (contact du chauffeur) mais devient un simple
-- renseignement du profil : les comptes existants continuent de se
-- connecter avec leur numéro, les nouveaux avec leur identifiant.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username TEXT;

-- Unicité insensible à la casse : « Amina » et « amina » sont le même
-- identifiant (personne ne doit pouvoir usurper un compte à la casse près).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique
  ON users (lower(username))
  WHERE username IS NOT NULL;
