import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import statsRouter from './routes/stats.js';
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

  // Version web de l'application (hôtels sur ordinateur) : export Expo web
  // copié dans backend/public/web. Application à page unique — toute route
  // /web/* inconnue renvoie index.html, le routage se fait dans le navigateur.
  const webAppDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'public',
    'web'
  );
  // Cache : les assets HACHÉS (leur nom change à chaque version) peuvent
  // être gardés longtemps ; la page HTML, le service worker et le manifest
  // JAMAIS — sinon les tablettes/téléphones restent sur une vieille version
  // pendant une heure après chaque correctif.
  const sansCache = (res) => res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  app.use(
    '/web',
    express.static(webAppDir, {
      maxAge: '7d',
      setHeaders: (res, fichier) => {
        if (/\.(html|webmanifest)$/.test(fichier) || fichier.endsWith('service-worker.js')) {
          sansCache(res);
        }
      },
    })
  );
  app.get('/web/*', (_req, res) => {
    sansCache(res);
    res.sendFile(path.join(webAppDir, 'index.html'));
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // Page d'accueil : rassure un visiteur qui ouvre l'URL dans un navigateur —
  // l'API elle-même vit sous /api et se consomme depuis l'app mobile.
  // La racine mène à la porte d'entrée /app (web en premier, chauffeurs
  // ensuite) : quelqu'un qui tape juste l'adresse ne tombe jamais sur une
  // impasse « rien à voir ici ».
  app.get('/', (_req, res) => {
    res.redirect('/app');
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
.separateur{display:flex;align-items:center;gap:10px;color:#8A7168;font-size:13px;margin:26px 0 14px;text-transform:uppercase;letter-spacing:.5px}
.separateur::before,.separateur::after{content:"";flex:1;height:1px;background:#F0DFD2}
small{color:#8A7168;display:block;margin-top:14px;line-height:1.5}small a{color:#B93C1B}</style>
</head><body><main>
<h1>zanziGo</h1>
<p><strong>Taxi &amp; colis à Zanzibar</strong> — dernière version, toujours à jour.</p>

<a class="bouton" href="/web">🌐 Ouvrir zanziGo maintenant</a>
<p>Aucune installation, aucun compte à créer avant de commencer — l'app
s'ouvre directement dans votre navigateur, sur téléphone comme sur
ordinateur. Touristes, résidents, hôtels : c'est ici.</p>
<small>💡 Pour garder zanziGo sous la main : une fois la page ouverte,
choisissez « Ajouter à l'écran d'accueil » dans le menu du navigateur —
l'icône 🌅 s'installe comme une vraie app, en plein écran.</small>

<div class="separateur">Vous êtes chauffeur zanziGo ?</div>
<div id="zone-android">
<a class="bouton secondaire" href="https://expo.dev/artifacts/eas/kM6cP9BmGjkwOHQH2LenHGHHF0oBldgFlQYLQTRUCx0.apk">📥 Installer l'app chauffeur (Android)</a>
<p>Touchez le bouton, acceptez l'installation (« Installer quand même » si
votre téléphone le demande) — l'app s'installe avec son icône 🌅, sans aucun
compte. N'utilisez PAS Expo Go sur Android.</p>
</div>
<div id="zone-iphone">
<p>Sur iPhone, l'app chauffeur est en accès sur invitation pendant le pilote —
écrivez-nous sur <a href="https://wa.me/255666241749">WhatsApp</a> et nous vous
ouvrons l'accès en quelques minutes.</p>
</div>
<div id="zone-expogo">
<a class="bouton secondaire" href="${lienExpo}">📱 Équipe &amp; testeurs invités : ouvrir dans Expo Go</a>
<small>Testeurs invités uniquement : installez Expo Go
(<a href="https://apps.apple.com/app/expo-go/id982107779">App Store</a> ·
<a href="https://play.google.com/store/apps/details?id=host.exp.exponent">Google Play</a>),
connectez-vous avec VOTRE compte Expo invité, puis rouvrez cette page.</small>
</div>
<small>Astuce : si l'app semble en retard, fermez-la complètement et rouvrez-la
deux fois. <a href="/confidentialite">Politique de confidentialité</a></small>
<script>
// Le raccourci chauffeur ne montre que SON chemin : Android → APK
// (Expo Go caché, source de confusion) ; iPhone → invitation.
(function () {
  var ua = navigator.userAgent || '';
  var cacher = function (id) {
    var zone = document.getElementById(id);
    if (zone) zone.style.display = 'none';
  };
  if (/Android/i.test(ua)) {
    cacher('zone-iphone');
    cacher('zone-expogo');
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    cacher('zone-android');
  }
})();
</script>
</main></body></html>`
      );
  });

  // Espace chauffeurs : cible du QR « chauffeurs » (affiches, cartes) —
  // le taxi scanne et tombe DIRECTEMENT sur l'installation de l'app,
  // sans passer par la page générale. Bilingue swahili/français : les
  // chauffeurs sont locaux.
  app.get('/chauffeur', (_req, res) => {
    res
      .type('html')
      .send(
        `<!doctype html><html lang="sw"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>zanziGo — Madereva / Chauffeurs</title>
<style>body{font-family:system-ui,sans-serif;background:#FBF0E4;color:#33222B;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
main{text-align:center;padding:28px;max-width:480px}h1{color:#E4572E;font-size:40px;margin:0 0 4px}
h2{font-size:19px;margin:6px 0 0}
p{color:#8A7168;margin:10px auto;line-height:1.5}
.bouton{display:block;background:#E4572E;color:#FFF8F2;text-decoration:none;font-weight:700;font-size:18px;padding:16px 22px;border-radius:14px;margin:18px auto}
.secondaire{background:#FFFDFA;color:#B93C1B;border:2px solid #E4572E}
ol{text-align:left;color:#8A7168;line-height:1.7;margin:10px auto;max-width:40ch}
small{color:#8A7168;display:block;margin-top:14px;line-height:1.5}small a{color:#B93C1B}</style>
</head><body><main>
<h1>zanziGo</h1>
<h2>🚕 Madereva — Chauffeurs</h2>
<p><strong>Pokea safari na mizigo kwenye simu yako.</strong><br>
Recevez des courses et des colis directement sur votre téléphone.</p>
<a class="bouton" href="https://expo.dev/artifacts/eas/kM6cP9BmGjkwOHQH2LenHGHHF0oBldgFlQYLQTRUCx0.apk">📥 Sakinisha app — Installer l'app (Android)</a>
<ol>
<li><strong>Sakinisha</strong> — touchez le bouton, acceptez « Installer quand même » si le téléphone le demande.</li>
<li><strong>Jisajili</strong> — ouvrez l'app, choisissez « Chauffeur », entrez votre numéro.</li>
<li><strong>Endesha</strong> — l'équipe valide vos papiers, et les courses arrivent.</li>
</ol>
<a class="bouton secondaire" href="https://wa.me/255666241749?text=${encodeURIComponent('🚕 Nataka kuwa dereva wa zanziGo — Je veux devenir chauffeur zanziGo')}">💬 Maswali ? WhatsApp équipe zanziGo</a>
<small>iPhone : accès sur invitation — écrivez-nous sur WhatsApp.<br>
<a href="/confidentialite">Sera ya faragha — Politique de confidentialité</a></small>
</main></body></html>`
      );
  });

  // Politique de confidentialité : exigée par Google Play / App Store, et
  // liée depuis la fiche du store. Page statique, sobre, bilingue FR/EN.
  app.get('/confidentialite', (_req, res) => {
    res
      .type('html')
      .send(
        `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>zanziGo — Politique de confidentialité</title>
<style>body{font-family:system-ui,sans-serif;background:#FBF0E4;color:#33222B;margin:0;line-height:1.65}
main{max-width:680px;margin:0 auto;padding:40px 22px 80px}
h1{color:#E4572E;font-size:34px;margin:0 0 4px}h2{font-size:20px;margin:28px 0 8px}
p,li{color:#5C4A42;font-size:15.5px}em{color:#8A7168}
a{color:#B93C1B}</style>
</head><body><main>
<h1>Politique de confidentialité</h1>
<p><em>zanziGo — taxis &amp; livraison de colis à Zanzibar. Dernière mise à jour : août 2026.</em></p>
<p><em>English summary: zanziGo collects only the data needed to operate rides and parcel deliveries (name, phone, optional e-mail, booking details, ID documents for resident/local/driver verification, and driver GPS location during deliveries only). Data is never sold. Contact us on WhatsApp +255 666 241 749 to access or delete your data.</em></p>
<h2>Quelles données collectons-nous ?</h2>
<ul>
<li><strong>Compte</strong> : nom, numéro de téléphone (vérifié par code), e-mail optionnel.</li>
<li><strong>Réservations</strong> : trajets, colis (lieux, destinataire et son téléphone, montants payés).</li>
<li><strong>Vérifications</strong> : documents d'identité fournis volontairement par les résidents, locaux, chauffeurs et hôtels pour activer leur profil.</li>
<li><strong>Position GPS</strong> : uniquement celle des CHAUFFEURS, uniquement pendant qu'ils utilisent l'app en livraison — pour le suivi des colis. Jamais celle des clients.</li>
</ul>
<h2>Pourquoi ?</h2>
<p>Uniquement pour faire fonctionner le service : organiser les courses, livrer les colis, appliquer les bons tarifs, payer les chauffeurs et sécuriser la plateforme. Aucune publicité, aucune revente de données.</p>
<h2>Qui y accède ?</h2>
<p>L'équipe zanziGo, et le chauffeur assigné à votre course ou colis (le strict nécessaire : lieux, téléphones de ramasse et de livraison). Les paiements en ligne sont traités par nos prestataires de paiement (ex. PayPal) selon leurs propres politiques.</p>
<h2>Combien de temps ?</h2>
<p>Tant que votre compte est actif. Sur demande, nous supprimons votre compte et vos données personnelles (les obligations comptables peuvent imposer de conserver certaines traces de paiement).</p>
<h2>Vos droits</h2>
<p>Accès, correction, suppression : écrivez-nous sur WhatsApp au <strong>+255&nbsp;666&nbsp;241&nbsp;749</strong>.</p>
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
  // Page de retour Pesapal : après le paiement (mobile money ou carte), le
  // client revient ici — la confirmation arrive toute seule par le webhook
  // IPN ; on le guide simplement vers l'app.
  app.get('/api/pesapal/retour', (_req, res) => {
    res
      .type('html')
      .send(
        pagePaypal(
          'Paiement reçu',
          "Merci ! Retournez dans l'app zanziGo : votre paiement se confirme automatiquement dans quelques instants (touchez « J'ai payé — vérifier » s'il tarde). Asante !",
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
  app.use('/api/stats', statsRouter);

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route inconnue' } });
  });

  app.use(errorHandler);
  return app;
}
