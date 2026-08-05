-- zanziGo — schéma initial (MVP)
-- 7 tables : users, drivers, hotels, trips, packages, payments, driver_monthly_stats
-- Principes : ENUMs natifs pour les statuts, contraintes CHECK pour les invariants
-- critiques, prix figés à la création, updated_at automatique par trigger.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Types ENUM
-- ---------------------------------------------------------------------------

CREATE TYPE account_type AS ENUM ('tourist', 'resident');
CREATE TYPE currency_code AS ENUM ('USD', 'TZS');
CREATE TYPE verification_status AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE trip_type AS ENUM ('private', 'shared_tourist', 'shared_local', 'posted_return');
CREATE TYPE trip_status AS ENUM ('requested', 'driver_confirmed', 'paid', 'in_progress', 'completed', 'cancelled');
CREATE TYPE package_status AS ENUM ('created', 'paid', 'picked_up', 'delivered', 'cancelled');
CREATE TYPE sender_type AS ENUM ('user', 'hotel');
CREATE TYPE payment_status AS ENUM ('pending', 'confirmed', 'failed');

-- ---------------------------------------------------------------------------
-- Trigger updated_at
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- users — touristes et résidents
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           TEXT NOT NULL,
  phone               TEXT NOT NULL UNIQUE,
  email               TEXT,
  account_type        account_type NOT NULL,
  -- Déterminée par account_type : tourist -> USD, resident -> TZS
  currency            currency_code NOT NULL,
  -- Un touriste est 'verified' d'office (aucun document requis).
  -- Un résident reste 'pending' tant que l'équipe n'a pas validé son document.
  verification_status verification_status NOT NULL DEFAULT 'pending',
  id_document_url     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un résident doit fournir un document d'identité à l'inscription.
  CONSTRAINT chk_resident_document CHECK (
    account_type <> 'resident' OR id_document_url IS NOT NULL
  )
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- drivers — Taxi Partners
-- ---------------------------------------------------------------------------

CREATE TABLE drivers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name            TEXT NOT NULL,
  phone                TEXT NOT NULL UNIQUE,
  license_number       TEXT NOT NULL,
  vehicle_plate        TEXT NOT NULL UNIQUE,
  vehicle_model        TEXT,
  zone                 TEXT NOT NULL,
  available            BOOLEAN NOT NULL DEFAULT true,
  verification_status  verification_status NOT NULL DEFAULT 'pending',
  -- Généré une seule fois, à la validation du chauffeur. Ne change plus jamais.
  vehicle_qr_code      TEXT UNIQUE,
  license_document_url TEXT NOT NULL,
  id_document_url      TEXT NOT NULL,
  rating_avg           NUMERIC(3,2),
  rating_count         INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un chauffeur validé a forcément son QR véhicule.
  CONSTRAINT chk_verified_has_qr CHECK (
    verification_status <> 'verified' OR vehicle_qr_code IS NOT NULL
  )
);

CREATE INDEX idx_drivers_zone_available
  ON drivers (zone, available)
  WHERE verification_status = 'verified';

CREATE TRIGGER trg_drivers_updated_at
  BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- hotels — partenaires logistiques
-- ---------------------------------------------------------------------------

CREATE TABLE hotels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  phone        TEXT NOT NULL UNIQUE,
  zone         TEXT NOT NULL,
  address      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_hotels_updated_at
  BEFORE UPDATE ON hotels
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- trips — une course, quel que soit son type
-- ---------------------------------------------------------------------------

CREATE TABLE trips (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users (id),
  driver_id        UUID REFERENCES drivers (id),
  trip_type        trip_type NOT NULL,
  status           trip_status NOT NULL DEFAULT 'requested',
  pickup_location  TEXT NOT NULL,
  dropoff_location TEXT NOT NULL,
  scheduled_at     TIMESTAMPTZ,
  -- Prix et commission figés au moment de la création : si la grille tarifaire
  -- change plus tard, l'historique reste fidèle au prix réellement payé.
  price            NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  commission       NUMERIC(12,2) NOT NULL CHECK (commission >= 0),
  currency         currency_code NOT NULL,
  whatsapp_link    TEXT,
  rating           SMALLINT CHECK (rating BETWEEN 1 AND 5),
  rating_comment   TEXT,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Une course confirmée (et au-delà) a forcément un chauffeur.
  CONSTRAINT chk_confirmed_has_driver CHECK (
    status IN ('requested', 'cancelled') OR driver_id IS NOT NULL
  )
);

CREATE INDEX idx_trips_user ON trips (user_id, created_at DESC);
CREATE INDEX idx_trips_driver ON trips (driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX idx_trips_status ON trips (status);

CREATE TRIGGER trg_trips_updated_at
  BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- packages — un colis
-- ---------------------------------------------------------------------------

CREATE TABLE packages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_type        sender_type NOT NULL,
  sender_user_id     UUID REFERENCES users (id),
  sender_hotel_id    UUID REFERENCES hotels (id),
  driver_id          UUID REFERENCES drivers (id),
  -- QR unique par colis, généré à la création (contrairement au QR véhicule fixe).
  qr_code            TEXT NOT NULL UNIQUE,
  status             package_status NOT NULL DEFAULT 'created',
  pickup_location    TEXT NOT NULL,
  dropoff_location   TEXT NOT NULL,
  recipient_name     TEXT NOT NULL,
  recipient_phone    TEXT NOT NULL,
  description        TEXT,
  price              NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  commission         NUMERIC(12,2) NOT NULL CHECK (commission >= 0),
  currency           currency_code NOT NULL,
  pickup_photo_url   TEXT,
  delivery_photo_url TEXT,
  picked_up_at       TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- L'expéditeur est soit un user, soit un hôtel — jamais les deux, jamais aucun.
  CONSTRAINT chk_sender_reference CHECK (
    (sender_type = 'user'  AND sender_user_id IS NOT NULL AND sender_hotel_id IS NULL) OR
    (sender_type = 'hotel' AND sender_hotel_id IS NOT NULL AND sender_user_id IS NULL)
  )
);

CREATE INDEX idx_packages_sender_user ON packages (sender_user_id) WHERE sender_user_id IS NOT NULL;
CREATE INDEX idx_packages_sender_hotel ON packages (sender_hotel_id) WHERE sender_hotel_id IS NOT NULL;
CREATE INDEX idx_packages_status ON packages (status);

CREATE TRIGGER trg_packages_updated_at
  BEFORE UPDATE ON packages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- payments — lien de paiement Pesapal + statut
-- ---------------------------------------------------------------------------

CREATE TABLE payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id           UUID REFERENCES trips (id),
  package_id        UUID REFERENCES packages (id),
  amount            NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency          currency_code NOT NULL,
  status            payment_status NOT NULL DEFAULT 'pending',
  pesapal_reference TEXT,
  payment_link      TEXT,
  confirmed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un paiement cible soit un trip, soit un package — jamais les deux.
  CONSTRAINT chk_payment_target CHECK (
    (trip_id IS NOT NULL AND package_id IS NULL) OR
    (package_id IS NOT NULL AND trip_id IS NULL)
  )
);

CREATE INDEX idx_payments_trip ON payments (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX idx_payments_package ON payments (package_id) WHERE package_id IS NOT NULL;

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- driver_monthly_stats — programme de fidélité mensuel
-- ---------------------------------------------------------------------------

CREATE TABLE driver_monthly_stats (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id            UUID NOT NULL REFERENCES drivers (id),
  -- Premier jour du mois concerné (ex: 2026-08-01).
  month                DATE NOT NULL,
  trips_completed      INTEGER NOT NULL DEFAULT 0,
  rating_avg           NUMERIC(3,2),
  late_count           INTEGER NOT NULL DEFAULT 0,
  driver_of_the_month  BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_driver_month UNIQUE (driver_id, month),
  CONSTRAINT chk_month_is_first_day CHECK (month = date_trunc('month', month)::date)
);

CREATE TRIGGER trg_driver_monthly_stats_updated_at
  BEFORE UPDATE ON driver_monthly_stats
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
