-- SURCHARGE CARTE : la part du montant qui couvre les frais bancaires.
--
-- Elle est ajoutée au prix de la course pour le client qui paie par carte, et
-- ne change RIEN au prix du trajet ni à la commission du chauffeur — d'où une
-- colonne à part plutôt qu'un prix gonflé. La comptabilité reste lisible :
--   amount    = ce que le client a réglé
--   surcharge = ce qui, là-dedans, part chez la banque
--   amount − surcharge = le prix réel de la course
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS surcharge NUMERIC(12,2) NOT NULL DEFAULT 0;
