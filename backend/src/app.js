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
import ridesRouter from './routes/rides.js';
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

  // Page d'accueil : rassure un visiteur qui ouvre l'URL dans un navigateur —
  // l'API elle-même vit sous /api et se consomme depuis l'app mobile.
  app.get('/', (_req, res) => {
    res
      .type('html')
      .send(
        `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>zanziGo — API</title>
<style>body{font-family:system-ui,sans-serif;background:#FBF0E4;color:#33222B;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
main{text-align:center;padding:32px}h1{color:#E4572E;font-size:44px;margin:0}
p{color:#8A7168;max-width:42ch}code{background:#FFE0D2;color:#B93C1B;padding:2px 8px;border-radius:8px}</style>
</head><body><main><h1>zanziGo</h1>
<p><strong>Le serveur est en ligne ✓</strong></p>
<p>Cette adresse est le moteur de l'application mobile zanziGo (courses taxi et colis à Zanzibar). Il n'y a rien à voir ici : tout se passe dans l'app.</p>
<p>État du service : <code>/health</code></p>
</main></body></html>`
      );
  });

  // Page d'installation / d'ouverture de l'app : lien https STABLE à
  // partager (QR, WhatsApp…). Le bouton ouvre Expo Go sur le canal preview,
  // qui charge toujours la dernière version publiée.
  app.get('/app', (_req, res) => {
    const lienExpo =
      'exp://u.expo.dev/df409e04-637b-4287-9e58-e99ea1fa521e?channel-name=preview&runtime-version=exposdk:54.0.0';
    res
      .type('html')
      .send(
        `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>zanziGo — Ouvrir l'app</title>
<style>body{font-family:system-ui,sans-serif;background:#FBF0E4;color:#33222B;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
main{text-align:center;padding:28px;max-width:480px}h1{color:#E4572E;font-size:40px;margin:0 0 4px}
p{color:#8A7168;margin:10px auto;line-height:1.5}
.bouton{display:block;background:#E4572E;color:#FFF8F2;text-decoration:none;font-weight:700;font-size:18px;padding:16px 22px;border-radius:14px;margin:18px auto}
.secondaire{background:#FFFDFA;color:#B93C1B;border:2px solid #E4572E}
small{color:#8A7168;display:block;margin-top:14px;line-height:1.5}small a{color:#B93C1B}</style>
</head><body><main>
<h1>zanziGo</h1>
<p><strong>Taxi &amp; colis à Zanzibar</strong> — dernière version, toujours à jour.</p>
<a class="bouton" href="${lienExpo}">📱 Ouvrir dans Expo Go</a>
<p>Il faut l'app gratuite <strong>Expo Go</strong> :</p>
<a class="bouton secondaire" href="https://apps.apple.com/app/expo-go/id982107779">App Store (iPhone)</a>
<a class="bouton secondaire" href="https://play.google.com/store/apps/details?id=host.exp.exponent">Google Play (Android)</a>
<small>Android sans Expo Go : installez l'application zanziGo directement —
<a href="https://expo.dev/artifacts/eas/ni3b39KgIuEO2Ewb3RyfmBBe-chVTGyvN6pb1H7_r78.apk">télécharger l'APK</a>.
Astuce : si l'app semble en retard, fermez-la complètement et rouvrez-la deux fois.</small>
</main></body></html>`
      );
  });

  // Pages de retour PayPal : après approbation (ou annulation) dans le
  // navigateur, on guide le client vers l'app pour finaliser.
  const pagePaypal = (titre, message, emoji) =>
    `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>zanziGo — ${titre}</title>
<style>body{font-family:system-ui,sans-serif;background:#FBF0E4;color:#33222B;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
main{text-align:center;padding:32px}h1{color:#E4572E;font-size:40px;margin:0 0 8px}
p{color:#8A7168;max-width:44ch;margin:8px auto}</style>
</head><body><main><h1>${emoji} ${titre}</h1><p>${message}</p></main></body></html>`;
  app.get('/api/paypal/retour', (_req, res) => {
    res
      .type('html')
      .send(
        pagePaypal(
          'Paiement approuvé',
          'Retournez dans l\'app zanziGo et touchez « J\'ai payé — vérifier » pour finaliser. Asante !',
          '✅'
        )
      );
  });
  app.get('/api/paypal/annule', (_req, res) => {
    res
      .type('html')
      .send(
        pagePaypal(
          'Paiement annulé',
          'Aucun montant n\'a été débité. Vous pouvez relancer le paiement depuis l\'app zanziGo quand vous voulez.',
          '↩️'
        )
      );
  });

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
  app.use('/api/rides', ridesRouter);
  app.use('/api/uploads', uploadsRouter);

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route inconnue' } });
  });

  app.use(errorHandler);
  return app;
}
