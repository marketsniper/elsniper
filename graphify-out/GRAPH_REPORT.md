# Graph Report - elsniper  (2026-08-31)

## Corpus Check
- 237 files · ~327,423 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1500 nodes · 4671 edges · 131 communities (60 shown, 37 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 140 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Tests backend (garde-fous)
- Moteur de paiement
- Client API mobile
- Client API mobile
- Moteur de paiement
- Types partagés mobile
- Client API mobile
- Configuration Expo
- Client API mobile
- Client API mobile
- Dépendances backend
- Moteur de paiement
- Schéma base de données
- Client API mobile
- Client API mobile
- Moteur de paiement
- Client API mobile
- Client API mobile
- Client API mobile
- Moteur de paiement
- Moteur de paiement
- Moteur de paiement
- Client API mobile
- Moteur de paiement
- Client API mobile
- Types partagés mobile
- Moteur de paiement
- Dépendances mobile
- Client API mobile
- Moteur de paiement
- Client API mobile
- Briques UI
- Client API mobile
- Client API mobile
- Client API mobile
- mobile · tsconfig
- Grille tarifaire
- Tests backend (garde-fous)
- Tests backend (garde-fous)
- Client API mobile
- Client API mobile
- Client API mobile
- Dépendances mobile
- Client API mobile
- backend · scripts · smoke · test
- Client API mobile
- Pièces jointes
- Client API mobile
- Client API mobile
- Dépendances mobile
- Client API mobile
- Client API mobile
- backend · pwa · mise · a
- backend · pwa · service · worker
- Tests backend (garde-fous)
- Client API mobile
- outils · logotype · fabriquer · rational
- Tests backend (garde-fous)
- Tests backend (garde-fous)
- Client API mobile
- backend · pwa · installation
- Client API mobile
- outils · marque · verifier
- outils · mises · a · jour
- outils · rendu · ile · preparer
- outils · rendu · ile · rendre
- Schéma base de données
- Schéma base de données
- Schéma base de données
- Schéma base de données
- backend · scripts · rafraichir · web
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
- Dépendances mobile
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
- `getPhotos()` --calls--> `query()`  [EXTRACTED]
  backend/src/routes/rentalVehicles.js → backend/src/db.js
- `readFile()` --calls--> `query()`  [EXTRACTED]
  backend/src/services/storageService.js → backend/src/db.js
- `refuserSiOtpFerme()` --calls--> `HttpError`  [EXTRACTED]
  backend/src/routes/auth.js → backend/src/errors.js
- `courseConfirmee()` --calls--> `adminHeaders()`  [EXTRACTED]
  backend/test/alerte-paiement-a-encaisser.test.js → backend/test/setup.js
- `RetourEntete()` --calls--> `useT()`  [EXTRACTED]
  mobile/src/app/_layout.tsx → mobile/src/lib/i18n.tsx

## Import Cycles
- None detected.

## Communities (131 total, 37 thin omitted)

### Community 0 - "Tests backend (garde-fous)"
Cohesion: 0.06
Nodes (77): migrationsDir, pool, enregistrerAbonnement(), coursePayee(), posterAnnonce(), reserverEtPayer(), annonceReservee(), coursePrete() (+69 more)

### Community 1 - "Moteur de paiement"
Cohesion: 0.06
Nodes (62): valeurReservationPlace(), AEROPORT, ANCIENS_LIBELLES_AEROPORT, RIDE_DESTINATIONS, RIDE_ORIGINS, RIDE_ORIGINS_ACCEPTES, VILLES_RIDES, AEROPORT_ALIAS (+54 more)

### Community 2 - "Client API mobile"
Cohesion: 0.13
Nodes (50): styles, styles, styles, styles, styles, styles, CLES_PROFIL, Mode (+42 more)

### Community 3 - "Client API mobile"
Cohesion: 0.10
Nodes (49): EcranAnnonce(), EcranClient(), EcranColisDispo(), styles, EcranCompteChauffeur(), initiales(), styles, CaseChauffeur (+41 more)

### Community 4 - "Moteur de paiement"
Cohesion: 0.07
Nodes (40): createApp(), makeLimiter(), otpLimiter, publicPostLimiter, uploadLimiter, HttpError, invalidStatus(), isAdmin() (+32 more)

### Community 5 - "Types partagés mobile"
Cohesion: 0.05
Nodes (44): ALIAS_AEROPORT, AnnulationVehicule, CHAINE_COTE_EST, Chauffeur, COMMISSION_PRIVE, COORDONNEES_VILLES, ETAPES_COLIS, GROUPES_NET_USD (+36 more)

### Community 6 - "Client API mobile"
Cohesion: 0.05
Nodes (42): EcranTelephone(), normaliserTelephone(), LayoutRacine(), abonnerAlertes(), abonnerAlertesChauffeur(), annulerAttentePartage(), annulerColis(), annulerLocation() (+34 more)

### Community 7 - "Configuration Expo"
Cohesion: 0.05
Nodes (39): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, predictiveBackGestureEnabled, projectId (+31 more)

### Community 8 - "Client API mobile"
Cohesion: 0.07
Nodes (34): ModeCourse, styles, styles, aMinuit(), CalendrierDate(), LOCALES, memeMois(), styles (+26 more)

### Community 9 - "Client API mobile"
Cohesion: 0.11
Nodes (33): EcranDetailCourse(), styles, CartePosition(), lienOpenStreetMap(), styles, EtapeTimeline, styles, TimelineStatut() (+25 more)

### Community 10 - "Dépendances backend"
Cohesion: 0.05
Nodes (36): @aws-sdk/client-s3, dependencies, @aws-sdk/client-s3, dotenv, express, express-rate-limit, jsonwebtoken, multer (+28 more)

### Community 11 - "Moteur de paiement"
Cohesion: 0.11
Nodes (32): sansSecretsChauffeur(), assignDriverSchema, avecAnnonceGroupe(), courseSansIdentiteClient(), createTripSchema, positionSchema, purgeSchema, ratingSchema (+24 more)

### Community 12 - "Schéma base de données"
Cohesion: 0.10
Nodes (27): driver_monthly_stats, drivers, hotels, packages, payments, set_updated_at(), trg_driver_monthly_stats_updated_at, trg_drivers_updated_at (+19 more)

### Community 13 - "Client API mobile"
Cohesion: 0.11
Nodes (24): bruit(), Canopee(), ColobeVoyageur(), Espece, Souffle(), Bande(), BasCote(), bruit() (+16 more)

### Community 14 - "Client API mobile"
Cohesion: 0.10
Nodes (24): EcranAccueil(), ProfilAccueil, styles, EcranHotelConnexion(), EcranHotelInscription(), LayoutAuth(), EcranOtp(), EcranPro() (+16 more)

### Community 15 - "Moteur de paiement"
Cohesion: 0.11
Nodes (23): config, enShillings(), MOYEN_CARTE, MOYEN_CREDIT, MOYEN_MOBILE, moyenParDefaut(), moyensPour(), reglement() (+15 more)

### Community 16 - "Client API mobile"
Cohesion: 0.07
Nodes (24): Etoiles(), styles, BENTO, ContextePeau, ContexteSoleil, ESTRAN, familleSelonPoids(), FICHIERS_POLICES (+16 more)

### Community 17 - "Client API mobile"
Cohesion: 0.10
Nodes (29): EcranEquipe(), assignerChauffeur(), bannirClient(), commeListe(), confirmerPaiementEquipe(), crediterDemandeRecharge(), fileRechargesCredit(), listerAnnoncesPartageEquipe() (+21 more)

### Community 18 - "Client API mobile"
Cohesion: 0.08
Nodes (26): AbonnementPush, AnnoncePartageEquipe, AnnulationPlace, AttentePartage, BASE_URL, BonFidelite, CreationChauffeur, CreationColis (+18 more)

### Community 19 - "Moteur de paiement"
Cohesion: 0.14
Nodes (24): withTransaction(), appliquerConfirmation(), moyenSchema, notifierPaiementConfirme(), baseFacturePlace(), createRideSchema, PRICING_TZS, pricingPourClient() (+16 more)

### Community 20 - "Moteur de paiement"
Cohesion: 0.15
Nodes (21): verifierExpirationsDocuments(), annulerReservationsImpayees(), cloturerRidesPartis(), signalerAttentesCorrespondantes(), validerParrainageApresCourse(), messageAlerte(), signalerCoursesFigees(), bouton() (+13 more)

### Community 21 - "Moteur de paiement"
Cohesion: 0.11
Nodes (18): authRouter, phoneSchema, refuserSiOtpFerme(), usernameSchema, createDriverSchema, documentsSchema, motDePasseSchema, photoSchema (+10 more)

### Community 22 - "Client API mobile"
Cohesion: 0.12
Nodes (20): styles, EcranNouveauColis(), PRESENTATION_TAILLES, styles, creerColis(), CategorieVehicule, CHAINES, ContexteLangue (+12 more)

### Community 23 - "Moteur de paiement"
Cohesion: 0.19
Nodes (20): query(), notFound(), abonnementSchema, chauffeurDuJeton(), notificationsRouter, getPackage(), getPayment(), isPayer() (+12 more)

### Community 24 - "Client API mobile"
Cohesion: 0.18
Nodes (13): CadreApplication(), PEAUX_CLAIRES, PilesNavigation(), RetourEntete(), THEME_CLAIR, THEME_SOMBRE, FournisseurDialogues(), styles (+5 more)

### Community 25 - "Types partagés mobile"
Cohesion: 0.17
Nodes (16): baseUsdItineraire(), coordonneesVille(), dansLeGroupe(), estAeroportVille(), estTarifDeTerrain(), forfaitZanzigoTrajetUsd(), kmEntreVilles(), netChaineCoteEst() (+8 more)

### Community 26 - "Moteur de paiement"
Cohesion: 0.14
Nodes (11): bookSchema, champsVehicule, COLONNES_SQL, createVehicleSchema, getPhotos(), RENTAL_CATEGORIES, router, updateVehicleSchema (+3 more)

### Community 27 - "Dépendances mobile"
Cohesion: 0.13
Nodes (15): expo, expo-blur, expo-linking, expo-router, expo-splash-screen, expo-system-ui, dependencies, expo (+7 more)

### Community 28 - "Client API mobile"
Cohesion: 0.14
Nodes (15): EcranAnnonces(), creerRide(), lieuxRides(), netPlacePartageeTzs(), netPlacePartageeUsd(), normaliserVille(), partagePossibleItineraire(), tarifLocalMiniTzs() (+7 more)

### Community 29 - "Moteur de paiement"
Cohesion: 0.21
Nodes (9): createPackageSchema, router, scanSchema, alertePaiementColis(), alertePaiementCourse(), aValiderALaMain(), quand(), generatePackageQr() (+1 more)

### Community 30 - "Client API mobile"
Cohesion: 0.14
Nodes (14): EcranCourses(), EcranTaxiEquipe(), definirMotDePasseChauffeur(), envoyerPositionChauffeur(), listerColisARamasser(), listerCoursesChauffeur(), listerCoursesDisponibles(), listerMesColisChauffeur() (+6 more)

### Community 31 - "Briques UI"
Cohesion: 0.18
Nodes (12): AMPLITUDES, bruit(), cheminBande(), EstranDeZanzibar(), GRAINES, HALOS, HALOS_GIROFLE, LagonDeVerre() (+4 more)

### Community 32 - "Client API mobile"
Cohesion: 0.22
Nodes (12): LangueProvider(), traduire(), Contexte, ContextePreference, FournisseurPreferencePeau(), peauValide(), PEAUX_AU_CHOIX, ecrireStockage() (+4 more)

### Community 33 - "Client API mobile"
Cohesion: 0.18
Nodes (11): EcranFicheVehiculeLocation(), EcranLocationOnglet(), FiltreCategorie, Onglet, styles, EcranVehicules(), IconeCategorie, ICONES (+3 more)

### Community 34 - "Client API mobile"
Cohesion: 0.33
Nodes (11): CarteAlertes(), activerAlertes(), alertesPossibles(), CibleAlertes, cleEnOctets(), desactiverAlertes(), ecouterAlertes(), etatAlertes (+3 more)

### Community 35 - "mobile · tsconfig"
Cohesion: 0.15
Nodes (12): compilerOptions, paths, strict, extends, include, @/assets/*, ./assets/*, expo-env.d.ts (+4 more)

### Community 36 - "Grille tarifaire"
Cohesion: 0.36
Nodes (10): base(), BASES, capturePaypalOrder(), circuitPaiementUsd(), createPaypalOrder(), getAccessToken(), hasPaypalMe(), isPaypalConfigured() (+2 more)

### Community 37 - "Tests backend (garde-fous)"
Cohesion: 0.17
Nodes (7): CONTRAT, fichiers, ICI, MOBILE, requireMobile, SRC, ts

### Community 38 - "Tests backend (garde-fous)"
Cohesion: 0.20
Nodes (10): canalLineaire(), contraste(), COURANT, GRAS, luminance(), NOMS_DE_PEAU, PALETTES, preference (+2 more)

### Community 39 - "Client API mobile"
Cohesion: 0.18
Nodes (12): EcranReserver(), creerAttentePartage(), creerTrajet(), creerTrajetHotel(), partagerPointRendezVous(), formaterDateChoisie(), isoDepuisDateHeure(), compteVerifie() (+4 more)

### Community 40 - "Client API mobile"
Cohesion: 0.33
Nodes (11): ajouter(), ajouterColisLocal(), ajouterCourseLocale(), cle(), effacerColisMasques(), lister(), listerColisLocaux(), listerColisMasques() (+3 more)

### Community 41 - "Client API mobile"
Cohesion: 0.18
Nodes (11): EcranTrajet(), annulerTrajet(), confirmerPaiement(), noterTrajet(), obtenirTrajet(), payerTrajet(), payerTrajetAvecCredit(), positionDeMonChauffeur() (+3 more)

### Community 42 - "Dépendances mobile"
Cohesion: 0.20
Nodes (9): devDependencies, @types/react, typescript, main, name, private, version, @types/react (+1 more)

### Community 43 - "Client API mobile"
Cohesion: 0.33
Nodes (9): definirJeton(), obtenirChauffeur(), obtenirHotel(), obtenirUtilisateur(), AuthContext, AuthProvider(), ContexteAuth, verifierSession() (+1 more)

### Community 44 - "backend · scripts · smoke · test"
Cohesion: 0.36
Nodes (8): ADMIN, authenticate(), bearer(), call(), check(), main(), PHONES, run

### Community 45 - "Client API mobile"
Cohesion: 0.22
Nodes (9): EcranHotelEquipe(), EcranVerifications(), crediterHotel(), listerColisHotel(), listerTrajetsHotel(), verifierChauffeur(), verifierClient(), verifierHotel() (+1 more)

### Community 46 - "Pièces jointes"
Cohesion: 0.33
Nodes (8): ChoixDocument(), decoder(), marquerEnvoi(), preparerFichierWeb(), SecoursNatif(), styles, ZoneFichier(), televerser()

### Community 47 - "Client API mobile"
Cohesion: 0.43
Nodes (6): icone(), LayoutChauffeur(), icone(), LayoutOnglets(), MarqueEntete(), useRetourSiDeconnecte()

### Community 48 - "Client API mobile"
Cohesion: 0.25
Nodes (7): decalageSolaire(), positionSolaire, SECTEUR_ZENITH, secteurSolaire(), appliquerSecteur(), FournisseurSoleil(), reliefOriente()

### Community 49 - "Dépendances mobile"
Cohesion: 0.29
Nodes (7): scripts, android, ios, lint, reset-project, start, web

### Community 50 - "Client API mobile"
Cohesion: 0.29
Nodes (7): EcranFicheVehicule(), FORMAT_DATE_OK(), ajouterPhotoVehicule(), archiverVehicule(), majVehicule(), obtenirVehicule(), supprimerPhotoVehicule()

### Community 51 - "Client API mobile"
Cohesion: 0.38
Nodes (6): lienNavigation(), Position, positionActuelle(), positionNative(), positionWeb(), ResultatPosition

### Community 52 - "backend · pwa · mise · a"
Cohesion: 0.60
Nodes (5): controler(), memoire(), occupe(), retenir(), versionChargee()

### Community 53 - "backend · pwa · service · worker"
Cohesion: 0.47
Nodes (3): ecranAttente(), reponsePage(), reseau()

### Community 54 - "Tests backend (garde-fous)"
Cohesion: 0.33
Nodes (3): ICI, SVG, TSX

### Community 55 - "Client API mobile"
Cohesion: 0.33
Nodes (6): EcranScanner(), estQrColis(), colisParQr(), livrerColis(), prochaineActionColis(), recupererColis()

### Community 56 - "outils · logotype · fabriquer · rational"
Cohesion: 0.33
Nodes (5): composer(), lettres(), L'ICÔNE zanziGo : le monogramme « zG », dans la police de l'application. Le…, Dessine les glyphes en transparent, puis les recadre sur leur encre., Le monogramme, occupant `part` de la largeur, centré sur `fond`.

### Community 58 - "Tests backend (garde-fous)"
Cohesion: 0.40
Nodes (3): ICI, REPERES, SOLEIL

### Community 59 - "Client API mobile"
Cohesion: 0.40
Nodes (5): EcranProfil(), initiales(), convertirBonEnCredit(), demanderRechargeCredit(), demandesRechargeHotel()

### Community 61 - "Client API mobile"
Cohesion: 0.67
Nodes (3): EcranNouveauVehicule(), FORMAT_DATE_OK(), creerVehicule()

## Knowledge Gaps
- **385 isolated node(s):** `otp_codes`, `uploaded_files`, `driver_signups`, `push_subscriptions`, `name` (+380 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 491 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `expo-router` connect `Client API mobile` to `Écran équipe`, `Client API mobile`, `Client API mobile`, `Configuration Expo`, `Client API mobile`, `Client API mobile`, `Client API mobile`, `Client API mobile`, `Client API mobile`, `Client API mobile`, `Client API mobile`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `plugins` connect `Configuration Expo` to `Client API mobile`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `otp_codes`, `uploaded_files`, `driver_signups` to the rest of the system?**
  _385 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Tests backend (garde-fous)` be split into smaller, more focused modules?**
  _Cohesion score 0.055825734549138806 - nodes in this community are weakly interconnected._
- **Should `Moteur de paiement` be split into smaller, more focused modules?**
  _Cohesion score 0.057902973395931145 - nodes in this community are weakly interconnected._
- **Should `Client API mobile` be split into smaller, more focused modules?**
  _Cohesion score 0.12715179968701096 - nodes in this community are weakly interconnected._
- **Should `Client API mobile` be split into smaller, more focused modules?**
  _Cohesion score 0.0998185117967332 - nodes in this community are weakly interconnected._