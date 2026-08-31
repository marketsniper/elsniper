-- LOCATION DE VÉHICULES — zanziGo intermédiaire entre le loueur et le client.
--
-- Même principe que les taxis, adapté à un catalogue plutôt qu'à une
-- dispatche : c'est L'ÉQUIPE qui saisit chaque véhicule (le loueur n'a pas de
-- compte), avec ses documents (assurance, road licence) et plusieurs photos —
-- de quoi faire une fiche complète. Le véhicule ne sort du statut « pending »
-- que lorsque l'équipe le VÉRIFIE, comme un dossier chauffeur ; seul un
-- véhicule vérifié, disponible et non archivé apparaît au client. La
-- réservation et le paiement se font dans l'app, avec une commission
-- zanziGo, comme une course.
CREATE TABLE rental_vehicles (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category                  TEXT NOT NULL,
  make                      TEXT NOT NULL,
  model                     TEXT NOT NULL,
  year                      SMALLINT,
  plate                     TEXT NOT NULL UNIQUE,
  seats                     SMALLINT,
  transmission              TEXT,
  description               TEXT,
  pickup_location            TEXT NOT NULL,
  -- Coordonnées du LOUEUR : pour l'équipe seule, jamais envoyées au client
  -- (zanziGo reste l'unique interlocuteur — c'est le sens de « intermédiaire »).
  loueur_name               TEXT NOT NULL,
  loueur_phone              TEXT NOT NULL,
  -- Prix posé directement par l'équipe (pas de grille automatique, comme un
  -- colis) : ce que le client paie par jour, et ce que zanziGo en retient.
  daily_price               NUMERIC(12,2) NOT NULL CHECK (daily_price >= 0),
  daily_commission          NUMERIC(12,2) NOT NULL CHECK (daily_commission >= 0),
  currency                  currency_code NOT NULL DEFAULT 'USD',
  insurance_document_url    TEXT NOT NULL,
  insurance_expires_on      DATE,
  road_licence_document_url TEXT NOT NULL,
  road_licence_expires_on   DATE,
  verification_status       verification_status NOT NULL DEFAULT 'pending',
  available                 BOOLEAN NOT NULL DEFAULT true,
  archived_at               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_rental_commission_leq_price CHECK (daily_commission <= daily_price)
);

CREATE INDEX idx_rental_vehicles_catalogue
  ON rental_vehicles (created_at DESC)
  WHERE verification_status = 'verified' AND available = true AND archived_at IS NULL;

CREATE TRIGGER trg_rental_vehicles_updated_at
  BEFORE UPDATE ON rental_vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- PLUSIEURS PHOTOS par véhicule — « une belle description complète » ne tient
-- pas dans une colonne unique comme vehicle_photo_url chez un chauffeur.
CREATE TABLE rental_vehicle_photos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES rental_vehicles (id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  position   SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rental_vehicle_photos_vehicle
  ON rental_vehicle_photos (vehicle_id, position);

-- LA RÉSERVATION : mêmes deux horodatages que ride_bookings (paid_at /
-- cancelled_at) plutôt qu'un statut à états — pas de dispatche à suivre ici,
-- juste « payée ou non » et « annulée ou non ».
CREATE TABLE rental_bookings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id   UUID NOT NULL REFERENCES rental_vehicles (id),
  user_id      UUID NOT NULL REFERENCES users (id),
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  days         SMALLINT NOT NULL CHECK (days >= 1),
  price        NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  commission   NUMERIC(12,2) NOT NULL CHECK (commission >= 0),
  currency     currency_code NOT NULL,
  paid_at      TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_rental_dates CHECK (end_date >= start_date)
);

CREATE INDEX idx_rental_bookings_vehicle ON rental_bookings (vehicle_id);
CREATE INDEX idx_rental_bookings_user ON rental_bookings (user_id);
-- Vérification de chevauchement de dates : seules les réservations vivantes
-- (ni annulées) comptent, payées ou non — une réservation non payée bloque
-- aussi les dates le temps qu'elle expire ou se règle.
CREATE INDEX idx_rental_bookings_dates
  ON rental_bookings (vehicle_id, start_date, end_date)
  WHERE cancelled_at IS NULL;

-- LE PAIEMENT — même moteur que les courses, les colis et les places de taxi
-- partagé : la cible devient une des QUATRE (exactement une).
ALTER TABLE payments
  ADD COLUMN rental_booking_id UUID REFERENCES rental_bookings (id);

ALTER TABLE payments DROP CONSTRAINT chk_payment_target;
ALTER TABLE payments ADD CONSTRAINT chk_payment_target CHECK (
  (trip_id IS NOT NULL)::int + (package_id IS NOT NULL)::int +
  (ride_booking_id IS NOT NULL)::int + (rental_booking_id IS NOT NULL)::int = 1
);

CREATE INDEX idx_payments_rental_booking
  ON payments (rental_booking_id) WHERE rental_booking_id IS NOT NULL;
