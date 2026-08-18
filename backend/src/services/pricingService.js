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

// PRIX D'UNE PLACE EN TAXI PARTAGÉ — déduit du prix de la course PRIVÉE du
// même trajet, jamais fixé à part. Une seule grille à tenir : quand un
// transfert bouge, sa place suit toute seule.
//
//   privé 42 USD        → place 13
//   privé 47 USD        → place 16
//   privé 53 USD        → place 17
//   privé 63 USD et +   → place 19
//
// Les SEUILS montent avec les prix (hausse de 5 %) : sans ça, un transfert
// passé de 45 à 47 USD aurait sauté une tranche et sa place aurait bondi.
//
// En dessous de 40 USD la question ne se pose pas : le taxi partagé n'existe
// pas sur les trajets courts (voir PARTAGE_PRIVE_MIN_USD).
function sharedSeatUsd(priveUsd) {
  if (priveUsd >= 63) return 19;
  if (priveUsd >= 53) return 17;
  if (priveUsd >= 47) return 16;
  return 13;
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
const COMMISSION_RATES = {
  private: 0.12, // grands trajets privés, 40 USD et plus
  privateCourt: 0.17, // petits trajets privés, moins de 40 USD
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

// Seuil de bascule de la commission privée : à 40 USD pile, on est déjà sur
// le grand tarif (10 %). En dessous, 15 %. Ce seuil coïncide avec celui du
// tarif local (GRAND_AXE_PRIVE_MIN_USD) : un « grand axe » et un « grand
// trajet » sont la même chose, ce qui garde la grille cohérente.
const COMMISSION_PRIVE_SEUIL_USD = 40;

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
  kizimkazi: 'sud',
  makunduchi: 'sud',
  fumba: 'sud',
};

// Trajets spéciaux à prix fixe (USD, courses privées), deux sens — le prix
// spécial est prioritaire sur la formule au kilomètre ET sur le minimum.
//
// LA CHAÎNE DE LA CÔTE EST — Michamvi, Bwejuu, Paje, Jambiani, Makunduchi
// se suivent le long de la même route. Une règle, deux prix :
//   village voisin        → 13 USD
//   un village d'écart    → 17 USD
// Ces prix sont sous les 40 USD : la commission privée y est de 15 % (comme
// tout petit trajet). Au-delà de deux villages, la grille au kilomètre reprend.
const SPECIAL_PRIVATE_ROUTES_USD = [
  // Transfert aéroport : sept kilomètres, très demandé (18 USD, sous les
  // 40 USD → commission 15 %, le chauffeur garde 15,30).
  { a: 'Aéroport international Abeid Amani Karume', b: 'Stone Town', usd: 18 },
  { a: 'Aéroport international Abeid Amani Karume', b: 'Stone Town Ferry', usd: 18 },
  { a: 'Aéroport (AAKIA)', b: 'Stone Town', usd: 18 },
  { a: 'Aéroport (AAKIA)', b: 'Stone Town Ferry', usd: 18 },
  { a: 'Aéroport', b: 'Stone Town', usd: 18 },
  { a: 'Aéroport', b: 'Stone Town Ferry', usd: 18 },
  // Voisins immédiats.
  { a: 'Michamvi', b: 'Bwejuu', usd: 13 },
  { a: 'Bwejuu', b: 'Paje', usd: 13 },
  { a: 'Paje', b: 'Jambiani', usd: 13 },
  { a: 'Jambiani', b: 'Makunduchi', usd: 13 },
  // MICHAMVI DEPUIS LE NORD — la pointe se gagne en contournant toute la
  // baie de Chwaka : la route est bien plus longue que la distance à vol
  // d'oiseau, sur laquelle les paliers se calculent. Prix de terrain.
  { a: 'Nungwi', b: 'Michamvi', usd: 68 },
  { a: 'Kendwa', b: 'Michamvi', usd: 68 },
  // La pointe sud : Kizimkazi est sur l'autre versant, la route y descend
  // par l'intérieur au lieu de longer la côte. Prix de terrain.
  { a: 'Kizimkazi', b: 'Jambiani', usd: 18 },
  // Un village sauté.
  { a: 'Michamvi', b: 'Paje', usd: 17 },
  { a: 'Bwejuu', b: 'Jambiani', usd: 17 },
  { a: 'Paje', b: 'Makunduchi', usd: 17 },
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

function specialPrivateRoute(pickup, dropoff) {
  const p = normCity(pickup);
  const d = normCity(dropoff);
  return SPECIAL_PRIVATE_ROUTES_USD.find((r) => {
    const a = r.a.toLowerCase();
    const b = r.b.toLowerCase();
    return (p === a && d === b) || (p === b && d === a);
  });
}

function specialPrivateRouteUsd(pickup, dropoff) {
  return specialPrivateRoute(pickup, dropoff)?.usd;
}

// Taux de commission d'une course privée, décidé par le PRIX du trajet :
// 10 % à partir de 40 USD, 15 % en dessous. Le prix privé de référence est
// toujours le tarif USD de la grille (avant remise résident/hôtel et avant
// conversion en TZS) : c'est la « taille » du trajet qui compte, pas
// l'arrangement du client.
function privateCommissionRate(pickup, dropoff) {
  const usd = privateUsdForRoute(pickup, dropoff);
  return usd >= COMMISSION_PRIVE_SEUIL_USD
    ? COMMISSION_RATES.private
    : COMMISSION_RATES.privateCourt;
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
const PALIERS_KM_USD = [
  { maxKm: 12, usd: 13 }, // village voisin — Nungwi ↔ Kendwa, Paje ↔ Jambiani
  { maxKm: 24, usd: 17 }, // un village d'écart — Nungwi ↔ Matemwe
  { maxKm: 30, usd: 22 }, // deux villages — Kiwengwa ↔ Chwaka, Paje ↔ Michamvi
  { maxKm: 40, usd: 26 }, // Paje ↔ Uroa
  { maxKm: 50, usd: 34 }, // Paje ↔ Kiwengwa, Nungwi ↔ Kiwengwa
  { maxKm: 65, usd: 42 }, // Kiwengwa ↔ Jambiani
  { maxKm: 75, usd: 50 }, // Paje ↔ Matemwe, Nungwi ↔ Chwaka
  { maxKm: 100, usd: 63 }, // Nungwi ↔ Paje, ↔ Jambiani — d'une côte à l'autre
  { maxKm: Infinity, usd: 68 }, // du nord au sud — Nungwi ↔ Makunduchi
];

function palierUsd(km) {
  return PALIERS_KM_USD.find((p) => km <= p.maxKm).usd;
}
const CITY_COORDS = {
  'aéroport (aakia)': [-6.221, 39.223],
  'aéroport abeid amani karume': [-6.221, 39.223],
  'aéroport international abeid amani karume': [-6.221, 39.223],
  aéroport: [-6.221, 39.223],
  airport: [-6.221, 39.223],
  'stone town': [-6.162, 39.191],
  'stone town ferry': [-6.163, 39.19],
  nungwi: [-5.727, 39.297],
  kendwa: [-5.758, 39.29],
  matemwe: [-5.869, 39.351],
  'pwani mchangani': [-5.925, 39.37],
  kiwengwa: [-5.986, 39.38],
  pongwe: [-6.03, 39.395],
  uroa: [-6.098, 39.418],
  chwaka: [-6.16, 39.433],
  michamvi: [-6.106, 39.496],
  bwejuu: [-6.226, 39.538],
  paje: [-6.266, 39.531],
  jambiani: [-6.317, 39.541],
  makunduchi: [-6.421, 39.457],
  kizimkazi: [-6.437, 39.336],
  fumba: [-6.322, 39.183],
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

// Prix privé USD d'un itinéraire : trajet spécial d'abord (Nungwi ↔ Paje 65),
// grille par zone pour les liaisons depuis/vers les hubs (tarifs
// historiques inchangés), formule au kilomètre pour toute autre paire de
// villes connues, zone en dernier recours.
export function privateUsdForRoute(pickup, dropoff) {
  const special = specialPrivateRouteUsd(pickup, dropoff);
  if (special !== undefined) return special;
  const p = normCity(pickup);
  const d = normCity(dropoff);
  if (!HUBS.has(p) && !HUBS.has(d)) {
    const km = kmEntreVilles(pickup, dropoff);
    if (km !== null) return palierUsd(km);
  }
  return tierForRoute(pickup, dropoff).privateUsd;
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
// facturés 17 USD (voir SPECIAL_PRIVATE_ROUTES_USD).
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
    // selon le prix (10 % dès 40 USD, 15 % en dessous).
    if (tripType === 'private') {
      const usd = privateUsdForRoute(route.pickup, route.dropoff);
      const price = Math.round(usd * config.usdToTzsRate);
      const taux = privateCommissionRate(route.pickup, route.dropoff);
      return { price, commission: round2(price * taux), currency: 'TZS' };
    }
    // Taxi partagé local : tarif unifié (trajets spéciaux inclus) SUR LES
    // GRANDS AXES uniquement ; ailleurs, prix touriste converti en TZS —
    // commission 15 % dans les deux cas (taxi partagé local en TZS).
    const price = localSeatTzsForRoute(route.pickup, route.dropoff);
    return { price, commission: round2(price * COMMISSION_RATES.local), currency: 'TZS' };
  }

  let usd;
  let taux;
  if (tripType === 'private') {
    usd = privateUsdForRoute(route.pickup, route.dropoff);
    // 10 % dès 40 USD (chauffeur 90 %), 15 % sous 40 USD (chauffeur 85 %).
    taux = privateCommissionRate(route.pickup, route.dropoff);
  } else if (tripType === 'shared_tourist' || tripType === 'posted_return') {
    usd = sharedSeatUsdForRoute(route.pickup, route.dropoff);
    taux = COMMISSION_RATES.shared; // 20 % — le chauffeur reçoit 80 %
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
  const price = tauxRemise ? round2(usd * (1 - tauxRemise)) : usd;
  return { price, commission: round2(price * taux), currency: 'USD' };
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
