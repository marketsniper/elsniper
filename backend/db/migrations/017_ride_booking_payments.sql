-- Paiement des PLACES de taxi partagé : chaque réservation de place crée
-- désormais un paiement en attente (montant = places × prix dans la devise
-- du client), visible et validable dans le tableau de bord équipe — comme
-- les courses privées et les colis.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS ride_booking_id UUID REFERENCES ride_bookings (id);

-- La cible d'un paiement devient : course OU colis OU réservation de place —
-- exactement une des trois.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS chk_payment_target;
ALTER TABLE payments ADD CONSTRAINT chk_payment_target CHECK (
  (trip_id IS NOT NULL)::int + (package_id IS NOT NULL)::int + (ride_booking_id IS NOT NULL)::int = 1
);

-- Réservation soldée : horodatage posé quand l'équipe confirme le paiement.
ALTER TABLE ride_bookings
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
