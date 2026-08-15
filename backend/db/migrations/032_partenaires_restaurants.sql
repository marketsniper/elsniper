-- Les partenaires ne sont plus seulement des hôtels.
--
-- Un restaurant a exactement les mêmes besoins : faire livrer (colis) et
-- commander un taxi pour ses clients. Plutôt que de dupliquer le compte, le
-- crédit prépayé, la fidélité et le tableau de bord, on ouvre la table
-- existante : elle décrit désormais un ÉTABLISSEMENT partenaire, et
-- partner_type dit lequel.
--
-- La table garde son nom `hotels` : la renommer casserait toutes les clés
-- étrangères (trips.hotel_id, packages.sender_hotel_id, hotel_credits,
-- hotel_vouchers…) pour un gain purement cosmétique. Le nom vit dans le
-- code, pas devant les partenaires.

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS partner_type TEXT NOT NULL DEFAULT 'hotel';

-- Les partenaires déjà inscrits sont des hôtels : le DEFAULT s'en charge.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotels_partner_type_check'
  ) THEN
    ALTER TABLE hotels
      ADD CONSTRAINT hotels_partner_type_check
      CHECK (partner_type IN ('hotel', 'restaurant'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hotels_partner_type ON hotels (partner_type);
