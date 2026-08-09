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
import { query } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isAdmin, requireAuth } from '../middleware/auth.js';
import { buildTeamNotificationLink } from '../services/whatsappService.js';
import { config } from '../config.js';
import { localSeatTzsForRoute, sharedSeatUsdForRoute } from '../services/pricingService.js';
import { RIDE_DESTINATIONS, RIDE_ORIGINS } from '../services/locations.js';

const router = Router();

const createRideSchema = z.object({
  origin: z.enum(RIDE_ORIGINS, { message: 'Point de départ inconnu' }),
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
// shillings posté par le chauffeur. L'équipe voit les deux.
async function viewerPricing(req) {
  if (isAdmin(req)) return { mode: 'both', remise: 0 };
  // Hôtel partenaire : même grille USD que les touristes, avec −5 %.
  if (req.auth.hotelId) return { mode: 'USD', remise: config.hotelDiscountRate };
  if (req.auth.userId) {
    const { rows } = await query(
      'SELECT account_type, verification_status FROM users WHERE id = $1',
      [req.auth.userId]
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

// Prix USD d'une place pour CE trajet (grille par zone) selon le profil.
function rideUsd(ride, pricing) {
  const base = sharedSeatUsdForRoute(ride.origin, ride.destination);
  return pricing.remise
    ? Math.round(base * (1 - pricing.remise) * 100) / 100
    : base;
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
    // Le chauffeur qui publie voit son prix local (TZS).
    res.status(201).json(serializeRide(rows[0], PRICING_TZS));
  })
);

// GET /rides — trajets partagés ouverts à venir (tout compte authentifié),
// avec les infos publiques du chauffeur (nom, véhicule, note).
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT r.*, d.full_name AS driver_name, d.vehicle_model, d.rating_avg AS driver_rating
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
    const { rows } = await query(
      `SELECT * FROM posted_rides WHERE driver_id = $1 ORDER BY departure_at DESC`,
      [req.auth.driverId]
    );

    const round2 = (n) => Math.round(n * 100) / 100;
    const parRide = {};
    if (rows.length > 0) {
      const { rows: reservations } = await query(
        `SELECT b.ride_id, b.seats, b.created_at,
                u.full_name AS user_name, u.account_type, u.verification_status,
                h.name AS hotel_name
         FROM ride_bookings b
         LEFT JOIN users u ON u.id = b.user_id
         LEFT JOIN hotels h ON h.id = b.hotel_id
         WHERE b.ride_id = ANY($1)
         ORDER BY b.created_at ASC`,
        [rows.map((r) => r.id)]
      );
      for (const b of reservations) {
        (parRide[b.ride_id] ??= []).push(b);
      }
    }

    res.json(
      rows.map((r) => {
        const out = serializeRide(r, PRICING_TZS);
        const usd = sharedSeatUsdForRoute(r.origin, r.destination);
        out.bookings = (parRide[r.id] ?? []).map((b) => {
          if (b.hotel_name) {
            return {
              seats: b.seats,
              client_type: 'hotel',
              client_name: b.hotel_name,
              price_per_seat: round2(usd * (1 - config.hotelDiscountRate)),
              currency: 'USD',
            };
          }
          if (b.account_type === 'local') {
            return {
              seats: b.seats,
              client_type: 'local',
              client_name: b.user_name ?? null,
              price_per_seat: Number(r.price_per_seat),
              currency: 'TZS',
            };
          }
          const resident = b.account_type === 'resident' && b.verification_status === 'verified';
          return {
            seats: b.seats,
            client_type: resident ? 'resident' : 'tourist',
            client_name: b.user_name ?? null,
            price_per_seat: resident ? round2(usd * (1 - config.residentDiscountRate)) : usd,
            currency: 'USD',
          };
        });
        return out;
      })
    );
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
    const { seats } = z
      .object({ seats: z.number().int().min(1).max(8) })
      .parse(req.body);
    if (!req.auth.userId && !req.auth.hotelId && !isAdmin(req)) {
      throw new HttpError(403, 'forbidden', 'Réservé aux clients et aux hôtels partenaires');
    }

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

    // Étiquette du réservateur pour le message à l'équipe.
    let booker = 'équipe zanziGo';
    if (req.auth.userId) {
      const { rows } = await query('SELECT full_name, phone FROM users WHERE id = $1', [
        req.auth.userId,
      ]);
      if (rows[0]) booker = `${rows[0].full_name} (${rows[0].phone})`;
    } else if (req.auth.hotelId) {
      const { rows } = await query('SELECT name, phone FROM hotels WHERE id = $1', [
        req.auth.hotelId,
      ]);
      if (rows[0]) booker = `${rows[0].name} (hôtel, ${rows[0].phone})`;
    }

    await query(
      `INSERT INTO ride_bookings (ride_id, user_id, hotel_id, seats)
       VALUES ($1, $2, $3, $4)`,
      [rideMaj.id, req.auth.userId ?? null, req.auth.hotelId ?? null, seats]
    );

    const depart = new Date(rideMaj.departure_at).toLocaleString('fr-FR', {
      timeZone: 'Africa/Dar_es_Salaam',
      dateStyle: 'short',
      timeStyle: 'short',
    });
    const notification = buildTeamNotificationLink(
      [
        '🚌 Réservation confirmée — trajet partagé zanziGo',
        `Trajet: ${rideMaj.origin} → ${rideMaj.destination}`,
        `Départ: ${depart}`,
        `Places réservées: ${seats} (restantes: ${rideMaj.seats_available})`,
        `Client: ${booker}`,
        `Réf: ${rideMaj.id}`,
      ].join('\n')
    );

    const pricing = await viewerPricing(req);
    const sortie = serializeRide(rideMaj, pricing);
    // Le lien de CETTE réponse notifie la réservation (et remplace le lien
    // générique « demande de place »).
    sortie.whatsapp_link = notification;
    sortie.booked_seats = seats;
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

    const { rows } = await query(
      `UPDATE posted_rides
       SET seats_available = COALESCE($1, seats_available),
           status = COALESCE($2, status)
       WHERE id = $3
       RETURNING *`,
      [data.seatsAvailable ?? null, data.status ?? null, req.params.id]
    );
    res.json(serializeRide(rows[0], isAdmin(req) ? { mode: 'both', usd: config.sharedRideUsdPerSeat } : PRICING_TZS));
  })
);

export default router;
