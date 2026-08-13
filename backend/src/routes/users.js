import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isAdmin, requireAuth, requireAdmin } from '../middleware/auth.js';
import { emailBienvenueClient, envoyerEmail, notifierEquipe } from '../services/emailService.js';

const router = Router();

// Trois types de comptes :
//  - tourist  : aucun document, USD plein tarif, vérifié d'office ;
//  - resident : documents de résidence à valider → remise en USD ;
//  - local    : carte d'identité TANZANIENNE à valider → tarif unique en TZS.
const createUserSchema = z
  .object({
    fullName: z.string().min(2),
    // Identité e-mail (visiteurs) : le téléphone devient un simple contact
    // WhatsApp optionnel, non vérifié. Identité téléphone : requis (vérifié
    // par OTP).
    phone: z.string().min(6).optional(),
    email: z.string().email().optional(),
    accountType: z.enum(['tourist', 'resident', 'local']),
    idDocumentUrl: z.string().url().optional(),
  })
  .refine((d) => d.accountType === 'tourist' || d.idDocumentUrl, {
    path: ['idDocumentUrl'],
    message:
      'Document requis : preuve de résidence (résident) ou carte d’identité tanzanienne (local)',
  });

const verifySchema = z.object({
  status: z.enum(['verified', 'rejected']),
});

// POST /users — inscription touriste ou résident.
// Le téléphone est toujours vérifié par OTP avant la création du profil :
// le phone du body doit être celui du jeton (l'équipe peut créer pour autrui).
// Touriste : currency USD, vérifié d'office. Résident : TZS, en attente de
// validation manuelle du document par l'équipe.
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = createUserSchema.parse(req.body);

    // Deux identités possibles sur le jeton :
    //  - E-MAIL (touristes/visiteurs) : l'e-mail du profil est FORCÉMENT
    //    celui vérifié par le code ; le téléphone est un simple contact
    //    WhatsApp optionnel ; les LOCAUX ne passent jamais par ici (leur
    //    identité, c'est la SIM tanzanienne).
    //  - TÉLÉPHONE (locaux, anciens comptes) : règle historique inchangée.
    const identiteEmail = !isAdmin(req) && !req.auth.phone && req.auth.email;
    let email = data.email ?? null;
    let phone = data.phone ?? null;
    if (identiteEmail) {
      if (data.accountType === 'local') {
        throw new HttpError(
          403,
          'local_phone_required',
          'Les comptes locaux s\'identifient par téléphone (carte SIM tanzanienne)'
        );
      }
      email = req.auth.email;
    } else if (!isAdmin(req)) {
      if (!data.phone || data.phone !== req.auth.phone) {
        throw new HttpError(403, 'phone_mismatch', 'Le téléphone doit être celui vérifié par OTP (jeton)');
      }
      phone = data.phone;
    }
    const needsVerification = data.accountType !== 'tourist';

    let rows;
    try {
      ({ rows } = await query(
        `INSERT INTO users (full_name, phone, email, account_type, currency, verification_status, id_document_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          data.fullName,
          phone,
          email,
          data.accountType,
          data.accountType === 'local' ? 'TZS' : 'USD',
          needsVerification ? 'pending' : 'verified',
          data.idDocumentUrl ?? null,
        ]
      ));
    } catch (err) {
      // Téléphone déjà pris par un autre compte (contrainte UNIQUE) — même
      // code d'erreur « duplicate » que le gestionnaire global historique.
      if (err.code === '23505') {
        throw new HttpError(409, 'duplicate', 'Ce numéro de téléphone est déjà utilisé par un autre compte');
      }
      throw err;
    }
    // Récapitulatif d'inscription par e-mail (si fourni) — au mieux, jamais
    // bloquant : l'inscription réussit même si l'e-mail ne part pas.
    if (rows[0].email) {
      const { subject, html } = emailBienvenueClient(rows[0]);
      envoyerEmail({ to: rows[0].email, subject, html }).catch(() => {});
    }
    // Compte résident/local : l'équipe est prévenue qu'un document attend
    // sa vérification (les touristes sont validés d'office).
    if (needsVerification) {
      notifierEquipe(
        '🪪 Nouveau compte à vérifier — zanziGo',
        [
          `Nom: ${rows[0].full_name}`,
          `Téléphone: ${rows[0].phone}`,
          `Profil: ${rows[0].account_type}`,
          'À faire: contrôler le document dans le tableau de bord (Comptes).',
        ].join('\n')
      );
    }
    res.status(201).json(rows[0]);
  })
);

// GET /users?verificationStatus=&q=&accountTypes= — liste pour le tableau de
// bord équipe : pending = documents à valider ; q = recherche par nom ou
// téléphone (gestion des profils, radiation) ; accountTypes = filtre par
// types de comptes, séparés par des virgules (ex. tourist,resident).
router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { verificationStatus, q, accountTypes } = z
      .object({
        verificationStatus: z.enum(['pending', 'verified', 'rejected']).optional(),
        q: z.string().max(100).optional(),
        accountTypes: z.string().max(60).optional(),
      })
      .parse(req.query);

    const params = [];
    const conditions = [];
    if (verificationStatus) {
      params.push(verificationStatus);
      conditions.push(`verification_status = $${params.length}`);
    }
    if (accountTypes) {
      const types = accountTypes
        .split(',')
        .map((type) => type.trim())
        .filter((type) => ['tourist', 'resident', 'local'].includes(type));
      if (types.length > 0) {
        params.push(types);
        conditions.push(`account_type = ANY($${params.length})`);
      }
    }
    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      conditions.push(`(full_name ILIKE $${params.length} OR phone ILIKE $${params.length})`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT 200`,
      params
    );
    res.json(rows);
  })
);

// GET /users/:id — détail utilisateur (lui-même ou l'équipe).
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isAdmin(req) && req.auth.userId !== req.params.id) {
      throw new HttpError(403, 'forbidden', 'Accès réservé au titulaire du compte');
    }
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw notFound('Utilisateur');
    res.json(rows[0]);
  })
);

// PATCH /users/:id/ban {banned} — radiation (ou réintégration) d'un profil
// client par l'équipe : un compte bloqué ne peut plus rien réserver.
router.patch(
  '/:id/ban',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { banned } = z.object({ banned: z.boolean() }).parse(req.body);
    const { rows } = await query('SELECT id FROM users WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw notFound('Utilisateur');
    const updated = await query(
      `UPDATE users SET banned_at = ${banned ? 'now()' : 'NULL'} WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json(updated.rows[0]);
  })
);

// PATCH /users/:id/verify — validation manuelle du document (équipe
// uniquement). Un document déjà traité peut être re-traité (correction
// d'une erreur de validation).
router.patch(
  '/:id/verify',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status } = verifySchema.parse(req.body);

    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    const user = rows[0];
    if (!user) throw notFound('Utilisateur');
    if (user.verification_status === status) {
      throw new HttpError(409, 'invalid_status', `Ce compte est déjà « ${status} »`);
    }

    const updated = await query(
      'UPDATE users SET verification_status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    res.json(updated.rows[0]);
  })
);

export default router;
