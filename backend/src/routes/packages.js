import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isAdmin, requireAuth } from '../middleware/auth.js';
import { pricePackage } from '../services/pricingService.js';
import { generatePackageQr } from '../services/qrService.js';
import { buildTeamNotificationLink, packageRequestMessage } from '../services/whatsappService.js';

const router = Router();

const createPackageSchema = z
  .object({
    senderType: z.enum(['user', 'hotel']),
    senderUserId: z.string().uuid().optional(),
    senderHotelId: z.string().uuid().optional(),
    // Forfait par taille : small (enveloppe/documents), medium (sac à dos),
    // large (grosse valise/caisse).
    size: z.enum(['small', 'medium', 'large']),
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

function isSender(pkg, auth) {
  return (
    (pkg.sender_user_id !== null && pkg.sender_user_id === auth.userId) ||
    (pkg.sender_hotel_id !== null && pkg.sender_hotel_id === auth.hotelId)
  );
}

// POST /packages — création de la demande (utilisateur ou hôtel).
// L'expéditeur ne peut créer que pour lui-même (id du jeton).
// Génère le QR colis unique et fige le prix. La devise suit l'expéditeur :
// celle du compte pour un user, TZS pour un hôtel partenaire.
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = createPackageSchema.parse(req.body);
    if (!isAdmin(req)) {
      if (data.senderType === 'user' && data.senderUserId !== req.auth.userId) {
        throw new HttpError(403, 'forbidden', 'Un client ne peut créer un colis que pour lui-même');
      }
      if (data.senderType === 'hotel' && data.senderHotelId !== req.auth.hotelId) {
        throw new HttpError(403, 'forbidden', 'Un hôtel ne peut créer un colis que pour lui-même');
      }
    }

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

    const pricing = pricePackage(currency, data.size);
    const qrCode = generatePackageQr();

    const { rows } = await query(
      `INSERT INTO packages (sender_type, sender_user_id, sender_hotel_id, size, qr_code, pickup_location,
                             dropoff_location, recipient_name, recipient_phone, description, price, commission, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        data.senderType,
        data.senderUserId ?? null,
        data.senderHotelId ?? null,
        data.size,
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

// GET /packages/by-qr/:qrCode — lookup par QR (chauffeur authentifié ou équipe).
// Déclarée avant /:id pour ne pas être interceptée par la route paramétrée.
router.get(
  '/by-qr/:qrCode',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isAdmin(req) && !req.auth.driverId) {
      throw new HttpError(403, 'forbidden', 'Accès réservé aux chauffeurs');
    }
    const { rows } = await query('SELECT * FROM packages WHERE qr_code = $1', [req.params.qrCode]);
    if (!rows[0]) throw notFound('Colis');
    res.json(rows[0]);
  })
);

// GET /packages/:id — détail (expéditeur, chauffeur assigné ou équipe).
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const pkg = await getPackage(req.params.id);
    const allowed =
      isAdmin(req) ||
      isSender(pkg, req.auth) ||
      (pkg.driver_id !== null && pkg.driver_id === req.auth.driverId);
    if (!allowed) {
      throw new HttpError(403, 'forbidden', "Accès réservé à l'expéditeur, au chauffeur ou à l'équipe");
    }
    res.json(pkg);
  })
);

// POST /packages/:id/payment — lien de paiement Pesapal (expéditeur ou équipe).
router.post(
  '/:id/payment',
  requireAuth,
  asyncHandler(async (req, res) => {
    const pkg = await getPackage(req.params.id);
    if (!isAdmin(req) && !isSender(pkg, req.auth)) {
      throw new HttpError(403, 'forbidden', "Accès réservé à l'expéditeur du colis");
    }

    if (pkg.status !== 'created') {
      throw new HttpError(
        409,
        'invalid_status',
        `Le paiement ne peut être demandé que sur un colis nouvellement créé (statut actuel: ${pkg.status})`
      );
    }

    // Paiement MANUEL des colis : le lien ouvre WhatsApp vers l'équipe, qui
    // crée alors un lien de paiement à la main et confirme une fois payé.
    const reference = `WHATSAPP-${randomUUID()}`;
    const paymentLink = buildTeamNotificationLink(
      [
        '💳 Paiement colis zanziGo',
        `Réf: ${pkg.id}`,
        `QR: ${pkg.qr_code}`,
        `Taille: ${pkg.size}`,
        `Montant: ${pkg.price} ${pkg.currency}`,
        `Trajet: ${pkg.pickup_location} → ${pkg.dropoff_location}`,
        'Bonjour, je souhaite régler ce colis — merci de m’envoyer le lien de paiement.',
      ].join('\n')
    );

    const { rows } = await query(
      `INSERT INTO payments (package_id, amount, currency, pesapal_reference, payment_link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [pkg.id, pkg.price, pkg.currency, reference, paymentLink]
    );
    res.status(201).json(rows[0]);
  })
);

// POST /packages/:id/cancel — annulation par l'expéditeur tant que le colis
// n'est pas payé. L'équipe peut aussi annuler un colis payé non ramassé
// (remboursement géré à la main via WhatsApp). Les paiements en attente
// passent à 'failed'.
router.post(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const pkg = await getPackage(req.params.id);
    if (!isAdmin(req) && !isSender(pkg, req.auth)) {
      throw new HttpError(403, 'forbidden', "Seul l'expéditeur du colis peut l'annuler");
    }

    const annulables = isAdmin(req) ? ['created', 'paid'] : ['created'];
    if (!annulables.includes(pkg.status)) {
      throw new HttpError(
        409,
        'invalid_status',
        pkg.status === 'paid'
          ? "Colis déjà payé — contactez l'équipe sur WhatsApp pour l'annuler et être remboursé"
          : `Ce colis ne peut plus être annulé (statut actuel: ${pkg.status})`
      );
    }

    const updated = await withTransaction(async (client) => {
      await client.query(
        `UPDATE payments SET status = 'failed' WHERE package_id = $1 AND status = 'pending'`,
        [req.params.id]
      );
      const { rows } = await client.query(
        `UPDATE packages SET status = 'cancelled' WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      return rows[0];
    });
    res.json(updated);
  })
);

// PATCH /packages/:id/pickup — photo + scan QR au ramassage (chauffeur ou équipe).
// Le QR scanné doit être celui de CE colis. Le chauffeur qui ramasse est
// enregistré (celui du jeton, ou driverId explicite pour l'équipe).
router.patch(
  '/:id/pickup',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = scanSchema.parse(req.body);
    const pkg = await getPackage(req.params.id);
    if (!isAdmin(req) && !req.auth.driverId) {
      throw new HttpError(403, 'forbidden', 'Accès réservé aux chauffeurs');
    }

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

    // Le chauffeur du jeton par défaut ; l'équipe peut désigner un chauffeur.
    const driverId = req.auth.driverId ?? data.driverId ?? null;
    if (driverId) {
      const { rows } = await query(
        `SELECT id FROM drivers WHERE id = $1 AND verification_status = 'verified'`,
        [driverId]
      );
      if (!rows[0]) throw new HttpError(409, 'driver_not_verified', 'Chauffeur inconnu ou non validé');
    }

    const { rows } = await query(
      `UPDATE packages
       SET status = 'picked_up', pickup_photo_url = $1, picked_up_at = now(),
           driver_id = COALESCE($2, driver_id)
       WHERE id = $3 RETURNING *`,
      [data.photoUrl, driverId, req.params.id]
    );
    res.json(rows[0]);
  })
);

// PATCH /packages/:id/deliver — photo + scan QR à la livraison
// (chauffeur assigné au colis ou équipe).
router.patch(
  '/:id/deliver',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = scanSchema.parse(req.body);
    const pkg = await getPackage(req.params.id);
    if (!isAdmin(req) && (!req.auth.driverId || pkg.driver_id !== req.auth.driverId)) {
      throw new HttpError(403, 'forbidden', 'Accès réservé au chauffeur assigné à ce colis');
    }

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
