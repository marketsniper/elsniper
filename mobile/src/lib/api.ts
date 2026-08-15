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
  ReservationPlace,
  Ride,
  StatutColis,
  StatutTrajet,
  TailleColis,
  Trajet,
  TypeCompte,
  TypePartenaire,
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
  /**
   * Envoyer la clé équipe (X-Admin-Key) avec CETTE requête. Réservé aux
   * fonctions du tableau de bord équipe : la clé stockée sur le téléphone ne
   * doit JAMAIS accompagner les écrans clients, sinon un touriste testé sur
   * le téléphone de l'équipe verrait les prix locaux en shillings et ses
   * confirmations passeraient avec les pouvoirs de l'équipe.
   */
  admin?: boolean;
}

// Le serveur gratuit (Render) s'endort après 15 min sans visite : la première
// requête le réveille, ce qui peut prendre 30-60 s. Les GET (chargements
// d'écran) sont réessayés automatiquement pendant ce réveil ; les écritures
// (POST/PATCH) ne sont jamais rejouées pour ne pas créer de doublons.
const DELAIS_REVEIL_MS = [4000, 10000, 20000];
const TIMEOUT_REQUETE_MS = 30000;
// Envoi d'une pièce jointe : une photo sur un réseau mobile zanzibarite peut
// mettre bien plus de 30 secondes à partir. Avec l'ancien délai, l'envoi était
// coupé en route et le client croyait qu'il « ne pouvait pas joindre » sa
// pièce — alors qu'il fallait seulement laisser le temps au téléversement.
const TIMEOUT_ENVOI_MS = 180000;
const MESSAGE_RESEAU =
  'Le serveur se réveille (il se met en veille quand personne ne l\'utilise). ' +
  'Réessayez dans quelques secondes.';

const attendre = (ms: number) => new Promise((resoudre) => setTimeout(resoudre, ms));

async function fetchAvecTimeout(
  url: string,
  init: RequestInit,
  delai = TIMEOUT_REQUETE_MS
): Promise<Response> {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), delai);
  try {
    return await fetch(url, { ...init, signal: controleur.signal });
  } finally {
    clearTimeout(minuteur);
  }
}

// Dernier signe de vie du serveur : toute réponse HTTP (même une erreur)
// prouve qu'il est éveillé. En dessous de 4 minutes, inutile de re-vérifier
// (il ne s'endort qu'après 15 minutes sans visite).
let dernierSigneDeVie = 0;
const SERVEUR_CONSIDERE_EVEILLE_MS = 4 * 60 * 1000;

/**
 * Réveille le serveur gratuit AVANT une écriture : les POST/PATCH ne sont
 * jamais rejoués (pas de doublons), donc ils doivent partir sur un serveur
 * déjà debout. GET /health avec patience (le réveil prend 30-60 s) ; appelé
 * aussi au lancement de l'app pour que tout soit prêt dès le premier geste.
 */
export async function reveillerServeur(): Promise<void> {
  if (Date.now() - dernierSigneDeVie < SERVEUR_CONSIDERE_EVEILLE_MS) return;
  for (let essai = 0; ; essai += 1) {
    try {
      const reponse = await fetchAvecTimeout(`${BASE_URL}/health`, { method: 'GET' });
      if (reponse.ok) {
        dernierSigneDeVie = Date.now();
        return;
      }
    } catch {
      // Réseau coupé ou réveil en cours : on insiste selon le calendrier.
    }
    if (essai >= DELAIS_REVEIL_MS.length) return; // la vraie requête tentera sa chance
    await attendre(DELAIS_REVEIL_MS[essai]);
  }
}

async function requete<T>(chemin: string, options: OptionsRequete = {}): Promise<T> {
  const entetes: Record<string, string> = {};
  if (jetonCourant) entetes.Authorization = `Bearer ${jetonCourant}`;
  // La clé équipe n'accompagne QUE les requêtes du tableau de bord.
  if (options.admin && cleEquipeCourante) entetes['X-Admin-Key'] = cleEquipeCourante;

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

  // Écriture (jamais rejouée) : s'assurer d'abord que le serveur est debout,
  // sinon le premier « Créer mon compte » de la journée échoue pendant le
  // réveil et le client croit que la touche ne marche pas.
  if (!relanceable) await reveillerServeur();

  // Une pièce jointe a droit à beaucoup plus de temps qu'un simple appel.
  const delai = options.formData ? TIMEOUT_ENVOI_MS : TIMEOUT_REQUETE_MS;

  let reponse: Response | null = null;
  for (let essai = 0; ; essai += 1) {
    try {
      reponse = await fetchAvecTimeout(`${BASE_URL}${chemin}`, init, delai);
      // 502/503/504 : c'est le proxy Render qui répond, pas notre serveur —
      // ça ne compte pas comme signe de vie.
      if (![502, 503, 504].includes(reponse.status)) dernierSigneDeVie = Date.now();
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

/**
 * POST /auth/request-otp {phone, channel?, email?} → {sent, expiresInMinutes,
 * channel?, emailMasked?, devCode? (mode pilote)}. channel 'email' : le code
 * part par e-mail (touristes à l'étranger sans réception SMS) — pour un
 * compte existant, toujours vers l'e-mail enregistré.
 */
export async function demanderOtp(
  phone: string,
  options?: { channel?: 'sms' | 'email'; email?: string }
): Promise<{ devCode?: string; channel?: string; emailMasked?: string }> {
  const donnees = await requete<Record<string, unknown>>('/auth/request-otp', {
    methode: 'POST',
    corps: {
      phone,
      ...(options?.channel === 'email'
        ? { channel: 'email', ...(options.email ? { email: options.email } : {}) }
        : {}),
    },
  });
  const devCode = donnees?.devCode ?? donnees?.dev_code;
  return {
    devCode:
      typeof devCode === 'string' || typeof devCode === 'number' ? String(devCode) : undefined,
    channel: typeof donnees?.channel === 'string' ? donnees.channel : undefined,
    emailMasked: typeof donnees?.emailMasked === 'string' ? donnees.emailMasked : undefined,
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
 * IDENTITÉ E-MAIL (touristes/visiteurs) : POST /auth/request-otp {email}
 * seul — l'e-mail EST l'identifiant du compte, le code y est envoyé.
 * Les locaux et chauffeurs restent sur l'identité téléphone.
 */
export async function demanderOtpParEmail(
  email: string
): Promise<{ devCode?: string; emailMasked?: string }> {
  const donnees = await requete<Record<string, unknown>>('/auth/request-otp', {
    methode: 'POST',
    corps: { email },
  });
  const devCode = donnees?.devCode ?? donnees?.dev_code;
  return {
    devCode:
      typeof devCode === 'string' || typeof devCode === 'number' ? String(devCode) : undefined,
    emailMasked: typeof donnees?.emailMasked === 'string' ? donnees.emailMasked : undefined,
  };
}

/**
 * VISITEURS (touristes/résidents) : numéro + MOT DE PASSE choisi par le
 * client — aucun code SMS ni e-mail à recevoir, ça marche partout.
 * L'inscription émet un jeton (le profil se crée juste après) ; la
 * connexion renvoie le compte. Jetons sans pouvoirs chauffeur.
 */
/**
 * CLIENTS : création de compte avec un IDENTIFIANT choisi + mot de passe
 * (POST /auth/register). Ni indicatif ni numéro à saisir — le profil
 * (nom, type de compte, documents) suit immédiatement.
 */
export async function creerCompteClient(
  username: string,
  password: string
): Promise<ReponseVerifieOtp> {
  return requete<ReponseVerifieOtp>('/auth/register', {
    methode: 'POST',
    corps: { username, password },
  });
}

/**
 * CLIENTS : connexion (POST /auth/login). L'identifiant accepté est le nom
 * choisi à l'inscription OU, pour les comptes créés avant, le numéro de
 * téléphone — personne n'est laissé dehors.
 */
export async function connexionClient(
  identifier: string,
  password: string
): Promise<ReponseVerifieOtp> {
  return requete<ReponseVerifieOtp>('/auth/login', {
    methode: 'POST',
    corps: { identifier, password },
  });
}

export async function inscriptionVisiteur(
  phone: string,
  password: string
): Promise<ReponseVerifieOtp> {
  return requete<ReponseVerifieOtp>('/auth/visitor-register', {
    methode: 'POST',
    corps: { phone, password },
  });
}

export async function connexionVisiteur(
  phone: string,
  password: string
): Promise<ReponseVerifieOtp> {
  return requete<ReponseVerifieOtp>('/auth/visitor-login', {
    methode: 'POST',
    corps: { phone, password },
  });
}

/**
 * CHAUFFEURS : numéro + mot de passe aussi. L'inscription émet le jeton
 * « candidat chauffeur » (la candidature avec documents suit) ; la
 * connexion ouvre l'espace chauffeur.
 */
export async function inscriptionChauffeur(
  phone: string,
  password: string
): Promise<ReponseVerifieOtp> {
  return requete<ReponseVerifieOtp>('/auth/driver-register', {
    methode: 'POST',
    corps: { phone, password },
  });
}

export async function connexionChauffeur(
  phone: string,
  password: string
): Promise<ReponseVerifieOtp> {
  return requete<ReponseVerifieOtp>('/auth/driver-login', {
    methode: 'POST',
    corps: { phone, password },
  });
}

/** POST /auth/verify-otp {email, code} → {token, user} (identité e-mail). */
export async function verifierOtpParEmail(
  email: string,
  code: string
): Promise<ReponseVerifieOtp> {
  return requete<ReponseVerifieOtp>('/auth/verify-otp', {
    methode: 'POST',
    corps: { email, code },
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
  /** Identité téléphone : requis (= jeton). Identité e-mail : contact
   * WhatsApp optionnel, non vérifié. */
  phone?: string;
  email?: string;
  accountType: TypeCompte;
  /** Requis pour un compte résident (validation du document par l'équipe). */
  idDocumentUrl?: string;
  /** Parrainage : code ZG-XXXXXX d'un client existant (optionnel). */
  referralCode?: string;
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
  /** 'hotel' (défaut) ou 'restaurant' — même compte, autre vocabulaire. */
  partnerType?: TypePartenaire;
  name: string;
  contactName: string;
  email: string;
  password: string; // min 8 caractères
  phone: string; // numéro WhatsApp de l'établissement, format +255…
  zone: string;
  address?: string;
}

/**
 * POST /hotels (public, sans OTP) — création d'un compte établissement
 * partenaire, hôtel ou restaurant :
 * {partnerType?, name, contactName, email, password, phone, zone, address?}
 * → 201 {hotel}.
 * 409 duplicate si e-mail ou téléphone déjà utilisés. Enchaîner ensuite
 * connexionHotel(email, password) pour obtenir le jeton.
 */
export async function creerHotel(donnees: CreationHotel): Promise<Hotel> {
  return requete<Hotel>('/hotels', { methode: 'POST', corps: donnees });
}

/**
 * GET /hotels/:id — fiche hôtel. `equipe` fait signer la requête avec la clé
 * de l'équipe : c'est ce qui permet au tableau de bord d'ouvrir la fiche
 * complète d'un partenaire (l'hôtel, lui, n'ouvre que la sienne).
 */
export async function obtenirHotel(id: string, equipe = false): Promise<Hotel> {
  return requete<Hotel>(`/hotels/${id}`, { admin: equipe });
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
  /** Transfert aéroport : n° de vol (l'équipe vérifie l'heure réelle). */
  flightNumber?: string;
  /** Course privée : aller-retour avec attente (prix ×1,8 côté serveur). */
  roundTrip?: boolean;
  babySeat?: boolean;
  bulkyLuggage?: boolean;
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
  flightNumber?: string;
  roundTrip?: boolean;
  babySeat?: boolean;
  bulkyLuggage?: boolean;
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
export async function listerTrajetsHotel(hotelId: string, equipe = false): Promise<Trajet[]> {
  const query = new URLSearchParams({ hotelId });
  const reponse = await requete<unknown>(`/trips?${query.toString()}`, { admin: equipe });
  return commeListe<Trajet>(reponse, 'trips');
}

/** GET /trips/:id — accessible au client, au chauffeur assigné ou à l'équipe. */
export async function obtenirTrajet(id: string): Promise<Trajet> {
  try {
    return await requete<Trajet>(`/trips/${id}`);
  } catch (e) {
    // L'équipe ouvre la fiche d'un trajet qui n'est pas le sien (depuis le
    // tableau de bord) : le jeton client se voit refuser l'accès, on
    // recommence avec la clé de l'équipe. On ne l'envoie QUE dans ce cas —
    // jamais sur un écran client, pour ne pas mélanger les pouvoirs.
    if (e instanceof ErreurApi && (e.status === 403 || e.status === 401)) {
      return await requete<Trajet>(`/trips/${id}`, { admin: true });
    }
    throw e;
  }
}

/**
 * POST /trips/:id/payment → ligne payments {id, payment_link}.
 * Possible uniquement quand status = 'driver_confirmed' (sinon 409 invalid_status).
 */
export async function payerTrajet(id: string): Promise<Paiement> {
  return requete<Paiement>(`/trips/${id}/payment`, { methode: 'POST' });
}

/**
 * POST /trips/:id/payment {method:'credit'} — l'hôtel paie avec son crédit
 * prépayé : débit immédiat, course 'paid' dans la foulée (409
 * insufficient_credit si le solde ne suffit pas).
 */
export async function payerTrajetAvecCredit(id: string): Promise<Paiement> {
  return requete<Paiement>(`/trips/${id}/payment`, {
    methode: 'POST',
    corps: { method: 'credit' },
  });
}

/**
 * POST /payments/:id/confirm — en mode stub (dev sans clés Pesapal), simule le
 * webhook de confirmation : trip → 'paid', colis → 'paid'.
 */
export async function confirmerPaiement(paiementId: string): Promise<Paiement> {
  return requete<Paiement>(`/payments/${paiementId}/confirm`, { methode: 'POST' });
}

/**
 * POST /payments/:id/confirm avec la clé équipe — bouton « Marquer payé » du
 * tableau de bord (seule l'équipe valide les paiements manuels WhatsApp).
 */
export async function confirmerPaiementEquipe(paiementId: string): Promise<Paiement> {
  return requete<Paiement>(`/payments/${paiementId}/confirm`, { methode: 'POST', admin: true });
}

/**
 * POST /trips/:id/cancel — annulation par le réservateur. Course non payée :
 * libre. Course payée avec départ planifié : barème 24/48 h (remboursement
 * 100 % à +48 h, 50 % entre 24 h et 48 h, refusée à moins de 24 h). La
 * réponse porte alors refund {amount, currency, rate} + whatsapp_link.
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

// ---------------------------------------------------------------------------
// Liste d'attente du taxi partagé (backend/src/routes/rides.js /attente)
// ---------------------------------------------------------------------------

/** Demande en liste d'attente (GET /rides/attente). */
export interface AttentePartage {
  id: string;
  origin: string;
  destination: string;
  desired_date?: string | null;
  seats: number;
  matched_at?: string | null;
  full_name?: string;
  phone?: string | null;
  email?: string | null;
  [cle: string]: unknown;
}

/** POST /rides/attente — laisse sa demande quand aucun taxi partagé n'existe. */
export async function creerAttentePartage(donnees: {
  origin: string;
  destination: string;
  desiredDate?: string;
  seats?: number;
}): Promise<AttentePartage> {
  return requete<AttentePartage>('/rides/attente', { methode: 'POST', corps: donnees });
}

/** GET /rides/attente — ses demandes (client) ou toutes (équipe, admin:true). */
export async function listerAttentesPartage(admin = false): Promise<AttentePartage[]> {
  const reponse = await requete<unknown>('/rides/attente', admin ? { admin: true } : {});
  return commeListe<AttentePartage>(reponse);
}

/** POST /rides/attente/:id/cancel — retire la demande. */
export async function annulerAttentePartage(id: string): Promise<AttentePartage> {
  return requete<AttentePartage>(`/rides/attente/${id}/cancel`, { methode: 'POST' });
}

// ---------------------------------------------------------------------------
// Documents chauffeurs + sauvegarde (équipe)
// ---------------------------------------------------------------------------

/** PATCH /drivers/:id/documents — dates d'expiration permis/assurance (équipe). */
export async function majDocumentsChauffeur(
  id: string,
  dates: { licenseExpiresOn?: string | null; insuranceExpiresOn?: string | null }
): Promise<Chauffeur> {
  return requete<Chauffeur>(`/drivers/${id}/documents`, {
    methode: 'PATCH',
    corps: dates,
    admin: true,
  });
}

/** GET /stats/sauvegarde — export JSON complet de la base (équipe). */
export async function telechargerSauvegarde(): Promise<unknown> {
  return requete<unknown>('/stats/sauvegarde', { admin: true });
}

// Côté chauffeur : une simple touche, pas de QR à scanner — la position GPS
// déjà partagée en continu (envoyerPositionChauffeur) reste la preuve de
// terrain.
/** PATCH /trips/:id/start — course 'paid' → 'in_progress'. */
export async function demarrerCourse(id: string): Promise<Trajet> {
  return requete<Trajet>(`/trips/${id}/start`, { methode: 'PATCH', corps: {} });
}

/** PATCH /trips/:id/complete — course 'in_progress' → 'completed'. */
export async function terminerCourse(id: string): Promise<Trajet> {
  return requete<Trajet>(`/trips/${id}/complete`, { methode: 'PATCH', corps: {} });
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
  /** Téléphone de l'expéditeur pour la ramasse (défaut : celui du compte). */
  senderPhone?: string;
  description?: string;
  /** Heure de ramassage souhaitée (ISO) — absente = dès que possible. */
  pickupAt?: string;
  /** Hôtel : consommer un bon fidélité « colis offert » (envoi gratuit). */
  useVoucher?: boolean;
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
export async function listerColisHotel(hotelId: string, equipe = false): Promise<Colis[]> {
  const reponse = await requete<unknown>(`/hotels/${hotelId}/packages`, { admin: equipe });
  return commeListe<Colis>(reponse, 'packages');
}

/**
 * POST /packages/:id/payment → ligne payments {id, payment_link}.
 * Possible uniquement quand status = 'created'.
 */
export async function payerColis(id: string): Promise<Paiement> {
  return requete<Paiement>(`/packages/${id}/payment`, { methode: 'POST' });
}

/** POST /packages/:id/payment {method:'credit'} — payé avec le crédit hôtel. */
export async function payerColisAvecCredit(id: string): Promise<Paiement> {
  return requete<Paiement>(`/packages/${id}/payment`, {
    methode: 'POST',
    corps: { method: 'credit' },
  });
}

// ---------------------------------------------------------------------------
// Fidélité + crédit prépayé des hôtels partenaires
// ---------------------------------------------------------------------------

export interface BonFidelite {
  id: string;
  status: 'available' | 'used';
  earned_at?: string;
  used_at?: string | null;
}

export interface FideliteHotel {
  completed_trips: number;
  trips_per_voucher: number;
  /** Valeur d'un bon converti en crédit (USD). */
  voucher_credit_usd?: number;
  progress: number;
  vouchers_available: number;
  vouchers_used: number;
  vouchers: BonFidelite[];
}

/** GET /hotels/:id/fidelite — carte de fidélité (attribue les bons dus). */
export async function fideliteHotel(hotelId: string, equipe = false): Promise<FideliteHotel> {
  return requete<FideliteHotel>(`/hotels/${hotelId}/fidelite`, { admin: equipe });
}

export interface TransactionCredit {
  id: string;
  amount: number | string;
  currency: string;
  reason: string;
  reference?: string | null;
  created_at?: string;
}

export interface CreditHotel {
  balance: number;
  currency: string;
  transactions: TransactionCredit[];
}

/** GET /hotels/:id/credit — solde prépayé + derniers mouvements. */
export async function creditHotel(hotelId: string, equipe = false): Promise<CreditHotel> {
  return requete<CreditHotel>(`/hotels/${hotelId}/credit`, { admin: equipe });
}

/**
 * POST /hotels/:id/vouchers/convertir — transforme UN bon fidélité en crédit
 * prépayé (10 USD). 409 no_voucher si aucun bon disponible.
 */
export async function convertirBonEnCredit(
  hotelId: string
): Promise<{ balance: number; credited: number }> {
  return requete<{ balance: number; credited: number }>(
    `/hotels/${hotelId}/vouchers/convertir`,
    { methode: 'POST', corps: {} }
  );
}

/** POST /hotels/:id/credit — l'ÉQUIPE crédite/corrige le solde d'un hôtel. */
export async function crediterHotel(
  hotelId: string,
  amount: number,
  note?: string
): Promise<{ balance: number }> {
  return requete<{ balance: number }>(`/hotels/${hotelId}/credit`, {
    methode: 'POST',
    corps: { amount, ...(note ? { note } : {}) },
    admin: true,
  });
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

/**
 * GET /rides/reservations — les places de taxi partagé réservées par le
 * client connecté (prix dans SA devise, payé ou non, annulable ou non).
 */
export async function mesReservationsPlaces(): Promise<ReservationPlace[]> {
  const reponse = await requete<unknown>('/rides/reservations');
  return commeListe<ReservationPlace>(reponse, 'reservations');
}

/** Réponse d'annulation d'une place (remboursement éventuel + alerte équipe). */
export interface AnnulationPlace {
  id: string;
  cancelled: boolean;
  refund: { amount: number; currency: string; rate: number } | null;
  whatsapp_link?: string;
}

/**
 * POST /rides/reservations/:id/cancel — annule la place du client. Barème :
 * remboursement 100 % à 48 h ou plus du départ, 50 % entre 24 h et 48 h,
 * refusé à moins de 24 h (409 cancellation_too_late). Les places retournent
 * automatiquement sur l'annonce du chauffeur.
 */
export async function annulerReservationPlace(id: string): Promise<AnnulationPlace> {
  return requete<AnnulationPlace>(`/rides/reservations/${id}/cancel`, { methode: 'POST' });
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
  /** Places de taxi partagé payées. */
  places?: number;
  gains: Record<string, number>;
}

/**
 * GET /drivers/:id/stats — courses terminées, colis livrés et gains NETS
 * (commission déduite) sur aujourd'hui / 7 jours / 30 jours.
 */
export async function statsChauffeur(driverId: string, equipe = false): Promise<StatsChauffeur> {
  return requete<StatsChauffeur>(`/drivers/${driverId}/stats`, { admin: equipe });
}

/** GET /drivers/:id — fiche chauffeur (lui-même, ou l'équipe avec `equipe`). */
export async function obtenirChauffeur(driverId: string, equipe = false): Promise<Chauffeur> {
  return requete<Chauffeur>(`/drivers/${driverId}`, { admin: equipe });
}

/**
 * POST /drivers/:id/mot-de-passe — l'ÉQUIPE remplace le mot de passe d'un
 * chauffeur qui a oublié le sien (les mots de passe sont chiffrés à sens
 * unique : on ne peut pas relire l'ancien, seulement en poser un nouveau).
 */
export async function definirMotDePasseChauffeur(
  driverId: string,
  motDePasse: string
): Promise<{ ok: boolean }> {
  return requete<{ ok: boolean }>(`/drivers/${driverId}/mot-de-passe`, {
    methode: 'POST',
    corps: { password: motDePasse },
    admin: true,
  });
}

/**
 * POST /drivers/:id/radier — RADIATION DÉFINITIVE (équipe) : la fiche est
 * close et sort de toutes les listes, mais le numéro redevient libre — le
 * chauffeur peut redéposer une candidature complète plus tard.
 */
export async function radierDefinitivement(driverId: string): Promise<Chauffeur> {
  return requete<Chauffeur>(`/drivers/${driverId}/radier`, { methode: 'POST', admin: true });
}

/**
 * GET /drivers/:id/trips — les courses assignées au chauffeur par l'équipe
 * (les plus récentes d'abord). C'est la source de l'onglet « Courses ».
 */
export async function listerCoursesChauffeur(driverId: string, equipe = false): Promise<Trajet[]> {
  const reponse = await requete<unknown>(`/drivers/${driverId}/trips`, { admin: equipe });
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
export async function listerCoursesEquipe(statut?: StatutTrajet): Promise<Trajet[]> {
  // Sans statut : TOUTES les courses (limite 200) — le tableau équipe trie
  // lui-même « à traiter » et « courses passées » (rangées par date).
  const reponse = await requete<unknown>(statut ? `/trips?status=${statut}` : '/trips', {
    admin: true,
  });
  return commeListe<Trajet>(reponse, 'trips');
}

/** GET /payments?status=pending — paiements en attente + contexte (équipe). */
export async function listerPaiementsEquipe(): Promise<PaiementEquipe[]> {
  const reponse = await requete<unknown>('/payments?status=pending', { admin: true });
  return commeListe<PaiementEquipe>(reponse, 'payments');
}

/** GET /payments?status=confirmed — derniers paiements REÇUS (équipe). */
export async function listerPaiementsRecus(): Promise<PaiementEquipe[]> {
  const reponse = await requete<unknown>('/payments?status=confirmed', { admin: true });
  return commeListe<PaiementEquipe>(reponse, 'payments');
}

/**
 * GET /payments/remboursements — remboursements à VERSER (annulations
 * clients, barème 24/48 h) : montant dû + contexte (équipe).
 */
export async function listerRemboursementsEquipe(): Promise<PaiementEquipe[]> {
  const reponse = await requete<unknown>('/payments/remboursements', { admin: true });
  return commeListe<PaiementEquipe>(reponse, 'payments');
}

/** POST /payments/:id/rembourse — remboursement versé, la ligne est soldée. */
export async function marquerRembourse(id: string): Promise<Paiement> {
  return requete<Paiement>(`/payments/${id}/rembourse`, { methode: 'POST', admin: true });
}

/** GET /drivers — chauffeurs vérifiés (recherche d'assignation, équipe). */
export async function listerChauffeursVerifies(): Promise<Chauffeur[]> {
  const reponse = await requete<unknown>('/drivers', { admin: true });
  return commeListe<Chauffeur>(reponse, 'drivers');
}

/** GET /drivers?verificationStatus=pending — candidatures à traiter (équipe). */
export async function listerCandidaturesChauffeurs(): Promise<Chauffeur[]> {
  const reponse = await requete<unknown>('/drivers?verificationStatus=pending', { admin: true });
  return commeListe<Chauffeur>(reponse, 'drivers');
}

/** GET /users?verificationStatus=pending — documents clients à valider (équipe). */
export async function listerClientsEnAttente(): Promise<Utilisateur[]> {
  const reponse = await requete<unknown>('/users?verificationStatus=pending', { admin: true });
  return commeListe<Utilisateur>(reponse, 'users');
}

// ---------------------------------------------------------------------------
// Alertes instantanées (backend/src/routes/notifications.js)
// ---------------------------------------------------------------------------

/** GET /notifications/cle — clé publique nécessaire pour créer l'abonnement. */
export async function clePush(): Promise<{ publicKey: string | null; actif: boolean }> {
  return requete<{ publicKey: string | null; actif: boolean }>('/notifications/cle');
}

export interface AbonnementPush {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  label?: string;
}

/** POST /notifications/abonner — ce téléphone recevra les alertes (équipe). */
export async function abonnerAlertes(abonnement: AbonnementPush): Promise<unknown> {
  return requete<unknown>('/notifications/abonner', {
    methode: 'POST',
    corps: abonnement,
    admin: true,
  });
}

/** POST /notifications/desabonner — ce téléphone ne sera plus alerté. */
export async function desabonnerAlertes(endpoint: string): Promise<unknown> {
  return requete<unknown>('/notifications/desabonner', {
    methode: 'POST',
    corps: { endpoint },
    admin: true,
  });
}

/**
 * PATCH /trips/:id/pickup-position — le client partage son point de
 * rendez-vous EXACT. Le chauffeur assigné le voit alors sur une carte et
 * peut lancer son GPS dessus. Réservé au réservateur de la course.
 */
export async function partagerPointRendezVous(
  trajetId: string,
  lat: number,
  lng: number
): Promise<Trajet> {
  return requete<Trajet>(`/trips/${trajetId}/pickup-position`, {
    methode: 'PATCH',
    corps: { lat, lng },
  });
}

/** Où en est mon taxi : dernière position connue du chauffeur assigné. */
export interface SuiviChauffeur {
  driver_name: string | null;
  vehicle_plate: string | null;
  /** null : chauffeur confirmé mais pas encore repéré par son téléphone. */
  lat: number | null;
  lng: number | null;
  updated_at: string | null;
}

export async function positionDeMonChauffeur(trajetId: string): Promise<SuiviChauffeur> {
  return requete<SuiviChauffeur>(`/trips/${trajetId}/driver-position`);
}

/** POST /notifications/test — alerte d'essai, pour vérifier et chronométrer. */
export async function testerAlertes(): Promise<{ envoyes: number }> {
  return requete<{ envoyes: number }>('/notifications/test', { methode: 'POST', admin: true });
}

// ----- Alertes CHAUFFEUR -----------------------------------------------
// Le chauffeur s'abonne avec SON jeton (pas la clé équipe) : il ne recevra
// que ses propres courses, jamais les alertes internes de l'équipe.

export async function abonnerAlertesChauffeur(abonnement: AbonnementPush): Promise<unknown> {
  return requete<unknown>('/notifications/chauffeur/abonner', {
    methode: 'POST',
    corps: abonnement,
  });
}

export async function desabonnerAlertesChauffeur(endpoint: string): Promise<unknown> {
  return requete<unknown>('/notifications/chauffeur/desabonner', {
    methode: 'POST',
    corps: { endpoint },
  });
}

export async function testerAlertesChauffeur(): Promise<{ envoyes: number }> {
  return requete<{ envoyes: number }>('/notifications/chauffeur/test', { methode: 'POST' });
}

/** GET /hotels?verificationStatus=pending — comptes hôtels à vérifier (équipe). */
export async function listerHotelsEnAttente(): Promise<Hotel[]> {
  const reponse = await requete<unknown>('/hotels?verificationStatus=pending', { admin: true });
  return commeListe<Hotel>(reponse, 'hotels');
}

/** GET /hotels?verificationStatus=verified — les hôtels partenaires actifs (équipe). */
export async function listerHotelsVerifies(): Promise<Hotel[]> {
  const reponse = await requete<unknown>('/hotels?verificationStatus=verified', { admin: true });
  return commeListe<Hotel>(reponse, 'hotels');
}

/** PATCH /hotels/:id/verify — valider (ou bloquer) un compte hôtel (équipe). */
export async function verifierHotel(
  id: string,
  statut: 'verified' | 'rejected'
): Promise<Hotel> {
  return requete<Hotel>(`/hotels/${id}/verify`, { methode: 'PATCH', corps: { status: statut }, admin: true });
}

/** Fenêtre de chiffre d'affaires (GET /stats) : CA encaissé et net zanziGo. */
export interface FenetreCa {
  courses: number;
  colis: number;
  /** Places de taxi partagé payées. */
  places?: number;
  /** CA encaissé (prix payés) par devise. */
  ca: Record<string, number>;
  /** Net zanziGo (commissions) par devise. */
  gains: Record<string, number>;
}

/** Compteurs d'abonnés + chiffre d'affaires du tableau de bord (GET /stats, équipe). */
export interface StatsAbonnes {
  tourists: number;
  residents: number;
  locals: number;
  /** Touristes + résidents (visiteurs USD). */
  clients: number;
  hotels: number;
  hotels_verified: number;
  drivers_verified: number;
  revenue: { today: FenetreCa; week: FenetreCa; month: FenetreCa };
}
export async function statsAbonnes(): Promise<StatsAbonnes> {
  return requete<StatsAbonnes>('/stats', { admin: true });
}

/** PATCH /trips/:id/assign-driver — l'équipe confirme un chauffeur. */
export async function assignerChauffeur(tripId: string, driverId: string): Promise<Trajet> {
  return requete<Trajet>(`/trips/${tripId}/assign-driver`, {
    methode: 'PATCH',
    corps: { driverId },
    admin: true,
  });
}

/** PATCH /drivers/:id/verify — valider/refuser une candidature (équipe). */
export async function verifierChauffeur(
  id: string,
  statut: 'verified' | 'rejected'
): Promise<Chauffeur> {
  return requete<Chauffeur>(`/drivers/${id}/verify`, { methode: 'PATCH', corps: { status: statut }, admin: true });
}

/** PATCH /users/:id/verify — valider/refuser un document client (équipe). */
export async function verifierClient(
  id: string,
  statut: 'verified' | 'rejected'
): Promise<Utilisateur> {
  return requete<Utilisateur>(`/users/${id}/verify`, { methode: 'PATCH', corps: { status: statut }, admin: true });
}

/**
 * GET /users?q=&accountTypes= — recherche de profils clients par nom ou
 * téléphone (équipe), filtrée par types de comptes (ex. 'tourist,resident').
 */
export async function rechercherProfils(
  q: string,
  accountTypes: string
): Promise<Utilisateur[]> {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (accountTypes) params.set('accountTypes', accountTypes);
  const reponse = await requete<unknown>(`/users?${params.toString()}`, { admin: true });
  return commeListe<Utilisateur>(reponse, 'users');
}

/** PATCH /users/:id/ban — radier (banned=true) ou réintégrer un profil (équipe). */
export async function bannirClient(id: string, banned: boolean): Promise<Utilisateur> {
  return requete<Utilisateur>(`/users/${id}/ban`, { methode: 'PATCH', corps: { banned }, admin: true });
}

// ---------------------------------------------------------------------------
// Upload (backend/src/routes/uploads.js)
// ---------------------------------------------------------------------------

/** POST /uploads (multipart, champ `file`) → {url, size, mimeType}. */
export async function televerser(uri: string): Promise<{ url: string }> {
  const brut = uri.split('/').pop() ?? 'photo.jpg';
  const extension = brut.includes('.') ? brut.split('.').pop()!.toLowerCase() : 'jpg';
  const nom = brut.includes('.') ? brut : `${brut}.jpg`;
  const mime =
    extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
  const formData = new FormData();
  if (uri.startsWith('blob:') || uri.startsWith('data:')) {
    // VERSION WEB (PWA) : le sélecteur d'images donne une URI blob:/data: —
    // l'objet { uri, name, type } de React Native n'y est PAS un fichier
    // (le serveur répondait « Champ "file" manquant ») : on récupère le
    // vrai contenu et on l'envoie comme un fichier de navigateur.
    const contenu = await (await fetch(uri)).blob();
    formData.append('file', new File([contenu], nom, { type: contenu.type || mime }));
  } else {
    // Application native : React Native accepte { uri, name, type }.
    formData.append('file', { uri, name: nom, type: mime } as unknown as Blob);
  }
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
  demanderOtpParEmail,
  creerCompteClient,
  connexionClient,
  inscriptionVisiteur,
  connexionVisiteur,
  inscriptionChauffeur,
  connexionChauffeur,
  verifierOtp,
  verifierOtpParEmail,
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
  payerTrajetAvecCredit,
  payerColisAvecCredit,
  fideliteHotel,
  creditHotel,
  crediterHotel,
  convertirBonEnCredit,
  annulerTrajet,
  confirmerPaiement,
  confirmerPaiementEquipe,
  noterTrajet,
  creerAttentePartage,
  listerAttentesPartage,
  annulerAttentePartage,
  partagerPointRendezVous,
  positionDeMonChauffeur,
  clePush,
  abonnerAlertes,
  desabonnerAlertes,
  testerAlertes,
  abonnerAlertesChauffeur,
  desabonnerAlertesChauffeur,
  testerAlertesChauffeur,
  majDocumentsChauffeur,
  obtenirChauffeur,
  definirMotDePasseChauffeur,
  radierDefinitivement,
  telechargerSauvegarde,
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
  listerPaiementsRecus,
  listerRemboursementsEquipe,
  marquerRembourse,
  mesReservationsPlaces,
  annulerReservationPlace,
  listerChauffeursVerifies,
  listerCandidaturesChauffeurs,
  listerClientsEnAttente,
  listerHotelsEnAttente,
  listerHotelsVerifies,
  statsAbonnes,
  assignerChauffeur,
  verifierChauffeur,
  verifierClient,
  verifierHotel,
  rechercherProfils,
  bannirClient,
  televerser,
};

export type { Chauffeur, Colis, Hotel, Paiement, Trajet, Utilisateur };
