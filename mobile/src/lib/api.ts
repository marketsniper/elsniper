// Client HTTP typé pour l'API zanziGo — aligné sur backend/src/routes/*.
// Base : EXPO_PUBLIC_API_URL (ex. http://192.168.1.10:3000/api), défaut localhost.
// Les erreurs backend arrivent au format { error: { code, message, details? } }.

import type {
  Chauffeur,
  Colis,
  Paiement,
  ReponseVerifieOtp,
  StatutColis,
  Trajet,
  TypeCompte,
  TypeTrajet,
  Utilisateur,
} from './types';

export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export class ErreurApi extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ErreurApi';
  }
}

// Jeton JWT courant, positionné par le contexte d'auth.
let jetonCourant: string | null = null;

export function definirJeton(jeton: string | null): void {
  jetonCourant = jeton;
}

interface OptionsRequete {
  methode?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  corps?: unknown;
  formData?: FormData;
}

async function requete<T>(chemin: string, options: OptionsRequete = {}): Promise<T> {
  const entetes: Record<string, string> = {};
  if (jetonCourant) entetes.Authorization = `Bearer ${jetonCourant}`;

  let body: string | FormData | undefined;
  if (options.formData) {
    // Ne pas fixer Content-Type : fetch pose lui-même la frontière multipart.
    body = options.formData;
  } else if (options.corps !== undefined) {
    entetes['Content-Type'] = 'application/json';
    body = JSON.stringify(options.corps);
  }

  let reponse: Response;
  try {
    reponse = await fetch(`${BASE_URL}${chemin}`, {
      method: options.methode ?? 'GET',
      headers: entetes,
      body,
    });
  } catch {
    throw new ErreurApi(
      0,
      'RESEAU',
      `Impossible de joindre le serveur (${BASE_URL}). Vérifiez EXPO_PUBLIC_API_URL et que le backend tourne.`
    );
  }

  const texte = await reponse.text();
  let donnees: unknown = null;
  if (texte) {
    try {
      donnees = JSON.parse(texte);
    } catch {
      // Réponse non JSON : on la laisse nulle.
    }
  }

  if (!reponse.ok) {
    const erreur = (donnees as { error?: { code?: string; message?: string; details?: unknown } } | null)
      ?.error;
    throw new ErreurApi(
      reponse.status,
      erreur?.code ?? 'ERREUR_INCONNUE',
      erreur?.message ?? `Erreur HTTP ${reponse.status}`,
      erreur?.details
    );
  }

  return donnees as T;
}

/** Déballe une liste éventuellement enveloppée ({ trips: [...] }, { data: [...] }…). */
function commeListe<T>(donnees: unknown, ...cles: string[]): T[] {
  if (Array.isArray(donnees)) return donnees as T[];
  if (donnees && typeof donnees === 'object') {
    for (const cle of [...cles, 'data', 'items', 'results']) {
      const valeur = (donnees as Record<string, unknown>)[cle];
      if (Array.isArray(valeur)) return valeur as T[];
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Auth (backend/src/routes/auth.js)
// ---------------------------------------------------------------------------

/** POST /auth/request-otp {phone} → {sent, expiresInMinutes, devCode? (hors prod)}. */
export async function demanderOtp(phone: string): Promise<{ devCode?: string }> {
  const donnees = await requete<Record<string, unknown>>('/auth/request-otp', {
    methode: 'POST',
    corps: { phone },
  });
  const devCode = donnees?.devCode ?? donnees?.dev_code;
  return {
    devCode:
      typeof devCode === 'string' || typeof devCode === 'number' ? String(devCode) : undefined,
  };
}

/** POST /auth/verify-otp {phone, code} → {token, user, driver, hotel}. */
export async function verifierOtp(phone: string, code: string): Promise<ReponseVerifieOtp> {
  return requete<ReponseVerifieOtp>('/auth/verify-otp', {
    methode: 'POST',
    corps: { phone, code },
  });
}

// ---------------------------------------------------------------------------
// Profils (backend/src/routes/users.js)
// ---------------------------------------------------------------------------

export interface CreationUtilisateur {
  fullName: string;
  phone: string; // doit être le téléphone vérifié par OTP (celui du jeton)
  email?: string;
  accountType: TypeCompte;
  /** Requis pour un compte résident (validation du document par l'équipe). */
  idDocumentUrl?: string;
}

/**
 * POST /users {fullName, phone, email?, accountType, idDocumentUrl?} → ligne users.
 * Touriste : currency USD, vérifié d'office. Résident : TZS, verification_status
 * 'pending' jusqu'à validation du document par l'équipe.
 */
export async function creerUtilisateur(donnees: CreationUtilisateur): Promise<Utilisateur> {
  return requete<Utilisateur>('/users', { methode: 'POST', corps: donnees });
}

/** GET /users/:id — profil du titulaire (rafraîchit le statut de vérification). */
export async function obtenirUtilisateur(id: string): Promise<Utilisateur> {
  return requete<Utilisateur>(`/users/${id}`);
}

// ---------------------------------------------------------------------------
// Trajets (backend/src/routes/trips.js)
// ---------------------------------------------------------------------------

export interface CreationTrajet {
  userId: string;
  tripType: TypeTrajet;
  pickupLocation: string;
  dropoffLocation: string;
  scheduledAt?: string; // ISO 8601 avec fuseau
}

/**
 * POST /trips → ligne trips : price/commission/currency figés côté serveur
 * selon la grille (pricingService), + whatsapp_link vers l'équipe.
 * shared_local est refusé (403 resident_not_verified) si le compte n'est pas
 * un résident vérifié.
 */
export async function creerTrajet(donnees: CreationTrajet): Promise<Trajet> {
  return requete<Trajet>('/trips', { methode: 'POST', corps: donnees });
}

/** GET /trips?userId= → historique du client (réservé à lui-même). */
export async function listerTrajets(userId: string): Promise<Trajet[]> {
  const query = new URLSearchParams({ userId });
  const reponse = await requete<unknown>(`/trips?${query.toString()}`);
  return commeListe<Trajet>(reponse, 'trips');
}

/** GET /trips/:id — accessible au client, au chauffeur assigné ou à l'équipe. */
export async function obtenirTrajet(id: string): Promise<Trajet> {
  return requete<Trajet>(`/trips/${id}`);
}

/**
 * POST /trips/:id/payment → ligne payments {id, payment_link}.
 * Possible uniquement quand status = 'driver_confirmed' (sinon 409 invalid_status).
 */
export async function payerTrajet(id: string): Promise<Paiement> {
  return requete<Paiement>(`/trips/${id}/payment`, { methode: 'POST' });
}

/**
 * POST /payments/:id/confirm — en mode stub (dev sans clés Pesapal), simule le
 * webhook de confirmation : trip → 'paid', colis → 'paid'.
 */
export async function confirmerPaiement(paiementId: string): Promise<Paiement> {
  return requete<Paiement>(`/payments/${paiementId}/confirm`, { methode: 'POST' });
}

/**
 * POST /trips/:id/rating {rating: 1-5, comment?} — uniquement quand la course
 * est 'completed', une seule fois (sinon 409 already_rated).
 */
export async function noterTrajet(id: string, note: number, commentaire?: string): Promise<Trajet> {
  return requete<Trajet>(`/trips/${id}/rating`, {
    methode: 'POST',
    corps: { rating: note, comment: commentaire || undefined },
  });
}

// Côté chauffeur : le QR scanné doit être celui du véhicule du chauffeur
// assigné à CETTE course (sinon 403 qr_mismatch).
/** PATCH /trips/:id/start {qrCode} — course 'paid' → 'in_progress'. */
export async function demarrerCourse(id: string, qrCode: string): Promise<Trajet> {
  return requete<Trajet>(`/trips/${id}/start`, { methode: 'PATCH', corps: { qrCode } });
}

/** PATCH /trips/:id/complete {qrCode} — course 'in_progress' → 'completed'. */
export async function terminerCourse(id: string, qrCode: string): Promise<Trajet> {
  return requete<Trajet>(`/trips/${id}/complete`, { methode: 'PATCH', corps: { qrCode } });
}

// ---------------------------------------------------------------------------
// Colis (backend/src/routes/packages.js)
// ---------------------------------------------------------------------------

export interface CreationColis {
  senderType: 'user' | 'hotel';
  senderUserId?: string; // requis quand senderType = 'user' (user.id du jeton)
  senderHotelId?: string; // requis quand senderType = 'hotel'
  pickupLocation: string;
  dropoffLocation: string;
  recipientName: string;
  recipientPhone: string; // format international +255…
  description?: string;
}

/** POST /packages → ligne packages (qr_code PKG-…, price/currency figés, whatsapp_link). */
export async function creerColis(donnees: CreationColis): Promise<Colis> {
  return requete<Colis>('/packages', { methode: 'POST', corps: donnees });
}

/** GET /packages/:id — expéditeur, chauffeur assigné ou équipe. */
export async function obtenirColis(id: string): Promise<Colis> {
  return requete<Colis>(`/packages/${id}`);
}

/** GET /hotels/:id/packages — colis expédiés par un hôtel. */
export async function listerColisHotel(hotelId: string): Promise<Colis[]> {
  const reponse = await requete<unknown>(`/hotels/${hotelId}/packages`);
  return commeListe<Colis>(reponse, 'packages');
}

/**
 * POST /packages/:id/payment → ligne payments {id, payment_link}.
 * Possible uniquement quand status = 'created'.
 */
export async function payerColis(id: string): Promise<Paiement> {
  return requete<Paiement>(`/packages/${id}/payment`, { methode: 'POST' });
}

/** GET /packages/by-qr/:qrCode — scan d'un QR colis PKG-… (chauffeurs et équipe). */
export async function colisParQr(qrCode: string): Promise<Colis> {
  return requete<Colis>(`/packages/by-qr/${encodeURIComponent(qrCode)}`);
}

// PATCH pickup/deliver : qrCode = QR de CE colis (403 qr_mismatch sinon) et
// photoUrl = photo de preuve obligatoire (prise via expo-image-picker puis
// téléversée sur POST /uploads).
/** PATCH /packages/:id/pickup — colis 'paid' → 'picked_up'. */
export async function recupererColis(
  id: string,
  donnees: { qrCode: string; photoUrl: string }
): Promise<Colis> {
  return requete<Colis>(`/packages/${id}/pickup`, { methode: 'PATCH', corps: donnees });
}

/** PATCH /packages/:id/deliver — colis 'picked_up' → 'delivered'. */
export async function livrerColis(
  id: string,
  donnees: { qrCode: string; photoUrl: string }
): Promise<Colis> {
  return requete<Colis>(`/packages/${id}/deliver`, { methode: 'PATCH', corps: donnees });
}

/** Prochain geste chauffeur attendu pour un colis (ou null si rien à faire). */
export function prochaineActionColis(statut: StatutColis | undefined): 'pickup' | 'deliver' | null {
  if (statut === 'paid') return 'pickup';
  if (statut === 'picked_up') return 'deliver';
  return null;
}

// ---------------------------------------------------------------------------
// Upload (backend/src/routes/uploads.js)
// ---------------------------------------------------------------------------

/** POST /uploads (multipart, champ `file`) → {url, size, mimeType}. */
export async function televerser(uri: string): Promise<{ url: string }> {
  const nom = uri.split('/').pop() ?? 'photo.jpg';
  const extension = nom.includes('.') ? nom.split('.').pop()!.toLowerCase() : 'jpg';
  const mime =
    extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
  const formData = new FormData();
  // React Native accepte { uri, name, type } comme valeur multipart.
  formData.append('file', { uri, name: nom, type: mime } as unknown as Blob);
  const reponse = await requete<Record<string, unknown>>('/uploads', {
    methode: 'POST',
    formData,
  });
  const url = reponse?.url;
  if (typeof url !== 'string') {
    throw new ErreurApi(0, 'UPLOAD_INVALIDE', "Le serveur n'a pas renvoyé d'URL de fichier.");
  }
  return { url };
}

// Regroupement pratique pour l'import : `import { api } from '@/lib/api'`.
export const api = {
  demanderOtp,
  verifierOtp,
  creerUtilisateur,
  obtenirUtilisateur,
  creerTrajet,
  listerTrajets,
  obtenirTrajet,
  payerTrajet,
  confirmerPaiement,
  noterTrajet,
  demarrerCourse,
  terminerCourse,
  creerColis,
  obtenirColis,
  listerColisHotel,
  payerColis,
  colisParQr,
  recupererColis,
  livrerColis,
  televerser,
};

export type { Chauffeur, Colis, Paiement, Trajet, Utilisateur };
