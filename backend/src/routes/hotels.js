import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isAdmin, requireAuth } from '../middleware/auth.js';
import { hashPassword } from '../services/passwordService.js';

const router = Router();

const createHotelSchema = z.object({
  name: z.string().min(2),
  contactName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8, 'Mot de passe : 8 caractères minimum'),
  // Numéro WhatsApp de l'établissement (contact équipe), pas un identifiant.
  phone: z.string().min(6),
  zone: z.string().min(2),
  address: z.string().optional(),
});

// Le hash de mot de passe ne sort JAMAIS de l'API.
export function sanitizeHotel(hotel) {
  if (!hotel) return hotel;
  const { password_hash, ...rest } = hotel;
  return rest;
}

// POST /hotels — création de compte partenaire (public, rate limité).
// Identité de connexion : email + mot de passe (voir /auth/hotel-login).
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createHotelSchema.parse(req.body);
    const passwordHash = await hashPassword(data.password);
    const { rows } = await query(
      `INSERT INTO hotels (name, contact_name, email, password_hash, phone, zone, address)
       VALUES ($1, $2, lower($3), $4, $5, $6, $7)
       RETURNING *`,
      [
        data.name,
        data.contactName,
        data.email,
        passwordHash,
        data.phone,
        data.zone,
        data.address ?? null,
      ]
    );
    res.status(201).json(sanitizeHotel(rows[0]));
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
    res.json(sanitizeHotel(rows[0]));
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
