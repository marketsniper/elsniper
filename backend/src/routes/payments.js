import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isAdmin, requireAdmin, requireAuth } from '../middleware/auth.js';
import { getTransactionStatus, isStubMode } from '../services/pesapalService.js';
import { capturePaypalOrder } from '../services/paypalService.js';
import { config } from '../config.js';

const router = Router();

// GET /payments?status=pending — liste pour le tableau de bord équipe, avec
// le contexte de la cible (trajet ou colis) pour un affichage lisible.
router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status } = z
      .object({ status: z.enum(['pending', 'confirmed', 'failed']).optional() })
      .parse(req.query);

    const { rows } = await query(
      `SELECT p.*,
              t.pickup_location  AS trip_pickup,
              t.dropoff_location AS trip_dropoff,
              t.client_name      AS trip_client_name,
              pk.pickup_location  AS package_pickup,
              pk.dropoff_location AS package_dropoff,
              pk.qr_code          AS package_qr,
              r.origin            AS ride_origin,
              r.destination       AS ride_destination,
              rb.seats            AS ride_seats,
              COALESCE(u.full_name, h.name) AS ride_client_name
       FROM payments p
       LEFT JOIN trips t ON t.id = p.trip_id
       LEFT JOIN packages pk ON pk.id = p.package_id
       LEFT JOIN ride_bookings rb ON rb.id = p.ride_booking_id
       LEFT JOIN posted_rides r ON r.id = rb.ride_id
       LEFT JOIN users u ON u.id = rb.user_id
       LEFT JOIN hotels h ON h.id = rb.hotel_id
       WHERE p.status = $1
       ORDER BY p.created_at DESC
       LIMIT 200`,
      [status ?? 'pending']
    );
    res.json(rows);
  })
);

async function getPayment(id) {
  const { rows } = await query('SELECT * FROM payments WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('Paiement');
  return rows[0];
}

// Vrai si le porteur du jeton est le payeur de la cible du paiement (client
// de la course, expéditeur du colis, ou réservateur de la place partagée).
async function isPayer(payment, auth) {
  if (payment.trip_id) {
    const { rows } = await query('SELECT user_id, hotel_id FROM trips WHERE id = $1', [payment.trip_id]);
    if (!rows[0]) return false;
    return (
      (rows[0].user_id !== null && rows[0].user_id === auth.userId) ||
      (rows[0].hotel_id !== null && rows[0].hotel_id === auth.hotelId)
    );
  }
  if (payment.ride_booking_id) {
    const { rows } = await query('SELECT user_id, hotel_id FROM ride_bookings WHERE id = $1', [
      payment.ride_booking_id,
    ]);
    if (!rows[0]) return false;
    return (
      (rows[0].user_id !== null && rows[0].user_id === auth.userId) ||
      (rows[0].hotel_id !== null && rows[0].hotel_id === auth.hotelId)
    );
  }
  const { rows } = await query(
    'SELECT sender_user_id, sender_hotel_id FROM packages WHERE id = $1',
    [payment.package_id]
  );
  if (!rows[0]) return false;
  return (
    (rows[0].sender_user_id !== null && rows[0].sender_user_id === auth.userId) ||
    (rows[0].sender_hotel_id !== null && rows[0].sender_hotel_id === auth.hotelId)
  );
}

// GET /payments/:id — détail (payeur ou équipe).
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payment = await getPayment(req.params.id);
    if (!isAdmin(req) && !(await isPayer(payment, req.auth))) {
      throw new HttpError(403, 'forbidden', 'Accès réservé au payeur ou à l\'équipe');
    }
    res.json(payment);
  })
);

// POST /payments/:id/confirm — confirmation du paiement.
// MODE STUB (sans clés Pesapal) : simule le webhook — réservé au payeur ou à
// l'équipe. MODE RÉEL : cette route sert d'endpoint IPN Pesapal (appelée par
// Pesapal, sans jeton) — la sécurité vient de la vérification du statut réel
// de la transaction via l'API Pesapal (GetTransactionStatus === COMPLETED).
// Fait avancer la cible : trip -> 'paid', package -> 'paid'.
router.post(
  '/:id/confirm',
  asyncHandler(async (req, res, next) => {
    if (isStubMode()) {
      // En stub, on exige l'authentification du payeur (ou l'équipe).
      return requireAuth(req, res, next);
    }
    next();
  }),
  asyncHandler(async (req, res) => {
    const payment = await getPayment(req.params.id);
    if (isStubMode() && !isAdmin(req) && !(await isPayer(payment, req.auth))) {
      throw new HttpError(403, 'forbidden', 'Accès réservé au payeur ou à l\'équipe');
    }
    if (payment.status !== 'pending') {
      throw new HttpError(
        409,
        'payment_already_processed',
        `Ce paiement a déjà été traité (statut: ${payment.status})`
      );
    }

    // Trois familles de références :
    //  - PAYPAL-…  : capture + vérification RÉELLE auprès de PayPal — le
    //    payeur peut déclencher, la vérité vient de PayPal, pas du client ;
    //  - WHATSAPP-… / PAYPALME-… : validation manuelle après réception de
    //    l'argent — réservée à l'équipe en production (tableau de bord) ;
    //  - sinon : Pesapal (stub sans clés, vérification réelle avec).
    const reference = payment.pesapal_reference ?? '';
    let status;
    if (reference.startsWith('PAYPAL-')) {
      status = await capturePaypalOrder(reference.slice('PAYPAL-'.length));
    } else if (reference.startsWith('WHATSAPP-') || reference.startsWith('PAYPALME-')) {
      if (config.env === 'production' && !isAdmin(req)) {
        throw new HttpError(
          403,
          'manual_confirm_admin_only',
          "Paiement manuel : c'est l'équipe qui valide après réception de l'argent"
        );
      }
      status = 'COMPLETED';
    } else {
      status = await getTransactionStatus(reference);
    }
    if (status !== 'COMPLETED') {
      throw new HttpError(
        409,
        'payment_not_completed',
        `Paiement non abouti pour le moment (${status}) — terminez le paiement puis réessayez`
      );
    }

    const updated = await appliquerConfirmation(payment);
    res.json(updated);
  })
);

// Applique la confirmation d'un paiement : paiement 'confirmed', cible
// avancée (course/colis → paid), doublons pending de la même cible soldés.
async function appliquerConfirmation(payment) {
  return withTransaction(async (client) => {
    const { rows: paymentRows } = await client.query(
      `UPDATE payments SET status = 'confirmed', confirmed_at = now() WHERE id = $1 RETURNING *`,
      [payment.id]
    );

    if (payment.trip_id) {
      await client.query(
        `UPDATE trips SET status = 'paid' WHERE id = $1 AND status = 'driver_confirmed'`,
        [payment.trip_id]
      );
    } else if (payment.package_id) {
      await client.query(
        `UPDATE packages SET status = 'paid' WHERE id = $1 AND status = 'created'`,
        [payment.package_id]
      );
    } else if (payment.ride_booking_id) {
      // Place de taxi partagé soldée : la fiche du chauffeur l'affiche payée.
      await client.query(
        `UPDATE ride_bookings SET paid_at = now() WHERE id = $1 AND paid_at IS NULL`,
        [payment.ride_booking_id]
      );
    }

    // Un client qui appuie plusieurs fois sur « payer » crée plusieurs
    // paiements en attente pour la même cible : une fois l'un confirmé,
    // les doublons sont soldés en 'failed' pour ne pas encombrer le
    // tableau de bord équipe.
    await client.query(
      `UPDATE payments SET status = 'failed'
       WHERE id <> $1 AND status = 'pending'
         AND ((trip_id IS NOT NULL AND trip_id = $2)
           OR (package_id IS NOT NULL AND package_id = $3)
           OR (ride_booking_id IS NOT NULL AND ride_booking_id = $4))`,
      [payment.id, payment.trip_id, payment.package_id, payment.ride_booking_id]
    );

    return paymentRows[0];
  });
}

// POST /payments/pesapal-ipn — webhook Pesapal : appelé automatiquement par
// Pesapal quand un paiement change d'état. Sans jeton — la sécurité vient de
// la vérification du statut RÉEL auprès de l'API Pesapal avant toute action.
// Ainsi, un paiement Pesapal se confirme TOUT SEUL, sans que le client ni
// l'équipe n'aient rien à toucher.
router.post(
  '/pesapal-ipn',
  asyncHandler(async (req, res) => {
    const orderTrackingId =
      req.body?.OrderTrackingId ?? req.query?.OrderTrackingId ?? null;
    if (orderTrackingId) {
      const { rows } = await query('SELECT * FROM payments WHERE pesapal_reference = $1', [
        orderTrackingId,
      ]);
      const payment = rows[0];
      if (payment && payment.status === 'pending') {
        const status = await getTransactionStatus(orderTrackingId);
        if (status === 'COMPLETED') {
          await appliquerConfirmation(payment);
        }
      }
    }
    // Réponse au format attendu par Pesapal (statut 200 = notification reçue).
    res.json({
      orderNotificationType: 'IPNCHANGE',
      orderTrackingId,
      status: 200,
    });
  })
);

export default router;
