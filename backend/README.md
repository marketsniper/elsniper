# zanziGo — Backend API (MVP)

API REST Node.js / Express + PostgreSQL 16. Implémente le socle décrit dans
[`docs/architecture-technique.md`](../docs/architecture-technique.md), durci
pour la production : authentification OTP SMS + JWT, autorisation par
ressource, upload de fichiers, rate limiting, intégration Pesapal prête.

## Prérequis

- Node.js ≥ 22
- PostgreSQL 16 (une base et un rôle dédiés)

```sql
CREATE ROLE zanzigo LOGIN PASSWORD 'zanzigo';
CREATE DATABASE zanzigo OWNER zanzigo;
```

## Installation

```bash
npm install
cp .env.example .env   # adapter DATABASE_URL, JWT_SECRET, ADMIN_API_KEY...
npm run migrate        # applique db/migrations/ dans l'ordre
npm start              # http://localhost:3000/api
```

## Tests

```bash
npm test               # suite automatisée (node:test + supertest, base zanzigo_test)
npm start &            # puis, serveur démarré :
npm run smoke-test     # 50 vérifications bout-en-bout, exit 1 au moindre échec
```

Le smoke-test (`scripts/smoke-test.js`) rejoue les deux flux métier complets
avec de vraies requêtes HTTP contre la vraie base — authentification OTP
comprise :

- **Réservation passager** : OTP → profil → `POST /trips` → `assign-driver`
  (équipe) → `payment` → `confirm` → `start` (scan QR) → `complete` → `rating`.
- **Demande de colis** (hôtel) : OTP → profil → `POST /packages` → `payment` →
  `confirm` → `pickup` (photo + QR) → `deliver` → lookup par QR.

La suite `npm test` (dossier `test/`) couvre les mêmes scénarios plus les cas
limites (OTP expiré/rejoué, ownership, statuts invalides) sur une base dédiée
`zanzigo_test`, avec le rate limiting désactivé (`NODE_ENV=test`).

## Authentification

**Clients, chauffeurs et hôtels** : OTP par SMS puis JWT.

1. `POST /api/auth/request-otp {"phone": "+255777123456"}` — envoie un code à
   6 chiffres par SMS (stub en dev : le code est loggé, et renvoyé dans
   `devCode` tant que `NODE_ENV != production`). Codes valides 10 minutes,
   à usage unique, hashés en base (sha256).
2. `POST /api/auth/verify-otp {"phone", "code"}` — renvoie
   `{token, user, driver, hotel}` (chacun `null` si aucun profil n'existe
   encore pour ce numéro). Le `token` (JWT, 30 jours par défaut) s'envoie
   ensuite en header `Authorization: Bearer <token>`.
3. Un nouveau venu vérifie d'abord son téléphone, **puis** crée son profil
   (`POST /users`, `/drivers` ou `/hotels`) avec ce même numéro — un jeton
   émis avant la création du profil est réhydraté automatiquement.

**Équipe zanziGo (back-office)** : header `X-Admin-Key: <ADMIN_API_KEY>` sur
les routes équipe (validation de comptes, assignation de chauffeurs,
recherche). La clé admin bypasse aussi les contrôles d'ownership et le rate
limiting (outillage interne).

En production : brancher un vrai fournisseur SMS dans
`src/services/smsService.js` (Twilio, Africa's Talking) — une seule fonction
à réimplémenter.

## Upload de fichiers

`POST /api/uploads` (authentifié, multipart/form-data, champ `file`) →
`{url, size, mimeType}`. Limites : 10 Mo ; jpeg, png, webp, pdf.

- Avec `S3_BUCKET` + clés configurées : stockage S3-compatible
  (Cloudflare R2 recommandé), clé `uploads/<uuid>.<ext>`.
- Sans configuration S3 (dev) : fichiers écrits dans `backend/uploads/` et
  servis sur `/uploads/...`.

L'URL retournée s'utilise ensuite comme `idDocumentUrl`, `photoUrl`, etc.

## Référence API

Toutes les routes sont préfixées par `/api`. Réponses en JSON. Payloads
validés par Zod (voir `src/routes/`). 🔑 = JWT requis, 🛡 = clé équipe
(`X-Admin-Key`) requise. L'équipe peut appeler toutes les routes 🔑 en
bypassant l'ownership.

### Authentification

| Méthode | Route | Accès | Description |
| --- | --- | --- | --- |
| POST | `/auth/request-otp` | public (rate limité) | Envoie le code SMS |
| POST | `/auth/verify-otp` | public | Vérifie le code → JWT + profils |

### Utilisateurs

| Méthode | Route | Accès | Description |
| --- | --- | --- | --- |
| POST | `/users` | 🔑 (phone = jeton) | Inscription touriste ou résident (document requis si résident) |
| GET | `/users/:id` | 🔑 owner | Détail utilisateur |
| PATCH | `/users/:id/verify` | 🛡 | Validation manuelle du document — body `{ "status": "verified" \| "rejected" }` |

### Chauffeurs

| Méthode | Route | Accès | Description |
| --- | --- | --- | --- |
| POST | `/drivers` | 🔑 (phone = jeton) | Candidature Taxi Partner (documents) |
| GET | `/drivers/:id` | 🔑 lui-même | Détail chauffeur |
| GET | `/drivers?zone=&available=` | 🛡 | Recherche de chauffeurs vérifiés disponibles |
| PATCH | `/drivers/:id/verify` | 🛡 | Validation manuelle → génère le QR véhicule fixe (une seule fois) |

### Hôtels

| Méthode | Route | Accès | Description |
| --- | --- | --- | --- |
| POST | `/hotels` | 🔑 (phone = jeton) | Inscription partenaire |
| GET | `/hotels/:id` | 🔑 lui-même | Détail hôtel |
| GET | `/hotels/:id/packages` | 🔑 lui-même | Historique des colis de l'hôtel |

### Trajets

| Méthode | Route | Accès | Description |
| --- | --- | --- | --- |
| POST | `/trips` | 🔑 owner | Demande de trajet → prix figé + lien WhatsApp équipe |
| GET | `/trips/:id` | 🔑 owner / chauffeur assigné | Détail |
| GET | `/trips?userId=` | 🔑 owner | Historique d'un utilisateur |
| PATCH | `/trips/:id/assign-driver` | 🛡 | L'équipe confirme un chauffeur — `{ "driverId" }` |
| POST | `/trips/:id/payment` | 🔑 owner | Lien de paiement Pesapal (statut `driver_confirmed` requis) |
| PATCH | `/trips/:id/start` | 🔑 chauffeur assigné | Scan QR véhicule au départ — `{ "qrCode": "VEH-..." }` |
| PATCH | `/trips/:id/complete` | 🔑 chauffeur assigné | Scan QR véhicule à l'arrivée → stats mensuelles |
| POST | `/trips/:id/rating` | 🔑 owner | Note 1-5, à sens unique — `{ "rating", "comment"? }` |

### Colis

| Méthode | Route | Accès | Description |
| --- | --- | --- | --- |
| POST | `/packages` | 🔑 expéditeur | Création (user ou hôtel) → QR unique + prix figé |
| GET | `/packages/:id` | 🔑 expéditeur / chauffeur | Détail |
| GET | `/packages/by-qr/:qrCode` | 🔑 chauffeur | Lookup par QR (app chauffeur) |
| POST | `/packages/:id/payment` | 🔑 expéditeur | Lien de paiement Pesapal |
| PATCH | `/packages/:id/pickup` | 🔑 chauffeur | Photo + scan QR au ramassage — `{ "qrCode", "photoUrl" }` |
| PATCH | `/packages/:id/deliver` | 🔑 chauffeur assigné | Photo + scan QR à la livraison |

### Paiements

| Méthode | Route | Accès | Description |
| --- | --- | --- | --- |
| GET | `/payments/:id` | 🔑 payeur | Détail |
| POST | `/payments/:id/confirm` | 🔑 payeur (stub) / IPN Pesapal (réel) | Confirmation — vérifie le statut Pesapal en mode réel |

### Upload

| Méthode | Route | Accès | Description |
| --- | --- | --- | --- |
| POST | `/uploads` | 🔑 | Upload multipart (champ `file`) → `{url}` |

## Paiement Pesapal

Sans `PESAPAL_CONSUMER_KEY`/`SECRET`, le service tourne en **mode stub**
(liens factices, confirmation simulée par le payeur). Avec les clés, le mode
réel s'active automatiquement : OAuth `RequestToken`, enregistrement IPN,
`SubmitOrderRequest` → vraie `redirect_url`, et `POST /payments/:id/confirm`
devient l'endpoint IPN qui vérifie `GetTransactionStatus === COMPLETED` avant
de confirmer. `PESAPAL_ENV=sandbox` pointe vers l'environnement de test
Pesapal.

## Format des erreurs

Toutes les erreurs suivent le même format, avec un code métier stable —
jamais `internal_error` pour une erreur 4xx :

```json
{ "error": { "code": "resident_not_verified", "message": "...", "details": [] } }
```

Codes : `validation_error` (400), `unsupported_trip_type` (400),
`file_required` / `unsupported_file_type` (400), `unauthorized` /
`admin_required` / `invalid_otp` (401), `forbidden` / `phone_mismatch` /
`resident_only` / `resident_not_verified` / `qr_mismatch` (403), `not_found`
(404), `invalid_status` / `duplicate` / `already_rated` /
`payment_already_processed` / `payment_not_completed` / `driver_not_verified`
/ `driver_not_available` (409), `rate_limited` (429), `internal_error` (500).

## Structure

```
backend/
├── db/migrations/
│   ├── 001_init.sql             # 7 tables, ENUMs, contraintes CHECK, triggers
│   └── 002_auth.sql             # codes OTP (hashés)
├── scripts/
│   ├── migrate.js               # applique les migrations (table schema_migrations)
│   └── smoke-test.js            # 50 vérifications bout-en-bout
├── test/                        # suite automatisée (node:test + supertest)
└── src/
    ├── server.js / app.js       # bootstrap Express + rate limiting
    ├── config.js / db.js        # env + pool PostgreSQL
    ├── errors.js                # HttpError avec codes métier
    ├── middleware/
    │   ├── auth.js              # requireAuth (JWT), requireAdmin (X-Admin-Key)
    │   └── errorHandler.js
    ├── routes/                  # auth, users, drivers, hotels, trips, packages, payments, uploads
    └── services/                # pesapal (stub/réel), sms (stub), storage (S3/local), whatsapp, qr, pricing
```

## Reste à faire avant la production

- Brancher un vrai fournisseur SMS (`smsService.js`) et fournir les clés
  Pesapal + S3/R2 réelles.
- Logs structurés + monitoring (ex: Sentry) — voir doc d'architecture §7.
- RGPD : chiffrement au repos et durée de conservation des documents
  d'identité.
