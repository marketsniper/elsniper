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
| [`backend/`](backend/) | API REST complète : schéma PostgreSQL (7 tables), 6 routers Express (~25 endpoints), validation Zod, services (Pesapal stub, WhatsApp, QR, tarification), tests de bout en bout |
| [`docs/architecture-technique.md`](docs/architecture-technique.md) | Cahier des charges technique du MVP (v0.1) |

## Démarrage rapide

```bash
cd backend
npm install
cp .env.example .env      # adapter DATABASE_URL si besoin
npm run migrate           # applique db/migrations/ sur PostgreSQL
npm start                 # API sur http://localhost:3000/api
npm run smoke-test        # 37 tests bout-en-bout contre le serveur démarré
```

Voir [`backend/README.md`](backend/README.md) pour la référence API complète
et les règles métier implémentées.
