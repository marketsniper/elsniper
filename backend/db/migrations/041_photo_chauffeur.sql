-- LA PHOTO DU CHAUFFEUR, VUE PAR LE CLIENT.
--
-- Le client voyait déjà le nom, la plaque et le modèle : de quoi reconnaître
-- la voiture, pas l'homme au volant. À l'aéroport, de nuit, entre dix taxis
-- blancs, c'est le visage qui rassure — c'est ce que fait Uber, et c'est ce
-- qui manquait.
--
-- La colonne est distincte de vehicle_photo_url (la photo du VÉHICULE, une
-- pièce du dossier) : celle-ci est un PORTRAIT, et c'est la seule image de
-- l'application qu'un inconnu verra sur son téléphone.
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  -- Qui l'a posée et quand : une photo publique se relit, et l'équipe doit
  -- pouvoir retrouver celles arrivées depuis sa dernière vérification.
  ADD COLUMN IF NOT EXISTS photo_updated_at TIMESTAMPTZ;
