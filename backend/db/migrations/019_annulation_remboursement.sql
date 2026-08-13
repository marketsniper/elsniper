-- Annulation par le CLIENT d'un voyage déjà payé (course planifiée ou place
-- de taxi partagé), avec barème de remboursement :
--  - à 48 h ou plus du départ : remboursement 100 % ;
--  - entre 24 h et 48 h      : remboursement 50 % ;
--  - à moins de 24 h         : annulation impossible dans l'app (la place
--    reste due — l'équipe garde la main via WhatsApp).
-- Le remboursement est TRACÉ sur le paiement confirmé : montant dû, date de
-- la demande, puis date à laquelle l'équipe a réellement remboursé (bouton
-- « Remboursement effectué » du tableau de bord).
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(12,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_due_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_at   TIMESTAMPTZ;

-- Les remboursements à traiter se listent souvent : petit index partiel.
CREATE INDEX IF NOT EXISTS idx_payments_refund_due
  ON payments (refund_due_at)
  WHERE refund_due_at IS NOT NULL AND refunded_at IS NULL;
