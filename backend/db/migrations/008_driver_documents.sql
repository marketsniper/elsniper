-- Migration 008 : la candidature chauffeur exige désormais 3 documents —
-- permis de conduire, assurance du véhicule et photo du véhicule.
-- La pièce d'identité devient optionnelle.

BEGIN;

ALTER TABLE drivers
  ADD COLUMN insurance_document_url TEXT,
  ADD COLUMN vehicle_photo_url TEXT,
  ALTER COLUMN id_document_url DROP NOT NULL;

COMMIT;
