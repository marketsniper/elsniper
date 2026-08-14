-- Alertes instantanées sur le téléphone de l'équipe (notifications web).
--
-- La passerelle WhatsApp gratuite met les messages dans une file d'attente :
-- ils arrivaient 35 secondes après la réservation. Une notification web part,
-- elle, en une seconde. Chaque téléphone qui accepte les alertes enregistre
-- ici son abonnement (l'adresse que le navigateur nous donne, plus les deux
-- clés de chiffrement du message).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  -- Nom lisible donné par l'équipe (« iPhone de Karim ») pour s'y retrouver.
  label       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ok_at  TIMESTAMPTZ,
  -- Échecs consécutifs : au-delà, l'abonnement est retiré tout seul.
  failures    INTEGER NOT NULL DEFAULT 0
);
