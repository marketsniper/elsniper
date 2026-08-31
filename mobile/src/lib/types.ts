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
  /** Location de véhicule (rental_bookings). */
  rental_booking_id?: string | null;
  rental_make?: string | null;
  rental_model?: string | null;
  rental_plate?: string | null;
  rental_start_date?: string | null;
  rental_end_date?: string | null;
  rental_client_name?: string | null;
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
  /** Paiement de la place : ce qu'il y a RÉELLEMENT à régler, et comment.
   *  `amount` ci-dessus reste le PRIX ; un touriste facturé en dollars peut
   *  régler en shillings par portefeuille mobile. */
  payment_id?: string | null;
  reglement_montant?: number | null;
  reglement_devise?: string | null;
  reglement_surcharge?: number | null;
  reglement_moyen?: MoyenPaiement | null;
  moyens_disponibles?: MoyenPaiement[];
}

/** Une photo de la galerie d'un véhicule (rental_vehicle_photos). */
export interface PhotoVehicule {
  id: string;
  url: string;
  position: number;
}

/**
 * Véhicule en location (GET /rental-vehicles, /rental-vehicles/:id). Le
 * CLIENT ne reçoit jamais le loueur ni les documents — seulement
 * `documents_verified` ; l'équipe voit tout (plate, loueur, documents,
 * verification_status, available…), voir sanitizeVehicle côté serveur.
 */
export interface VehiculeLocation {
  id: string;
  category: string;
  make: string;
  model: string;
  year?: number | null;
  seats?: number | null;
  transmission?: string | null;
  description?: string | null;
  pickup_location: string;
  daily_price: number | string;
  currency: Devise;
  photos: PhotoVehicule[];
  /** Côté client uniquement. */
  documents_verified?: boolean;
  /** Côté équipe uniquement. */
  plate?: string;
  loueur_name?: string;
  loueur_phone?: string;
  daily_commission?: number | string;
  insurance_document_url?: string;
  insurance_expires_on?: string | null;
  road_licence_document_url?: string;
  road_licence_expires_on?: string | null;
  verification_status?: StatutVerification;
  available?: boolean;
  archived_at?: string | null;
  created_at?: string;
}

/** Réservation de véhicule (rental_bookings) — même logique paid_at/cancelled_at qu'une place de taxi partagé. */
export interface ReservationVehicule {
  id: string;
  vehicle_id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  days: number;
  price: number | string;
  commission: number | string;
  currency: Devise;
  paid_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  /** GET /rental-vehicles/bookings/mine et /bookings (équipe) enrichissent avec le véhicule. */
  make?: string;
  model?: string;
  plate?: string;
  category?: string;
  pickup_location?: string;
  /** Équipe seulement (GET /bookings). */
  client_name?: string;
  client_phone?: string;
  /** GET /bookings/mine seulement. */
  payment_id?: string | null;
  payment_status?: string | null;
}

/** Réponse de POST /rental-vehicles/:id/book : la réservation + son paiement. */
export interface ReservationVehiculeAvecPaiement extends ReservationVehicule {
  payment: Paiement & {
    rental_booking_id: string;
    payment_method?: string;
    prix_location?: number;
    devise_location?: string;
    mention_surcharge?: string;
    moyen?: MoyenPaiement;
    moyens_disponibles?: MoyenPaiement[];
  };
}

/** Réponse de POST /rental-vehicles/bookings/:id/cancel. */
export interface AnnulationVehicule {
  id: string;
  cancelled: boolean;
  refund: { amount: number; currency: string; rate: number } | null;
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
// vrai transfert, facturé 18 USD.
export const POINTS_STONE_TOWN: string[] = ['Stone Town', 'Stone Town Ferry'];

// Les 18 villes de l'île (hors hubs) — communes au départ et à l'arrivée.
// Mtende (pointe sud, entre Makunduchi et Kizimkazi) et Dongwe (presqu'île
// est, entre Bwejuu et Michamvi) ont été ajoutés le 21/08/2026.
const VILLES_RIDES: string[] = [
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
  'Dongwe',
  'Bwejuu',
  'Paje',
  'Jambiani',
  'Makunduchi',
  'Mtende',
  'Kizimkazi',
  'Fumba',
];

// Arrivées : l'aéroport EN PLUS des villes — un touriste du sud rentre prendre
// son vol (Makunduchi → aéroport, Jambiani → aéroport…). Miroir du serveur.
export const DESTINATIONS_RIDES: string[] = [
  'Aéroport international Abeid Amani Karume',
  ...VILLES_RIDES,
];
// Départs ouverts à toutes les villes : hubs (aéroport, ferry) + 16 villes.
export const ORIGINES_RIDES: string[] = [...HUBS_RIDES, ...VILLES_RIDES];

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

/** Vrai si le compte est résident ET vérifié (remise de 5 % sur les prix USD). */
export function residentVerifie(utilisateur: Utilisateur | null | undefined): boolean {
  return (
    champ<TypeCompte>(utilisateur, 'account_type', 'accountType') === 'resident' &&
    compteVerifie(utilisateur)
  );
}

/** Vrai si le compte est local (carte tanzanienne) ET vérifié (tarif 17 000 TZS). */
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

// ─────────────────── CE QUE LE CHAUFFEUR MET DANS SA POCHE ─────────────────
//
// Sur le portail chauffeur, l'argent affiché est TOUJOURS le net — jamais le
// prix payé par le client. Le serveur ne l'envoie même plus (voir
// backend/src/services/vueChauffeur.js) ; ces deux fonctions sont l'unique
// porte par laquelle un montant entre sur un écran de chauffeur.

/**
 * Le gain net du chauffeur sur une course, un colis ou une place.
 *
 * Le serveur envoie `net_chauffeur` (ou `net_per_seat`) tout calculé. Le repli
 * `prix − commission` ne sert plus qu'aux réponses anciennes, gardées en
 * mémoire par un téléphone qui n'a pas encore reçu la mise à jour.
 */
export function gainNetChauffeur(
  objet: Record<string, unknown> | null | undefined
): { montant: number; devise: string } | null {
  const devise = champ<string>(objet, 'currency', 'devise') ?? '';
  const net = Number(champ(objet, 'net_chauffeur', 'netChauffeur', 'net_per_seat'));
  if (Number.isFinite(net)) return { montant: net, devise };
  const prix = Number(champ(objet, 'price', 'prix'));
  const commission = Number(champ(objet, 'commission'));
  if (!Number.isFinite(prix) || !Number.isFinite(commission)) return null;
  return { montant: Math.round((prix - commission) * 100) / 100, devise };
}

/**
 * La part zanziGo de CETTE course-là, en pourcentage entier.
 *
 * Elle varie : 12 % sur un transfert, 15 % sur une petite course, 17 % sur le
 * couloir du sud-est, 25 % sur une place partagée — et sur l'aéroport ↔ Stone
 * Town, c'est un forfait de 4,50 $, soit 31 % d'une course à 14,50. On affiche
 * le taux réel, pas une moyenne : un chauffeur qui refait le calcul doit
 * tomber juste.
 */
/**
 * LE NET DU CHAUFFEUR SUR UNE PLACE DE TAXI PARTAGÉ — miroir exact du
 * serveur (backend/src/routes/rides.js).
 *
 * Sert à l'écran de publication d'annonce, qui doit annoncer le gain AVANT
 * que l'annonce existe : il n'y a donc rien à demander au serveur.
 */
const TAUX_PLACE_USD = 0.25;
const TAUX_PLACE_LOCALE = 0.2;

/** Le gain d'une place en dollars, au centime. */
export function netPlacePartageeUsd(prixParPlace: number): number {
  return Math.round(prixParPlace * (1 - TAUX_PLACE_USD) * 100) / 100;
}

/**
 * Le gain d'une place en shillings, ARRONDI AU MILLIER INFÉRIEUR.
 *
 * La promesse « comptes ronds » faite aux chauffeurs : 13 600 devient 13 000,
 * et les shillings restants rejoignent la commission. Un chauffeur vérifie
 * son portefeuille de tête ; personne ne compte 600 shillings.
 */
export function netPlacePartageeTzs(prixParPlace: number): number {
  return Math.floor((prixParPlace * (1 - TAUX_PLACE_LOCALE)) / 1000) * 1000;
}

export function partZanziGoPct(
  objet: Record<string, unknown> | null | undefined
): number | null {
  if (tarifSpecialChauffeur(objet)) return null;
  const envoye = Number(champ(objet, 'part_zanzigo_pct', 'partZanzigoPct'));
  if (Number.isFinite(envoye)) return envoye;
  const prix = Number(champ(objet, 'price', 'prix'));
  const commission = Number(champ(objet, 'commission'));
  if (!Number.isFinite(prix) || !Number.isFinite(commission) || prix <= 0) return null;
  return Math.round((commission / prix) * 100);
}

/**
 * Le trajet dont la part zanziGo ne se dit pas en pourcentage : la course
 * privée aéroport ↔ Stone Town, où la commission est un forfait de 4,50 $.
 * « 31 % » à l'écran serait vrai et pourtant trompeur — le portail écrit
 * « Special trip » à la place.
 *
 * Le serveur envoie le drapeau `tarif_special` ; le repli recalcule sur le
 * trajet lui-même pour les réponses restées en mémoire d'un téléphone qui
 * n'a pas encore la mise à jour.
 */
export function tarifSpecialChauffeur(
  objet: Record<string, unknown> | null | undefined
): boolean {
  const envoye = champ<boolean>(objet, 'tarif_special', 'tarifSpecial');
  if (envoye !== undefined) return envoye === true;
  return (
    champ<string>(objet, 'trip_type', 'tripType') === 'private' &&
    estAeroportVille(
      String(champ(objet, 'pickup_location', 'pickupLocation') ?? ''),
      String(champ(objet, 'dropoff_location', 'dropoffLocation') ?? '')
    )
  );
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
// Segmentation : touriste USD plein tarif ; résident USD (−5 % une fois
// vérifié) ; local (carte tanzanienne) 17 000 TZS partout une fois vérifié ;
// hôtel TZS (grille dédiée). Un touriste/résident ne voit JAMAIS de TZS,
// un local ne voit JAMAIS d'USD.
// ---------------------------------------------------------------------------

/** Profil tarifaire effectif au moment de l'affichage des prix. */
export type ProfilTarifaire = 'tourist' | 'resident' | 'resident_verifie' | 'local' | 'hotel';

/** Plein tarif USD (touristes, résidents non vérifiés). Pas de navette locale. */
// Miroir du DÉFAUT serveur (aucune ville zonée reconnue) : privé 53 USD,
// place partagée sharedSeatUsd(53) = 16. Ces valeurs avaient pris du retard
// sur deux hausses — piège dormant, aucun écran ne les affiche aujourd'hui.
export const TARIFS_TRAJET_USD: Partial<Record<TypeTrajet, number>> = {
  private: 53,
  shared_tourist: 16,
  posted_return: 16,
};

/**
 * LA GRILLE PRIVÉE PART DE CE QUE TOUCHE LE CHAUFFEUR — miroir exact du
 * serveur (pricingService.js). Chaque trajet porte un NET CHAUFFEUR ; le prix
 * client est ce net PLUS le forfait zanziGo. La commission n'est donc plus un
 * pourcentage mais une somme en dollars, connue d'avance.
 *
 * Le premier groupe qui contient la paire l'emporte : l'ordre va du plus
 * précis au plus large. Ce qui n'est couvert par aucun groupe retombe sur les
 * paliers au kilomètre.
 */
const GROUPES_NET_USD: { a: string[]; b: string[]; net: number }[] = [
  // Sauts de village de la côte est — prix de terrain, donnés un par un.
  { a: ['paje'], b: ['jambiani', 'bwejuu'], net: 10 },
  { a: ['nungwi'], b: ['kendwa'], net: 10 },
  { a: ['paje'], b: ['makunduchi'], net: 15 },
  { a: ['kizimkazi'], b: ['makunduchi'], net: 15 },
  { a: ['makunduchi'], b: ['mtende'], net: 15 },
  // Michamvi et Dongwe sont au bout de la presqu'île : le chauffeur en revient
  // à vide, la course se paie plus cher que Makunduchi, pourtant plus loin.
  { a: ['paje'], b: ['michamvi', 'dongwe', 'kizimkazi'], net: 20 },
  // Depuis le nord. Kendwa suit Nungwi partout : cinq kilomètres les séparent.
  { a: ['nungwi', 'kendwa'], b: ['matemwe', 'pwani mchangani'], net: 25 },
  { a: ['nungwi', 'kendwa'], b: ['kiwengwa', 'uroa', 'chwaka'], net: 35 },
  { a: ['nungwi', 'kendwa'], b: ['paje', 'bwejuu', 'jambiani'], net: 50 },
  {
    a: ['nungwi', 'kendwa'],
    b: ['makunduchi', 'michamvi', 'dongwe', 'kizimkazi', 'mtende'],
    net: 55,
  },
  // La côte sud-est vers la côte nord-est : pas de route côtière continue, il
  // faut remonter par le carrefour de Tunguu et redescendre.
  { a: ['paje', 'bwejuu', 'jambiani'], b: ['chwaka', 'uroa', 'pongwe'], net: 45 },
  { a: ['paje', 'bwejuu', 'jambiani'], b: ['kiwengwa', 'pwani mchangani', 'matemwe'], net: 47 },
  {
    a: ['makunduchi', 'michamvi', 'dongwe', 'kizimkazi', 'mtende'],
    b: ['uroa', 'pongwe', 'chwaka', 'kiwengwa', 'pwani mchangani', 'matemwe'],
    net: 50,
  },
  // Fumba est au bout de sa presqu'île : pour rejoindre l'est il repasse par
  // Tunguu, exactement comme depuis Stone Town — donc au prix du transfert.
  {
    a: ['fumba'],
    b: [
      'paje', 'bwejuu', 'jambiani', 'michamvi', 'dongwe', 'makunduchi', 'mtende',
      'kizimkazi', 'chwaka', 'uroa', 'pongwe', 'kiwengwa', 'pwani mchangani', 'matemwe',
    ],
    net: 45,
  },
  { a: ['fumba'], b: ['nungwi', 'kendwa'], net: 50 },
];

/** Transfert depuis/vers un hub : prix unique vers toute l'île. */
const NET_TRANSFERT_USD = 45;
/**
 * LES TRANSFERTS QUI SORTENT DU PRIX UNIQUE (miroir exact du serveur).
 *
 * Le prix unique traitait Fumba comme Nungwi : 52 USD pour tout le monde,
 * alors que Fumba est à 27 km de Stone Town quand Nungwi est à 67.
 *
 * LE HUB DE DÉPART COMPTE : l'aéroport est plus loin de Nungwi que Stone Town,
 * et plus loin de Matemwe aussi. Chaque destination porte son net « depuis la
 * ville » et, quand il diffère, son net « depuis l'aéroport ».
 *
 * GRILLE PAR BANDES KILOMÉTRIQUES (25/08/2026) — le prix suit la route,
 * partout entre 0,67 et 0,86 USD/km. Nets → prix client :
 * 17 → 20 ; 23 → 28 ; 24 → 29 ; 25 → 30 ; 26 → 31 ; 39 → 45 ; 42 → 48.
 */
const NET_TRANSFERT_PAR_VILLE_USD: Record<string, { ville: number; aeroport?: number }> = {
  fumba: { ville: 17 },
  chwaka: { ville: 23 },
  uroa: { ville: 23 },
  pongwe: { ville: 23 },
  kiwengwa: { ville: 24, aeroport: 26 },
  'pwani mchangani': { ville: 25, aeroport: 28 },
  matemwe: { ville: 39 },
  paje: { ville: 39 },
  bwejuu: { ville: 39 },
  jambiani: { ville: 39 },
  kizimkazi: { ville: 39 },
  makunduchi: { ville: 39 },
  mtende: { ville: 39 },
  kendwa: { ville: 39, aeroport: 42 },
  nungwi: { ville: 39, aeroport: 42 },
  michamvi: { ville: 42 },
  dongwe: { ville: 42 },
};

/** L'aéroport et la ville sont à sept kilomètres : ce n'est pas un transfert,
 *  mais c'est la course la plus fréquente de l'île. */
const NET_AEROPORT_VILLE_USD = 10;
/**
 * COMMISSION DES COURSES PRIVÉES, en pourcentage (miroir exact du serveur) :
 * 12 % à partir de 40 USD de prix client, 15 % en dessous.
 */
const COMMISSION_PRIVE = { grand: 0.12, petit: 0.15 };
const COMMISSION_PRIVE_SEUIL_USD = 40;

/**
 * AÉROPORT ↔ STONE TOWN : commission fixée en DOLLARS, pas en pourcentage.
 * Sept kilomètres, mais la course la plus fréquente de l'île.
 */
const COMMISSION_AEROPORT_VILLE_USD = 4.5;

/**
 * SUPPLÉMENT DE 1 USD ENTRE VILLAGES : une course qui ne part ni de Stone Town
 * ni de l'aéroport coûte un dollar de plus, et ce dollar va entièrement à
 * zanziGo. Le chauffeur touche exactement ce qu'il touchait avant.
 */
const SUPPLEMENT_VILLAGE_USD = 1;

function supplementUsd(depart: string, arrivee: string): number {
  const d = normaliserLieu(depart);
  const a = normaliserLieu(arrivee);
  return !HUBS_TARIFAIRES.has(d) && !HUBS_TARIFAIRES.has(a) ? SUPPLEMENT_VILLAGE_USD : 0;
}

function estAeroportVille(depart: string, arrivee: string): boolean {
  const d = normaliserLieu(depart);
  const a = normaliserLieu(arrivee);
  const villeSt = POINTS_STONE_TOWN.map(normaliserLieu);
  return (
    (HUBS_TARIFAIRES.has(d) && villeSt.includes(a)) ||
    (villeSt.includes(d) && HUBS_TARIFAIRES.has(a))
  );
}

/** Taux de commission d'une course privée, selon le prix ET l'itinéraire. */
export function tauxCommissionPrive(prixUsd: number, depart?: string, arrivee?: string): number {
  if (depart !== undefined && arrivee !== undefined && estAeroportVille(depart, arrivee)) {
    return COMMISSION_AEROPORT_VILLE_USD / prixUsd;
  }
  return prixUsd >= COMMISSION_PRIVE_SEUIL_USD ? COMMISSION_PRIVE.grand : COMMISSION_PRIVE.petit;
}

/** Trajets spéciaux TZS : place locale en taxi partagé (deux sens). */
export const TRAJETS_SPECIAUX_LOCAL_TZS: { villes: [string, string]; prix: number }[] = [
  { villes: ['Nungwi', 'Paje'], prix: 22000 },
  // PAJE VERS LA VILLE, POUR LES LOCAUX : 15 000 TZS (22/08/2026). La ligne
  // la plus fréquentée par les habitants de la côte est — ceux qui vont
  // travailler en ville et rentrent le soir. À tenir identique au serveur
  // (SPECIAL_LOCAL_ROUTES_TZS dans pricingService.js) : les deux grilles sont
  // les deux moitiés d'un même tarif, et un écart s'affiche au client avant
  // qu'il ne se corrige au moment de payer.
  { villes: ['Paje', 'Stone Town'], prix: 15000 },
  { villes: ['Paje', 'Stone Town Ferry'], prix: 15000 },
  { villes: ['Paje', 'Aéroport'], prix: 15000 },
];

/** « Ville (précision) » → « ville », comme normCity côté serveur. */
const normaliserVille = (s: string): string =>
  s.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();

// L'aéroport porte cinq libellés historiques. Sans ce repli sur un nom
// canonique, une règle écrite « Aéroport » resterait sans effet sur un trajet
// saisi « Aéroport international Abeid Amani Karume » — silencieusement.
const ALIAS_AEROPORT = new Set([
  'aéroport (aakia)',
  'aéroport abeid amani karume',
  'aéroport international abeid amani karume',
  'aéroport',
  'airport',
]);
const villeCanonique = (v: string): string => {
  const n = normaliserVille(v);
  return ALIAS_AEROPORT.has(n) ? 'aéroport' : n;
};

function tarifSpecialItineraire(
  liste: { villes: [string, string]; prix: number }[],
  depart: string,
  arrivee: string
): number | null {
  const a = villeCanonique(depart);
  const b = villeCanonique(arrivee);
  if (!a || !b) return null;
  for (const special of liste) {
    const v1 = villeCanonique(special.villes[0]);
    const v2 = villeCanonique(special.villes[1]);
    if ((a === v1 && b === v2) || (a === v2 && b === v1)) return special.prix;
  }
  return null;
}

/**
 * Ce trajet a-t-il un PRIX DE TERRAIN, décidé village par village, plutôt que
 * la formule au kilomètre ? C'est ce qui justifie de l'annoncer au client :
 * le prix tient compte de la vraie route (baies sans pont, presqu'îles sans
 * issue), pas de la distance à vol d'oiseau.
 */
export function estTarifDeTerrain(depart: string, arrivee: string): boolean {
  const d = normaliserLieu(depart);
  const a = normaliserLieu(arrivee);
  return GROUPES_NET_USD.some((groupe) => dansLeGroupe(groupe, d, a));
}

/** Tarif local spécial TZS (place partagée) pour un itinéraire, ou null. */
export function tarifSpecialLocal(depart: string, arrivee: string): number | null {
  return tarifSpecialItineraire(TRAJETS_SPECIAUX_LOCAL_TZS, depart, arrivee);
}

/**
 * Remise résident (documents de résidence validés) sur tous les prix USD.
 *
 * Côté client, elle ne change rien : le résident paie 5 % de moins, point.
 * Côté partage, elle est portée MOITIÉ-MOITIÉ par zanziGo et le chauffeur
 * (2,5 % chacun) — mais ce calcul-là appartient au serveur, seul juge des
 * commissions. Ici on n'affiche qu'un prix.
 */
export const REMISE_RESIDENT = 0.05;
/** Taux de conversion USD → TZS (courses privées des locaux, grille colis). */
export const TAUX_USD_TZS = 2600;
/** Remise hôtel partenaire (−5 % sur la grille touriste). */
export const REMISE_HOTEL = 0.05;

// ---------------------------------------------------------------------------
// MOYENS DE PAIEMENT — miroir de backend/src/services/moyenPaiement.js.
// Sert à AFFICHER le montant avant de payer ; le serveur reste seul juge du
// montant réellement dû. Les deux doivent bouger ensemble : un écart ici, et
// le client voit un prix et se fait débiter un autre.
// ---------------------------------------------------------------------------

export type MoyenPaiement = 'carte' | 'mobile';

/** Frais bancaires ajoutés au paiement par carte (à la charge du payeur). */
export const SURCHARGE_CARTE = 0.04;

/**
 * Les moyens proposés selon la devise de la facture : en dollars, carte ou
 * portefeuille mobile ; en shillings, portefeuille mobile uniquement — le
 * moyen de paiement normal du pays, et le seul des clients locaux.
 */
export function moyensPaiement(devise: string): MoyenPaiement[] {
  return String(devise).toUpperCase() === 'USD' ? ['carte', 'mobile'] : ['mobile'];
}

/** Ce que le client réglera : montant, devise, et frais éventuels. */
export function reglementPaiement(
  prix: number,
  devise: string,
  moyen: MoyenPaiement
): { montant: number; devise: string; surcharge: number } {
  const dev = String(devise).toUpperCase();
  if (moyen === 'mobile') {
    // Conversion au taux de la grille, arrondie aux 100 TZS supérieurs (un
    // montant rond se saisit sans erreur sur un portefeuille mobile).
    const montant = dev === 'USD' ? Math.ceil((prix * TAUX_USD_TZS) / 100) * 100 : prix;
    return { montant, devise: 'TZS', surcharge: 0 };
  }
  // La carte n'existe qu'en dollars (miroir de surchargeApplicable côté
  // serveur) : sur une facture en shillings, aucun frais quoi qu'on passe.
  if (dev !== 'USD') return { montant: prix, devise: dev, surcharge: 0 };
  const surcharge = Math.round(prix * SURCHARGE_CARTE * 100) / 100;
  return { montant: Math.round((prix + surcharge) * 100) / 100, devise: dev, surcharge };
}

/** Tarif local par défaut (zone inconnue) — affiché aussi sur l'accueil. */
export const TARIF_LOCAL_TZS = 17000;

/**
 * LE PRIX LE PLUS BAS PRATIQUÉ SUR L'ÎLE, en shillings.
 *
 * Ce que paie un local pour la course la moins chère qu'on sache lui vendre :
 * une place de taxi partagé sur un petit saut (Nungwi ↔ Kendwa, l'aéroport ↔
 * Stone Town…). C'est le chiffre qui a un sens dans un « à partir de ».
 *
 * Il est CALCULÉ sur la grille, pas écrit à la main. Le jour où un tarif
 * bouge, la phrase affichée bouge avec lui — c'est exactement la dérive qui a
 * fait promettre 10 % de remise pendant que le moteur en appliquait 5.
 */
// Le TAXI PARTAGÉ n'est proposé que sur les trajets assez longs : course
// privée du même trajet à 28 USD minimum — le prix de la côte est depuis la
// grille kilométrique du 25/08. En dessous (Nungwi ↔ Kendwa, aéroport ↔
// Stone Town, sauts de village), course privée uniquement. Même seuil que le
// serveur — voir sharedAllowedForRoute.
const PARTAGE_PRIVE_MIN_USD = 28;

/** Un taxi partagé peut-il exister sur cet itinéraire ? */
export function partagePossibleItineraire(depart: string, arrivee: string): boolean {
  const d = normaliserVille(depart);
  const a = normaliserVille(arrivee);
  // Stone Town et le terminal ferry sont le même endroit : aucune course.
  if (POINTS_STONE_TOWN.map(normaliserVille).includes(d)
    && POINTS_STONE_TOWN.map(normaliserVille).includes(a)) return false;
  return tarifPriveItineraire(depart, arrivee) >= PARTAGE_PRIVE_MIN_USD;
}

let miniLocalMemo: number | null = null;

/**
 * LE PRIX LE PLUS BAS PRATIQUÉ SUR L'ÎLE, en shillings.
 *
 * Ce que paie un local pour la course la moins chère qu'on sache lui vendre :
 * une place de taxi partagé sur un petit saut (Nungwi ↔ Kendwa, l'aéroport ↔
 * Stone Town…). C'est le seul chiffre qui ait un sens dans un « à partir de ».
 *
 * Il est CALCULÉ sur la grille, jamais écrit à la main : le jour où un tarif
 * bouge, la phrase affichée bouge avec lui. C'est exactement la dérive qui a
 * fait promettre 10 % de remise pendant que le moteur en appliquait 5.
 *
 * PARESSEUX, et ce n'est pas un détail : calculé au chargement du module, il
 * s'exécutait avant l'initialisation de la grille des zones et faisait planter
 * l'application au démarrage. On attend le premier appel, puis on mémorise.
 */
export function tarifLocalMiniTzs(): number {
  if (miniLocalMemo !== null) return miniLocalMemo;
  let mini = Infinity;
  for (const depart of ORIGINES_RIDES) {
    for (const arrivee of ORIGINES_RIDES) {
      if (depart === arrivee) continue;
      // Le prix annoncé doit être ACHETABLE. La formule sait chiffrer une
      // place sur n'importe quel couple de villes, y compris là où aucun
      // taxi partagé n'est jamais proposé (Nungwi ↔ Kendwa, aéroport ↔
      // Stone Town…) : ces couples sortaient un prix plancher que personne
      // n'aurait jamais pu réserver.
      if (!partagePossibleItineraire(depart, arrivee)) continue;
      const tarif = tarifTrajetProfil('shared_local', 'local', { depart, arrivee });
      if (tarif && tarif.devise === 'TZS' && tarif.montant > 0 && tarif.montant < mini) {
        mini = tarif.montant;
      }
    }
  }
  miniLocalMemo = Number.isFinite(mini) ? mini : TARIF_LOCAL_TZS;
  return miniLocalMemo;
}

// ---------------------------------------------------------------------------
// Grille PAR ZONE — courses depuis/vers la ville ou l'aéroport. La zone est
// déterminée par la ville zonée de l'itinéraire (les hubs et Stone Town ne
// sont pas zonés) ; si les deux bouts sont zonés : zone au privé le plus
// cher. « Ville (précision) » est normalisé. Défaut sans ville zonée :
// privé 50 USD · partagé 18 USD · local 17 000 TZS.
// ---------------------------------------------------------------------------

export type ZoneTarifaire = 'nord' | 'nord_est' | 'est' | 'est_sud' | 'est_pointe' | 'sud';

export interface TarifsZone {
  priveUsd: number;
  localTzs: number;
}

/**
 * Prix d'une place en taxi partagé : le TIERS du prix de la course PRIVÉE du
 * même trajet, arrondi au dollar inférieur (miroir exact du serveur). Règle
 * volontairement simple à vérifier de tête : « à trois, c'est le prix du
 * taxi ». Dès la quatrième place, la voiture rapporte plus au chauffeur qu'une
 * course privée — et elle en tient six.
 */
export function tarifPlacePartagee(priveUsd: number): number {
  return Math.floor(priveUsd / 3);
}

// Tarif local UNIFIÉ : 17 000 TZS la place partout (sauf trajets spéciaux,
// ex. Nungwi ↔ Paje 21 000) — miroir de la grille serveur. La place locale a
// pris 1 000 TZS le jour où la commission a pris 2 points, pour que la hausse
// ne sorte pas de la poche du chauffeur (voir pricingService.js).
export const TARIFS_ZONE: Record<ZoneTarifaire, TarifsZone> = {
  nord: { priveUsd: 47, localTzs: 17000 }, // Nungwi, Kendwa
  nord_est: { priveUsd: 42, localTzs: 17000 }, // Matemwe → Chwaka
  est: { priveUsd: 47, localTzs: 17000 }, // Paje, Bwejuu
  est_sud: { priveUsd: 53, localTzs: 17000 }, // Jambiani
  est_pointe: { priveUsd: 53, localTzs: 17000 }, // Michamvi
  sud: { priveUsd: 47, localTzs: 17000 }, // Kizimkazi, Makunduchi, Fumba
};

/** Tarifs appliqués quand aucune ville zonée n'apparaît dans l'itinéraire. */
export const TARIFS_ZONE_DEFAUT: TarifsZone = {
  priveUsd: 53,
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
  dongwe: 'est_pointe',
  kizimkazi: 'sud',
  makunduchi: 'sud',
  mtende: 'sud',
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

/** Tarifs de zone d'un itinéraire (défaut 53 USD, 17 000 TZS). */
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
  nungwi: [-5.7272, 39.2992],
  kendwa: [-5.7516, 39.2912],
  matemwe: [-5.8422, 39.3582],
  'pwani mchangani': [-5.9242, 39.3561],
  kiwengwa: [-5.9901, 39.3761],
  pongwe: [-6.0484, 39.4052],
  uroa: [-6.093, 39.4237],
  chwaka: [-6.1652, 39.4351],
  michamvi: [-6.1445, 39.4955],
  bwejuu: [-6.2372, 39.5323],
  paje: [-6.2667, 39.5341],
  jambiani: [-6.3219, 39.5468],
  makunduchi: [-6.4127, 39.5534],
  mtende: [-6.4547, 39.5276],
  dongwe: [-6.1912, 39.5317],
  kizimkazi: [-6.4544, 39.4728],
  fumba: [-6.3148, 39.2848],
};
const DETOUR_ROUTIER = 1.35;

/**
 * PALIERS DE DISTANCE entre deux villages (hors hubs) — miroir exact de la
 * grille serveur. Un client comprend « c'est le village d'à côté » ou « c'est
 * la traversée de l'île » ; il ne compte pas les kilomètres.
 */
const PALIERS_KM_NET_USD: { maxKm: number; net: number }[] = [
  { maxKm: 12, net: 10 }, // village voisin
  { maxKm: 25, net: 15 }, // un village d'écart
  { maxKm: 35, net: 20 }, // deux villages
  { maxKm: 45, net: 25 },
  { maxKm: 60, net: 35 },
  { maxKm: 80, net: 45 },
  { maxKm: 100, net: 50 },
  { maxKm: Infinity, net: 55 }, // du nord au sud
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

/**
 * TEMPS DE ROUTE ESTIMÉ, en minutes.
 *
 * Douze minutes de manœuvre — sortir du village, traverser Stone Town,
 * trouver l'hôtel — plus une minute par kilomètre. Une simple vitesse
 * moyenne se trompait aux deux bouts : trop optimiste sur l'aéroport ↔ Stone
 * Town (dix kilomètres mais vingt minutes de ville), trop pessimiste sur les
 * longues lignes du nord, où la route est droite et dégagée.
 *
 * Arrondi à cinq minutes : annoncer « 87 min » donnerait une précision qu'on
 * n'a pas.
 */
export function dureeRouteMinutes(km: number): number {
  return Math.max(10, Math.round((12 + km) / 5) * 5);
}

/** Coordonnées d'un lieu de la grille, sinon null. */
// ───────────────────────────── JOZANI ──────────────────────────────────────
// LA SEULE CHOSE QUE L'EMBLÈME PRODUIT DANS LE PRODUIT.
//
// La forêt de Jozani abrite environ la moitié des colobes roux de l'île. La
// route la traverse, et ce sont les voitures qui tuent l'espèce : avant la
// pose de ralentisseurs, un individu écrasé toutes les deux à trois semaines
// — 12 à 17 % du groupe concerné par an. Les collisions ont été divisées par
// deux depuis les ralentisseurs. La vitesse n'est donc pas un détail : c'est
// la variable qui décide.
//
// La traversée se fait sur l'axe Tunguu → Bambi → Kitogani, c'est-à-dire sur
// TOUTE liaison entre la ville (ou l'aéroport) et la côte sud-est. La liste
// est explicite plutôt que géométrique : une droite entre deux villes n'est
// pas une route, et le corridor routier est connu.
const OUEST_JOZANI = ['stone town', 'stone town ferry', 'fumba'];
const SUD_EST_JOZANI = [
  'paje', 'bwejuu', 'dongwe', 'michamvi', 'jambiani', 'makunduchi', 'mtende', 'kizimkazi',
];

/** L'itinéraire traverse-t-il la forêt de Jozani ? */
export function traverseJozani(depart: string, arrivee: string): boolean {
  const cote = (v: string) => {
    const n = normaliserLieu(v);
    if (/a[ée]roport|airport/.test(n)) return 'ouest';
    if (OUEST_JOZANI.includes(n)) return 'ouest';
    if (SUD_EST_JOZANI.includes(n)) return 'sudest';
    return null;
  };
  const a = cote(depart);
  const b = cote(arrivee);
  return !!a && !!b && a !== b;
}

/**
 * LE NOMBRE DE VILLES RÉELLEMENT DESSERVIES.
 *
 * Pas `ORIGINES_RIDES.length` : la liste contient deux libellés pour un seul
 * endroit — Stone Town et son terminal ferry sont à 100 mètres l'un de
 * l'autre. Le chiffre affiché au client se compte donc sur les POSITIONS
 * distinctes, pour qu'il reste vrai le jour où un libellé s'ajoute.
 */
export function nombreVillesDesservies(): number {
  const vues = new Set<string>();
  for (const lieu of ORIGINES_RIDES) {
    const c = coordonneesVille(lieu);
    vues.add(c ? `${c[0].toFixed(2)},${c[1].toFixed(2)}` : lieu.toLowerCase());
  }
  return vues.size;
}

export function coordonneesVille(lieu: string): [number, number] | null {
  return COORDONNEES_VILLES[normaliserLieu(lieu)] ?? null;
}

/** Kilomètres de route estimés entre deux points GPS. */
export function kmEntrePoints(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)) * DETOUR_ROUTIER;
}

/**
 * LE TAXI QUI APPROCHE, en minutes.
 *
 * Ce n'est pas le même calcul qu'une course : le chauffeur est DÉJÀ sur la
 * route, il n'a pas à sortir de chez lui. Deux minutes pour se garer et
 * trouver le client, plus deux minutes par kilomètre — la moyenne réelle sur
 * les routes de l'île, feux de Stone Town et charrettes comprises.
 *
 * Sous un quart d'heure on annonce la minute ; au-delà on arrondit à cinq.
 * Dire « 23 min » quand on ne sait pas à trois minutes près est un mensonge
 * poli ; « 25 min » est une estimation assumée.
 */
export function dureeApprocheMinutes(km: number): number {
  const brut = 2 + km * 2;
  return brut <= 15 ? Math.max(1, Math.round(brut)) : Math.round(brut / 5) * 5;
}

/**
 * MA POSITION → LA VILLE LA PLUS PROCHE.
 *
 * Le client appuie sur « Ma position » : son GPS donne un point, mais la
 * grille tarifaire, elle, ne connaît que des villes. On cherche donc la ville
 * de la liste dont il est le plus près — c'est le nom qui part au serveur, et
 * ses coordonnées exactes suivent séparément (pickup_lat/lng) pour que le
 * chauffeur vienne le chercher au bon endroit, pas au centre du village.
 *
 * Deux lieux sont écartés de la détection : l'aéroport et le terminal ferry.
 * Ce sont des points d'embarquement précis — le ferry est à cent mètres du
 * centre de Stone Town et sortirait devant lui — et un client qui s'y trouve
 * les choisit lui-même dans la liste. À plus de 25 km de toute ville connue
 * (en mer, ou hors de Zanzibar), on renvoie null plutôt qu'un village au
 * hasard : mieux vaut demander au client de choisir.
 */
const RAYON_VILLE_MAX_KM = 25;

export function villeLaPlusProche(lat: number, lng: number): string | null {
  let meilleure: string | null = null;
  let meilleureDistance = Infinity;
  for (const ville of ORIGINES_RIDES) {
    const coord = COORDONNEES_VILLES[normaliserLieu(ville)];
    if (!coord) continue;
    if (/a[ée]roport|airport/i.test(ville) || ville === 'Stone Town Ferry') continue;
    const rad = Math.PI / 180;
    const dLat = (coord[0] - lat) * rad;
    const dLng = (coord[1] - lng) * rad;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat * rad) * Math.cos(coord[0] * rad) * Math.sin(dLng / 2) ** 2;
    const km = 2 * 6371 * Math.asin(Math.sqrt(h));
    if (km < meilleureDistance) {
      meilleureDistance = km;
      meilleure = ville;
    }
  }
  return meilleureDistance <= RAYON_VILLE_MAX_KM ? meilleure : null;
}

// LA CHAÎNE DE LA CÔTE EST : les villages se suivent sur une seule et même
// route. Le prix s'y compte en VILLAGES TRAVERSÉS, pas en kilomètres — c'est
// ainsi que les chauffeurs l'annoncent, et deux voisins peuvent être à 7 comme
// à 14 km sans que la course change de prix. Les paliers au kilomètre s'y
// trompaient : Jambiani ↔ Makunduchi, voisins immédiats, tombaient au prix
// d'un village d'écart pour un kilomètre de trop.
const CHAINE_COTE_EST: string[] = [
  'michamvi',
  'dongwe',
  'bwejuu',
  'paje',
  'jambiani',
  'makunduchi',
  'mtende',
  'kizimkazi',
];
// Écart de 1 village → 10 USD, de 2 → 15, de 3 et plus → 20.
const NETS_CHAINE_USD: number[] = [0, 10, 15, 20];

function netChaineCoteEst(p: string, d: string): number | undefined {
  const i = CHAINE_COTE_EST.indexOf(p);
  const j = CHAINE_COTE_EST.indexOf(d);
  if (i < 0 || j < 0 || i === j) return undefined;
  return NETS_CHAINE_USD[Math.min(Math.abs(i - j), 3)];
}

/** La paire (d, a) tombe-t-elle dans ce groupe, dans un sens ou dans l'autre ? */
function dansLeGroupe(groupe: { a: string[]; b: string[] }, d: string, a: string): boolean {
  return (
    (groupe.a.includes(d) && groupe.b.includes(a)) ||
    (groupe.b.includes(d) && groupe.a.includes(a))
  );
}

/** CE QUE LE CHAUFFEUR GARDE sur une course privée — miroir du serveur. */
export function netChauffeurPriveUsd(depart: string, arrivee: string): number {
  const d = normaliserLieu(depart);
  const a = normaliserLieu(arrivee);
  const villeSt = POINTS_STONE_TOWN.map(normaliserLieu);
  if (
    (HUBS_TARIFAIRES.has(d) && villeSt.includes(a)) ||
    (villeSt.includes(d) && HUBS_TARIFAIRES.has(a))
  ) {
    return NET_AEROPORT_VILLE_USD;
  }
  if (HUBS_TARIFAIRES.has(d) || HUBS_TARIFAIRES.has(a)) {
    // Le hub est un bout, la destination est l'autre.
    const hub = HUBS_TARIFAIRES.has(d) ? d : a;
    const destination = HUBS_TARIFAIRES.has(d) ? a : d;
    const exception = NET_TRANSFERT_PAR_VILLE_USD[destination];
    if (!exception) return NET_TRANSFERT_USD;
    // Stone Town et son ferry partagent le même net ; l'aéroport peut différer.
    const depuisLaVille = POINTS_STONE_TOWN.map(normaliserLieu).includes(hub);
    return !depuisLaVille && exception.aeroport !== undefined
      ? exception.aeroport
      : exception.ville;
  }
  const groupe = GROUPES_NET_USD.find((g) => dansLeGroupe(g, d, a));
  if (groupe) return groupe.net;
  const chaine = netChaineCoteEst(d, a);
  if (chaine !== undefined) return chaine;
  const km = kmEntreVilles(depart, arrivee);
  if (km !== null) {
    return (PALIERS_KM_NET_USD.find((palier) => km <= palier.maxKm) as { net: number }).net;
  }
  return NET_TRANSFERT_USD;
}

/**
 * Prix privé USD d'un itinéraire — miroir exact du serveur : le premier dollar
 * entier qui, commission prélevée, laisse au chauffeur son montant promis.
 */
function baseUsdItineraire(depart: string, arrivee: string): number {
  const net = netChauffeurPriveUsd(depart, arrivee);
  // Commission fixée en dollars : le prix est la somme, pas une division.
  if (estAeroportVille(depart, arrivee)) return net + COMMISSION_AEROPORT_VILLE_USD;
  for (let prix = Math.floor(net); prix <= net * 2 + 10; prix += 1) {
    if (Math.round(prix * (1 - tauxCommissionPrive(prix, depart, arrivee)) * 100) / 100 >= net) {
      return prix;
    }
  }
  return Math.ceil(net / (1 - COMMISSION_PRIVE.petit));
}

export function tarifPriveItineraire(depart: string, arrivee: string): number {
  return baseUsdItineraire(depart, arrivee) + supplementUsd(depart, arrivee);
}

/** CE QUE ZANZIGO GARDE sur ce trajet : la différence, jamais recalculée. */
export function forfaitZanzigoTrajetUsd(depart: string, arrivee: string): number {
  return tarifPriveItineraire(depart, arrivee) - netChauffeurPriveUsd(depart, arrivee);
}

// Hôtel partenaire : même grille USD que les touristes, avec −5 % SUR LES
// COURSES PRIVÉES seulement (appliqué dans tarifTrajetProfil).

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
    // Place en taxi partagé : LE LOCAL PAIE LE MOINS CHER DES DEUX — le tarif
    // plat de la zone (17 000, spéciaux inclus) ou la place touriste
    // convertie en shillings. Miroir de localSeatTzsForRoute côté serveur.
    const specialLocal = itineraire
      ? tarifSpecialLocal(itineraire.depart, itineraire.arrivee)
      : null;
    const plat = specialLocal ?? zone.localTzs;
    if (itineraire) {
      const prive = tarifPriveItineraire(itineraire.depart, itineraire.arrivee);
      const converti = Math.round(tarifPlacePartagee(prive) * TAUX_USD_TZS);
      return { montant: Math.min(plat, converti), devise: 'TZS' };
    }
    return { montant: plat, devise: 'TZS' };
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
  // Grille touriste remisée : résident vérifié −5 %, hôtel partenaire −5 %.
  //
  // LA REMISE PARTENAIRE NE VAUT QUE SUR LES COURSES PRIVÉES — c'est la règle
  // du serveur, et l'application l'ignorait : elle affichait une place de
  // taxi partagé à 18,05 $ là où le serveur en facturait 19. Le partenaire
  // voyait un prix et payait l'autre.
  //
  // La règle elle-même : une place de partagé se vend déjà au plus bas de la
  // grille (4 à 19 USD). La remiser rognerait la part du chauffeur, qui
  // remplit sa voiture place par place. Le partenaire garde son avantage là
  // où il y a de la marge.
  //
  // La remise RÉSIDENT, elle, vaut sur tout : elle est partagée moitié-moitié
  // entre zanziGo et le chauffeur, qui y gagne un client de toute l'année.
  const remise =
    profil === 'resident_verifie'
      ? REMISE_RESIDENT
      : profil === 'hotel' && type === 'private'
        ? REMISE_HOTEL
        : 0;
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
