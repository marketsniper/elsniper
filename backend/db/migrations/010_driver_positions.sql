-- Position GPS courante de chaque chauffeur (une ligne par chauffeur,
-- écrasée à chaque envoi depuis son téléphone). Sert au suivi des colis
-- en cours de livraison : l'expéditeur voit où en est le chauffeur.
CREATE TABLE IF NOT EXISTS driver_positions (
  driver_id  UUID PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
  lat        DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng        DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
