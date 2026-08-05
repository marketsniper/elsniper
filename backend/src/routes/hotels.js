import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

const createHotelSchema = z.object({
  name: z.string().min(2),
  contactName: z.string().min(2),
  phone: z.string().min(6),
  zone: z.string().min(2),
  address: z.string().optional(),
});

// POST /hotels — inscription partenaire (simplifiée).
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createHotelSchema.parse(req.body);
    const { rows } = await query(
      `INSERT INTO hotels (name, contact_name, phone, zone, address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.name, data.contactName, data.phone, data.zone, data.address ?? null]
    );
    res.status(201).json(rows[0]);
  })
);

// GET /hotels/:id — détail hôtel.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM hotels WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw notFound('Hôtel');
    res.json(rows[0]);
  })
);

// GET /hotels/:id/packages — historique des colis de l'hôtel.
router.get(
  '/:id/packages',
  asyncHandler(async (req, res) => {
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
