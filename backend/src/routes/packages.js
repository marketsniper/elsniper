import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { pricePackage } from '../services/pricingService.js';
import { createPaymentLink } from '../services/pesapalService.js';
import { generatePackageQr } from '../services/qrService.js';
import { buildTeamNotificationLink, packageRequestMessage } from '../services/whatsappService.js';

const router = Router();

const createPackageSchema = z
  .object({
    senderType: z.enum(['user', 'hotel']),
    senderUserId: z.string().uuid().optional(),
    senderHotelId: z.string().uuid().optional(),
    pickupLocation: z.string().min(2),
    dropoffLocation: z.string().min(2),
    recipientName: z.string().min(2),
    recipientPhone: z.string().min(6),
    description: z.string().max(1000).optional(),
  })
  .refine((d) => (d.senderType === 'user' ? !!d.senderUserId && !d.senderHotelId : true), {
    path: ['senderUserId'],
    message: "senderUserId requis (et senderHotelId interdit) quand senderType = 'user'",
  })
  .refine((d) => (d.senderType === 'hotel' ? !!d.senderHotelId && !d.senderUserId : true), {
    path: ['senderHotelId'],
    message: "senderHotelId requis (et senderUserId interdit) quand senderType = 'hotel'",
  });

const scanSchema = z.object({
  qrCode: z.string().min(1),
  photoUrl: z.string().url(),
  driverId: z.string().uuid().optional(),
});

async function getPackage(id) {
  const { rows } = await query('SELECT * FROM packages WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('Colis');
  return rows[0];
}

// POST /packages — création de la demande (utilisateur ou hôtel).
// Génère le QR colis unique et fige le prix. La devise suit l'expéditeur :
// celle du compte pour un user, TZS pour un hôtel partenaire.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createPackageSchema.parse(req.body);

    let currency = 'TZS';
    let senderLabel;
    if (data.senderType === 'user') {
      const { rows } = await query('SELECT * FROM users WHERE id = $1', [data.senderUserId]);
      if (!rows[0]) throw notFound('Utilisateur expéditeur');
      currency = rows[0].currency;
      senderLabel = `${rows[0].full_name} (client, ${rows[0].phone})`;
    } else {
      const { rows } = await query('SELECT * FROM hotels WHERE id = $1', [data.senderHotelId]);
      if (!rows[0]) throw notFound('Hôtel expéditeur');
      senderLabel = `${rows[0].name} (hôtel, ${rows[0].phone})`;
    }

    const pricing = pricePackage(currency);
    const qrCode = generatePackageQr();

    const { rows } = await query(
      `INSERT INTO packages (sender_type, sender_user_id, sender_hotel_id, qr_code, pickup_location,
                             dropoff_location, recipient_name, recipient_phone, description, price, commission, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        data.senderType,
        data.senderUserId ?? null,
        data.senderHotelId ?? null,
        qrCode,
        data.pickupLocation,
        data.dropoffLocation,
        data.recipientName,
        data.recipientPhone,
        data.description ?? null,
        pricing.price,
        pricing.commission,
        pricing.currency,
      ]
    );
    const pkg = rows[0];

    res.status(201).json({
      ...pkg,
      whatsapp_link: buildTeamNotificationLink(packageRequestMessage(pkg, senderLabel)),
    });
  })
);

// GET /packages/by-qr/:qrCode — lookup par QR (usage app chauffeur).
// Déclarée avant /:id pour ne pas être interceptée par la route paramétrée.
router.get(
  '/by-qr/:qrCode',
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM packages WHERE qr_code = $1', [req.params.qrCode]);
    if (!rows[0]) throw notFound('Colis');
    res.json(rows[0]);
  })
);

// GET /packages/:id — détail.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getPackage(req.params.id));
  })
);

// POST /packages/:id/payment — lien de paiement Pesapal.
router.post(
  '/:id/payment',
  asyncHandler(async (req, res) => {
    const pkg = await getPackage(req.params.id);

    if (pkg.status !== 'created') {
      throw new HttpError(
        409,
        'invalid_status',
        `Le paiement ne peut être demandé que sur un colis nouvellement créé (statut actuel: ${pkg.status})`
      );
    }

    const { reference, paymentLink } = await createPaymentLink({
      amount: pkg.price,
      currency: pkg.currency,
      description: `zanziGo colis ${pkg.id}`,
    });

    const { rows } = await query(
      `INSERT INTO payments (package_id, amount, currency, pesapal_reference, payment_link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [pkg.id, pkg.price, pkg.currency, reference, paymentLink]
    );
    res.status(201).json(rows[0]);
  })
);

// PATCH /packages/:id/pickup — photo + scan QR au ramassage.
// Le QR scanné doit être celui de CE colis. Le chauffeur qui ramasse
// peut être enregistré via driverId (optionnel au MVP).
router.patch(
  '/:id/pickup',
  asyncHandler(async (req, res) => {
    const data = scanSchema.parse(req.body);
    const pkg = await getPackage(req.params.id);

    if (pkg.status !== 'paid') {
      throw new HttpError(
        409,
        'invalid_status',
        `Le ramassage ne peut être scanné que sur un colis payé (statut actuel: ${pkg.status})`
      );
    }
    if (pkg.qr_code !== data.qrCode) {
      throw new HttpError(403, 'qr_mismatch', 'Ce QR ne correspond pas à ce colis');
    }

    if (data.driverId) {
      const { rows } = await query(
        `SELECT id FROM drivers WHERE id = $1 AND verification_status = 'verified'`,
        [data.driverId]
      );
      if (!rows[0]) throw new HttpError(409, 'driver_not_verified', 'Chauffeur inconnu ou non validé');
    }

    const { rows } = await query(
      `UPDATE packages
       SET status = 'picked_up', pickup_photo_url = $1, picked_up_at = now(),
           driver_id = COALESCE($2, driver_id)
       WHERE id = $3 RETURNING *`,
      [data.photoUrl, data.driverId ?? null, req.params.id]
    );
    res.json(rows[0]);
  })
);

// PATCH /packages/:id/deliver — photo + scan QR à la livraison.
router.patch(
  '/:id/deliver',
  asyncHandler(async (req, res) => {
    const data = scanSchema.parse(req.body);
    const pkg = await getPackage(req.params.id);

    if (pkg.status !== 'picked_up') {
      throw new HttpError(
        409,
        'invalid_status',
        `La livraison ne peut être scannée que sur un colis ramassé (statut actuel: ${pkg.status})`
      );
    }
    if (pkg.qr_code !== data.qrCode) {
      throw new HttpError(403, 'qr_mismatch', 'Ce QR ne correspond pas à ce colis');
    }

    const { rows } = await query(
      `UPDATE packages
       SET status = 'delivered', delivery_photo_url = $1, delivered_at = now()
       WHERE id = $2 RETURNING *`,
      [data.photoUrl, req.params.id]
    );
    res.json(rows[0]);
  })
);

export default router;
