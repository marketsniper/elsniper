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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 Mo
});

uploadsRouter.post(
  '/',
  requireAuth,
  upload.single('file'),
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
      const { url } = await storageService.storeFile({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
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
