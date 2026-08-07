-- Migration 005 : trajets partagés postés par les chauffeurs.
-- Un chauffeur validé publie son prochain trajet (itinéraire, heure de
-- départ, places disponibles, prix par place). Les clients consultent la
-- liste et réservent une place via l'équipe zanziGo (humain dans la
-- boucle, comme le reste du MVP).

BEGIN;

CREATE TYPE ride_status AS ENUM ('open', 'closed', 'cancelled');

CREATE TABLE posted_rides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       UUID NOT NULL REFERENCES drivers (id),
  origin          TEXT NOT NULL,
  destination     TEXT NOT NULL,
  departure_at    TIMESTAMPTZ NOT NULL,
  seats_total     SMALLINT NOT NULL CHECK (seats_total BETWEEN 1 AND 8),
  seats_available SMALLINT NOT NULL CHECK (seats_available >= 0),
  price_per_seat  NUMERIC(12,2) NOT NULL CHECK (price_per_seat >= 0),
  currency        currency_code NOT NULL DEFAULT 'TZS',
  notes           TEXT,
  status          ride_status NOT NULL DEFAULT 'open',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_seats_available_max CHECK (seats_available <= seats_total)
);

CREATE INDEX idx_rides_upcoming ON posted_rides (departure_at) WHERE status = 'open';
CREATE INDEX idx_rides_driver ON posted_rides (driver_id, departure_at DESC);

CREATE TRIGGER trg_posted_rides_updated_at
  BEFORE UPDATE ON posted_rides
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
