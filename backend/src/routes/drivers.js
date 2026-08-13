import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isAdmin, requireAuth, requireAdmin } from '../middleware/auth.js';
import { generateVehicleQr } from '../services/qrService.js';
import { valeurReservationPlace } from './stats.js';

import { notifierEquipe } from '../services/emailService.js';

// Le hash de mot de passe ne sort JAMAIS de l'API.
export function sanitizeDriver(driver) {
  if (!driver) return driver;
  const { password_hash, ...rest } = driver;
  return rest;
}

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
  // Parrainage : code ZG-XXXXXX d'un client existant (optionnel).
  referralCode: z.string().min(4).max(12).optional(),
});

// Dates d'expiration des documents (renseignées par l'équipe lors du
// contrôle) : permis et assurance, format AAAA-MM-JJ.
const documentsSchema = z.object({
  licenseExpiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  insuranceExpiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
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
    // Une candidature chauffeur exige un jeton CANDIDAT CHAUFFEUR (numéro +
    // mot de passe choisis à l'inscription chauffeur) ou un numéro vérifié
    // par code — jamais un jeton client.
    if (!isAdmin(req) && req.auth.sansOtp && !req.auth.chauffeurCandidat) {
      throw new HttpError(
        403,
        'driver_register_required',
        'Candidature chauffeur : créez d\'abord votre compte chauffeur (numéro + mot de passe)'
      );
    }
    // Code parrain (un client existant recommande un chauffeur) : validé
    // strictement, comme côté clients.
    let parrain = null;
    if (data.referralCode) {
      const { rows: parrainRows } = await query(
        'SELECT id, full_name FROM users WHERE upper(referral_code) = upper($1)',
        [data.referralCode.trim()]
      );
      parrain = parrainRows[0] ?? null;
      if (!parrain) {
        throw new HttpError(
          400,
          'invalid_referral_code',
          'Code parrain introuvable — vérifiez-le ou laissez le champ vide'
        );
      }
    }
    const { rows } = await query(
      `INSERT INTO drivers (full_name, phone, license_number, vehicle_plate, vehicle_model, zone,
                            license_document_url, insurance_document_url, vehicle_photo_url, id_document_url, password_hash, referred_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        req.auth?.passwordHash ?? null,
        parrain?.id ?? null,
      ]
    );
    // L'équipe est prévenue automatiquement qu'une candidature attend.
    notifierEquipe(
      '🚗 Nouvelle candidature chauffeur — zanziGo',
      [
        `Nom: ${rows[0].full_name}`,
        `Téléphone: ${rows[0].phone}`,
        `Véhicule: ${rows[0].vehicle_model ?? '—'} (${rows[0].vehicle_plate})`,
        `Zone: ${rows[0].zone}`,
        ...(parrain ? [`🤝 Parrainé par: ${parrain.full_name}`] : []),
        'À faire: contrôler les documents dans le tableau de bord (Candidatures).',
      ].join('\n')
    );
    res.status(201).json(sanitizeDriver(rows[0]));
  })
);

// GET /drivers?zone=&available= — recherche de chauffeurs vérifiés (équipe),
// avec la dernière position GPS connue de chacun (driver_positions) pour la
// liste « Mes taxis » du tableau de bord.
router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { zone, available, verificationStatus } = searchSchema.parse(req.query);

    const params = [verificationStatus ?? 'verified'];
    const conditions = ['d.verification_status = $1'];
    if (zone) {
      params.push(zone);
      conditions.push(`d.zone = $${params.length}`);
    }
    if (available !== undefined) {
      params.push(available === 'true');
      conditions.push(`d.available = $${params.length}`);
    }

    const { rows } = await query(
      `SELECT d.*, p.lat AS last_lat, p.lng AS last_lng, p.updated_at AS position_updated_at
       FROM drivers d
       LEFT JOIN driver_positions p ON p.driver_id = d.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.rating_avg DESC NULLS LAST`,
      params
    );
    // Balayage paresseux (comme la clôture des annonces) : permis ou
    // assurance expirant sous 30 jours → l'équipe est alertée, au plus une
    // fois par semaine et par chauffeur.
    verifierExpirationsDocuments().catch(() => {});
    res.json(rows.map(sanitizeDriver));
  })
);

// Alerte documents : chauffeurs VÉRIFIÉS dont le permis ou l'assurance
// expire dans les 30 jours (ou est déjà expiré). Une notification groupée,
// puis silence 7 jours par chauffeur (expiry_notified_at).
async function verifierExpirationsDocuments() {
  const { rows } = await query(
    `UPDATE drivers SET expiry_notified_at = now()
     WHERE verification_status = 'verified'
       AND (license_expires_on <= current_date + 30 OR insurance_expires_on <= current_date + 30)
       AND (expiry_notified_at IS NULL OR expiry_notified_at < now() - interval '7 days')
     RETURNING full_name, phone, license_expires_on, insurance_expires_on`
  );
  if (rows.length === 0) return;
  const lignes = rows.map((d) => {
    const soucis = [];
    if (d.license_expires_on && new Date(d.license_expires_on) <= new Date(Date.now() + 30 * 86400000)) {
      soucis.push(`permis ${d.license_expires_on.toISOString?.().slice(0, 10) ?? d.license_expires_on}`);
    }
    if (d.insurance_expires_on && new Date(d.insurance_expires_on) <= new Date(Date.now() + 30 * 86400000)) {
      soucis.push(`assurance ${d.insurance_expires_on.toISOString?.().slice(0, 10) ?? d.insurance_expires_on}`);
    }
    return `• ${d.full_name} (${d.phone}) — ${soucis.join(', ')}`;
  });
  notifierEquipe(
    '📄 Documents chauffeurs à renouveler — zanziGo',
    ['Permis/assurance expirés ou expirant sous 30 jours :', ...lignes].join('\n')
  );
}

// PATCH /drivers/:id/documents — l'équipe pose les dates d'expiration du
// permis et de l'assurance lors du contrôle des documents.
router.patch(
  '/:id/documents',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = documentsSchema.parse(req.body);
    const { rows: existants } = await query('SELECT id FROM drivers WHERE id = $1', [req.params.id]);
    if (!existants[0]) throw notFound('Chauffeur');
    const { rows } = await query(
      `UPDATE drivers SET
         license_expires_on = COALESCE($1, license_expires_on),
         insurance_expires_on = COALESCE($2, insurance_expires_on),
         expiry_notified_at = NULL
       WHERE id = $3 RETURNING *`,
      [data.licenseExpiresOn ?? null, data.insuranceExpiresOn ?? null, req.params.id]
    );
    res.json(sanitizeDriver(rows[0]));
  })
);

// GET /drivers/:id/trips — les courses assignées au chauffeur (lui-même ou
// l'équipe). C'est la source de l'onglet « Courses » de l'app : dès que
// l'équipe confirme un chauffeur sur une course, elle apparaît ici — sans
// dépendre de l'ouverture manuelle par référence WhatsApp.
router.get(
  '/:id/trips',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isAdmin(req) && req.auth.driverId !== req.params.id) {
      throw new HttpError(403, 'forbidden', 'Accès réservé au chauffeur concerné');
    }
    const { rows } = await query(
      `SELECT * FROM trips
       WHERE driver_id = $1
       ORDER BY COALESCE(scheduled_at, created_at) DESC
       LIMIT 100`,
      [req.params.id]
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

    const [{ rows: courses }, { rows: colis }, { rows: places }] = await Promise.all([
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
      // Places de taxi partagé PAYÉES sur SES annonces : acquises dès le
      // paiement (annulation client impossible à moins de 24 h du départ).
      query(
        `SELECT b.paid_at AS quand, b.seats,
                r.origin, r.destination, r.price_per_seat,
                u.account_type, u.verification_status,
                (b.hotel_id IS NOT NULL) AS par_hotel
         FROM ride_bookings b
         JOIN posted_rides r ON r.id = b.ride_id
         LEFT JOIN users u ON u.id = b.user_id
         WHERE r.driver_id = $1 AND b.paid_at IS NOT NULL
           AND b.cancelled_at IS NULL AND b.paid_at >= $2`,
        [req.params.id, debuts.month]
      ),
    ]);

    const round2 = (n) => Math.round(n * 100) / 100;
    const fenetreVide = () => ({ courses: 0, colis: 0, places: 0, gains: {} });
    const stats = { today: fenetreVide(), week: fenetreVide(), month: fenetreVide() };
    const ajouter = (ligne, type, increment = 1) => {
      const quand = new Date(ligne.quand).getTime();
      const net = Number(ligne.price) - Number(ligne.commission);
      for (const cle of ['today', 'week', 'month']) {
        if (quand >= debuts[cle].getTime()) {
          stats[cle][type] += increment;
          stats[cle].gains[ligne.currency] = round2(
            (stats[cle].gains[ligne.currency] ?? 0) + net
          );
        }
      }
    };
    for (const ligne of courses) ajouter(ligne, 'courses');
    for (const ligne of colis) ajouter(ligne, 'colis');
    for (const ligne of places) {
      const valeur = valeurReservationPlace(ligne);
      ajouter({ quand: ligne.quand, ...valeur }, 'places', ligne.seats);
    }

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
    res.json(sanitizeDriver(rows[0]));
  })
);

// PATCH /drivers/:id/verify — validation d'une candidature OU radiation d'un
// chauffeur déjà vérifié qui ne respecte plus les normes zanziGo
// ('verified' → 'rejected'). Un chauffeur radié peut être réintégré plus
// tard ('rejected' → 'verified'). À la première validation, le QR véhicule
// fixe est généré une seule fois : il ne changera plus jamais ensuite
// (contrairement au QR colis).
router.patch(
  '/:id/verify',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status } = verifySchema.parse(req.body);

    const { rows } = await query('SELECT * FROM drivers WHERE id = $1', [req.params.id]);
    const driver = rows[0];
    if (!driver) throw notFound('Chauffeur');
    if (driver.verification_status === status) {
      throw new HttpError(409, 'invalid_status', `Ce chauffeur est déjà « ${status} »`);
    }

    const vehicleQr =
      status === 'verified' && !driver.vehicle_qr_code ? generateVehicleQr() : driver.vehicle_qr_code;

    // Radiation : le chauffeur disparaît des assignations (filtre 'verified')
    // et ses annonces encore ouvertes sont fermées — plus aucune réservation.
    if (status === 'rejected') {
      await query(
        `UPDATE posted_rides SET status = 'closed' WHERE driver_id = $1 AND status = 'open'`,
        [req.params.id]
      );
    }

    const updated = await query(
      'UPDATE drivers SET verification_status = $1, vehicle_qr_code = $2 WHERE id = $3 RETURNING *',
      [status, vehicleQr, req.params.id]
    );
    res.json(sanitizeDriver(updated.rows[0]));
  })
);

export default router;
