// Abonnement d'un téléphone aux alertes instantanées (notifications web).
//
// Parcours : le tableau de bord demande la clé publique, le navigateur crée
// un abonnement auprès d'Apple ou de Google, et l'équipe nous le confie ici.
// Réservé à l'équipe : ce sont SES téléphones qui doivent sonner.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  clePubliquePush,
  enregistrerAbonnement,
  envoyerPush,
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
