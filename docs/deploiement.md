# Déploiement zanziGo (backend)

Guide de mise en production du backend zanziGo (API Express + PostgreSQL 16).
Cahier des charges : **une seule région**, proche de l'Europe / Afrique de l'Est
(latence correcte depuis Zanzibar et depuis les clients européens).

## Options d'hébergement

| Option | Région recommandée | Points forts | Points d'attention |
|---|---|---|---|
| **Railway** | `europe-west4` (Pays-Bas) | Déploiement Git très simple, PostgreSQL managé intégré, variables d'env dans l'UI | Coût à surveiller au-delà du plan de base |
| **Render** | Frankfurt (UE) | Web Service + PostgreSQL managé, HTTPS automatique, déploiement depuis GitHub | Instance gratuite mise en veille (à éviter en prod) |
| **VM DigitalOcean / Hetzner** | DO : Frankfurt (`fra1`) / Hetzner : Nuremberg ou Falkenstein | Coût le plus bas, contrôle total (Docker + reverse proxy Caddy/Nginx) | Vous gérez l'OS, les sauvegardes et le TLS vous-même |

Dans tous les cas : **tout déployer dans la même région** (API + base de données)
pour éviter la latence inter-régions.

## Étapes de déploiement

### 1. Provisionner PostgreSQL 16 managé

- Railway : plugin PostgreSQL du projet. Render : "Managed PostgreSQL". VM : instance managée DO/Hetzner Cloud ou PostgreSQL 16 installé sur la VM (dans ce cas, activer les sauvegardes automatiques).
- Récupérer l'URL de connexion — elle devient `DATABASE_URL`.
- Restreindre l'accès réseau à l'API uniquement (réseau privé si disponible).

### 2. Définir les variables d'environnement

À configurer sur la plateforme (jamais commitées) :

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | URL PostgreSQL managé (ex. `postgres://user:pass@host:5432/zanzigo`) |
| `JWT_SECRET` | Secret de signature des jetons — **long et aléatoire en prod** |
| `ADMIN_API_KEY` | Clé d'accès aux routes d'administration |
| `TEAM_WHATSAPP_NUMBER` | Numéro WhatsApp de l'équipe (notifications) |
| `COMMISSION_RATE` | Taux de commission appliqué aux courses/livraisons |
| `PESAPAL_ENV` | `sandbox` ou `live` |
| `PESAPAL_CONSUMER_KEY` / `PESAPAL_CONSUMER_SECRET` | Identifiants API Pesapal |
| `PESAPAL_IPN_URL` | URL publique de notification de paiement (IPN) |
| `PESAPAL_CALLBACK_URL` | URL de retour après paiement |
| `S3_BUCKET` | Nom du bucket de stockage des fichiers |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Identifiants du stockage S3 compatible |
| `S3_ENDPOINT` | Endpoint S3 (ex. endpoint Cloudflare R2) |
| `S3_REGION` | Région S3 (`auto` pour R2) |
| `S3_PUBLIC_URL` | URL publique de lecture des fichiers |

Optionnel : `PORT` (3000 par défaut, souvent injecté par la plateforme).

### 3. Migrations à chaque déploiement

Exécuter `npm run migrate` avant de démarrer le serveur (le script est idempotent,
table `schema_migrations`) :

- Railway / Render : commande de pré-déploiement (release command) `npm run migrate`, commande de démarrage `node src/server.js`.
- VM (Docker) :

```bash
docker build -t zanzigo-backend backend/
docker run --rm --env-file /etc/zanzigo/env zanzigo-backend npm run migrate
docker run -d --name zanzigo --env-file /etc/zanzigo/env -p 3000:3000 zanzigo-backend
```

### 4. Stockage des fichiers : Cloudflare R2 recommandé

Pour les photos et pièces jointes (variables `S3_*`), **Cloudflare R2** est recommandé :
API compatible S3, **pas de frais de sortie (egress)**, distribution mondiale — bien
adapté à des utilisateurs à Zanzibar et en Europe. Créer un bucket, un jeton API
(clé/secret), et renseigner `S3_ENDPOINT` (endpoint R2 du compte), `S3_REGION=auto`
et `S3_PUBLIC_URL` (domaine public du bucket).

## Sécurité — rappels

- **Secrets forts en production** : `JWT_SECRET` et `ADMIN_API_KEY` générés aléatoirement (ex. `openssl rand -hex 32`), différents de tout secret de dev, et jamais commités.
- **HTTPS obligatoire** : automatique sur Railway/Render ; sur VM, mettre l'API derrière Caddy ou Nginx + Let's Encrypt (ou derrière le proxy Cloudflare). Les URLs Pesapal (`PESAPAL_IPN_URL`, `PESAPAL_CALLBACK_URL`) doivent être en HTTPS.
- Passer `PESAPAL_ENV=live` uniquement après validation complète en sandbox.
- Limiter l'accès à PostgreSQL au strict nécessaire et activer les sauvegardes automatiques.
