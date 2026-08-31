# Graph Report - elsniper  (2026-08-31)

## Corpus Check
- 251 files · ~335,295 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1599 nodes · 4811 edges · 142 communities (69 shown, 37 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 140 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f8e84a3b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- authHeaders
- pricingService.js
- espaces
- ui.tsx
- app.js
- types.ts
- api.ts
- expo
- i18n.tsx
- CarteTrajet.web.tsx
- backend/package.json
- paypalService.js
- 001_init.sql
- LaCourse.tsx
- useT
- payments.js
- theme.ts
- EcranEquipe
- BoiteDialogue.tsx
- rides.js
- notifierEquipe
- drivers.js
- trip/[id].tsx
- query
- rentalVehicles.js
- normaliserLieu
- packages.js
- dependencies
- app/_layout.tsx
- trips.js
- EcranFicheVehicule
- FondPlage.tsx
- preferencePeau.tsx
- reserver.tsx
- CarteAlertes.tsx
- include
- imports-natifs.test.js
- peaux-contraste.test.js
- lireStockage
- auth.tsx
- EcranTrajet
- mobile/package.json
- CalendrierDate.tsx
- smoke-test.js
- zanziGo — Architecture technique (v0.1, MVP)
- RidesPartages
- EcranTelephone
- soleil.ts
- scripts
- definirCleEquipe
- equipe.tsx
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
- Devise
- README.md
- Mise en ligne de zanziGo — pas à pas
- zanziGo — application mobile
- 6. Plan d'intégration des services tiers
- Le logotype zanziGo, et l'icône qui en dérive
- Unguja en volume — le rendu 3D de l'île
- TypeTrajet

## God Nodes (most connected - your core abstractions)
1. `useT()` - 110 edges
2. `requete()` - 91 edges
3. `authHeaders()` - 75 edges
4. `adminHeaders()` - 66 edges
5. `champ()` - 60 edges
6. `couleurs` - 57 edges
7. `stylesReactifs()` - 53 edges
8. `espaces` - 51 edges
9. `useTestDb()` - 50 edges
10. `app` - 48 edges

## Surprising Connections (you probably didn't know these)
- `makeLimiter()` --calls--> `isAdmin()`  [EXTRACTED]
  backend/src/app.js → backend/src/middleware/auth.js
- `getPhotos()` --calls--> `query()`  [EXTRACTED]
  backend/src/routes/rentalVehicles.js → backend/src/db.js
- `refuserSiOtpFerme()` --calls--> `HttpError`  [EXTRACTED]
  backend/src/routes/auth.js → backend/src/errors.js
- `courseConfirmee()` --calls--> `adminHeaders()`  [EXTRACTED]
  backend/test/alerte-paiement-a-encaisser.test.js → backend/test/setup.js
- `RetourEntete()` --calls--> `useT()`  [EXTRACTED]
  mobile/src/app/_layout.tsx → mobile/src/lib/i18n.tsx

## Import Cycles
- None detected.

## Communities (142 total, 37 thin omitted)

### Community 0 - "authHeaders"
Cohesion: 0.06
Nodes (76): migrationsDir, pool, coursePayee(), posterAnnonce(), reserverEtPayer(), annonceReservee(), coursePrete(), payer() (+68 more)

### Community 1 - "pricingService.js"
Cohesion: 0.06
Nodes (64): round2(), sansPrixDePlace(), valeurReservationPlace(), AEROPORT, ANCIENS_LIBELLES_AEROPORT, RIDE_DESTINATIONS, RIDE_ORIGINS, RIDE_ORIGINS_ACCEPTES (+56 more)

### Community 2 - "espaces"
Cohesion: 0.09
Nodes (36): EcranFicheVehiculeLocation(), styles, FiltreCategorie, Onglet, styles, styles, TON_STATUT, styles (+28 more)

### Community 3 - "ui.tsx"
Cohesion: 0.12
Nodes (41): EcranColisDispo(), styles, EcranDetailCourse(), styles, CaseChauffeur, EcranCourses(), styles, EcranColis() (+33 more)

### Community 4 - "app.js"
Cohesion: 0.10
Nodes (19): createApp(), makeLimiter(), otpLimiter, publicPostLimiter, uploadLimiter, asyncHandler(), errorHandler(), notificationsRouter (+11 more)

### Community 5 - "types.ts"
Cohesion: 0.05
Nodes (50): ALIAS_AEROPORT, AnnulationVehicule, CHAINE_COTE_EST, COMMISSION_PRIVE, COORDONNEES_VILLES, ETAPES_COLIS, GROUPES_NET_USD, HUBS_RIDES (+42 more)

### Community 6 - "api.ts"
Cohesion: 0.05
Nodes (65): EcranScanner(), estQrColis(), LayoutRacine(), AbonnementPush, abonnerAlertes(), abonnerAlertesChauffeur(), AnnulationPlace, annulerAttentePartage() (+57 more)

### Community 7 - "expo"
Cohesion: 0.05
Nodes (39): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, predictiveBackGestureEnabled, projectId (+31 more)

### Community 8 - "i18n.tsx"
Cohesion: 0.09
Nodes (28): EcranAnnonces(), styles, styles, EcranNouveauColis(), PRESENTATION_TAILLES, styles, LOCALES, styles (+20 more)

### Community 9 - "CarteTrajet.web.tsx"
Cohesion: 0.21
Nodes (14): styles, styles, CarteTrajet(), ProprietesCarteTrajet, CarteTrajet(), chargerLeaflet(), Leaflet, styles (+6 more)

### Community 10 - "backend/package.json"
Cohesion: 0.05
Nodes (36): @aws-sdk/client-s3, dependencies, @aws-sdk/client-s3, dotenv, express, express-rate-limit, jsonwebtoken, multer (+28 more)

### Community 11 - "paypalService.js"
Cohesion: 0.36
Nodes (10): base(), BASES, capturePaypalOrder(), circuitPaiementUsd(), createPaypalOrder(), getAccessToken(), hasPaypalMe(), isPaypalConfigured() (+2 more)

### Community 12 - "001_init.sql"
Cohesion: 0.10
Nodes (27): driver_monthly_stats, drivers, hotels, packages, payments, set_updated_at(), trg_driver_monthly_stats_updated_at, trg_drivers_updated_at (+19 more)

### Community 13 - "LaCourse.tsx"
Cohesion: 0.11
Nodes (24): bruit(), Canopee(), ColobeVoyageur(), Espece, Souffle(), Bande(), BasCote(), bruit() (+16 more)

### Community 14 - "useT"
Cohesion: 0.08
Nodes (56): EcranAccueil(), ProfilAccueil, styles, EcranClient(), styles, EcranHotelConnexion(), EcranHotelInscription(), styles (+48 more)

### Community 15 - "payments.js"
Cohesion: 0.14
Nodes (22): config, withTransaction(), appliquerConfirmation(), moyenSchema, notifierPaiementConfirme(), enShillings(), libelleMoyen(), MOYEN_CARTE (+14 more)

### Community 16 - "theme.ts"
Cohesion: 0.07
Nodes (26): Etoiles(), styles, BENTO, ContextePeau, ContexteSoleil, couleursStatutColis, couleursStatutTrajet, ESTRAN (+18 more)

### Community 17 - "EcranEquipe"
Cohesion: 0.09
Nodes (30): EcranEquipe(), assignerChauffeur(), bannirClient(), commeListe(), confirmerPaiementEquipe(), crediterDemandeRecharge(), fileRechargesCredit(), listerAnnoncesPartageEquipe() (+22 more)

### Community 18 - "BoiteDialogue.tsx"
Cohesion: 0.31
Nodes (7): FournisseurDialogues(), styles, reparerAlertesWeb(), DemandeDialogue, Ecouteur, ouvrirDialogue(), sabonnerAuxDialogues()

### Community 19 - "rides.js"
Cohesion: 0.24
Nodes (13): isAdmin(), requireAdmin(), baseFacturePlace(), createRideSchema, PRICING_TZS, pricingPourClient(), rideUsd(), rideWhatsappLink() (+5 more)

### Community 20 - "notifierEquipe"
Cohesion: 0.24
Nodes (11): verifierExpirationsDocuments(), annulerReservationsImpayees(), cloturerRidesPartis(), signalerAttentesCorrespondantes(), validerParrainageApresCourse(), messageAlerte(), signalerCoursesFigees(), notifierEquipe() (+3 more)

### Community 21 - "drivers.js"
Cohesion: 0.09
Nodes (31): authRouter, phoneSchema, refuserSiOtpFerme(), usernameSchema, createDriverSchema, documentsSchema, motDePasseSchema, photoSchema (+23 more)

### Community 22 - "trip/[id].tsx"
Cohesion: 0.14
Nodes (33): EcranAnnonce(), styles, styles, EcranLocation(), styles, EcranDetailColis(), styles, EcranPlace() (+25 more)

### Community 23 - "query"
Cohesion: 0.13
Nodes (26): query(), notFound(), abonnementSchema, chauffeurDuJeton(), getPackage(), getPayment(), isPayer(), getVehicle() (+18 more)

### Community 24 - "rentalVehicles.js"
Cohesion: 0.11
Nodes (16): bookSchema, champsVehicule, COLONNES_SQL, createVehicleSchema, getPhotos(), RENTAL_CATEGORIES, router, updateVehicleSchema (+8 more)

### Community 25 - "normaliserLieu"
Cohesion: 0.21
Nodes (14): baseUsdItineraire(), dansLeGroupe(), estAeroportVille(), estTarifDeTerrain(), forfaitZanzigoTrajetUsd(), kmEntreVilles(), netChaineCoteEst(), netChauffeurPriveUsd() (+6 more)

### Community 26 - "packages.js"
Cohesion: 0.11
Nodes (27): HttpError, invalidStatus(), requireAuth(), alerteDemandeRecharge(), assertHotelVerified(), COURSES_PAR_BON, createHotelSchema, creditSchema (+19 more)

### Community 27 - "dependencies"
Cohesion: 0.13
Nodes (15): expo, expo-blur, expo-linking, expo-router, expo-splash-screen, expo-system-ui, dependencies, expo (+7 more)

### Community 28 - "app/_layout.tsx"
Cohesion: 0.25
Nodes (8): CadreApplication(), PEAUX_CLAIRES, PilesNavigation(), RetourEntete(), THEME_CLAIR, THEME_SOMBRE, FICHIERS_POLICES, usePeau()

### Community 29 - "trips.js"
Cohesion: 0.11
Nodes (32): sansSecretsChauffeur(), assignDriverSchema, avecAnnonceGroupe(), courseSansIdentiteClient(), createTripSchema, positionSchema, purgeSchema, ratingSchema (+24 more)

### Community 30 - "EcranFicheVehicule"
Cohesion: 0.17
Nodes (12): EcranFicheVehicule(), FORMAT_DATE_OK(), EcranVerifications(), ajouterPhotoVehicule(), archiverVehicule(), majVehicule(), obtenirVehicule(), supprimerPhotoVehicule() (+4 more)

### Community 31 - "FondPlage.tsx"
Cohesion: 0.18
Nodes (13): AMPLITUDES, bruit(), cheminBande(), EcumeDeZanzibar(), EstranDeZanzibar(), GRAINES, HALOS, HALOS_GIROFLE (+5 more)

### Community 32 - "preferencePeau.tsx"
Cohesion: 0.28
Nodes (8): Contexte, ContextePreference, FournisseurPreferencePeau(), peauValide(), PEAUX_AU_CHOIX, appliquerPeau(), FournisseurPeau(), NomPeau

### Community 33 - "reserver.tsx"
Cohesion: 0.14
Nodes (18): EcranReserver(), ModeCourse, CreationUtilisateur, creerAttentePartage(), creerTrajet(), creerTrajetHotel(), formaterDateChoisie(), isoDepuisDateHeure() (+10 more)

### Community 34 - "CarteAlertes.tsx"
Cohesion: 0.30
Nodes (12): CarteAlertes(), activerAlertes(), alertesPossibles(), CibleAlertes, cleEnOctets(), desactiverAlertes(), ecouterAlertes(), etatAlertes (+4 more)

### Community 35 - "include"
Cohesion: 0.15
Nodes (12): compilerOptions, paths, strict, extends, include, @/assets/*, ./assets/*, expo-env.d.ts (+4 more)

### Community 37 - "imports-natifs.test.js"
Cohesion: 0.17
Nodes (7): CONTRAT, fichiers, ICI, MOBILE, requireMobile, SRC, ts

### Community 38 - "peaux-contraste.test.js"
Cohesion: 0.20
Nodes (10): canalLineaire(), contraste(), COURANT, GRAS, luminance(), NOMS_DE_PEAU, PALETTES, preference (+2 more)

### Community 39 - "lireStockage"
Cohesion: 0.26
Nodes (14): ajouter(), ajouterColisLocal(), ajouterCourseLocale(), cle(), effacerColisMasques(), lister(), listerColisLocaux(), listerColisMasques() (+6 more)

### Community 40 - "auth.tsx"
Cohesion: 0.13
Nodes (20): EcranHotelEquipe(), EcranProfil(), initiales(), convertirBonEnCredit(), crediterHotel(), definirJeton(), demanderRechargeCredit(), demandesRechargeHotel() (+12 more)

### Community 41 - "EcranTrajet"
Cohesion: 0.18
Nodes (11): EcranTrajet(), annulerTrajet(), confirmerPaiement(), noterTrajet(), obtenirTrajet(), partagerPointRendezVous(), payerTrajet(), payerTrajetAvecCredit() (+3 more)

### Community 42 - "mobile/package.json"
Cohesion: 0.20
Nodes (9): devDependencies, @types/react, typescript, main, name, private, version, @types/react (+1 more)

### Community 43 - "CalendrierDate.tsx"
Cohesion: 0.36
Nodes (7): aMinuit(), CalendrierDate(), LOCALES, memeMois(), styles, ymd(), Langue

### Community 44 - "smoke-test.js"
Cohesion: 0.36
Nodes (8): ADMIN, authenticate(), bearer(), call(), check(), main(), PHONES, run

### Community 45 - "zanziGo — Architecture technique (v0.1, MVP)"
Cohesion: 0.18
Nodes (11): 1. Vue d'ensemble de l'architecture, 2. Stack technique retenue, 3. Modèle de données, 4. Référence API, 5. Flux métier implémentés, 7. Sécurité et conformité — à ajouter avant la production, 8. Ce qui a été construit et vérifié, 9. Prochaines étapes suggérées (+3 more)

### Community 46 - "RidesPartages"
Cohesion: 0.33
Nodes (6): heureDepart(), libelleJour(), RidesPartages(), lieuxRides(), listerRides(), reserverPlacesRide()

### Community 47 - "EcranTelephone"
Cohesion: 0.33
Nodes (6): EcranTelephone(), normaliserTelephone(), connexionChauffeur(), connexionClient(), creerCompteClient(), inscriptionChauffeur()

### Community 48 - "soleil.ts"
Cohesion: 0.25
Nodes (7): decalageSolaire(), positionSolaire, SECTEUR_ZENITH, secteurSolaire(), appliquerSecteur(), FournisseurSoleil(), reliefOriente()

### Community 49 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, android, ios, lint, reset-project, start, web

### Community 50 - "definirCleEquipe"
Cohesion: 0.15
Nodes (13): EcranTaxiEquipe(), EcranNouveauVehicule(), FORMAT_DATE_OK(), EcranVehicules(), normaliser(), creerVehicule(), definirCleEquipe(), definirMotDePasseChauffeur() (+5 more)

### Community 51 - "equipe.tsx"
Cohesion: 0.13
Nodes (23): libelleChauffeur(), MOYEN_RECHARGE, SectionEquipe, styles, styles, styles, CartePosition(), lienOpenStreetMap() (+15 more)

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
Cohesion: 0.38
Nodes (6): lienNavigation(), Position, positionActuelle(), positionNative(), positionWeb(), ResultatPosition

### Community 131 - "Étapes de déploiement"
Cohesion: 0.22
Nodes (8): 1. Provisionner PostgreSQL 16 managé, 2. Définir les variables d'environnement, 3. Migrations à chaque déploiement, 4. Stockage des fichiers : Cloudflare R2 recommandé, Déploiement zanziGo (backend), Options d'hébergement, Sécurité — rappels, Étapes de déploiement

### Community 132 - "Devise"
Cohesion: 0.67
Nodes (3): AnnoncePartageEquipe, DonneesVehicule, Devise

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

### Community 140 - "TypeTrajet"
Cohesion: 0.67
Nodes (3): CreationTrajet, CreationTrajetHotel, TypeTrajet

## Knowledge Gaps
- **449 isolated node(s):** `otp_codes`, `uploaded_files`, `driver_signups`, `push_subscriptions`, `name` (+444 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 561 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `expo-router` connect `useT` to `reserver.tsx`, `espaces`, `ui.tsx`, `choix.tsx`, `expo`, `i18n.tsx`, `auth.tsx`, `equipe.tsx`, `trip/[id].tsx`, `app/_layout.tsx`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `plugins` connect `expo` to `useT`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `otp_codes`, `uploaded_files`, `driver_signups` to the rest of the system?**
  _449 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `authHeaders` be split into smaller, more focused modules?**
  _Cohesion score 0.0565262076053443 - nodes in this community are weakly interconnected._
- **Should `pricingService.js` be split into smaller, more focused modules?**
  _Cohesion score 0.055534987041836355 - nodes in this community are weakly interconnected._
- **Should `espaces` be split into smaller, more focused modules?**
  _Cohesion score 0.09250693802035152 - nodes in this community are weakly interconnected._
- **Should `ui.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1196808510638298 - nodes in this community are weakly interconnected._