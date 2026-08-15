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
// Tarif local UNIFIÉ : 15 000 TZS la place partout (sauf trajets spéciaux
// ci-dessous) — plus simple à retenir pour les clients et les chauffeurs.
const ZONE_TIERS = {
  nord: { privateUsd: 45, sharedUsd: 18, localTzs: 15000 }, // Nungwi / Kendwa
  nordEst: { privateUsd: 40, sharedUsd: 16, localTzs: 15000 }, // Matemwe / Kiwengwa
  est: { privateUsd: 45, sharedUsd: 15, localTzs: 15000 }, // Paje / Bwejuu
  estSud: { privateUsd: 50, sharedUsd: 15, localTzs: 15000 }, // Jambiani
  estPointe: { privateUsd: 50, sharedUsd: 18, localTzs: 15000 }, // Michamvi (route directe)
  sud: { privateUsd: 45, sharedUsd: 14, localTzs: 15000 }, // Kizimkazi / Makunduchi
};

// Commissions zanziGo par service (grille « Chauffeur reçoit ») :
//  - privé 10 % (50 → 45,00 chez le chauffeur) ;
//  - partagé touriste 20 % (18 → 14,40) ;
//  - partagé local 15 % (15 000 → 12 750) ;
//  - colis 20 % (5 → 4,00).
// Les réservations d'hôtel restent sur le taux général config.commissionRate.
const COMMISSION_RATES = {
  private: 0.1,
  shared: 0.2,
  local: 0.15,
  package: 0.2,
};

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
//   village voisin        → 12 USD (chauffeur 9,60)
//   un village d'écart    → 16 USD (chauffeur 12,80)
// Commission 20 % dans les deux cas : ces courses tournent vite et se
// répètent dans la journée, la plateforme s'y rattrape au volume plutôt
// qu'au montant. Au-delà de deux villages, la grille au kilomètre reprend.
const SPECIAL_PRIVATE_ROUTES_USD = [
  // Transfert aéroport : sept kilomètres, très demandé, commission 20 %
  // comme les autres courses courtes (le chauffeur garde 13,60 USD).
  { a: 'Aéroport international Abeid Amani Karume', b: 'Stone Town', usd: 17, commission: 0.2 },
  { a: 'Aéroport international Abeid Amani Karume', b: 'Stone Town Ferry', usd: 17, commission: 0.2 },
  { a: 'Aéroport (AAKIA)', b: 'Stone Town', usd: 17, commission: 0.2 },
  { a: 'Aéroport (AAKIA)', b: 'Stone Town Ferry', usd: 17, commission: 0.2 },
  { a: 'Aéroport', b: 'Stone Town', usd: 17, commission: 0.2 },
  { a: 'Aéroport', b: 'Stone Town Ferry', usd: 17, commission: 0.2 },
  // Voisins immédiats.
  { a: 'Michamvi', b: 'Bwejuu', usd: 12, commission: 0.2 },
  { a: 'Bwejuu', b: 'Paje', usd: 12, commission: 0.2 },
  { a: 'Paje', b: 'Jambiani', usd: 12, commission: 0.2 },
  { a: 'Jambiani', b: 'Makunduchi', usd: 12, commission: 0.2 },
  // Un village sauté.
  { a: 'Michamvi', b: 'Paje', usd: 16, commission: 0.2 },
  { a: 'Bwejuu', b: 'Jambiani', usd: 16, commission: 0.2 },
  { a: 'Paje', b: 'Makunduchi', usd: 16, commission: 0.2 },
];

// Trajets spéciaux à prix fixe (TZS, place locale en taxi partagé), deux
// sens : la traversée Nungwi ↔ Paje est plus longue que les liaisons
// standard, la place locale y vaut 20 000 TZS au lieu de 15 000.
const SPECIAL_LOCAL_ROUTES_TZS = [{ a: 'Nungwi', b: 'Paje', tzs: 20000 }];

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

// Zone tarifaire d'un itinéraire : la ville zonée du trajet (l'autre bout
// étant en général la ville/l'aéroport). Si les deux bouts sont zonés,
// on retient la zone au tarif privé le plus élevé.
function tierForRoute(pickup, dropoff) {
  const z1 = ZONE_TIERS[CITY_ZONES[normCity(pickup)]];
  const z2 = ZONE_TIERS[CITY_ZONES[normCity(dropoff)]];
  const fallback = {
    privateUsd: 50,
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

// Taux de commission d'une course privée sur cet itinéraire : celui du
// trajet spécial s'il en définit un, sinon le taux privé général (10 %).
function privateCommissionRate(pickup, dropoff) {
  return specialPrivateRoute(pickup, dropoff)?.commission ?? COMMISSION_RATES.private;
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
// Le prix au kilomètre baisse à mesure que le trajet s'allonge (0,90 USD/km
// sur un saut de village, 0,61 sur la traversée) : c'est le carburant qui
// domine sur les longues distances, pas le temps du chauffeur.
const PALIERS_KM_USD = [
  { maxKm: 12, usd: 12 }, // village voisin — Nungwi ↔ Kendwa, Paje ↔ Jambiani
  { maxKm: 30, usd: 16 }, // un village d'écart — Nungwi ↔ Matemwe
  { maxKm: 50, usd: 25 }, // Nungwi ↔ Kiwengwa
  { maxKm: 75, usd: 40 }, // Nungwi ↔ Michamvi, ↔ Chwaka
  { maxKm: 100, usd: 60 }, // Nungwi ↔ Paje, ↔ Jambiani — d'une côte à l'autre
  { maxKm: Infinity, usd: 65 }, // du nord au sud — Nungwi ↔ Makunduchi
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
  return tierForRoute(pickup, dropoff).sharedUsd;
}

// Le TARIF LOCAL (place à 15 000 TZS, spéciaux inclus, ex. Nungwi ↔ Paje
// 20 000) ne s'applique que sur les GRANDS AXES — définis par : le taxi
// privé du même trajet coûte au moins 40 USD. Sur les petits trajets
// (privé sous les 40 USD), pas de tarif local : la place se paie au prix
// touriste de la zone, converti en shillings.
//
// Ce seuil suit la grille : quand les transferts vers Nungwi sont passés de
// 50 à 40 USD, le laisser à 45 aurait sorti les grands axes du nord du tarif
// local — un Zanzibarite aurait payé 46 800 TZS sa place au lieu de 15 000.
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
    return Math.round(tier.sharedUsd * config.usdToTzsRate);
  }
  return specialLocalRouteTzs(pickup, dropoff) ?? tier.localTzs;
}

// audience : 'tourist' | 'resident' | 'local' | 'hotel'
// route : { pickup, dropoff } — détermine la zone et les trajets spéciaux.
export function priceTrip(tripType, audience, route = {}) {
  const tier = tierForRoute(route.pickup, route.dropoff);

  if (audience === 'local') {
    // Course PRIVÉE : même prix que la grille touriste (grille au kilomètre
    // ville ↔ ville incluse), converti en shillings — commission privé 10 %
    // (ou le taux dédié du trajet spécial).
    if (tripType === 'private') {
      const usd = privateUsdForRoute(route.pickup, route.dropoff);
      const price = Math.round(usd * config.usdToTzsRate);
      const taux = privateCommissionRate(route.pickup, route.dropoff);
      return { price, commission: round2(price * taux), currency: 'TZS' };
    }
    // Taxi partagé local : tarif unifié (trajets spéciaux inclus) SUR LES
    // GRANDS AXES uniquement ; ailleurs, prix touriste converti en TZS —
    // commission 15 % dans les deux cas.
    const price = localSeatTzsForRoute(route.pickup, route.dropoff);
    return { price, commission: round2(price * COMMISSION_RATES.local), currency: 'TZS' };
  }

  let usd;
  let taux;
  if (tripType === 'private') {
    usd = privateUsdForRoute(route.pickup, route.dropoff);
    // 10 % (le chauffeur reçoit 90 %), sauf taux dédié du trajet spécial.
    taux = privateCommissionRate(route.pickup, route.dropoff);
  } else if (tripType === 'shared_tourist' || tripType === 'posted_return') {
    usd = tier.sharedUsd;
    taux = COMMISSION_RATES.shared; // 20 % — le chauffeur reçoit 80 %
  } else {
    return null; // shared_local n'existe pas en USD
  }
  // Grille touriste remisée : résident vérifié −10 %, hôtel partenaire −5 %.
  //
  // La remise partenaire ne vaut QUE sur les courses privées. Une place de
  // taxi partagé se vend déjà au prix le plus bas de la grille (14 à 18 USD) :
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
