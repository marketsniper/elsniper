-- Le point de rendez-vous EXACT d'une course privée.
--
-- Le champ texte « pickup_location » dit le village ou l'hôtel ; il ne dit pas
-- devant quelle porte attendre. Sur une plage de Paje ou une piste de Nungwi,
-- un chauffeur peut tourner dix minutes. Le client partage donc, s'il le
-- souhaite, sa position exacte : le chauffeur la voit sur une carte et lance
-- son GPS dessus.
--
-- Volontairement à la demande : rien n'est prélevé automatiquement, c'est un
-- geste du client, et il ne concerne que SA course.
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS pickup_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pickup_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pickup_position_at TIMESTAMPTZ;
