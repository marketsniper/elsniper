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
    // 20 USD pour les sauts de village de la côte est à 12 USD).
    assert.equal(privateUsdForRoute('Nungwi', 'Paje'), 65);
    assert.equal(privateUsdForRoute('Paje', 'Nungwi'), 65);
    assert.equal(privateUsdForRoute('Nungwi', 'Kizimkazi'), 70);
    assert.equal(privateUsdForRoute('Kizimkazi', 'Nungwi'), 70);
    // Sauter un village (par-dessus Bwejuu) reste à 20 USD.
    assert.equal(privateUsdForRoute('Michamvi', 'Paje'), 20);
  });

  it('la chaîne de la côte est : d’un village au suivant, 12 USD', () => {
    // Michamvi → Bwejuu → Paje → Jambiani → Makunduchi : chaque maillon
    // vaut 12 USD, dans les deux sens.
    const maillons = [
      ['Michamvi', 'Bwejuu'],
      ['Bwejuu', 'Paje'],
      ['Paje', 'Jambiani'],
      ['Jambiani', 'Makunduchi'],
    ];
    for (const [a, b] of maillons) {
      assert.equal(privateUsdForRoute(a, b), 12, `${a} → ${b}`);
      assert.equal(privateUsdForRoute(b, a), 12, `${b} → ${a}`);
    }
  });

  it('sauts de village : 12 USD à 20 % — le chauffeur garde 9,60', () => {
    const saut = priceTrip('private', 'tourist', { pickup: 'Paje', dropoff: 'Jambiani' });
    assert.equal(saut.price, 12);
    assert.equal(saut.commission, 2.4);
    assert.equal(saut.price - saut.commission, 9.6, 'le gain chauffeur a changé');
    // Local sur le même trajet : prix ET commission convertis (×2600, 20 %).
    const local = priceTrip('private', 'local', { pickup: 'Paje', dropoff: 'Jambiani' });
    assert.equal(local.price, 12 * 2600);
    assert.equal(local.commission, 12 * 2600 * 0.2);
    // Sauter un village garde sa commission dédiée : 20 USD → 15 % = 3 USD.
    const vingt = priceTrip('private', 'tourist', { pickup: 'Michamvi', dropoff: 'Paje' });
    assert.equal(vingt.price, 20);
    assert.equal(vingt.commission, 3);
    // Les autres privés gardent 10 % (Matemwe → Paje 55 → 5,50).
    const normal = priceTrip('private', 'tourist', { pickup: 'Matemwe', dropoff: 'Paje' });
    assert.equal(normal.commission, 5.5);
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

  it('trajet court : la demande de course PARTAGÉE est refusée, la privée passe', async () => {
    const { token, user } = await createTourist();
    const partage = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: user.id,
        tripType: 'shared_tourist',
        pickupLocation: 'Paje',
        dropoffLocation: 'Jambiani',
      });
    assert.equal(partage.status, 422);
    assert.equal(partage.body.error.code, 'no_shared_route');

    const prive = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: user.id,
        tripType: 'private',
        pickupLocation: 'Paje',
        dropoffLocation: 'Jambiani',
      });
    assert.equal(prive.status, 201, JSON.stringify(prive.body));
    assert.equal(Number(prive.body.price), 12);
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
