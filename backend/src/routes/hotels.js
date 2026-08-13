import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isAdmin, requireAuth, requireAdmin } from '../middleware/auth.js';
import { hashPassword } from '../services/passwordService.js';
import { emailBienvenueHotel, envoyerEmail, notifierEquipe } from '../services/emailService.js';

// Fidélité : 1 bon toutes les COURSES_PAR_BON courses TERMINÉES réservées
// par l'hôtel — la rampe de lancement de zanziGo, ce sont les hôtels : on
// récompense leur volume. Chaque bon se dépense AU CHOIX :
//  - un envoi de colis OFFERT (useVoucher à la création du colis), ou
//  - VOUCHER_CREDIT_USD dollars versés sur le compte crédit prépayé.
export const COURSES_PAR_BON = 20;
export const VOUCHER_CREDIT_USD = 10;

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
    // Récapitulatif + informations de connexion par e-mail — au mieux,
    // jamais bloquant (le mot de passe n'est JAMAIS envoyé).
    const { subject, html } = emailBienvenueHotel(rows[0]);
    envoyerEmail({ to: rows[0].email, subject, html }).catch(() => {});
    // …et l'équipe est prévenue automatiquement qu'un hôtel attend sa
    // vérification.
    notifierEquipe(
      '🏨 Nouvel hôtel inscrit — à vérifier',
      [
        `Établissement: ${rows[0].name}`,
        `Contact: ${rows[0].contact_name}`,
        `Zone: ${rows[0].zone}`,
        `WhatsApp: ${rows[0].phone}`,
        `E-mail: ${rows[0].email}`,
        'À faire: appeler l\'établissement puis Valider/Refuser dans le tableau de bord.',
      ].join('\n')
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

// GET /hotels/:id/fidelite — carte de fidélité de l'hôtel (lui-même ou
// l'équipe). Attribution PARESSEUSE des bons : à chaque consultation, on
// compare les courses terminées aux bons déjà émis et on rattrape l'écart —
// aucune tâche planifiée, verrou sur la ligne hôtel contre le double octroi.
router.get(
  '/:id/fidelite',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isAdmin(req) && req.auth.hotelId !== req.params.id) {
      throw new HttpError(403, 'forbidden', "Accès réservé à l'hôtel concerné");
    }
    const etat = await withTransaction(async (client) => {
      const { rows: hotelRows } = await client.query(
        'SELECT id FROM hotels WHERE id = $1 FOR UPDATE',
        [req.params.id]
      );
      if (!hotelRows[0]) throw notFound('Hôtel');

      const { rows: [{ n }] } = await client.query(
        `SELECT COUNT(*)::int AS n FROM trips WHERE hotel_id = $1 AND status = 'completed'`,
        [req.params.id]
      );
      const { rows: [{ emis }] } = await client.query(
        'SELECT COUNT(*)::int AS emis FROM hotel_vouchers WHERE hotel_id = $1',
        [req.params.id]
      );
      const dus = Math.floor(n / COURSES_PAR_BON);
      for (let i = emis; i < dus; i += 1) {
        await client.query('INSERT INTO hotel_vouchers (hotel_id) VALUES ($1)', [req.params.id]);
      }
      const { rows: bons } = await client.query(
        'SELECT * FROM hotel_vouchers WHERE hotel_id = $1 ORDER BY earned_at DESC',
        [req.params.id]
      );
      return { n, bons };
    });

    res.json({
      completed_trips: etat.n,
      trips_per_voucher: COURSES_PAR_BON,
      voucher_credit_usd: VOUCHER_CREDIT_USD,
      progress: etat.n % COURSES_PAR_BON,
      vouchers_available: etat.bons.filter((b) => b.status === 'available').length,
      vouchers_used: etat.bons.filter((b) => b.status === 'used').length,
      vouchers: etat.bons,
    });
  })
);

// POST /hotels/:id/vouchers/convertir — l'hôtel transforme UN bon fidélité
// en VOUCHER_CREDIT_USD dollars de crédit prépayé (l'autre usage possible du
// bon reste l'envoi de colis offert à la création d'un colis).
router.post(
  '/:id/vouchers/convertir',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isAdmin(req) && req.auth.hotelId !== req.params.id) {
      throw new HttpError(403, 'forbidden', "Accès réservé à l'hôtel concerné");
    }
    const resultat = await withTransaction(async (client) => {
      const { rows: hotelRows } = await client.query(
        'SELECT credit_balance FROM hotels WHERE id = $1 FOR UPDATE',
        [req.params.id]
      );
      if (!hotelRows[0]) throw notFound('Hôtel');
      const { rows: bons } = await client.query(
        `SELECT id FROM hotel_vouchers
         WHERE hotel_id = $1 AND status = 'available'
         ORDER BY earned_at ASC LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [req.params.id]
      );
      if (!bons[0]) {
        throw new HttpError(409, 'no_voucher', 'Aucun bon fidélité disponible sur ce compte');
      }
      await client.query(
        `UPDATE hotel_vouchers SET status = 'used', used_at = now() WHERE id = $1`,
        [bons[0].id]
      );
      const solde = Number(hotelRows[0].credit_balance) + VOUCHER_CREDIT_USD;
      await client.query('UPDATE hotels SET credit_balance = $1 WHERE id = $2', [
        solde,
        req.params.id,
      ]);
      await client.query(
        `INSERT INTO hotel_credit_transactions (hotel_id, amount, reason, reference)
         VALUES ($1, $2, 'voucher_credit', $3)`,
        [req.params.id, VOUCHER_CREDIT_USD, bons[0].id]
      );
      return solde;
    });
    res.json({ balance: resultat, currency: 'USD', credited: VOUCHER_CREDIT_USD });
  })
);

// GET /hotels/:id/credit — solde prépayé + derniers mouvements.
router.get(
  '/:id/credit',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isAdmin(req) && req.auth.hotelId !== req.params.id) {
      throw new HttpError(403, 'forbidden', "Accès réservé à l'hôtel concerné");
    }
    const { rows: hotelRows } = await query('SELECT credit_balance FROM hotels WHERE id = $1', [
      req.params.id,
    ]);
    if (!hotelRows[0]) throw notFound('Hôtel');
    const { rows: transactions } = await query(
      `SELECT * FROM hotel_credit_transactions
       WHERE hotel_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.id]
    );
    res.json({ balance: Number(hotelRows[0].credit_balance), currency: 'USD', transactions });
  })
);

const creditSchema = z.object({
  // positif = recharge (l'hôtel a payé l'équipe) ; négatif = correction.
  amount: z
    .number()
    .gte(-10000)
    .lte(10000)
    .refine((n) => n !== 0, 'Montant non nul requis'),
  note: z.string().max(200).optional(),
});

// POST /hotels/:id/credit — l'ÉQUIPE crédite (ou corrige) le compte d'un
// hôtel après réception de l'argent (mobile money, espèces, virement).
// Quand les clés Pesapal seront actives, la recharge en ligne directe
// s'ajoutera par-dessus le même livre de comptes.
router.post(
  '/:id/credit',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { amount, note } = creditSchema.parse(req.body);
    const resultat = await withTransaction(async (client) => {
      const { rows: hotelRows } = await client.query(
        'SELECT credit_balance FROM hotels WHERE id = $1 FOR UPDATE',
        [req.params.id]
      );
      if (!hotelRows[0]) throw notFound('Hôtel');
      const solde = Number(hotelRows[0].credit_balance) + amount;
      if (solde < 0) {
        throw new HttpError(
          409,
          'insufficient_credit',
          `Solde insuffisant (actuel: ${hotelRows[0].credit_balance} USD)`
        );
      }
      await client.query('UPDATE hotels SET credit_balance = $1 WHERE id = $2', [
        solde,
        req.params.id,
      ]);
      await client.query(
        `INSERT INTO hotel_credit_transactions (hotel_id, amount, reason, reference)
         VALUES ($1, $2, $3, $4)`,
        [req.params.id, amount, amount > 0 ? 'topup' : 'adjustment', note ?? null]
      );
      return solde;
    });
    res.json({ balance: resultat, currency: 'USD' });
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
