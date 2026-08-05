import { config } from '../config.js';

// Grille tarifaire MVP — volontairement simple (tarifs plats par type).
// Le prix et la commission sont figés sur chaque trip/package au moment de la
// création : modifier cette grille ne réécrit jamais l'historique.
const TRIP_FARES = {
  private: { USD: 35, TZS: 90000 },
  shared_tourist: { USD: 15, TZS: 40000 },
  // Tarif local : réservé aux résidents vérifiés, toujours en TZS.
  shared_local: { TZS: 8000 },
  posted_return: { USD: 25, TZS: 65000 },
};

const PACKAGE_FARES = { USD: 10, TZS: 25000 };

const round2 = (n) => Math.round(n * 100) / 100;

export function priceTrip(tripType, currency) {
  const fare = TRIP_FARES[tripType]?.[currency];
  if (fare === undefined) return null;
  return {
    price: fare,
    commission: round2(fare * config.commissionRate),
    currency,
  };
}

export function pricePackage(currency) {
  const fare = PACKAGE_FARES[currency];
  return {
    price: fare,
    commission: round2(fare * config.commissionRate),
    currency,
  };
}
