-- Migration 009 : les colis ont une taille (forfaits par taille —
-- petit : enveloppe/documents ; moyen : sac à dos/petit carton ;
-- grand : grosse valise/caisse de ravitaillement).

BEGIN;

CREATE TYPE package_size AS ENUM ('small', 'medium', 'large');

ALTER TABLE packages
  ADD COLUMN size package_size NOT NULL DEFAULT 'medium';

COMMIT;
