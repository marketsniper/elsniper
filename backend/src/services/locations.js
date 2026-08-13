// Points de départ et villes d'arrivée des trajets partagés.
// Les départs sont volontairement limités aux deux hubs où les chauffeurs
// attendent leurs passagers ; les arrivées couvrent les destinations de
// l'île. Ces listes alimentent les menus déroulants de l'app et la
// validation serveur — une valeur hors liste est refusée.

// Le vrai nom de l'aéroport de Zanzibar : Abeid Amani Karume (AAKIA/ZNZ).
export const AEROPORT = 'Aéroport Abeid Amani Karume';
// Ancien libellé encore envoyé par les versions précédentes de l'app —
// accepté à la validation, plus proposé dans les menus.
export const AEROPORT_ANCIEN = 'Aéroport (AAKIA)';

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

// Départs AFFICHÉS : les deux hubs (aéroport, ferry) + toutes les villes de
// l'île — permet aussi les liaisons inter-villes comme Nungwi → Paje.
export const RIDE_ORIGINS = [AEROPORT, 'Stone Town Ferry', ...RIDE_DESTINATIONS];

// Départs ACCEPTÉS à la validation : les affichés + l'ancien libellé.
export const RIDE_ORIGINS_ACCEPTES = [...RIDE_ORIGINS, AEROPORT_ANCIEN];
