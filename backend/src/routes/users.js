import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isAdmin, requireAuth, requireAdmin } from '../middleware/auth.js';
import { emailBienvenueClient, envoyerEmail, notifierEquipe } from '../services/emailService.js';
import { hashPassword } from '../services/passwordService.js';

const router = Router();

// Le hash de mot de passe ne sort JAMAIS de l'API (visiteurs : identité
// téléphone + mot de passe, comme les hôtels).
export function sanitizeUser(user) {
  if (!user) return user;
  const { password_hash, ...rest } = user;
  return rest;
}

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
    // Parrainage : code ZG-XXXXXX d'un client existant (optionnel).
    referralCode: z.string().min(4).max(12).optional(),
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
    // Jeton client (numéro + mot de passe choisis à l'inscription) : le
    // hash voyage dans le jeton signé et se pose sur le profil ici.
    const jetonClient = !isAdmin(req) && (req.auth.client || req.auth.visiteur);
    let passwordHash = null;
    if (jetonClient && req.auth.passwordHash) {
      passwordHash = req.auth.passwordHash;
    }
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
      // Jeton CLIENT (numéro + mot de passe) : touriste, résident ou local.
      // Ancien jeton local « numéro seul » (30 jours max) : local uniquement.
      if (!jetonClient && req.auth.sansOtp && data.accountType !== 'local') {
        throw new HttpError(
          403,
          'local_only',
          'Ce mode de connexion (numéro seul) est réservé aux comptes locaux'
        );
      }
      phone = data.phone;
    }
    const needsVerification = data.accountType !== 'tourist';

    // Code parrain : validé STRICTEMENT (une faute de frappe se corrige
    // tout de suite plutôt que de perdre le parrainage en silence).
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

    let rows;
    try {
      ({ rows } = await query(
        `INSERT INTO users (full_name, phone, email, account_type, currency, verification_status, id_document_url, password_hash, referred_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          data.fullName,
          phone,
          email,
          data.accountType,
          data.accountType === 'local' ? 'TZS' : 'USD',
          needsVerification ? 'pending' : 'verified',
          data.idDocumentUrl ?? null,
          passwordHash,
          parrain?.id ?? null,
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
    // Chaque client reçoit son propre code parrain (ZG-XXXXXX, dérivé de
    // son identifiant — unique par construction).
    ({ rows } = await query(
      `UPDATE users
       SET referral_code = 'ZG-' || upper(substr(replace(id::text, '-', ''), 1, 6))
       WHERE id = $1 RETURNING *`,
      [rows[0].id]
    ));
    if (parrain) {
      notifierEquipe(
        '🤝 Parrainage — zanziGo',
        `${rows[0].full_name} (${rows[0].phone ?? rows[0].email ?? 'sans contact'}) s'est inscrit avec le code de ${parrain.full_name}. La récompense (5 $ chacun) sera ACQUISE quand il aura terminé 2 courses — vous serez prévenu automatiquement.`
      );
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
    res.status(201).json(sanitizeUser(rows[0]));
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
      conditions.push(`u.verification_status = $${params.length}`);
    }
    if (accountTypes) {
      const types = accountTypes
        .split(',')
        .map((type) => type.trim())
        .filter((type) => ['tourist', 'resident', 'local'].includes(type));
      if (types.length > 0) {
        params.push(types);
        conditions.push(`u.account_type = ANY($${params.length})`);
      }
    }
    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      conditions.push(`(u.full_name ILIKE $${params.length} OR u.phone ILIKE $${params.length})`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    // Le nom du parrain est joint pour le tableau équipe (suivi parrainage),
    // avec le nombre de courses terminées du filleul : la récompense n'est
    // acquise qu'à partir de 2 (referral_rewarded_at posé automatiquement).
    const { rows } = await query(
      `SELECT u.*, p.full_name AS referred_by_name,
              CASE WHEN u.referred_by_user_id IS NOT NULL THEN
                (SELECT COUNT(*)::int FROM trips t WHERE t.user_id = u.id AND t.status = 'completed')
              END AS filleul_courses_terminees
       FROM users u LEFT JOIN users p ON p.id = u.referred_by_user_id
       ${where} ORDER BY u.created_at DESC LIMIT 200`,
      params
    );
    res.json(rows.map(sanitizeUser));
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
    res.json(sanitizeUser(rows[0]));
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
    res.json(sanitizeUser(updated.rows[0]));
  })
);

// PATCH /users/:id/password — l'ÉQUIPE réinitialise le mot de passe d'un
// visiteur qui l'a oublié (demande via WhatsApp) : elle lui communique le
// nouveau mot de passe temporaire, qu'il pourra garder ou refaire changer.
router.patch(
  '/:id/password',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { password } = z
      .object({ password: z.string().min(8, 'Mot de passe : 8 caractères minimum') })
      .parse(req.body);
    const { rows } = await query('SELECT id FROM users WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw notFound('Utilisateur');
    const updated = await query(
      'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING *',
      [await hashPassword(password), req.params.id]
    );
    res.json(sanitizeUser(updated.rows[0]));
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
    res.json(sanitizeUser(updated.rows[0]));
  })
);

export default router;
