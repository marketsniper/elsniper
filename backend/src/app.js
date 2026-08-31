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
import rentalVehiclesRouter from './routes/rentalVehicles.js';
import { uploadsRouter } from './routes/uploads.js';
import statsRouter from './routes/stats.js';
import verificationsRouter from './routes/verifications.js';
import { notificationsRouter } from './routes/notifications.js';
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
// Pièces jointes : 20 envois / 15 min / IP — chaque fichier peut peser
// 25 Mo et finit DANS la base ; sans borne, quelques dizaines de requêtes
// remplissaient le gigaoctet du plan gratuit et bloquaient la plateforme.
const uploadLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 20 });

export function createApp() {
  const app = express();
  // Render place un proxy devant le serveur : sans ça, req.protocol vaut
  // « http » et les liens de documents générés seraient en http.
  app.set('trust proxy', 1);
  // En-têtes de sécurité de base (l'API sert aussi des fichiers déposés par
  // les utilisateurs : un navigateur ne doit jamais « deviner » leur type).
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
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
  // Cache : SEULS les fichiers dont le nom change à chaque version (_expo/,
  // assets/) sont gardés longtemps. Tout le reste — page HTML, service
  // worker, scripts d'installation, manifeste, version.json — est revalidé à
  // chaque ouverture. La règle était inverse (tout gardé 7 jours sauf trois
  // exceptions), et un iPhone est resté coincé des heures sur une version
  // périmée parce que le script chargé de le dépanner était, lui aussi, en
  // cache pour une semaine.
  const sansCache = (res) => res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  const nomHache = (fichier) =>
    fichier.startsWith(path.join(webAppDir, '_expo') + path.sep) ||
    fichier.startsWith(path.join(webAppDir, 'assets') + path.sep);
  app.use(
    '/web',
    express.static(webAppDir, {
      maxAge: '7d',
      setHeaders: (res, fichier) => {
        if (!nomHache(fichier)) sansCache(res);
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
<a class="bouton secondaire" href="https://expo.dev/artifacts/eas/cJNvxejVN3wvSAfdXdVq3adlaczFCVjPOtVV10VkYg8.apk">📥 Installer l'app chauffeur (Android)</a>
<p>Touchez le bouton pour télécharger, puis ouvrez le fichier. Si
<strong>Google Play Protect</strong> affiche « App blocked / Application
bloquée », touchez <strong>« More details / Plus de détails »</strong> puis
<strong>« Install anyway / Installer quand même »</strong> — c'est normal,
l'app ne vient pas du Play Store mais elle est sûre. L'icône 🌅 s'installe,
sans aucun compte. N'utilisez PAS Expo Go sur Android.</p>
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

  // Feuille de style commune aux pages de démarchage (hôtels, restaurants) :
  // une seule identité visuelle, une seule chose à retoucher.
  const STYLE_PARTENAIRE = `*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#FBF0E4;color:#33222B;line-height:1.5}
main{max-width:660px;margin:0 auto;padding:26px 20px 50px}
h1{font-size:32px;line-height:1.15;letter-spacing:-.4px;margin-bottom:8px}
h1 span{color:#E4572E}
.accroche{font-size:18px;color:#6B5760;margin-bottom:22px}
h2{font-size:21px;margin:30px 0 12px}
.carte{background:#fff;border-radius:18px;padding:20px 22px;margin-bottom:14px;box-shadow:0 6px 18px rgba(51,34,43,.07)}
.carte h3{font-size:18px;margin-bottom:6px}
.carte p{color:#55444C;font-size:16px}
.gratuit{background:#33222B;color:#FFE9DC;border-radius:18px;padding:20px 22px;margin:22px 0;font-size:17px}
.gratuit b{color:#FFB08C}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(51,34,43,.07)}
th,td{padding:12px 14px;text-align:left;font-size:15.5px;border-bottom:1px solid #F1E7E3}
th{background:#FFF1EC;color:#B93C1B;font-size:14px;text-transform:uppercase;letter-spacing:.4px}
th:nth-child(n+2),td:nth-child(n+2){text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.remise{color:#B93C1B;font-weight:800}
.egal{color:#8A7168;font-weight:600}
.gps{background:#E8F1FB;border-left:8px solid #2B6CB0;border-radius:14px;padding:16px 20px;margin-top:14px;font-size:16.5px;line-height:1.5}
.gps b{color:#1F4E80}
tr:last-child td{border-bottom:none}
.etapes{counter-reset:e}
.etape{display:flex;gap:14px;align-items:flex-start;margin-bottom:14px}
.puce{flex:none;width:34px;height:34px;border-radius:17px;background:#E4572E;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center}
.bonus{background:#FFF7E6;border-left:8px solid #E9A13B;border-radius:14px;padding:18px 20px;margin:14px 0;font-size:16.5px}
.bouton{display:block;text-align:center;background:#E4572E;color:#FFF8F2;text-decoration:none;font-weight:700;font-size:18px;padding:16px;border-radius:14px;margin:12px 0}
.secondaire{background:#FFFDFA;color:#B93C1B;border:2px solid #E4572E}
footer{margin-top:26px;text-align:center;color:#8A7168;font-size:14px}
footer a{color:#B93C1B}
`;

  // Pied de page commun : contact et mentions.
  const PIED_PARTENAIRE = `<footer>
  zanziGo — Zanzibar · Taxi &amp; parcels · Verified drivers, fixed prices<br>
  WhatsApp <a href="https://wa.me/255666241749">+255 666 241 749</a> ·
  <a href="/confidentialite">Privacy</a>
</footer>`;

  // Espace HÔTELS PARTENAIRES : la page qu'on montre — ou qu'on envoie — à
  // une réception. En anglais, la langue de travail des hôtels de Zanzibar.
  // Elle répond dans l'ordre aux questions d'un directeur : qu'est-ce que ça
  // me coûte, qu'est-ce que ça change pour mes clients, combien ça coûte à
  // eux, et qu'est-ce que j'y gagne.
  app.get('/hotel', (_req, res) => {
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>zanziGo for hotels — verified taxis, fixed prices</title>
<style>${STYLE_PARTENAIRE}</style></head><body><main>

<h1>Your guests deserve a taxi you can <span>vouch for</span>.</h1>
<p class="accroche">zanziGo is a Zanzibar taxi &amp; parcel service built for hotels.
Verified drivers, published prices, one booking from your reception desk.</p>

<div class="gratuit">
  <b>It costs your hotel nothing.</b> No fee, no subscription, no software to install,
  no commitment. Your guest pays the published price — and you book at a
  <b>5% partner rate</b>.
</div>

<h2>What changes at your desk</h2>

<div class="carte">
  <h3>🚕 No more calling round for a car</h3>
  <p>One booking on any phone or computer. Our team confirms a driver and you see
  his name, his plate and his car — before your guest walks out.</p>
</div>
<div class="carte">
  <h3>💵 The price is fixed before departure</h3>
  <p>No haggling at your door, no argument at check-out. The guest knows the
  price when he books; the driver knows it too.</p>
</div>
<div class="carte">
  <h3>🛡️ Every driver is checked by us</h3>
  <p>Driving licence, insurance and vehicle photo verified before a driver can
  take a single booking. Your reputation travels in that car.</p>
</div>
<div class="carte">
  <h3>📍 You can follow the ride</h3>
  <p>Requested → driver confirmed → paid → on the way → completed. If a guest asks
  at the desk, you have the answer on screen.</p>
</div>

<h2>Your partner prices — private car</h2>
<table>
  <tr><th>Route</th><th>Guest price</th><th>Your price −5%</th></tr>
  <tr><td>Stone Town ↔ Airport</td><td>17.00</td><td class="remise">16.15</td></tr>
  <tr><td>Airport / Stone Town ↔ Nungwi, Kendwa</td><td>45.00</td><td class="remise">42.75</td></tr>
  <tr><td>Airport / Stone Town ↔ Matemwe, Kiwengwa, Uroa, Pongwe</td><td>40.00</td><td class="remise">38.00</td></tr>
  <tr><td>Airport / Stone Town ↔ Paje, Bwejuu</td><td>45.00</td><td class="remise">42.75</td></tr>
  <tr><td>Airport / Stone Town ↔ Jambiani, Michamvi</td><td>50.00</td><td class="remise">47.50</td></tr>
  <tr><td>Airport / Stone Town ↔ Kizimkazi, Makunduchi</td><td>45.00</td><td class="remise">42.75</td></tr>
  <tr><td>Nungwi ↔ Paje — coast to coast</td><td>60.00</td><td class="remise">57.00</td></tr>
  <tr><td>Nungwi ↔ Kizimkazi, Makunduchi — north to south</td><td>65.00</td><td class="remise">61.75</td></tr>
  <tr><td>Shared taxi seat, per person (from)</td><td>12.00</td><td class="egal">12.00</td></tr>
  <tr><td>Parcel between towns (medium size)</td><td>10.00</td><td class="egal">10.00</td></tr>
</table>
<p class="accroche" style="margin-top:10px;font-size:15.5px">Prices in USD. The
partner rate applies to private cars only; shared seats and parcels are already at
the lowest published price. Return trips with waiting time, baby seat, large luggage and night
flights are all handled — just say so when booking.</p>

<div class="gps">
  <b>⚡ A taxi straight away, even without booking ahead.</b>
  Our drivers share their position continuously. We see who is near your hotel and
  send the closest one — for a guest in a hurry, that is the difference between
  waiting and leaving.
</div>
<p class="accroche" style="margin-top:10px;font-size:15.5px">Airport transfers, return
trips with waiting time, baby seats and large luggage are all handled — just say so
when booking. Payment by <b>card or mobile wallet</b>.</p>

<h2>How it works</h2>
<div class="etapes">
  <div class="etape"><div class="puce">1</div><div><b>We open your partner account</b> —
  five minutes, on your phone. Nothing to install.</div></div>
  <div class="etape"><div class="puce">2</div><div><b>You book for your guest</b> —
  pick-up, drop-off, time. We confirm a verified driver.</div></div>
  <div class="etape"><div class="puce">3</div><div><b>The guest travels, you follow it</b> —
  and your reception never chases a taxi again.</div></div>
</div>

<div class="bonus">
  <b>🎁 20 completed rides = a 10 USD voucher.</b> Use it for a free parcel or turn it
  into credit on your account. And with a <b>prepaid credit account</b>, your desk
  settles every ride in one tap — no cash to handle.
</div>
<div class="bonus">
  <b>📱 A QR poster for your reception.</b> Guests book by themselves, in their own
  language — your hotel still earns the loyalty rides.
</div>

<h2>Start today</h2>
<a class="bouton" href="https://wa.me/255666241749?text=Hello%20zanziGo%2C%20we%20would%20like%20to%20open%20a%20hotel%20partner%20account.">💬 Open our partner account on WhatsApp</a>
<a class="bouton secondaire" href="/web">🌐 See zanziGo now</a>

${PIED_PARTENAIRE}
</main></body></html>`);
  });

  // Espace RESTAURANTS PARTENAIRES. Un restaurateur n'a pas les mêmes soucis
  // qu'une réception d'hôtel : ses clients repartent le soir, souvent sans
  // voiture, et il a des commandes à faire porter. La page part de là — le
  // dernier service de la soirée, puis la livraison — au lieu de recycler
  // l'argumentaire des transferts aéroport.
  app.get('/restaurant', (_req, res) => {
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>zanziGo for restaurants — a taxi home, and parcels</title>
<style>${STYLE_PARTENAIRE}</style></head><body><main>

<h1>Your last service of the night is <span>getting them home</span>.</h1>
<p class="accroche">zanziGo is a Zanzibar taxi &amp; parcel service. Verified
drivers, published prices, one booking from your counter — the same service your
neighbouring hotels already use.</p>

<div class="gratuit">
  <b>It costs your restaurant nothing.</b> No fee, no subscription, no software to
  install, no commitment. Your customer pays the published price — and you book at a
  <b>5% partner rate</b> on private rides.
</div>

<h2>What changes at your counter</h2>

<div class="carte">
  <h3>🌙 A table leaves — a taxi is already there</h3>
  <p>No walking your guests to the road at 10pm to argue over a price in the dark.
  One booking, a verified driver, the fare fixed before he arrives.</p>
</div>
<div class="carte">
  <h3>📦 A parcel to send between towns</h3>
  <p>Papers to a supplier, a jacket a customer left behind, something to collect in
  Stone Town. You book it like a ride; the driver picks it up and the recipient signs
  for it with a photo. Parcels between towns — not meals to a doorstep.</p>
</div>
<div class="carte">
  <h3>💵 The price is fixed before departure</h3>
  <p>No haggling at your door, no argument in front of your other tables. Your
  customer knows the price when he books; the driver knows it too.</p>
</div>
<div class="carte">
  <h3>🛡️ Every driver is checked by us</h3>
  <p>Driving licence, insurance and vehicle photo verified before a driver can take a
  single booking. You are recommending him — we make sure he is worth it.</p>
</div>

<h2>Your partner prices — private car</h2>
<table>
  <tr><th>Route</th><th>Customer price</th><th>Your price −5%</th></tr>
  <tr><td>Stone Town ↔ Airport</td><td>17.00</td><td class="remise">16.15</td></tr>
  <tr><td>Stone Town ↔ Nungwi, Kendwa</td><td>45.00</td><td class="remise">42.75</td></tr>
  <tr><td>Stone Town ↔ Matemwe, Kiwengwa, Uroa, Pongwe</td><td>40.00</td><td class="remise">38.00</td></tr>
  <tr><td>Stone Town ↔ Paje, Bwejuu</td><td>45.00</td><td class="remise">42.75</td></tr>
  <tr><td>Stone Town ↔ Jambiani, Michamvi</td><td>50.00</td><td class="remise">47.50</td></tr>
  <tr><td>Stone Town ↔ Kizimkazi, Makunduchi</td><td>45.00</td><td class="remise">42.75</td></tr>
  <tr><td>Nungwi ↔ Paje — coast to coast</td><td>60.00</td><td class="remise">57.00</td></tr>
  <tr><td>Nungwi ↔ Kizimkazi, Makunduchi — north to south</td><td>65.00</td><td class="remise">61.75</td></tr>
  <tr><td>Shared taxi seat, per person (from)</td><td>12.00</td><td class="egal">12.00</td></tr>
</table>

<h2>Parcels between towns — one price, by size</h2>
<table>
  <tr><th>Parcel</th><th>Price</th></tr>
  <tr><td>Small — documents, keys, an envelope</td><td>5.00</td></tr>
  <tr><td>Medium — a bag, a small box, a forgotten item</td><td>10.00</td></tr>
  <tr><td>Large — a crate, a full restocking run</td><td>18.00</td></tr>
</table>
<p class="accroche" style="margin-top:10px;font-size:15.5px">Prices in USD. The
partner rate applies to private cars only; shared seats and parcels are already at
the lowest published price. Payment by <b>card or mobile wallet</b> — your driver
never handles money.</p>

<div class="gps">
  <b>⚡ A taxi straight away, even without booking ahead.</b>
  Our drivers share their position continuously. We see who is near your restaurant
  and send the closest one — for a table that has just asked for the bill, that is
  the difference between waiting and leaving.
</div>

<h2>How it works</h2>
<div class="etapes">
  <div class="etape"><div class="puce">1</div><div><b>We open your partner account</b> —
  five minutes, on your phone. Nothing to install.</div></div>
  <div class="etape"><div class="puce">2</div><div><b>You book for your customer</b> —
  pick-up, drop-off, time. We confirm a verified driver.</div></div>
  <div class="etape"><div class="puce">3</div><div><b>You follow it on screen</b> —
  requested, driver confirmed, on the way, completed.</div></div>
</div>

<div class="bonus">
  <b>🎁 20 completed rides = a 10 USD voucher.</b> Use it for a free parcel or turn
  it into credit on your account. And with a <b>prepaid credit account</b>, your
  counter settles everything in one tap — no cash to handle.
</div>
<div class="bonus">
  <b>📱 A QR card for your tables.</b> Your customers book their own ride, in their own
  language, while they finish their coffee — and your restaurant still earns the
  loyalty rides.
</div>

<h2>Start today</h2>
<a class="bouton" href="https://wa.me/255666241749?text=Hello%20zanziGo%2C%20we%20would%20like%20to%20open%20a%20restaurant%20partner%20account.">💬 Open our partner account on WhatsApp</a>
<a class="bouton secondaire" href="/web">🌐 See zanziGo now</a>

${PIED_PARTENAIRE}
</main></body></html>`);
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
<a class="bouton" href="https://expo.dev/artifacts/eas/cJNvxejVN3wvSAfdXdVq3adlaczFCVjPOtVV10VkYg8.apk">📥 Sakinisha app — Installer l'app (Android)</a>
<ol>
<li><strong>Sakinisha — Installer</strong> : touchez le bouton pour télécharger. Si <em>Google Play Protect</em> affiche « <strong>App blocked / Application bloquée</strong> », touchez <strong>« More details / Plus de détails »</strong>, puis <strong>« Install anyway / Installer quand même »</strong>. C'est normal : l'app ne vient pas du Play Store, mais elle est sûre.</li>
<li><strong>Jisajili — S'inscrire</strong> : ouvrez l'app, choisissez « Chauffeur », entrez votre numéro.</li>
<li><strong>Endesha — Rouler</strong> : l'équipe valide vos papiers, et les courses arrivent.</li>
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
  app.post('/api/uploads', uploadLimiter);

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/drivers', driversRouter);
  app.use('/api/hotels', hotelsRouter);
  app.use('/api/trips', tripsRouter);
  app.use('/api/packages', packagesRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/rides', ridesRouter);
  app.use('/api/rental-vehicles', rentalVehiclesRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/verifications', verificationsRouter);

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route inconnue' } });
  });

  app.use(errorHandler);
  return app;
}
