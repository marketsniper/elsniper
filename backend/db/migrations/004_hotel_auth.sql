-- Migration 004 : les hôtels partenaires s'authentifient par
-- email + mot de passe (et non plus par téléphone/OTP).
-- Le téléphone reste stocké : c'est le contact WhatsApp de l'établissement.

BEGIN;

ALTER TABLE hotels
  ADD COLUMN email TEXT,
  ADD COLUMN password_hash TEXT;

CREATE UNIQUE INDEX uq_hotels_email ON hotels (lower(email)) WHERE email IS NOT NULL;

COMMIT;
