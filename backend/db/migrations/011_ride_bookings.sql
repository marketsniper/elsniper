-- Réservations de places sur les trajets partagés postés par les chauffeurs :
-- la réservation dans l'app décrémente automatiquement les places restantes
-- de l'annonce (décompte atomique côté route), et cette table garde la trace
-- de qui a réservé combien de places.
CREATE TABLE IF NOT EXISTS ride_bookings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id    UUID NOT NULL REFERENCES posted_rides(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id),
  hotel_id   UUID REFERENCES hotels(id),
  seats      SMALLINT NOT NULL CHECK (seats BETWEEN 1 AND 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_ride_booking_booker CHECK (user_id IS NOT NULL OR hotel_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_ride_bookings_ride ON ride_bookings(ride_id);
