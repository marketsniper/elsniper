import { config } from '../config.js';

// Grille tarifaire PAR ZONE — prix figés sur chaque trip/package à la
// création : modifier cette grille ne réécrit jamais l'historique.
//
// Segmentation (cloison stricte, appliquée aussi à l'affichage côté app) :
//  - tourist  : USD plein tarif (AC incluse sur les options touristes) ;
//  - resident : USD avec remise (config.residentDiscountRate, 10 %) ;
//  - local    : TZS — tarif de la zone (carte tanzanienne vérifiée) ;
//  - hotel    : USD — même grille que les touristes avec remise partenaire
//               (config.hotelDiscountRate, 5 %).
//
// Zones (depuis/vers la ville ou l'aéroport) :
// Tarif local UNIFIÉ : 16 000 TZS la place partout (sauf trajets spéciaux
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
  nord: { privateUsd: 47, localTzs: 16000 }, // Nungwi / Kendwa       (45 → 47)
  nordEst: { privateUsd: 42, localTzs: 16000 }, // Matemwe / Kiwengwa (40 → 42)
  est: { privateUsd: 47, localTzs: 16000 }, // Paje / Bwejuu          (45 → 47)
  estSud: { privateUsd: 53, localTzs: 16000 }, // Jambiani            (50 → 53)
  estPointe: { privateUsd: 53, localTzs: 16000 }, // Michamvi         (50 → 53)
  sud: { privateUsd: 47, localTzs: 16000 }, // Kizimkazi / Makunduchi (45 → 47)
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
//  - taxi partagé TOURISTE (USD) : 22 % ;
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
// LA COURSE PRIVÉE N'EST PLUS ICI (21/08/2026) : sa commission est un forfait
// en dollars, pas un taux — voir forfaitZanzigoUsd plus bas. Les places de
// taxi partagé et les colis, eux, restent au pourcentage.
const COMMISSION_RATES = {
  shared: 0.22, // taxi partagé touriste (USD)
  local: 0.17, // taxi partagé local (TZS)
  package: 0.2, // colis : inchangé
};

// Les PLACES vendues sur les annonces des chauffeurs (routes rides et stats)
// se règlent sur les deux mêmes taux. Ils sont EXPORTÉS — et non recopiés —
// parce qu'ils l'avaient été : la hausse de 2 points ne s'appliquait qu'ici,
// et les places de taxi partagé étaient restées à l'ancien barème. Une seule
// source pour la commission, sinon elle diverge en silence.
export const TAUX_PLACE_LOCALE = COMMISSION_RATES.local; // 17 % (place en TZS)
export const TAUX_PLACE_USD = COMMISSION_RATES.shared; // 22 % (touriste, résident, hôtel)

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
// POURQUOI UN FORFAIT ET PAS UN POURCENTAGE. Sur les grandes traversées, 12 %
// obligeaient à afficher 63 USD pour laisser 55 au chauffeur — hors marché sur
// une île où la concurrence est en liquide. Le forfait colle le prix client au
// plus près du net : 59 USD pour les mêmes 55. Là où le volume est fort, en
// revanche, le forfait double (voir CORRIDOR_EMPRUNTE) : c'est le couloir des
// plages du sud-est qui paie l'infrastructure, pas les traversées rares.

/** Ce que zanziGo garde sur une course privée, selon la taille du trajet. */
function forfaitZanzigoUsd(netUsd) {
  if (netUsd < 25) return 2;
  if (netUsd < 45) return 3;
  return 4;
}

// TRAJETS TRÈS EMPRUNTÉS : le forfait double. Stone Town et l'aéroport vers
// Paje, Bwejuu et Jambiani, c'est la liaison la plus demandée de l'île. Le
// chauffeur y touche exactement la même chose qu'ailleurs (45 USD) ; ce sont
// les 4 USD supplémentaires du client qui financent le reste.
const FORFAIT_EMPRUNTE_USD = 8;
const CORRIDOR_EMPRUNTE = new Set(['paje', 'bwejuu', 'jambiani']);

// Transfert depuis/vers un hub (Stone Town, terminal ferry, aéroport) : prix
// unique vers toute l'île, quelle que soit la plage.
const NET_TRANSFERT_USD = 45;
// L'aéroport et la ville sont à sept kilomètres : ce n'est pas un transfert de
// plage, et son prix n'a rien à voir.
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
// standard, la place locale y vaut 21 000 TZS au lieu de 16 000. Elle suit la
// place ordinaire (20 000 → 21 000) pour la même raison : à prix figé, le
// chauffeur aurait perdu 400 TZS sur la plus longue traversée de l'île.
const SPECIAL_LOCAL_ROUTES_TZS = [{ a: 'Nungwi', b: 'Paje', tzs: 21000 }];

// Colis : forfait par taille (Stone Town → n'importe quelle plage),
// payé en ligne à 100 % par l'expéditeur.
const PACKAGE_FARES = {
  small: { USD: 5, TZS: 13000 }, // enveloppe, clés, passeport, documents
  medium: { USD: 10, TZS: 26000 }, // sac à dos, petit carton, épices
  large: { USD: 18, TZS: 47000 }, // grosse valise, caisse de ravitaillement
};

const round2 = (n) => Math.round(n * 100) / 100;

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
 * déduit, jamais l'inverse. Une remise commerciale ne l'entame donc jamais.
 */
export function netChauffeurPriveUsd(pickup, dropoff) {
  const p = normCity(pickup);
  const d = normCity(dropoff);
  // Aéroport ↔ ville : sept kilomètres, ce n'est pas un transfert de plage.
  if ((HUBS.has(p) && HUBS_VILLE.has(d)) || (HUBS_VILLE.has(p) && HUBS.has(d))) {
    return NET_AEROPORT_VILLE_USD;
  }
  if (HUBS.has(p) || HUBS.has(d)) return NET_TRANSFERT_USD;
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

/** Ce que zanziGo garde sur ce trajet précis, en dollars. */
export function forfaitZanzigoTrajetUsd(pickup, dropoff) {
  const p = normCity(pickup);
  const d = normCity(dropoff);
  const versCorridor =
    (HUBS.has(p) && CORRIDOR_EMPRUNTE.has(d)) || (HUBS.has(d) && CORRIDOR_EMPRUNTE.has(p));
  return versCorridor
    ? FORFAIT_EMPRUNTE_USD
    : forfaitZanzigoUsd(netChauffeurPriveUsd(pickup, dropoff));
}

function specialLocalRouteTzs(pickup, dropoff) {
  const p = normCity(pickup);
  const d = normCity(dropoff);
  const route = SPECIAL_LOCAL_ROUTES_TZS.find((r) => {
    const a = r.a.toLowerCase();
    const b = r.b.toLowerCase();
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
export function privateUsdForRoute(pickup, dropoff) {
  return netChauffeurPriveUsd(pickup, dropoff) + forfaitZanzigoTrajetUsd(pickup, dropoff);
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
      const price = Math.round(privateUsdForRoute(route.pickup, route.dropoff) * config.usdToTzsRate);
      const net = Math.round(netChauffeurPriveUsd(route.pickup, route.dropoff) * config.usdToTzsRate);
      return { price, commission: round2(price - net), currency: 'TZS' };
    }
    // Taxi partagé local : tarif unifié (trajets spéciaux inclus) SUR LES
    // GRANDS AXES uniquement ; ailleurs, prix touriste converti en TZS —
    // commission 17 % dans les deux cas (taxi partagé local en TZS).
    const price = localSeatTzsForRoute(route.pickup, route.dropoff);
    return { price, commission: round2(price * COMMISSION_RATES.local), currency: 'TZS' };
  }

  let usd;
  let taux;
  if (tripType === 'private') {
    usd = privateUsdForRoute(route.pickup, route.dropoff);
  } else if (tripType === 'shared_tourist' || tripType === 'posted_return') {
    usd = sharedSeatUsdForRoute(route.pickup, route.dropoff);
    taux = COMMISSION_RATES.shared; // 22 % — le chauffeur reçoit 78 %
  } else {
    return null; // shared_local n'existe pas en USD
  }
  // Grille touriste remisée : résident vérifié −10 %, hôtel partenaire −5 %.
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

  if (tripType === 'private') {
    // LA REMISE SORT DE LA POCHE DE ZANZIGO, JAMAIS DE CELLE DU CHAUFFEUR.
    // Sa part est un montant promis, pas un pourcentage : un arrangement
    // commercial passé avec un hôtel ou un résident ne le regarde pas. Le prix
    // ne descend donc jamais sous ce net — au pire zanziGo ne gagne rien sur
    // cette course-là (voir le test « la remise ne mord pas sur le chauffeur »).
    const net = netChauffeurPriveUsd(route.pickup, route.dropoff);
    const price = Math.max(net, remise);
    return { price, commission: round2(price - net), currency: 'USD' };
  }
  return { price: remise, commission: round2(remise * taux), currency: 'USD' };
}

// size : 'small' | 'medium' | 'large' ; remise : ex. 0.05 pour un hôtel
// partenaire (même grille que les touristes avec −5 %).
export function pricePackage(currency, size = 'medium', remise = 0) {
  const fare = PACKAGE_FARES[size]?.[currency];
  if (fare === undefined) return null;
  const price = remise ? round2(fare * (1 - remise)) : fare;
  return {
    price,
    commission: round2(price * COMMISSION_RATES.package), // 20 % — chauffeur 80 %
    currency,
  };
}
