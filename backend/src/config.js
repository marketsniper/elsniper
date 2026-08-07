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

export const config = {
  env: env.NODE_ENV || 'development',
  isProd,
  port: Number(env.PORT) || 3000,
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

  // Métier
  commissionRate: Number(env.COMMISSION_RATE) || 0.15,
  teamWhatsappNumber: env.TEAM_WHATSAPP_NUMBER || '+255000000000',
  // Taux de change pour l'affichage des trajets partagés aux touristes
  // (prix postés en TZS par les chauffeurs, montrés en USD aux visiteurs).
  exchangeTzsPerUsd: Number(env.EXCHANGE_TZS_PER_USD) || 2600,

  // Pesapal (paiements) — sans clés, le service tourne en mode stub
  pesapal: {
    env: env.PESAPAL_ENV || 'sandbox',
    consumerKey: env.PESAPAL_CONSUMER_KEY || '',
    consumerSecret: env.PESAPAL_CONSUMER_SECRET || '',
    ipnUrl: env.PESAPAL_IPN_URL || '',
    callbackUrl: env.PESAPAL_CALLBACK_URL || '',
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
