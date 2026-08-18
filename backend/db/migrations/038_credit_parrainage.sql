-- CRÉDIT DE PARRAINAGE AUTOMATIQUE.
--
-- Jusqu'ici, la récompense de parrainage (2e course terminée du filleul)
-- n'était qu'une alerte à l'équipe : « 5 $ pour lui et 5 $ pour son parrain,
-- à déduire de leur prochain paiement » — déduction à la main, que le client
-- ne voyait nulle part. Le premier test utilisateur a montré le problème :
-- le filleul attendait sa remise sur l'écran de paiement, elle n'y était pas.
--
-- Désormais, la récompense est un CRÉDIT en base, posé automatiquement sur
-- les deux comptes, et déduit tout seul du paiement de la prochaine course
-- (5 USD, ou 13 000 TZS pour un compte local — le taux de la grille).
--
-- Le crédit est tenu en USD (monnaie de référence de la grille) et converti
-- à l'affichage. Il ne touche NI le prix de la course NI la commission du
-- chauffeur : c'est le geste commercial de zanziGo, il sort de sa marge.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS credit_parrainage_usd NUMERIC(6,2) NOT NULL DEFAULT 0;

-- La part du paiement couverte par le crédit (dans la devise du règlement),
-- pour que le tableau de bord et les remboursements sachent d'où vient
-- chaque shilling. Remboursement d'une course annulée : la remise n'est
-- jamais « remboursée » en argent — c'est le crédit qui est rendu au compte.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS remise_parrainage_usd NUMERIC(6,2) NOT NULL DEFAULT 0;
