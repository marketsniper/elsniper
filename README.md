# zanziGo

Plateforme de courses taxi et de livraison de colis à Zanzibar — MVP.

Trois clients (app mobile Client, app mobile Chauffeur, futur back-office
équipe en V1.5) parlent tous en HTTPS/JSON à une seule API REST
(Node.js / Express), appuyée sur PostgreSQL, un stockage fichiers
S3-compatible et des services tiers (Pesapal, WhatsApp, Maps).

**Principe directeur du MVP** : garder un humain dans la boucle (l'équipe
zanziGo, via WhatsApp Business) pour le matching chauffeur/client. Les routes
exposent des actions granulaires (`assign-driver`, `confirm`, `start`,
`complete`) que l'équipe déclenche manuellement. Le matching automatique
arrivera en V2 comme un service au-dessus de ces mêmes routes, sans les casser.

## Contenu du dépôt

| Dossier | Description |
| --- | --- |
| [`backend/`](backend/) | API REST complète : schéma PostgreSQL (7 tables + OTP), 8 routers Express, authentification OTP SMS + JWT, autorisation par ressource, upload S3/R2, Pesapal (stub → réel par simple config), rate limiting, suite de tests + smoke-test |
| [`mobile/`](mobile/) | App mobile Expo React Native (TypeScript) : client (réservation, trajets, colis avec QR, profil) et mode chauffeur (scan QR, photos de ramassage/livraison) |
| [`docs/architecture-technique.md`](docs/architecture-technique.md) | Cahier des charges technique du MVP (v0.1) |
| [`docs/deploiement.md`](docs/deploiement.md) | Guide de déploiement (Railway / Render / VM) et variables d'environnement |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | CI : tests backend sur PostgreSQL 16 + typecheck mobile à chaque push |

## Démarrage rapide

```bash
# Backend
cd backend
npm install
cp .env.example .env      # adapter DATABASE_URL si besoin
npm run migrate           # applique db/migrations/ sur PostgreSQL
npm start                 # API sur http://localhost:3000/api
npm test                  # suite automatisée (base zanzigo_test)
npm run smoke-test        # 50 vérifications bout-en-bout (serveur démarré)

# App mobile (Expo Go sur votre téléphone)
cd ../mobile
npm install
npx expo start            # EXPO_PUBLIC_API_URL = IP locale du backend
```

Voir [`backend/README.md`](backend/README.md) pour la référence API complète
(authentification, permissions par route, règles métier) et
[`mobile/README.md`](mobile/README.md) pour le lancement de l'app.
