import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// GET /payments/:id — détail.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM payments WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw notFound('Paiement');
    res.json(rows[0]);
  })
);

// POST /payments/:id/confirm — callback de confirmation.
// Simule le webhook IPN Pesapal en attendant la vraie intégration : cette
// route deviendra l'endpoint IPN, avec vérification de signature en plus.
// Fait avancer la cible : trip -> 'paid', package -> 'paid'.
router.post(
  '/:id/confirm',
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM payments WHERE id = $1', [req.params.id]);
    const payment = rows[0];
    if (!payment) throw notFound('Paiement');
    if (payment.status !== 'pending') {
      throw new HttpError(
        409,
        'payment_already_processed',
        `Ce paiement a déjà été traité (statut: ${payment.status})`
      );
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
