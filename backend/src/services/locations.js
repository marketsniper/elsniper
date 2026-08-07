// Points de départ et villes d'arrivée des trajets partagés.
// Les départs sont volontairement limités aux deux hubs où les chauffeurs
// attendent leurs passagers ; les arrivées couvrent les destinations de
// l'île. Ces listes alimentent les menus déroulants de l'app et la
// validation serveur — une valeur hors liste est refusée.

export const RIDE_DESTINATIONS = [
  'Stone Town',
  'Nungwi',
  'Kendwa',
  'Matemwe',
  'Kiwengwa',
  'Pwani Mchangani',
  'Uroa',
  'Pongwe',
  'Chwaka',
  'Michamvi',
  'Bwejuu',
  'Paje',
  'Jambiani',
  'Makunduchi',
  'Kizimkazi',
  'Fumba',
];

// Départs : les deux hubs (aéroport, ferry) + toutes les villes de l'île —
// permet aussi les liaisons inter-villes comme Nungwi → Paje.
export const RIDE_ORIGINS = ['Aéroport (AAKIA)', 'Stone Town Ferry', ...RIDE_DESTINATIONS];
