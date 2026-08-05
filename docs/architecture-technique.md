# zanziGo — Architecture technique (v0.1, MVP)

> 5 août 2026

Ce document décrit l'architecture du vrai socle technique de zanziGo, dans la
continuité du prototype web cliquable déjà validé. Il sert de cahier des
charges technique — pour toi-même si tu continues seul, ou pour un
développeur/agence à qui tu confierais le projet.

Le code de démarrage qui implémente une partie de ce document (schéma de base
de données complet + API REST fonctionnelle et testée) est livré à côté de ce
document, dans le dossier [`backend/`](../backend/).

## 1. Vue d'ensemble de l'architecture

Trois clients (l'app mobile Client, l'app mobile Chauffeur, et un futur
back-office équipe en V1.5) parlent tous en HTTPS/JSON à une seule API REST
(Node.js / Express), qui elle-même s'appuie sur trois briques : la base de
données PostgreSQL (données principales), un stockage fichiers S3-compatible
(photos, documents), et des services tiers (Pesapal pour le paiement, WhatsApp
pour les notifications équipe, Maps pour la localisation).

**Principe directeur du MVP** : garder un humain dans la boucle (l'équipe
zanziGo, via WhatsApp Business) pour le matching chauffeur/client, plutôt que
de construire un moteur de matching automatique complexe dès le départ.
L'architecture backend reflète ça : les routes exposent des actions
granulaires (assign-driver, confirm payment, start, complete) que l'équipe
déclenche manuellement, plutôt qu'un algorithme qui déciderait seul. Le
passage à un matching automatique en V2 se fera en ajoutant un service
au-dessus de ces mêmes routes, sans les casser.

## 2. Stack technique retenue

| Couche | Choix | Justification |
| --- | --- | --- |
| Backend API | Node.js + Express | Écosystème mature, embauche facile, cohérent avec un frontend React Native (JS partout) |
| Base de données | PostgreSQL 16 | Relationnel, contraintes fortes utiles ici (statuts, clés étrangères, unicité des QR codes), types ENUM natifs |
| Frontend mobile | React Native | Un seul code base iOS/Android — pertinent vu le budget MVP |
| Validation | Zod | Schémas de validation lisibles, erreurs claires renvoyées à l'app |
| Stockage fichiers | S3-compatible (ex: AWS S3, ou Cloudflare R2 moins cher) | Photos de colis, documents d'identité, documents chauffeurs |
| Paiement | Pesapal Tanzanie | Déjà retenu au niveau produit — carte, M-Pesa, Tigo Pesa, Airtel Money |
| Notifications équipe | Liens `wa.me/...?text=...` générés côté serveur | Aucune API payante nécessaire au MVP |
| QR codes | Génération native (`crypto.randomUUID`) + lib d'affichage type `qrcode` côté app | Deux types distincts : QR véhicule fixe, QR colis unique |
| Hébergement | À définir — une seule région suffit au MVP (Zanzibar/Tanzanie = faible latence Europe/Afrique de l'Est) | Ex: Railway, Render, ou une VM sur DigitalOcean/Hetzner pour rester simple |

Ce choix privilégie la vitesse de mise en marché et la simplicité
opérationnelle plutôt que la scalabilité extrême — cohérent avec un lancement
sur une seule île avec un volume initial limité.

## 3. Modèle de données

Le schéma complet est implémenté dans
[`backend/db/migrations/001_init.sql`](../backend/db/migrations/001_init.sql).
Résumé :

### Entités principales

- **users** — touristes et résidents. `account_type` détermine `currency`
  (USD/TZS) et si une vérification de document est nécessaire. Un résident ne
  peut réserver au tarif local qu'une fois `verification_status = 'verified'`.
- **drivers** — Taxi Partners. `verification_status` bloque l'attribution de
  courses tant que non validé. Le `vehicle_qr_code` est généré une seule fois,
  au moment de la validation — il ne change plus jamais ensuite (contrairement
  au QR colis).
- **hotels** — partenaires logistiques, inscription simplifiée.
- **trips** — une course, quel que soit son type (`private`, `shared_tourist`,
  `shared_local`, `posted_return`). Le statut suit le flux métier :
  `requested → driver_confirmed → paid → in_progress → completed`
  (ou `cancelled`).
- **packages** — un colis. Statut : `created → paid → picked_up → delivered`.
  Le `sender_type` détermine si c'est un user ou un hotel qui a créé la
  demande — une contrainte SQL (`chk_sender_reference`) empêche d'avoir les
  deux à la fois ou aucun.
- **payments** — lien de paiement Pesapal + statut. Rattaché soit à un trip,
  soit à un package, jamais les deux (contrainte SQL `chk_payment_target`).
- **driver_monthly_stats** — support du programme de fidélité mensuel
  (courses, note moyenne, retards, badge "chauffeur du mois").

### Choix de conception notables

- **ENUMs PostgreSQL natifs** pour tous les statuts (`trip_status`,
  `package_status`, `verification_status`, etc.) — empêche par construction
  qu'une ligne se retrouve dans un état invalide, ce qu'un simple VARCHAR ne
  garantirait pas.
- **Prix et commission stockés sur chaque trip/package au moment de la
  création**, plutôt que recalculés à la volée depuis la grille tarifaire. Si
  la grille change dans le temps, l'historique reste fidèle au prix réellement
  payé.
- **`updated_at` automatique via triggers PostgreSQL** — évite d'oublier de le
  mettre à jour dans une route.
- **Contraintes CHECK plutôt que validation applicative seule** pour les
  invariants critiques (référence expéditeur colis, cible paiement) — la
  donnée reste cohérente même si un bug applicatif tente d'insérer n'importe
  quoi.

## 4. Référence API

Toutes les routes sont préfixées par `/api`. Réponses en JSON. Voir le code
dans [`backend/src/routes/`](../backend/src/routes/) pour le détail des
payloads (validés par Zod), et la table complète des endpoints dans
[`backend/README.md`](../backend/README.md).

Résumé : 6 groupes de routes — utilisateurs, chauffeurs, hôtels, trajets,
colis, paiements — soit ~25 endpoints exposant les actions granulaires du flux
métier (`assign-driver`, `payment`, `confirm`, `start`, `complete`, `rating`,
`pickup`, `deliver`, lookup par QR).

## 5. Flux métier implémentés

Les deux flux complets du cahier des charges sont couverts de bout en bout et
testés avec de vraies requêtes contre une vraie base PostgreSQL (voir §8) :

- **Réservation passager** : `POST /trips` → `PATCH /trips/:id/assign-driver`
  → `POST /trips/:id/payment` → `POST /payments/:id/confirm` →
  `PATCH /trips/:id/start` → `PATCH /trips/:id/complete` →
  `POST /trips/:id/rating`.
- **Demande de colis** : `POST /packages` → `POST /packages/:id/payment` →
  `POST /payments/:id/confirm` → `PATCH /packages/:id/pickup` →
  `PATCH /packages/:id/deliver`.

Règles métier vérifiées par le code (pas seulement documentées) :

- Le paiement ne peut être demandé qu'après confirmation d'un chauffeur
  (jamais avant).
- Le tarif résident (`shared_local`) est refusé tant que le compte n'est pas
  `verified` — testé et confirmé fonctionnel.
- Le scan de départ/arrivée vérifie que le QR scanné correspond bien au
  véhicule assigné à la course, pas n'importe quel QR.
- Une course ne peut être notée qu'une fois (rating déjà posé →
  `409 Conflict`).

## 6. Plan d'intégration des services tiers

### Pesapal (paiement)

MVP : `src/services/pesapalService.js` est un stub qui simule un lien de
paiement. Pour la vraie intégration : authentification OAuth via
`consumer_key`/`consumer_secret`, appel `SubmitOrderRequest` pour obtenir une
vraie `redirect_url`, puis configurer un endpoint IPN (déjà prévu :
`POST /payments/:id/confirm` peut devenir cet endpoint, avec en plus une
vérification de signature Pesapal).

### WhatsApp Business (notification équipe)

MVP : `src/services/whatsappService.js` génère un lien `wa.me/...?text=...`
que l'équipe ouvre manuellement pour contacter chauffeurs/clients. Aucune API
payante nécessaire. V2 : remplacer par l'API WhatsApp Business officielle pour
automatiser l'envoi et recevoir les réponses des chauffeurs directement dans
le back-office.

### Google Maps / Mapbox

Pas encore implémenté dans ce socle de démarrage. Nécessaire pour :
localisation des chauffeurs disponibles en temps réel (taxi privé), calcul de
zone à partir d'une adresse, affichage du point de rendez-vous exact.
Recommandation : Mapbox (moins cher à volume faible/moyen que Google Maps)
sauf si l'équipe a déjà une clé Google Maps.

### QR codes

Déjà implémenté (`src/services/qrService.js`). Génération côté serveur :
`crypto.randomUUID()` suffit, pas besoin de service tiers. Le rendu visuel du
QR (image) se fait côté app avec une librairie standard (`qrcode` en JS,
`react-native-qrcode-svg` pour l'app mobile).

## 7. Sécurité et conformité — à ajouter avant la production

Ce socle de démarrage ne contient volontairement pas ces éléments, pour rester
lisible comme point de départ. Ils sont indispensables avant un vrai
lancement :

- **Authentification** : aucune actuellement. Ajouter JWT (ou sessions) + hash
  de mot de passe (ou OTP par SMS, plus adapté au marché local) sur toutes les
  routes sensibles.
- **Autorisation** : vérifier qu'un utilisateur ne peut agir que sur ses
  propres ressources (ex: un chauffeur ne doit pouvoir scanner que ses propres
  courses assignées).
- **Upload de fichiers réel** : les routes actuelles acceptent une URL de
  document déjà hébergée. Il faut un endpoint d'upload (vers S3/R2) avec
  limite de taille et de type de fichier.
- **Rate limiting** sur les routes publiques (inscription, création de
  trajet).
- **Logs structurés + monitoring** (ex: Sentry pour les erreurs, un dashboard
  de métriques basique).
- **Tests automatisés** : ce socle est testé par un script de bout en bout
  (`scripts/smoke-test.js`) avec des requêtes réelles, mais n'a pas de suite
  de tests unitaires (Jest/Supertest) — à ajouter avant que l'équipe
  grandisse, pour éviter les régressions.
- **RGPD / protection des données** : les documents d'identité et permis sont
  des données sensibles — chiffrement au repos, durée de conservation définie,
  accès restreint.

## 8. Ce qui a été construit et vérifié

- **Schéma PostgreSQL complet** (7 tables, contraintes, index, triggers) —
  appliqué avec succès sur une vraie base PostgreSQL 16.
- **API Express complète** (6 routers, ~25 endpoints) branchée sur cette base.
- **Scénarios testés avec de vraies requêtes HTTP** contre le serveur
  réellement démarré (37 vérifications, script `npm run smoke-test`) :
  inscription touriste, inscription résident + blocage tarif local avant
  vérification, candidature + validation chauffeur (génération QR véhicule),
  cycle complet d'une course privée (demande → assignation → paiement → départ
  → arrivée → notation → mise à jour de la note moyenne du chauffeur), cycle
  complet d'un colis envoyé par un hôtel (demande → paiement → ramassage avec
  photo → livraison avec photo → recherche par QR).
- Les messages d'erreur portent chacun leur vrai code métier (jamais
  `internal_error` pour une erreur 4xx).

## 9. Prochaines étapes suggérées

1. Choisir l'approche d'**authentification** (JWT + OTP SMS recommandé pour ce
   marché).
2. Ajouter l'**upload de fichiers réel** (S3/R2) pour documents et photos.
3. Démarrer l'**app mobile React Native**, en consommant cette API telle
   quelle.
4. Intégrer réellement **Pesapal** (remplacer le stub).
5. Ajouter les **tests automatisés** avant que l'équipe de développement
   grandisse.
6. Décider de l'**hébergement** (base de données + API) et mettre en place un
   déploiement simple (CI basique : lint + tests + déploiement sur push sur
   main).
