import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isAdmin, requireAuth, requireAdmin } from '../middleware/auth.js';
import { hashPassword } from '../services/passwordService.js';

const router = Router();

// Garde partagée (trips, packages, rides) : un hôtel ne peut réserver que si
// l'équipe a vérifié son compte — parade aux fausses inscriptions au nom
// d'un établissement réel.
export function assertHotelVerified(hotel) {
  if (hotel.verification_status !== 'verified') {
    throw new HttpError(
      403,
      'hotel_not_verified',
      "Compte hôtel en attente de vérification par l'équipe zanziGo — vous serez contacté rapidement"
    );
  }
}

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

// GET /hotels?verificationStatus= — liste des comptes hôtels (équipe
// uniquement) ; par défaut les inscriptions en attente de vérification.
router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { verificationStatus } = z
      .object({ verificationStatus: z.enum(['pending', 'verified', 'rejected']).optional() })
      .parse(req.query);
    const { rows } = await query(
      'SELECT * FROM hotels WHERE verification_status = $1 ORDER BY created_at DESC',
      [verificationStatus ?? 'pending']
    );
    res.json(rows.map(sanitizeHotel));
  })
);

// PATCH /hotels/:id/verify — l'équipe valide (ou bloque) un compte hôtel
// après avoir vérifié, par téléphone ou WhatsApp au numéro officiel de
// l'établissement, que l'inscription vient bien de l'hôtel. Un compte déjà
// validé peut être bloqué ensuite (rejected), et inversement réintégré.
router.patch(
  '/:id/verify',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(['verified', 'rejected']) }).parse(req.body);

    const { rows } = await query('SELECT * FROM hotels WHERE id = $1', [req.params.id]);
    const hotel = rows[0];
    if (!hotel) throw notFound('Hôtel');
    if (hotel.verification_status === status) {
      throw new HttpError(409, 'invalid_status', `Ce compte hôtel est déjà « ${status} »`);
    }

    const updated = await query(
      'UPDATE hotels SET verification_status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    res.json(sanitizeHotel(updated.rows[0]));
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
