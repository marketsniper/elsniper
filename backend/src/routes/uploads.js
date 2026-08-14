// Upload de fichiers (photos de profil, pièces des chauffeurs, reçus...).
//
// POST /api/uploads (multipart/form-data, champ "file") — authentifié.
// Limites : 10 Mo max ; types acceptés : image/jpeg, image/png,
// image/webp, application/pdf (sinon 400 unsupported_file_type).
// Stockage : S3/R2 si configuré, sinon backend/uploads/ en dev.
// Réponse : {url, size, mimeType}.
import { Router } from 'express';
import multer from 'multer';
import { HttpError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import * as storageService from '../services/storageService.js';

export const uploadsRouter = Router();

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

const upload = multer({
  storage: multer.memoryStorage(),
  // 25 Mo : les photos des appareils récents (Samsung…) dépassent
  // facilement 10 Mo — au-delà, message clair plutôt qu'une erreur brute.
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Traduit l'erreur multer « fichier trop gros » en message compréhensible.
function uploadUnFichier(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return next(
        new HttpError(
          400,
          'file_too_large',
          'Photo trop lourde (25 Mo maximum) — reprenez-la en qualité normale et réessayez'
        )
      );
    }
    next(err);
  });
}

uploadsRouter.post(
  '/',
  requireAuth,
  uploadUnFichier,
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new HttpError(400, 'file_required', 'Champ "file" manquant');
      }
      if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
        throw new HttpError(
          400,
          'unsupported_file_type',
          `Type de fichier non accepté : ${req.file.mimetype} (acceptés : ${ALLOWED_MIME_TYPES.join(', ')})`
        );
      }
      // Origine publique réelle (Render est derrière un proxy : on lit
      // x-forwarded-* via app.set('trust proxy')) — l'URL doit s'ouvrir
      // depuis n'importe quel téléphone, pas seulement le serveur.
      const { url } = await storageService.storeFile({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        baseUrl: `${req.protocol}://${req.get('host')}`,
      });
      res.status(201).json({
        url,
        size: req.file.size,
        mimeType: req.file.mimetype,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /uploads/:id — sert un document stocké en base. Route PUBLIQUE mais
// non devinable (identifiant aléatoire) : c'est ce qui permet à l'équipe
// d'ouvrir un permis ou une carte NIDA d'un simple toucher, le lien
// s'ouvrant dans le navigateur (qui n'envoie pas de jeton).
uploadsRouter.get('/:id', async (req, res, next) => {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
      throw new HttpError(404, 'not_found', 'Document introuvable');
    }
    const fichier = await storageService.readFile(req.params.id);
    if (!fichier) {
      throw new HttpError(404, 'not_found', 'Document introuvable');
    }
    res.setHeader('Content-Type', fichier.mime_type);
    res.setHeader('Content-Length', String(fichier.size));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(fichier.data);
  } catch (err) {
    next(err);
  }
});
