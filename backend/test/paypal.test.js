// Tests du service PayPal (parties pures — sans clés, le circuit renvoie
// null et les routes gardent leurs comportements historiques).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  circuitPaiementUsd,
  hasPaypalMe,
  isPaypalConfigured,
  paypalMeLink,
} from '../src/services/paypalService.js';

describe('PayPal — service', () => {
  it('sans clés ni PayPal.Me : rien de configuré, circuit USD → null', async () => {
    assert.equal(isPaypalConfigured(), false);
    assert.equal(hasPaypalMe(), false);
    assert.equal(await circuitPaiementUsd({ amount: 45, currency: 'USD' }), null);
  });

  it('les paiements TZS ne passent jamais par PayPal', async () => {
    assert.equal(await circuitPaiementUsd({ amount: 15000, currency: 'TZS' }), null);
  });

  it('paypalMeLink construit un lien à montant exact', () => {
    assert.equal(paypalMeLink('zanzigo', 47.5), 'https://www.paypal.me/zanzigo/47.5');
    assert.equal(paypalMeLink('zanzigo', 9), 'https://www.paypal.me/zanzigo/9');
  });
});
