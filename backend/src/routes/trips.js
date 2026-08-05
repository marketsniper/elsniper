import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { priceTrip } from '../services/pricingService.js';
import { createPaymentLink } from '../services/pesapalService.js';
import { buildTeamNotificationLink, tripRequestMessage } from '../services/whatsappService.js';

const router = Router();

const createTripSchema = z.object({
  userId: z.string().uuid(),
  tripType: z.enum(['private', 'shared_tourist', 'shared_local', 'posted_return']),
  pickupLocation: z.string().min(2),
  dropoffLocation: z.string().min(2),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
});

const assignDriverSchema = z.object({ driverId: z.string().uuid() });
const scanSchema = z.object({ qrCode: z.string().min(1) });
const ratingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

async function getTrip(id) {
  const { rows } = await query('SELECT * FROM trips WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('Trajet');
  return rows[0];
}

// POST /trips — demande de trajet : calcule le prix (figé), génère le lien
// WhatsApp pour que l'équipe organise le matching manuellement.
// Règle métier : le tarif local (shared_local) est réservé aux résidents
// dont le document a été vérifié par l'équipe.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createTripSchema.parse(req.body);

    const { rows: userRows } = await query('SELECT * FROM users WHERE id = $1', [data.userId]);
    const user = userRows[0];
    if (!user) throw notFound('Utilisateur');

    if (data.tripType === 'shared_local') {
      if (user.account_type !== 'resident') {
        throw new HttpError(403, 'resident_only', 'Le tarif local est réservé aux comptes résidents');
      }
      if (user.verification_status !== 'verified') {
        throw new HttpError(
          403,
          'resident_not_verified',
          "Le tarif local nécessite un compte résident vérifié (document en cours de validation)"
        );
      }
    }

    const pricing = priceTrip(data.tripType, user.currency);
    if (!pricing) {
      throw new HttpError(
        400,
        'unsupported_trip_type',
        `Le type de trajet ${data.tripType} n'est pas disponible en ${user.currency}`
      );
    }

    const { rows } = await query(
      `INSERT INTO trips (user_id, trip_type, pickup_location, dropoff_location, scheduled_at, price, commission, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.userId,
        data.tripType,
        data.pickupLocation,
        data.dropoffLocation,
        data.scheduledAt ?? null,
        pricing.price,
        pricing.commission,
        pricing.currency,
      ]
    );
    let trip = rows[0];

    const whatsappLink = buildTeamNotificationLink(tripRequestMessage(trip, user));
    const updated = await query('UPDATE trips SET whatsapp_link = $1 WHERE id = $2 RETURNING *', [
      whatsappLink,
      trip.id,
    ]);
    res.status(201).json(updated.rows[0]);
  })
);

// GET /trips?userId= — historique d'un utilisateur.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.query);
    const { rows } = await query(
      'SELECT * FROM trips WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    res.json(rows);
  })
);

// GET /trips/:id — détail.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getTrip(req.params.id));
  })
);

// PATCH /trips/:id/assign-driver — l'équipe confirme un chauffeur.
router.patch(
  '/:id/assign-driver',
  asyncHandler(async (req, res) => {
    const { driverId } = assignDriverSchema.parse(req.body);
    const trip = await getTrip(req.params.id);

    if (trip.status !== 'requested') {
      throw new HttpError(
        409,
        'invalid_status',
        `Un chauffeur ne peut être assigné que sur un trajet 'requested' (statut actuel: ${trip.status})`
      );
    }

    const { rows: driverRows } = await query('SELECT * FROM drivers WHERE id = $1', [driverId]);
    const driver = driverRows[0];
    if (!driver) throw notFound('Chauffeur');
    if (driver.verification_status !== 'verified') {
      throw new HttpError(409, 'driver_not_verified', "Ce chauffeur n'a pas encore été validé par l'équipe");
    }
    if (!driver.available) {
      throw new HttpError(409, 'driver_not_available', "Ce chauffeur n'est pas disponible");
    }

    const { rows } = await query(
      `UPDATE trips SET driver_id = $1, status = 'driver_confirmed' WHERE id = $2 RETURNING *`,
      [driverId, req.params.id]
    );
    res.json(rows[0]);
  })
);

// POST /trips/:id/payment — génère le lien de paiement Pesapal.
// Règle métier : le paiement ne peut être demandé qu'après confirmation
// d'un chauffeur — jamais avant.
router.post(
  '/:id/payment',
  asyncHandler(async (req, res) => {
    const trip = await getTrip(req.params.id);

    if (trip.status !== 'driver_confirmed') {
      throw new HttpError(
        409,
        'invalid_status',
        `Le paiement ne peut être demandé qu'après confirmation d'un chauffeur (statut actuel: ${trip.status})`
      );
    }

    const { reference, paymentLink } = await createPaymentLink({
      amount: trip.price,
      currency: trip.currency,
      description: `zanziGo trajet ${trip.id}`,
    });

    const { rows } = await query(
      `INSERT INTO payments (trip_id, amount, currency, pesapal_reference, payment_link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [trip.id, trip.price, trip.currency, reference, paymentLink]
    );
    res.status(201).json(rows[0]);
  })
);

// PATCH /trips/:id/start — scan du QR véhicule au départ.
// Règle métier : le QR scanné doit correspondre au véhicule du chauffeur
// assigné à CETTE course — pas n'importe quel QR véhicule valide.
router.patch(
  '/:id/start',
  asyncHandler(async (req, res) => {
    const { qrCode } = scanSchema.parse(req.body);
    const trip = await getTrip(req.params.id);

    if (trip.status !== 'paid') {
      throw new HttpError(
        409,
        'invalid_status',
        `Le départ ne peut être scanné que sur un trajet payé (statut actuel: ${trip.status})`
      );
    }

    const { rows: driverRows } = await query('SELECT vehicle_qr_code FROM drivers WHERE id = $1', [
      trip.driver_id,
    ]);
    if (driverRows[0]?.vehicle_qr_code !== qrCode) {
      throw new HttpError(403, 'qr_mismatch', 'Ce QR ne correspond pas au véhicule assigné à cette course');
    }

    const { rows } = await query(
      `UPDATE trips SET status = 'in_progress', started_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json(rows[0]);
  })
);

// PATCH /trips/:id/complete — scan du QR véhicule à l'arrivée.
// Clôture la course et incrémente les stats mensuelles du chauffeur
// (support du programme de fidélité) — ce qui débloque son paiement.
router.patch(
  '/:id/complete',
  asyncHandler(async (req, res) => {
    const { qrCode } = scanSchema.parse(req.body);
    const trip = await getTrip(req.params.id);

    if (trip.status !== 'in_progress') {
      throw new HttpError(
        409,
        'invalid_status',
        `L'arrivée ne peut être scannée que sur un trajet en cours (statut actuel: ${trip.status})`
      );
    }

    const { rows: driverRows } = await query('SELECT vehicle_qr_code FROM drivers WHERE id = $1', [
      trip.driver_id,
    ]);
    if (driverRows[0]?.vehicle_qr_code !== qrCode) {
      throw new HttpError(403, 'qr_mismatch', 'Ce QR ne correspond pas au véhicule assigné à cette course');
    }

    const updated = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE trips SET status = 'completed', completed_at = now() WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      await client.query(
        `INSERT INTO driver_monthly_stats (driver_id, month, trips_completed)
         VALUES ($1, date_trunc('month', now())::date, 1)
         ON CONFLICT (driver_id, month)
         DO UPDATE SET trips_completed = driver_monthly_stats.trips_completed + 1`,
        [trip.driver_id]
      );
      return rows[0];
    });
    res.json(updated);
  })
);

// POST /trips/:id/rating — note du chauffeur (1-5), à sens unique :
// une course déjà notée renvoie 409 Conflict.
router.post(
  '/:id/rating',
  asyncHandler(async (req, res) => {
    const data = ratingSchema.parse(req.body);
    const trip = await getTrip(req.params.id);

    if (trip.status !== 'completed') {
      throw new HttpError(409, 'invalid_status', 'Seule une course terminée peut être notée');
    }
    if (trip.rating !== null) {
      throw new HttpError(409, 'already_rated', 'Cette course a déjà été notée');
    }

    const updated = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'UPDATE trips SET rating = $1, rating_comment = $2 WHERE id = $3 RETURNING *',
        [data.rating, data.comment ?? null, req.params.id]
      );

      // Moyenne et compteur recalculés depuis les courses réellement notées —
      // pas d'incrément aveugle qui pourrait dériver.
      await client.query(
        `UPDATE drivers d SET
           rating_avg = s.avg_rating,
           rating_count = s.nb
         FROM (
           SELECT AVG(rating)::numeric(3,2) AS avg_rating, COUNT(*) AS nb
           FROM trips WHERE driver_id = $1 AND rating IS NOT NULL
         ) s
         WHERE d.id = $1`,
        [trip.driver_id]
      );

      await client.query(
        `UPDATE driver_monthly_stats m SET rating_avg = s.avg_rating
         FROM (
           SELECT AVG(rating)::numeric(3,2) AS avg_rating
           FROM trips
           WHERE driver_id = $1 AND rating IS NOT NULL
             AND date_trunc('month', completed_at) = date_trunc('month', now())
         ) s
         WHERE m.driver_id = $1 AND m.month = date_trunc('month', now())::date`,
        [trip.driver_id]
      );

      return rows[0];
    });
    res.json(updated);
  })
);

export default router;
