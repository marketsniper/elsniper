// LA BOURSE SONNE TOUTE SEULE — la diffusion automatique des courses privées.
//
// La règle : dès qu'une course privée est publiée (ou rendue), chaque
// chauffeur vérifié et DISPONIBLE est prévenu sur son téléphone. Ceux dont
// la position fraîche est à moins de ~3 km du client sont marqués
// « proches » (distance calculée) ; les autres reçoivent l'annonce simple.
// Personne d'autre : ni les non-vérifiés, ni les indisponibles, ni celui
// qui vient de rendre la course.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, authHeaders, createTourist, createVerifiedDriver, useTestDb } from './setup.js';
import { query } from '../src/db.js';
import { diffuserCourseAuxChauffeurs } from '../src/services/alertesChauffeur.js';

useTestDb();

// Stone Town, et deux chauffeurs : un à ~500 m, un à Nungwi (~50 km).
const STONE_TOWN = { lat: -6.1659, lng: 39.1988 };
const TOUT_PRES = { lat: -6.17, lng: 39.2 };
const NUNGWI = { lat: -5.7245, lng: 39.2969 };

async function poserPosition(driverId, { lat, lng }) {
  await query(
    `INSERT INTO driver_positions (driver_id, lat, lng, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (driver_id) DO UPDATE SET lat = $2, lng = $3, updated_at = now()`,
    [driverId, lat, lng]
  );
}

describe('Diffusion automatique des courses aux chauffeurs', () => {
  it('prévient les disponibles, mesure la distance, écarte les autres', async () => {
    const { driver: proche } = await createVerifiedDriver();
    const { driver: lointain } = await createVerifiedDriver();
    const { driver: indisponible } = await createVerifiedDriver();
    await poserPosition(proche.id, TOUT_PRES);
    await poserPosition(lointain.id, NUNGWI);
    await query('UPDATE drivers SET available = false WHERE id = $1', [indisponible.id]);

    const { token, user } = await createTourist();
    const course = await request(app).post('/api/trips').set(authHeaders(token)).send({
      userId: user.id,
      tripType: 'private',
      pickupLocation: 'Stone Town',
      dropoffLocation: 'Paje',
    });
    assert.equal(course.status, 201, JSON.stringify(course.body));
    // Le client partage sa position exacte (colonne posée par l'app).
    await query('UPDATE trips SET pickup_lat = $1, pickup_lng = $2 WHERE id = $3', [
      STONE_TOWN.lat,
      STONE_TOWN.lng,
      course.body.id,
    ]);
    const { rows } = await query('SELECT * FROM trips WHERE id = $1', [course.body.id]);

    const prevenus = await diffuserCourseAuxChauffeurs(rows[0]);
    const parId = new Map(prevenus.map((p) => [p.id, p]));

    assert.ok(parId.has(proche.id), 'le chauffeur proche est prévenu');
    assert.ok(
      Number(parId.get(proche.id).distance_km) < 3,
      `à ~0,5 km, il est « près de vous » (distance: ${parId.get(proche.id).distance_km})`
    );
    assert.ok(parId.has(lointain.id), 'le chauffeur lointain est prévenu aussi (annonce simple)');
    assert.ok(
      Number(parId.get(lointain.id).distance_km) > 3,
      'mais sa distance le classe hors du cercle « près de vous »'
    );
    assert.ok(!parId.has(indisponible.id), "l'indisponible n'est pas dérangé");
  });

  it("sans position client : tout le monde est prévenu, sans distance — et l'exclu reste exclu", async () => {
    const { driver } = await createVerifiedDriver();
    const { driver: exclu } = await createVerifiedDriver();

    const { token, user } = await createTourist();
    const course = await request(app).post('/api/trips').set(authHeaders(token)).send({
      userId: user.id,
      tripType: 'private',
      pickupLocation: 'Kendwa',
      dropoffLocation: 'Paje',
    });
    const { rows } = await query('SELECT * FROM trips WHERE id = $1', [course.body.id]);

    const prevenus = await diffuserCourseAuxChauffeurs(rows[0], { sauf: exclu.id });
    const ids = prevenus.map((p) => p.id);
    assert.ok(ids.includes(driver.id), 'chauffeur disponible prévenu');
    assert.ok(!ids.includes(exclu.id), 'celui qui rend la course ne sonne pas');
    assert.equal(
      prevenus.find((p) => p.id === driver.id).distance_km,
      null,
      'pas de position client : pas de distance'
    );

    // Une course partagée ou locale ne passe pas par la bourse privée.
    assert.deepEqual(await diffuserCourseAuxChauffeurs({ ...rows[0], trip_type: 'local' }), []);
  });
});
