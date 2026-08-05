import express from 'express';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { isAdmin } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import usersRouter from './routes/users.js';
import driversRouter from './routes/drivers.js';
import hotelsRouter from './routes/hotels.js';
import tripsRouter from './routes/trips.js';
import packagesRouter from './routes/packages.js';
import paymentsRouter from './routes/payments.js';
import { uploadsRouter } from './routes/uploads.js';
import { localUploadsDir } from './services/storageService.js';

// ===== Rate limiting =====
// Désactivé en environnement de test (NODE_ENV=test) pour ne pas fausser
// les suites automatisées. L'équipe zanziGo (clé X-Admin-Key valide) est
// également exemptée (outillage interne, smoke-test).
const rateLimitDisabled = config.env === 'test';

function makeLimiter({ windowMs, max }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => rateLimitDisabled || isAdmin(req),
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'rate_limited',
          message: 'Trop de requêtes — réessayez plus tard',
        },
      });
    },
  });
}

// Anti-abus OTP : 5 demandes de code / 15 min / IP
const otpLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
// Routes publiques de création : 30 requêtes / 15 min / IP
const publicPostLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 30 });

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Fichiers uploadés en mode dev (fallback disque local)
  app.use('/uploads', express.static(localUploadsDir));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // Limiteurs : OTP d'abord (plus strict), puis routes publiques POST
  app.use('/api/auth/request-otp', otpLimiter);
  app.use('/api/auth', publicPostLimiter);
  app.post('/api/users', publicPostLimiter);
  app.post('/api/drivers', publicPostLimiter);
  app.post('/api/hotels', publicPostLimiter);

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/drivers', driversRouter);
  app.use('/api/hotels', hotelsRouter);
  app.use('/api/trips', tripsRouter);
  app.use('/api/packages', packagesRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/uploads', uploadsRouter);

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route inconnue' } });
  });

  app.use(errorHandler);
  return app;
}
