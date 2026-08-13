// Grille privée VILLE ↔ VILLE au kilomètre : les trajets connus gardent
// leurs prix (ancrages), les autres paires sont extrapolées à la distance
// (20 USD de prise en charge + 0,50 USD/km de route, arrondi aux 5 USD).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { privateUsdForRoute, priceTrip } from '../src/services/pricingService.js';
import { app, authHeaders, createTourist, useTestDb } from './setup.js';

useTestDb();

describe('Grille privée au kilomètre', () => {
  it('ancrages : les trajets connus gardent leurs prix', () => {
    // Hubs → zone (grille historique inchangée).
    assert.equal(privateUsdForRoute('Stone Town', 'Nungwi'), 50);
    assert.equal(privateUsdForRoute('Aéroport (AAKIA)', 'Paje'), 50);
    assert.equal(privateUsdForRoute('Stone Town Ferry', 'Matemwe'), 45);
    // Trajet spécial : prioritaire sur la formule.
    assert.equal(privateUsdForRoute('Nungwi', 'Paje'), 65);
    assert.equal(privateUsdForRoute('Paje', 'Nungwi'), 65);
  });

  it('paires de villes : extrapolation au kilomètre, arrondie aux 5 USD', () => {
    // Voisines : minimum 20-25 USD.
    assert.equal(privateUsdForRoute('Nungwi', 'Kendwa'), 20);
    assert.equal(privateUsdForRoute('Paje', 'Jambiani'), 25);
    // Moyennes distances.
    assert.equal(privateUsdForRoute('Nungwi', 'Matemwe'), 30);
    assert.equal(privateUsdForRoute('Paje', 'Michamvi'), 30);
    // Grandes traversées.
    assert.equal(privateUsdForRoute('Matemwe', 'Paje'), 55);
    assert.equal(privateUsdForRoute('Nungwi', 'Kizimkazi'), 75);
    // Symétrie : même prix dans les deux sens.
    assert.equal(
      privateUsdForRoute('Kiwengwa', 'Jambiani'),
      privateUsdForRoute('Jambiani', 'Kiwengwa')
    );
  });

  it('ville inconnue : retombe sur la grille par zone (jamais d\'erreur)', () => {
    assert.equal(privateUsdForRoute('Hôtel Mystère', 'Nungwi'), 50);
    assert.equal(privateUsdForRoute('Quelque part', 'Ailleurs'), 50);
  });

  it('priceTrip applique la grille km (touriste USD, local en TZS ×2600)', () => {
    const touriste = priceTrip('private', 'tourist', { pickup: 'Matemwe', dropoff: 'Paje' });
    assert.equal(touriste.price, 55);
    assert.equal(touriste.currency, 'USD');
    const local = priceTrip('private', 'local', { pickup: 'Matemwe', dropoff: 'Paje' });
    assert.equal(local.price, 55 * 2600);
    assert.equal(local.currency, 'TZS');
  });

  it('bout en bout : une course privée Matemwe → Paje est créée à 55 USD', async () => {
    const { token, user } = await createTourist();
    const creation = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: user.id,
        tripType: 'private',
        pickupLocation: 'Matemwe',
        dropoffLocation: 'Paje',
      });
    assert.equal(creation.status, 201, JSON.stringify(creation.body));
    assert.equal(Number(creation.body.price), 55);
    assert.equal(creation.body.currency, 'USD');
    // Commission privé 10 %.
    assert.equal(Number(creation.body.commission), 5.5);
  });
});
