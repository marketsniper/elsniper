import { config } from '../config.js';

// Grille tarifaire MVP — prix figés sur chaque trip/package à la création :
// modifier cette grille ne réécrit jamais l'historique.
//
// Segmentation (cloison stricte, appliquée aussi à l'affichage côté app) :
//  - tourist  : USD plein tarif ;
//  - resident : USD avec remise (config.residentDiscountRate, 10 % par défaut) ;
//  - local    : TZS — TOUS les trajets au tarif unique config.localTripPriceTzs ;
//  - hotel    : TZS, grille commerciale (réserve pour ses clients).
const TOURIST_FARES_USD = {
  private: 50,
  shared_tourist: 17,
  posted_return: 17,
};

const HOTEL_FARES_TZS = {
  private: 90000,
  shared_tourist: 40000,
  posted_return: 65000,
};

const PACKAGE_FARES = { USD: 10, TZS: 25000 };

const round2 = (n) => Math.round(n * 100) / 100;

// audience : 'tourist' | 'resident' | 'local' | 'hotel'
export function priceTrip(tripType, audience) {
  if (audience === 'local') {
    // Tarif local unique, quel que soit le type de trajet (shared_local inclus).
    const price = config.localTripPriceTzs;
    return { price, commission: round2(price * config.commissionRate), currency: 'TZS' };
  }

  if (audience === 'hotel') {
    const fare = HOTEL_FARES_TZS[tripType];
    if (fare === undefined) return null;
    return { price: fare, commission: round2(fare * config.commissionRate), currency: 'TZS' };
  }

  const usd = TOURIST_FARES_USD[tripType];
  if (usd === undefined) return null;
  const price = audience === 'resident' ? round2(usd * (1 - config.residentDiscountRate)) : usd;
  return { price, commission: round2(price * config.commissionRate), currency: 'USD' };
}

export function pricePackage(currency) {
  const fare = PACKAGE_FARES[currency];
  return {
    price: fare,
    commission: round2(fare * config.commissionRate),
    currency,
  };
}
