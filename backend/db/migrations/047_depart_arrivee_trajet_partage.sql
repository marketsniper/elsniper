-- Migration 047 : l'heure RÉELLE de départ et d'arrivée d'un taxi partagé.
--
-- `departure_at` reste l'heure ANNONCÉE aux passagers. `started_at` est le
-- moment où le chauffeur a touché « Démarrer », `completed_at` celui où il a
-- touché « Terminer » : c'est ce que l'équipe lit sur le tableau de bord pour
-- savoir depuis combien de temps une voiture roule.

ALTER TABLE posted_rides
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
