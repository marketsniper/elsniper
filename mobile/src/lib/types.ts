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

export interface Hotel {
  id: string;
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
}

/** Session authentifiée persistée dans SecureStore. */
export interface SessionAuth {
  token: string;
  phone: string;
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
  shared_tourist: 'Navette partagée',
  shared_local: 'Navette locale',
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
export const HUBS_RIDES: string[] = ['Aéroport (AAKIA)', 'Stone Town Ferry'];
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
export const TRAJETS_SPECIAUX_PRIVE_USD: { villes: [string, string]; prix: number }[] = [
  { villes: ['Nungwi', 'Paje'], prix: 65 },
];

/** Tarif privé spécial USD pour un itinéraire donné, ou null si aucun. */
export function tarifSpecialPrive(depart: string, arrivee: string): number | null {
  const a = depart.trim().toLowerCase();
  const b = arrivee.trim().toLowerCase();
  if (!a || !b) return null;
  for (const special of TRAJETS_SPECIAUX_PRIVE_USD) {
    const [v1, v2] = [special.villes[0].toLowerCase(), special.villes[1].toLowerCase()];
    if ((a === v1 && b === v2) || (a === v2 && b === v1)) return special.prix;
  }
  return null;
}

/** Remise résident (documents de résidence validés) sur tous les prix USD. */
export const REMISE_RESIDENT = 0.1;
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

export type ZoneTarifaire = 'nord' | 'nord_est' | 'est' | 'est_pointe' | 'sud';

export interface TarifsZone {
  priveUsd: number;
  partageUsd: number;
  localTzs: number;
}

export const TARIFS_ZONE: Record<ZoneTarifaire, TarifsZone> = {
  nord: { priveUsd: 50, partageUsd: 18, localTzs: 15000 }, // Nungwi, Kendwa
  nord_est: { priveUsd: 45, partageUsd: 16, localTzs: 12000 }, // Matemwe → Chwaka
  est: { priveUsd: 50, partageUsd: 15, localTzs: 12000 }, // Paje, Jambiani, Bwejuu
  est_pointe: { priveUsd: 50, partageUsd: 18, localTzs: 15000 }, // Michamvi
  sud: { priveUsd: 45, partageUsd: 14, localTzs: 12000 }, // Kizimkazi, Makunduchi, Fumba
};

/** Tarifs appliqués quand aucune ville zonée n'apparaît dans l'itinéraire. */
export const TARIFS_ZONE_DEFAUT: TarifsZone = {
  priveUsd: 50,
  partageUsd: 18,
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
  jambiani: 'est',
  bwejuu: 'est',
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
    return { montant: zone.localTzs, devise: 'TZS' };
  }
  let plein: number | undefined;
  if (type === 'private') {
    const special = itineraire
      ? tarifSpecialPrive(itineraire.depart, itineraire.arrivee)
      : null;
    plein = special ?? zone.priveUsd;
  } else if (type === 'shared_tourist' || type === 'shared_local') {
    plein = zone.partageUsd;
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
