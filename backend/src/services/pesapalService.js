// Intégration Pesapal v3 (paiements mobile money / carte en Afrique de l'Est).
//
// Deux modes :
//  - RÉEL : si PESAPAL_CONSUMER_KEY + PESAPAL_CONSUMER_SECRET sont définis,
//    appels à l'API Pesapal v3 (live ou sandbox selon PESAPAL_ENV).
//  - STUB : sans clés, on génère une fausse référence + un faux lien de
//    paiement — suffisant pour le dev et les tests bout-en-bout.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../errors.js';

const hasKeys = Boolean(
  config.pesapal.consumerKey && config.pesapal.consumerSecret
);

const BASE_URL =
  config.pesapal.env === 'sandbox'
    ? 'https://cybqa.pesapal.com/pesapalv3'
    : 'https://pay.pesapal.com/v3';

// Le service annonce son mode au démarrage (importé par app.js)
console.log(
  hasKeys
    ? `[pesapal] mode RÉEL (${config.pesapal.env}) — base ${BASE_URL}`
    : '[pesapal] mode STUB — aucun appel réseau (définir PESAPAL_CONSUMER_KEY/SECRET pour le mode réel)'
);

export function isStubMode() {
  return !hasKeys;
}

// ===== Cache du jeton d'accès (validité Pesapal ~5 min, on garde 4 min) =====
let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;

  const res = await fetch(`${BASE_URL}/api/Auth/RequestToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      consumer_key: config.pesapal.consumerKey,
      consumer_secret: config.pesapal.consumerSecret,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.token) {
    throw new HttpError(
      502,
      'pesapal_auth_failed',
      `Authentification Pesapal échouée : ${data.error?.message || res.status}`
    );
  }
  cachedToken = data.token;
  cachedTokenExpiresAt = Date.now() + 4 * 60 * 1000; // ~4 minutes
  return cachedToken;
}

// ===== Cache de l'IPN (enregistré une fois par processus) =====
let cachedIpnId = null;

async function getIpnId(token) {
  if (cachedIpnId) return cachedIpnId;
  const res = await fetch(`${BASE_URL}/api/URLSetup/RegisterIPN`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      url: config.pesapal.ipnUrl,
      ipn_notification_type: 'POST',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.ipn_id) {
    throw new HttpError(
      502,
      'pesapal_ipn_failed',
      `Enregistrement IPN Pesapal échoué : ${data.error?.message || res.status}`
    );
  }
  cachedIpnId = data.ipn_id;
  return cachedIpnId;
}

// Crée un ordre de paiement.
// Retour : {reference, paymentLink}
//  - reference   : order_tracking_id Pesapal (ou référence stub)
//  - paymentLink : URL de redirection où le client paie
export async function createPaymentOrder({ amount, currency, description }) {
  if (!hasKeys) {
    // ----- MODE STUB -----
    const reference = `STUB-${crypto.randomBytes(8).toString('hex')}`;
    return {
      reference,
      paymentLink: `https://pay.example.test/${reference}`,
    };
  }

  // ----- MODE RÉEL -----
  const token = await getToken();
  const notificationId = await getIpnId(token);

  const res = await fetch(`${BASE_URL}/api/Transactions/SubmitOrderRequest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      id: crypto.randomUUID(), // référence marchand unique
      currency,
      amount,
      description,
      callback_url: config.pesapal.callbackUrl,
      notification_id: notificationId,
      billing_address: {},
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.order_tracking_id) {
    throw new HttpError(
      502,
      'pesapal_order_failed',
      `Création d'ordre Pesapal échouée : ${data.error?.message || res.status}`
    );
  }
  return {
    reference: data.order_tracking_id,
    paymentLink: data.redirect_url,
  };
}

// Statut d'une transaction Pesapal (mode réel uniquement).
// Retourne payment_status_description : PENDING | COMPLETED | FAILED | INVALID | REVERSED
export async function getTransactionStatus(orderTrackingId) {
  if (!hasKeys) {
    // En stub, tout est considéré payé (utile en dev)
    return 'COMPLETED';
  }
  const token = await getToken();
  const res = await fetch(
    `${BASE_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new HttpError(
      502,
      'pesapal_status_failed',
      `Lecture du statut Pesapal échouée : ${data.error?.message || res.status}`
    );
  }
  return (data.payment_status_description || 'PENDING').toUpperCase();
}
