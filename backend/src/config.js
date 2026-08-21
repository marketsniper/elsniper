// Configuration centralisée du backend zanziGo.
// Toutes les variables d'environnement sont lues ici (jamais ailleurs).
import 'dotenv/config';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

// Secret JWT : OBLIGATOIREMENT fort et aléatoire en production.
const jwtSecret = env.JWT_SECRET || 'dev-secret-zanzigo';
if (!env.JWT_SECRET && !isProd) {
  console.warn(
    '[config] JWT_SECRET non défini — utilisation du secret de dev "dev-secret-zanzigo" (NE PAS utiliser en production)'
  );
}
if (!env.JWT_SECRET && isProd) {
  throw new Error('JWT_SECRET est obligatoire en production');
}

// Clé d'équipe : OBLIGATOIRE et forte en production — même exigence que le
// secret JWT. Sans ce garde-fou, une variable absente (ou vidée dans le
// tableau Render) faisait retomber la clé sur « dev-admin-key » : toute la
// plateforme (sauvegarde complète, remise à zéro, mots de passe) s'ouvrait
// avec une valeur écrite dans le code source public.
if (isProd && !env.ADMIN_API_KEY) {
  throw new Error('ADMIN_API_KEY est obligatoire en production');
}

export const config = {
  env: env.NODE_ENV || 'development',
  isProd,
  port: Number(env.PORT) || 3000,
  // Origine publique du serveur (liens de documents). Vide = déduite de la
  // requête entrante, ce qui suffit en production comme en développement.
  publicBaseUrl: env.PUBLIC_BASE_URL || '',
  databaseUrl:
    env.DATABASE_URL || 'postgres://zanzigo:zanzigo@localhost:5432/zanzigo',

  // Authentification
  jwtSecret,
  jwtExpiresIn: env.JWT_EXPIRES_IN || '30d',
  adminApiKey: env.ADMIN_API_KEY || 'dev-admin-key',
  // Mode pilote : renvoie le code OTP dans la réponse API même en
  // production (tant qu'aucun fournisseur SMS n'est branché). Ne JAMAIS
  // laisser activé avec de vrais utilisateurs.
  exposeOtpDevCode: env.OTP_EXPOSE_DEV_CODE === '1',

  // LA CONNEXION PAR CODE EST FERMÉE EN PRODUCTION.
  //
  // L'app ne s'en sert plus : tout le monde entre avec un identifiant et un
  // mot de passe (clients, locaux, chauffeurs, hôtels). La porte restait
  // pourtant ouverte côté serveur — et comme aucun fournisseur d'envoi n'est
  // branché, elle renvoyait le code dans sa propre réponse : il suffisait de
  // connaître un numéro pour entrer dans le compte correspondant.
  //
  // Elle reste allumée hors production (les tests s'en servent pour fabriquer
  // des comptes) et se rallume par OTP_ACTIF=1 le jour où l'on voudra une
  // vraie connexion par code, avec un envoi réel derrière.
  otpActif: env.OTP_ACTIF === '1' || (env.NODE_ENV || 'development') !== 'production',

  // SURCHARGE CARTE BANCAIRE — payée par le client qui choisit la carte.
  // 4 % : le taux d'équilibre pour 3,5 % de frais est 3,63 % (la banque
  // prélève sur le montant déjà surchargé), on arrondit au-dessus.
  // Jamais appliquée aux paiements en TZS (portefeuille mobile) ni au crédit
  // prépayé des hôtels. Mettre 0 pour la désactiver.
  surchargeCarte: env.SURCHARGE_CARTE === undefined ? 0.04 : Number(env.SURCHARGE_CARTE),

  // Métier
  commissionRate: Number(env.COMMISSION_RATE) || 0.15,
  teamWhatsappNumber: env.TEAM_WHATSAPP_NUMBER || '+255000000000',
  // Prix touriste d'une place en taxi partagé (USD, fixe) — les chauffeurs
  // postent leur prix local en TZS, les visiteurs voient ce tarif-ci.
  sharedRideUsdPerSeat: Number(env.RIDES_USD_PER_SEAT) || 18,
  // Remise accordée aux résidents vérifiés (sur les prix USD).
  residentDiscountRate: Number(env.RESIDENT_DISCOUNT_RATE) || 0.05,
  hotelDiscountRate: Number(env.HOTEL_DISCOUNT_RATE) || 0.05,
  // Tarif local unique (TZS) — réservé aux locaux à carte d'identité
  // tanzanienne vérifiée, pour TOUS les types de trajets.
  localTripPriceTzs: Number(env.LOCAL_TRIP_PRICE_TZS) || 17000,
  // Taux de conversion appliqué aux locaux sur les courses PRIVÉES : même
  // prix que la grille touriste, payé en shillings (aligné sur la grille
  // colis : 5 USD ↔ 13 000 TZS).
  usdToTzsRate: Number(env.USD_TO_TZS_RATE) || 2600,

  // PayPal (paiements USD dans l'app) — trois niveaux, du plus automatique
  // au plus manuel :
  //  1. clientId + clientSecret présents → PayPal Checkout complet : le
  //     serveur crée l'ordre, le client approuve, le serveur capture et
  //     vérifie — AUCUNE action de l'équipe ;
  //  2. sinon, meUsername présent → lien PayPal.Me à montant exact, l'équipe
  //     valide dans le tableau de bord après réception de l'argent ;
  //  3. sinon → circuits actuels (WhatsApp pour les colis, Pesapal/stub).
  // URL publique de l'API (pages de retour PayPal).
  publicApiUrl: env.PUBLIC_API_URL || 'https://zanzigo-api.onrender.com',

  paypal: {
    env: env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox',
    clientId: env.PAYPAL_CLIENT_ID || '',
    clientSecret: env.PAYPAL_CLIENT_SECRET || '',
    meUsername: env.PAYPAL_ME_USERNAME || '',
  },

  // Pesapal (paiements) — sans clés, le service tourne en mode stub.
  // IPN : webhook appelé par Pesapal quand un paiement aboutit ; callback :
  // page où le client revient après avoir payé. Les deux ont des valeurs par
  // défaut basées sur l'URL publique de l'API.
  pesapal: {
    env: env.PESAPAL_ENV || 'sandbox',
    consumerKey: env.PESAPAL_CONSUMER_KEY || '',
    consumerSecret: env.PESAPAL_CONSUMER_SECRET || '',
    ipnUrl:
      env.PESAPAL_IPN_URL ||
      `${env.PUBLIC_API_URL || 'https://zanzigo-api.onrender.com'}/api/payments/pesapal-ipn`,
    callbackUrl:
      env.PESAPAL_CALLBACK_URL ||
      `${env.PUBLIC_API_URL || 'https://zanzigo-api.onrender.com'}/api/pesapal/retour`,
  },

  // E-mails transactionnels (récapitulatif d'inscription…). Deux
  // fournisseurs au choix, par simple variable d'environnement :
  //  - BREVO_API_KEY (https://brevo.com — 300 e-mails/jour gratuits, il
  //    suffit de vérifier une adresse d'expéditeur, pas besoin de domaine) ;
  //  - RESEND_API_KEY (https://resend.com — demande un domaine vérifié).
  // EMAIL_FROM : « zanziGo <adresse@example.com> » (l'adresse doit être
  // vérifiée chez le fournisseur). Sans aucune clé, mode stub : l'e-mail est
  // journalisé, l'inscription n'échoue JAMAIS pour un e-mail.
  emailer: {
    brevoApiKey: env.BREVO_API_KEY || '',
    resendApiKey: env.RESEND_API_KEY || '',
    from: env.EMAIL_FROM || 'zanziGo <onboarding@resend.dev>',
    // Boîte de l'ÉQUIPE : canal de SECOURS des notifications automatiques
    // (utilisé seulement si le WhatsApp CallMeBot n'est pas configuré).
    teamEmail: env.TEAM_EMAIL || '',
  },

  // Notifications équipe par WHATSAPP (canal préféré) via CallMeBot —
  // passerelle gratuite : depuis le WhatsApp de l'équipe, ajouter le numéro
  // du bot en contact, lui envoyer « I allow callmebot to send me
  // messages », recevoir la clé, la poser dans CALLMEBOT_APIKEY. Dès que la
  // clé est là, chaque action de la plateforme arrive en WhatsApp sur le
  // téléphone de l'équipe — automatiquement, sans action des clients.
  // Alertes INSTANTANÉES sur le téléphone de l'équipe (notifications web).
  // Les clés VAPID identifient notre serveur auprès d'Apple et de Google ;
  // elles se génèrent une fois pour toutes (npx web-push generate-vapid-keys)
  // et ne changent plus — en changer déconnecterait tous les téléphones.
  push: {
    publicKey: env.VAPID_PUBLIC_KEY || '',
    privateKey: env.VAPID_PRIVATE_KEY || '',
    subject: env.VAPID_SUBJECT || 'mailto:zanzigo@zanzigo.com',
  },

  callmebot: {
    apiKey: env.CALLMEBOT_APIKEY || '',
    phone: env.CALLMEBOT_PHONE || env.TEAM_WHATSAPP_NUMBER || '+255666241749',
  },

  // SMS RÉELS (codes OTP) via Africa's Talking — sans clés, mode stub : le
  // code s'affiche dans l'app (mode pilote). Avec les clés, les clients
  // reçoivent VRAIMENT leur code par SMS et le mode pilote se coupe seul.
  sms: {
    username: env.AT_USERNAME || '',
    apiKey: env.AT_API_KEY || '',
    senderId: env.AT_SENDER_ID || '',
  },

  // Stockage S3 compatible (Cloudflare R2 recommandé) — sans clés, fallback disque local
  s3: {
    bucket: env.S3_BUCKET || '',
    accessKeyId: env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: env.S3_SECRET_ACCESS_KEY || '',
    endpoint: env.S3_ENDPOINT || '',
    region: env.S3_REGION || 'auto',
    publicUrl: env.S3_PUBLIC_URL || '',
  },
};
