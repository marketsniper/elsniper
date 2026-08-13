-- Identification par E-MAIL pour les touristes/visiteurs : à l'étranger,
-- les SMS n'arrivent pas — le compte visiteur s'identifie donc par e-mail
-- (code de connexion envoyé dans la boîte mail). Les locaux et les
-- chauffeurs gardent l'identification par téléphone (SIM tanzanienne).
-- Le téléphone devient une simple donnée de CONTACT (WhatsApp, recommandé
-- pour joindre le client) — optionnelle et non vérifiée pour ces comptes.
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

-- Recherche de compte par e-mail (connexion) : index sur l'e-mail normalisé.
CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
