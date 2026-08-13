-- Réservations de places NON PAYÉES : un client a 5 minutes pour régler sa
-- place de taxi partagé. Passé ce délai, la réservation est annulée
-- automatiquement et les places retournent sur l'annonce du chauffeur.
ALTER TABLE ride_bookings
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
