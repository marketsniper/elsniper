-- Migration 003 : les hôtels partenaires peuvent réserver des taxis
-- pour leurs clients. Une course appartient désormais soit à un compte
-- client (user_id), soit à un hôtel réservateur (hotel_id + coordonnées
-- du client transporté) — jamais les deux, jamais aucun.

BEGIN;

ALTER TABLE trips
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN hotel_id UUID REFERENCES hotels (id),
  ADD COLUMN client_name TEXT,
  ADD COLUMN client_phone TEXT;

ALTER TABLE trips
  ADD CONSTRAINT chk_trip_booker CHECK (
    (user_id IS NOT NULL AND hotel_id IS NULL) OR
    (hotel_id IS NOT NULL AND user_id IS NULL AND client_name IS NOT NULL AND client_phone IS NOT NULL)
  );

CREATE INDEX idx_trips_hotel ON trips (hotel_id) WHERE hotel_id IS NOT NULL;

COMMIT;
