# zanziGo — Backend API (MVP)

API REST Node.js / Express + PostgreSQL 16. Implémente le socle décrit dans
[`docs/architecture-technique.md`](../docs/architecture-technique.md).

## Prérequis

- Node.js ≥ 18
- PostgreSQL 16 (une base et un rôle dédiés)

```sql
CREATE ROLE zanzigo LOGIN PASSWORD 'zanzigo';
CREATE DATABASE zanzigo OWNER zanzigo;
```

## Installation

```bash
npm install
cp .env.example .env   # adapter DATABASE_URL, TEAM_WHATSAPP_NUMBER...
npm run migrate        # applique db/migrations/ dans l'ordre
npm start              # http://localhost:3000/api
```

## Tests

```bash
npm start &            # le serveur doit tourner
npm run smoke-test     # 37 vérifications bout-en-bout, exit 1 au moindre échec
```

Le script `scripts/smoke-test.js` rejoue les deux flux métier complets avec de
vraies requêtes HTTP contre la vraie base :

- **Réservation passager** : `POST /trips` → `assign-driver` → `payment` →
  `confirm` → `start` → `complete` → `rating`.
- **Demande de colis** (hôtel) : `POST /packages` → `payment` → `confirm` →
  `pickup` → `deliver` → lookup par QR.

## Règles métier vérifiées par le code (et testées)

- Le paiement ne peut être demandé qu'**après confirmation d'un chauffeur**,
  jamais avant (`409 invalid_status`).
- Le tarif résident (`shared_local`) est **refusé tant que le compte n'est pas
  `verified`** (`403 resident_not_verified`).
- Le scan départ/arrivée vérifie que le QR scanné correspond **au véhicule
  assigné à la course** — pas n'importe quel QR (`403 qr_mismatch`). Idem pour
  le QR d'un colis au ramassage/livraison.
- Une course ne peut être **notée qu'une fois** (`409 already_rated`).
- Un chauffeur non validé ne peut pas recevoir de course
  (`409 driver_not_verified`).
- Un paiement déjà confirmé ne peut pas l'être une deuxième fois
  (`409 payment_already_processed`).

## Référence API

Toutes les routes sont préfixées par `/api`. Réponses en JSON. Payloads
validés par Zod (voir `src/routes/`).

### Utilisateurs

| Méthode | Route | Description |
| --- | --- | --- |
| POST | `/users` | Inscription touriste ou résident (document requis si résident) |
| GET | `/users/:id` | Détail utilisateur |
| PATCH | `/users/:id/verify` | Validation manuelle du document (équipe) — body `{ "status": "verified" \| "rejected" }` |

### Chauffeurs

| Méthode | Route | Description |
| --- | --- | --- |
| POST | `/drivers` | Candidature Taxi Partner (documents) |
| GET | `/drivers/:id` | Détail chauffeur |
| GET | `/drivers?zone=&available=` | Recherche de chauffeurs vérifiés disponibles |
| PATCH | `/drivers/:id/verify` | Validation manuelle → génère le QR véhicule fixe (une seule fois, ne change plus jamais) |

### Hôtels

| Méthode | Route | Description |
| --- | --- | --- |
| POST | `/hotels` | Inscription partenaire |
| GET | `/hotels/:id` | Détail hôtel |
| GET | `/hotels/:id/packages` | Historique des colis de l'hôtel |

### Trajets

| Méthode | Route | Description |
| --- | --- | --- |
| POST | `/trips` | Demande de trajet → calcule le prix (figé), génère le lien WhatsApp équipe |
| GET | `/trips/:id` | Détail |
| GET | `/trips?userId=` | Historique d'un utilisateur |
| PATCH | `/trips/:id/assign-driver` | L'équipe confirme un chauffeur — body `{ "driverId": "<uuid>" }` |
| POST | `/trips/:id/payment` | Génère le lien de paiement Pesapal |
| PATCH | `/trips/:id/start` | Scan QR véhicule au départ — body `{ "qrCode": "VEH-..." }` |
| PATCH | `/trips/:id/complete` | Scan QR véhicule à l'arrivée → clôture + stats mensuelles chauffeur |
| POST | `/trips/:id/rating` | Note du chauffeur (1-5, sens unique) — body `{ "rating": 5, "comment": "..." }` |

### Colis

| Méthode | Route | Description |
| --- | --- | --- |
| POST | `/packages` | Création demande (utilisateur ou hôtel) → génère le QR unique |
| GET | `/packages/:id` | Détail |
| GET | `/packages/by-qr/:qrCode` | Lookup par QR (usage app chauffeur) |
| POST | `/packages/:id/payment` | Lien de paiement Pesapal |
| PATCH | `/packages/:id/pickup` | Photo + scan QR au ramassage — body `{ "qrCode", "photoUrl", "driverId"? }` |
| PATCH | `/packages/:id/deliver` | Photo + scan QR à la livraison — body `{ "qrCode", "photoUrl" }` |

### Paiements

| Méthode | Route | Description |
| --- | --- | --- |
| GET | `/payments/:id` | Détail |
| POST | `/payments/:id/confirm` | Callback de confirmation (simule le webhook Pesapal en attendant la vraie intégration) |

## Format des erreurs

Toutes les erreurs suivent le même format, avec un code métier stable —
jamais `internal_error` pour une erreur 4xx :

```json
{ "error": { "code": "resident_not_verified", "message": "...", "details": [] } }
```

Codes : `validation_error` (400), `not_found` (404), `invalid_status` (409),
`duplicate` (409), `already_rated` (409), `payment_already_processed` (409),
`driver_not_verified` (409), `driver_not_available` (409),
`resident_only` / `resident_not_verified` (403), `qr_mismatch` (403),
`internal_error` (500).

## Structure

```
backend/
├── db/migrations/001_init.sql   # 7 tables, ENUMs, contraintes CHECK, triggers
├── scripts/
│   ├── migrate.js               # applique les migrations (table schema_migrations)
│   └── smoke-test.js            # 37 tests bout-en-bout
└── src/
    ├── server.js / app.js       # bootstrap Express
    ├── config.js / db.js        # env + pool PostgreSQL
    ├── errors.js                # HttpError avec codes métier
    ├── middleware/errorHandler.js
    ├── routes/                  # users, drivers, hotels, trips, packages, payments
    └── services/                # pesapal (stub), whatsapp (liens wa.me), qr, pricing
```

## À ajouter avant la production

Volontairement absents de ce socle pour rester lisible (voir doc
d'architecture §7) : authentification (JWT + OTP SMS recommandé), autorisation
par ressource, upload de fichiers réel vers S3/R2, rate limiting, logs
structurés + monitoring, suite de tests automatisés (Jest/Supertest),
conformité RGPD pour les documents d'identité.
