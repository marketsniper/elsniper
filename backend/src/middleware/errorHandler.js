import { ZodError } from 'zod';
import { HttpError } from '../errors.js';

// Handler d'erreurs central : chaque type d'erreur garde son vrai code
// (validation_error, not_found, ...) — jamais "internal_error" pour une 4xx.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Requête invalide',
        details: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  // Violations d'unicité PostgreSQL (téléphone ou plaque déjà enregistrés).
  if (err.code === '23505') {
    return res.status(409).json({
      error: {
        code: 'duplicate',
        message: 'Une ressource avec ces informations existe déjà',
        details: { constraint: err.constraint },
      },
    });
  }

  console.error(err);
  return res.status(500).json({
    error: { code: 'internal_error', message: 'Erreur interne du serveur' },
  });
}

// Enveloppe async pour propager les rejets de promesse vers errorHandler.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
