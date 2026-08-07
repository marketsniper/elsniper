-- Migration 007 : nouvelle segmentation tarifaire.
--  - tourist  : USD plein tarif, aucun document.
--  - resident : USD avec remise (documents de résidence à valider).
--  - local    : TZS tarif unique (carte d'identité tanzanienne à valider).
-- Les comptes résidents existants passent en USD ; le document devient
-- obligatoire pour résidents ET locaux.

BEGIN;

UPDATE users SET currency = 'USD' WHERE account_type = 'resident';

ALTER TABLE users DROP CONSTRAINT chk_resident_document;
ALTER TABLE users ADD CONSTRAINT chk_identity_document CHECK (
  account_type = 'tourist' OR id_document_url IS NOT NULL
);

COMMIT;
