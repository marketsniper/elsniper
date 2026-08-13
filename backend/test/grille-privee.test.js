// Grille privée VILLE ↔ VILLE au kilomètre : les trajets connus (hubs,
// spéciaux) gardent leurs prix, les autres paires sont facturées à la
// distance — 0,85 USD/km de route, arrondi aux 5 USD, minimum 20 USD.
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
    // Trajets spéciaux : prioritaires sur la formule (et sur le minimum de
    // 20 USD pour les petits sauts de la côte est à 10 USD).
    assert.equal(privateUsdForRoute('Nungwi', 'Paje'), 65);
    assert.equal(privateUsdForRoute('Paje', 'Nungwi'), 65);
    assert.equal(privateUsdForRoute('Nungwi', 'Kizimkazi'), 70);
    assert.equal(privateUsdForRoute('Kizimkazi', 'Nungwi'), 70);
    assert.equal(privateUsdForRoute('Michamvi', 'Paje'), 20);
    assert.equal(privateUsdForRoute('Makunduchi', 'Jambiani'), 20);
    assert.equal(privateUsdForRoute('Paje', 'Bwejuu'), 10);
    assert.equal(privateUsdForRoute('Paje', 'Jambiani'), 10);
    assert.equal(privateUsdForRoute('Jambiani', 'Paje'), 10);
  });

  it('paires de villes : 0,85 USD/km, arrondi aux 5 USD, minimum 20', () => {
    // Voisines et moyennes distances : le minimum de 20 USD s'applique.
    assert.equal(privateUsdForRoute('Nungwi', 'Kendwa'), 20);
    assert.equal(privateUsdForRoute('Bwejuu', 'Jambiani'), 20);
    assert.equal(privateUsdForRoute('Nungwi', 'Matemwe'), 20);
    // Grandes traversées : au kilomètre.
    assert.equal(privateUsdForRoute('Matemwe', 'Paje'), 55); // ≈ 65 km
    assert.equal(privateUsdForRoute('Kendwa', 'Kizimkazi'), 85); // ≈ 102 km
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
