-- PRIX FACTURÉ, FIGÉ SUR LE PAIEMENT.
--
-- Le problème : quand un client change de moyen de paiement (carte ↔
-- portefeuille mobile), le montant doit être recalculé depuis le PRIX de ce
-- qu'il achète. Pour une course ou un colis, ce prix est figé sur la ligne
-- (trips.price, packages.price). Pour une PLACE de taxi partagé, il ne
-- l'était nulle part : il était recalculé depuis la grille du moment — et si
-- la grille avait bougé entre la réservation et le changement de moyen, le
-- client voyait un autre montant que celui de sa réservation.
--
-- Ces deux colonnes figent la facture au moment où le paiement est créé :
--   prix_facture  = le prix de ce qui est vendu, dans la devise du client
--   devise_facture = cette devise ('USD' ou 'TZS')
-- amount/currency restent ce qui est réellement débité (conversion et frais
-- de carte compris). NULL sur les anciennes lignes : le code retombe alors
-- sur l'ancien calcul.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS prix_facture NUMERIC(12,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS devise_facture TEXT;
