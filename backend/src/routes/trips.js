import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isAdmin, requireAuth, requireAdmin } from '../middleware/auth.js';
import { priceTrip } from '../services/pricingService.js';
import { createPaymentOrder, isStubMode } from '../services/pesapalService.js';
import { circuitPaiementUsd } from '../services/paypalService.js';
import { buildTeamNotificationLink, tripRequestMessage } from '../services/whatsappService.js';
import { assertHotelVerified } from './hotels.js';
import { randomUUID } from 'node:crypto';

const router = Router();

// Une course est réservée soit par un compte client (userId), soit par un
// hôtel partenaire pour l'un de ses clients (hotelId + nom et téléphone).
const createTripSchema = z
  .object({
    userId: z.string().uuid().optional(),
    hotelId: z.string().uuid().optional(),
    clientName: z.string().min(2).optional(),
    clientPhone: z.string().min(6).optional(),
    tripType: z.enum(['private', 'shared_tourist', 'shared_local', 'posted_return']),
    pickupLocation: z.string().min(2),
    dropoffLocation: z.string().min(2),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine((d) => Boolean(d.userId) !== Boolean(d.hotelId), {
    path: ['userId'],
    message: 'Fournir soit userId (client), soit hotelId (hôtel) — pas les deux',
  })
  .refine((d) => !d.hotelId || (d.clientName && d.clientPhone), {
    path: ['clientName'],
    message: "clientName et clientPhone requis pour une réservation d'hôtel",
  });

const assignDriverSchema = z.object({ driverId: z.string().uuid() });
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
// Le client ne peut réserver que pour lui-même (userId = jeton).
// Règle métier : le tarif local (shared_local) est réservé aux résidents
// dont le document a été vérifié par l'équipe.
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = createTripSchema.parse(req.body);

    let bookerLabel;
    let audience;

    if (data.userId) {
      // ----- Réservation par un compte client -----
      if (!isAdmin(req) && data.userId !== req.auth.userId) {
        throw new HttpError(403, 'forbidden', 'Un client ne peut réserver que pour lui-même');
      }
      const { rows: userRows } = await query('SELECT * FROM users WHERE id = $1', [data.userId]);
      const user = userRows[0];
      if (!user) throw notFound('Utilisateur');
      // Profil radié par l'équipe : plus aucune réservation possible.
      if (user.banned_at) {
        throw new HttpError(403, 'account_blocked', "Compte bloqué par l'équipe zanziGo — contactez-nous sur WhatsApp");
      }

      if (user.account_type === 'local') {
        // Le tarif local (TZS) exige une carte d'identité tanzanienne validée.
        if (user.verification_status !== 'verified') {
          throw new HttpError(
            403,
            'local_not_verified',
            "Le tarif local nécessite une carte d'identité tanzanienne vérifiée (validation en cours)"
          );
        }
        audience = 'local';
      } else {
        if (data.tripType === 'shared_local') {
          throw new HttpError(
            403,
            'local_only',
            "Le taxi partagé local est réservé aux locaux munis d'une carte d'identité tanzanienne"
          );
        }
        // La remise résident (-10 %) ne s'applique qu'une fois les documents
        // de résidence validés — en attendant, plein tarif touriste.
        audience =
          user.account_type === 'resident' && user.verification_status === 'verified'
            ? 'resident'
            : 'tourist';
      }
      bookerLabel = `${user.full_name} (${user.phone})`;
    } else {
      // ----- Réservation par un hôtel partenaire, pour son client -----
      if (!isAdmin(req) && data.hotelId !== req.auth.hotelId) {
        throw new HttpError(403, 'forbidden', 'Un hôtel ne peut réserver que pour ses propres clients');
      }
      const { rows: hotelRows } = await query('SELECT * FROM hotels WHERE id = $1', [data.hotelId]);
      const hotel = hotelRows[0];
      if (!hotel) throw notFound('Hôtel');
      assertHotelVerified(hotel);

      if (data.tripType === 'shared_local') {
        throw new HttpError(
          403,
          'local_only',
          "Le taxi partagé local est réservé aux locaux munis d'une carte d'identité tanzanienne"
        );
      }
      audience = 'hotel';
      bookerLabel = `${hotel.name} (hôtel) pour ${data.clientName} (${data.clientPhone})`;
    }

    const pricing = priceTrip(data.tripType, audience, {
      pickup: data.pickupLocation,
      dropoff: data.dropoffLocation,
    });
    if (!pricing) {
      throw new HttpError(
        400,
        'unsupported_trip_type',
        `Le type de trajet ${data.tripType} n'est pas disponible pour ce profil`
      );
    }

    const { rows } = await query(
      `INSERT INTO trips (user_id, hotel_id, client_name, client_phone, trip_type, pickup_location, dropoff_location, scheduled_at, price, commission, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        data.userId ?? null,
        data.hotelId ?? null,
        data.clientName ?? null,
        data.clientPhone ?? null,
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

    const whatsappLink = buildTeamNotificationLink(tripRequestMessage(trip, bookerLabel));
    const updated = await query('UPDATE trips SET whatsapp_link = $1 WHERE id = $2 RETURNING *', [
      whatsappLink,
      trip.id,
    ]);
    res.status(201).json(updated.rows[0]);
  })
);

// GET /trips?userId= ou ?hotelId= — historique (le titulaire ou l'équipe).
// Sans userId ni hotelId : liste globale, réservée à l'équipe (tableau de
// bord), avec filtre optionnel ?status= (ex. requested = à traiter).
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId, hotelId, status } = z
      .object({
        userId: z.string().uuid().optional(),
        hotelId: z.string().uuid().optional(),
        status: z
          .enum(['requested', 'driver_confirmed', 'paid', 'in_progress', 'completed', 'cancelled'])
          .optional(),
      })
      .refine((d) => !(d.userId && d.hotelId), {
        path: ['userId'],
        message: 'Fournir userId ou hotelId, pas les deux',
      })
      .parse(req.query);

    if (!userId && !hotelId) {
      if (!isAdmin(req)) {
        throw new HttpError(403, 'forbidden', 'Fournir userId ou hotelId (liste globale réservée à l\'équipe)');
      }
      const params = [];
      let where = '';
      if (status) {
        params.push(status);
        where = 'WHERE status = $1';
      }
      const { rows } = await query(
        `SELECT * FROM trips ${where} ORDER BY created_at DESC LIMIT 200`,
        params
      );
      return res.json(rows);
    }

    if (userId) {
      if (!isAdmin(req) && userId !== req.auth.userId) {
        throw new HttpError(403, 'forbidden', 'Accès réservé au titulaire du compte');
      }
      const { rows } = await query(
        'SELECT * FROM trips WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      return res.json(rows);
    }

    if (!isAdmin(req) && hotelId !== req.auth.hotelId) {
      throw new HttpError(403, 'forbidden', "Accès réservé à l'hôtel concerné");
    }
    const { rows } = await query(
      'SELECT * FROM trips WHERE hotel_id = $1 ORDER BY created_at DESC',
      [hotelId]
    );
    res.json(rows);
  })
);

// GET /trips/:id — détail (le client, le chauffeur assigné ou l'équipe).
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const trip = await getTrip(req.params.id);
    const allowed =
      isAdmin(req) ||
      (trip.user_id !== null && trip.user_id === req.auth.userId) ||
      (trip.hotel_id !== null && trip.hotel_id === req.auth.hotelId) ||
      (trip.driver_id !== null && trip.driver_id === req.auth.driverId);
    if (!allowed) {
      throw new HttpError(403, 'forbidden', 'Accès réservé au réservateur, au chauffeur assigné ou à l\'équipe');
    }
    res.json(trip);
  })
);

// PATCH /trips/:id/assign-driver — l'équipe confirme un chauffeur (équipe uniquement).
router.patch(
  '/:id/assign-driver',
  requireAdmin,
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

// POST /trips/:id/payment — lien de paiement (client ou équipe) : PayPal si
// configuré (USD), sinon Pesapal/stub. Règle métier : le paiement ne peut
// être demandé qu'après confirmation d'un chauffeur — jamais avant.
router.post(
  '/:id/payment',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { method } = z
      .object({ method: z.enum(['credit']).optional() })
      .parse(req.body ?? {});
    const trip = await getTrip(req.params.id);
    const isBooker =
      (trip.user_id !== null && trip.user_id === req.auth.userId) ||
      (trip.hotel_id !== null && trip.hotel_id === req.auth.hotelId);
    if (!isAdmin(req) && !isBooker) {
      throw new HttpError(403, 'forbidden', 'Accès réservé au réservateur de la course');
    }

    if (trip.status !== 'driver_confirmed') {
      throw new HttpError(
        409,
        'invalid_status',
        `Le paiement ne peut être demandé qu'après confirmation d'un chauffeur (statut actuel: ${trip.status})`
      );
    }

    // ----- Paiement par CRÉDIT PRÉPAYÉ (hôtels partenaires) -----
    // Débit atomique du solde, paiement confirmé immédiatement, course payée
    // dans la foulée — aucun circuit externe.
    if (method === 'credit') {
      if (!trip.hotel_id || trip.hotel_id !== req.auth.hotelId) {
        throw new HttpError(403, 'forbidden', 'Le paiement par crédit est réservé à l\'hôtel réservateur');
      }
      const paiement = await withTransaction(async (client) => {
        const { rows: hotelRows } = await client.query(
          'SELECT credit_balance FROM hotels WHERE id = $1 FOR UPDATE',
          [trip.hotel_id]
        );
        const solde = Number(hotelRows[0].credit_balance);
        if (solde < Number(trip.price)) {
          throw new HttpError(
            409,
            'insufficient_credit',
            `Crédit insuffisant (solde: ${solde} USD, course: ${trip.price} ${trip.currency})`
          );
        }
        await client.query('UPDATE hotels SET credit_balance = credit_balance - $1 WHERE id = $2', [
          trip.price,
          trip.hotel_id,
        ]);
        await client.query(
          `INSERT INTO hotel_credit_transactions (hotel_id, amount, reason, reference)
           VALUES ($1, $2, 'trip_payment', $3)`,
          [trip.hotel_id, -trip.price, trip.id]
        );
        const { rows } = await client.query(
          `INSERT INTO payments (trip_id, amount, currency, pesapal_reference, status, confirmed_at)
           VALUES ($1, $2, $3, $4, 'confirmed', now())
           RETURNING *`,
          [trip.id, trip.price, trip.currency, `CREDIT-${randomUUID()}`]
        );
        await client.query(
          `UPDATE trips SET status = 'paid' WHERE id = $1 AND status = 'driver_confirmed'`,
          [trip.id]
        );
        await client.query(
          `UPDATE payments SET status = 'failed'
           WHERE id <> $1 AND status = 'pending' AND trip_id = $2`,
          [rows[0].id, trip.id]
        );
        return rows[0];
      });
      res.status(201).json({ ...paiement, payment_method: 'credit' });
      return;
    }

    const paypal = await circuitPaiementUsd({
      amount: trip.price,
      currency: trip.currency,
      description: `zanziGo trajet ${trip.id}`,
    });
    // Sans PayPal ni clés Pesapal : lien WhatsApp vers l'équipe (montant et
    // référence pré-remplis), validation dans le tableau de bord — même
    // circuit manuel que les colis. Avec clés Pesapal : lien Pesapal réel.
    let circuit = paypal;
    if (!circuit && isStubMode()) {
      circuit = {
        reference: `WHATSAPP-${randomUUID()}`,
        paymentLink: buildTeamNotificationLink(
          [
            '💳 Paiement course zanziGo',
            `Réf: ${trip.id}`,
            `Trajet: ${trip.pickup_location} → ${trip.dropoff_location}`,
            `Montant: ${trip.price} ${trip.currency}`,
            'Bonjour, je souhaite régler cette course — merci de m\'envoyer le lien de paiement.',
          ].join('\n')
        ),
        method: 'manual',
      };
    }
    const { reference, paymentLink } =
      circuit ??
      (await createPaymentOrder({
        amount: trip.price,
        currency: trip.currency,
        description: `zanziGo trajet ${trip.id}`,
      }));

    const { rows } = await query(
      `INSERT INTO payments (trip_id, amount, currency, pesapal_reference, payment_link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [trip.id, trip.price, trip.currency, reference, paymentLink]
    );
    // payment_method (non stocké) : l'app affiche « J'ai payé — vérifier »
    // pour les circuits vérifiables (PayPal capture, Pesapal statut réel).
    res.status(201).json({
      ...rows[0],
      payment_method: paypal?.method ?? (isStubMode() ? 'manual' : 'pesapal'),
    });
  })
);

// PATCH /trips/:id/start — le chauffeur assigné (ou l'équipe) démarre la
// course d'une simple touche. Pas de QR à scanner : la position GPS déjà
// partagée en continu (PATCH /drivers/:id/location) reste la preuve de
// terrain, sans friction supplémentaire pour le chauffeur.
router.patch(
  '/:id/start',
  requireAuth,
  asyncHandler(async (req, res) => {
    const trip = await getTrip(req.params.id);
    if (!isAdmin(req) && (!req.auth.driverId || trip.driver_id !== req.auth.driverId)) {
      throw new HttpError(403, 'forbidden', 'Accès réservé au chauffeur assigné à cette course');
    }

    if (trip.status !== 'paid') {
      throw new HttpError(
        409,
        'invalid_status',
        `Le départ ne peut être déclaré que sur un trajet payé (statut actuel: ${trip.status})`
      );
    }

    const { rows } = await query(
      `UPDATE trips SET status = 'in_progress', started_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json(rows[0]);
  })
);

// PATCH /trips/:id/complete — le chauffeur assigné (ou l'équipe) clôture la
// course d'une simple touche. Incrémente les stats mensuelles du chauffeur
// (support du programme de fidélité) — ce qui débloque son paiement.
router.patch(
  '/:id/complete',
  requireAuth,
  asyncHandler(async (req, res) => {
    const trip = await getTrip(req.params.id);
    if (!isAdmin(req) && (!req.auth.driverId || trip.driver_id !== req.auth.driverId)) {
      throw new HttpError(403, 'forbidden', 'Accès réservé au chauffeur assigné à cette course');
    }

    if (trip.status !== 'in_progress') {
      throw new HttpError(
        409,
        'invalid_status',
        `L'arrivée ne peut être déclarée que sur un trajet en cours (statut actuel: ${trip.status})`
      );
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

// POST /trips/:id/cancel — annulation par le réservateur (client ou hôtel)
// tant que la course n'est pas payée. L'équipe peut aussi annuler une course
// déjà payée (le remboursement se règle à la main, via WhatsApp). Les
// paiements encore en attente sont marqués 'failed' pour ne pas rester
// confirmables sur une course morte.
router.post(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const trip = await getTrip(req.params.id);
    const isBooker =
      (trip.user_id !== null && trip.user_id === req.auth.userId) ||
      (trip.hotel_id !== null && trip.hotel_id === req.auth.hotelId);
    if (!isAdmin(req) && !isBooker) {
      throw new HttpError(403, 'forbidden', 'Seul le réservateur de la course peut l\'annuler');
    }

    const annulables = isAdmin(req)
      ? ['requested', 'driver_confirmed', 'paid']
      : ['requested', 'driver_confirmed'];
    if (!annulables.includes(trip.status)) {
      throw new HttpError(
        409,
        'invalid_status',
        trip.status === 'paid'
          ? "Course déjà payée — contactez l'équipe sur WhatsApp pour l'annuler et être remboursé"
          : `Cette course ne peut plus être annulée (statut actuel: ${trip.status})`
      );
    }

    const updated = await withTransaction(async (client) => {
      await client.query(
        `UPDATE payments SET status = 'failed' WHERE trip_id = $1 AND status = 'pending'`,
        [req.params.id]
      );
      const { rows } = await client.query(
        `UPDATE trips SET status = 'cancelled' WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      return rows[0];
    });
    res.json(updated);
  })
);

// POST /trips/:id/rating — note du chauffeur (1-5), à sens unique :
// une course déjà notée renvoie 409 Conflict. Réservé au client de la course.
router.post(
  '/:id/rating',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = ratingSchema.parse(req.body);
    const trip = await getTrip(req.params.id);
    const isBooker =
      (trip.user_id !== null && trip.user_id === req.auth.userId) ||
      (trip.hotel_id !== null && trip.hotel_id === req.auth.hotelId);
    if (!isAdmin(req) && !isBooker) {
      throw new HttpError(403, 'forbidden', 'Seul le réservateur de la course peut la noter');
    }

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
