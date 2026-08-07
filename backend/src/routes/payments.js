import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isAdmin, requireAuth } from '../middleware/auth.js';
import { getTransactionStatus, isStubMode } from '../services/pesapalService.js';

const router = Router();

async function getPayment(id) {
  const { rows } = await query('SELECT * FROM payments WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('Paiement');
  return rows[0];
}

// Vrai si le porteur du jeton est le payeur de la cible du paiement
// (client de la course, ou expéditeur du colis).
async function isPayer(payment, auth) {
  if (payment.trip_id) {
    const { rows } = await query('SELECT user_id, hotel_id FROM trips WHERE id = $1', [payment.trip_id]);
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

    // Paiements manuels via WhatsApp (colis) : pas de vérification Pesapal —
    // c'est l'équipe (ou le payeur en phase pilote) qui confirme à la main.
    // Sinon, en mode réel, ne confirmer que si Pesapal confirme la transaction.
    const status = payment.pesapal_reference?.startsWith('WHATSAPP-')
      ? 'COMPLETED'
      : await getTransactionStatus(payment.pesapal_reference);
    if (status !== 'COMPLETED') {
      throw new HttpError(409, 'payment_not_completed', `Transaction non aboutie côté Pesapal (${status})`);
    }

    const updated = await withTransaction(async (client) => {
      const { rows: paymentRows } = await client.query(
        `UPDATE payments SET status = 'confirmed', confirmed_at = now() WHERE id = $1 RETURNING *`,
        [req.params.id]
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
      }

      return paymentRows[0];
    });
    res.json(updated);
  })
);

export default router;
