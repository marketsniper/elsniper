import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isAdmin, requireAuth, requireAdmin } from '../middleware/auth.js';
import { generateVehicleQr } from '../services/qrService.js';

const router = Router();

const createDriverSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(6),
  licenseNumber: z.string().min(3),
  vehiclePlate: z.string().min(3),
  vehicleModel: z.string().optional(),
  zone: z.string().min(2),
  licenseDocumentUrl: z.string().url(),
  idDocumentUrl: z.string().url(),
});

const verifySchema = z.object({
  status: z.enum(['verified', 'rejected']),
});

const searchSchema = z.object({
  zone: z.string().optional(),
  available: z.enum(['true', 'false']).optional(),
});

// POST /drivers — candidature Taxi Partner (avec documents).
// Le téléphone du body doit être celui vérifié par OTP (jeton).
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = createDriverSchema.parse(req.body);
    if (!isAdmin(req) && data.phone !== req.auth.phone) {
      throw new HttpError(403, 'phone_mismatch', 'Le téléphone doit être celui vérifié par OTP (jeton)');
    }
    const { rows } = await query(
      `INSERT INTO drivers (full_name, phone, license_number, vehicle_plate, vehicle_model, zone, license_document_url, id_document_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.fullName,
        data.phone,
        data.licenseNumber,
        data.vehiclePlate,
        data.vehicleModel ?? null,
        data.zone,
        data.licenseDocumentUrl,
        data.idDocumentUrl,
      ]
    );
    res.status(201).json(rows[0]);
  })
);

// GET /drivers?zone=&available= — recherche de chauffeurs vérifiés (équipe).
router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { zone, available } = searchSchema.parse(req.query);

    const conditions = [`verification_status = 'verified'`];
    const params = [];
    if (zone) {
      params.push(zone);
      conditions.push(`zone = $${params.length}`);
    }
    if (available !== undefined) {
      params.push(available === 'true');
      conditions.push(`available = $${params.length}`);
    }

    const { rows } = await query(
      `SELECT * FROM drivers WHERE ${conditions.join(' AND ')} ORDER BY rating_avg DESC NULLS LAST`,
      params
    );
    res.json(rows);
  })
);

// GET /drivers/:id — détail chauffeur (lui-même ou l'équipe).
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isAdmin(req) && req.auth.driverId !== req.params.id) {
      throw new HttpError(403, 'forbidden', 'Accès réservé au chauffeur concerné');
    }
    const { rows } = await query('SELECT * FROM drivers WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw notFound('Chauffeur');
    res.json(rows[0]);
  })
);

// PATCH /drivers/:id/verify — validation manuelle (équipe uniquement).
// À la validation, le QR véhicule fixe est généré une seule fois :
// il ne changera plus jamais ensuite (contrairement au QR colis).
router.patch(
  '/:id/verify',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status } = verifySchema.parse(req.body);

    const { rows } = await query('SELECT * FROM drivers WHERE id = $1', [req.params.id]);
    const driver = rows[0];
    if (!driver) throw notFound('Chauffeur');
    if (driver.verification_status !== 'pending') {
      throw new HttpError(
        409,
        'invalid_status',
        `Cette candidature a déjà été traitée (statut: ${driver.verification_status})`
      );
    }

    const vehicleQr =
      status === 'verified' && !driver.vehicle_qr_code ? generateVehicleQr() : driver.vehicle_qr_code;

    const updated = await query(
      'UPDATE drivers SET verification_status = $1, vehicle_qr_code = $2 WHERE id = $3 RETURNING *',
      [status, vehicleQr, req.params.id]
    );
    res.json(updated.rows[0]);
  })
);

export default router;
