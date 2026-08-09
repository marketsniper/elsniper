import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isAdmin, requireAuth, requireAdmin } from '../middleware/auth.js';
import { generateVehicleQr } from '../services/qrService.js';

const router = Router();

// Candidature Taxi Partner : 3 documents obligatoires — permis de conduire,
// assurance du véhicule et photo du véhicule. Pièce d'identité optionnelle.
const createDriverSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(6),
  licenseNumber: z.string().min(3),
  vehiclePlate: z.string().min(3),
  vehicleModel: z.string().optional(),
  zone: z.string().min(2),
  licenseDocumentUrl: z.string().url(),
  insuranceDocumentUrl: z.string().url(),
  vehiclePhotoUrl: z.string().url(),
  idDocumentUrl: z.string().url().optional(),
});

const verifySchema = z.object({
  status: z.enum(['verified', 'rejected']),
});

const searchSchema = z.object({
  zone: z.string().optional(),
  available: z.enum(['true', 'false']).optional(),
  // Par défaut, seuls les chauffeurs vérifiés sortent (recherche d'assignation) ;
  // le tableau de bord équipe demande verificationStatus=pending pour les
  // candidatures à traiter.
  verificationStatus: z.enum(['pending', 'verified', 'rejected']).optional(),
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
      `INSERT INTO drivers (full_name, phone, license_number, vehicle_plate, vehicle_model, zone,
                            license_document_url, insurance_document_url, vehicle_photo_url, id_document_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        data.fullName,
        data.phone,
        data.licenseNumber,
        data.vehiclePlate,
        data.vehicleModel ?? null,
        data.zone,
        data.licenseDocumentUrl,
        data.insuranceDocumentUrl,
        data.vehiclePhotoUrl,
        data.idDocumentUrl ?? null,
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
    const { zone, available, verificationStatus } = searchSchema.parse(req.query);

    const params = [verificationStatus ?? 'verified'];
    const conditions = ['verification_status = $1'];
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

// GET /drivers/:id/stats — compteur de gains du chauffeur (lui-même ou
// l'équipe) : courses terminées et colis livrés sur trois fenêtres
// (aujourd'hui depuis minuit à Zanzibar, 7 et 30 derniers jours), avec les
// gains NETS (prix − commission zanziGo) totalisés par devise. Sert le
// modèle « payé après chaque course ».
router.get(
  '/:id/stats',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isAdmin(req) && req.auth.driverId !== req.params.id) {
      throw new HttpError(403, 'forbidden', 'Accès réservé au chauffeur concerné');
    }

    // Minuit local à Zanzibar (UTC+3, pas d'heure d'été).
    const EAT_MS = 3 * 3600 * 1000;
    const maintenantEat = new Date(Date.now() + EAT_MS);
    const minuitEat =
      Date.UTC(
        maintenantEat.getUTCFullYear(),
        maintenantEat.getUTCMonth(),
        maintenantEat.getUTCDate()
      ) - EAT_MS;
    const JOUR_MS = 24 * 3600 * 1000;
    const debuts = {
      today: new Date(minuitEat),
      week: new Date(minuitEat - 6 * JOUR_MS),
      month: new Date(minuitEat - 29 * JOUR_MS),
    };

    const [{ rows: courses }, { rows: colis }] = await Promise.all([
      query(
        `SELECT completed_at AS quand, price, commission, currency
         FROM trips
         WHERE driver_id = $1 AND status = 'completed' AND completed_at >= $2`,
        [req.params.id, debuts.month]
      ),
      query(
        `SELECT delivered_at AS quand, price, commission, currency
         FROM packages
         WHERE driver_id = $1 AND status = 'delivered' AND delivered_at >= $2`,
        [req.params.id, debuts.month]
      ),
    ]);

    const round2 = (n) => Math.round(n * 100) / 100;
    const fenetreVide = () => ({ courses: 0, colis: 0, gains: {} });
    const stats = { today: fenetreVide(), week: fenetreVide(), month: fenetreVide() };
    const ajouter = (ligne, type) => {
      const quand = new Date(ligne.quand).getTime();
      const net = Number(ligne.price) - Number(ligne.commission);
      for (const cle of ['today', 'week', 'month']) {
        if (quand >= debuts[cle].getTime()) {
          stats[cle][type] += 1;
          stats[cle].gains[ligne.currency] = round2(
            (stats[cle].gains[ligne.currency] ?? 0) + net
          );
        }
      }
    };
    for (const ligne of courses) ajouter(ligne, 'courses');
    for (const ligne of colis) ajouter(ligne, 'colis');

    res.json(stats);
  })
);

// PATCH /drivers/:id/location {lat, lng} — le chauffeur envoie sa position
// (lui-même uniquement, ou l'équipe). Une seule ligne par chauffeur, écrasée
// à chaque envoi : aucune trace d'historique n'est conservée.
router.patch(
  '/:id/location',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { lat, lng } = z
      .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
      .parse(req.body);
    if (!isAdmin(req) && req.auth.driverId !== req.params.id) {
      throw new HttpError(403, 'forbidden', 'Un chauffeur ne peut envoyer que sa propre position');
    }
    const { rows: driverRows } = await query('SELECT id FROM drivers WHERE id = $1', [req.params.id]);
    if (!driverRows[0]) throw notFound('Chauffeur');

    const { rows } = await query(
      `INSERT INTO driver_positions (driver_id, lat, lng)
       VALUES ($1, $2, $3)
       ON CONFLICT (driver_id) DO UPDATE SET lat = $2, lng = $3, updated_at = now()
       RETURNING *`,
      [req.params.id, lat, lng]
    );
    res.json(rows[0]);
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
