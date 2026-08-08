import { config } from '../config.js';

// Grille tarifaire PAR ZONE — prix figés sur chaque trip/package à la
// création : modifier cette grille ne réécrit jamais l'historique.
//
// Segmentation (cloison stricte, appliquée aussi à l'affichage côté app) :
//  - tourist  : USD plein tarif (AC incluse sur les options touristes) ;
//  - resident : USD avec remise (config.residentDiscountRate, 10 %) ;
//  - local    : TZS — tarif de la zone (carte tanzanienne vérifiée) ;
//  - hotel    : TZS, grille commerciale (réserve pour ses clients).
//
// Zones (depuis/vers la ville ou l'aéroport) :
const ZONE_TIERS = {
  nord: { privateUsd: 50, sharedUsd: 18, localTzs: 15000 }, // Nungwi / Kendwa
  nordEst: { privateUsd: 45, sharedUsd: 16, localTzs: 12000 }, // Matemwe / Kiwengwa
  est: { privateUsd: 45, sharedUsd: 15, localTzs: 12000 }, // Paje / Jambiani
  estPointe: { privateUsd: 50, sharedUsd: 18, localTzs: 15000 }, // Michamvi (route directe)
  sud: { privateUsd: 35, sharedUsd: 12, localTzs: 10000 }, // Kizimkazi / Makunduchi
};

// Commissions zanziGo par service (grille « Chauffeur reçoit ») :
//  - privé 10 % (50 → 45,00 chez le chauffeur) ;
//  - partagé touriste 20 % (18 → 14,40) ;
//  - local 10 % (15 000 → 13 500) ;
//  - colis 20 % (5 → 4,00).
// Les réservations d'hôtel restent sur le taux général config.commissionRate.
const COMMISSION_RATES = {
  private: 0.1,
  shared: 0.2,
  local: 0.1,
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

// Trajets spéciaux à prix fixe (USD, courses privées), deux sens.
const SPECIAL_PRIVATE_ROUTES_USD = [{ a: 'Nungwi', b: 'Paje', usd: 65 }];

// Colis : forfait par taille (Stone Town → n'importe quelle plage),
// payé en ligne à 100 % par l'expéditeur.
const PACKAGE_FARES = {
  small: { USD: 5, TZS: 11000 }, // enveloppe, clés, passeport, documents
  medium: { USD: 10, TZS: 22000 }, // sac à dos, petit carton, épices
  large: { USD: 18, TZS: 40000 }, // grosse valise, caisse de ravitaillement
};

const HOTEL_FARES_TZS = {
  private: 90000,
  shared_tourist: 40000,
  posted_return: 65000,
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

function specialPrivateRouteUsd(pickup, dropoff) {
  const p = normCity(pickup);
  const d = normCity(dropoff);
  const route = SPECIAL_PRIVATE_ROUTES_USD.find((r) => {
    const a = r.a.toLowerCase();
    const b = r.b.toLowerCase();
    return (p === a && d === b) || (p === b && d === a);
  });
  return route?.usd;
}

// Prix touriste (USD) d'une place en trajet partagé selon l'itinéraire —
// utilisé aussi pour l'affichage des trajets postés par les chauffeurs.
export function sharedSeatUsdForRoute(pickup, dropoff) {
  return tierForRoute(pickup, dropoff).sharedUsd;
}

// audience : 'tourist' | 'resident' | 'local' | 'hotel'
// route : { pickup, dropoff } — détermine la zone et les trajets spéciaux.
export function priceTrip(tripType, audience, route = {}) {
  const tier = tierForRoute(route.pickup, route.dropoff);

  if (audience === 'local') {
    // Tarif local de la zone, quel que soit le type de trajet — commission 10 %.
    const price = tier.localTzs;
    return { price, commission: round2(price * COMMISSION_RATES.local), currency: 'TZS' };
  }

  if (audience === 'hotel') {
    const fare = HOTEL_FARES_TZS[tripType];
    if (fare === undefined) return null;
    return { price: fare, commission: round2(fare * config.commissionRate), currency: 'TZS' };
  }

  let usd;
  let taux;
  if (tripType === 'private') {
    usd = specialPrivateRouteUsd(route.pickup, route.dropoff) ?? tier.privateUsd;
    taux = COMMISSION_RATES.private; // 10 % — le chauffeur reçoit 90 %
  } else if (tripType === 'shared_tourist' || tripType === 'posted_return') {
    usd = tier.sharedUsd;
    taux = COMMISSION_RATES.shared; // 20 % — le chauffeur reçoit 80 %
  } else {
    return null; // shared_local n'existe pas en USD
  }
  const price = audience === 'resident' ? round2(usd * (1 - config.residentDiscountRate)) : usd;
  return { price, commission: round2(price * taux), currency: 'USD' };
}

// size : 'small' | 'medium' | 'large'
export function pricePackage(currency, size = 'medium') {
  const fare = PACKAGE_FARES[size]?.[currency];
  if (fare === undefined) return null;
  return {
    price: fare,
    commission: round2(fare * COMMISSION_RATES.package), // 20 % — chauffeur 80 %
    currency,
  };
}
