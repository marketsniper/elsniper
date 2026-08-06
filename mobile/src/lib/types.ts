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

export type StatutColis = 'created' | 'paid' | 'picked_up' | 'delivered';

export type TypeCompte = 'tourist' | 'resident';
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

/** Ligne payments renvoyée par POST /trips/:id/payment et /packages/:id/payment. */
export interface Paiement {
  id: string;
  payment_link?: string;
  [cle: string]: unknown;
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
  shared_tourist: 'Navette partagée (touristes)',
  shared_local: 'Partagée locale',
  posted_return: 'Retour affiché',
};

/** Libellés français des statuts de colis (enum package_status). */
export const LIBELLES_STATUT_COLIS: Record<StatutColis, string> = {
  created: 'Créé',
  paid: 'Payé',
  picked_up: 'Ramassé',
  delivered: 'Livré',
};

/** Étapes d'un colis, dans l'ordre. */
export const ETAPES_COLIS: StatutColis[] = ['created', 'paid', 'picked_up', 'delivered'];

/** Devise du compte utilisateur ('USD' touriste, 'TZS' résident). */
export function deviseUtilisateur(utilisateur: Utilisateur | null | undefined): Devise {
  return champ<Devise>(utilisateur, 'currency', 'devise') === 'TZS' ? 'TZS' : 'USD';
}

/** Vrai si le compte est résident ET vérifié par l'équipe (tarif local). */
export function residentVerifie(utilisateur: Utilisateur | null | undefined): boolean {
  return (
    champ<TypeCompte>(utilisateur, 'account_type', 'accountType') === 'resident' &&
    champ<StatutVerification>(utilisateur, 'verification_status', 'verificationStatus') ===
      'verified'
  );
}

/** Formate un montant dans une devise (1 500 TZS / 35 USD). */
export function formaterMontant(montant: number | string, devise: string): string {
  const nombre = typeof montant === 'string' ? Number(montant) : montant;
  if (Number.isFinite(nombre)) {
    return `${nombre.toLocaleString('fr-FR')} ${devise}`.trim();
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
// Tarifs plats par type de course : le prix officiel est TOUJOURS calculé et
// FIGÉ côté serveur à la création ; cette grille sert uniquement à afficher
// le prix au client avant de réserver.
// ---------------------------------------------------------------------------

export const TARIFS_TRAJET: Record<TypeTrajet, Partial<Record<Devise, number>>> = {
  private: { USD: 35, TZS: 90000 },
  shared_tourist: { USD: 15, TZS: 40000 },
  // Tarif local : réservé aux résidents vérifiés, toujours en TZS.
  shared_local: { TZS: 8000 },
  posted_return: { USD: 25, TZS: 65000 },
};

export const TARIFS_COLIS: Record<Devise, number> = { USD: 10, TZS: 25000 };

/** Tarif d'une course pour une devise, ou null si indisponible dans cette devise. */
export function tarifTrajet(type: TypeTrajet, devise: Devise): number | null {
  return TARIFS_TRAJET[type][devise] ?? null;
}

/** Tarif d'un envoi de colis pour une devise. */
export function tarifColis(devise: Devise): number {
  return TARIFS_COLIS[devise];
}
