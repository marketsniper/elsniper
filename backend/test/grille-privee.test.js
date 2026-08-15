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
    // Hubs → zone : grille alignée sur le marché des transferts.
    assert.equal(privateUsdForRoute('Stone Town', 'Nungwi'), 45);
    assert.equal(privateUsdForRoute('Stone Town', 'Kendwa'), 45);
    assert.equal(privateUsdForRoute('Stone Town Ferry', 'Matemwe'), 40);
    assert.equal(privateUsdForRoute('Aéroport (AAKIA)', 'Paje'), 45);
    assert.equal(privateUsdForRoute('Stone Town', 'Bwejuu'), 45);
    assert.equal(privateUsdForRoute('Stone Town', 'Jambiani'), 50);
    assert.equal(privateUsdForRoute('Stone Town', 'Michamvi'), 50);
    assert.equal(privateUsdForRoute('Stone Town', 'Kizimkazi'), 45);
    assert.equal(privateUsdForRoute('Stone Town', 'Makunduchi'), 45);
    // Trajets spéciaux : prioritaires sur la formule (et sur le minimum de
    // 20 USD pour les sauts de village de la côte est à 12 USD).
    // Les traversées ne sont plus codées en dur : les paliers de distance
    // les produisent, et dans les deux sens.
    assert.equal(privateUsdForRoute('Nungwi', 'Paje'), 60);
    assert.equal(privateUsdForRoute('Paje', 'Nungwi'), 60);
    assert.equal(privateUsdForRoute('Nungwi', 'Kizimkazi'), 65);
    assert.equal(privateUsdForRoute('Kizimkazi', 'Nungwi'), 65);
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

  it('un village d’écart : 16 USD, sur les trois paires concernées', () => {
    const ecarts = [
      ['Michamvi', 'Paje'], // par-dessus Bwejuu
      ['Bwejuu', 'Jambiani'], // par-dessus Paje
      ['Paje', 'Makunduchi'], // par-dessus Jambiani
    ];
    for (const [a, b] of ecarts) {
      assert.equal(privateUsdForRoute(a, b), 16, `${a} → ${b}`);
      assert.equal(privateUsdForRoute(b, a), 16, `${b} → ${a}`);
      const saut = priceTrip('private', 'tourist', { pickup: a, dropoff: b });
      assert.equal(saut.commission, 3.2, `${a} → ${b} : commission 20 %`);
      assert.equal(saut.price - saut.commission, 12.8, `${a} → ${b} : gain chauffeur`);
    }
    // Au-delà de deux villages, les paliers de distance reprennent.
    assert.equal(privateUsdForRoute('Michamvi', 'Jambiani'), 25); // ≈ 32 km
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
    // Les autres privés gardent 10 % (Matemwe → Paje 55 → 5,50).
    const normal = priceTrip('private', 'tourist', { pickup: 'Matemwe', dropoff: 'Paje' });
    assert.equal(normal.commission, 4);
  });

  it('paliers de distance : du village voisin à la traversée du nord au sud', () => {
    // La même logique que la côte est, prolongée à toute l'île.
    assert.equal(privateUsdForRoute('Nungwi', 'Kendwa'), 12); // ≈ 5 km, voisins
    assert.equal(privateUsdForRoute('Nungwi', 'Matemwe'), 16); // ≈ 23 km
    assert.equal(privateUsdForRoute('Nungwi', 'Kiwengwa'), 25); // ≈ 41 km
    assert.equal(privateUsdForRoute('Nungwi', 'Chwaka'), 40); // ≈ 68 km
    assert.equal(privateUsdForRoute('Matemwe', 'Paje'), 40); // ≈ 65 km
    assert.equal(privateUsdForRoute('Nungwi', 'Paje'), 60); // ≈ 88 km, côte à côte
    assert.equal(privateUsdForRoute('Kendwa', 'Kizimkazi'), 65); // ≈ 102 km, nord → sud
    assert.equal(privateUsdForRoute('Nungwi', 'Makunduchi'), 65); // ≈ 107 km
    // Symétrie : même prix dans les deux sens.
    assert.equal(
      privateUsdForRoute('Kiwengwa', 'Jambiani'),
      privateUsdForRoute('Jambiani', 'Kiwengwa')
    );
  });

  it('Michamvi depuis le nord : 65 USD, la route contourne la baie', () => {
    // Les paliers se calculent à vol d'oiseau (64 km → 40 USD). La route,
    // elle, fait tout le tour de la baie de Chwaka : le prix de terrain
    // prime, dans les deux sens et depuis Kendwa comme depuis Nungwi.
    for (const nord of ['Nungwi', 'Kendwa']) {
      assert.equal(privateUsdForRoute(nord, 'Michamvi'), 65, `${nord} → Michamvi`);
      assert.equal(privateUsdForRoute('Michamvi', nord), 65, `Michamvi → ${nord}`);
    }
    const traversee = priceTrip('private', 'tourist', { pickup: 'Nungwi', dropoff: 'Michamvi' });
    assert.equal(traversee.commission, 6.5, 'commission privée 10 %');
    assert.equal(traversee.price - traversee.commission, 58.5, 'gain chauffeur');
    // Depuis Stone Town, Michamvi garde sa grille de zone : 50 USD.
    assert.equal(privateUsdForRoute('Stone Town', 'Michamvi'), 50);
  });

  it('ville inconnue : retombe sur la grille par zone (jamais d\'erreur)', () => {
    assert.equal(privateUsdForRoute('Hôtel Mystère', 'Nungwi'), 45);
    assert.equal(privateUsdForRoute('Quelque part', 'Ailleurs'), 50);
  });

  it('priceTrip applique les paliers (touriste USD, local en TZS ×2600)', () => {
    const touriste = priceTrip('private', 'tourist', { pickup: 'Matemwe', dropoff: 'Paje' });
    assert.equal(touriste.price, 40);
    assert.equal(touriste.currency, 'USD');
    const local = priceTrip('private', 'local', { pickup: 'Matemwe', dropoff: 'Paje' });
    assert.equal(local.price, 40 * 2600);
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

  it('bout en bout : une course privée Matemwe → Paje est créée à 40 USD', async () => {
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
    assert.equal(Number(creation.body.price), 40);
    assert.equal(creation.body.currency, 'USD');
    // Commission privé 10 %.
    assert.equal(Number(creation.body.commission), 4);
  });
});
