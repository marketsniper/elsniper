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
    assert.equal(privateUsdForRoute('Stone Town', 'Nungwi'), 47);
    assert.equal(privateUsdForRoute('Stone Town', 'Kendwa'), 47);
    assert.equal(privateUsdForRoute('Stone Town Ferry', 'Matemwe'), 42);
    assert.equal(privateUsdForRoute('Aéroport (AAKIA)', 'Paje'), 47);
    assert.equal(privateUsdForRoute('Stone Town', 'Bwejuu'), 47);
    assert.equal(privateUsdForRoute('Stone Town', 'Jambiani'), 53);
    assert.equal(privateUsdForRoute('Stone Town', 'Michamvi'), 53);
    assert.equal(privateUsdForRoute('Stone Town', 'Kizimkazi'), 47);
    assert.equal(privateUsdForRoute('Stone Town', 'Makunduchi'), 47);
    // Trajets spéciaux : prioritaires sur la formule (et sur le minimum de
    // 20 USD pour les sauts de village de la côte est à 12 USD).
    // Les traversées ne sont plus codées en dur : les paliers de distance
    // les produisent, et dans les deux sens.
    assert.equal(privateUsdForRoute('Nungwi', 'Paje'), 63);
    assert.equal(privateUsdForRoute('Paje', 'Nungwi'), 63);
    assert.equal(privateUsdForRoute('Nungwi', 'Kizimkazi'), 68);
    assert.equal(privateUsdForRoute('Kizimkazi', 'Nungwi'), 68);
  });

  it('les baies sans pont se paient par la route, pas à vol d’oiseau', () => {
    // Michamvi fait face à la côte nord-est par-dessus la baie de Chwaka
    // (10 km à vol d'oiseau, 45 à 78 km de route) ; Fumba fait face à
    // Kizimkazi par-dessus la baie de Menai. La formule au kilomètre
    // vendait ces traversées à perte (Michamvi ↔ Uroa : 13 USD pour
    // ~55 km) — les prix spéciaux suivent les kilomètres réels.
    const traversees = [
      ['Michamvi', 'Chwaka', 34],
      ['Michamvi', 'Uroa', 42],
      ['Michamvi', 'Pongwe', 47],
      ['Michamvi', 'Kiwengwa', 47],
      ['Michamvi', 'Pwani Mchangani', 50],
      ['Michamvi', 'Matemwe', 63],
      ['Fumba', 'Kizimkazi', 34],
      // Le couloir sud-est ↔ nord-est, par Tunguu.
      ['Paje', 'Chwaka', 34],
      ['Paje', 'Uroa', 42],
      ['Paje', 'Pongwe', 47],
      ['Bwejuu', 'Chwaka', 34],
      ['Bwejuu', 'Uroa', 47],
      ['Bwejuu', 'Pongwe', 47],
      ['Jambiani', 'Chwaka', 34],
      ['Jambiani', 'Uroa', 47],
      ['Jambiani', 'Pongwe', 47],
      ['Makunduchi', 'Chwaka', 47],
      ['Makunduchi', 'Uroa', 50],
      ['Makunduchi', 'Pongwe', 50],
    ];
    for (const [a, b, usd] of traversees) {
      assert.equal(privateUsdForRoute(a, b), usd, `${a} → ${b}`);
      assert.equal(privateUsdForRoute(b, a), usd, `${b} → ${a}`);
    }
  });

  it('la chaîne de la côte est : d’un village au suivant, 13 USD', () => {
    // Michamvi → Bwejuu → Paje → Jambiani → Makunduchi : chaque maillon
    // vaut 13 USD, dans les deux sens.
    const maillons = [
      ['Michamvi', 'Bwejuu'],
      ['Bwejuu', 'Paje'],
      ['Paje', 'Jambiani'],
      ['Jambiani', 'Makunduchi'],
    ];
    for (const [a, b] of maillons) {
      assert.equal(privateUsdForRoute(a, b), 13, `${a} → ${b}`);
      assert.equal(privateUsdForRoute(b, a), 13, `${b} → ${a}`);
    }
  });

  it('un village d’écart : 17 USD, sur les trois paires concernées', () => {
    const ecarts = [
      ['Michamvi', 'Paje'], // par-dessus Bwejuu
      ['Bwejuu', 'Jambiani'], // par-dessus Paje
      ['Paje', 'Makunduchi'], // par-dessus Jambiani
    ];
    for (const [a, b] of ecarts) {
      assert.equal(privateUsdForRoute(a, b), 17, `${a} → ${b}`);
      assert.equal(privateUsdForRoute(b, a), 17, `${b} → ${a}`);
      const saut = priceTrip('private', 'tourist', { pickup: a, dropoff: b });
      assert.equal(saut.commission, 2.89, `${a} → ${b} : commission 17 % (< 40 USD)`);
      assert.equal(saut.price - saut.commission, 14.11, `${a} → ${b} : gain chauffeur`);
    }
    // Au-delà de deux villages, les paliers de distance reprennent. Michamvi
    // → Jambiani longe la côte par Bwejuu et Paje : 28 km, soit le palier des
    // 30 km. (Cette valeur était de 26 USD tant que Michamvi était mal placé
    // sur la carte — voir coordonnees-villes.test.js.)
    assert.equal(privateUsdForRoute('Michamvi', 'Jambiani'), 22); // ≈ 28 km
  });

  it('sauts de village : 13 USD à 17 % (< 40 USD) — le chauffeur garde 10,79', () => {
    const saut = priceTrip('private', 'tourist', { pickup: 'Paje', dropoff: 'Jambiani' });
    assert.equal(saut.price, 13);
    assert.equal(saut.commission, 2.21);
    assert.equal(saut.price - saut.commission, 10.79, 'le gain chauffeur');
    // Local sur le même trajet : prix ET commission convertis (×2600, 15 %).
    const local = priceTrip('private', 'local', { pickup: 'Paje', dropoff: 'Jambiani' });
    assert.equal(local.price, 13 * 2600);
    assert.equal(local.commission, 13 * 2600 * 0.17);
    // Un transfert plus long bascule à 12 % dès 40 USD (Matemwe → Paje, 65 km,
    // 48 USD depuis le rééquilibrage des paliers → commission 4,80).
    const normal = priceTrip('private', 'tourist', { pickup: 'Matemwe', dropoff: 'Paje' });
    assert.equal(normal.commission, 6);
  });

  it('paliers de distance : du village voisin à la traversée du nord au sud', () => {
    // La même logique que la côte est, prolongée à toute l'île.
    assert.equal(privateUsdForRoute('Nungwi', 'Kendwa'), 13); // ≈ 5 km, voisins
    assert.equal(privateUsdForRoute('Nungwi', 'Matemwe'), 17); // ≈ 23 km
    assert.equal(privateUsdForRoute('Kiwengwa', 'Chwaka'), 22); // ≈ 27 km
    assert.equal(privateUsdForRoute('Nungwi', 'Kiwengwa'), 34); // ≈ 41 km
    assert.equal(privateUsdForRoute('Nungwi', 'Chwaka'), 50); // ≈ 68 km
    assert.equal(privateUsdForRoute('Matemwe', 'Paje'), 50); // ≈ 65 km
    assert.equal(privateUsdForRoute('Nungwi', 'Paje'), 63); // ≈ 88 km, côte à côte
    assert.equal(privateUsdForRoute('Kendwa', 'Kizimkazi'), 68); // ≈ 102 km, nord → sud
    assert.equal(privateUsdForRoute('Nungwi', 'Makunduchi'), 68); // ≈ 107 km
    // Symétrie : même prix dans les deux sens.
    assert.equal(
      privateUsdForRoute('Kiwengwa', 'Jambiani'),
      privateUsdForRoute('Jambiani', 'Kiwengwa')
    );
  });

  it('Kizimkazi ↔ Jambiani : 18 USD, la route passe par l’intérieur', () => {
    // 35 km à vol d'oiseau (palier 26 USD), mais Kizimkazi est sur l'autre
    // versant : on ne longe pas la côte, on redescend par l'intérieur.
    assert.equal(privateUsdForRoute('Kizimkazi', 'Jambiani'), 18);
    assert.equal(privateUsdForRoute('Jambiani', 'Kizimkazi'), 18);
    const t = priceTrip('private', 'tourist', { pickup: 'Kizimkazi', dropoff: 'Jambiani' });
    assert.equal(t.commission, 3.06, 'commission privée 15 % (< 40 USD)');
    assert.equal(t.price - t.commission, 14.94, 'gain chauffeur');
  });

  it('Michamvi depuis le nord : 68 USD, la route contourne la baie', () => {
    // Les paliers se calculent à vol d'oiseau (64 km → 42 USD). La route,
    // elle, fait tout le tour de la baie de Chwaka : le prix de terrain
    // prime, dans les deux sens et depuis Kendwa comme depuis Nungwi.
    for (const nord of ['Nungwi', 'Kendwa']) {
      assert.equal(privateUsdForRoute(nord, 'Michamvi'), 68, `${nord} → Michamvi`);
      assert.equal(privateUsdForRoute('Michamvi', nord), 68, `Michamvi → ${nord}`);
    }
    const traversee = priceTrip('private', 'tourist', { pickup: 'Nungwi', dropoff: 'Michamvi' });
    assert.equal(traversee.commission, 8.16, 'commission privée 10 % (≥ 40 USD)');
    assert.equal(traversee.price - traversee.commission, 59.84, 'gain chauffeur');
    // Depuis Stone Town, Michamvi garde sa grille de zone : 53 USD.
    assert.equal(privateUsdForRoute('Stone Town', 'Michamvi'), 53);
  });

  it('ville inconnue : retombe sur la grille par zone (jamais d\'erreur)', () => {
    assert.equal(privateUsdForRoute('Hôtel Mystère', 'Nungwi'), 47);
    assert.equal(privateUsdForRoute('Quelque part', 'Ailleurs'), 53);
  });

  it('priceTrip applique les paliers (touriste USD, local en TZS ×2600)', () => {
    const touriste = priceTrip('private', 'tourist', { pickup: 'Matemwe', dropoff: 'Paje' });
    assert.equal(touriste.price, 50); // 65 km — palier 65-75
    assert.equal(touriste.currency, 'USD');
    const local = priceTrip('private', 'local', { pickup: 'Matemwe', dropoff: 'Paje' });
    assert.equal(local.price, 50 * 2600);
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
    assert.equal(Number(prive.body.price), 13);
  });

  it('bout en bout : une course privée Matemwe → Paje est créée à 50 USD', async () => {
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
    assert.equal(Number(creation.body.price), 50);
    assert.equal(creation.body.currency, 'USD');
    // Commission privée 10 % (au-dessus du seuil de 40 USD).
    assert.equal(Number(creation.body.commission), 6);
  });
});
