-- Migration 014 : radiation d'un profil client par l'équipe.
-- Distinct de verification_status (qui juge un DOCUMENT) : banned_at marque
-- un COMPTE bloqué pour mauvais comportement — plus aucune réservation
-- possible (course, colis, place partagée) tant que le blocage n'est pas levé.

ALTER TABLE users
  ADD COLUMN banned_at TIMESTAMPTZ;
