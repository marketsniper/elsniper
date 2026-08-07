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
import { RIDE_DESTINATIONS, RIDE_ORIGINS } from '../services/locations.js';

const router = Router();

const createRideSchema = z.object({
  origin: z.enum(RIDE_ORIGINS, { message: 'Point de départ inconnu' }),
  destination: z.enum(RIDE_DESTINATIONS, { message: "Ville d'arrivée inconnue" }),
  departureAt: z.string().datetime({ offset: true }),
  seatsTotal: z.number().int().min(1).max(8),
  pricePerSeat: z.number().positive(),
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

// Lien WhatsApp de demande de place, généré à la volée pour chaque trajet.
function rideWhatsappLink(ride) {
  const depart = new Date(ride.departure_at).toLocaleString('fr-FR', {
    timeZone: 'Africa/Dar_es_Salaam',
    dateStyle: 'short',
    timeStyle: 'short',
  });
  return buildTeamNotificationLink(
    [
      '🚌 Demande de place — trajet partagé zanziGo',
      `Trajet: ${ride.origin} → ${ride.destination}`,
      `Départ: ${depart}`,
      `Prix par place: ${ride.price_per_seat} ${ride.currency}`,
      `Réf: ${ride.id}`,
    ].join('\n')
  );
}

// Le chauffeur poste son prix en shillings ; les visiteurs/touristes voient
// le même trajet en dollars (conversion au taux configuré, arrondie au
// dollar supérieur). L'app affiche l'un ou l'autre selon le profil.
const withLink = (ride) => ({
  ...ride,
  price_per_seat_usd: Math.ceil(Number(ride.price_per_seat) / config.exchangeTzsPerUsd),
  whatsapp_link: rideWhatsappLink(ride),
});

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
        data.pricePerSeat,
        data.notes ?? null,
      ]
    );
    res.status(201).json(withLink(rows[0]));
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
    res.json(rows.map(withLink));
  })
);

// GET /rides/mine — les trajets du chauffeur connecté (tous statuts).
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
    res.json(rows.map(withLink));
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
    res.json(withLink(rows[0]));
  })
);

export default router;
