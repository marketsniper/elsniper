-- Fidélité + crédit prépayé des hôtels partenaires.
--
-- Crédit : solde en USD sur le compte de l'hôtel, alimenté par l'équipe
-- (recharge mobile money / carte via Pesapal quand les clés seront actives),
-- débité quand l'hôtel paie une course ou un colis « avec mon crédit ».
-- Chaque mouvement laisse une ligne dans hotel_credit_transactions.
--
-- Fidélité : toutes les 10 courses TERMINÉES réservées par l'hôtel, un bon
-- « colis offert » est attribué (hotel_vouchers). Le bon paie un envoi de
-- colis à 100 % (le chauffeur reste payé — la part est prise sur zanziGo).

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS credit_balance NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (credit_balance >= 0);

CREATE TABLE IF NOT EXISTS hotel_credit_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id    UUID NOT NULL REFERENCES hotels (id),
  -- positif = recharge / remboursement ; négatif = paiement
  amount      NUMERIC(12,2) NOT NULL,
  currency    currency_code NOT NULL DEFAULT 'USD',
  reason      TEXT NOT NULL, -- 'topup' | 'trip_payment' | 'package_payment' | 'adjustment'
  reference   TEXT,          -- id de la course / du colis concerné, ou note libre
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotel_credit_tx_hotel
  ON hotel_credit_transactions (hotel_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hotel_vouchers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id    UUID NOT NULL REFERENCES hotels (id),
  kind        TEXT NOT NULL DEFAULT 'free_package',
  status      TEXT NOT NULL DEFAULT 'available', -- 'available' | 'used'
  package_id  UUID REFERENCES packages (id),
  earned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_hotel_vouchers_hotel
  ON hotel_vouchers (hotel_id, status);
