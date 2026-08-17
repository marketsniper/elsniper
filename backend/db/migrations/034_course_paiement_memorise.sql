-- L'ARGENT EST ENCAISSÉ : ÇA NE DOIT PLUS JAMAIS SE PERDRE.
--
-- Bug trouvé sur le terrain. Une course payée, dont le chauffeur se désiste,
-- redevenait « libre » — et son statut redescendait à 'requested'. Le
-- remplaçant la reprenait donc en 'driver_confirmed', c'est-à-dire « en
-- attente du paiement du client ». Résultat : il ne pouvait pas démarrer, il
-- n'obtenait pas les coordonnées du client (elles s'ouvrent au paiement), et
-- le client qui avait déjà payé voyait sa course reculer.
--
-- La cause : le statut d'une course portait DEUX informations à la fois — où
-- l'on en est dans le déroulé, ET si l'argent est arrivé. Rendre la course
-- remettait le déroulé à zéro, et emportait le paiement avec lui.
--
-- On sépare les deux. `paid_at` retient la seule chose qui ne doit jamais
-- être oubliée : le client a payé, à telle heure. Le statut peut aller et
-- venir autant qu'il veut, cette date reste.
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Rattrapage de l'existant : toute course déjà payée, en cours ou terminée
-- a forcément été payée. On prend l'heure de confirmation du paiement quand
-- elle existe, sinon celle de la création de la course.
UPDATE trips t
   SET paid_at = COALESCE(
         (SELECT p.confirmed_at FROM payments p
           WHERE p.trip_id = t.id AND p.status = 'confirmed'
           ORDER BY p.confirmed_at ASC LIMIT 1),
         t.created_at)
 WHERE t.paid_at IS NULL
   AND t.status IN ('paid', 'in_progress', 'completed');

-- Retrouver « les courses payées que plus personne n'assure » doit être
-- instantané : c'est le cas le plus urgent de la plateforme.
CREATE INDEX IF NOT EXISTS idx_trips_payees_sans_chauffeur
  ON trips (paid_at)
  WHERE driver_id IS NULL AND paid_at IS NOT NULL;
