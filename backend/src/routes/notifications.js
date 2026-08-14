// Abonnement d'un téléphone aux alertes instantanées (notifications web).
//
// Parcours : le tableau de bord demande la clé publique, le navigateur crée
// un abonnement auprès d'Apple ou de Google, et l'équipe nous le confie ici.
// Réservé à l'équipe : ce sont SES téléphones qui doivent sonner.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { HttpError } from '../errors.js';
import { query } from '../db.js';
import {
  clePubliquePush,
  enregistrerAbonnement,
  envoyerPush,
  envoyerPushChauffeur,
  listerAbonnements,
  pushActif,
  retirerAbonnement,
} from '../services/pushService.js';

export const notificationsRouter = Router();

// GET /notifications/cle — clé publique VAPID, nécessaire au navigateur pour
// créer l'abonnement. Publique par nature (c'est une clé publique).
notificationsRouter.get('/cle', (req, res) => {
  res.json({ publicKey: clePubliquePush(), actif: pushActif() });
});

const abonnementSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(5) }),
  label: z.string().max(60).optional(),
});

// POST /notifications/abonner — ce téléphone veut recevoir les alertes.
notificationsRouter.post(
  '/abonner',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = abonnementSchema.parse(req.body);
    const abonnement = await enregistrerAbonnement({
      endpoint: data.endpoint,
      p256dh: data.keys.p256dh,
      auth: data.keys.auth,
      label: data.label,
    });
    res.status(201).json(abonnement);
  })
);

// POST /notifications/desabonner — ce téléphone ne veut plus être alerté.
notificationsRouter.post(
  '/desabonner',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body);
    res.json({ retire: await retirerAbonnement(endpoint) });
  })
);

// GET /notifications/abonnements — les téléphones alertés (équipe).
notificationsRouter.get(
  '/abonnements',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await listerAbonnements());
  })
);

// POST /notifications/test — envoie une alerte d'essai, pour vérifier que le
// téléphone sonne bien (et mesurer le délai réel).
notificationsRouter.post(
  '/test',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const resultat = await envoyerPush(
      '🔔 Essai zanziGo',
      'Si vous lisez ceci, les alertes instantanées fonctionnent sur ce téléphone.',
      { test: true }
    );
    res.json(resultat);
  })
);

// ===== CÔTÉ CHAUFFEUR =======================================================
// Un chauffeur abonne SON téléphone avec SON jeton : il ne reçoit que ce qui
// le concerne (course attribuée, payée, annulée), jamais les alertes internes
// de l'équipe. Le cloisonnement tient en deux points : le rôle enregistré
// ici, et la requête d'envoi côté service.

/**
 * Le chauffeur identifié par le jeton — sinon 403.
 *
 * Cas particulier du chauffeur qui vient de déposer sa candidature : son
 * jeton a été émis AVANT que sa fiche n'existe, il ne porte donc pas encore
 * son identifiant. On le retrouve par son numéro, ce qui est sûr : ce jeton
 * n'est délivré qu'à qui a choisi le mot de passe de ce numéro, et
 * l'inscription est refusée si un chauffeur existe déjà avec ce numéro.
 * Sans ça, un chauffeur fraîchement validé devrait se déconnecter et se
 * reconnecter avant de pouvoir être alerté de sa première course.
 */
async function chauffeurDuJeton(req) {
  if (req.auth?.driverId) return req.auth.driverId;
  if (req.auth?.chauffeurCandidat && req.auth.phone) {
    const { rows } = await query(
      'SELECT id FROM drivers WHERE phone = $1 AND archived_at IS NULL',
      [req.auth.phone]
    );
    if (rows[0]) return rows[0].id;
  }
  throw new HttpError(403, 'forbidden', 'Réservé aux chauffeurs zanziGo');
}

notificationsRouter.post(
  '/chauffeur/abonner',
  requireAuth,
  asyncHandler(async (req, res) => {
    const driverId = await chauffeurDuJeton(req);
    const data = abonnementSchema.parse(req.body);
    const abonnement = await enregistrerAbonnement({
      endpoint: data.endpoint,
      p256dh: data.keys.p256dh,
      auth: data.keys.auth,
      label: data.label,
      role: 'chauffeur',
      driverId,
    });
    res.status(201).json(abonnement);
  })
);

notificationsRouter.post(
  '/chauffeur/desabonner',
  requireAuth,
  asyncHandler(async (req, res) => {
    const driverId = await chauffeurDuJeton(req);
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body);
    // Le retrait est limité aux téléphones de CE chauffeur.
    res.json({ retire: await retirerAbonnement(endpoint, driverId) });
  })
);

// Essai : le chauffeur vérifie lui-même que son téléphone sonne.
notificationsRouter.post(
  '/chauffeur/test',
  requireAuth,
  asyncHandler(async (req, res) => {
    const driverId = await chauffeurDuJeton(req);
    const resultat = await envoyerPushChauffeur(
      driverId,
      '🔔 Essai zanziGo',
      'Si vous lisez ceci, vous serez prévenu dès qu’une course vous sera attribuée.',
      { test: true }
    );
    res.json(resultat);
  })
);
