// Points de départ et villes d'arrivée des trajets partagés.
// Les départs sont volontairement limités aux deux hubs où les chauffeurs
// attendent leurs passagers ; les arrivées couvrent les destinations de
// l'île. Ces listes alimentent les menus déroulants de l'app et la
// validation serveur — une valeur hors liste est refusée.

// Le nom officiel complet de l'aéroport de Zanzibar.
export const AEROPORT = 'Aéroport international Abeid Amani Karume';
// Anciens libellés encore envoyés par les versions précédentes de l'app —
// acceptés à la validation, plus proposés dans les menus.
export const ANCIENS_LIBELLES_AEROPORT = ['Aéroport Abeid Amani Karume', 'Aéroport (AAKIA)'];

// Les 16 villes de l'île (hors hubs) — communes au départ et à l'arrivée.
const VILLES_RIDES = [
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

// Arrivées AFFICHÉES : l'aéroport EN PLUS des villes. Un touriste du sud
// (Makunduchi, Jambiani…) rentre prendre son vol — l'aéroport est une arrivée
// à part entière, pas seulement un départ. Le ferry, lui, ne se propose qu'au
// départ (personne ne réserve un partagé POUR aller au ferry).
export const RIDE_DESTINATIONS = [AEROPORT, ...VILLES_RIDES];

// Départs AFFICHÉS : les deux hubs (aéroport, ferry) + toutes les villes de
// l'île — permet aussi les liaisons inter-villes comme Nungwi → Paje.
export const RIDE_ORIGINS = [AEROPORT, 'Stone Town Ferry', ...VILLES_RIDES];

// Départs ACCEPTÉS à la validation : les affichés + les anciens libellés.
export const RIDE_ORIGINS_ACCEPTES = [...RIDE_ORIGINS, ...ANCIENS_LIBELLES_AEROPORT];
