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

/**
 * Comment nommer ce partenaire à l'écran et dans les messages. Un restaurant
 * qui reçoit « votre hôtel » se demande à qui on parle.
 */
export function libellePartenaire(hotel) {
  return hotel?.partner_type === 'restaurant' ? 'restaurant' : 'hôtel';
}

// Garde partagée (trips, packages, rides) : un partenaire ne peut réserver
// que si l'équipe a vérifié son compte — parade aux fausses inscriptions au
// nom d'un établissement réel.
export function assertHotelVerified(hotel) {
  if (hotel.verification_status !== 'verified') {
    throw new HttpError(
      403,
      'hotel_not_verified',
      `Compte ${libellePartenaire(hotel)} en attente de vérification par l'équipe zanziGo — vous serez contacté rapidement`
    );
  }
}

const createHotelSchema = z.object({
  name: z.string().min(2),
  /**
   * Nature de l'établissement. Un restaurant a les mêmes besoins qu'un
   * hôtel — faire livrer, commander un taxi pour ses clients — et le même
   * compte les sert tous les deux. Absent = hôtel (comptes existants).
   */
  partnerType: z.enum(['hotel', 'restaurant']).optional(),
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
      `INSERT INTO hotels (name, contact_name, email, password_hash, phone, zone, address, partner_type)
       VALUES ($1, $2, lower($3), $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.name,
        data.contactName,
        data.email,
        passwordHash,
        data.phone,
        data.zone,
        data.address ?? null,
        data.partnerType ?? 'hotel',
      ]
    );
    // Récapitulatif + informations de connexion par e-mail — au mieux,
    // jamais bloquant (le mot de passe n'est JAMAIS envoyé).
    const { subject, html } = emailBienvenueHotel(rows[0]);
    envoyerEmail({ to: rows[0].email, subject, html }).catch(() => {});
    // …et l'équipe est prévenue automatiquement qu'un hôtel attend sa
    // vérification.
    const estResto = rows[0].partner_type === 'restaurant';
    notifierEquipe(
      estResto ? '🍽️ Nouveau restaurant inscrit — à vérifier' : '🏨 Nouvel hôtel inscrit — à vérifier',
      [
        `${estResto ? 'Restaurant' : 'Hôtel'}: ${rows[0].name}`,
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
    const { verificationStatus, partnerType } = z
      .object({
        verificationStatus: z.enum(['pending', 'verified', 'rejected']).optional(),
        partnerType: z.enum(['hotel', 'restaurant']).optional(),
      })
      .parse(req.query);
    // partnerType absent = tous les partenaires, hôtels et restaurants mêlés :
    // l'équipe vérifie une file d'attente unique.
    const { rows } = await query(
      `SELECT * FROM hotels
       WHERE verification_status = $1
         AND ($2::text IS NULL OR partner_type = $2)
       ORDER BY created_at DESC`,
      [verificationStatus ?? 'pending', partnerType ?? null]
    );
    res.json(rows.map(sanitizeHotel));
  })
);

// ═══════════════════ LES DEMANDES DE RECHARGE DE CRÉDIT ═══════════════════
// Ces trois routes sont déclarées AVANT toute route « /:id » : Express sert
// la première qui correspond, et « /hotels/credit-requests » serait sinon
// happé par « /hotels/:id » avec id = "credit-requests".

/** Ce que l'équipe voit d'une demande : la demande, plus qui la fait. */
const SELECT_DEMANDE = `
  SELECT d.*, h.name AS hotel_name, h.phone AS hotel_phone,
         h.partner_type, h.credit_balance
    FROM hotel_credit_requests d
    JOIN hotels h ON h.id = d.hotel_id`;

const MOYENS_RECHARGE = {
  mobile_money: 'portefeuille mobile (M-Pesa / Tigo Pesa / Airtel Money)',
  cash: 'espèces',
  bank: 'virement bancaire',
  card: 'carte bancaire',
};

/**
 * L'ALERTE ENVOYÉE À L'ÉQUIPE quand un partenaire demande une recharge.
 *
 * Fonction pure, et exportée : sans canal configuré, notifierEquipe ne
 * journalise que le SUJET — le corps du message ne serait vérifiable par
 * aucun test s'il restait enfoui dans la route. C'est pourtant lui qui dit
 * quoi faire.
 */
export function alerteDemandeRecharge(hotel, { amount, method, note }) {
  return {
    sujet: `\u{1F4B0} Demande de recharge de crédit — ${hotel.name}`,
    texte: [
      `${libellePartenaire(hotel) === 'restaurant' ? 'Restaurant' : 'Hôtel'}: ${hotel.name}`,
      `Montant demandé: ${amount} USD`,
      `Moyen annoncé: ${MOYENS_RECHARGE[method] ?? method}`,
      `Solde actuel: ${Number(hotel.credit_balance)} USD`,
      note ? `Note: ${note}` : null,
      `WhatsApp: ${hotel.phone}`,
      '',
      "À faire: vérifier que l'argent est bien arrivé, puis Créditer (ou Refuser)",
      'dans le tableau de bord, rubrique « Recharges de crédit ».',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

// GET /hotels/credit-requests — la file de l'équipe (en attente par défaut).
router.get(
  '/credit-requests',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status } = z
      .object({ status: z.enum(['pending', 'credited', 'rejected', 'all']).optional() })
      .parse(req.query);
    const filtre = status ?? 'pending';
    const { rows } = await query(
      `${SELECT_DEMANDE}
       WHERE ($1::text = 'all' OR d.status = $1)
       ORDER BY d.created_at ${filtre === 'pending' ? 'ASC' : 'DESC'}
       LIMIT 100`,
      [filtre]
    );
    res.json(rows);
  })
);

const decisionSchema = z.object({
  // L'équipe peut corriger : l'hôtel demande 100, il en arrive 95.
  amount: z.number().gt(0).lte(10000).optional(),
  note: z.string().max(200).optional(),
});

// POST /hotels/credit-requests/:id/credit — l'argent est arrivé : on crédite.
//
// Tout tient dans UNE transaction — le solde, la ligne du livre de comptes et
// la demande soldée. Séparés, une coupure au mauvais moment laisserait soit
// un hôtel crédité avec une demande encore en attente (recréditée le
// lendemain), soit une demande soldée sans l'argent.
router.post(
  '/credit-requests/:id/credit',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { amount, note } = decisionSchema.parse(req.body);
    const resultat = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM hotel_credit_requests WHERE id = $1 FOR UPDATE',
        [req.params.id]
      );
      const demande = rows[0];
      if (!demande) throw notFound('Demande de recharge');
      if (demande.status !== 'pending') {
        throw new HttpError(
          409,
          'request_already_decided',
          `Demande déjà traitée (${demande.status}) — aucun double crédit`
        );
      }
      const montant = amount ?? Number(demande.amount);
      const { rows: hotelRows } = await client.query(
        'SELECT name, credit_balance FROM hotels WHERE id = $1 FOR UPDATE',
        [demande.hotel_id]
      );
      if (!hotelRows[0]) throw notFound('Hôtel');
      const solde = Number(hotelRows[0].credit_balance) + montant;
      await client.query('UPDATE hotels SET credit_balance = $1 WHERE id = $2', [
        solde,
        demande.hotel_id,
      ]);
      await client.query(
        `INSERT INTO hotel_credit_transactions (hotel_id, amount, reason, reference)
         VALUES ($1, $2, 'topup', $3)`,
        [demande.hotel_id, montant, note ?? `Recharge ${demande.id}`]
      );
      const { rows: majRows } = await client.query(
        `UPDATE hotel_credit_requests
            SET status = 'credited', credited_amount = $2,
                decision_note = $3, decided_at = now()
          WHERE id = $1
        RETURNING *`,
        [demande.id, montant, note ?? null]
      );
      return { demande: majRows[0], solde, hotel: hotelRows[0].name };
    });
    res.json({
      request: resultat.demande,
      balance: resultat.solde,
      currency: 'USD',
    });
  })
);

// POST /hotels/credit-requests/:id/reject — versement jamais arrivé, doublon,
// erreur de saisie : la demande sort de la file sans toucher au solde.
router.post(
  '/credit-requests/:id/reject',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { note } = decisionSchema.parse(req.body);
    const { rows } = await query(
      `UPDATE hotel_credit_requests
          SET status = 'rejected', decision_note = $2, decided_at = now()
        WHERE id = $1 AND status = 'pending'
      RETURNING *`,
      [req.params.id, note ?? null]
    );
    if (!rows[0]) {
      const { rows: existe } = await query(
        'SELECT status FROM hotel_credit_requests WHERE id = $1',
        [req.params.id]
      );
      if (!existe[0]) throw notFound('Demande de recharge');
      throw new HttpError(
        409,
        'request_already_decided',
        `Demande déjà traitée (${existe[0].status})`
      );
    }
    res.json(rows[0]);
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

const demandeSchema = z.object({
  amount: z.number().gt(0).lte(10000),
  method: z.enum(['mobile_money', 'cash', 'bank', 'card']).default('mobile_money'),
  note: z.string().max(200).optional(),
});

// POST /hotels/:id/credit-requests — LE PARTENAIRE demande une recharge.
//
// C'est le geste qui manquait. Avant, le bouton « Recharger mon crédit »
// ouvrait WhatsApp et s'arrêtait là : si le message n'était pas envoyé, ou
// se perdait dans une conversation, la demande n'existait nulle part. Elle
// s'enregistre maintenant, elle alerte l'équipe, et elle attend dans une
// file jusqu'à ce que quelqu'un la solde.
router.post(
  '/:id/credit-requests',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isAdmin(req) && req.auth.hotelId !== req.params.id) {
      throw new HttpError(403, 'forbidden', "Accès réservé à l'hôtel concerné");
    }
    const { amount, method, note } = demandeSchema.parse(req.body);
    const { rows: hotelRows } = await query(
      'SELECT id, name, phone, partner_type, credit_balance, verification_status FROM hotels WHERE id = $1',
      [req.params.id]
    );
    const hotel = hotelRows[0];
    if (!hotel) throw notFound('Hôtel');
    assertHotelVerified(hotel);

    let creee;
    try {
      const { rows } = await query(
        `INSERT INTO hotel_credit_requests (hotel_id, amount, method, note)
         VALUES ($1, $2, $3, $4)
       RETURNING *`,
        [hotel.id, amount, method, note ?? null]
      );
      creee = rows[0];
    } catch (erreur) {
      // 23505 = l'index unique « une seule demande en attente ». Deux appuis
      // sur le bouton ne doivent pas donner deux demandes à créditer.
      if (erreur?.code === '23505') {
        throw new HttpError(
          409,
          'pending_request_exists',
          'Une demande de recharge est déjà en attente — l\'équipe la traite'
        );
      }
      throw erreur;
    }

    const alerte = alerteDemandeRecharge(hotel, { amount, method, note });
    notifierEquipe(alerte.sujet, alerte.texte);

    res.status(201).json(creee);
  })
);

// GET /hotels/:id/credit-requests — l'historique du partenaire (lui-même ou
// l'équipe). C'est ce qui lui permet de voir « demande de 100 $ en attente »
// au lieu de se demander si son message est parti.
router.get(
  '/:id/credit-requests',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isAdmin(req) && req.auth.hotelId !== req.params.id) {
      throw new HttpError(403, 'forbidden', "Accès réservé à l'hôtel concerné");
    }
    const { rows } = await query(
      `SELECT * FROM hotel_credit_requests
        WHERE hotel_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.params.id]
    );
    res.json(rows);
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
