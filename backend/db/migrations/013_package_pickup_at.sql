-- Migration 013 : heure de ramassage souhaitée d'un colis.
-- Renseignée par l'expéditeur à la création (NULL = dès que possible) ;
-- affichée aux chauffeurs dans la bourse aux colis et sur la fiche détail.

ALTER TABLE packages
  ADD COLUMN pickup_at TIMESTAMPTZ;
