-- LES DEMANDES DE RECHARGE DE CRÉDIT DES PARTENAIRES.
--
-- Jusqu'ici, « Recharger mon crédit » ouvrait WhatsApp et RIEN d'autre : la
-- demande ne touchait jamais le serveur. Pas d'alerte, pas de trace dans le
-- tableau de bord, rien à retrouver le lendemain — un hôtel pouvait demander
-- une recharge et l'équipe ne jamais l'apprendre, sauf à voir passer le
-- message dans une conversation.
--
-- La demande devient un objet du système, comme une course ou un colis :
-- elle s'enregistre, elle alerte l'équipe, elle attend dans une file, et
-- c'est le geste « Créditer » qui la solde — en écrivant du même coup la
-- ligne de crédit dans hotel_credit_transactions.

CREATE TABLE IF NOT EXISTS hotel_credit_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id     UUID NOT NULL REFERENCES hotels (id),
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency     currency_code NOT NULL DEFAULT 'USD',
  -- Comment le partenaire dit avoir payé (ou va payer) : c'est ce que
  -- l'équipe doit aller vérifier avant de créditer.
  method       TEXT NOT NULL DEFAULT 'mobile_money',
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'credited' | 'rejected'
  -- Ce qui a réellement été crédité : l'équipe peut corriger le montant
  -- (l'hôtel demande 100, il en arrive 95 — c'est 95 qui compte).
  credited_amount NUMERIC(12,2),
  decision_note   TEXT,
  decided_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- La file de l'équipe : les demandes en attente, la plus vieille d'abord.
CREATE INDEX IF NOT EXISTS idx_hotel_credit_requests_file
  ON hotel_credit_requests (status, created_at);

-- L'historique d'un partenaire, sur sa fiche.
CREATE INDEX IF NOT EXISTS idx_hotel_credit_requests_hotel
  ON hotel_credit_requests (hotel_id, created_at DESC);

-- UNE SEULE DEMANDE EN ATTENTE PAR PARTENAIRE.
-- Sans ce verrou, un hôtel qui touche deux fois le bouton crée deux demandes
-- identiques, et l'équipe crédite deux fois le même versement.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hotel_credit_requests_une_seule_attente
  ON hotel_credit_requests (hotel_id)
  WHERE status = 'pending';
