-- LE LIEU DE REMISE CHOISI PAR LE CLIENT (demande du 31/08/2026 : « il faut
-- que le client puisse mettre l'endroit où il voudra récupérer son
-- véhicule »). Optionnel : à défaut, la remise se fait au lieu de retrait de
-- la fiche du véhicule (rental_vehicles.pickup_location) — celui que l'équipe
-- a convenu avec le loueur.
ALTER TABLE rental_bookings ADD COLUMN IF NOT EXISTS pickup_location TEXT;
