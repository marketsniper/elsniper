# Graph Report - elsniper  (2026-11-24)

## Corpus Check
- 259 files · ~302,623 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 20 file(s) not represented in the graph (top: .ttf 10, (none) 8, .example 1)

## Summary
- 1679 nodes · 5751 edges · 93 communities (67 shown, 26 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 153 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9d5df6db`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- authHeaders
- pricingService.js
- couleurs
- trajets.tsx
- app.js
- types.ts
- requete
- expo
- i18n.tsx
- CarteTrajet.web.tsx
- backend/package.json
- HttpError
- plancher-local-annonce.test.js
- Canopee.tsx
- useT
- config.js
- theme.ts
- api.ts
- backend
- rides.js
- db.js
- hotels.js
- trip/[id].tsx
- query
- packages.js
- normaliserLieu
- LaCourse.tsx
- dependencies
- reveillerServeur
- trips.js
- commeListe
- app/_layout.tsx
- equipe.tsx
- compteVerifie
- steps
- include
- reveil.yml
- imports-natifs.test.js
- peaux-contraste.test.js
- colisLocal.ts
- verifierSession
- accueil.tsx
- mobile/package.json
- preferencePeau.tsx
- smoke-test.js
- zanziGo — Architecture technique (v0.1, MVP)
- EcranAnnonces
- auth.tsx
- postgres
- scripts
- SessionAuth
- soleil.ts
- mise-a-jour.js
- service-worker.js
- ref_node_path
- zanziGo — Backend API (MVP)
- verifier.py
- service-worker-hors-ligne.test.js
- dialogue.ts
- Les mises à jour de l'application, en clair
- installation.js
- Référence API
- Devise
- publier.sh
- preparer.py
- rendre.mjs
- expo@^54.0.0
- expo-blur@~15.0.8
- expo-linking@~8.0.12
- expo-system-ui@~6.0.9
- rafraichir-web.sh
- expo-camera
- expo-device@~8.0.10
- expo-font
- expo-image@~3.0.11
- expo-image-picker
- expo-secure-store
- expo-status-bar
- expo-symbols@~1.0.8
- expo-web-browser@~15.0.11
- react-dom@19.1.0
- react-native-qrcode-svg
- react-native-reanimated@~4.1.1
- react-native-safe-area-context
- react-native-worklets@^0.5.1
- position.ts
- frein-durgence.sh
- Étapes de déploiement
- README.md
- services
- zanziGo — application mobile
- Le logotype zanziGo, et l'icône qui en dérive
- Unguja en volume — le rendu 3D de l'île

## God Nodes (most connected - your core abstractions)
1. `useT()` - 112 edges
2. `requete()` - 93 edges
3. `authHeaders()` - 79 edges
4. `react` - 72 edges
5. `Bouton()` - 71 edges
6. `adminHeaders()` - 69 edges
7. `react-native` - 65 edges
8. `Ecran()` - 63 edges
9. `Carte()` - 61 edges
10. `champ()` - 60 edges

## Surprising Connections (you probably didn't know these)
- `Notes techniques` --references--> `ErreurApi`  [INFERRED]
  mobile/README.md → mobile/src/lib/api.ts
- `isPayer()` --calls--> `query()`  [EXTRACTED]
  backend/src/routes/payments.js → backend/src/db.js
- `getPhotos()` --calls--> `query()`  [EXTRACTED]
  backend/src/routes/rentalVehicles.js → backend/src/db.js
- `statutActuel()` --calls--> `query()`  [EXTRACTED]
  backend/src/routes/rides.js → backend/src/db.js
- `uploadUnFichier()` --calls--> `HttpError`  [EXTRACTED]
  backend/src/routes/uploads.js → backend/src/errors.js

## Import Cycles
- None detected.

## Communities (93 total, 26 thin omitted)

### Community 0 - "authHeaders"
Cohesion: 0.06
Nodes (89): pool, courseConfirmee(), coursePayee(), posterAnnonce(), reserverEtPayer(), annonceReservee(), coursePrete(), payer() (+81 more)

### Community 1 - "pricingService.js"
Cohesion: 0.08
Nodes (48): annonceApresMouvement(), round2(), sansPrixDePlace(), AEROPORT_ALIAS, arrondiMillierTzs(), baseUsdForRoute(), CHAINE_COTE_EST, CITY_COORDS (+40 more)

### Community 2 - "couleurs"
Cohesion: 0.09
Nodes (53): styles, styles, FiltreCategorie, Onglet, styles, styles, FORMAT_DATE_OK(), styles (+45 more)

### Community 3 - "trajets.tsx"
Cohesion: 0.24
Nodes (16): EcranColis(), STATUTS_FINIS, styles, EcranTrajets(), STATUTS_FINIS, styles, Etoiles(), BoutonRafraichir() (+8 more)

### Community 4 - "app.js"
Cohesion: 0.06
Nodes (38): createApp(), makeLimiter(), otpLimiter, publicPostLimiter, uploadLimiter, isAdmin(), requireAdmin(), requireAuth() (+30 more)

### Community 5 - "types.ts"
Cohesion: 0.04
Nodes (53): ALIAS_AEROPORT, AnnulationVehicule, CHAINE_COTE_EST, COMMISSION_PRIVE, COORDONNEES_VILLES, DEPART_RIDE_AU_PLUS_TARD_HEURES, DEPART_RIDE_AU_PLUS_TOT_MINUTES, DESTINATIONS_RIDES (+45 more)

### Community 6 - "requete"
Cohesion: 0.03
Nodes (65): abonnerAlertes(), abonnerAlertesChauffeur(), ajouterPhotoVehicule(), annulerColis(), annulerLocation(), assignerChauffeur(), bannirClient(), choisirMoyenPaiement() (+57 more)

### Community 7 - "expo"
Cohesion: 0.05
Nodes (38): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, predictiveBackGestureEnabled, projectId (+30 more)

### Community 8 - "i18n.tsx"
Cohesion: 0.13
Nodes (23): EcranReserver(), ModeCourse, aMinuit(), CalendrierDate(), LOCALES, memeMois(), styles, ymd() (+15 more)

### Community 9 - "CarteTrajet.web.tsx"
Cohesion: 0.19
Nodes (16): styles, styles, CarteTrajet(), ProprietesCarteTrajet, CarteTrajet(), chargerLeaflet(), Leaflet, LIMITES_UNGUJA (+8 more)

### Community 10 - "backend/package.json"
Cohesion: 0.07
Nodes (34): dependencies, @aws-sdk/client-s3@^3.600.0, dotenv@^16.4.5, express@^4.19.2, express-rate-limit@^7.4.0, jsonwebtoken@^9.0.2, multer@^2.0.1, pg@^8.12.0 (+26 more)

### Community 11 - "HttpError"
Cohesion: 0.36
Nodes (10): base(), BASES, capturePaypalOrder(), circuitPaiementUsd(), createPaypalOrder(), getAccessToken(), hasPaypalMe(), isPaypalConfigured() (+2 more)

### Community 12 - "plancher-local-annonce.test.js"
Cohesion: 0.15
Nodes (15): AEROPORT, ANCIENS_LIBELLES_AEROPORT, RIDE_DESTINATIONS, RIDE_ORIGINS, RIDE_ORIGINS_ACCEPTES, VILLES_RIDES, hubToHubRoute(), memeEndroit() (+7 more)

### Community 13 - "Canopee.tsx"
Cohesion: 0.24
Nodes (15): react-native-svg@15.12.1, bruit(), Canopee(), ColobeVoyageur(), Espece, Souffle(), Cocotier(), ColobeLointain() (+7 more)

### Community 14 - "useT"
Cohesion: 0.14
Nodes (55): EcranClient(), styles, EcranHotelConnexion(), EcranHotelInscription(), styles, styles, EcranOtp(), styles (+47 more)

### Community 15 - "config.js"
Cohesion: 0.27
Nodes (12): enShillings(), MOYEN_CARTE, MOYEN_CREDIT, MOYEN_MOBILE, moyenParDefaut(), moyensPour(), reglement(), round2() (+4 more)

### Community 16 - "theme.ts"
Cohesion: 0.05
Nodes (38): EcranScanner(), estQrColis(), FenetreScan(), styles, ComposantFlou, LIBELLES_PEAU, NomIonicons, RangDesCartes (+30 more)

### Community 17 - "api.ts"
Cohesion: 0.04
Nodes (48): AbonnementPush, AnnulationPlace, annulerAttentePartage(), annulerReservationPlace(), annulerTrajet(), archiverVehicule(), AttentePartage, BASE_URL (+40 more)

### Community 18 - "backend"
Cohesion: 0.13
Nodes (15): defaults, name, runs-on, run, jobs, backend, mobile, defaults (+7 more)

### Community 19 - "rides.js"
Cohesion: 0.14
Nodes (26): withTransaction(), asyncHandler(), appliquerConfirmation(), isPayer(), moyenSchema, notifierPaiementConfirme(), annoncerMouvement(), annulerReservationsImpayees() (+18 more)

### Community 20 - "db.js"
Cohesion: 0.14
Nodes (14): config, cloturerRidesPartis(), app, messageAlerte(), signalerCoursesFigees(), demarrerEntretienAutomatique(), passageEntretien(), passageEntretienInterne() (+6 more)

### Community 21 - "hotels.js"
Cohesion: 0.08
Nodes (36): HttpError, invalidStatus(), phoneSchema, refuserSiOtpFerme(), usernameSchema, alerteDemandeRecharge(), assertHotelVerified(), COURSES_PAR_BON (+28 more)

### Community 22 - "trip/[id].tsx"
Cohesion: 0.14
Nodes (51): EcranAnnonce(), heureLocale(), styles, EcranColisDispo(), styles, EcranDetailCourse(), styles, EcranCourses() (+43 more)

### Community 23 - "query"
Cohesion: 0.20
Nodes (20): query(), notFound(), abonnementSchema, chauffeurDuJeton(), getPackage(), getPayment(), getVehicle(), annonceDuChauffeurOuEquipe() (+12 more)

### Community 24 - "packages.js"
Cohesion: 0.08
Nodes (25): createPackageSchema, router, scanSchema, bookSchema, champsVehicule, COLONNES_SQL, createVehicleSchema, getPhotos() (+17 more)

### Community 25 - "normaliserLieu"
Cohesion: 0.20
Nodes (15): baseUsdItineraire(), dansLeGroupe(), estAeroportVille(), estTarifDeTerrain(), forfaitZanzigoTrajetUsd(), kmEntreVilles(), netChaineCoteEst(), netChauffeurPriveUsd() (+7 more)

### Community 26 - "LaCourse.tsx"
Cohesion: 0.19
Nodes (12): Bande(), BasCote(), bruit(), Chaussee(), Decor(), LaCourse(), NomVehicule, styles (+4 more)

### Community 27 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, expo-glass-effect@~0.1.10, expo-router@~6.0.24, expo-splash-screen@~31.0.13, expo-updates@~29.0.19, @expo/vector-icons@^15.0.2, react@19.1.0, react-native@0.81.5 (+9 more)

### Community 28 - "reveillerServeur"
Cohesion: 0.67
Nodes (3): attendre(), fetchAvecTimeout(), reveillerServeur()

### Community 29 - "trips.js"
Cohesion: 0.11
Nodes (33): sansSecretsChauffeur(), assignDriverSchema, avecAnnonceGroupe(), courseSansIdentiteClient(), createTripSchema, positionSchema, purgeSchema, ratingSchema (+25 more)

### Community 30 - "commeListe"
Cohesion: 0.08
Nodes (26): commeListe(), listerAnnoncesPartageEquipe(), listerAttentesPartage(), listerCandidaturesChauffeurs(), listerChauffeursVerifies(), listerClientsEnAttente(), listerColisARamasser(), listerColisHotel() (+18 more)

### Community 31 - "app/_layout.tsx"
Cohesion: 0.10
Nodes (29): CadreApplication(), LayoutRacine(), PEAUX_CLAIRES, PilesNavigation(), RetourEntete(), THEME_CLAIR, THEME_SOMBRE, FournisseurDialogues() (+21 more)

### Community 32 - "equipe.tsx"
Cohesion: 0.12
Nodes (32): CaseChauffeur, styles, EcranEquipe(), libelleChauffeur(), MOYEN_RECHARGE, SectionEquipe, styles, CarteAlertes() (+24 more)

### Community 33 - "compteVerifie"
Cohesion: 0.50
Nodes (4): compteVerifie(), localVerifie(), profilTarifaireUtilisateur(), residentVerifie()

### Community 34 - "steps"
Cohesion: 0.16
Nodes (15): steps, DATABASE_URL, NODE_ENV, steps, env, id, if, name (+7 more)

### Community 35 - "include"
Cohesion: 0.25
Nodes (7): compilerOptions, paths, strict, extends, include, @/assets/*, expo/tsconfig.base

### Community 36 - "reveil.yml"
Cohesion: 0.17
Nodes (11): jobs, ping, name, on, schedule, workflow_dispatch, runs-on, steps (+3 more)

### Community 37 - "imports-natifs.test.js"
Cohesion: 0.15
Nodes (8): CONTRAT, fichiers, fichiersSource(), ICI, MOBILE, requireMobile, SRC, ts

### Community 38 - "peaux-contraste.test.js"
Cohesion: 0.20
Nodes (10): canalLineaire(), contraste(), COURANT, GRAS, luminance(), NOMS_DE_PEAU, PALETTES, preference (+2 more)

### Community 39 - "colisLocal.ts"
Cohesion: 0.26
Nodes (14): definirJeton(), AuthProvider(), ajouter(), ajouterColisLocal(), ajouterCourseLocale(), cle(), effacerColisMasques(), lister() (+6 more)

### Community 40 - "verifierSession"
Cohesion: 0.50
Nodes (4): obtenirChauffeur(), obtenirHotel(), obtenirUtilisateur(), verifierSession()

### Community 41 - "accueil.tsx"
Cohesion: 0.27
Nodes (9): CarteProfil(), EcranAccueil(), ProfilAccueil, styles, SelecteurPeau(), EtiquetteVersion(), forcer(), usePreferencePeau() (+1 more)

### Community 42 - "mobile/package.json"
Cohesion: 0.16
Nodes (13): expo-constants@~18.0.13, @expo/ui@~0.2.0-beta.9, devDependencies, @types/react@^19.1.10, typescript@^5.9.2, main, name, private (+5 more)

### Community 43 - "preferencePeau.tsx"
Cohesion: 0.27
Nodes (9): Contexte, ContextePreference, FournisseurPreferencePeau(), peauValide(), PEAUX_AU_CHOIX, appliquerPeau(), FournisseurPeau(), NomPeau (+1 more)

### Community 44 - "smoke-test.js"
Cohesion: 0.36
Nodes (8): ADMIN, authenticate(), bearer(), call(), check(), main(), PHONES, run

### Community 45 - "zanziGo — Architecture technique (v0.1, MVP)"
Cohesion: 0.12
Nodes (16): 1. Vue d'ensemble de l'architecture, 2. Stack technique retenue, 3. Modèle de données, 4. Référence API, 5. Flux métier implémentés, 6. Plan d'intégration des services tiers, 7. Sécurité et conformité — à ajouter avant la production, 8. Ce qui a été construit et vérifié (+8 more)

### Community 46 - "EcranAnnonces"
Cohesion: 0.22
Nodes (10): normaliserVille(), partagePossibleItineraire(), tarifLocalMiniTzs(), tarifPlacePartagee(), tarifSpecialItineraire(), tarifSpecialLocal(), tarifsZoneItineraire(), tarifTrajetProfil() (+2 more)

### Community 47 - "auth.tsx"
Cohesion: 0.12
Nodes (19): LayoutAuth(), icone(), LayoutChauffeur(), Index(), icone(), LayoutOnglets(), heureDepart(), libelleJour() (+11 more)

### Community 48 - "postgres"
Cohesion: 0.22
Nodes (9): services, POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, env, image, options, ports (+1 more)

### Community 49 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, android, ios, lint, reset-project, start, web

### Community 51 - "soleil.ts"
Cohesion: 0.29
Nodes (7): decalageSolaire(), PositionSolaire, positionSolaire(), SECTEUR_ZENITH, secteurSolaire(), OMBRES, reliefOriente()

### Community 52 - "mise-a-jour.js"
Cohesion: 0.60
Nodes (5): controler(), memoire(), occupe(), retenir(), versionChargee()

### Community 53 - "service-worker.js"
Cohesion: 0.47
Nodes (3): ecranAttente(), reponsePage(), reseau()

### Community 54 - "ref_node_path"
Cohesion: 0.10
Nodes (11): migrationsDir, ICI, SVG, TSX, ICI, TYPES_MOBILE, I18N, ICI (+3 more)

### Community 55 - "zanziGo — Backend API (MVP)"
Cohesion: 0.20
Nodes (10): Authentification, Format des erreurs, Installation, Paiement Pesapal, Prérequis, Reste à faire avant la production, Structure, Tests (+2 more)

### Community 56 - "verifier.py"
Cohesion: 0.12
Nodes (4): composer(), lettres(), main(), mesurer()

### Community 58 - "dialogue.ts"
Cohesion: 0.47
Nodes (4): reparerAlertesWeb(), DemandeDialogue, Ecouteur, ouvrirDialogue()

### Community 59 - "Les mises à jour de l'application, en clair"
Cohesion: 0.20
Nodes (9): C'est arrivé le 21 août 2026, Ce qui part tout seul, et ce qui ne part pas, Comment savoir, depuis un téléphone, si les mises à jour arrivent, Le fichier qui fait autorité : `mobile/binaire.json`, Le jour où il faudra du natif, Le vrai danger n'est pas celui qu'on croit, Les mises à jour de l'application, en clair, Les trois commandes (+1 more)

### Community 61 - "Référence API"
Cohesion: 0.22
Nodes (9): Authentification, Chauffeurs, Colis, Hôtels, Paiements, Référence API, Trajets, Upload (+1 more)

### Community 62 - "Devise"
Cohesion: 0.50
Nodes (4): AnnoncePartageEquipe, DonneesVehicule, Devise, StatutRide

### Community 96 - "position.ts"
Cohesion: 0.24
Nodes (8): expo-location@~19.0.8, lienNavigation(), Position, positionActuelle(), positionNative(), positionWeb(), ResultatPosition, expo-location

### Community 131 - "Étapes de déploiement"
Cohesion: 0.22
Nodes (8): 1. Provisionner PostgreSQL 16 managé, 2. Définir les variables d'environnement, 3. Migrations à chaque déploiement, 4. Stockage des fichiers : Cloudflare R2 recommandé, Déploiement zanziGo (backend), Options d'hébergement, Sécurité — rappels, Étapes de déploiement

### Community 134 - "README.md"
Cohesion: 0.33
Nodes (3): Contenu du dépôt, Démarrage rapide, zanziGo

### Community 135 - "services"
Cohesion: 0.06
Nodes (30): Mise en ligne de zanziGo — pas à pas, Plus tard (avant le vrai lancement), Étape 1 — Mettre le serveur en ligne (Render, gratuit), Étape 2 — Construire l'app installable (Expo / EAS), Étape 3 — Brancher l'app sur le serveur en ligne, Étape 4 — Le numéro WhatsApp de l'équipe, databases, databaseName (+22 more)

### Community 136 - "zanziGo — application mobile"
Cohesion: 0.29
Nodes (7): Comptes de test (flux OTP en mode dev), Configuration de l'API, Fonctionnalités, Lancer l'application, Notes techniques, Prérequis, zanziGo — application mobile

### Community 138 - "Le logotype zanziGo, et l'icône qui en dérive"
Cohesion: 0.50
Nodes (3): L'icône, Le logotype zanziGo, et l'icône qui en dérive, Rejouer

### Community 139 - "Unguja en volume — le rendu 3D de l'île"
Cohesion: 0.50
Nodes (3): Ce que l'image contient, Refaire le rendu, Unguja en volume — le rendu 3D de l'île

## Knowledge Gaps
- **1 isolated node(s):** `expo/tsconfig.base`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 547 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ErreurApi` connect `couleurs` to `equipe.tsx`, `trajets.tsx`, `requete`, `zanziGo — application mobile`, `i18n.tsx`, `useT`, `auth.tsx`, `theme.ts`, `api.ts`, `trip/[id].tsx`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **What connects `expo/tsconfig.base` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `authHeaders` be split into smaller, more focused modules?**
  _Cohesion score 0.05674411471512921 - nodes in this community are weakly interconnected._
- **Why does `Notes techniques` connect `zanziGo — application mobile` to `couleurs`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Should `pricingService.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07908163265306123 - nodes in this community are weakly interconnected._
- **Why does `zanziGo — application mobile` connect `zanziGo — application mobile` to `README.md`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Should `couleurs` be split into smaller, more focused modules?**
  _Cohesion score 0.08576576576576576 - nodes in this community are weakly interconnected._