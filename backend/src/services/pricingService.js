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
  nord: { privateUsd: 50, sharedUsd: 18, localTzs: 15000 }, // Nungwi / Kendwa
  nordEst: { privateUsd: 45, sharedUsd: 16, localTzs: 15000 }, // Matemwe / Kiwengwa
  est: { privateUsd: 50, sharedUsd: 15, localTzs: 15000 }, // Paje / Jambiani
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
  jambiani: 'est',
  bwejuu: 'est',
  michamvi: 'estPointe',
  kizimkazi: 'sud',
  makunduchi: 'sud',
  fumba: 'sud',
};

// Trajets spéciaux à prix fixe (USD, courses privées), deux sens — le prix
// spécial est prioritaire sur la formule au kilomètre ET sur le minimum.
// Les petits trajets de la côte est portent une commission dédiée : 15 %
// sur les 20 USD, 20 % sur les 15 USD — dans les deux cas la plateforme
// garde 3 USD par course (les autres privés restent à 10 %).
const SPECIAL_PRIVATE_ROUTES_USD = [
  { a: 'Nungwi', b: 'Paje', usd: 65 },
  { a: 'Nungwi', b: 'Kizimkazi', usd: 70 },
  { a: 'Michamvi', b: 'Paje', usd: 20, commission: 0.15 },
  { a: 'Makunduchi', b: 'Jambiani', usd: 20, commission: 0.15 },
  { a: 'Paje', b: 'Bwejuu', usd: 15, commission: 0.2 },
  { a: 'Paje', b: 'Jambiani', usd: 15, commission: 0.2 },
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
// gardent la grille par zone historique) est SIMPLEMENT au kilomètre :
// 0,85 USD par km de route (vol d'oiseau × détour routier moyen), arrondi
// aux 5 USD, minimum 20 USD. Exemples : Kiwengwa → Paje (≈ 48 km) → 40 USD ;
// Matemwe → Jambiani (≈ 73 km) → 60 USD ; villages voisins → 20 USD.
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
const PRIX_PAR_KM_USD = 0.85;
const PRIVE_MINIMUM_USD = 20;
const HUBS = new Set([
  'stone town',
  'stone town ferry',
  'aéroport (aakia)',
  'aéroport abeid amani karume',
  'aéroport international abeid amani karume',
  'aéroport',
  'airport',
]);

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
    if (km !== null) {
      const brut = PRIX_PAR_KM_USD * km;
      return Math.max(PRIVE_MINIMUM_USD, Math.round(brut / 5) * 5);
    }
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
// privé du même trajet coûte au moins 45 USD. Sur les petits trajets
// (privé sous les 45 USD), pas de tarif local : la place se paie au prix
// touriste de la zone, converti en shillings.
const GRAND_AXE_PRIVE_MIN_USD = 45;

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

// Stone Town, le ferry et l'aéroport sont à quelques minutes les uns des
// autres : AUCUNE course n'est proposée entre ces trois points.
export function hubToHubRoute(pickup, dropoff) {
  return HUBS.has(normCity(pickup)) && HUBS.has(normCity(dropoff));
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
  const tauxRemise =
    audience === 'resident'
      ? config.residentDiscountRate
      : audience === 'hotel'
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
