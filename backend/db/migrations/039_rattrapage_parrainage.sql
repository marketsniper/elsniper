-- RATTRAPAGE DES PARRAINAGES VALIDÉS SOUS L'ANCIEN SYSTÈME.
--
-- Avant le crédit automatique (déployé le 18/08/2026 vers 19 h 30 UTC), la
-- récompense de parrainage n'était qu'une alerte à l'équipe : le compteur
-- referral_rewarded_at était posé, mais AUCUN crédit n'était donné. Les
-- parrainages validés dans cette fenêtre sont donc marqués « récompensés »
-- sans avoir jamais rien reçu — et le nouveau système, qui respecte ce
-- marqueur, ne repassera pas dessus.
--
-- Ce rattrapage crédite une fois pour toutes les 5 $ du filleul ET du
-- parrain pour ces cas-là. La borne de date fige la frontière : tout
-- parrainage validé APRÈS le déploiement a déjà été crédité par le code, et
-- ne doit pas l'être deux fois. (Une migration ne s'exécute qu'une fois —
-- la borne est une ceinture en plus des bretelles.)
UPDATE users
   SET credit_parrainage_usd = credit_parrainage_usd + 5
 WHERE referral_rewarded_at IS NOT NULL
   AND referral_rewarded_at < '2026-08-18 19:30+00';

UPDATE users p
   SET credit_parrainage_usd = p.credit_parrainage_usd + 5
  FROM users f
 WHERE f.referred_by_user_id = p.id
   AND f.referral_rewarded_at IS NOT NULL
   AND f.referral_rewarded_at < '2026-08-18 19:30+00';
