// Intégration PayPal (paiements USD dans l'app).
//
// Mode COMPLET (PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET) — Orders API v2 :
//  1. createPaypalOrder(...) crée l'ordre et renvoie le lien d'approbation ;
//  2. le client paie dans son navigateur (compte PayPal ou carte bancaire) ;
//  3. capturePaypalOrder(...) capture l'argent et renvoie le statut RÉEL —
//     c'est le serveur qui vérifie auprès de PayPal, jamais le client.
//
// Mode LIEN (PAYPAL_ME_USERNAME) : paypalMeLink(...) construit un lien
// PayPal.Me au montant exact ; la confirmation reste manuelle (équipe).
//
// PayPal ne gère pas le shilling tanzanien : tout ceci ne concerne que les
// paiements en USD (touristes, résidents, hôtels). Les paiements TZS gardent
// leurs circuits actuels.
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../errors.js';

const BASES = {
  live: 'https://api-m.paypal.com',
  sandbox: 'https://api-m.sandbox.paypal.com',
};

export function isPaypalConfigured() {
  return Boolean(config.paypal.clientId && config.paypal.clientSecret);
}

export function hasPaypalMe() {
  return Boolean(config.paypal.meUsername);
}

/** Lien PayPal.Me à montant exact (USD), ex. https://paypal.me/zanzigo/47.5 */
export function paypalMeLink(username, amount) {
  const montant = Number(amount);
  const suffixe = Number.isFinite(montant) ? `/${montant}` : '';
  return `https://www.paypal.me/${encodeURIComponent(username)}${suffixe}`;
}

function base() {
  return BASES[config.paypal.env] ?? BASES.sandbox;
}

// Jeton OAuth applicatif, mis en cache jusqu'à expiration (marge de 60 s).
let jetonCache = { token: null, expiresAt: 0 };

async function getAccessToken() {
  if (jetonCache.token && Date.now() < jetonCache.expiresAt) return jetonCache.token;
  const credentials = Buffer.from(
    `${config.paypal.clientId}:${config.paypal.clientSecret}`
  ).toString('base64');
  const res = await fetch(`${base()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    throw new HttpError(502, 'paypal_error', `Authentification PayPal impossible (${res.status})`);
  }
  const data = await res.json();
  jetonCache = {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) - 60) * 1000,
  };
  return jetonCache.token;
}

/**
 * Choix du circuit de paiement pour un montant donné (courses et colis) :
 *  - USD + PayPal configuré → ordre PayPal (capture vérifiée côté serveur) ;
 *  - USD + PayPal.Me → lien à montant exact, validation équipe ;
 *  - sinon → null (le circuit historique de la route s'applique).
 */
export async function circuitPaiementUsd({ amount, currency, description }) {
  if (currency !== 'USD') return null;
  if (isPaypalConfigured()) {
    const { orderId, approveUrl } = await createPaypalOrder({
      amount,
      reference: randomUUID(),
      description,
    });
    return { reference: `PAYPAL-${orderId}`, paymentLink: approveUrl, method: 'paypal' };
  }
  if (hasPaypalMe()) {
    return {
      reference: `PAYPALME-${randomUUID()}`,
      paymentLink: paypalMeLink(config.paypal.meUsername, amount),
      method: 'paypal_me',
    };
  }
  return null;
}

/**
 * Crée un ordre PayPal (intent CAPTURE) et renvoie {orderId, approveUrl}.
 * Le payeur est renvoyé vers /api/paypal/retour après approbation.
 */
export async function createPaypalOrder({ amount, reference, description }) {
  const token = await getAccessToken();
  const res = await fetch(`${base()}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: reference,
          description,
          amount: { currency_code: 'USD', value: Number(amount).toFixed(2) },
        },
      ],
      application_context: {
        brand_name: 'zanziGo',
        user_action: 'PAY_NOW',
        shipping_preference: 'NO_SHIPPING',
        return_url: `${config.publicApiUrl}/api/paypal/retour`,
        cancel_url: `${config.publicApiUrl}/api/paypal/annule`,
      },
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id) {
    throw new HttpError(502, 'paypal_error', 'Création de l\'ordre PayPal impossible');
  }
  const approveUrl = (data.links ?? []).find(
    (l) => l.rel === 'approve' || l.rel === 'payer-action'
  )?.href;
  if (!approveUrl) {
    throw new HttpError(502, 'paypal_error', 'Lien d\'approbation PayPal absent');
  }
  return { orderId: data.id, approveUrl };
}

/**
 * Capture un ordre approuvé et renvoie son statut final ('COMPLETED' si
 * l'argent est encaissé). Un ordre déjà capturé est relu au lieu d'échouer.
 */
export async function capturePaypalOrder(orderId) {
  const token = await getAccessToken();
  const res = await fetch(`${base()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => null);
  if (res.ok && data?.status) return data.status;

  // Déjà capturé (double clic, relance) : on relit l'ordre pour le statut réel.
  const dejaCapture = data?.details?.some?.((d) => d.issue === 'ORDER_ALREADY_CAPTURED');
  if (dejaCapture) {
    const lecture = await fetch(`${base()}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ordre = await lecture.json().catch(() => null);
    if (lecture.ok && ordre?.status) return ordre.status;
  }
  // Pas encore approuvé par le payeur → statut non abouti, sans erreur dure.
  if (data?.details?.some?.((d) => d.issue === 'ORDER_NOT_APPROVED')) return 'CREATED';
  throw new HttpError(502, 'paypal_error', 'Vérification du paiement PayPal impossible');
}
