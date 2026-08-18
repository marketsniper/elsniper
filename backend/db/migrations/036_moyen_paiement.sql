-- MOYEN DE PAIEMENT retenu par le client : carte bancaire (USD, frais
-- bancaires en plus) ou portefeuille mobile (TZS, sans frais). Le crédit
-- prépayé des hôtels garde son propre libellé.
--
-- Pourquoi le stocker : l'équipe doit savoir CE QU'ELLE ATTEND avant même que
-- l'argent arrive — un virement Tigo en shillings ou un paiement carte en
-- dollars. Sans cette colonne, elle le devinait à la devise, ce qui ne
-- suffisait plus dès qu'un touriste (facturé en dollars) règle en shillings.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS method TEXT;

-- Rattrapage des lignes existantes : le crédit hôtel se reconnaît à sa
-- référence, le reste se déduit de la devise réglée.
UPDATE payments
   SET method = CASE
         WHEN pesapal_reference LIKE 'CREDIT-%' THEN 'credit'
         WHEN currency = 'TZS' THEN 'mobile'
         ELSE 'carte'
       END
 WHERE method IS NULL;

ALTER TABLE payments ALTER COLUMN method SET DEFAULT 'carte';
ALTER TABLE payments ALTER COLUMN method SET NOT NULL;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS chk_payment_method;
ALTER TABLE payments
  ADD CONSTRAINT chk_payment_method CHECK (method IN ('carte', 'mobile', 'credit'));
