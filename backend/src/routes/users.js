import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isAdmin, requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Trois types de comptes :
//  - tourist  : aucun document, USD plein tarif, vérifié d'office ;
//  - resident : documents de résidence à valider → remise en USD ;
//  - local    : carte d'identité TANZANIENNE à valider → tarif unique en TZS.
const createUserSchema = z
  .object({
    fullName: z.string().min(2),
    phone: z.string().min(6),
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
    if (!isAdmin(req) && data.phone !== req.auth.phone) {
      throw new HttpError(403, 'phone_mismatch', 'Le téléphone doit être celui vérifié par OTP (jeton)');
    }
    const needsVerification = data.accountType !== 'tourist';

    const { rows } = await query(
      `INSERT INTO users (full_name, phone, email, account_type, currency, verification_status, id_document_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.fullName,
        data.phone,
        data.email ?? null,
        data.accountType,
        data.accountType === 'local' ? 'TZS' : 'USD',
        needsVerification ? 'pending' : 'verified',
        data.idDocumentUrl ?? null,
      ]
    );
    res.status(201).json(rows[0]);
  })
);

// GET /users?verificationStatus= — liste pour le tableau de bord équipe
// (ex. pending = résidents et locaux dont le document attend validation).
router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { verificationStatus } = z
      .object({ verificationStatus: z.enum(['pending', 'verified', 'rejected']).optional() })
      .parse(req.query);

    const params = [];
    let where = '';
    if (verificationStatus) {
      params.push(verificationStatus);
      where = 'WHERE verification_status = $1';
    }
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

// PATCH /users/:id/verify — validation manuelle du document (équipe uniquement).
router.patch(
  '/:id/verify',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status } = verifySchema.parse(req.body);

    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    const user = rows[0];
    if (!user) throw notFound('Utilisateur');
    if (user.verification_status !== 'pending') {
      throw new HttpError(
        409,
        'invalid_status',
        `Ce compte a déjà été traité (statut: ${user.verification_status})`
      );
    }

    const updated = await query(
      'UPDATE users SET verification_status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    res.json(updated.rows[0]);
  })
);

export default router;
