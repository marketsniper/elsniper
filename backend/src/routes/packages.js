import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { query, withTransaction } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isAdmin, requireAuth } from '../middleware/auth.js';
import { pricePackage } from '../services/pricingService.js';
import { circuitPaiementUsd } from '../services/paypalService.js';
import { createPaymentOrder, isStubMode } from '../services/pesapalService.js';
import { generatePackageQr } from '../services/qrService.js';
import { buildTeamNotificationLink, packageRequestMessage } from '../services/whatsappService.js';
import { assertHotelVerified } from './hotels.js';

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
    /** Téléphone de l'expéditeur pour la ramasse (absent = celui du compte). */
    senderPhone: z.string().min(6).optional(),
    description: z.string().max(1000).optional(),
    /** Heure de ramassage souhaitée (absent = dès que possible). */
    pickupAt: z.string().datetime({ offset: true }).optional(),
    /** Hôtel : utiliser un bon fidélité « colis offert » (envoi gratuit). */
    useVoucher: z.boolean().optional(),
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
// celle du compte pour un user ; USD avec −5 % pour un hôtel partenaire
// (même grille que les touristes).
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

    let currency = 'USD';
    let remise = 0;
    let senderLabel;
    // Téléphone de ramasse : celui saisi, sinon celui du compte expéditeur.
    let senderPhone = data.senderPhone ?? null;
    if (data.senderType === 'user') {
      const { rows } = await query('SELECT * FROM users WHERE id = $1', [data.senderUserId]);
      if (!rows[0]) throw notFound('Utilisateur expéditeur');
      // Profil radié par l'équipe : plus aucune réservation possible.
      if (rows[0].banned_at) {
        throw new HttpError(403, 'account_blocked', "Compte bloqué par l'équipe zanziGo — contactez-nous sur WhatsApp");
      }
      currency = rows[0].currency;
      senderPhone = senderPhone ?? rows[0].phone;
      senderLabel = `${rows[0].full_name} (client, ${senderPhone})`;
    } else {
      const { rows } = await query('SELECT * FROM hotels WHERE id = $1', [data.senderHotelId]);
      if (!rows[0]) throw notFound('Hôtel expéditeur');
      assertHotelVerified(rows[0]);
      remise = config.hotelDiscountRate; // hôtel : grille touriste −5 %
      senderPhone = senderPhone ?? rows[0].phone;
      senderLabel = `${rows[0].name} (hôtel, ${senderPhone})`;
    }

    // Bon fidélité : réservé aux hôtels — vérifié AVANT toute création.
    if (data.useVoucher && data.senderType !== 'hotel') {
      throw new HttpError(403, 'forbidden', 'Les bons fidélité sont réservés aux hôtels partenaires');
    }

    const pricing = pricePackage(currency, data.size, remise);
    const qrCode = generatePackageQr();

    const pkg = await withTransaction(async (client) => {
      // Bon fidélité « colis offert » : on consomme UN bon disponible
      // (verrouillé contre le double usage), le colis naît directement PAYÉ
      // — l'hôtel ne débourse rien, le chauffeur garde son gain normal
      // (la part est prise sur zanziGo, c'est le cadeau de fidélité).
      let bon = null;
      if (data.useVoucher) {
        const { rows: bons } = await client.query(
          `SELECT id FROM hotel_vouchers
           WHERE hotel_id = $1 AND status = 'available'
           ORDER BY earned_at ASC LIMIT 1
           FOR UPDATE SKIP LOCKED`,
          [data.senderHotelId]
        );
        bon = bons[0] ?? null;
        if (!bon) {
          throw new HttpError(409, 'no_voucher', "Aucun bon « colis offert » disponible sur ce compte");
        }
      }

      const { rows } = await client.query(
        `INSERT INTO packages (sender_type, sender_user_id, sender_hotel_id, size, qr_code, pickup_location,
                               dropoff_location, recipient_name, recipient_phone, sender_phone, description, pickup_at, price, commission, currency, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
          senderPhone,
          data.description ?? null,
          data.pickupAt ?? null,
          pricing.price,
          pricing.commission,
          pricing.currency,
          bon ? 'paid' : 'created',
        ]
      );

      if (bon) {
        await client.query(
          `UPDATE hotel_vouchers SET status = 'used', used_at = now(), package_id = $1 WHERE id = $2`,
          [rows[0].id, bon.id]
        );
        // Trace comptable : paiement confirmé, couvert par le bon.
        await client.query(
          `INSERT INTO payments (package_id, amount, currency, pesapal_reference, status, confirmed_at)
           VALUES ($1, $2, $3, $4, 'confirmed', now())`,
          [rows[0].id, rows[0].price, rows[0].currency, `VOUCHER-${bon.id}`]
        );
      }
      return rows[0];
    });

    res.status(201).json({
      ...pkg,
      voucher_used: data.useVoucher === true,
      whatsapp_link: buildTeamNotificationLink(packageRequestMessage(pkg, senderLabel)),
    });
  })
);

// GET /packages — la « bourse aux colis » du mode chauffeur : tous les colis
// PAYÉS en attente de ramassage (aucun chauffeur assigné), notamment les
// envois programmés par les hôtels partenaires. Chauffeurs et équipe
// uniquement. Volontairement minimal : ni QR ni coordonnées du destinataire
// avant le ramassage (le chauffeur les obtient en scannant le colis).
// Les demandes EXPIRENT après 48 h : un colis jamais ramassé disparaît de la
// bourse (l'équipe le voit toujours et règle le cas avec l'expéditeur).
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isAdmin(req) && !req.auth.driverId) {
      throw new HttpError(403, 'forbidden', 'Accès réservé aux chauffeurs');
    }
    const { rows } = await query(
      `SELECT p.id, p.size, p.status, p.sender_type, p.pickup_location, p.dropoff_location,
              p.description, p.pickup_at, p.price, p.commission, p.currency, p.created_at,
              h.name AS sender_hotel_name, u.full_name AS sender_user_name
       FROM packages p
       LEFT JOIN hotels h ON h.id = p.sender_hotel_id
       LEFT JOIN users u ON u.id = p.sender_user_id
       WHERE p.status = 'paid' AND p.driver_id IS NULL
         AND p.created_at >= now() - interval '48 hours'
       ORDER BY COALESCE(p.pickup_at, p.created_at) ASC
       LIMIT 100`
    );
    res.json(rows);
  })
);

// Avant le ramassage, pas de QR pour le chauffeur (anti-fraude : seul le
// scan du colis PHYSIQUE prouve la prise en charge). Le chauffeur qui a
// réservé la livraison voit en revanche les téléphones de l'expéditeur et
// du destinataire — nécessaires pour organiser la ramasse et la remise.
function sansSecretsChauffeur(pkg) {
  const { qr_code, ...reste } = pkg;
  return reste;
}

// GET /packages/mine — les colis du chauffeur connecté : réservés (à
// ramasser) et en cours de livraison. Déclarée avant /:id.
router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.auth.driverId) {
      throw new HttpError(403, 'forbidden', 'Accès réservé aux chauffeurs');
    }
    const { rows } = await query(
      `SELECT * FROM packages
       WHERE driver_id = $1 AND status IN ('paid', 'picked_up')
       ORDER BY COALESCE(pickup_at, created_at) ASC`,
      [req.auth.driverId]
    );
    res.json(rows.map((pkg) => (pkg.status === 'paid' ? sansSecretsChauffeur(pkg) : pkg)));
  })
);

// POST /packages/:id/claim — « Je prends la livraison » : le chauffeur
// RÉSERVE le colis en un clic (premier arrivé, premier servi). Réservation
// ATOMIQUE : la condition driver_id IS NULL du UPDATE empêche deux
// chauffeurs de prendre le même colis. Il disparaît aussitôt de la bourse ;
// le scan du QR au ramassage reste la preuve de prise en charge.
router.post(
  '/:id/claim',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.auth.driverId) {
      throw new HttpError(403, 'forbidden', 'Accès réservé aux chauffeurs');
    }
    const { rows: driverRows } = await query(
      `SELECT full_name, phone FROM drivers WHERE id = $1 AND verification_status = 'verified'`,
      [req.auth.driverId]
    );
    if (!driverRows[0]) {
      throw new HttpError(403, 'driver_not_verified', "Votre compte chauffeur n'a pas encore été validé");
    }

    const { rows } = await query(
      `UPDATE packages SET driver_id = $1
       WHERE id = $2 AND status = 'paid' AND driver_id IS NULL
       RETURNING *`,
      [req.auth.driverId, req.params.id]
    );
    if (!rows[0]) {
      const pkg = await getPackage(req.params.id); // 404 si le colis n'existe pas
      throw new HttpError(
        409,
        'package_already_taken',
        pkg.driver_id
          ? 'Trop tard — un autre chauffeur a déjà pris cette livraison'
          : `Ce colis n'est pas réservable (statut actuel: ${pkg.status})`
      );
    }

    const chauffeur = driverRows[0];
    const pkg = rows[0];
    const whatsappLink = buildTeamNotificationLink(
      [
        '🚚 Livraison prise par un chauffeur zanziGo',
        `Chauffeur: ${chauffeur.full_name} (${chauffeur.phone})`,
        `Trajet: ${pkg.pickup_location} → ${pkg.dropoff_location}`,
        `Taille: ${pkg.size} — ${pkg.price} ${pkg.currency}`,
        `Réf: ${pkg.id}`,
      ].join('\n')
    );
    res.json({ ...sansSecretsChauffeur(pkg), whatsapp_link: whatsappLink });
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
    // Chauffeur assigné mais colis pas encore ramassé : détail SANS le QR ni
    // le téléphone du destinataire (ils arrivent au scan du colis).
    const chauffeurAvantRamassage =
      !isAdmin(req) &&
      !isSender(pkg, req.auth) &&
      pkg.driver_id === req.auth.driverId &&
      pkg.status === 'paid';
    res.json(chauffeurAvantRamassage ? sansSecretsChauffeur(pkg) : pkg);
  })
);

// POST /packages/:id/payment — lien de paiement Pesapal (expéditeur ou équipe).
router.post(
  '/:id/payment',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { method } = z
      .object({ method: z.enum(['credit']).optional() })
      .parse(req.body ?? {});
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

    // ----- Paiement par CRÉDIT PRÉPAYÉ (hôtels partenaires) -----
    if (method === 'credit') {
      if (!pkg.sender_hotel_id || pkg.sender_hotel_id !== req.auth.hotelId) {
        throw new HttpError(403, 'forbidden', 'Le paiement par crédit est réservé à l\'hôtel expéditeur');
      }
      const { paiement, hotelNom, soldeRestant } = await withTransaction(async (client) => {
        const { rows: hotelRows } = await client.query(
          'SELECT name, credit_balance FROM hotels WHERE id = $1 FOR UPDATE',
          [pkg.sender_hotel_id]
        );
        const solde = Number(hotelRows[0].credit_balance);
        if (solde < Number(pkg.price)) {
          throw new HttpError(
            409,
            'insufficient_credit',
            `Crédit insuffisant (solde: ${solde} USD, colis: ${pkg.price} ${pkg.currency})`
          );
        }
        await client.query('UPDATE hotels SET credit_balance = credit_balance - $1 WHERE id = $2', [
          pkg.price,
          pkg.sender_hotel_id,
        ]);
        await client.query(
          `INSERT INTO hotel_credit_transactions (hotel_id, amount, reason, reference)
           VALUES ($1, $2, 'package_payment', $3)`,
          [pkg.sender_hotel_id, -pkg.price, pkg.id]
        );
        const { rows } = await client.query(
          `INSERT INTO payments (package_id, amount, currency, pesapal_reference, status, confirmed_at)
           VALUES ($1, $2, $3, $4, 'confirmed', now())
           RETURNING *`,
          [pkg.id, pkg.price, pkg.currency, `CREDIT-${randomUUID()}`]
        );
        await client.query(
          `UPDATE packages SET status = 'paid' WHERE id = $1 AND status = 'created'`,
          [pkg.id]
        );
        await client.query(
          `UPDATE payments SET status = 'failed'
           WHERE id <> $1 AND status = 'pending' AND package_id = $2`,
          [rows[0].id, pkg.id]
        );
        return {
          paiement: rows[0],
          hotelNom: hotelRows[0].name,
          soldeRestant: Math.round((solde - Number(pkg.price)) * 100) / 100,
        };
      });
      // L'équipe est ALERTÉE comme pour tout paiement : lien WhatsApp
      // pré-rempli ouvert par l'app de l'hôtel + ligne « Derniers paiements
      // reçus » (badge crédit) dans le tableau de bord.
      const alerteEquipe = buildTeamNotificationLink(
        [
          '💳 Paiement reçu par CRÉDIT — colis zanziGo',
          `Hôtel: ${hotelNom}`,
          `Colis: ${pkg.pickup_location} → ${pkg.dropoff_location}`,
          `Montant: ${pkg.price} ${pkg.currency} (déjà encaissé — payé avec le crédit prépayé)`,
          `Solde crédit restant: ${soldeRestant} USD`,
          `Réf: ${pkg.qr_code}`,
        ].join('\n')
      );
      res.status(201).json({ ...paiement, payment_method: 'credit', whatsapp_link: alerteEquipe });
      return;
    }

    // Circuit USD automatique (PayPal) si configuré ; sinon Pesapal RÉEL
    // (mobile money M-Pesa/Tigo/Airtel + cartes) dès que les clés sont
    // présentes ; en dernier recours (mode stub) paiement MANUEL : le lien
    // ouvre WhatsApp vers l'équipe, qui confirme une fois l'argent reçu.
    const paypal = await circuitPaiementUsd({
      amount: pkg.price,
      currency: pkg.currency,
      description: `zanziGo colis ${pkg.qr_code}`,
    });
    let circuit = paypal;
    if (!circuit && !isStubMode()) {
      circuit = await createPaymentOrder({
        amount: pkg.price,
        currency: pkg.currency,
        description: `zanziGo colis ${pkg.qr_code}`,
      });
    }
    const reference = circuit?.reference ?? `WHATSAPP-${randomUUID()}`;
    const paymentLink =
      circuit?.paymentLink ??
      buildTeamNotificationLink(
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
    res.status(201).json({
      ...rows[0],
      payment_method: paypal?.method ?? (isStubMode() ? 'manual' : 'pesapal'),
    });
  })
);

// GET /packages/:id/position — position GPS du chauffeur pendant la
// livraison (expéditeur, chauffeur assigné ou équipe). Disponible uniquement
// quand le colis est en route (picked_up) et que le chauffeur partage sa
// position depuis son app (écran chauffeur ouvert).
router.get(
  '/:id/position',
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
    if (pkg.status !== 'picked_up' || !pkg.driver_id) {
      throw new HttpError(
        409,
        'not_in_transit',
        'Le suivi GPS n\'est disponible que pendant la livraison (colis ramassé)'
      );
    }
    const { rows } = await query('SELECT * FROM driver_positions WHERE driver_id = $1', [
      pkg.driver_id,
    ]);
    if (!rows[0]) {
      throw new HttpError(
        404,
        'position_unavailable',
        "Le chauffeur n'a pas encore partagé sa position"
      );
    }
    res.json(rows[0]);
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
    // Un colis réservé (« Je prends la livraison ») ne peut être ramassé que
    // par le chauffeur qui l'a réservé.
    if (pkg.driver_id && req.auth.driverId && pkg.driver_id !== req.auth.driverId) {
      throw new HttpError(
        409,
        'package_already_taken',
        'Cette livraison est réservée par un autre chauffeur'
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
