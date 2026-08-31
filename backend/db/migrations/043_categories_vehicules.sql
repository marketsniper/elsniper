-- CATÉGORIES FIGÉES DE LOCATION — le client doit pouvoir FILTRER par
-- catégorie (voiture de tourisme, 4x4, véhicule de luxe, scooter, moto,
-- enduro) : un texte libre saisi par l'équipe ne garantit pas un filtre
-- fiable (« SUV » un jour, « Suv » le lendemain). Même principe que
-- package_size pour les colis (migration 009) : un type fermé plutôt qu'une
-- colonne TEXT.
CREATE TYPE rental_vehicle_category AS ENUM (
  'tourisme', '4x4', 'luxe', 'scooter', 'moto', 'enduro'
);

-- Une catégorie saisie en texte libre avant ce verrou (essai, démo) et qui ne
-- correspond à aucune des six ci-dessus retombe sur 'tourisme' plutôt que de
-- faire échouer la migration : mieux vaut une catégorie approximative qu'un
-- déploiement bloqué.
UPDATE rental_vehicles
   SET category = 'tourisme'
 WHERE category NOT IN ('tourisme', '4x4', 'luxe', 'scooter', 'moto', 'enduro');

ALTER TABLE rental_vehicles
  ALTER COLUMN category TYPE rental_vehicle_category USING category::rental_vehicle_category;
