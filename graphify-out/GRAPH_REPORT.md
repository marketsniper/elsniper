# Graph Report - elsniper  (2026-08-31)

## Corpus Check
- 246 files · ~327,792 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1583 nodes · 4750 edges · 141 communities (69 shown, 38 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 140 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c9c97ec0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Tests backend (garde-fous)
- pricingService.js
- package/nouveau.tsx
- courses.tsx
- app.js
- types.ts
- requete
- expo
- i18n.tsx
- ui.tsx
- backend/package.json
- trips.js
- 001_init.sql
- LaCourse.tsx
- useT
- moyenPaiement.js
- theme.ts
- EcranEquipe
- api.ts
- rides.js
- notifierEquipe
- hotels.js
- equipe.tsx
- query
- dialogue.ts
- normaliserLieu
- rentalVehicles.js
- dependencies
- EcranAnnonces
- packages.js
- EcranCourses
- FondPlage.tsx
- preferencePeau.tsx
- place/[id].tsx
- CarteAlertes.tsx
- include
- HttpError
- imports-natifs.test.js
- peaux-contraste.test.js
- EcranReserver
- colisLocal.ts
- EcranTrajet
- mobile/package.json
- EcranProfil
- smoke-test.js
- zanziGo — Architecture technique (v0.1, MVP)
- ChoixDocument.tsx
- auth.tsx
- soleil.ts
- scripts
- EcranFicheVehicule
- position.ts
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
- frein-durgence.sh
- Étapes de déploiement
- app/_layout.tsx
- CalendrierDate.tsx
- README.md
- Mise en ligne de zanziGo — pas à pas
- zanziGo — application mobile
- 6. Plan d'intégration des services tiers
- Le logotype zanziGo, et l'icône qui en dérive
- Unguja en volume — le rendu 3D de l'île
- SessionAuth

## God Nodes (most connected - your core abstractions)
1. `useT()` - 105 edges
2. `requete()` - 91 edges
3. `authHeaders()` - 75 edges
4. `adminHeaders()` - 66 edges
5. `champ()` - 60 edges
6. `couleurs` - 56 edges
7. `stylesReactifs()` - 51 edges
8. `useTestDb()` - 50 edges
9. `espaces` - 49 edges
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
- `RetourEntete()` --calls--> `useT()`  [EXTRACTED]
  mobile/src/app/_layout.tsx → mobile/src/lib/i18n.tsx

## Import Cycles
- None detected.

## Communities (141 total, 38 thin omitted)

### Community 0 - "Tests backend (garde-fous)"
Cohesion: 0.05
Nodes (78): migrationsDir, pool, courseConfirmee(), coursePayee(), posterAnnonce(), reserverEtPayer(), annonceReservee(), coursePrete() (+70 more)

### Community 1 - "pricingService.js"
Cohesion: 0.06
Nodes (64): round2(), sansPrixDePlace(), valeurReservationPlace(), AEROPORT, ANCIENS_LIBELLES_AEROPORT, RIDE_DESTINATIONS, RIDE_ORIGINS, RIDE_ORIGINS_ACCEPTES (+56 more)

### Community 2 - "package/nouveau.tsx"
Cohesion: 0.08
Nodes (49): styles, styles, styles, styles, EcranNouveauColis(), PRESENTATION_TAILLES, styles, FiltreCategorie (+41 more)

### Community 3 - "courses.tsx"
Cohesion: 0.12
Nodes (32): CaseChauffeur, styles, styles, styles, EcranColis(), STATUTS_FINIS, styles, EcranTrajets() (+24 more)

### Community 4 - "app.js"
Cohesion: 0.09
Nodes (28): createApp(), makeLimiter(), otpLimiter, publicPostLimiter, uploadLimiter, config, isAdmin(), requireAdmin() (+20 more)

### Community 5 - "types.ts"
Cohesion: 0.05
Nodes (43): ALIAS_AEROPORT, AnnulationVehicule, CHAINE_COTE_EST, COMMISSION_PRIVE, COORDONNEES_VILLES, ETAPES_COLIS, GROUPES_NET_USD, HUBS_RIDES (+35 more)

### Community 6 - "requete"
Cohesion: 0.06
Nodes (44): EcranTelephone(), normaliserTelephone(), EcranDetailColis(), abonnerAlertes(), abonnerAlertesChauffeur(), annulerAttentePartage(), annulerColis(), annulerLocation() (+36 more)

### Community 7 - "expo"
Cohesion: 0.05
Nodes (39): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, predictiveBackGestureEnabled, projectId (+31 more)

### Community 8 - "i18n.tsx"
Cohesion: 0.08
Nodes (32): ModeCourse, styles, styles, Etoiles(), styles, IleDeZanzibar(), styles, heureDepart() (+24 more)

### Community 9 - "ui.tsx"
Cohesion: 0.10
Nodes (22): ProfilAccueil, styles, CLES_PROFIL, Mode, styles, ComposantFlou, LIBELLES_PEAU, LogoZanziGo() (+14 more)

### Community 10 - "backend/package.json"
Cohesion: 0.05
Nodes (36): @aws-sdk/client-s3, dependencies, @aws-sdk/client-s3, dotenv, express, express-rate-limit, jsonwebtoken, multer (+28 more)

### Community 11 - "trips.js"
Cohesion: 0.12
Nodes (29): createDriverSchema, documentsSchema, motDePasseSchema, photoSchema, searchSchema, verifySchema, sansSecretsChauffeur(), assignDriverSchema (+21 more)

### Community 12 - "001_init.sql"
Cohesion: 0.10
Nodes (27): driver_monthly_stats, drivers, hotels, packages, payments, set_updated_at(), trg_driver_monthly_stats_updated_at, trg_drivers_updated_at (+19 more)

### Community 13 - "LaCourse.tsx"
Cohesion: 0.11
Nodes (24): bruit(), Canopee(), ColobeVoyageur(), Espece, Souffle(), Bande(), BasCote(), bruit() (+16 more)

### Community 14 - "useT"
Cohesion: 0.14
Nodes (36): EcranAnnonce(), EcranAccueil(), EcranClient(), EcranHotelConnexion(), EcranHotelInscription(), LayoutAuth(), EcranOtp(), EcranPro() (+28 more)

### Community 15 - "moyenPaiement.js"
Cohesion: 0.27
Nodes (12): enShillings(), MOYEN_CARTE, MOYEN_CREDIT, MOYEN_MOBILE, moyenParDefaut(), moyensPour(), reglement(), round2() (+4 more)

### Community 16 - "theme.ts"
Cohesion: 0.08
Nodes (20): BENTO, ContextePeau, ContexteSoleil, ESTRAN, familleSelonPoids(), GIROFLE, NUIT, Palette (+12 more)

### Community 17 - "EcranEquipe"
Cohesion: 0.09
Nodes (31): EcranEquipe(), ecouterAlertes(), assignerChauffeur(), bannirClient(), commeListe(), confirmerPaiementEquipe(), crediterDemandeRecharge(), fileRechargesCredit() (+23 more)

### Community 18 - "api.ts"
Cohesion: 0.07
Nodes (29): EcranScanner(), estQrColis(), AbonnementPush, AnnulationPlace, AttentePartage, BASE_URL, BonFidelite, colisParQr() (+21 more)

### Community 19 - "rides.js"
Cohesion: 0.14
Nodes (24): withTransaction(), appliquerConfirmation(), isPayer(), moyenSchema, notifierPaiementConfirme(), baseFacturePlace(), createRideSchema, PRICING_TZS (+16 more)

### Community 20 - "notifierEquipe"
Cohesion: 0.24
Nodes (11): verifierExpirationsDocuments(), annulerReservationsImpayees(), cloturerRidesPartis(), signalerAttentesCorrespondantes(), validerParrainageApresCourse(), messageAlerte(), signalerCoursesFigees(), notifierEquipe() (+3 more)

### Community 21 - "hotels.js"
Cohesion: 0.09
Nodes (32): authRouter, phoneSchema, refuserSiOtpFerme(), usernameSchema, sanitizeDriver(), alerteDemandeRecharge(), assertHotelVerified(), COURSES_PAR_BON (+24 more)

### Community 22 - "equipe.tsx"
Cohesion: 0.10
Nodes (40): styles, styles, styles, MOYEN_RECHARGE, SectionEquipe, styles, styles, styles (+32 more)

### Community 23 - "query"
Cohesion: 0.14
Nodes (24): query(), notFound(), abonnementSchema, chauffeurDuJeton(), getPackage(), getPayment(), getVehicle(), getTrip() (+16 more)

### Community 24 - "dialogue.ts"
Cohesion: 0.32
Nodes (6): FournisseurDialogues(), reparerAlertesWeb(), DemandeDialogue, Ecouteur, ouvrirDialogue(), sabonnerAuxDialogues()

### Community 25 - "normaliserLieu"
Cohesion: 0.21
Nodes (14): baseUsdItineraire(), dansLeGroupe(), estAeroportVille(), estTarifDeTerrain(), forfaitZanzigoTrajetUsd(), kmEntreVilles(), netChaineCoteEst(), netChauffeurPriveUsd() (+6 more)

### Community 26 - "rentalVehicles.js"
Cohesion: 0.14
Nodes (11): bookSchema, champsVehicule, COLONNES_SQL, createVehicleSchema, getPhotos(), RENTAL_CATEGORIES, router, updateVehicleSchema (+3 more)

### Community 27 - "dependencies"
Cohesion: 0.13
Nodes (15): expo, expo-blur, expo-linking, expo-router, expo-splash-screen, expo-system-ui, dependencies, expo (+7 more)

### Community 28 - "EcranAnnonces"
Cohesion: 0.14
Nodes (15): EcranAnnonces(), creerRide(), lieuxRides(), netPlacePartageeTzs(), netPlacePartageeUsd(), normaliserVille(), partagePossibleItineraire(), tarifLocalMiniTzs() (+7 more)

### Community 29 - "packages.js"
Cohesion: 0.13
Nodes (17): createPackageSchema, router, scanSchema, avecAnnonceGroupe(), alertePaiementColis(), alertePaiementCourse(), aValiderALaMain(), quand() (+9 more)

### Community 30 - "EcranCourses"
Cohesion: 0.13
Nodes (15): EcranCourses(), EcranTaxiEquipe(), definirMotDePasseChauffeur(), envoyerPositionChauffeur(), listerColisARamasser(), listerCoursesChauffeur(), listerCoursesDisponibles(), listerMesColisChauffeur() (+7 more)

### Community 31 - "FondPlage.tsx"
Cohesion: 0.18
Nodes (12): AMPLITUDES, bruit(), cheminBande(), EstranDeZanzibar(), GRAINES, HALOS, HALOS_GIROFLE, LagonDeVerre() (+4 more)

### Community 32 - "preferencePeau.tsx"
Cohesion: 0.19
Nodes (12): LangueProvider(), traduire(), Contexte, ContextePreference, FournisseurPreferencePeau(), peauValide(), PEAUX_AU_CHOIX, ecrireStockage() (+4 more)

### Community 33 - "place/[id].tsx"
Cohesion: 0.20
Nodes (12): styles, EcranPlace(), styles, EtapeTimeline, styles, TimelineStatut(), ChargementCentre(), annulerReservationPlace() (+4 more)

### Community 34 - "CarteAlertes.tsx"
Cohesion: 0.33
Nodes (11): CarteAlertes(), activerAlertes(), alertesPossibles(), CibleAlertes, cleEnOctets(), desactiverAlertes(), etatAlertes, surIphoneSansInstallation() (+3 more)

### Community 35 - "include"
Cohesion: 0.15
Nodes (12): compilerOptions, paths, strict, extends, include, @/assets/*, ./assets/*, expo-env.d.ts (+4 more)

### Community 36 - "HttpError"
Cohesion: 0.18
Nodes (17): HttpError, invalidStatus(), requireAuth(), ALLOWED_MIME_TYPES, upload, uploadsRouter, uploadUnFichier(), base() (+9 more)

### Community 37 - "imports-natifs.test.js"
Cohesion: 0.17
Nodes (7): CONTRAT, fichiers, ICI, MOBILE, requireMobile, SRC, ts

### Community 38 - "peaux-contraste.test.js"
Cohesion: 0.20
Nodes (10): canalLineaire(), contraste(), COURANT, GRAS, luminance(), NOMS_DE_PEAU, PALETTES, preference (+2 more)

### Community 39 - "EcranReserver"
Cohesion: 0.22
Nodes (10): EcranReserver(), creerAttentePartage(), creerTrajet(), creerTrajetHotel(), partagerPointRendezVous(), compteVerifie(), dureeRouteMinutes(), localVerifie() (+2 more)

### Community 40 - "colisLocal.ts"
Cohesion: 0.33
Nodes (11): ajouter(), ajouterColisLocal(), ajouterCourseLocale(), cle(), effacerColisMasques(), lister(), listerColisLocaux(), listerColisMasques() (+3 more)

### Community 41 - "EcranTrajet"
Cohesion: 0.17
Nodes (12): EcranTrajet(), annulerTrajet(), noterTrajet(), obtenirTrajet(), payerTrajet(), payerTrajetAvecCredit(), positionDeMonChauffeur(), coordonneesVille() (+4 more)

### Community 42 - "mobile/package.json"
Cohesion: 0.20
Nodes (9): devDependencies, @types/react, typescript, main, name, private, version, @types/react (+1 more)

### Community 43 - "EcranProfil"
Cohesion: 0.20
Nodes (11): EcranProfil(), initiales(), convertirBonEnCredit(), definirJeton(), demanderRechargeCredit(), demandesRechargeHotel(), obtenirChauffeur(), obtenirHotel() (+3 more)

### Community 44 - "smoke-test.js"
Cohesion: 0.36
Nodes (8): ADMIN, authenticate(), bearer(), call(), check(), main(), PHONES, run

### Community 45 - "zanziGo — Architecture technique (v0.1, MVP)"
Cohesion: 0.18
Nodes (11): 1. Vue d'ensemble de l'architecture, 2. Stack technique retenue, 3. Modèle de données, 4. Référence API, 5. Flux métier implémentés, 7. Sécurité et conformité — à ajouter avant la production, 8. Ce qui a été construit et vérifié, 9. Prochaines étapes suggérées (+3 more)

### Community 46 - "ChoixDocument.tsx"
Cohesion: 0.39
Nodes (7): ChoixDocument(), decoder(), marquerEnvoi(), preparerFichierWeb(), SecoursNatif(), styles, ZoneFichier()

### Community 47 - "auth.tsx"
Cohesion: 0.23
Nodes (11): styles, styles, icone(), LayoutChauffeur(), icone(), LayoutOnglets(), MarqueEntete(), AuthContext (+3 more)

### Community 48 - "soleil.ts"
Cohesion: 0.25
Nodes (7): decalageSolaire(), positionSolaire, SECTEUR_ZENITH, secteurSolaire(), appliquerSecteur(), FournisseurSoleil(), reliefOriente()

### Community 49 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, android, ios, lint, reset-project, start, web

### Community 50 - "EcranFicheVehicule"
Cohesion: 0.17
Nodes (12): EcranFicheVehicule(), FORMAT_DATE_OK(), EcranVerifications(), ajouterPhotoVehicule(), archiverVehicule(), majVehicule(), obtenirVehicule(), supprimerPhotoVehicule() (+4 more)

### Community 51 - "position.ts"
Cohesion: 0.38
Nodes (6): lienNavigation(), Position, positionActuelle(), positionNative(), positionWeb(), ResultatPosition

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

### Community 131 - "Étapes de déploiement"
Cohesion: 0.22
Nodes (8): 1. Provisionner PostgreSQL 16 managé, 2. Définir les variables d'environnement, 3. Migrations à chaque déploiement, 4. Stockage des fichiers : Cloudflare R2 recommandé, Déploiement zanziGo (backend), Options d'hébergement, Sécurité — rappels, Étapes de déploiement

### Community 132 - "app/_layout.tsx"
Cohesion: 0.22
Nodes (8): CadreApplication(), LayoutRacine(), PEAUX_CLAIRES, PilesNavigation(), RetourEntete(), THEME_CLAIR, THEME_SOMBRE, FICHIERS_POLICES

### Community 133 - "CalendrierDate.tsx"
Cohesion: 0.36
Nodes (7): aMinuit(), CalendrierDate(), LOCALES, memeMois(), styles, ymd(), Langue

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
- **446 isolated node(s):** `otp_codes`, `uploaded_files`, `driver_signups`, `push_subscriptions`, `name` (+441 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 556 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `expo-router` connect `auth.tsx` to `choix.tsx`, `place/[id].tsx`, `package/nouveau.tsx`, `courses.tsx`, `app/_layout.tsx`, `expo`, `i18n.tsx`, `ui.tsx`, `useT`, `equipe.tsx`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `plugins` connect `expo` to `auth.tsx`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `otp_codes`, `uploaded_files`, `driver_signups` to the rest of the system?**
  _446 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Tests backend (garde-fous)` be split into smaller, more focused modules?**
  _Cohesion score 0.0535802225943071 - nodes in this community are weakly interconnected._
- **Should `pricingService.js` be split into smaller, more focused modules?**
  _Cohesion score 0.055534987041836355 - nodes in this community are weakly interconnected._
- **Should `package/nouveau.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07826546800634585 - nodes in this community are weakly interconnected._
- **Should `courses.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11794871794871795 - nodes in this community are weakly interconnected._