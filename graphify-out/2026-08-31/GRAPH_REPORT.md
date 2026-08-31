# Graph Report - elsniper  (2026-08-31)

## Corpus Check
- 236 files · ~393,950 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1496 nodes · 4662 edges · 130 communities (57 shown, 39 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 140 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Tests backend (garde-fous)
- Grille tarifaire
- Client API mobile
- Écrans véhicules & UI
- API mobile — authentification
- Types partagés mobile
- Taxis partagés & Pesapal
- Hôtels & e-mails
- Configuration Expo
- Écrans d'entrée (auth)
- Tableau de bord équipe
- Dépendances backend
- Types & briques UI
- Schéma base de données
- Onglets client
- Composants course & marque
- Auth & version
- Push & stockage
- Thème & peaux
- Vérifications & stats
- Portail chauffeur
- Alertes & WhatsApp
- Traductions (i18n)
- Location de véhicules
- Pièces jointes
- lib · api
- Entretien & purge
- lib · api
- lib · types
- Dépendances mobile
- services · moyenpaiement
- lib · types
- lib · api
- lib · alertespush
- components · fondplage
- lib · preferencepeau
- mobile · tsconfig
- services · paypalservice
- backend · test · imports · natifs
- backend · test · peaux · contraste
- lib · colislocal
- mobile · package
- backend · scripts · smoke · test
- app · layout
- lib · dialogue
- components · calendrierdate
- lib · soleil
- mobile · package · scripts
- lib · position
- backend · pwa · mise · a
- backend · pwa · service · worker
- backend · test · marque · colobe
- lib · api
- components · ridespartages
- outils · logotype · fabriquer · rational
- backend · test · service · worker
- backend · test · soleil · zanzibar
- lib · types
- backend · pwa · installation
- outils · marque · verifier
- outils · mises · a · jour
- outils · rendu · ile · preparer
- outils · rendu · ile · rendre
- backend · db · migrations · 002
- backend · db · migrations · 025
- backend · db · migrations · 027
- backend · db · migrations · 029
- backend · scripts · rafraichir · web
- expo · camera
- expo · constants
- expo · device
- expo · font
- expo · glass · effect
- expo · image
- expo · image · picker
- expo · secure · store
- expo · status · bar
- expo · symbols
- expo · ui
- expo · updates
- expo · vector · icons
- expo · web · browser
- mobile · package · dependencies · expo
- mobile · package · dependencies · react
- mobile · package · dependencies · react
- mobile · package · dependencies · react
- mobile · package · dependencies · react
- mobile · package · dependencies · react
- mobile · package · dependencies · react
- mobile · package · dependencies · react
- mobile · package · dependencies · react
- mobile · package · dependencies · react
- mobile · package · dependencies · react
- lib · auth
- lib · types
- outils · mises · a · jour

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

## Communities (130 total, 39 thin omitted)

### Community 0 - "Tests backend (garde-fous)"
Cohesion: 0.06
Nodes (77): migrationsDir, pool, enregistrerAbonnement(), coursePayee(), posterAnnonce(), reserverEtPayer(), annonceReservee(), coursePrete() (+69 more)

### Community 1 - "Grille tarifaire"
Cohesion: 0.06
Nodes (64): round2(), sansPrixDePlace(), valeurReservationPlace(), AEROPORT, ANCIENS_LIBELLES_AEROPORT, RIDE_DESTINATIONS, RIDE_ORIGINS, RIDE_ORIGINS_ACCEPTES (+56 more)

### Community 2 - "Client API mobile"
Cohesion: 0.06
Nodes (60): EcranEquipe(), AbonnementPush, AnnoncePartageEquipe, AnnulationPlace, assignerChauffeur(), AttentePartage, bannirClient(), BASE_URL (+52 more)

### Community 3 - "Écrans véhicules & UI"
Cohesion: 0.09
Nodes (44): styles, EcranHotelEquipe(), styles, styles, EcranNouveauColis(), PRESENTATION_TAILLES, styles, FiltreCategorie (+36 more)

### Community 4 - "API mobile — authentification"
Cohesion: 0.05
Nodes (48): EcranHotelInscription(), EcranOtp(), EcranTelephone(), normaliserTelephone(), LayoutRacine(), abonnerAlertes(), abonnerAlertesChauffeur(), annulerAttentePartage() (+40 more)

### Community 5 - "Types partagés mobile"
Cohesion: 0.05
Nodes (44): ALIAS_AEROPORT, AnnulationVehicule, CHAINE_COTE_EST, COMMISSION_PRIVE, COORDONNEES_VILLES, DESTINATIONS_RIDES, ETAPES_COLIS, ETAPES_TRAJET (+36 more)

### Community 6 - "Taxis partagés & Pesapal"
Cohesion: 0.12
Nodes (31): config, HttpError, invalidStatus(), isAdmin(), requireAdmin(), requireAuth(), moyenSchema, baseFacturePlace() (+23 more)

### Community 7 - "Hôtels & e-mails"
Cohesion: 0.09
Nodes (34): authRouter, phoneSchema, refuserSiOtpFerme(), usernameSchema, sanitizeDriver(), alerteDemandeRecharge(), assertHotelVerified(), COURSES_PAR_BON (+26 more)

### Community 8 - "Configuration Expo"
Cohesion: 0.05
Nodes (39): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, predictiveBackGestureEnabled, projectId (+31 more)

### Community 9 - "Écrans d'entrée (auth)"
Cohesion: 0.13
Nodes (27): EcranClient(), styles, EcranHotelConnexion(), styles, styles, styles, EcranPro(), styles (+19 more)

### Community 10 - "Tableau de bord équipe"
Cohesion: 0.11
Nodes (30): CaseChauffeur, styles, libelleChauffeur(), MOYEN_RECHARGE, SectionEquipe, styles, styles, styles (+22 more)

### Community 11 - "Dépendances backend"
Cohesion: 0.05
Nodes (36): @aws-sdk/client-s3, dependencies, @aws-sdk/client-s3, dotenv, express, express-rate-limit, jsonwebtoken, multer (+28 more)

### Community 12 - "Types & briques UI"
Cohesion: 0.15
Nodes (29): EcranAnnonce(), styles, EcranLocation(), styles, EcranDetailColis(), styles, EcranPlace(), styles (+21 more)

### Community 13 - "Schéma base de données"
Cohesion: 0.10
Nodes (27): driver_monthly_stats, drivers, hotels, packages, payments, set_updated_at(), trg_driver_monthly_stats_updated_at, trg_drivers_updated_at (+19 more)

### Community 14 - "Onglets client"
Cohesion: 0.17
Nodes (29): EcranColisDispo(), styles, EcranDetailCourse(), styles, EcranCourses(), EcranColis(), STATUTS_FINIS, styles (+21 more)

### Community 15 - "Composants course & marque"
Cohesion: 0.11
Nodes (24): bruit(), Canopee(), ColobeVoyageur(), Espece, Souffle(), Bande(), BasCote(), bruit() (+16 more)

### Community 16 - "Auth & version"
Cohesion: 0.13
Nodes (23): EcranAccueil(), ProfilAccueil, styles, LayoutAuth(), EcranCompteChauffeur(), initiales(), styles, styles (+15 more)

### Community 17 - "Push & stockage"
Cohesion: 0.12
Nodes (26): query(), notFound(), abonnementSchema, chauffeurDuJeton(), notificationsRouter, getPackage(), getPayment(), isPayer() (+18 more)

### Community 18 - "Thème & peaux"
Cohesion: 0.07
Nodes (24): Etoiles(), styles, BENTO, ContextePeau, ContexteSoleil, couleursStatutColis, couleursStatutTrajet, ESTRAN (+16 more)

### Community 19 - "Vérifications & stats"
Cohesion: 0.10
Nodes (19): createApp(), makeLimiter(), otpLimiter, publicPostLimiter, uploadLimiter, asyncHandler(), errorHandler(), router (+11 more)

### Community 20 - "Portail chauffeur"
Cohesion: 0.12
Nodes (21): createDriverSchema, documentsSchema, motDePasseSchema, photoSchema, router, searchSchema, verifySchema, createPackageSchema (+13 more)

### Community 21 - "Alertes & WhatsApp"
Cohesion: 0.16
Nodes (22): assignDriverSchema, avecAnnonceGroupe(), createTripSchema, positionSchema, purgeSchema, ratingSchema, alerterCompteValide(), alerterCourseAnnulee() (+14 more)

### Community 22 - "Traductions (i18n)"
Cohesion: 0.11
Nodes (21): ModeCourse, styles, styles, IleDeZanzibar(), styles, LOCALES, styles, Depliant() (+13 more)

### Community 23 - "Location de véhicules"
Cohesion: 0.11
Nodes (16): bookSchema, champsVehicule, COLONNES_SQL, createVehicleSchema, getPhotos(), RENTAL_CATEGORIES, router, updateVehicleSchema (+8 more)

### Community 24 - "Pièces jointes"
Cohesion: 0.16
Nodes (15): styles, ChoixDocument(), decoder(), marquerEnvoi(), preparerFichierWeb(), SecoursNatif(), styles, ZoneFichier() (+7 more)

### Community 25 - "lib · api"
Cohesion: 0.11
Nodes (19): EcranReserver(), EcranTrajet(), annulerTrajet(), confirmerPaiement(), creerAttentePartage(), creerTrajet(), creerTrajetHotel(), noterTrajet() (+11 more)

### Community 26 - "Entretien & purge"
Cohesion: 0.18
Nodes (15): withTransaction(), verifierExpirationsDocuments(), appliquerConfirmation(), notifierPaiementConfirme(), annulerReservationsImpayees(), cloturerRidesPartis(), signalerAttentesCorrespondantes(), validerParrainageApresCourse() (+7 more)

### Community 27 - "lib · api"
Cohesion: 0.12
Nodes (17): EcranProfil(), initiales(), EcranTaxiEquipe(), convertirBonEnCredit(), definirJeton(), definirMotDePasseChauffeur(), demanderRechargeCredit(), demandesRechargeHotel() (+9 more)

### Community 28 - "lib · types"
Cohesion: 0.17
Nodes (16): baseUsdItineraire(), coordonneesVille(), dansLeGroupe(), estAeroportVille(), estTarifDeTerrain(), forfaitZanzigoTrajetUsd(), kmEntreVilles(), netChaineCoteEst() (+8 more)

### Community 29 - "Dépendances mobile"
Cohesion: 0.13
Nodes (15): expo, expo-blur, expo-linking, expo-router, expo-splash-screen, expo-system-ui, dependencies, expo (+7 more)

### Community 30 - "services · moyenpaiement"
Cohesion: 0.27
Nodes (12): enShillings(), MOYEN_CARTE, MOYEN_CREDIT, MOYEN_MOBILE, moyenParDefaut(), moyensPour(), reglement(), round2() (+4 more)

### Community 31 - "lib · types"
Cohesion: 0.15
Nodes (14): EcranAnnonces(), creerRide(), netPlacePartageeTzs(), netPlacePartageeUsd(), normaliserVille(), partagePossibleItineraire(), tarifLocalMiniTzs(), tarifPlacePartagee() (+6 more)

### Community 32 - "lib · api"
Cohesion: 0.14
Nodes (14): EcranFicheVehiculeLocation(), EcranFicheVehicule(), FORMAT_DATE_OK(), EcranVerifications(), ajouterPhotoVehicule(), archiverVehicule(), majVehicule(), obtenirVehicule() (+6 more)

### Community 33 - "lib · alertespush"
Cohesion: 0.30
Nodes (12): CarteAlertes(), activerAlertes(), alertesPossibles(), CibleAlertes, cleEnOctets(), desactiverAlertes(), ecouterAlertes(), etatAlertes (+4 more)

### Community 34 - "components · fondplage"
Cohesion: 0.18
Nodes (12): AMPLITUDES, bruit(), cheminBande(), EstranDeZanzibar(), GRAINES, HALOS, HALOS_GIROFLE, LagonDeVerre() (+4 more)

### Community 35 - "lib · preferencepeau"
Cohesion: 0.18
Nodes (13): LangueProvider(), traduire(), Contexte, ContextePreference, FournisseurPreferencePeau(), peauValide(), PEAUX_AU_CHOIX, usePreferencePeau() (+5 more)

### Community 36 - "mobile · tsconfig"
Cohesion: 0.15
Nodes (12): compilerOptions, paths, strict, extends, include, @/assets/*, ./assets/*, expo-env.d.ts (+4 more)

### Community 37 - "services · paypalservice"
Cohesion: 0.36
Nodes (10): base(), BASES, capturePaypalOrder(), circuitPaiementUsd(), createPaypalOrder(), getAccessToken(), hasPaypalMe(), isPaypalConfigured() (+2 more)

### Community 38 - "backend · test · imports · natifs"
Cohesion: 0.17
Nodes (7): CONTRAT, fichiers, ICI, MOBILE, requireMobile, SRC, ts

### Community 39 - "backend · test · peaux · contraste"
Cohesion: 0.20
Nodes (10): canalLineaire(), contraste(), COURANT, GRAS, luminance(), NOMS_DE_PEAU, PALETTES, preference (+2 more)

### Community 40 - "lib · colislocal"
Cohesion: 0.33
Nodes (11): ajouter(), ajouterColisLocal(), ajouterCourseLocale(), cle(), effacerColisMasques(), lister(), listerColisLocaux(), listerColisMasques() (+3 more)

### Community 41 - "mobile · package"
Cohesion: 0.20
Nodes (9): devDependencies, @types/react, typescript, main, name, private, version, @types/react (+1 more)

### Community 42 - "backend · scripts · smoke · test"
Cohesion: 0.36
Nodes (8): ADMIN, authenticate(), bearer(), call(), check(), main(), PHONES, run

### Community 43 - "app · layout"
Cohesion: 0.25
Nodes (8): CadreApplication(), PEAUX_CLAIRES, PilesNavigation(), RetourEntete(), THEME_CLAIR, THEME_SOMBRE, FICHIERS_POLICES, usePeau()

### Community 44 - "lib · dialogue"
Cohesion: 0.32
Nodes (6): FournisseurDialogues(), reparerAlertesWeb(), DemandeDialogue, Ecouteur, ouvrirDialogue(), sabonnerAuxDialogues()

### Community 45 - "components · calendrierdate"
Cohesion: 0.36
Nodes (7): aMinuit(), CalendrierDate(), LOCALES, memeMois(), styles, ymd(), Langue

### Community 46 - "lib · soleil"
Cohesion: 0.25
Nodes (7): decalageSolaire(), positionSolaire, SECTEUR_ZENITH, secteurSolaire(), appliquerSecteur(), FournisseurSoleil(), reliefOriente()

### Community 47 - "mobile · package · scripts"
Cohesion: 0.29
Nodes (7): scripts, android, ios, lint, reset-project, start, web

### Community 48 - "lib · position"
Cohesion: 0.38
Nodes (6): lienNavigation(), Position, positionActuelle(), positionNative(), positionWeb(), ResultatPosition

### Community 49 - "backend · pwa · mise · a"
Cohesion: 0.60
Nodes (5): controler(), memoire(), occupe(), retenir(), versionChargee()

### Community 50 - "backend · pwa · service · worker"
Cohesion: 0.47
Nodes (3): ecranAttente(), reponsePage(), reseau()

### Community 51 - "backend · test · marque · colobe"
Cohesion: 0.33
Nodes (3): ICI, SVG, TSX

### Community 52 - "lib · api"
Cohesion: 0.33
Nodes (6): EcranScanner(), estQrColis(), colisParQr(), livrerColis(), prochaineActionColis(), recupererColis()

### Community 53 - "components · ridespartages"
Cohesion: 0.33
Nodes (6): heureDepart(), libelleJour(), RidesPartages(), lieuxRides(), listerRides(), reserverPlacesRide()

### Community 54 - "outils · logotype · fabriquer · rational"
Cohesion: 0.33
Nodes (5): composer(), lettres(), L'ICÔNE zanziGo : le monogramme « zG », dans la police de l'application. Le…, Dessine les glyphes en transparent, puis les recadre sur leur encre., Le monogramme, occupant `part` de la largeur, centré sur `fond`.

### Community 56 - "backend · test · soleil · zanzibar"
Cohesion: 0.40
Nodes (3): ICI, REPERES, SOLEIL

### Community 57 - "lib · types"
Cohesion: 0.50
Nodes (4): compteVerifie(), localVerifie(), profilTarifaireUtilisateur(), residentVerifie()

## Knowledge Gaps
- **383 isolated node(s):** `otp_codes`, `uploaded_files`, `driver_signups`, `push_subscriptions`, `name` (+378 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 489 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **39 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `expo-router` connect `Écrans d'entrée (auth)` to `Écrans véhicules & UI`, `Configuration Expo`, `Tableau de bord équipe`, `app · layout`, `Types & briques UI`, `Onglets client`, `Auth & version`, `Traductions (i18n)`, `app · auth`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `plugins` connect `Configuration Expo` to `Écrans d'entrée (auth)`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `otp_codes`, `uploaded_files`, `driver_signups` to the rest of the system?**
  _383 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Tests backend (garde-fous)` be split into smaller, more focused modules?**
  _Cohesion score 0.055825734549138806 - nodes in this community are weakly interconnected._
- **Should `Grille tarifaire` be split into smaller, more focused modules?**
  _Cohesion score 0.055534987041836355 - nodes in this community are weakly interconnected._
- **Should `Client API mobile` be split into smaller, more focused modules?**
  _Cohesion score 0.05683563748079877 - nodes in this community are weakly interconnected._
- **Should `Écrans véhicules & UI` be split into smaller, more focused modules?**
  _Cohesion score 0.09225589225589226 - nodes in this community are weakly interconnected._