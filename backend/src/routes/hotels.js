import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isAdmin, requireAuth } from '../middleware/auth.js';

const router = Router();

const createHotelSchema = z.object({
  name: z.string().min(2),
  contactName: z.string().min(2),
  phone: z.string().min(6),
  zone: z.string().min(2),
  address: z.string().optional(),
});

// POST /hotels — inscription partenaire (simplifiée).
// Le téléphone du body doit être celui vérifié par OTP (jeton).
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = createHotelSchema.parse(req.body);
    if (!isAdmin(req) && data.phone !== req.auth.phone) {
      throw new HttpError(403, 'phone_mismatch', 'Le téléphone doit être celui vérifié par OTP (jeton)');
    }
    const { rows } = await query(
      `INSERT INTO hotels (name, contact_name, phone, zone, address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.name, data.contactName, data.phone, data.zone, data.address ?? null]
    );
    res.status(201).json(rows[0]);
  })
);

// GET /hotels/:id — détail hôtel (lui-même ou l'équipe).
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isAdmin(req) && req.auth.hotelId !== req.params.id) {
      throw new HttpError(403, 'forbidden', "Accès réservé à l'hôtel concerné");
    }
    const { rows } = await query('SELECT * FROM hotels WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw notFound('Hôtel');
    res.json(rows[0]);
  })
);

// GET /hotels/:id/packages — historique des colis de l'hôtel (lui-même ou l'équipe).
router.get(
  '/:id/packages',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isAdmin(req) && req.auth.hotelId !== req.params.id) {
      throw new HttpError(403, 'forbidden', "Accès réservé à l'hôtel concerné");
    }
    const hotel = await query('SELECT id FROM hotels WHERE id = $1', [req.params.id]);
    if (!hotel.rows[0]) throw notFound('Hôtel');

    const { rows } = await query(
      'SELECT * FROM packages WHERE sender_hotel_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(rows);
  })
);

export default router;
