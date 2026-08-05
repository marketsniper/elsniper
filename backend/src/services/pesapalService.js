import { randomUUID } from 'node:crypto';

// Stub Pesapal (MVP) : simule la création d'un lien de paiement.
//
// Intégration réelle prévue (voir docs/architecture-technique.md §6) :
// 1. Authentification OAuth avec consumer_key / consumer_secret.
// 2. SubmitOrderRequest -> vraie redirect_url Pesapal.
// 3. Endpoint IPN : POST /payments/:id/confirm devient le webhook,
//    avec vérification de signature Pesapal.
export async function createPaymentLink({ amount, currency, description }) {
  const reference = `PESAPAL-STUB-${randomUUID()}`;
  return {
    reference,
    paymentLink: `https://pay.pesapal.example/${reference}?amount=${amount}&currency=${currency}&desc=${encodeURIComponent(description)}`,
  };
}
