// Types des entités renvoyées par l'API zanziGo (alignés sur
// backend/src/routes/* et backend/src/services/pricingService.js).
// Le backend renvoie les lignes SQL en snake_case ; on reste tolérant grâce
// à une signature d'index + l'accesseur `champ(...)` ci-dessous.

export type StatutTrajet =
  | 'requested'
  | 'driver_confirmed'
  | 'paid'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type TypeTrajet = 'private' | 'shared_tourist' | 'shared_local' | 'posted_return';

export type StatutColis = 'created' | 'paid' | 'picked_up' | 'delivered' | 'cancelled';

/** Statut d'un trajet partagé posté par un chauffeur (table rides). */
export type StatutRide = 'open' | 'closed' | 'cancelled';

export type TypeCompte = 'tourist' | 'resident' | 'local';
export type StatutVerification = 'pending' | 'verified' | 'rejected';
export type Devise = 'USD' | 'TZS';

export interface Utilisateur {
  id: string;
  [cle: string]: unknown;
}

export interface Chauffeur {
  id: string;
  [cle: string]: unknown;
}

/**
 * Nature d'un établissement partenaire. Le compte, le crédit prépayé, la
 * fidélité et la vérification sont identiques — seul le vocabulaire change.
 */
export type TypePartenaire = 'hotel' | 'restaurant';

export interface Hotel {
  id: string;
  partner_type?: TypePartenaire;
  [cle: string]: unknown;
}

export interface Trajet {
  id: string;
  status?: StatutTrajet;
  [cle: string]: unknown;
}

export interface Colis {
  id: string;
  status?: StatutColis;
  [cle: string]: unknown;
}

/** Trajet partagé posté par un chauffeur (GET /rides, /rides/mine). */
export interface Ride {
  id: string;
  status?: StatutRide;
  [cle: string]: unknown;
}

/** Réservation vue par le chauffeur (GET /rides/mine → bookings[]) :
 * prix par place selon le type de client (touriste/résident/hôtel en USD,
 * local en TZS). */
export interface ReservationRide {
  seats: number;
  client_type: 'tourist' | 'resident' | 'local' | 'hotel';
  client_name?: string | null;
  price_per_seat: number;
  currency: string;
  /** Commission zanziGo et gain net du chauffeur, par place. */
  commission_per_seat?: number;
  net_per_seat?: number;
  /** Place soldée (paiement confirmé par l'équipe). */
  paid?: boolean;
}

/** Ligne payments renvoyée par POST /trips/:id/payment et /packages/:id/payment. */
export interface Paiement {
  id: string;
  payment_link?: string;
  [cle: string]: unknown;
}

/** Paiement enrichi du contexte cible (GET /payments, tableau de bord équipe). */
export interface PaiementEquipe extends Paiement {
  trip_id?: string | null;
  package_id?: string | null;
  trip_pickup?: string | null;
  trip_dropoff?: string | null;
  trip_client_name?: string | null;
  package_pickup?: string | null;
  package_dropoff?: string | null;
  package_qr?: string | null;
  /** Place(s) de taxi partagé (ride_bookings). */
  ride_booking_id?: string | null;
  ride_origin?: string | null;
  ride_destination?: string | null;
  ride_seats?: number | null;
  ride_client_name?: string | null;
  /** Remboursement dû après annulation client (barème 24/48 h). */
  refund_amount?: string | number | null;
  refund_due_at?: string | null;
  refunded_at?: string | null;
}

/** Place de taxi partagé réservée par le client (GET /rides/reservations). */
export interface ReservationPlace {
  id: string;
  origin: string;
  destination: string;
  departure_at: string;
  ride_status: string;
  driver_name?: string | null;
  /** Le client sait quel taxi vient : plaque + modèle du véhicule. */
  vehicle_plate?: string | null;
  vehicle_model?: string | null;
  seats: number;
  price_per_seat: number;
  amount: number;
  currency: string;
  paid: boolean;
  cancelled: boolean;
  /** Annulable maintenant (barème 24/48 h respecté). */
  cancellable: boolean;
  /** 1 = remboursement 100 %, 0.5 = 50 %, null = pas de remboursement. */
  refund_rate: number | null;
}

/** Session authentifiée persistée dans SecureStore. */
export interface SessionAuth {
  token: string;
  /** Identité téléphone (locaux, chauffeurs) — '' pour une identité e-mail. */
  phone: string;
  /** Identité e-mail (touristes/visiteurs) — absente pour une identité téléphone. */
  email?: string;
  user: Utilisateur | null;
  driver: Chauffeur | null;
  hotel: Hotel | null;
}

/** Réponse de POST /auth/verify-otp. */
export interface ReponseVerifieOtp {
  token: string;
  user: Utilisateur | null;
  driver: Chauffeur | null;
  hotel: Hotel | null;
  [cle: string]: unknown;
}

/**
 * Lit la première clé définie (non null/undefined) d'un objet.
 * Permet de tolérer snake_case et camelCase : champ(t, 'pickup_location', 'pickupLocation').
 */
export function champ<T = string>(
  objet: Record<string, unknown> | null | undefined,
  ...cles: string[]
): T | undefined {
  if (!objet) return undefined;
  for (const cle of cles) {
    const valeur = objet[cle];
    if (valeur !== undefined && valeur !== null) return valeur as T;
  }
  return undefined;
}

/** Libellés français des statuts de trajet (enum trip_status). */
export const LIBELLES_STATUT_TRAJET: Record<StatutTrajet, string> = {
  requested: 'Demandée',
  driver_confirmed: 'Chauffeur confirmé',
  paid: 'Payée',
  in_progress: 'En cours',
  completed: 'Terminée',
  cancelled: 'Annulée',
};

/** Étapes « nominales » d'un trajet (hors annulation), dans l'ordre. */
export const ETAPES_TRAJET: StatutTrajet[] = [
  'requested',
  'driver_confirmed',
  'paid',
  'in_progress',
  'completed',
];

/** Libellés français des types de course (trip_type). */
export const LIBELLES_TYPE_TRAJET: Record<TypeTrajet, string> = {
  private: 'Course privée',
  shared_tourist: 'Taxi partagé',
  shared_local: 'Taxi partagé local',
  posted_return: 'Retour affiché',
};

/** Libellés français des statuts de colis (enum package_status). */
export const LIBELLES_STATUT_COLIS: Record<StatutColis, string> = {
  created: 'Créé',
  paid: 'Payé',
  picked_up: 'Ramassé',
  delivered: 'Livré',
  cancelled: 'Annulé',
};

/** Étapes d'un colis, dans l'ordre. */
export const ETAPES_COLIS: StatutColis[] = ['created', 'paid', 'picked_up', 'delivered'];

/** Libellés français des statuts de trajet partagé posté (rides). */
export const LIBELLES_STATUT_RIDE: Record<StatutRide, string> = {
  open: 'Ouvert',
  closed: 'Clôturé',
  cancelled: 'Annulé',
};

// Listes fermées des lieux — repli local de GET /rides/locations. Les chaînes
// doivent matcher EXACTEMENT la validation serveur (400 hors liste au
// POST /rides).
// Le nom officiel complet de l'aéroport de Zanzibar.
export const HUBS_RIDES: string[] = [
  'Aéroport international Abeid Amani Karume',
  'Stone Town Ferry',
];

// Stone Town et son terminal ferry sont la MÊME place : aucune course n'est
// proposée entre les deux (même règle côté serveur, code d'erreur
// route_indisponible). L'aéroport, lui, est à sept kilomètres — c'est un
// vrai transfert, facturé 17 USD.
export const POINTS_STONE_TOWN: string[] = ['Stone Town', 'Stone Town Ferry'];
export const DESTINATIONS_RIDES: string[] = [
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
// Départs ouverts à toutes les villes : hubs + 16 villes (miroir de origins).
export const ORIGINES_RIDES: string[] = [...HUBS_RIDES, ...DESTINATIONS_RIDES];

/**
 * Devise du compte utilisateur : TZS pour un compte local (carte tanzanienne),
 * USD pour tous les autres (touristes ET résidents).
 */
export function deviseUtilisateur(utilisateur: Utilisateur | null | undefined): Devise {
  return champ<TypeCompte>(utilisateur, 'account_type', 'accountType') === 'local'
    ? 'TZS'
    : 'USD';
}

/** Vrai si les documents du compte ont été validés par l'équipe. */
export function compteVerifie(utilisateur: Utilisateur | null | undefined): boolean {
  return (
    champ<StatutVerification>(utilisateur, 'verification_status', 'verificationStatus') ===
    'verified'
  );
}

/** Vrai si le compte est résident ET vérifié (remise de 10 % sur les prix USD). */
export function residentVerifie(utilisateur: Utilisateur | null | undefined): boolean {
  return (
    champ<TypeCompte>(utilisateur, 'account_type', 'accountType') === 'resident' &&
    compteVerifie(utilisateur)
  );
}

/** Vrai si le compte est local (carte tanzanienne) ET vérifié (tarif 15 000 TZS). */
export function localVerifie(utilisateur: Utilisateur | null | undefined): boolean {
  return (
    champ<TypeCompte>(utilisateur, 'account_type', 'accountType') === 'local' &&
    compteVerifie(utilisateur)
  );
}

/** Formate un montant dans une devise (15 000 TZS / 50 USD / 15,30 USD). */
export function formaterMontant(montant: number | string, devise: string): string {
  const nombre = typeof montant === 'string' ? Number(montant) : montant;
  if (Number.isFinite(nombre)) {
    const options = Number.isInteger(nombre)
      ? undefined
      : ({ minimumFractionDigits: 2, maximumFractionDigits: 2 } as const);
    return `${nombre.toLocaleString('fr-FR', options)} ${devise}`.trim();
  }
  return `${montant} ${devise}`.trim();
}

/**
 * Total d'un panier de gains {devise: montant} EN SHILLINGS : les montants
 * USD sont convertis au taux zanziGo (TAUX_USD_TZS). Utilisé par les
 * compteurs de gains (équipe et chauffeurs) pour afficher UN chiffre clair.
 */
export function totalEnTzs(gains: Record<string, number>): number {
  let total = 0;
  for (const [devise, montant] of Object.entries(gains)) {
    total += devise === 'USD' ? montant * TAUX_USD_TZS : montant;
  }
  return Math.round(total);
}

/**
 * Barème d'annulation CLIENT d'un voyage payé (même règle que le serveur) :
 * ≥ 48 h avant le départ = remboursement 100 %, entre 24 h et 48 h = 50 %,
 * < 24 h = annulation refusée. Renvoie 1, 0.5 ou null.
 */
export function tauxRemboursement(departISO: string | null | undefined): number | null {
  if (!departISO) return null;
  const heures = (new Date(departISO).getTime() - Date.now()) / 3_600_000;
  if (heures >= 48) return 1;
  if (heures >= 24) return 0.5;
  return null;
}

/**
 * Course « expirée » : jamais payée (demandée ou chauffeur confirmé) et dont
 * l'heure — programmée, sinon la création — est passée depuis plus de 24 h.
 * Elle n'aura plus lieu : le ménage peut la masquer.
 */
export function trajetExpire(trajet: Trajet): boolean {
  const statut = champ<StatutTrajet>(trajet, 'status', 'statut');
  if (statut !== 'requested' && statut !== 'driver_confirmed') return false;
  const quand = new Date(
    String(champ(trajet, 'scheduled_at', 'scheduledAt', 'created_at', 'createdAt') ?? '')
  ).getTime();
  return Number.isFinite(quand) && Date.now() - quand > 24 * 3600 * 1000;
}

/**
 * Colis « expiré » : créé mais jamais payé depuis plus de 48 h — la demande
 * est morte (côté chauffeurs, la bourse l'ignore déjà après 48 h).
 */
export function colisExpire(colis: Colis): boolean {
  const statut = champ<StatutColis>(colis, 'status', 'statut');
  if (statut !== 'created') return false;
  const quand = new Date(String(champ(colis, 'created_at', 'createdAt') ?? '')).getTime();
  return Number.isFinite(quand) && Date.now() - quand > 48 * 3600 * 1000;
}

/** Formate un prix renvoyé par l'API (price + currency). */
export function formaterPrix(objet: Record<string, unknown> | null | undefined): string {
  const prix = champ<number | string>(objet, 'price', 'prix');
  const devise = champ<string>(objet, 'currency', 'devise') ?? '';
  if (prix === undefined) return '—';
  return formaterMontant(prix, devise);
}

// NB : la date relative traduite vit dans i18n.tsx (formaterDateRelativeI18n).

/** Formate une date ISO en français court, ou '' si absente/invalide. */
export function formaterDate(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Grille tarifaire — miroir de backend/src/services/pricingService.js.
// Le prix officiel est TOUJOURS calculé et FIGÉ côté serveur à la création ;
// cette grille sert uniquement à afficher le prix avant de réserver.
// Segmentation : touriste USD plein tarif ; résident USD (−10 % une fois
// vérifié) ; local (carte tanzanienne) 15 000 TZS partout une fois vérifié ;
// hôtel TZS (grille dédiée). Un touriste/résident ne voit JAMAIS de TZS,
// un local ne voit JAMAIS d'USD.
// ---------------------------------------------------------------------------

/** Profil tarifaire effectif au moment de l'affichage des prix. */
export type ProfilTarifaire = 'tourist' | 'resident' | 'resident_verifie' | 'local' | 'hotel';

/** Plein tarif USD (touristes, résidents non vérifiés). Pas de navette locale. */
export const TARIFS_TRAJET_USD: Partial<Record<TypeTrajet, number>> = {
  private: 50,
  shared_tourist: 18,
  posted_return: 18,
};

/**
 * Trajets spéciaux : paires ville ↔ ville (insensible à la casse, deux sens)
 * avec tarif privé dédié en USD. Le serveur applique la même règle quand
 * pickupLocation/dropoffLocation valent EXACTEMENT ces villes (sans précision
 * ajoutée) — d'où l'envoi des villes seules sur ces trajets.
 */
// Commission dédiée côté serveur : 20 % sur toute la chaîne de la côte est
// — le serveur fige prix ET commission sur chaque course, l'app n'affiche
// que ses valeurs.
//
// LA CHAÎNE DE LA CÔTE EST : Michamvi → Bwejuu → Paje → Jambiani →
// Makunduchi. Village voisin 12 USD, un village d'écart 16 USD.
export const TRAJETS_SPECIAUX_PRIVE_USD: { villes: [string, string]; prix: number }[] = [
  // Transfert aéroport : sept kilomètres (17 USD → commission privée 15 %
  // côté serveur, car sous les 40 USD).
  { villes: ['Aéroport international Abeid Amani Karume', 'Stone Town'], prix: 17 },
  { villes: ['Aéroport international Abeid Amani Karume', 'Stone Town Ferry'], prix: 17 },
  // Michamvi depuis le nord : la route contourne la baie de Chwaka.
  { villes: ['Nungwi', 'Michamvi'], prix: 65 },
  { villes: ['Kendwa', 'Michamvi'], prix: 65 },
  // La pointe sud : la route descend par l'intérieur.
  { villes: ['Kizimkazi', 'Jambiani'], prix: 17 },
  { villes: ['Michamvi', 'Bwejuu'], prix: 12 },
  { villes: ['Bwejuu', 'Paje'], prix: 12 },
  { villes: ['Paje', 'Jambiani'], prix: 12 },
  { villes: ['Jambiani', 'Makunduchi'], prix: 12 },
  { villes: ['Michamvi', 'Paje'], prix: 16 },
  { villes: ['Bwejuu', 'Jambiani'], prix: 16 },
  { villes: ['Paje', 'Makunduchi'], prix: 16 },
];

/** Trajets spéciaux TZS : place locale en taxi partagé (deux sens). */
export const TRAJETS_SPECIAUX_LOCAL_TZS: { villes: [string, string]; prix: number }[] = [
  { villes: ['Nungwi', 'Paje'], prix: 20000 },
];

function tarifSpecialItineraire(
  liste: { villes: [string, string]; prix: number }[],
  depart: string,
  arrivee: string
): number | null {
  const a = depart.trim().toLowerCase();
  const b = arrivee.trim().toLowerCase();
  if (!a || !b) return null;
  for (const special of liste) {
    const [v1, v2] = [special.villes[0].toLowerCase(), special.villes[1].toLowerCase()];
    if ((a === v1 && b === v2) || (a === v2 && b === v1)) return special.prix;
  }
  return null;
}

/** Tarif privé spécial USD pour un itinéraire donné, ou null si aucun. */
export function tarifSpecialPrive(depart: string, arrivee: string): number | null {
  return tarifSpecialItineraire(TRAJETS_SPECIAUX_PRIVE_USD, depart, arrivee);
}

/** Tarif local spécial TZS (place partagée) pour un itinéraire, ou null. */
export function tarifSpecialLocal(depart: string, arrivee: string): number | null {
  return tarifSpecialItineraire(TRAJETS_SPECIAUX_LOCAL_TZS, depart, arrivee);
}

/** Remise résident (documents de résidence validés) sur tous les prix USD. */
export const REMISE_RESIDENT = 0.1;
/** Taux de conversion USD → TZS (courses privées des locaux, grille colis). */
export const TAUX_USD_TZS = 2600;
/** Remise hôtel partenaire (−5 % sur la grille touriste). */
export const REMISE_HOTEL = 0.05;

/** Tarif local par défaut (zone inconnue) — affiché aussi sur l'accueil. */
export const TARIF_LOCAL_TZS = 15000;

// ---------------------------------------------------------------------------
// Grille PAR ZONE — courses depuis/vers la ville ou l'aéroport. La zone est
// déterminée par la ville zonée de l'itinéraire (les hubs et Stone Town ne
// sont pas zonés) ; si les deux bouts sont zonés : zone au privé le plus
// cher. « Ville (précision) » est normalisé. Défaut sans ville zonée :
// privé 50 USD · partagé 18 USD · local 15 000 TZS.
// ---------------------------------------------------------------------------

export type ZoneTarifaire = 'nord' | 'nord_est' | 'est' | 'est_sud' | 'est_pointe' | 'sud';

export interface TarifsZone {
  priveUsd: number;
  localTzs: number;
}

/**
 * Prix d'une place en taxi partagé — déduit du prix de la course PRIVÉE du
 * même trajet, jamais fixé à part (miroir exact de la grille serveur) :
 * privé 40 → 12 · 45 → 15 · 50 → 16 · 60 et plus → 18.
 */
export function tarifPlacePartagee(priveUsd: number): number {
  if (priveUsd >= 60) return 18;
  if (priveUsd >= 50) return 16;
  if (priveUsd >= 45) return 15;
  return 12;
}

// Tarif local UNIFIÉ : 15 000 TZS la place partout (sauf trajets spéciaux,
// ex. Nungwi ↔ Paje 20 000) — miroir de la grille serveur.
export const TARIFS_ZONE: Record<ZoneTarifaire, TarifsZone> = {
  nord: { priveUsd: 45, localTzs: 15000 }, // Nungwi, Kendwa
  nord_est: { priveUsd: 40, localTzs: 15000 }, // Matemwe → Chwaka
  est: { priveUsd: 45, localTzs: 15000 }, // Paje, Bwejuu
  est_sud: { priveUsd: 50, localTzs: 15000 }, // Jambiani
  est_pointe: { priveUsd: 50, localTzs: 15000 }, // Michamvi
  sud: { priveUsd: 45, localTzs: 15000 }, // Kizimkazi, Makunduchi, Fumba
};

/** Tarifs appliqués quand aucune ville zonée n'apparaît dans l'itinéraire. */
export const TARIFS_ZONE_DEFAUT: TarifsZone = {
  priveUsd: 50,
  localTzs: TARIF_LOCAL_TZS,
};

/** Ville (minuscules) → zone tarifaire. */
export const VILLES_ZONE: Record<string, ZoneTarifaire> = {
  nungwi: 'nord',
  kendwa: 'nord',
  matemwe: 'nord_est',
  kiwengwa: 'nord_est',
  'pwani mchangani': 'nord_est',
  uroa: 'nord_est',
  pongwe: 'nord_est',
  chwaka: 'nord_est',
  paje: 'est',
  bwejuu: 'est',
  jambiani: 'est_sud',
  michamvi: 'est_pointe',
  kizimkazi: 'sud',
  makunduchi: 'sud',
  fumba: 'sud',
};

/** Normalise un lieu : retire la précision « (…) » finale, casse ignorée. */
function normaliserLieu(lieu: string): string {
  return lieu
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .toLowerCase();
}

/**
 * Zone tarifaire d'un itinéraire, ou null si aucune ville zonée. Si les deux
 * bouts sont zonés, on retient la zone au tarif privé le plus cher.
 */
export function zoneItineraire(depart: string, arrivee: string): ZoneTarifaire | null {
  const zones = [VILLES_ZONE[normaliserLieu(depart)], VILLES_ZONE[normaliserLieu(arrivee)]].filter(
    (zone): zone is ZoneTarifaire => zone !== undefined
  );
  if (zones.length === 0) return null;
  if (zones.length === 1) return zones[0];
  return TARIFS_ZONE[zones[0]].priveUsd >= TARIFS_ZONE[zones[1]].priveUsd ? zones[0] : zones[1];
}

/** Tarifs de zone d'un itinéraire (défaut 50/18 USD, 15 000 TZS). */
export function tarifsZoneItineraire(depart: string, arrivee: string): TarifsZone {
  const zone = zoneItineraire(depart, arrivee);
  return zone ? TARIFS_ZONE[zone] : TARIFS_ZONE_DEFAUT;
}

// ---------------------------------------------------------------------------
// Grille privée VILLE ↔ VILLE au kilomètre — miroir exact du serveur
// (pricingService.privateUsdForRoute) : 0,85 USD/km de route (vol
// d'oiseau × 1,35 de détour), arrondi aux 5 USD, minimum 20. Les liaisons
// depuis/vers les hubs (Stone Town, aéroport) gardent la grille par zone ;
// trajets spéciaux prioritaires (Nungwi ↔ Paje 65, Nungwi ↔ Kizimkazi 70).
// ---------------------------------------------------------------------------

const COORDONNEES_VILLES: Record<string, [number, number]> = {
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
const DETOUR_ROUTIER = 1.35;

/**
 * PALIERS DE DISTANCE entre deux villages (hors hubs) — miroir exact de la
 * grille serveur. Un client comprend « c'est le village d'à côté » ou « c'est
 * la traversée de l'île » ; il ne compte pas les kilomètres.
 */
const PALIERS_KM_USD: { maxKm: number; usd: number }[] = [
  { maxKm: 12, usd: 12 }, // village voisin
  { maxKm: 30, usd: 16 }, // un village d'écart
  { maxKm: 50, usd: 25 },
  { maxKm: 75, usd: 40 },
  { maxKm: 100, usd: 60 }, // d'une côte à l'autre
  { maxKm: Infinity, usd: 65 }, // du nord au sud
];
const HUBS_TARIFAIRES = new Set([
  'stone town',
  'stone town ferry',
  'aéroport (aakia)',
  'aéroport abeid amani karume',
  'aéroport international abeid amani karume',
  'aéroport',
  'airport',
]);

/** Kilomètres de route estimés entre deux villes connues, sinon null. */
export function kmEntreVilles(depart: string, arrivee: string): number | null {
  const a = COORDONNEES_VILLES[normaliserLieu(depart)];
  const b = COORDONNEES_VILLES[normaliserLieu(arrivee)];
  if (!a || !b) return null;
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)) * DETOUR_ROUTIER;
}

/** Prix privé USD d'un itinéraire — spéciaux > hubs par zone > formule km. */
export function tarifPriveItineraire(depart: string, arrivee: string): number {
  const special = tarifSpecialPrive(depart, arrivee);
  if (special !== null) return special;
  const d = normaliserLieu(depart);
  const a = normaliserLieu(arrivee);
  if (!HUBS_TARIFAIRES.has(d) && !HUBS_TARIFAIRES.has(a)) {
    const km = kmEntreVilles(depart, arrivee);
    if (km !== null) {
      return (PALIERS_KM_USD.find((palier) => km <= palier.maxKm) as { usd: number }).usd;
    }
  }
  return tarifsZoneItineraire(depart, arrivee).priveUsd;
}

// Hôtel partenaire : même grille USD que les touristes avec −5 %
// (appliqué dans tarifTrajetProfil).

/** Profil tarifaire d'un compte client (hors hôtel). */
export function profilTarifaireUtilisateur(
  utilisateur: Utilisateur | null | undefined
): ProfilTarifaire {
  const type = champ<TypeCompte>(utilisateur, 'account_type', 'accountType');
  if (type === 'local') return 'local';
  if (type === 'resident') return compteVerifie(utilisateur) ? 'resident_verifie' : 'resident';
  return 'tourist';
}

/**
 * Tarif affiché d'une course selon le profil et l'itinéraire (grille par
 * zone). Le trajet spécial Nungwi ↔ Paje (privé 65 USD) reste prioritaire
 * sur la zone ; la remise résident vérifié (×0,9) s'applique au prix retenu.
 */
export function tarifTrajetProfil(
  type: TypeTrajet,
  profil: ProfilTarifaire,
  itineraire?: { depart: string; arrivee: string }
): { montant: number; devise: Devise } | null {
  const zone = itineraire
    ? tarifsZoneItineraire(itineraire.depart, itineraire.arrivee)
    : TARIFS_ZONE_DEFAUT;
  if (profil === 'local') {
    // Course privée : même prix que la grille touriste (grille au kilomètre
    // ville ↔ ville incluse), converti en TZS.
    if (type === 'private') {
      const usd = itineraire
        ? tarifPriveItineraire(itineraire.depart, itineraire.arrivee)
        : zone.priveUsd;
      return { montant: Math.round(usd * TAUX_USD_TZS), devise: 'TZS' };
    }
    // Place en taxi partagé : le tarif local (15 000, spéciaux inclus) ne
    // vaut que sur les GRANDS AXES — privé du même trajet à 40 USD minimum.
    // Ailleurs, la place se paie au prix touriste converti en shillings.
    if (itineraire && tarifPriveItineraire(itineraire.depart, itineraire.arrivee) < 40) {
      const prive = tarifPriveItineraire(itineraire.depart, itineraire.arrivee);
      return { montant: Math.round(tarifPlacePartagee(prive) * TAUX_USD_TZS), devise: 'TZS' };
    }
    const specialLocal = itineraire
      ? tarifSpecialLocal(itineraire.depart, itineraire.arrivee)
      : null;
    return { montant: specialLocal ?? zone.localTzs, devise: 'TZS' };
  }
  let plein: number | undefined;
  if (type === 'private') {
    plein = itineraire
      ? tarifPriveItineraire(itineraire.depart, itineraire.arrivee)
      : zone.priveUsd;
  } else if (type === 'shared_tourist' || type === 'shared_local') {
    plein = tarifPlacePartagee(
      itineraire ? tarifPriveItineraire(itineraire.depart, itineraire.arrivee) : zone.priveUsd
    );
  } else {
    plein = TARIFS_TRAJET_USD[type];
  }
  if (plein === undefined) return null;
  // Grille touriste remisée : résident vérifié −10 %, hôtel partenaire −5 %.
  const remise =
    profil === 'resident_verifie' ? REMISE_RESIDENT : profil === 'hotel' ? REMISE_HOTEL : 0;
  const montant = remise ? Math.round(plein * (1 - remise) * 100) / 100 : plein;
  return { montant, devise: 'USD' };
}

// ---------------------------------------------------------------------------
// Colis — 3 tailles, payées en ligne à 100 % par l'expéditeur. Prix par
// devise du profil : USD touristes/résidents (aucune remise sur les colis),
// TZS hôtels/locaux.
// ---------------------------------------------------------------------------

export type TailleColis = 'small' | 'medium' | 'large';

export const TAILLES_COLIS: TailleColis[] = ['small', 'medium', 'large'];

export const TARIFS_COLIS_TAILLE: Record<TailleColis, Record<Devise, number>> = {
  small: { USD: 5, TZS: 13000 },
  medium: { USD: 10, TZS: 26000 },
  large: { USD: 18, TZS: 47000 },
};

/** Tarif d'un envoi de colis pour une taille et une devise. */
export function tarifColisTaille(taille: TailleColis, devise: Devise): number {
  return TARIFS_COLIS_TAILLE[taille][devise];
}
