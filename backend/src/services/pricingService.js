import { config } from '../config.js';

// Grille tarifaire PAR ZONE — prix figés sur chaque trip/package à la
// création : modifier cette grille ne réécrit jamais l'historique.
//
// Segmentation (cloison stricte, appliquée aussi à l'affichage côté app) :
//  - tourist  : USD plein tarif (AC incluse sur les options touristes) ;
//  - resident : USD avec remise (config.residentDiscountRate, 5 %) —
//               partagée moitié-moitié entre zanziGo et le chauffeur ;
//  - local    : TZS — tarif de la zone (carte tanzanienne vérifiée) ;
//  - hotel    : USD — même grille que les touristes avec remise partenaire
//               (config.hotelDiscountRate, 5 %).
//
// Zones (depuis/vers la ville ou l'aéroport) :
// Tarif local UNIFIÉ : 17 000 TZS la place partout (sauf trajets spéciaux
// ci-dessous) — plus simple à retenir pour les clients et les chauffeurs.
// HAUSSE DE 5 % SUR LES PRIX TOURISTES (17/08/2026), arrondie au dollar.
// Décision commerciale : les transferts touristes avaient de la marge par
// rapport au marché, les prix LOCAUX n'en avaient pas.
//
// PUIS LA PLACE LOCALE EST PASSÉE DE 15 000 À 16 000 TZS (18/08/2026), pour
// une seule raison : la commission a pris 2 points le même jour. À prix
// constant, ces 2 points seraient sortis entièrement de la poche du chauffeur
// — le partagé local était le seul service dont le prix n'avait pas bougé. À
// 16 000, le chauffeur touche 13 280 TZS la place au lieu de 12 750 : il
// gagne PLUS qu'avant, comme sur tous les autres services. Ce sont les
// 1 000 TZS d'écart, côté client local, qui financent les deux.
const ZONE_TIERS = {
  nord: { privateUsd: 47, localTzs: 17000 }, // Nungwi / Kendwa       (45 → 47)
  nordEst: { privateUsd: 42, localTzs: 17000 }, // Matemwe / Kiwengwa (40 → 42)
  est: { privateUsd: 47, localTzs: 17000 }, // Paje / Bwejuu          (45 → 47)
  estSud: { privateUsd: 53, localTzs: 17000 }, // Jambiani            (50 → 53)
  estPointe: { privateUsd: 53, localTzs: 17000 }, // Michamvi         (50 → 53)
  sud: { privateUsd: 47, localTzs: 17000 }, // Kizimkazi / Makunduchi (45 → 47)
};

// PRIX D'UNE PLACE EN TAXI PARTAGÉ : le TIERS du prix de la course privée du
// même trajet (arrondi au dollar inférieur), jamais fixé à part. Règle voulue
// simple pour qu'un client la vérifie de tête : « à trois, c'est le prix du
// taxi ». À partir de la quatrième place, la voiture rapporte plus au
// chauffeur qu'une course privée — et elle en tient six.
//
// En dessous de PARTAGE_PRIVE_MIN_USD la question ne se pose pas : le taxi
// partagé n'existe pas sur les trajets courts.
function sharedSeatUsd(priveUsd) {
  return Math.floor(priveUsd / 3);
}

// Commissions zanziGo par service (grille « Chauffeur reçoit ») :
//  - privé : deux paliers selon le prix du trajet —
//      40 USD et plus  → 12 % (grand axe, le chauffeur roule longtemps : 88 %) ;
//      moins de 40 USD → 17 % (petit trajet : transfert aéroport, saut de
//      village, liaison courte — proportionnellement plus de frais fixes) ;
//  - taxi partagé TOURISTE (USD) : 25 % ;
//  - taxi partagé LOCAL (TZS) : 17 % ;
//  - colis 20 % — INCHANGÉ (« sur tous les voyages » : les colis ne sont pas
//    des voyages, et leur barème avait déjà été mis à part).
// Les réservations d'hôtel restent sur le taux général config.commissionRate.
//
// HAUSSE DE 2 POINTS SUR TOUS LES VOYAGES (17/08/2026), décidée en même temps
// que la hausse de 5 % des prix touristes. Les deux se compensent pour le
// chauffeur : sur un transfert Nungwi, il touchait 40,50 USD (45 − 10 %), il
// touche maintenant 41,36 (47 − 12 %) — il gagne PLUS qu'avant.
//
// L'EXCEPTION, RÉGLÉE : le taxi partagé LOCAL. Son prix touriste n'ayant pas
// bougé, les 2 points seraient sortis de la poche du chauffeur (12 750 →
// 12 450 TZS la place). La place locale est donc passée à 16 000 TZS dans le
// même mouvement : le chauffeur touche 13 280 TZS, plus qu'avant la hausse.
// Les deux décisions se tiennent — toucher à l'une oblige à relire l'autre.
// LA COURSE PRIVÉE N'EST PLUS ICI : son taux dépend du prix du trajet
// (12 % dès 40 USD, 15 % en dessous) — voir COMMISSION_PRIVE plus bas.
const COMMISSION_RATES = {
  // TAXI PARTAGÉ : zanziGo prend au moins 20 % (21/08/2026), et 25 % côté
  // touriste. Ces taux-là n'ont pas bougé quand la course privée est repassée
  // au pourcentage : ce sont deux décisions séparées.
  shared: 0.25, // taxi partagé touriste (USD)
  local: 0.2, // taxi partagé local (TZS)
  package: 0.2, // colis : inchangé
};

// Les PLACES vendues sur les annonces des chauffeurs (routes rides et stats)
// se règlent sur les deux mêmes taux. Ils sont EXPORTÉS — et non recopiés —
// parce qu'ils l'avaient été : la hausse de 2 points ne s'appliquait qu'ici,
// et les places de taxi partagé étaient restées à l'ancien barème. Une seule
// source pour la commission, sinon elle diverge en silence.
export const TAUX_PLACE_LOCALE = COMMISSION_RATES.local; // 20 % (place en TZS)
export const TAUX_PLACE_USD = COMMISSION_RATES.shared; // 25 % (touriste, résident, hôtel)

// Rattachement des villes aux zones. Les villes de la côte centre-est et
// Fumba sont assimilées aux zones voisines (ajustable sur demande).
const CITY_ZONES = {
  nungwi: 'nord',
  kendwa: 'nord',
  matemwe: 'nordEst',
  kiwengwa: 'nordEst',
  'pwani mchangani': 'nordEst',
  uroa: 'nordEst',
  pongwe: 'nordEst',
  chwaka: 'nordEst',
  paje: 'est',
  bwejuu: 'est',
  jambiani: 'estSud',
  michamvi: 'estPointe',
  dongwe: 'estPointe',
  kizimkazi: 'sud',
  makunduchi: 'sud',
  mtende: 'sud',
  fumba: 'sud',
};

// ---------------------------------------------------------------------------
// LA GRILLE PRIVÉE PART DE CE QUE TOUCHE LE CHAUFFEUR
// ---------------------------------------------------------------------------
//
// Renversement du 21/08/2026. Jusqu'ici on posait un prix client et la
// commission en prélevait un pourcentage : le chauffeur découvrait sa part à
// l'arrivée. Désormais c'est l'inverse. Chaque trajet porte un NET CHAUFFEUR
// décidé sur le terrain, et le prix client est ce net PLUS le forfait zanziGo.
// La commission n'est donc plus un taux mais une somme en dollars, connue
// d'avance, identique quel que soit le moyen de paiement.
//
// LA COMMISSION EST UN POURCENTAGE (voir COMMISSION_PRIVE plus bas) : 12 % à
// partir de 40 USD de prix client, 15 % en dessous. Un forfait en dollars a
// été essayé plus tôt le même jour puis abandonné — le pourcentage suit la
// taille du trajet tout seul, sans palier à entretenir.

// COMMISSION DES COURSES PRIVÉES, EN POURCENTAGE (21/08/2026) : 12 % à partir
// de 40 USD de prix client, 15 % en dessous. Elle remplace le forfait en
// dollars essayé plus tôt dans la journée — un pourcentage suit la taille du
// trajet tout seul, sans palier à entretenir.
//
// Le NET DU CHAUFFEUR reste le point de départ : le prix client est le premier
// dollar entier qui, commission prélevée, lui laisse au moins le montant
// promis. C'est pour ça que le seuil des 40 USD ne crée aucun trou — à 35 USD
// de net, 39 USD de prix ne suffiraient pas (33,15) alors que 40 oui (35,20).
const COMMISSION_PRIVE = { grand: 0.12, petit: 0.15 };
const COMMISSION_PRIVE_SEUIL_USD = 40;

// LE COULOIR DU SUD-EST : Stone Town et l'aéroport vers Paje, Bwejuu et
// Jambiani, la liaison la plus demandée de l'île. Décision du 21/08/2026 :
// le chauffeur y touche 105 000 TZS tout rond — moins que le transfert
// ordinaire, c'est le trajet le plus court et le plus roulé — et zanziGo y
// prend 17 % : c'est le volume qui finance l'infrastructure.
//
// Bwejuu suit Paje et Jambiani sans avoir été nommé : le village est ENTRE les
// deux, sur la même route et souvent dans la même voiture.
const CORRIDOR_SUD_EST = new Set(['paje', 'bwejuu', 'jambiani']);
const COMMISSION_CORRIDOR = 0.17;
const NET_CORRIDOR_TZS = 105000;
const NET_CORRIDOR_USD = NET_CORRIDOR_TZS / config.usdToTzsRate; // ≈ 40,38

// AÉROPORT ↔ STONE TOWN : commission fixée en DOLLARS, pas en pourcentage.
// Sept kilomètres seulement, mais la course la plus fréquente de l'île — celle
// qui tourne toute la journée. Un pourcentage y rapportait 1,95 USD, moins que
// le coût du service ; la commission est donc posée à 4,50, et le chauffeur
// garde ses 11 USD comme prévu.
const COMMISSION_AEROPORT_VILLE_USD = 4.5;

// SUPPLÉMENT DE 1 USD ENTRE VILLAGES (21/08/2026). Une course qui ne part ni
// de Stone Town ni de l'aéroport coûte un dollar de plus, et ce dollar va
// ENTIÈREMENT à zanziGo. Le chauffeur touche exactement ce qu'il touchait
// avant : c'est le client qui met le supplément, pas lui.
//
// Pourquoi seulement entre villages : ce sont les courses les plus dispersées
// de l'île, celles où il faut le plus de coups de fil pour trouver une voiture
// — et celles dont la commission en pourcentage rapportait le moins.
const SUPPLEMENT_VILLAGE_USD = 1;

function estEntreVillages(pickup, dropoff) {
  return !HUBS.has(normCity(pickup)) && !HUBS.has(normCity(dropoff));
}

function estAeroportVille(pickup, dropoff) {
  const p = normCity(pickup);
  const d = normCity(dropoff);
  return (HUBS.has(p) && HUBS_VILLE.has(d)) || (HUBS_VILLE.has(p) && HUBS.has(d));
}

function versCorridorSudEst(pickup, dropoff) {
  const p = normCity(pickup);
  const d = normCity(dropoff);
  return (HUBS.has(p) && CORRIDOR_SUD_EST.has(d)) || (HUBS.has(d) && CORRIDOR_SUD_EST.has(p));
}

/** Taux de commission d'une course privée, selon le prix ET l'itinéraire. */
function tauxCommissionPrive(prixUsd, pickup, dropoff) {
  if (pickup !== undefined) {
    if (estAeroportVille(pickup, dropoff)) return COMMISSION_AEROPORT_VILLE_USD / prixUsd;
    if (versCorridorSudEst(pickup, dropoff)) return COMMISSION_CORRIDOR;
  }
  return prixUsd >= COMMISSION_PRIVE_SEUIL_USD ? COMMISSION_PRIVE.grand : COMMISSION_PRIVE.petit;
}

// Transfert depuis/vers un hub (Stone Town, terminal ferry, aéroport) : prix
// unique vers toute l'île, quelle que soit la plage.
const NET_TRANSFERT_USD = 45;

// LES TRANSFERTS QUI SORTENT DU PRIX UNIQUE (24/08/2026).
//
// Le prix unique traitait Fumba comme Nungwi : 52 USD pour tout le monde. Or
// Fumba est à 27 km de Stone Town quand Nungwi est à 67 — le client payait la
// plage la plus lointaine pour aller à la plus proche.
//
// LE HUB DE DÉPART COMPTE, et pas seulement la destination : l'aéroport est
// plus loin de Nungwi que Stone Town, et plus loin de Matemwe aussi. Chaque
// destination porte donc son net « depuis la ville » et, quand il diffère,
// son net « depuis l'aéroport ».
//
// Les nets sont posés pour retomber EXACTEMENT sur le prix client décidé, la
// commission ordinaire prélevée (12 % à partir de 40 USD, 15 % en dessous) :
//
//   Fumba            17 → 20 × 0,85 = 17,00   (19 → 16,15, insuffisant)
//   Matemwe ville    28 → 33 × 0,85 = 28,05   (32 → 27,20)
//   Matemwe aéroport 39 → 45 × 0,88 = 39,60   (44 → 38,72)
//   Nungwi  ville    39 → 45 × 0,88 = 39,60   (44 → 38,72)
//   Nungwi  aéroport 42 → 48 × 0,88 = 42,24   (47 → 41,36)
//
// « ville » couvre Stone Town ET son terminal ferry : cinq minutes à pied
// séparent les deux, aucune course ne se vend entre elles.
const NET_TRANSFERT_PAR_VILLE_USD = {
  fumba: { ville: 17 },
  matemwe: { ville: 28, aeroport: 39 },
  nungwi: { ville: 39, aeroport: 42 },
};

// L'aéroport et la ville sont à sept kilomètres : ce n'est pas un transfert de
// plage, et son prix n'a rien à voir. C'est en revanche la course la plus
// fréquente de l'île : 10 USD au chauffeur, 4,50 à zanziGo, 14,50 au client.
const NET_AEROPORT_VILLE_USD = 10;

// NETS CHAUFFEUR VILLE ↔ VILLE, par groupes. Le premier groupe qui contient la
// paire l'emporte : l'ordre va donc du plus précis au plus large. Ce que la
// liste ne couvre pas retombe sur la table au kilomètre (PALIERS_KM_NET_USD).
const GROUPES_NET_USD = [
  // Sauts de village de la côte est — prix de terrain, donnés un par un.
  { a: ['paje'], b: ['jambiani', 'bwejuu'], net: 10 },
  { a: ['nungwi'], b: ['kendwa'], net: 10 },
  { a: ['paje'], b: ['makunduchi'], net: 15 },
  { a: ['kizimkazi'], b: ['makunduchi'], net: 15 },
  { a: ['makunduchi'], b: ['mtende'], net: 15 },
  // Michamvi et Dongwe sont au bout de la presqu'île : le chauffeur en revient
  // à vide. Ils se paient plus cher que Makunduchi, pourtant plus loin.
  { a: ['paje'], b: ['michamvi', 'dongwe', 'kizimkazi'], net: 20 },
  // Depuis le nord. Kendwa suit Nungwi partout : cinq kilomètres les séparent.
  { a: ['nungwi', 'kendwa'], b: ['matemwe', 'pwani mchangani'], net: 25 },
  { a: ['nungwi', 'kendwa'], b: ['kiwengwa', 'uroa', 'chwaka'], net: 35 },
  { a: ['nungwi', 'kendwa'], b: ['paje', 'bwejuu', 'jambiani'], net: 50 },
  {
    a: ['nungwi', 'kendwa'],
    b: ['makunduchi', 'michamvi', 'dongwe', 'kizimkazi', 'mtende'],
    net: 55,
  },
  // La côte sud-est vers la côte nord-est : pas de route côtière continue, il
  // faut remonter par le carrefour de Tunguu et redescendre.
  { a: ['paje', 'bwejuu', 'jambiani'], b: ['chwaka', 'uroa', 'pongwe'], net: 45 },
  { a: ['paje', 'bwejuu', 'jambiani'], b: ['kiwengwa', 'pwani mchangani', 'matemwe'], net: 47 },
  {
    a: ['makunduchi', 'michamvi', 'dongwe', 'kizimkazi', 'mtende'],
    b: ['uroa', 'pongwe', 'chwaka', 'kiwengwa', 'pwani mchangani', 'matemwe'],
    net: 50,
  },
  // Fumba est au bout de sa presqu'île : pour rejoindre l'est il repasse par
  // Tunguu, exactement comme depuis Stone Town — donc au prix du transfert.
  {
    a: ['fumba'],
    b: [
      'paje', 'bwejuu', 'jambiani', 'michamvi', 'dongwe', 'makunduchi', 'mtende',
      'kizimkazi', 'chwaka', 'uroa', 'pongwe', 'kiwengwa', 'pwani mchangani', 'matemwe',
    ],
    net: 45,
  },
  { a: ['fumba'], b: ['nungwi', 'kendwa'], net: 50 },
];

// Trajets spéciaux à prix fixe (TZS, place locale en taxi partagé), deux
// sens : la traversée Nungwi ↔ Paje est plus longue que les liaisons
// standard, la place locale y vaut 22 000 TZS au lieu de 17 000. Elle suit la
// place ordinaire (20 000 → 21 000) pour la même raison : à prix figé, le
// chauffeur aurait perdu 400 TZS sur la plus longue traversée de l'île.
// La place LOCALE passe de 16 000 à 17 000 TZS (et de 21 000 à 22 000 sur la
// grande traversée) le 21/08/2026 : la commission des places partagées est
// montée à 20 %, et sans cette hausse les 3 points seraient sortis de la poche
// du chauffeur. À 17 000 il touche 13 600 au lieu de 13 280 — il gagne PLUS
// qu'avant, comme la dernière fois qu'on a bougé les deux ensemble.
// PAJE VERS LA VILLE, POUR LES LOCAUX : 15 000 TZS (22/08/2026).
// Paje ↔ Stone Town, ↔ le ferry et ↔ l'aéroport passent de 17 000 à 15 000 la
// place. C'est la ligne la plus fréquentée par les habitants de la côte est —
// ceux qui vont travailler en ville et rentrent le soir. À 15 000, le
// chauffeur touche 12 000 nets au lieu de 13 000 : la baisse sort de sa poche,
// pas de la commission. C'est un choix commercial assumé sur ce corridor.
const SPECIAL_LOCAL_ROUTES_TZS = [
  { a: 'Nungwi', b: 'Paje', tzs: 22000 },
  { a: 'Paje', b: 'Stone Town', tzs: 15000 },
  { a: 'Paje', b: 'Stone Town Ferry', tzs: 15000 },
  { a: 'Paje', b: 'Aéroport', tzs: 15000 },
];

// Colis : forfait par taille (Stone Town → n'importe quelle plage),
// payé en ligne à 100 % par l'expéditeur.
const PACKAGE_FARES = {
  small: { USD: 5, TZS: 13000 }, // enveloppe, clés, passeport, documents
  medium: { USD: 10, TZS: 26000 }, // sac à dos, petit carton, épices
  large: { USD: 18, TZS: 47000 }, // grosse valise, caisse de ravitaillement
};

const round2 = (n) => Math.round(n * 100) / 100;

// LE CHAUFFEUR TOUCHE DES COMPTES RONDS (21/08/2026). Tout gain en shillings
// est arrondi au MILLIER INFÉRIEUR — 118 976 devient 118 000 — et les
// shillings restants rejoignent la commission zanziGo. Un chauffeur vérifie
// son portefeuille de tête ; personne ne compte 976 shillings.
export function arrondiMillierTzs(montant) {
  return Math.floor(montant / 1000) * 1000;
}

/**
 * COMMISSION D'UNE COURSE PRIVÉE : le pourcentage appliqué au prix de base,
 * PLUS le supplément entre villages en entier — ce dollar-là ne se partage
 * pas. Et jamais au point d'entamer le net qu'on lui a promis : la
 * commission s'arrête là, quitte à ce que zanziGo ne gagne rien sur cette
 * course. (Sur une course remisée, le net passé ici est DÉJÀ celui d'après
 * partage — voir priceTrip.)
 */
function commissionPrive(prix, net, taux, supplement = 0) {
  const base = prix - supplement;
  const brute = Math.min(base * taux + supplement, prix - net);
  // Arrondi au CENTIME INFÉRIEUR : arrondir au plus proche pouvait faire
  // passer le chauffeur un cheveu SOUS sa promesse quand elle n'est pas un
  // dollar rond (le couloir promet 105 000 TZS, soit 40,3846 USD).
  return Math.max(0, Math.floor(brute * 100) / 100);
}

// « Ville (précision) » → « ville » ; insensible à la casse.
const normCity = (s) => (s || '').replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();

// L'aéroport a plusieurs libellés historiques ; tous désignent le même lieu.
const AEROPORT_ALIAS = new Set([
  'aéroport (aakia)',
  'aéroport abeid amani karume',
  'aéroport international abeid amani karume',
  'aéroport',
  'airport',
]);

// Deux points sont « le même endroit » si leurs noms coïncident, ou s'ils
// désignent tous deux l'aéroport. Sert à refuser un trajet départ = arrivée
// (ex. aéroport → aéroport, désormais que l'aéroport est aussi une arrivée).
export function memeEndroit(a, b) {
  const na = (a || '').trim().toLowerCase();
  const nb = (b || '').trim().toLowerCase();
  if (AEROPORT_ALIAS.has(na) && AEROPORT_ALIAS.has(nb)) return true;
  return normCity(a) === normCity(b);
}

// Zone tarifaire d'un itinéraire : la ville zonée du trajet (l'autre bout
// étant en général la ville/l'aéroport). Si les deux bouts sont zonés,
// on retient la zone au tarif privé le plus élevé.
function tierForRoute(pickup, dropoff) {
  const z1 = ZONE_TIERS[CITY_ZONES[normCity(pickup)]];
  const z2 = ZONE_TIERS[CITY_ZONES[normCity(dropoff)]];
  const fallback = {
    privateUsd: 53,
    sharedUsd: config.sharedRideUsdPerSeat,
    localTzs: config.localTripPriceTzs,
  };
  if (z1 && z2) return z1.privateUsd >= z2.privateUsd ? z1 : z2;
  return z1 ?? z2 ?? fallback;
}


// LA CHAÎNE DE LA CÔTE EST : les villages se suivent sur une seule et même
// route. Le prix s'y compte en VILLAGES TRAVERSÉS, pas en kilomètres — c'est
// ainsi que les chauffeurs l'annoncent, et deux voisins peuvent être à 7 comme
// à 14 km sans que la course change de prix. Les paliers au kilomètre s'y
// trompaient : Jambiani ↔ Makunduchi, voisins immédiats, tombaient au prix
// d'un village d'écart pour un kilomètre de trop.
const CHAINE_COTE_EST = [
  'michamvi',
  'dongwe',
  'bwejuu',
  'paje',
  'jambiani',
  'makunduchi',
  'mtende',
  'kizimkazi',
];
// Écart de 1 village → 10 USD, de 2 → 15, de 3 et plus → 20.
const NETS_CHAINE_USD = [0, 10, 15, 20];

function netChaineCoteEst(p, d) {
  const i = CHAINE_COTE_EST.indexOf(p);
  const j = CHAINE_COTE_EST.indexOf(d);
  if (i < 0 || j < 0 || i === j) return undefined;
  return NETS_CHAINE_USD[Math.min(Math.abs(i - j), 3)];
}

/** La paire (p, d) tombe-t-elle dans ce groupe, dans un sens ou dans l'autre ? */
function dansLeGroupe(groupe, p, d) {
  return (
    (groupe.a.includes(p) && groupe.b.includes(d)) ||
    (groupe.b.includes(p) && groupe.a.includes(d))
  );
}

/**
 * CE QUE LE CHAUFFEUR GARDE sur une course privée, en dollars.
 *
 * C'est le chiffre de référence de toute la grille : le prix client s'en
 * déduit, jamais l'inverse. Seule la remise RÉSIDENT l'entame, de la moitié
 * de son montant — voir priceTrip.
 */
export function netChauffeurPriveUsd(pickup, dropoff) {
  const p = normCity(pickup);
  const d = normCity(dropoff);
  // Aéroport ↔ ville : sept kilomètres, ce n'est pas un transfert de plage.
  if ((HUBS.has(p) && HUBS_VILLE.has(d)) || (HUBS_VILLE.has(p) && HUBS.has(d))) {
    return NET_AEROPORT_VILLE_USD;
  }
  if (HUBS.has(p) || HUBS.has(d)) {
    if (versCorridorSudEst(pickup, dropoff)) return NET_CORRIDOR_USD;
    // Le hub est un bout, la destination est l'autre.
    const hub = HUBS.has(p) ? p : d;
    const destination = HUBS.has(p) ? d : p;
    const exception = NET_TRANSFERT_PAR_VILLE_USD[destination];
    if (!exception) return NET_TRANSFERT_USD;
    // Depuis l'aéroport quand la destination le distingue, sinon le net de la
    // ville — Stone Town et son ferry partagent le même.
    return !HUBS_VILLE.has(hub) && exception.aeroport !== undefined
      ? exception.aeroport
      : exception.ville;
  }
  const groupe = GROUPES_NET_USD.find((g) => dansLeGroupe(g, p, d));
  if (groupe) return groupe.net;
  const chaine = netChaineCoteEst(p, d);
  if (chaine !== undefined) return chaine;
  const km = kmEntreVilles(pickup, dropoff);
  if (km !== null) return PALIERS_KM_NET_USD.find((palier) => km <= palier.maxKm).net;
  // Lieu inconnu : on ne descend jamais sous le prix d'un transfert, sinon une
  // faute de frappe dans un nom de village ferait rouler un chauffeur à perte.
  return NET_TRANSFERT_USD;
}

/**
 * Taux de commission appliqué à ce trajet précis : 0,12 ou 0,15.
 */
export function tauxCommissionTrajet(pickup, dropoff) {
  return tauxCommissionPrive(baseUsdForRoute(pickup, dropoff), pickup, dropoff);
}

/**
 * CE QUE ZANZIGO GARDE sur ce trajet, en dollars — la différence entre le prix
 * client et le net du chauffeur. Une seule source : si le prix change, la part
 * suit, elle n'est jamais recalculée à part.
 */
export function forfaitZanzigoTrajetUsd(pickup, dropoff) {
  return privateUsdForRoute(pickup, dropoff) - netChauffeurPriveUsd(pickup, dropoff);
}

function specialLocalRouteTzs(pickup, dropoff) {
  // L'aéroport porte cinq libellés historiques : sans ce repli sur un nom
  // canonique, une règle écrite « Aéroport » ne s'appliquerait pas à un trajet
  // saisi « Aéroport international Abeid Amani Karume » — la règle serait
  // silencieusement sans effet, ce qui est le pire des deux mondes.
  const canon = (v) => {
    const n = normCity(v);
    return AEROPORT_ALIAS.has(n) ? 'aéroport' : n;
  };
  const p = canon(pickup);
  const d = canon(dropoff);
  const route = SPECIAL_LOCAL_ROUTES_TZS.find((r) => {
    const a = canon(r.a);
    const b = canon(r.b);
    return (p === a && d === b) || (p === b && d === a);
  });
  return route?.tzs;
}

// ---------------------------------------------------------------------------
// GRILLE PRIVÉE VILLE ↔ VILLE, AU KILOMÈTRE
// ---------------------------------------------------------------------------
// Le prix privé entre deux villes (hors hubs Stone Town / aéroport, qui
// gardent la grille par zone) suit des PALIERS DE DISTANCE — pas une
// multiplication au kilomètre. Un client comprend « c'est le village d'à
// côté » ou « c'est la traversée de l'île » ; il ne compte pas les
// kilomètres, et un chauffeur non plus.
//
// Les paliers sont calés sur les prix de la côte est déjà en place :
// village voisin 12 USD, un village d'écart 16 USD. Ils prolongent la même
// logique jusqu'à la grande traversée du nord au sud, à 65 USD.
//
// Le prix au kilomètre baisse à mesure que le trajet s'allonge (1,00 USD/km
// sur un saut de village, 0,61 sur la traversée) : c'est le carburant qui
// domine sur les longues distances, pas le temps du chauffeur.
//
// ATTENTION AUX PALIERS TROP LARGES — la leçon de Paje ↔ Kiwengwa.
// Un palier plat de 20 km écrase le prix à son sommet : entre 30 et 50 km on
// payait 25 USD, soit 0,83 USD/km à 30 km mais 0,50 à 50 km. Paje ↔ Kiwengwa
// (48 km) tombait pile en haut de cette marche et payait moitié moins du
// kilomètre que le village d'à côté — le chauffeur y perdait sa journée.
// Les paliers du milieu font donc 8 à 15 km, jamais 20 : le prix au kilomètre
// reste entre 0,65 et 1,00 sur toute la gamme, au lieu de tomber à 0,50.
const PALIERS_KM_NET_USD = [
  { maxKm: 12, net: 10 }, // village voisin — Nungwi ↔ Kendwa, Paje ↔ Jambiani
  { maxKm: 25, net: 15 }, // un village d'écart — Bwejuu ↔ Jambiani
  { maxKm: 35, net: 20 }, // deux villages — Kiwengwa ↔ Chwaka
  { maxKm: 45, net: 25 },
  { maxKm: 60, net: 35 },
  { maxKm: 80, net: 45 },
  { maxKm: 100, net: 50 },
  { maxKm: Infinity, net: 55 }, // du nord au sud
];
const CITY_COORDS = {
  'aéroport (aakia)': [-6.221, 39.223],
  'aéroport abeid amani karume': [-6.221, 39.223],
  'aéroport international abeid amani karume': [-6.221, 39.223],
  aéroport: [-6.221, 39.223],
  airport: [-6.221, 39.223],
  'stone town': [-6.162, 39.191],
  'stone town ferry': [-6.163, 39.19],
  nungwi: [-5.7272, 39.2992],
  kendwa: [-5.7516, 39.2912],
  matemwe: [-5.8422, 39.3582],
  'pwani mchangani': [-5.9242, 39.3561],
  kiwengwa: [-5.9901, 39.3761],
  pongwe: [-6.0484, 39.4052],
  uroa: [-6.093, 39.4237],
  chwaka: [-6.1652, 39.4351],
  michamvi: [-6.1445, 39.4955],
  bwejuu: [-6.2372, 39.5323],
  paje: [-6.2667, 39.5341],
  jambiani: [-6.3219, 39.5468],
  makunduchi: [-6.4127, 39.5534],
  mtende: [-6.4547, 39.5276],
  dongwe: [-6.1912, 39.5317],
  kizimkazi: [-6.4544, 39.4728],
  fumba: [-6.3148, 39.2848],
};
const DETOUR_ROUTIER = 1.35; // les routes de l'île ne sont jamais directes
const HUBS = new Set([
  'stone town',
  'stone town ferry',
  'aéroport (aakia)',
  'aéroport abeid amani karume',
  'aéroport international abeid amani karume',
  'aéroport',
  'airport',
]);

// Stone Town et son terminal ferry sont la MÊME place : cinq minutes à pied.
// Aucune course ne se vend entre les deux. L'aéroport, lui, est à sept
// kilomètres — c'est un vrai transfert, et l'un des plus demandés de l'île.
const HUBS_VILLE = new Set(['stone town', 'stone town ferry']);

// Kilomètres de ROUTE estimés entre deux villes connues (sinon null).
export function kmEntreVilles(a, b) {
  const ca = CITY_COORDS[normCity(a)];
  const cb = CITY_COORDS[normCity(b)];
  if (!ca || !cb) return null;
  const rad = Math.PI / 180;
  const dLat = (cb[0] - ca[0]) * rad;
  const dLng = (cb[1] - ca[1]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(ca[0] * rad) * Math.cos(cb[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)) * DETOUR_ROUTIER;
}

// Prix privé USD d'un itinéraire : trajet spécial d'abord (ex. Nungwi ↔
// Michamvi 68),
// grille par zone pour les liaisons depuis/vers les hubs (tarifs
// historiques inchangés), formule au kilomètre pour toute autre paire de
// villes connues, zone en dernier recours.
/**
 * Prix client AVANT le supplément entre villages : le premier dollar entier
 * qui laisse au chauffeur son montant promis une fois la commission prélevée.
 * On part du net lui-même — en dessous, aucun prix ne peut convenir.
 */
function baseUsdForRoute(pickup, dropoff) {
  const net = netChauffeurPriveUsd(pickup, dropoff);
  // Commission fixée en dollars : le prix est la somme, pas une division.
  if (estAeroportVille(pickup, dropoff)) return net + COMMISSION_AEROPORT_VILLE_USD;
  for (let prix = Math.floor(net); prix <= net * 2 + 10; prix += 1) {
    if (round2(prix * (1 - tauxCommissionPrive(prix, pickup, dropoff))) >= net) return prix;
  }
  return Math.ceil(net / (1 - COMMISSION_PRIVE.petit));
}

/** Le dollar de supplément, s'il s'applique à ce trajet. */
function supplementUsd(pickup, dropoff) {
  return estEntreVillages(pickup, dropoff) ? SUPPLEMENT_VILLAGE_USD : 0;
}

export function privateUsdForRoute(pickup, dropoff) {
  return baseUsdForRoute(pickup, dropoff) + supplementUsd(pickup, dropoff);
}

// Prix touriste (USD) d'une place en trajet partagé selon l'itinéraire —
// utilisé aussi pour l'affichage des trajets postés par les chauffeurs.
export function sharedSeatUsdForRoute(pickup, dropoff) {
  return sharedSeatUsd(privateUsdForRoute(pickup, dropoff));
}

// Le TARIF LOCAL (place à 16 000 TZS, spéciaux inclus, ex. Nungwi ↔ Paje
// 21 000) ne s'applique que sur les GRANDS AXES — définis par : le taxi
// privé du même trajet coûte au moins 40 USD. Sur les petits trajets
// (privé sous les 40 USD), pas de tarif local : la place se paie au prix
// touriste de la zone, converti en shillings.
//
// Ce seuil suit la grille : quand les transferts vers Nungwi sont passés de
// 50 à 40 USD, le laisser à 45 aurait sorti les grands axes du nord du tarif
// local — un Zanzibarite aurait payé 46 800 TZS sa place au lieu de 16 000.
const GRAND_AXE_PRIVE_MIN_USD = 40;

function estGrandAxe(pickup, dropoff) {
  return privateUsdForRoute(pickup, dropoff) >= GRAND_AXE_PRIVE_MIN_USD;
}

// Le TAXI PARTAGÉ n'existe que sur les trajets assez longs : course privée
// du même trajet à 35 USD minimum. En dessous (petits sauts de la côte est,
// villages voisins…), course privée uniquement.
const PARTAGE_PRIVE_MIN_USD = 35;

export function sharedAllowedForRoute(pickup, dropoff) {
  return privateUsdForRoute(pickup, dropoff) >= PARTAGE_PRIVE_MIN_USD;
}

// Seuls Stone Town et le terminal ferry sont confondus : aucune course entre
// eux. Aéroport ↔ Stone Town et aéroport ↔ ferry sont des transferts normaux,
// facturés 18 USD (voir SPECIAL_PRIVATE_ROUTES_USD).
export function hubToHubRoute(pickup, dropoff) {
  return HUBS_VILLE.has(normCity(pickup)) && HUBS_VILLE.has(normCity(dropoff));
}

// Prix local (TZS) d'une place — c'est LUI qui est posé automatiquement sur
// les trajets partagés postés par les chauffeurs (le chauffeur ne choisit
// pas son prix).
export function localSeatTzsForRoute(pickup, dropoff) {
  const tier = tierForRoute(pickup, dropoff);
  if (!estGrandAxe(pickup, dropoff)) {
    return Math.round(sharedSeatUsdForRoute(pickup, dropoff) * config.usdToTzsRate);
  }
  return specialLocalRouteTzs(pickup, dropoff) ?? tier.localTzs;
}

// audience : 'tourist' | 'resident' | 'local' | 'hotel'
// route : { pickup, dropoff } — détermine la zone et les trajets spéciaux.
export function priceTrip(tripType, audience, route = {}) {
  const tier = tierForRoute(route.pickup, route.dropoff);

  if (audience === 'local') {
    // Course PRIVÉE : même prix que la grille touriste (grille au kilomètre
    // ville ↔ ville incluse), converti en shillings — commission privée
    // selon le prix (12 % dès 40 USD, 17 % en dessous).
    if (tripType === 'private') {
      const usd = privateUsdForRoute(route.pickup, route.dropoff);
      const price = Math.round(usd * config.usdToTzsRate);
      const net = Math.round(netChauffeurPriveUsd(route.pickup, route.dropoff) * config.usdToTzsRate);
      const supp = supplementUsd(route.pickup, route.dropoff);
      const taux = tauxCommissionPrive(usd - supp, route.pickup, route.dropoff);
      const suppTzs = Math.round(supp * config.usdToTzsRate);
      // Compte rond pour le chauffeur : son gain est arrondi au millier
      // inférieur, les shillings restants rejoignent la commission.
      const brut = price - commissionPrive(price, net, taux, suppTzs);
      return {
        price,
        commission: price - arrondiMillierTzs(brut),
        currency: 'TZS',
      };
    }
    // Taxi partagé local : tarif unifié (trajets spéciaux inclus) SUR LES
    // GRANDS AXES uniquement ; ailleurs, prix touriste converti en TZS —
    // commission 17 % dans les deux cas (taxi partagé local en TZS).
    const price = localSeatTzsForRoute(route.pickup, route.dropoff);
    // Même règle du compte rond : 17 000 − 20 % = 13 600, le chauffeur touche
    // 13 000 et les 600 restants vont à la commission.
    const netRond = arrondiMillierTzs(price * (1 - COMMISSION_RATES.local));
    return { price, commission: price - netRond, currency: 'TZS' };
  }

  let usd;
  let taux;
  if (tripType === 'private') {
    usd = privateUsdForRoute(route.pickup, route.dropoff);
    // 12 % dès 40 USD, 15 % en dessous — et 15 % sur le couloir du sud-est.
    // Le taux porte sur le prix HORS supplément : le dollar entre villages
    // n'est pas une course plus chère, c'est une part zanziGo de plus.
    taux = tauxCommissionPrive(usd - supplementUsd(route.pickup, route.dropoff), route.pickup, route.dropoff);
  } else if (tripType === 'shared_tourist' || tripType === 'posted_return') {
    usd = sharedSeatUsdForRoute(route.pickup, route.dropoff);
    taux = COMMISSION_RATES.shared; // 22 % — le chauffeur reçoit 78 %
  } else {
    return null; // shared_local n'existe pas en USD
  }
  // Grille touriste remisée : résident vérifié −5 %, hôtel partenaire −5 %.
  //
  // La remise partenaire ne vaut QUE sur les courses privées. Une place de
  // taxi partagé se vend déjà au prix le plus bas de la grille (12 à 18 USD) :
  // la remiser rognerait la part du chauffeur, qui remplit sa voiture place
  // par place. L'hôtel garde son avantage là où il y a de la marge.
  const remiseHotelApplicable = audience === 'hotel' && tripType === 'private';
  const tauxRemise =
    audience === 'resident'
      ? config.residentDiscountRate
      : remiseHotelApplicable
        ? config.hotelDiscountRate
        : 0;
  const remise = tauxRemise ? round2(usd * (1 - tauxRemise)) : usd;

  // QUI PAIE LA REMISE ?
  //
  //  · RÉSIDENT (−5 %) : les deux, à parts égales. Le client paie 5 % de
  //    moins, zanziGo abandonne 2,5 % du prix plein et le chauffeur 2,5 %. Un
  //    résident est un client de toute l'année, pas d'un séjour : le
  //    chauffeur y gagne un habitué, il en porte donc la moitié.
  //  · HÔTEL PARTENAIRE (−5 %) : zanziGo seule. C'est un geste commercial de
  //    la maison pour décrocher un partenariat — le chauffeur n'a rien
  //    négocié, son net reste intact.
  const partChauffeur = audience === 'resident' && tauxRemise ? partRemiseResidentUsd(usd) : 0;

  // Le partage se calcule TOUJOURS à partir du partage au PRIX PLEIN, jamais
  // du net promis. Le chauffeur touche souvent un peu plus que sa promesse
  // (12 % de 52 laissent 45,76 là où on lui promet 45) : retrancher la moitié
  // de la remise du plancher, et non de ce qu'il touche vraiment, lui aurait
  // fait porter bien plus que sa moitié.
  // On vise le NET du chauffeur, et la commission n'est que le reste. C'est
  // l'ordre qui protège : le prix remisé s'arrondit au centime, et ce
  // centime-là doit tomber sur zanziGo, jamais sur le chauffeur.
  const netApresPartage = (pleine) => round2(usd - pleine - partChauffeur);

  if (tripType === 'private') {
    const net = netChauffeurPriveUsd(route.pickup, route.dropoff);
    const supp = supplementUsd(route.pickup, route.dropoff);
    if (partChauffeur) {
      const cible = netApresPartage(commissionPrive(usd, net, taux, supp));
      return { price: remise, commission: Math.max(0, round2(remise - cible)), currency: 'USD' };
    }
    // Remise hôtel (ou aucune remise) : le net promis est un plancher que la
    // commission ne franchit pas — au pire zanziGo ne gagne rien.
    const price = Math.max(net, remise);
    return { price, commission: commissionPrive(price, net, taux, supp), currency: 'USD' };
  }
  if (partChauffeur) {
    const cible = netApresPartage(round2(usd * taux));
    return { price: remise, commission: Math.max(0, round2(remise - cible)), currency: 'USD' };
  }
  return { price: remise, commission: round2(remise * taux), currency: 'USD' };
}

/**
 * LE NET D'UNE PLACE PARTAGÉE POUR UN RÉSIDENT, en dollars.
 *
 * Même ordre que dans la grille : on vise le net du chauffeur, la commission
 * n'est que le reste — le centime d'arrondi du prix remisé tombe ainsi sur
 * zanziGo.
 */
export function netPlaceResidentUsd(usdPlein) {
  return round2(usdPlein * (1 - COMMISSION_RATES.shared) - partRemiseResidentUsd(usdPlein));
}

/**
 * CE QUE LE CHAUFFEUR ABANDONNE sur une remise résident : la moitié.
 *
 * Décision du 21/08/2026 : la remise résident ne sort plus de la seule poche
 * de zanziGo — chacun en lâche la moitié (2,5 % du prix plein pour 5 % de
 * remise).
 * Exporté pour que les listes de places partagées et les statistiques
 * comptent comme la grille, au lieu de refaire le calcul chacune de leur côté.
 */
export function partRemiseResidentUsd(usdPlein) {
  // Arrondi au centime INFÉRIEUR : le chauffeur ne lâche jamais plus que sa
  // moitié. Quand la remise ne se coupe pas en deux comptes ronds, le centime
  // qui reste est pour nous.
  return Math.floor(usdPlein * config.residentDiscountRate * 50) / 100;
}

// size : 'small' | 'medium' | 'large' ; remise : ex. 0.05 pour un hôtel
// partenaire (même grille que les touristes avec −5 %).
export function pricePackage(currency, size = 'medium', remise = 0) {
  const fare = PACKAGE_FARES[size]?.[currency];
  if (fare === undefined) return null;
  const price = remise ? round2(fare * (1 - remise)) : fare;
  // Colis en shillings : même règle du compte rond que les courses — le net
  // du chauffeur tombe au millier inférieur, le reste rejoint la commission.
  if (currency === 'TZS') {
    const netRond = arrondiMillierTzs(price * (1 - COMMISSION_RATES.package));
    return { price, commission: round2(price - netRond), currency };
  }
  return {
    price,
    commission: round2(price * COMMISSION_RATES.package), // 20 % — chauffeur 80 %
    currency,
  };
}
