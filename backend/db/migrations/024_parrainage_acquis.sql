-- Parrainage : la récompense (5 $ chacun) n'est ACQUISE que lorsque le
-- filleul a terminé au moins 2 courses — horodatage posé une seule fois,
-- l'équipe est alors prévenue.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_rewarded_at TIMESTAMPTZ;
