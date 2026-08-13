-- Pack d'améliorations : numéro de vol, aller-retour, options véhicule,
-- pourboire, parrainage, expiration des documents chauffeurs, liste
-- d'attente du taxi partagé.

-- Courses : transfert aéroport avec n° de vol, aller-retour avec attente
-- (prix ×1,8 figé à la création), options véhicule, pourboire (100 % au
-- chauffeur, enregistré à la notation).
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS flight_number   TEXT,
  ADD COLUMN IF NOT EXISTS round_trip      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS baby_seat       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bulky_luggage   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tip_amount      NUMERIC(12,2);

-- Parrainage : chaque client reçoit un code court (ZG-XXXXXX, dérivé de son
-- id) ; le compte parrainé garde la trace de son parrain.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_code       TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by_user_id UUID REFERENCES users(id);

UPDATE users
SET referral_code = 'ZG-' || upper(substr(replace(id::text, '-', ''), 1, 6))
WHERE referral_code IS NULL;

-- Chauffeurs : parrainage + dates d'expiration des documents (renseignées
-- par l'équipe à la validation) + garde-fou anti-doublon de notification.
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS referred_by_user_id  UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS license_expires_on   DATE,
  ADD COLUMN IF NOT EXISTS insurance_expires_on DATE,
  ADD COLUMN IF NOT EXISTS expiry_notified_at   TIMESTAMPTZ;

-- Liste d'attente du taxi partagé : un client laisse sa demande quand aucun
-- taxi partagé n'est annoncé sur son trajet ; l'équipe est prévenue quand
-- une annonce correspondante est publiée.
CREATE TABLE IF NOT EXISTS ride_waitlist (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id),
  hotel_id     UUID REFERENCES hotels(id),
  origin       TEXT NOT NULL,
  destination  TEXT NOT NULL,
  desired_date DATE,
  seats        INTEGER NOT NULL DEFAULT 1 CHECK (seats BETWEEN 1 AND 8),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  matched_at   TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  CHECK (user_id IS NOT NULL OR hotel_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_ride_waitlist_open
  ON ride_waitlist (origin, destination)
  WHERE matched_at IS NULL AND cancelled_at IS NULL;
