-- RADIATION DÉFINITIVE d'un chauffeur.
-- « Refuser » (verification_status = 'rejected') garde le chauffeur dans la
-- base et bloque son numéro : il ne pouvait plus jamais se réinscrire.
-- Ici, la radiation archive la fiche : elle disparaît de toutes les listes,
-- ses courses passées restent dans les comptes, et son numéro comme sa
-- plaque redeviennent libres — il peut redéposer une candidature complète.
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- L'unicité du numéro et de la plaque ne vaut plus que pour les chauffeurs
-- actifs, sinon une fiche radiée bloquerait la nouvelle candidature.
ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_phone_key;
ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_vehicle_plate_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_phone_actif
  ON drivers (phone) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_plaque_active
  ON drivers (vehicle_plate) WHERE archived_at IS NULL;
