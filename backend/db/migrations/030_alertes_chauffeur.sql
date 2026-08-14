-- Alertes instantanées pour les CHAUFFEURS.
--
-- Jusqu'ici, un seul type d'abonnement existait : les téléphones de l'équipe,
-- et chaque alerte partait vers TOUS. Un chauffeur abonné aurait donc reçu les
-- paiements, les candidatures et les inscriptions de toute la plateforme.
--
-- Chaque téléphone porte désormais le nom de son propriétaire : 'equipe' ou
-- 'chauffeur' (avec l'identifiant du chauffeur). Les alertes de l'équipe ne
-- partent qu'aux téléphones de l'équipe ; celles d'une course ne partent qu'au
-- chauffeur concerné. Le cloisonnement est dans la requête d'envoi elle-même.
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'equipe';

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE;

-- Radiation d'un chauffeur : son téléphone cesse d'être alerté (ON DELETE
-- CASCADE ci-dessus), sans intervention.
CREATE INDEX IF NOT EXISTS idx_push_role ON push_subscriptions (role);
CREATE INDEX IF NOT EXISTS idx_push_driver ON push_subscriptions (driver_id);
