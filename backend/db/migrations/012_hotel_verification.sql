-- Migration 012 : vérification des comptes hôtels par l'équipe.
-- Un hôtel nouvellement inscrit est 'pending' : il peut se connecter mais ne
-- peut rien réserver (course, colis, place partagée) tant que l'équipe n'a
-- pas confirmé — par téléphone ou WhatsApp — que le compte appartient bien à
-- l'établissement. Parade aux fausses inscriptions au nom d'un hôtel réel.
-- Les hôtels créés avant cette migration restent actifs (verified).

BEGIN;

ALTER TABLE hotels
  ADD COLUMN verification_status verification_status NOT NULL DEFAULT 'pending';

UPDATE hotels SET verification_status = 'verified';

COMMIT;
