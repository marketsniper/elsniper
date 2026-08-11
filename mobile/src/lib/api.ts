// Client HTTP typé pour l'API zanziGo — aligné sur backend/src/routes/*.
// Base : EXPO_PUBLIC_API_URL (ex. http://192.168.1.10:3000/api), défaut localhost.
// Les erreurs backend arrivent au format { error: { code, message, details? } }.

import type {
  Chauffeur,
  Colis,
  Hotel,
  Paiement,
  PaiementEquipe,
  ReponseVerifieOtp,
  Ride,
  StatutColis,
  StatutTrajet,
  TailleColis,
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

// Clé équipe (header X-Admin-Key) — activée depuis l'écran Équipe. Le serveur
// laisse passer la clé seule, sans jeton client.
let cleEquipeCourante: string | null = null;

export function definirCleEquipe(cle: string | null): void {
  cleEquipeCourante = cle;
}

interface OptionsRequete {
  methode?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  corps?: unknown;
  formData?: FormData;
}

// Le serveur gratuit (Render) s'endort après 15 min sans visite : la première
// requête le réveille, ce qui peut prendre 30-60 s. Les GET (chargements
// d'écran) sont réessayés automatiquement pendant ce réveil ; les écritures
// (POST/PATCH) ne sont jamais rejouées pour ne pas créer de doublons.
const DELAIS_REVEIL_MS = [4000, 10000, 20000];
const TIMEOUT_REQUETE_MS = 30000;
const MESSAGE_RESEAU =
  'Le serveur se réveille (il se met en veille quand personne ne l\'utilise). ' +
  'Réessayez dans quelques secondes.';

const attendre = (ms: number) => new Promise((resoudre) => setTimeout(resoudre, ms));

async function fetchAvecTimeout(url: string, init: RequestInit): Promise<Response> {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), TIMEOUT_REQUETE_MS);
  try {
    return await fetch(url, { ...init, signal: controleur.signal });
  } finally {
    clearTimeout(minuteur);
  }
}

async function requete<T>(chemin: string, options: OptionsRequete = {}): Promise<T> {
  const entetes: Record<string, string> = {};
  if (jetonCourant) entetes.Authorization = `Bearer ${jetonCourant}`;
  if (cleEquipeCourante) entetes['X-Admin-Key'] = cleEquipeCourante;

  let body: string | FormData | undefined;
  if (options.formData) {
    // Ne pas fixer Content-Type : fetch pose lui-même la frontière multipart.
    body = options.formData;
  } else if (options.corps !== undefined) {
    entetes['Content-Type'] = 'application/json';
    body = JSON.stringify(options.corps);
  }

  const methode = options.methode ?? 'GET';
  const init: RequestInit = { method: methode, headers: entetes, body };
  const relanceable = methode === 'GET';

  let reponse: Response | null = null;
  for (let essai = 0; ; essai += 1) {
    try {
      reponse = await fetchAvecTimeout(`${BASE_URL}${chemin}`, init);
      // 502/503/504 : le proxy répond mais le serveur dort encore.
      if (relanceable && [502, 503, 504].includes(reponse.status) && essai < DELAIS_REVEIL_MS.length) {
        await attendre(DELAIS_REVEIL_MS[essai]);
        continue;
      }
      break;
    } catch {
      if (relanceable && essai < DELAIS_REVEIL_MS.length) {
        await attendre(DELAIS_REVEIL_MS[essai]);
        continue;
      }
      throw new ErreurApi(0, 'RESEAU', MESSAGE_RESEAU);
    }
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

/**
 * POST /auth/hotel-login {email, password} → {token, hotel}.
 * Connexion des hôtels partenaires (401 invalid_credentials si erreur) —
 * les sessions hôtel passent par ici, plus par l'OTP.
 */
export async function connexionHotel(
  email: string,
  password: string
): Promise<{ token: string; hotel: Hotel }> {
  return requete<{ token: string; hotel: Hotel }>('/auth/hotel-login', {
    methode: 'POST',
    corps: { email, password },
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
// Hôtels partenaires (backend/src/routes/hotels.js)
// ---------------------------------------------------------------------------

export interface CreationHotel {
  name: string;
  contactName: string;
  email: string;
  password: string; // min 8 caractères
  phone: string; // numéro WhatsApp de l'établissement, format +255…
  zone: string;
  address?: string;
}

/**
 * POST /hotels (public, sans OTP) — création d'un compte hôtel partenaire :
 * {name, contactName, email, password, phone, zone, address?} → 201 {hotel}.
 * 409 duplicate si e-mail ou téléphone déjà utilisés. Enchaîner ensuite
 * connexionHotel(email, password) pour obtenir le jeton.
 */
export async function creerHotel(donnees: CreationHotel): Promise<Hotel> {
  return requete<Hotel>('/hotels', { methode: 'POST', corps: donnees });
}

/** GET /hotels/:id — fiche hôtel (rafraîchit le statut de vérification). */
export async function obtenirHotel(id: string): Promise<Hotel> {
  return requete<Hotel>(`/hotels/${id}`);
}

// ---------------------------------------------------------------------------
// Chauffeurs (backend/src/routes/drivers.js)
// ---------------------------------------------------------------------------

export interface CreationChauffeur {
  fullName: string;
  phone: string; // doit être le téléphone vérifié par OTP (celui du jeton)
  licenseNumber: string;
  vehiclePlate: string;
  vehicleModel?: string;
  zone: string;
  /** URL du permis de conduire téléversé sur POST /uploads. */
  licenseDocumentUrl: string;
  /** URL de l'assurance du véhicule téléversée sur POST /uploads. */
  insuranceDocumentUrl: string;
  /** URL de la photo du véhicule téléversée sur POST /uploads. */
  vehiclePhotoUrl: string;
  /** Devenu optionnel côté serveur — l'app ne l'envoie plus. */
  idDocumentUrl?: string;
}

/**
 * POST /drivers — candidature Taxi Partner (avec documents). Le compte reste
 * verification_status 'pending' jusqu'à validation manuelle par l'équipe.
 */
export async function creerChauffeur(donnees: CreationChauffeur): Promise<Chauffeur> {
  return requete<Chauffeur>('/drivers', { methode: 'POST', corps: donnees });
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

export interface CreationTrajetHotel {
  hotelId: string;
  clientName: string;
  clientPhone: string;
  tripType: TypeTrajet;
  pickupLocation: string;
  dropoffLocation: string;
  scheduledAt?: string; // ISO 8601 avec fuseau
}

/**
 * POST /trips (mode hôtel) — l'hôtel réserve un taxi POUR SON CLIENT :
 * {hotelId, clientName, clientPhone, tripType, pickupLocation,
 * dropoffLocation, scheduledAt?} — pas de userId. Tarifs en TZS.
 */
export async function creerTrajetHotel(donnees: CreationTrajetHotel): Promise<Trajet> {
  return requete<Trajet>('/trips', { methode: 'POST', corps: donnees });
}

/** GET /trips?hotelId= → historique des réservations d'un hôtel partenaire. */
export async function listerTrajetsHotel(hotelId: string): Promise<Trajet[]> {
  const query = new URLSearchParams({ hotelId });
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
 * POST /trips/:id/cancel — annulation par le réservateur tant que la course
 * n'est pas payée (sinon 409 : passer par l'équipe sur WhatsApp).
 */
export async function annulerTrajet(id: string): Promise<Trajet> {
  return requete<Trajet>(`/trips/${id}/cancel`, { methode: 'POST' });
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
// Trajets partagés postés par les chauffeurs (backend /rides)
// ---------------------------------------------------------------------------

export interface CreationRide {
  origin: string;
  destination: string;
  departureAt: string; // ISO 8601 avec offset, dans le futur
  seatsTotal: number; // 1 à 8
  // Le prix par place est fixé par la grille zanziGo côté serveur. // TZS
  notes?: string;
}

/**
 * POST /rides — un chauffeur VALIDÉ publie un trajet partagé → 201.
 * Erreurs : 400 departure_in_past, 403 driver_not_verified.
 */
export async function creerRide(donnees: CreationRide): Promise<Ride> {
  return requete<Ride>('/rides', { methode: 'POST', corps: donnees });
}

/** GET /rides → trajets ouverts futurs, triés par heure de départ. */
export async function listerRides(): Promise<Ride[]> {
  const reponse = await requete<unknown>('/rides');
  return commeListe<Ride>(reponse, 'rides');
}

/**
 * GET /rides/locations (publique) → {origins, destinations} : listes fermées
 * des lieux acceptés au POST /rides (validation serveur stricte).
 */
export async function lieuxRides(): Promise<{ origins: string[]; destinations: string[] }> {
  const reponse = await requete<Record<string, unknown>>('/rides/locations');
  const origins = Array.isArray(reponse?.origins) ? (reponse.origins as string[]) : [];
  const destinations = Array.isArray(reponse?.destinations)
    ? (reponse.destinations as string[])
    : [];
  return { origins, destinations };
}

/** GET /rides/mine → trajets publiés par le chauffeur connecté (tous statuts). */
export async function listerMesRides(): Promise<Ride[]> {
  const reponse = await requete<unknown>('/rides/mine');
  return commeListe<Ride>(reponse, 'rides');
}

/** PATCH /rides/:id {seatsAvailable} et/ou {status:'closed'|'cancelled'}. */
export async function modifierRide(
  id: string,
  donnees: { seatsAvailable?: number; status?: 'closed' | 'cancelled' }
): Promise<Ride> {
  return requete<Ride>(`/rides/${id}`, { methode: 'PATCH', corps: donnees });
}

// ---------------------------------------------------------------------------
// Colis (backend/src/routes/packages.js)
// ---------------------------------------------------------------------------

export interface CreationColis {
  senderType: 'user' | 'hotel';
  senderUserId?: string; // requis quand senderType = 'user' (user.id du jeton)
  senderHotelId?: string; // requis quand senderType = 'hotel'
  /** Taille du colis — REQUISE par l'API (détermine le prix). */
  size: TailleColis;
  pickupLocation: string;
  dropoffLocation: string;
  recipientName: string;
  recipientPhone: string; // format international +255…
  description?: string;
  /** Heure de ramassage souhaitée (ISO) — absente = dès que possible. */
  pickupAt?: string;
}

/** POST /packages → ligne packages (qr_code PKG-…, price/currency figés, whatsapp_link). */
export async function creerColis(donnees: CreationColis): Promise<Colis> {
  return requete<Colis>('/packages', { methode: 'POST', corps: donnees });
}

/** GET /packages/:id — expéditeur, chauffeur assigné ou équipe. */
export async function obtenirColis(id: string): Promise<Colis> {
  return requete<Colis>(`/packages/${id}`);
}

/**
 * POST /packages/:id/claim — « Je prends la livraison » : réserve le colis
 * au chauffeur connecté (409 package_already_taken si un autre chauffeur a
 * été plus rapide). Réponse avec whatsapp_link d'information équipe.
 */
export async function prendreColis(id: string): Promise<Colis> {
  return requete<Colis>(`/packages/${id}/claim`, { methode: 'POST' });
}

/** GET /packages/mine — les colis réservés/en livraison du chauffeur. */
export async function listerMesColisChauffeur(): Promise<Colis[]> {
  const reponse = await requete<unknown>('/packages/mine');
  return commeListe<Colis>(reponse, 'packages');
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

/**
 * GET /packages — la « bourse aux colis » du mode chauffeur : colis payés en
 * attente de ramassage (hôtels partenaires et clients), sans QR ni
 * coordonnées du destinataire avant le scan de ramassage.
 */
export async function listerColisARamasser(): Promise<Colis[]> {
  const reponse = await requete<unknown>('/packages');
  return commeListe<Colis>(reponse, 'packages');
}

/**
 * POST /packages/:id/cancel — annulation par l'expéditeur tant que le colis
 * n'est pas payé (sinon 409 : passer par l'équipe sur WhatsApp).
 */
export async function annulerColis(id: string): Promise<Colis> {
  return requete<Colis>(`/packages/${id}/cancel`, { methode: 'POST' });
}

/**
 * POST /rides/:id/book {seats} — réserve des places sur un trajet partagé :
 * décompte automatique côté serveur (409 not_enough_seats / ride_closed),
 * renvoie le trajet à jour + whatsapp_link de notification pour l'équipe.
 */
export async function reserverPlacesRide(id: string, seats: number): Promise<Ride> {
  return requete<Ride>(`/rides/${id}/book`, { methode: 'POST', corps: { seats } });
}

/** Compteur de gains d'un chauffeur (GET /drivers/:id/stats). */
export interface StatsChauffeur {
  today: FenetreStats;
  week: FenetreStats;
  month: FenetreStats;
}
export interface FenetreStats {
  courses: number;
  colis: number;
  gains: Record<string, number>;
}

/**
 * GET /drivers/:id/stats — courses terminées, colis livrés et gains NETS
 * (commission déduite) sur aujourd'hui / 7 jours / 30 jours.
 */
export async function statsChauffeur(driverId: string): Promise<StatsChauffeur> {
  return requete<StatsChauffeur>(`/drivers/${driverId}/stats`);
}

/**
 * GET /drivers/:id/trips — les courses assignées au chauffeur par l'équipe
 * (les plus récentes d'abord). C'est la source de l'onglet « Courses ».
 */
export async function listerCoursesChauffeur(driverId: string): Promise<Trajet[]> {
  const reponse = await requete<unknown>(`/drivers/${driverId}/trips`);
  return commeListe<Trajet>(reponse, 'trips');
}

/** Position GPS d'un chauffeur (table driver_positions). */
export interface PositionChauffeur {
  driver_id: string;
  lat: number;
  lng: number;
  updated_at: string;
}

/**
 * PATCH /drivers/:id/location {lat, lng} — le chauffeur envoie sa position
 * (écrasée à chaque envoi, aucune trace d'historique).
 */
export async function envoyerPositionChauffeur(
  driverId: string,
  lat: number,
  lng: number
): Promise<PositionChauffeur> {
  return requete<PositionChauffeur>(`/drivers/${driverId}/location`, {
    methode: 'PATCH',
    corps: { lat, lng },
  });
}

/**
 * GET /packages/:id/position — position du chauffeur pendant la livraison
 * (409 not_in_transit hors livraison, 404 position_unavailable si le
 * chauffeur n'a pas encore partagé).
 */
export async function positionColis(id: string): Promise<PositionChauffeur> {
  return requete<PositionChauffeur>(`/packages/${id}/position`);
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
// Tableau de bord équipe (clé X-Admin-Key requise — definirCleEquipe)
// ---------------------------------------------------------------------------

/** GET /trips?status= — toutes les courses d'un statut donné (équipe). */
export async function listerCoursesEquipe(statut: StatutTrajet): Promise<Trajet[]> {
  const reponse = await requete<unknown>(`/trips?status=${statut}`);
  return commeListe<Trajet>(reponse, 'trips');
}

/** GET /payments?status=pending — paiements en attente + contexte (équipe). */
export async function listerPaiementsEquipe(): Promise<PaiementEquipe[]> {
  const reponse = await requete<unknown>('/payments?status=pending');
  return commeListe<PaiementEquipe>(reponse, 'payments');
}

/** GET /drivers — chauffeurs vérifiés (recherche d'assignation, équipe). */
export async function listerChauffeursVerifies(): Promise<Chauffeur[]> {
  const reponse = await requete<unknown>('/drivers');
  return commeListe<Chauffeur>(reponse, 'drivers');
}

/** GET /drivers?verificationStatus=pending — candidatures à traiter (équipe). */
export async function listerCandidaturesChauffeurs(): Promise<Chauffeur[]> {
  const reponse = await requete<unknown>('/drivers?verificationStatus=pending');
  return commeListe<Chauffeur>(reponse, 'drivers');
}

/** GET /users?verificationStatus=pending — documents clients à valider (équipe). */
export async function listerClientsEnAttente(): Promise<Utilisateur[]> {
  const reponse = await requete<unknown>('/users?verificationStatus=pending');
  return commeListe<Utilisateur>(reponse, 'users');
}

/** GET /hotels?verificationStatus=pending — comptes hôtels à vérifier (équipe). */
export async function listerHotelsEnAttente(): Promise<Hotel[]> {
  const reponse = await requete<unknown>('/hotels?verificationStatus=pending');
  return commeListe<Hotel>(reponse, 'hotels');
}

/** PATCH /hotels/:id/verify — valider (ou bloquer) un compte hôtel (équipe). */
export async function verifierHotel(
  id: string,
  statut: 'verified' | 'rejected'
): Promise<Hotel> {
  return requete<Hotel>(`/hotels/${id}/verify`, { methode: 'PATCH', corps: { status: statut } });
}

/** Compteurs d'abonnés du tableau de bord (GET /stats, équipe). */
export interface StatsAbonnes {
  tourists: number;
  residents: number;
  locals: number;
  /** Touristes + résidents (visiteurs USD). */
  clients: number;
  hotels: number;
  hotels_verified: number;
  drivers_verified: number;
}
export async function statsAbonnes(): Promise<StatsAbonnes> {
  return requete<StatsAbonnes>('/stats');
}

/** PATCH /trips/:id/assign-driver — l'équipe confirme un chauffeur. */
export async function assignerChauffeur(tripId: string, driverId: string): Promise<Trajet> {
  return requete<Trajet>(`/trips/${tripId}/assign-driver`, {
    methode: 'PATCH',
    corps: { driverId },
  });
}

/** PATCH /drivers/:id/verify — valider/refuser une candidature (équipe). */
export async function verifierChauffeur(
  id: string,
  statut: 'verified' | 'rejected'
): Promise<Chauffeur> {
  return requete<Chauffeur>(`/drivers/${id}/verify`, { methode: 'PATCH', corps: { status: statut } });
}

/** PATCH /users/:id/verify — valider/refuser un document client (équipe). */
export async function verifierClient(
  id: string,
  statut: 'verified' | 'rejected'
): Promise<Utilisateur> {
  return requete<Utilisateur>(`/users/${id}/verify`, { methode: 'PATCH', corps: { status: statut } });
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
  connexionHotel,
  creerUtilisateur,
  obtenirUtilisateur,
  creerHotel,
  obtenirHotel,
  creerChauffeur,
  creerTrajet,
  creerTrajetHotel,
  listerTrajets,
  listerTrajetsHotel,
  obtenirTrajet,
  payerTrajet,
  annulerTrajet,
  confirmerPaiement,
  noterTrajet,
  demarrerCourse,
  terminerCourse,
  creerRide,
  listerRides,
  listerMesRides,
  modifierRide,
  reserverPlacesRide,
  lieuxRides,
  creerColis,
  obtenirColis,
  prendreColis,
  listerMesColisChauffeur,
  listerColisHotel,
  listerColisARamasser,
  payerColis,
  annulerColis,
  envoyerPositionChauffeur,
  statsChauffeur,
  listerCoursesChauffeur,
  positionColis,
  colisParQr,
  recupererColis,
  livrerColis,
  listerCoursesEquipe,
  listerPaiementsEquipe,
  listerChauffeursVerifies,
  listerCandidaturesChauffeurs,
  listerClientsEnAttente,
  listerHotelsEnAttente,
  statsAbonnes,
  assignerChauffeur,
  verifierChauffeur,
  verifierClient,
  verifierHotel,
  televerser,
};

export type { Chauffeur, Colis, Hotel, Paiement, Trajet, Utilisateur };
