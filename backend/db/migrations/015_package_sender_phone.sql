-- Migration 015 : numéro de téléphone de l'expéditeur d'un colis.
-- Nécessaire à la ramasse : le chauffeur qui a pris la livraison doit
-- pouvoir joindre l'expéditeur (en plus du destinataire déjà enregistré).
-- Prérempli avec le téléphone du compte, modifiable à la création.

ALTER TABLE packages
  ADD COLUMN sender_phone TEXT;
