-- COURSE FIGÉE : un chauffeur l'a prise, puis plus rien.
--
-- Depuis la bourse aux courses, un chauffeur se sert lui-même. Le revers :
-- il peut cliquer « Je prends cette course » à 14 h pour un transfert
-- aéroport à 6 h le lendemain, puis ne plus donner signe de vie. La course
-- reste accrochée à son nom, personne n'est prévenu, et l'équipe le découvre
-- quand le client appelle depuis le hall.
--
-- Cette colonne retient la date à laquelle l'équipe a été alertée pour CETTE
-- course : sans elle, le balayage qui tourne toutes les minutes enverrait la
-- même alerte soixante fois par heure. Remise à NULL dès que la course
-- repart (libérée, réassignée) — une nouvelle immobilité doit pouvoir
-- réalerter.
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS alerte_figee_at TIMESTAMPTZ;

-- Le balayage ne cherche que parmi les courses encore en attente : cet index
-- partiel le garde instantané même quand l'historique aura grossi.
CREATE INDEX IF NOT EXISTS idx_trips_figees
  ON trips (scheduled_at)
  WHERE status = 'driver_confirmed';
