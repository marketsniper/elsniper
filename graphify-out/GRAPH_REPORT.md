# Graph Report - elsniper  (2026-09-03)

## Corpus Check
- 252 files · ~338,357 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1611 nodes · 4846 edges · 139 communities (65 shown, 38 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 140 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `50041a02`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- authHeaders
- pricingService.js
- couleurs
- champ
- app.js
- types.ts
- requete
- expo
- i18n.tsx
- CarteTrajet.web.tsx
- backend/package.json
- HttpError
- 001_init.sql
- LaCourse.tsx
- useT
- config.js
- theme.ts
- api.ts
- CalendrierDate.tsx
- rides.js
- notifierEquipe
- hotels.js
- trip/[id].tsx
- query
- rentalVehicles.js
- normaliserLieu
- packages.js
- dependencies
- reveillerServeur
- trips.js
- EcranHotelEquipe
- app/_layout.tsx
- equipe.tsx
- EcranReserver
- alertesPush.ts
- include
- EcranFicheVehicule
- imports-natifs.test.js
- peaux-contraste.test.js
- colisLocal.ts
- EcranTaxiEquipe
- EcranTrajet
- mobile/package.json
- smoke-test.js
- zanziGo — Architecture technique (v0.1, MVP)
- EcranAnnonces
- ui.tsx
- scripts
- SessionAuth
- mise-a-jour.js
- service-worker.js
- marque-colobe.test.js
- zanziGo — Backend API (MVP)
- fabriquer.py
- service-worker-hors-ligne.test.js
- soleil-zanzibar.test.js
- Les mises à jour de l'application, en clair
- installation.js
- Référence API
- verifier.py
- publier.sh
- preparer.py
- rendre.mjs
- 002_auth.sql
- 025_fichiers_en_base.sql
- 027_inscription_chauffeur_en_attente.sql
- 029_notifications_push.sql
- rafraichir-web.sh
- expo-camera
- expo-constants
- expo-device
- expo-font
- expo-glass-effect
- expo-image
- expo-image-picker
- expo-secure-store
- expo-status-bar
- expo-symbols
- @expo/ui
- expo-updates
- @expo/vector-icons
- expo-web-browser
- expo-location
- react
- react-dom
- react-native
- react-native-qrcode-svg
- react-native-reanimated
- react-native-safe-area-context
- react-native-screens
- react-native-svg
- react-native-web
- react-native-worklets
- position.ts
- frein-durgence.sh
- Étapes de déploiement
- EcranScanner
- README.md
- Mise en ligne de zanziGo — pas à pas
- zanziGo — application mobile
- 6. Plan d'intégration des services tiers
- Le logotype zanziGo, et l'icône qui en dérive
- Unguja en volume — le rendu 3D de l'île

## God Nodes (most connected - your core abstractions)
1. `useT()` - 112 edges
2. `requete()` - 91 edges
3. `authHeaders()` - 75 edges
4. `adminHeaders()` - 66 edges
5. `champ()` - 60 edges
6. `couleurs` - 58 edges
7. `stylesReactifs()` - 54 edges
8. `espaces` - 52 edges
9. `useTestDb()` - 50 edges
10. `app` - 48 edges

## Surprising Connections (you probably didn't know these)
- `isPayer()` --calls--> `query()`  [EXTRACTED]
  backend/src/routes/payments.js → backend/src/db.js
- `getPhotos()` --calls--> `query()`  [EXTRACTED]
  backend/src/routes/rentalVehicles.js → backend/src/db.js
- `poserPosition()` --calls--> `query()`  [EXTRACTED]
  backend/test/diffusion-bourse.test.js → backend/src/db.js
- `refuserSiOtpFerme()` --calls--> `HttpError`  [EXTRACTED]
  backend/src/routes/auth.js → backend/src/errors.js
- `courseConfirmee()` --calls--> `adminHeaders()`  [EXTRACTED]
  backend/test/alerte-paiement-a-encaisser.test.js → backend/test/setup.js

## Import Cycles
- None detected.

## Communities (139 total, 38 thin omitted)

### Community 0 - "authHeaders"
Cohesion: 0.06
Nodes (77): migrationsDir, pool, coursePayee(), posterAnnonce(), reserverEtPayer(), annonceReservee(), coursePrete(), payer() (+69 more)

### Community 1 - "pricingService.js"
Cohesion: 0.05
Nodes (68): round2(), sansPrixDePlace(), valeurReservationPlace(), AEROPORT, ANCIENS_LIBELLES_AEROPORT, RIDE_DESTINATIONS, RIDE_ORIGINS, RIDE_ORIGINS_ACCEPTES (+60 more)

### Community 2 - "couleurs"
Cohesion: 0.11
Nodes (53): styles, styles, styles, styles, styles, CLES_PROFIL, Mode, styles (+45 more)

### Community 3 - "champ"
Cohesion: 0.09
Nodes (55): EcranHotelConnexion(), EcranPro(), EcranColisDispo(), styles, EcranCompteChauffeur(), initiales(), CaseChauffeur, EcranCourses() (+47 more)

### Community 4 - "app.js"
Cohesion: 0.09
Nodes (28): createApp(), makeLimiter(), otpLimiter, publicPostLimiter, uploadLimiter, isAdmin(), requireAdmin(), requireAuth() (+20 more)

### Community 5 - "types.ts"
Cohesion: 0.05
Nodes (45): ALIAS_AEROPORT, AnnulationVehicule, CHAINE_COTE_EST, COMMISSION_PRIVE, COORDONNEES_VILLES, ETAPES_COLIS, GROUPES_NET_USD, HUBS_RIDES (+37 more)

### Community 6 - "requete"
Cohesion: 0.05
Nodes (45): EcranHotelInscription(), EcranOtp(), EcranTelephone(), normaliserTelephone(), EcranDetailColis(), abonnerAlertes(), abonnerAlertesChauffeur(), annulerAttentePartage() (+37 more)

### Community 7 - "expo"
Cohesion: 0.05
Nodes (39): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, predictiveBackGestureEnabled, projectId (+31 more)

### Community 8 - "i18n.tsx"
Cohesion: 0.08
Nodes (31): EcranNouveauColis(), PRESENTATION_TAILLES, styles, ModeCourse, IconeCategorie, ICONES, NomMci, Depliant() (+23 more)

### Community 9 - "CarteTrajet.web.tsx"
Cohesion: 0.20
Nodes (15): styles, styles, CarteTrajet(), ProprietesCarteTrajet, CarteTrajet(), chargerLeaflet(), Leaflet, styles (+7 more)

### Community 10 - "backend/package.json"
Cohesion: 0.05
Nodes (36): @aws-sdk/client-s3, dependencies, @aws-sdk/client-s3, dotenv, express, express-rate-limit, jsonwebtoken, multer (+28 more)

### Community 11 - "HttpError"
Cohesion: 0.26
Nodes (13): HttpError, invalidStatus(), uploadUnFichier(), base(), BASES, capturePaypalOrder(), circuitPaiementUsd(), createPaypalOrder() (+5 more)

### Community 12 - "001_init.sql"
Cohesion: 0.10
Nodes (27): driver_monthly_stats, drivers, hotels, packages, payments, set_updated_at(), trg_driver_monthly_stats_updated_at, trg_drivers_updated_at (+19 more)

### Community 13 - "LaCourse.tsx"
Cohesion: 0.11
Nodes (24): bruit(), Canopee(), ColobeVoyageur(), Espece, Souffle(), Bande(), BasCote(), bruit() (+16 more)

### Community 14 - "useT"
Cohesion: 0.12
Nodes (19): EcranAccueil(), ProfilAccueil, styles, EcranClient(), LayoutAuth(), Colobe(), ConsigneJozani(), styles (+11 more)

### Community 15 - "config.js"
Cohesion: 0.17
Nodes (17): config, enShillings(), MOYEN_CARTE, MOYEN_CREDIT, MOYEN_MOBILE, moyenParDefaut(), moyensPour(), reglement() (+9 more)

### Community 16 - "theme.ts"
Cohesion: 0.07
Nodes (24): Etoiles(), styles, appliquerPeau(), BENTO, ContextePeau, ContexteSoleil, ESTRAN, familleSelonPoids() (+16 more)

### Community 17 - "api.ts"
Cohesion: 0.06
Nodes (54): EcranEquipe(), AbonnementPush, AnnulationPlace, assignerChauffeur(), AttentePartage, bannirClient(), BASE_URL, BonFidelite (+46 more)

### Community 18 - "CalendrierDate.tsx"
Cohesion: 0.36
Nodes (7): aMinuit(), CalendrierDate(), LOCALES, memeMois(), styles, ymd(), Langue

### Community 19 - "rides.js"
Cohesion: 0.14
Nodes (24): withTransaction(), appliquerConfirmation(), isPayer(), moyenSchema, notifierPaiementConfirme(), baseFacturePlace(), createRideSchema, PRICING_TZS (+16 more)

### Community 20 - "notifierEquipe"
Cohesion: 0.21
Nodes (12): verifierExpirationsDocuments(), annulerReservationsImpayees(), cloturerRidesPartis(), signalerAttentesCorrespondantes(), validerParrainageApresCourse(), app, messageAlerte(), signalerCoursesFigees() (+4 more)

### Community 21 - "hotels.js"
Cohesion: 0.09
Nodes (30): authRouter, phoneSchema, refuserSiOtpFerme(), usernameSchema, sanitizeDriver(), alerteDemandeRecharge(), assertHotelVerified(), COURSES_PAR_BON (+22 more)

### Community 22 - "trip/[id].tsx"
Cohesion: 0.11
Nodes (40): EcranAnnonce(), styles, EcranDetailCourse(), styles, styles, EcranLocation(), styles, EcranPlace() (+32 more)

### Community 23 - "query"
Cohesion: 0.14
Nodes (24): query(), notFound(), abonnementSchema, chauffeurDuJeton(), getPackage(), getPayment(), getVehicle(), getTrip() (+16 more)

### Community 24 - "rentalVehicles.js"
Cohesion: 0.13
Nodes (11): bookSchema, champsVehicule, COLONNES_SQL, createVehicleSchema, getPhotos(), RENTAL_CATEGORIES, router, updateVehicleSchema (+3 more)

### Community 25 - "normaliserLieu"
Cohesion: 0.20
Nodes (15): baseUsdItineraire(), dansLeGroupe(), estAeroportVille(), estTarifDeTerrain(), forfaitZanzigoTrajetUsd(), kmEntreVilles(), netChaineCoteEst(), netChauffeurPriveUsd() (+7 more)

### Community 26 - "packages.js"
Cohesion: 0.18
Nodes (10): createPackageSchema, router, scanSchema, alertePaiementColis(), alertePaiementCourse(), aValiderALaMain(), quand(), generatePackageQr() (+2 more)

### Community 27 - "dependencies"
Cohesion: 0.13
Nodes (15): expo, expo-blur, expo-linking, expo-router, expo-splash-screen, expo-system-ui, dependencies, expo (+7 more)

### Community 28 - "reveillerServeur"
Cohesion: 0.50
Nodes (4): LayoutRacine(), attendre(), fetchAvecTimeout(), reveillerServeur()

### Community 29 - "trips.js"
Cohesion: 0.09
Nodes (37): createDriverSchema, documentsSchema, motDePasseSchema, photoSchema, searchSchema, verifySchema, sansSecretsChauffeur(), assignDriverSchema (+29 more)

### Community 30 - "EcranHotelEquipe"
Cohesion: 0.22
Nodes (9): EcranHotelEquipe(), EcranVerifications(), crediterHotel(), listerColisHotel(), listerTrajetsHotel(), verifierChauffeur(), verifierClient(), verifierHotel() (+1 more)

### Community 31 - "app/_layout.tsx"
Cohesion: 0.07
Nodes (36): CadreApplication(), PEAUX_CLAIRES, PilesNavigation(), RetourEntete(), THEME_CLAIR, THEME_SOMBRE, FournisseurDialogues(), styles (+28 more)

### Community 32 - "equipe.tsx"
Cohesion: 0.08
Nodes (38): libelleChauffeur(), MOYEN_RECHARGE, SectionEquipe, styles, EcranFicheVehiculeLocation(), EcranNouveauVehicule(), FORMAT_DATE_OK(), EcranVehicules() (+30 more)

### Community 33 - "EcranReserver"
Cohesion: 0.22
Nodes (10): EcranReserver(), creerAttentePartage(), creerTrajet(), creerTrajetHotel(), partagerPointRendezVous(), compteVerifie(), dureeRouteMinutes(), localVerifie() (+2 more)

### Community 34 - "alertesPush.ts"
Cohesion: 0.26
Nodes (12): CarteAlertes(), activerAlertes(), alertesPossibles(), CibleAlertes, cleEnOctets(), desactiverAlertes(), ecouterAlertes(), etatAlertes (+4 more)

### Community 35 - "include"
Cohesion: 0.15
Nodes (12): compilerOptions, paths, strict, extends, include, @/assets/*, ./assets/*, expo-env.d.ts (+4 more)

### Community 36 - "EcranFicheVehicule"
Cohesion: 0.29
Nodes (7): EcranFicheVehicule(), FORMAT_DATE_OK(), ajouterPhotoVehicule(), archiverVehicule(), majVehicule(), obtenirVehicule(), supprimerPhotoVehicule()

### Community 37 - "imports-natifs.test.js"
Cohesion: 0.17
Nodes (7): CONTRAT, fichiers, ICI, MOBILE, requireMobile, SRC, ts

### Community 38 - "peaux-contraste.test.js"
Cohesion: 0.20
Nodes (10): canalLineaire(), contraste(), COURANT, GRAS, luminance(), NOMS_DE_PEAU, PALETTES, preference (+2 more)

### Community 39 - "colisLocal.ts"
Cohesion: 0.33
Nodes (11): ajouter(), ajouterColisLocal(), ajouterCourseLocale(), cle(), effacerColisMasques(), lister(), listerColisLocaux(), listerColisMasques() (+3 more)

### Community 40 - "EcranTaxiEquipe"
Cohesion: 0.14
Nodes (15): EcranProfil(), initiales(), EcranTaxiEquipe(), convertirBonEnCredit(), definirMotDePasseChauffeur(), demanderRechargeCredit(), demandesRechargeHotel(), listerCoursesChauffeur() (+7 more)

### Community 41 - "EcranTrajet"
Cohesion: 0.22
Nodes (9): EcranTrajet(), annulerTrajet(), noterTrajet(), obtenirTrajet(), payerTrajet(), payerTrajetAvecCredit(), positionDeMonChauffeur(), dureeApprocheMinutes() (+1 more)

### Community 42 - "mobile/package.json"
Cohesion: 0.20
Nodes (9): devDependencies, @types/react, typescript, main, name, private, version, @types/react (+1 more)

### Community 44 - "smoke-test.js"
Cohesion: 0.36
Nodes (8): ADMIN, authenticate(), bearer(), call(), check(), main(), PHONES, run

### Community 45 - "zanziGo — Architecture technique (v0.1, MVP)"
Cohesion: 0.18
Nodes (11): 1. Vue d'ensemble de l'architecture, 2. Stack technique retenue, 3. Modèle de données, 4. Référence API, 5. Flux métier implémentés, 7. Sécurité et conformité — à ajouter avant la production, 8. Ce qui a été construit et vérifié, 9. Prochaines étapes suggérées (+3 more)

### Community 46 - "EcranAnnonces"
Cohesion: 0.14
Nodes (15): EcranAnnonces(), creerRide(), lieuxRides(), netPlacePartageeTzs(), netPlacePartageeUsd(), normaliserVille(), partagePossibleItineraire(), tarifLocalMiniTzs() (+7 more)

### Community 47 - "ui.tsx"
Cohesion: 0.16
Nodes (15): icone(), LayoutChauffeur(), icone(), LayoutOnglets(), ComposantFlou, LIBELLES_PEAU, MarqueEntete(), NomIonicons (+7 more)

### Community 49 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, android, ios, lint, reset-project, start, web

### Community 52 - "mise-a-jour.js"
Cohesion: 0.60
Nodes (5): controler(), memoire(), occupe(), retenir(), versionChargee()

### Community 53 - "service-worker.js"
Cohesion: 0.47
Nodes (3): ecranAttente(), reponsePage(), reseau()

### Community 54 - "marque-colobe.test.js"
Cohesion: 0.33
Nodes (3): ICI, SVG, TSX

### Community 55 - "zanziGo — Backend API (MVP)"
Cohesion: 0.20
Nodes (10): Authentification, Format des erreurs, Installation, Paiement Pesapal, Prérequis, Reste à faire avant la production, Structure, Tests (+2 more)

### Community 56 - "fabriquer.py"
Cohesion: 0.33
Nodes (5): composer(), lettres(), L'ICÔNE zanziGo : le monogramme « zG », dans la police de l'application. Le…, Dessine les glyphes en transparent, puis les recadre sur leur encre., Le monogramme, occupant `part` de la largeur, centré sur `fond`.

### Community 58 - "soleil-zanzibar.test.js"
Cohesion: 0.40
Nodes (3): ICI, REPERES, SOLEIL

### Community 59 - "Les mises à jour de l'application, en clair"
Cohesion: 0.20
Nodes (9): C'est arrivé le 21 août 2026, Ce qui part tout seul, et ce qui ne part pas, Comment savoir, depuis un téléphone, si les mises à jour arrivent, Le fichier qui fait autorité : `mobile/binaire.json`, Le jour où il faudra du natif, Le vrai danger n'est pas celui qu'on croit, Les mises à jour de l'application, en clair, Les trois commandes (+1 more)

### Community 61 - "Référence API"
Cohesion: 0.22
Nodes (9): Authentification, Chauffeurs, Colis, Hôtels, Paiements, Référence API, Trajets, Upload (+1 more)

### Community 96 - "position.ts"
Cohesion: 0.47
Nodes (5): Position, positionActuelle(), positionNative(), positionWeb(), ResultatPosition

### Community 131 - "Étapes de déploiement"
Cohesion: 0.22
Nodes (8): 1. Provisionner PostgreSQL 16 managé, 2. Définir les variables d'environnement, 3. Migrations à chaque déploiement, 4. Stockage des fichiers : Cloudflare R2 recommandé, Déploiement zanziGo (backend), Options d'hébergement, Sécurité — rappels, Étapes de déploiement

### Community 132 - "EcranScanner"
Cohesion: 0.33
Nodes (6): EcranScanner(), estQrColis(), colisParQr(), livrerColis(), prochaineActionColis(), recupererColis()

### Community 134 - "README.md"
Cohesion: 0.33
Nodes (3): Contenu du dépôt, Démarrage rapide, zanziGo

### Community 135 - "Mise en ligne de zanziGo — pas à pas"
Cohesion: 0.29
Nodes (6): Mise en ligne de zanziGo — pas à pas, Plus tard (avant le vrai lancement), Étape 1 — Mettre le serveur en ligne (Render, gratuit), Étape 2 — Construire l'app installable (Expo / EAS), Étape 3 — Brancher l'app sur le serveur en ligne, Étape 4 — Le numéro WhatsApp de l'équipe

### Community 136 - "zanziGo — application mobile"
Cohesion: 0.29
Nodes (7): Comptes de test (flux OTP en mode dev), Configuration de l'API, Fonctionnalités, Lancer l'application, Notes techniques, Prérequis, zanziGo — application mobile

### Community 137 - "6. Plan d'intégration des services tiers"
Cohesion: 0.40
Nodes (5): 6. Plan d'intégration des services tiers, Google Maps / Mapbox, Pesapal (paiement), QR codes, WhatsApp Business (notification équipe)

### Community 138 - "Le logotype zanziGo, et l'icône qui en dérive"
Cohesion: 0.50
Nodes (3): L'icône, Le logotype zanziGo, et l'icône qui en dérive, Rejouer

### Community 139 - "Unguja en volume — le rendu 3D de l'île"
Cohesion: 0.50
Nodes (3): Ce que l'image contient, Refaire le rendu, Unguja en volume — le rendu 3D de l'île

## Knowledge Gaps
- **454 isolated node(s):** `otp_codes`, `uploaded_files`, `driver_signups`, `push_subscriptions`, `name` (+449 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 566 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `expo-router` connect `couleurs` to `equipe.tsx`, `champ`, `expo`, `i18n.tsx`, `choix.tsx`, `useT`, `ui.tsx`, `trip/[id].tsx`, `app/_layout.tsx`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `plugins` connect `expo` to `couleurs`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `otp_codes`, `uploaded_files`, `driver_signups` to the rest of the system?**
  _454 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `authHeaders` be split into smaller, more focused modules?**
  _Cohesion score 0.05519013360739979 - nodes in this community are weakly interconnected._
- **Should `pricingService.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05228105228105228 - nodes in this community are weakly interconnected._
- **Should `couleurs` be split into smaller, more focused modules?**
  _Cohesion score 0.10882882882882883 - nodes in this community are weakly interconnected._
- **Should `champ` be split into smaller, more focused modules?**
  _Cohesion score 0.08630952380952381 - nodes in this community are weakly interconnected._