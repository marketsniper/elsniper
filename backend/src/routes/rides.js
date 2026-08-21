// Trajets partagés postés par les chauffeurs.
//
// Autorisations :
//  - POST /            : chauffeur VALIDÉ uniquement (publie son trajet)
//  - GET /             : tout compte authentifié (liste des trajets à venir)
//  - GET /mine         : le chauffeur (ses propres trajets, passés inclus)
//  - PATCH /:id        : le chauffeur propriétaire ou l'équipe
//                        (places restantes, clôture, annulation)
// La réservation d'une place passe par l'équipe (lien WhatsApp par trajet),
// fidèle au principe MVP « humain dans la boucle ».
import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isAdmin, requireAuth, requireAdmin } from '../middleware/auth.js';
import { buildTeamNotificationLink } from '../services/whatsappService.js';
import { config } from '../config.js';
import {
  hubToHubRoute,
  localSeatTzsForRoute,
  memeEndroit,
  sharedAllowedForRoute,
  sharedSeatUsdForRoute,
  TAUX_PLACE_LOCALE,
  TAUX_PLACE_USD,
} from '../services/pricingService.js';
import { libelleMoyen, moyensPour, reglement } from '../services/moyenPaiement.js';
import { createPaymentOrder, isStubMode } from '../services/pesapalService.js';
import { RIDE_DESTINATIONS, RIDE_ORIGINS, RIDE_ORIGINS_ACCEPTES } from '../services/locations.js';
import { randomUUID } from 'node:crypto';
import { assertHotelVerified } from './hotels.js';
import { tauxRemboursement } from '../services/annulationService.js';
import { notifierEquipe } from '../services/emailService.js';

const router = Router();

const createRideSchema = z.object({
  // Les anciens libellés (ex. « Aéroport (AAKIA) ») restent acceptés pour
  // les versions précédentes de l'app ; les menus n'affichent que les neufs.
  origin: z.enum(RIDE_ORIGINS_ACCEPTES, { message: 'Point de départ inconnu' }),
  destination: z.enum(RIDE_DESTINATIONS, { message: "Ville d'arrivée inconnue" }),
  departureAt: z.string().datetime({ offset: true }),
  seatsTotal: z.number().int().min(1).max(8),
  notes: z.string().max(500).optional(),
});

const updateRideSchema = z
  .object({
    seatsAvailable: z.number().int().min(0).optional(),
    status: z.enum(['open', 'closed', 'cancelled']).optional(),
  })
  .refine((d) => d.seatsAvailable !== undefined || d.status !== undefined, {
    message: 'Fournir seatsAvailable et/ou status',
  });

// Cloison tarifaire stricte : les visiteurs/touristes (compte en USD)
// voient UNIQUEMENT le tarif touriste fixe (config.sharedRideUsdPerSeat) ;
// les résidents, hôtels et chauffeurs voient UNIQUEMENT le prix local en
// shillings posté par le chauffeur.
// L'identité CLIENT prime TOUJOURS sur la clé équipe : le téléphone de
// l'équipe (clé X-Admin-Key enregistrée) sert aussi à tester des comptes
// clients — un touriste connecté dessus doit voir de l'USD, pas la double
// grille équipe. Le mode « both » est réservé aux requêtes équipe pures,
// sans compte client connecté.
// Grille appliquée à UN CLIENT donné (et non au porteur du jeton) : sert
// quand l'équipe agit sur la place de quelqu'un d'autre — le prix doit rester
// celui du client, jamais celui de qui regarde.
async function pricingPourClient({ userId, hotelId }) {
  // Hôtel partenaire : même grille USD que les touristes, avec −5 %.
  if (hotelId) return { mode: 'USD', remise: config.hotelDiscountRate };
  if (userId) {
    const { rows } = await query(
      'SELECT account_type, verification_status FROM users WHERE id = $1',
      [userId]
    );
    const user = rows[0];
    if (user && user.account_type !== 'local') {
      // Touristes : tarif plein ; résidents vérifiés : −10 %.
      const verifie = user.account_type === 'resident' && user.verification_status === 'verified';
      return { mode: 'USD', remise: verifie ? config.residentDiscountRate : 0 };
    }
  }
  return { mode: 'TZS' };
}

async function viewerPricing(req) {
  if (req.auth?.hotelId || req.auth?.userId) return pricingPourClient(req.auth);
  if (isAdmin(req)) return { mode: 'both', remise: 0 };
  return { mode: 'TZS' };
}

// Prix USD d'une place pour CE trajet (grille par zone) selon le profil.
function rideUsd(ride, pricing) {
  const base = sharedSeatUsdForRoute(ride.origin, ride.destination);
  return pricing.remise
    ? Math.round(base * (1 - pricing.remise) * 100) / 100
    : base;
}

/**
 * Montant facturé pour une réservation de places, dans la devise du CLIENT.
 * Sert au changement de moyen de paiement (routes/payments.js) : on repart
 * TOUJOURS du prix de la grille, jamais du montant déjà réglé — sinon les
 * frais bancaires d'un premier choix se retrouveraient dans le second.
 */
export async function baseFacturePlace(bookingId) {
  const { rows } = await query(
    `SELECT b.seats, b.user_id, b.hotel_id,
            r.origin, r.destination, r.price_per_seat, r.currency
       FROM ride_bookings b JOIN posted_rides r ON r.id = b.ride_id
      WHERE b.id = $1`,
    [bookingId]
  );
  if (!rows[0]) return null;
  const place = rows[0];
  // La grille du CLIENT de la place, pas celle de qui appelle.
  const pricing = await pricingPourClient({
    userId: place.user_id,
    hotelId: place.hotel_id,
  });
  if (pricing.mode === 'USD') {
    return {
      montant: Math.round(rideUsd(place, pricing) * place.seats * 100) / 100,
      devise: 'USD',
    };
  }
  return { montant: Number(place.price_per_seat) * place.seats, devise: place.currency };
}

// Lien WhatsApp de demande de place — le prix affiché suit la même cloison.
function rideWhatsappLink(ride, pricing) {
  const depart = new Date(ride.departure_at).toLocaleString('fr-FR', {
    timeZone: 'Africa/Dar_es_Salaam',
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const prix =
    pricing.mode === 'USD'
      ? `${rideUsd(ride, pricing)} USD`
      : `${ride.price_per_seat} ${ride.currency}`;
  return buildTeamNotificationLink(
    [
      '🚌 Demande de place — trajet partagé zanziGo',
      `Trajet: ${ride.origin} → ${ride.destination}`,
      `Départ: ${depart}`,
      `Prix par place: ${prix}`,
      `Réf: ${ride.id}`,
    ].join('\n')
  );
}

function serializeRide(ride, pricing) {
  const out = { ...ride, whatsapp_link: rideWhatsappLink(ride, pricing) };
  if (pricing.mode === 'USD') {
    // Jamais le prix local sous les yeux d'un touriste ou d'un résident.
    delete out.price_per_seat;
    out.currency = 'USD';
    out.price_per_seat_usd = rideUsd(out, pricing);
  } else if (pricing.mode === 'both') {
    out.price_per_seat_usd = rideUsd(out, pricing);
  }
  return out;
}

const PRICING_TZS = { mode: 'TZS' };

// La règle des 10 minutes de retard s'applique aux PASSAGERS : un client en
// retard de +10 min au départ perd sa place et la doit en intégralité (voir
// messages de réservation). L'annonce du CHAUFFEUR, elle, n'est jamais
// « annulée » pour ça : une fois l'heure de départ passée (10 min de marge),
// elle se CLÔTURE simplement — le trajet a eu lieu, plus aucune réservation,
// et les places déjà payées restent acquises au chauffeur. Balayage
// paresseux (pas de tâche planifiée), idempotent.
const CLOTURE_APRES_DEPART_MINUTES = 10;
export async function cloturerRidesPartis() {
  await query(
    `UPDATE posted_rides
     SET status = 'closed'
     WHERE status = 'open'
       AND departure_at < now() - make_interval(mins => $1)`,
    [CLOTURE_APRES_DEPART_MINUTES]
  );
}

// Règle zanziGo : une place réservée doit être PAYÉE dans les 5 minutes.
// Sinon la réservation s'annule automatiquement, les places retournent sur
// l'annonce du chauffeur et le paiement en attente est soldé en échec.
// Balayage paresseux, idempotent — exporté pour la liste des paiements.
const PAIEMENT_RESERVATION_MINUTES = 5;
export async function annulerReservationsImpayees() {
  return withTransaction(async (client) => {
    const { rows: expirees } = await client.query(
      `UPDATE ride_bookings b
       SET cancelled_at = now()
       FROM posted_rides r
       WHERE r.id = b.ride_id
         AND b.paid_at IS NULL AND b.cancelled_at IS NULL
         AND b.created_at < now() - make_interval(mins => $1)
       RETURNING b.id, b.ride_id, b.seats, r.origin, r.destination`,
      [PAIEMENT_RESERVATION_MINUTES]
    );
    if (expirees.length === 0) return [];

    // Les places libérées s'additionnent sur l'annonce (plafond : total).
    const parRide = new Map();
    for (const b of expirees) {
      parRide.set(b.ride_id, (parRide.get(b.ride_id) ?? 0) + b.seats);
    }
    for (const [rideId, places] of parRide) {
      await client.query(
        // Une annonce close ou annulée ne « récupère » pas de places : le
        // trajet est parti, afficher des places libres dessus serait un
        // mensonge sur la fiche du chauffeur.
        `UPDATE posted_rides
         SET seats_available = LEAST(seats_total, seats_available + $2)
         WHERE id = $1 AND status = 'open'`,
        [rideId, places]
      );
    }
    await client.query(
      `UPDATE payments SET status = 'failed'
       WHERE status = 'pending' AND ride_booking_id = ANY($1)`,
      [expirees.map((b) => b.id)]
    );
    return expirees;
  }).then((expirees) => {
    // L'équipe est prévenue APRÈS le commit : si la transaction échoue, on
    // n'annonce pas des places remises en vente qui ne l'ont jamais été.
    if (expirees.length > 0) {
      notifierEquipe(
        '⌛ Place(s) libérée(s) — paiement non reçu',
        [
          `${expirees.length} réservation(s) annulée(s) automatiquement après ${PAIEMENT_RESERVATION_MINUTES} minutes sans paiement :`,
          ...expirees.map((b) => `• ${b.origin} → ${b.destination} — ${b.seats} place(s) remise(s) en vente`),
        ].join('\n')
      );
    }
    return expirees;
  });
}

// GET /rides/locations — listes officielles pour les menus déroulants
// de l'app (départs limités aux deux hubs, arrivées de l'île).
router.get('/locations', (_req, res) => {
  res.json({ origins: RIDE_ORIGINS, destinations: RIDE_DESTINATIONS });
});

// POST /rides — un chauffeur validé publie son prochain trajet partagé.
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = createRideSchema.parse(req.body);

    if (!req.auth.driverId) {
      throw new HttpError(403, 'forbidden', 'Seul un chauffeur peut publier un trajet');
    }
    const { rows: driverRows } = await query(
      `SELECT verification_status FROM drivers WHERE id = $1`,
      [req.auth.driverId]
    );
    if (driverRows[0]?.verification_status !== 'verified') {
      throw new HttpError(403, 'driver_not_verified', "Votre compte chauffeur n'a pas encore été validé par l'équipe");
    }

    if (new Date(data.departureAt).getTime() <= Date.now()) {
      throw new HttpError(400, 'departure_in_past', "L'heure de départ doit être dans le futur");
    }

    // Départ et arrivée identiques (ex. aéroport → aéroport, maintenant que
    // l'aéroport est aussi une arrivée) : trajet impossible.
    if (memeEndroit(data.origin, data.destination)) {
      throw new HttpError(
        422,
        'route_indisponible',
        'Le départ et l\'arrivée doivent être différents'
      );
    }

    // Stone Town, le ferry et l'aéroport sont à quelques minutes : aucune
    // course n'est proposée entre ces trois points.
    if (hubToHubRoute(data.origin, data.destination)) {
      throw new HttpError(
        422,
        'route_indisponible',
        'Pas de course entre Stone Town, le ferry et l\'aéroport — ces points sont à quelques minutes les uns des autres'
      );
    }

    // Pas de taxi partagé sur les trajets courts (course privée du même
    // trajet à moins de 35 USD) : course privée uniquement.
    if (!sharedAllowedForRoute(data.origin, data.destination)) {
      throw new HttpError(
        422,
        'no_shared_route',
        'Pas de taxi partagé sur ce trajet court — proposez une course privée'
      );
    }

    // Prix par place FIXÉ PAR LA GRILLE zanziGo selon la zone du trajet —
    // jamais saisi par le chauffeur (un éventuel pricePerSeat envoyé par une
    // ancienne version de l'app est ignoré).
    const pricePerSeat = localSeatTzsForRoute(data.origin, data.destination);
    const { rows } = await query(
      `INSERT INTO posted_rides (driver_id, origin, destination, departure_at, seats_total, seats_available, price_per_seat, notes)
       VALUES ($1, $2, $3, $4, $5, $5, $6, $7)
       RETURNING *`,
      [
        req.auth.driverId,
        data.origin,
        data.destination,
        data.departureAt,
        data.seatsTotal,
        pricePerSeat,
        data.notes ?? null,
      ]
    );
    // Résumé « annonce postée » pour l'équipe (le chauffeur l'envoie d'un
    // geste depuis l'app) — l'équipe suit ainsi TOUTES les annonces en ligne.
    const { rows: chauffeurRows } = await query(
      'SELECT full_name, phone FROM drivers WHERE id = $1',
      [req.auth.driverId]
    );
    const departAffiche = new Date(rows[0].departure_at).toLocaleString('fr-FR', {
      timeZone: 'Africa/Dar_es_Salaam',
      dateStyle: 'short',
      timeStyle: 'short',
    });
    const resumeAnnonce = [
      '📣 Nouvelle annonce — taxi partagé zanziGo',
      `Chauffeur: ${chauffeurRows[0]?.full_name ?? '?'} (${chauffeurRows[0]?.phone ?? '?'})`,
      `Trajet: ${rows[0].origin} → ${rows[0].destination}`,
      `Départ: ${departAffiche}`,
      `Places: ${rows[0].seats_total}`,
      `Prix place: ${rows[0].price_per_seat} TZS (locaux) · ${sharedSeatUsdForRoute(rows[0].origin, rows[0].destination)} USD (touristes)`,
      `Réf: ${rows[0].id}`,
    ].join('\n');
    // L'équipe est prévenue automatiquement (e-mail) ; le lien WhatsApp
    // reste renvoyé en secours mais le chauffeur n'a plus rien à envoyer.
    notifierEquipe('📣 Nouvelle annonce taxi partagé', resumeAnnonce);
    // Liste d'attente : des clients attendaient exactement ce trajet ?
    // L'équipe est prévenue pour les recontacter (matching manuel).
    signalerAttentesCorrespondantes(rows[0]).catch(() => {});
    const notificationAnnonce = buildTeamNotificationLink(resumeAnnonce);
    // Le chauffeur qui publie voit LES DEUX prix (TZS locaux + USD touristes)
    // pour comprendre que chaque client paie dans sa devise.
    res
      .status(201)
      .json({ ...serializeRide(rows[0], { mode: 'both' }), notification_link: notificationAnnonce });
  })
);

// Quand une annonce est publiée : les demandes en attente sur le même
// trajet (même origine/destination, date souhaitée compatible) sont
// marquées « trouvées » et l'équipe reçoit la liste des clients à
// recontacter avec le lien de l'annonce.
async function signalerAttentesCorrespondantes(ride) {
  const { rows } = await query(
    `UPDATE ride_waitlist w SET matched_at = now()
     FROM users u
     WHERE w.user_id = u.id
       AND w.matched_at IS NULL AND w.cancelled_at IS NULL
       AND lower(trim(w.origin)) = lower(trim($1))
       AND lower(trim(w.destination)) = lower(trim($2))
       AND (w.desired_date IS NULL OR w.desired_date = ($3::timestamptz AT TIME ZONE 'Africa/Dar_es_Salaam')::date)
     RETURNING w.seats, u.full_name, u.phone, u.email`,
    [ride.origin, ride.destination, ride.departure_at]
  );
  if (rows.length === 0) return;
  notifierEquipe(
    '🎯 Clients en attente sur ce trajet — zanziGo',
    [
      `Une annonce ${ride.origin} → ${ride.destination} vient d'être publiée`,
      `et ${rows.length} client(s) l'attendaient — à recontacter :`,
      ...rows.map((c) => `• ${c.full_name} (${c.phone ?? c.email ?? 'sans contact'}) — ${c.seats} place(s)`),
      `Réf annonce: ${ride.id}`,
    ].join('\n')
  );
}

// POST /rides/attente — un client laisse sa demande quand aucun taxi
// partagé n'est annoncé sur son trajet : l'équipe le rappelle dès qu'une
// annonce correspondante sort.
const waitlistSchema = z.object({
  origin: z.string().min(2),
  destination: z.string().min(2),
  desiredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  seats: z.number().int().min(1).max(8).optional(),
});

router.post(
  '/attente',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.auth.userId) {
      throw new HttpError(403, 'forbidden', 'Réservé aux clients connectés');
    }
    const data = waitlistSchema.parse(req.body);
    const { rows } = await query(
      `INSERT INTO ride_waitlist (user_id, origin, destination, desired_date, seats)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.auth.userId, data.origin, data.destination, data.desiredDate ?? null, data.seats ?? 1]
    );
    const { rows: clientRows } = await query('SELECT full_name, phone, email FROM users WHERE id = $1', [
      req.auth.userId,
    ]);
    notifierEquipe(
      '🕐 Demande en liste d\'attente — zanziGo',
      [
        `${clientRows[0]?.full_name ?? 'Client'} (${clientRows[0]?.phone ?? clientRows[0]?.email ?? '?'})`,
        `cherche ${rows[0].seats} place(s) en taxi partagé :`,
        `${rows[0].origin} → ${rows[0].destination}${rows[0].desired_date ? ` le ${String(rows[0].desired_date).slice(0, 10)}` : ''}`,
        'Vous serez re-notifié dès qu\'une annonce correspondante sort.',
      ].join('\n')
    );
    res.status(201).json(rows[0]);
  })
);

// GET /rides/attente — les demandes en attente : les siennes (client) ou
// toutes les demandes ouvertes avec contact (équipe).
router.get(
  '/attente',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (isAdmin(req)) {
      const { rows } = await query(
        `SELECT w.*, u.full_name, u.phone, u.email
         FROM ride_waitlist w JOIN users u ON u.id = w.user_id
         WHERE w.cancelled_at IS NULL
         ORDER BY w.created_at DESC LIMIT 100`
      );
      return res.json(rows);
    }
    if (!req.auth.userId) {
      throw new HttpError(403, 'forbidden', 'Réservé aux clients connectés');
    }
    const { rows } = await query(
      `SELECT * FROM ride_waitlist
       WHERE user_id = $1 AND cancelled_at IS NULL
       ORDER BY created_at DESC LIMIT 20`,
      [req.auth.userId]
    );
    res.json(rows);
  })
);

// POST /rides/attente/:id/cancel — le client retire sa demande.
router.post(
  '/attente/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM ride_waitlist WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw notFound('Demande');
    if (!isAdmin(req) && rows[0].user_id !== req.auth.userId) {
      throw new HttpError(403, 'forbidden', 'Réservé au client concerné');
    }
    const { rows: updated } = await query(
      'UPDATE ride_waitlist SET cancelled_at = now() WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    res.json(updated[0]);
  })
);

// GET /rides — trajets partagés ouverts à venir (tout compte authentifié),
// avec les infos publiques du chauffeur (nom, véhicule, note).
// GET /rides/equipe — LA TOUR DE CONTRÔLE DES TAXIS PARTAGÉS.
//
// Le tableau de bord voyait les courses privées, les paiements, les
// candidatures… mais pas les annonces de taxi partagé : personne ne pouvait
// dire, à un instant donné, quelles voitures partaient, avec combien de monde
// à bord et combien de places restaient à vendre. C'est pourtant là que se
// joue le remplissage — et un siège vide au départ ne se rattrape jamais.
//
// On remonte les deux derniers jours et tout l'à-venir : assez pour voir ce
// qui vient de partir sans noyer l'écran sous l'historique.
router.get(
  '/equipe',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    await cloturerRidesPartis();
    await annulerReservationsImpayees();
    const { rows } = await query(
      `SELECT r.*, d.full_name AS driver_name, d.phone AS driver_phone,
              d.vehicle_plate, d.vehicle_model
       FROM posted_rides r
       JOIN drivers d ON d.id = r.driver_id
       WHERE r.departure_at > now() - interval '2 days'
       ORDER BY r.departure_at ASC
       LIMIT 200`
    );
    if (rows.length === 0) return res.json([]);

    const { rows: reservations } = await query(
      `SELECT b.ride_id, b.seats, b.created_at, b.paid_at,
              u.full_name AS user_name, u.account_type,
              h.name AS hotel_name
       FROM ride_bookings b
       LEFT JOIN users u ON u.id = b.user_id
       LEFT JOIN hotels h ON h.id = b.hotel_id
       WHERE b.ride_id = ANY($1) AND b.cancelled_at IS NULL
       ORDER BY b.created_at ASC`,
      [rows.map((r) => r.id)]
    );
    const parRide = {};
    for (const b of reservations) (parRide[b.ride_id] ??= []).push(b);

    const round2 = (n) => Math.round(n * 100) / 100;
    res.json(
      rows.map((r) => {
        const places = parRide[r.id] ?? [];
        const vendues = places.filter((b) => b.paid_at).reduce((n, b) => n + b.seats, 0);
        const reservees = places.filter((b) => !b.paid_at).reduce((n, b) => n + b.seats, 0);
        // Le prix d'une place en USD : c'est celui que paient les touristes,
        // et donc celui qui dit ce que vaut vraiment le remplissage.
        const usd = sharedSeatUsdForRoute(r.origin, r.destination);
        return {
          id: r.id,
          origin: r.origin,
          destination: r.destination,
          departure_at: r.departure_at,
          status: r.status,
          seats_total: r.seats_total,
          seats_available: r.seats_available,
          seats_sold: vendues,
          seats_reserved: reservees,
          price_per_seat: Number(r.price_per_seat),
          price_per_seat_usd: usd,
          currency: r.currency,
          // Ce que zanziGo encaisse sur les places DÉJÀ PAYÉES.
          commission_usd: round2(vendues * usd * TAUX_PLACE_USD),
          driver_name: r.driver_name,
          driver_phone: r.driver_phone,
          vehicle_plate: r.vehicle_plate,
          vehicle_model: r.vehicle_model,
          bookings: places.map((b) => ({
            seats: b.seats,
            paid: b.paid_at !== null,
            // Le nom ne s'affiche qu'une fois la place payée — même règle que
            // partout ailleurs : l'identité du client se mérite par le paiement.
            client_name: b.paid_at ? (b.hotel_name ?? b.user_name) : null,
            client_type: b.hotel_name ? 'hotel' : (b.account_type ?? 'tourist'),
          })),
        };
      })
    );
  })
);

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    await cloturerRidesPartis();
    await annulerReservationsImpayees();
    const { rows } = await query(
      `SELECT r.*, d.full_name AS driver_name, d.vehicle_plate, d.vehicle_model, d.rating_avg AS driver_rating
       FROM posted_rides r
       JOIN drivers d ON d.id = r.driver_id
       WHERE r.status = 'open' AND r.departure_at > now() AND r.seats_available > 0
       ORDER BY r.departure_at ASC
       LIMIT 100`
    );
    const pricing = await viewerPricing(req);
    res.json(rows.map((r) => serializeRide(r, pricing)));
  })
);

// GET /rides/mine — les trajets du chauffeur connecté (tous statuts), avec le
// détail des réservations : qui a réservé, combien de places, et le PRIX PAR
// PLACE SELON LE TYPE DE CLIENT (touriste/résident/hôtel en USD, local en
// TZS) — c'est ainsi que le chauffeur connaît la valeur de chaque place.
router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.auth.driverId) {
      throw new HttpError(403, 'forbidden', 'Réservé aux chauffeurs');
    }
    await cloturerRidesPartis();
    await annulerReservationsImpayees();
    const { rows } = await query(
      `SELECT * FROM posted_rides WHERE driver_id = $1 ORDER BY departure_at DESC`,
      [req.auth.driverId]
    );

    const round2 = (n) => Math.round(n * 100) / 100;
    const parRide = {};
    if (rows.length > 0) {
      const { rows: reservations } = await query(
        `SELECT b.ride_id, b.seats, b.created_at, b.paid_at,
                u.full_name AS user_name, u.account_type, u.verification_status,
                h.name AS hotel_name
         FROM ride_bookings b
         LEFT JOIN users u ON u.id = b.user_id
         LEFT JOIN hotels h ON h.id = b.hotel_id
         WHERE b.ride_id = ANY($1) AND b.cancelled_at IS NULL
         ORDER BY b.created_at ASC`,
        [rows.map((r) => r.id)]
      );
      for (const b of reservations) {
        (parRide[b.ride_id] ??= []).push(b);
      }
    }

    res.json(
      rows.map((r) => {
        // Les deux prix (TZS locaux + USD touristes) : le chauffeur voit que
        // chaque client paie dans sa devise.
        const out = serializeRide(r, { mode: 'both' });
        const usd = sharedSeatUsdForRoute(r.origin, r.destination);
        // Commission zanziGo par place : taux local (TZS) ou taux touriste
        // (USD), pris dans la grille — le chauffeur voit son net.
        const avecGain = (base, taux) => ({
          ...base,
          commission_per_seat: round2(base.price_per_seat * taux),
          net_per_seat: round2(base.price_per_seat * (1 - taux)),
        });
        // Chaque réservation indique si la place a été payée — et le NOM du
        // passager n'apparaît qu'à ce moment-là : même règle que pour les
        // courses privées (vueChauffeur), l'identité du client se mérite par
        // le paiement, pas par la réservation.
        const avecPaiement = (b, resa) => ({
          ...resa,
          paid: b.paid_at !== null,
          client_name: b.paid_at !== null ? resa.client_name : null,
        });
        out.bookings = (parRide[r.id] ?? []).map((b) => {
          if (b.hotel_name) {
            return avecPaiement(
              b,
              avecGain(
                {
                  seats: b.seats,
                  client_type: 'hotel',
                  client_name: b.hotel_name,
                  price_per_seat: round2(usd * (1 - config.hotelDiscountRate)),
                  currency: 'USD',
                },
                TAUX_PLACE_USD
              )
            );
          }
          if (b.account_type === 'local') {
            return avecPaiement(
              b,
              avecGain(
                {
                  seats: b.seats,
                  client_type: 'local',
                  client_name: b.user_name ?? null,
                  price_per_seat: Number(r.price_per_seat),
                  currency: 'TZS',
                },
                TAUX_PLACE_LOCALE
              )
            );
          }
          const resident = b.account_type === 'resident' && b.verification_status === 'verified';
          return avecPaiement(
            b,
            avecGain(
              {
                seats: b.seats,
                client_type: resident ? 'resident' : 'tourist',
                client_name: b.user_name ?? null,
                price_per_seat: resident ? round2(usd * (1 - config.residentDiscountRate)) : usd,
                currency: 'USD',
              },
              TAUX_PLACE_USD
            )
          );
        });
        return out;
      })
    );
  })
);

// GET /rides/reservations — les places réservées par le CLIENT connecté
// (utilisateur ou hôtel) : trajet, départ, prix dans SA devise, statut du
// paiement, et ce que donnerait une annulation maintenant (barème 24/48 h).
router.get(
  '/reservations',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.auth.userId && !req.auth.hotelId) {
      throw new HttpError(403, 'forbidden', 'Réservé aux clients et aux hôtels partenaires');
    }
    await cloturerRidesPartis();
    await annulerReservationsImpayees();
    const { rows } = await query(
      // Le paiement encore vivant de la place (jamais les tentatives
      // échouées) : c'est lui qui porte le MOYEN choisi et le montant
      // réellement à régler — un touriste facturé en dollars peut avoir
      // choisi de payer en shillings par portefeuille mobile.
      `SELECT b.id, b.seats, b.created_at, b.paid_at, b.cancelled_at,
              r.origin, r.destination, r.departure_at, r.status AS ride_status,
              r.price_per_seat, r.currency AS ride_currency,
              d.full_name AS driver_name, d.vehicle_plate, d.vehicle_model,
              p.id AS payment_id, p.amount AS payment_amount,
              p.currency AS payment_currency, p.surcharge AS payment_surcharge,
              p.method AS payment_method
       FROM ride_bookings b
       JOIN posted_rides r ON r.id = b.ride_id
       JOIN drivers d ON d.id = r.driver_id
       LEFT JOIN LATERAL (
         SELECT * FROM payments
          WHERE ride_booking_id = b.id AND status <> 'failed'
          ORDER BY created_at DESC LIMIT 1
       ) p ON TRUE
       WHERE ${req.auth.userId ? 'b.user_id = $1' : 'b.hotel_id = $1'}
       ORDER BY r.departure_at DESC
       LIMIT 100`,
      [req.auth.userId ?? req.auth.hotelId]
    );
    const pricing = await viewerPricing(req);
    res.json(
      rows.map((b) => {
        const prixPlace =
          pricing.mode === 'USD'
            ? rideUsd({ origin: b.origin, destination: b.destination }, pricing)
            : Number(b.price_per_seat);
        const devise = pricing.mode === 'USD' ? 'USD' : b.ride_currency;
        const futur = new Date(b.departure_at).getTime() > Date.now();
        const taux = tauxRemboursement(b.departure_at);
        const active = b.cancelled_at === null && b.ride_status !== 'cancelled';
        return {
          id: b.id,
          origin: b.origin,
          destination: b.destination,
          departure_at: b.departure_at,
          ride_status: b.ride_status,
          driver_name: b.driver_name,
          vehicle_plate: b.vehicle_plate,
          vehicle_model: b.vehicle_model,
          // Dates de la fiche de suivi (réservée → payée → départ → terminée).
          created_at: b.created_at,
          paid_at: b.paid_at,
          seats: b.seats,
          price_per_seat: prixPlace,
          amount: Math.round(prixPlace * b.seats * 100) / 100,
          currency: devise,
          // CE QUI EST RÉELLEMENT À RÉGLER, moyen de paiement compris. Le
          // prix ci-dessus reste celui de la place ; ces lignes-ci disent
          // combien, dans quelle monnaie, et par quel moyen.
          payment_id: b.payment_id ?? null,
          reglement_montant: b.payment_amount === undefined ? null : Number(b.payment_amount),
          reglement_devise: b.payment_currency ?? null,
          reglement_surcharge:
            b.payment_surcharge === undefined ? 0 : Number(b.payment_surcharge),
          reglement_moyen: b.payment_method ?? null,
          moyens_disponibles: moyensPour(devise),
          paid: b.paid_at !== null,
          cancelled: b.cancelled_at !== null || b.ride_status === 'cancelled',
          // Annulable maintenant ? Place non payée : oui tant que le départ
          // n'est pas passé. Place payée : seulement à 24 h ou plus (barème).
          cancellable: active && futur && (b.paid_at === null || taux !== null),
          refund_rate: active && futur && b.paid_at !== null ? taux : null,
        };
      })
    );
  })
);

// POST /rides/reservations/:id/cancel — annulation par le CLIENT de sa place
// de taxi partagé. Barème : ≥ 48 h avant le départ = remboursement 100 %,
// entre 24 h et 48 h = 50 %, < 24 h = refusée (la place reste due). Les
// places retournent sur l'annonce du chauffeur, le remboursement éventuel
// est tracé sur le paiement pour le tableau de bord équipe.
router.post(
  '/reservations/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const resultat = await withTransaction(async (client) => {
      const { rows: bookingRows } = await client.query(
        `SELECT b.*, r.origin, r.destination, r.departure_at, r.status AS ride_status
         FROM ride_bookings b
         JOIN posted_rides r ON r.id = b.ride_id
         WHERE b.id = $1
         FOR UPDATE OF b`,
        [req.params.id]
      );
      const booking = bookingRows[0];
      if (!booking) throw notFound('Réservation');
      const estReservateur =
        (booking.user_id !== null && booking.user_id === req.auth.userId) ||
        (booking.hotel_id !== null && booking.hotel_id === req.auth.hotelId);
      if (!isAdmin(req) && !estReservateur) {
        throw new HttpError(403, 'forbidden', 'Seul le client qui a réservé peut annuler sa place');
      }
      if (booking.cancelled_at !== null) {
        throw new HttpError(409, 'already_cancelled', 'Cette réservation est déjà annulée');
      }
      if (new Date(booking.departure_at).getTime() <= Date.now()) {
        throw new HttpError(409, 'ride_departed', 'Le départ est passé — cette place ne peut plus être annulée');
      }

      const taux = booking.paid_at !== null ? tauxRemboursement(booking.departure_at) : null;
      if (booking.paid_at !== null && taux === null) {
        throw new HttpError(
          409,
          'cancellation_too_late',
          'À moins de 24 h du départ, la place reste due en intégralité — contactez l\'équipe sur WhatsApp'
        );
      }

      await client.query(`UPDATE ride_bookings SET cancelled_at = now() WHERE id = $1`, [
        booking.id,
      ]);
      // Les places libérées retournent sur l'annonce (plafond : total).
      await client.query(
        `UPDATE posted_rides
         SET seats_available = LEAST(seats_total, seats_available + $2)
         WHERE id = $1 AND status = 'open'`,
        [booking.ride_id, booking.seats]
      );
      // Paiement encore en attente : soldé en échec, rien à rembourser.
      await client.query(
        `UPDATE payments SET status = 'failed'
         WHERE status = 'pending' AND ride_booking_id = $1`,
        [booking.id]
      );
      // Paiement déjà reçu : remboursement dû (100 % ou 50 %), tracé pour le
      // tableau de bord équipe qui le solde d'un bouton une fois versé.
      let refund = null;
      if (booking.paid_at !== null) {
        const { rows: paiements } = await client.query(
          // Comme pour les courses : le barème porte sur le PRIX de la
          // place, pas sur la surcharge carte — la banque l'a déjà
          // prélevée, elle n'est pas dans nos caisses.
          `UPDATE payments
           SET refund_amount = ROUND((amount - surcharge) * $2, 2), refund_due_at = now()
           WHERE ride_booking_id = $1 AND status = 'confirmed' AND refund_due_at IS NULL
           RETURNING refund_amount, currency`,
          [booking.id, taux]
        );
        if (paiements[0]) {
          refund = {
            amount: Number(paiements[0].refund_amount),
            currency: paiements[0].currency,
            rate: taux,
          };
        }
      }
      return { booking, refund };
    });

    // Étiquette du réservateur pour le message à l'équipe.
    let etiquette = 'équipe zanziGo';
    if (resultat.booking.user_id) {
      const { rows } = await query('SELECT full_name, phone FROM users WHERE id = $1', [
        resultat.booking.user_id,
      ]);
      if (rows[0]) etiquette = `${rows[0].full_name} (${rows[0].phone})`;
    } else if (resultat.booking.hotel_id) {
      const { rows } = await query('SELECT name, phone FROM hotels WHERE id = $1', [
        resultat.booking.hotel_id,
      ]);
      if (rows[0]) etiquette = `${rows[0].name} (hôtel, ${rows[0].phone})`;
    }
    const depart = new Date(resultat.booking.departure_at).toLocaleString('fr-FR', {
      timeZone: 'Africa/Dar_es_Salaam',
      dateStyle: 'short',
      timeStyle: 'short',
    });
    const resumeAnnulation = [
        '❌ Annulation place — taxi partagé zanziGo',
        `Client: ${etiquette}`,
        `Trajet: ${resultat.booking.origin} → ${resultat.booking.destination}`,
        `Départ: ${depart}`,
        `Places annulées: ${resultat.booking.seats}`,
        resultat.refund
          ? `À rembourser: ${resultat.refund.amount} ${resultat.refund.currency} (${resultat.refund.rate * 100} %)`
          : 'Aucun paiement reçu — rien à rembourser.',
        `Réf: ${resultat.booking.id}`,
      ].join('\n');
    notifierEquipe(
      resultat.refund ? '❌ Place annulée — remboursement à verser' : '❌ Place annulée (non payée)',
      resumeAnnulation
    );
    const whatsappLink = buildTeamNotificationLink(resumeAnnulation);

    res.json({
      id: resultat.booking.id,
      cancelled: true,
      refund: resultat.refund,
      whatsapp_link: whatsappLink,
    });
  })
);

// POST /rides/:id/book {seats} — réservation de place(s) DANS L'APP :
// décompte atomique des places restantes sur l'annonce du chauffeur (le
// chauffeur voit ses places baisser en direct), trace en ride_bookings, et
// lien WhatsApp pré-rempli vers l'équipe pour l'avertir de la réservation.
router.post(
  '/:id/book',
  requireAuth,
  asyncHandler(async (req, res) => {
    // Le moyen de paiement peut être choisi dès la réservation ; sinon le
    // client le choisira sur la fiche de sa place (POST /payments/:id/moyen).
    const { seats, method } = z
      .object({
        seats: z.number().int().min(1).max(8),
        method: z.enum(['carte', 'mobile']).optional(),
      })
      .parse(req.body);
    if (!req.auth.userId && !req.auth.hotelId && !isAdmin(req)) {
      throw new HttpError(403, 'forbidden', 'Réservé aux clients et aux hôtels partenaires');
    }
    // Un hôtel ne peut réserver de places qu'une fois son compte vérifié.
    if (req.auth.hotelId) {
      const { rows } = await query('SELECT verification_status FROM hotels WHERE id = $1', [
        req.auth.hotelId,
      ]);
      if (!rows[0]) throw notFound('Hôtel');
      assertHotelVerified(rows[0]);
    }
    // Profil client radié par l'équipe : plus aucune réservation possible.
    if (req.auth.userId) {
      const { rows } = await query('SELECT banned_at FROM users WHERE id = $1', [
        req.auth.userId,
      ]);
      if (rows[0]?.banned_at) {
        throw new HttpError(403, 'account_blocked', "Compte bloqué par l'équipe zanziGo — contactez-nous sur WhatsApp");
      }
    }

    await cloturerRidesPartis();
    await annulerReservationsImpayees();
    const { rows: rideRows } = await query('SELECT * FROM posted_rides WHERE id = $1', [
      req.params.id,
    ]);
    const ride = rideRows[0];
    if (!ride) throw notFound('Trajet partagé');
    if (ride.status !== 'open' || new Date(ride.departure_at).getTime() <= Date.now()) {
      throw new HttpError(409, 'ride_closed', 'Ce trajet n\'est plus ouvert à la réservation');
    }

    // Décrément ATOMIQUE : la condition seats_available >= N dans le UPDATE
    // empêche deux clients de prendre les mêmes places en même temps.
    const { rows: updated } = await query(
      `UPDATE posted_rides
       SET seats_available = seats_available - $2
       WHERE id = $1 AND status = 'open' AND seats_available >= $2
       RETURNING *`,
      [req.params.id, seats]
    );
    if (!updated[0]) {
      throw new HttpError(
        409,
        'not_enough_seats',
        `Plus assez de places disponibles (demandées: ${seats}, restantes: ${ride.seats_available})`
      );
    }
    const rideMaj = updated[0];

    // Étiquette + profil du réservateur pour le résumé envoyé à l'équipe.
    let booker = 'équipe zanziGo';
    let profil = 'Équipe';
    if (req.auth.userId) {
      const { rows } = await query('SELECT full_name, phone, account_type FROM users WHERE id = $1', [
        req.auth.userId,
      ]);
      if (rows[0]) {
        booker = `${rows[0].full_name} (${rows[0].phone ?? rows[0].email ?? 'sans contact'})`;
        profil =
          rows[0].account_type === 'local'
            ? 'Local'
            : rows[0].account_type === 'resident'
              ? 'Résident'
              : 'Touriste';
      }
    } else if (req.auth.hotelId) {
      const { rows } = await query('SELECT name, phone FROM hotels WHERE id = $1', [
        req.auth.hotelId,
      ]);
      if (rows[0]) {
        booker = `${rows[0].name} (hôtel, ${rows[0].phone})`;
        profil = 'Hôtel';
      }
    }

    const { rows: bookingRows } = await query(
      `INSERT INTO ride_bookings (ride_id, user_id, hotel_id, seats)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [rideMaj.id, req.auth.userId ?? null, req.auth.hotelId ?? null, seats]
    );
    const bookingId = bookingRows[0].id;

    const depart = new Date(rideMaj.departure_at).toLocaleString('fr-FR', {
      timeZone: 'Africa/Dar_es_Salaam',
      dateStyle: 'short',
      timeStyle: 'short',
    });
    // Prix par place dans la devise du CLIENT (cloison tarifaire).
    const pricing = await viewerPricing(req);
    const prixPlace =
      pricing.mode === 'USD'
        ? `${rideUsd(rideMaj, pricing)} USD`
        : `${rideMaj.price_per_seat} ${rideMaj.currency}`;

    // ----- Paiement en attente : la place réservée est DUE (voir règle de
    // ponctualité) — la ligne arrive dans le tableau de bord équipe comme
    // pour une course privée ou un colis, à confirmer une fois l'argent reçu.
    const montantTotal =
      pricing.mode === 'USD'
        ? Math.round(rideUsd(rideMaj, pricing) * seats * 100) / 100
        : Number(rideMaj.price_per_seat) * seats;
    const deviseClient = pricing.mode === 'USD' ? 'USD' : rideMaj.currency;
    // Ce que le client règle : par carte, le total plus les frais bancaires ;
    // par portefeuille mobile, le total converti en shillings, sans frais. Le
    // prix de la place et le net du chauffeur ne bougent pas.
    const reglePlace = reglement(montantTotal, deviseClient, method);
    let circuitPaiement = null;
    if (!isStubMode()) {
      circuitPaiement = await createPaymentOrder({
        amount: reglePlace.montant,
        currency: reglePlace.devise,
        description: `zanziGo taxi partagé ${rideMaj.origin} → ${rideMaj.destination} (${seats} place·s)`,
      });
    }
    const referencePaiement = circuitPaiement?.reference ?? `WHATSAPP-${randomUUID()}`;
    const lienPaiement =
      circuitPaiement?.paymentLink ??
      buildTeamNotificationLink(
        [
          '💳 Paiement place(s) taxi partagé zanziGo',
          `Client: ${booker}`,
          `Trajet: ${rideMaj.origin} → ${rideMaj.destination}`,
          `Places: ${seats}`,
          `Moyen: ${libelleMoyen(reglePlace.moyen)}`,
          `Montant: ${reglePlace.montant} ${reglePlace.devise}`,
          ...(reglePlace.surcharge > 0
            ? [`(dont ${reglePlace.surcharge} ${reglePlace.devise} de frais bancaires carte)`]
            : []),
          `Prix des places: ${montantTotal} ${deviseClient}`,
          `Réf: ${bookingId}`,
        ].join('\n')
      );
    const { rows: paymentRows } = await query(
      `INSERT INTO payments (ride_booking_id, amount, currency, pesapal_reference, payment_link,
                             surcharge, method, prix_facture, devise_facture)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        bookingId,
        reglePlace.montant,
        reglePlace.devise,
        referencePaiement,
        lienPaiement,
        reglePlace.surcharge,
        reglePlace.moyen,
        montantTotal,
        deviseClient,
      ]
    );
    const resumeResa = [
        '🚌 Réservation confirmée — taxi partagé zanziGo',
        `Course: Taxi partagé`,
        `Profil: ${profil}`,
        `Client: ${booker}`,
        `Trajet: ${rideMaj.origin} → ${rideMaj.destination}`,
        `Départ: ${depart}`,
        `Places réservées: ${seats} (restantes: ${rideMaj.seats_available})`,
        `Prix par place: ${prixPlace}`,
        `Réf: ${rideMaj.id}`,
        'Paiement: sous 5 minutes — sinon la réservation s\'annule et les places sont remises en vente.',
        'Règle: retard de +10 min au départ = place annulée, due en intégralité au chauffeur (respect des autres voyageurs).',
        'Annulation: remboursement 100 % à 48 h ou plus du départ, 50 % entre 24 h et 48 h, impossible à moins de 24 h.',
      ].join('\n');
    // L'équipe est prévenue automatiquement (e-mail) — le client n'a plus
    // de message à envoyer.
    notifierEquipe('🚌 Place réservée — taxi partagé', resumeResa);
    const notification = buildTeamNotificationLink(resumeResa);

    const sortie = serializeRide(rideMaj, pricing);
    // Le lien de CETTE réponse notifie la réservation (et remplace le lien
    // générique « demande de place »).
    sortie.whatsapp_link = notification;
    sortie.booked_seats = seats;
    // Identifiant de LA PLACE réservée : l'app ouvre sa fiche de suivi
    // (étapes + paiement) juste après la réservation.
    sortie.booking_id = bookingId;
    sortie.payment = {
      ...paymentRows[0],
      payment_method: circuitPaiement ? 'pesapal' : 'manual',
    };
    res.status(201).json(sortie);
  })
);

// PATCH /rides/:id — mise à jour par le chauffeur propriétaire (ou l'équipe) :
// places restantes après une réservation, clôture ou annulation.
router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = updateRideSchema.parse(req.body);

    const { rows: rideRows } = await query('SELECT * FROM posted_rides WHERE id = $1', [req.params.id]);
    const ride = rideRows[0];
    if (!ride) throw notFound('Trajet partagé');
    if (!isAdmin(req) && ride.driver_id !== req.auth.driverId) {
      throw new HttpError(403, 'forbidden', 'Accès réservé au chauffeur qui a publié ce trajet');
    }

    if (data.seatsAvailable !== undefined && data.seatsAvailable > ride.seats_total) {
      throw new HttpError(400, 'validation_error', `Ce trajet compte ${ride.seats_total} places au total`);
    }

    // ANNULATION D'UNE ANNONCE : les passagers ne disparaissent pas avec
    // elle. Chaque réservation active est annulée, ses paiements en attente
    // sont soldés, et les places DÉJÀ PAYÉES ouvrent un remboursement à
    // 100 % (hors frais bancaires, jamais récupérés) — c'est le chauffeur
    // qui annule, le client n'y est pour rien, le barème 24/48 h ne
    // s'applique pas. Sans ça, un passager payé restait sans trajet, sans
    // remboursement et sans recours : sa fiche affichait même le bouton
    // d'annulation désactivé.
    const annule = data.status === 'cancelled' && ride.status !== 'cancelled';
    const { rows, rembourses } = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE posted_rides
         SET seats_available = COALESCE($1, seats_available),
             status = COALESCE($2, status)
         WHERE id = $3
         RETURNING *`,
        [data.seatsAvailable ?? null, data.status ?? null, req.params.id]
      );
      let rembourses = [];
      if (annule) {
        const { rows: reservations } = await client.query(
          `UPDATE ride_bookings SET cancelled_at = now()
            WHERE ride_id = $1 AND cancelled_at IS NULL
            RETURNING id, paid_at, seats`,
          [req.params.id]
        );
        const ids = reservations.map((b) => b.id);
        if (ids.length > 0) {
          await client.query(
            `UPDATE payments SET status = 'failed'
              WHERE status = 'pending' AND ride_booking_id = ANY($1)`,
            [ids]
          );
          const payees = reservations.filter((b) => b.paid_at !== null).map((b) => b.id);
          if (payees.length > 0) {
            const { rows: dus } = await client.query(
              `UPDATE payments
                  SET refund_amount = ROUND(amount - surcharge, 2), refund_due_at = now()
                WHERE ride_booking_id = ANY($1) AND status = 'confirmed'
                  AND refund_due_at IS NULL
                RETURNING refund_amount, currency`,
              [payees]
            );
            rembourses = dus;
          }
        }
      }
      return { rows, rembourses };
    });
    if (annule) {
      // Après le commit : l'équipe sait qui rappeler et combien rendre.
      notifierEquipe(
        '🚫 Annonce annulée par le chauffeur',
        [
          `Trajet: ${ride.origin} → ${ride.destination}`,
          `Départ prévu: ${new Date(ride.departure_at).toLocaleString('fr-FR', { timeZone: 'Africa/Dar_es_Salaam', dateStyle: 'short', timeStyle: 'short' })}`,
          ...(rembourses.length > 0
            ? [
                `${rembourses.length} place(s) PAYÉE(S) à rembourser à 100 % :`,
                ...rembourses.map((r) => `• ${r.refund_amount} ${r.currency}`),
                'Les lignes sont dans « Remboursements à verser ».',
              ]
            : ['Aucune place payée — rien à rembourser.']),
        ].join('\n')
      );
    }
    res.json(serializeRide(rows[0], isAdmin(req) ? { mode: 'both', usd: config.sharedRideUsdPerSeat } : PRICING_TZS));
  })
);

export default router;
