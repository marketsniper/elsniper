// Tests chauffeurs : candidature, validation par l'équipe (QR véhicule fixe
// généré une seule fois), recherche équipe, ownership.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { pool } from '../src/db.js';
import {
  DOC_URL,
  adminHeaders,
  app,
  authHeaders,
  authenticate,
  createDriverApplication,
  createVerifiedDriver,
  nextPhone,
  nextPlate,
  useTestDb,
} from './setup.js';

useTestDb();

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('Chauffeurs (drivers)', () => {
  it('candidature → 201 pending, sans QR véhicule, disponible par défaut', async () => {
    const { driver } = await createDriverApplication();
    assert.equal(driver.verification_status, 'pending');
    assert.equal(driver.vehicle_qr_code, null);
    assert.equal(driver.available, true);
    assert.equal(driver.rating_count, 0);
  });

  it('candidature avec un autre téléphone que le jeton → 403 phone_mismatch', async () => {
    const { token } = await authenticate(nextPhone());
    const res = await request(app)
      .post('/api/drivers')
      .set(authHeaders(token))
      .send({
        fullName: 'Imposteur Driver',
        phone: nextPhone(),
        licenseNumber: 'LIC-X',
        vehiclePlate: nextPlate(),
        zone: 'Stone Town',
        licenseDocumentUrl: DOC_URL,
        insuranceDocumentUrl: DOC_URL,
        vehiclePhotoUrl: DOC_URL,
      });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'phone_mismatch');
  });

  it('plaque déjà enregistrée → 409 duplicate', async () => {
    const plate = nextPlate();
    await createDriverApplication({ vehiclePlate: plate });

    const phone = nextPhone();
    const { token } = await authenticate(phone);
    const res = await request(app)
      .post('/api/drivers')
      .set(authHeaders(token))
      .send({
        fullName: 'Plaque Doublon',
        phone,
        licenseNumber: 'LIC-DUP',
        vehiclePlate: plate,
        zone: 'Stone Town',
        licenseDocumentUrl: DOC_URL,
        insuranceDocumentUrl: DOC_URL,
        vehiclePhotoUrl: DOC_URL,
      });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'duplicate');
  });

  it('validation → QR véhicule VEH-... généré', async () => {
    const { driver } = await createDriverApplication();
    const res = await request(app)
      .patch(`/api/drivers/${driver.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'verified' });
    assert.equal(res.status, 200);
    assert.equal(res.body.verification_status, 'verified');
    assert.match(res.body.vehicle_qr_code, /^VEH-/);
  });

  it('double validation → 409 invalid_status, QR véhicule inchangé en base', async () => {
    const { driver } = await createVerifiedDriver();
    const originalQr = driver.vehicle_qr_code;

    const again = await request(app)
      .patch(`/api/drivers/${driver.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'verified' });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'invalid_status');

    // Le QR fixe n'a pas bougé (jamais régénéré)
    const { rows } = await pool.query('SELECT vehicle_qr_code FROM drivers WHERE id = $1', [
      driver.id,
    ]);
    assert.equal(rows[0].vehicle_qr_code, originalQr);
  });

  it('candidature rejetée → pas de QR véhicule, re-traitement → 409', async () => {
    const { driver } = await createDriverApplication();
    const rejected = await request(app)
      .patch(`/api/drivers/${driver.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'rejected' });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.verification_status, 'rejected');
    assert.equal(rejected.body.vehicle_qr_code, null);

    const retry = await request(app)
      .patch(`/api/drivers/${driver.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'verified' });
    assert.equal(retry.status, 409);
    assert.equal(retry.body.error.code, 'invalid_status');
  });

  it('verify sur chauffeur inconnu (équipe) → 404 not_found', async () => {
    const res = await request(app)
      .patch(`/api/drivers/${UNKNOWN_ID}/verify`)
      .set(adminHeaders())
      .send({ status: 'verified' });
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'not_found');
  });

  it('recherche équipe : seuls les chauffeurs vérifiés, filtres zone/available', async () => {
    const { driver: verified } = await createVerifiedDriver({ zone: 'Stone Town' });
    const { driver: pending } = await createDriverApplication({ zone: 'Stone Town' });
    const { driver: nungwi } = await createVerifiedDriver({ zone: 'Nungwi' });

    const all = await request(app).get('/api/drivers').set(adminHeaders());
    assert.equal(all.status, 200);
    const ids = all.body.map((d) => d.id);
    assert.ok(ids.includes(verified.id));
    assert.ok(ids.includes(nungwi.id));
    assert.ok(!ids.includes(pending.id), 'chauffeur pending exclu de la recherche');

    const byZone = await request(app)
      .get('/api/drivers')
      .query({ zone: 'Stone Town', available: 'true' })
      .set(adminHeaders());
    assert.equal(byZone.status, 200);
    assert.deepEqual(byZone.body.map((d) => d.id), [verified.id]);

    // Chauffeur passé indisponible (pas de route dédiée : via SQL)
    await pool.query('UPDATE drivers SET available = false WHERE id = $1', [verified.id]);
    const unavailable = await request(app)
      .get('/api/drivers')
      .query({ zone: 'Stone Town', available: 'true' })
      .set(adminHeaders());
    assert.equal(unavailable.body.length, 0);
  });

  it('recherche sans clé équipe → 401 admin_required', async () => {
    const { token } = await createVerifiedDriver();
    const res = await request(app).get('/api/drivers').set(authHeaders(token));
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'admin_required');
  });

  it('GET /:id : le chauffeur lui-même → 200, un autre chauffeur → 403, équipe → 200', async () => {
    const { token, driver } = await createVerifiedDriver();
    const { token: otherToken } = await createVerifiedDriver({ fullName: 'Autre Chauffeur' });

    const own = await request(app).get(`/api/drivers/${driver.id}`).set(authHeaders(token));
    assert.equal(own.status, 200);
    assert.equal(own.body.id, driver.id);

    const other = await request(app).get(`/api/drivers/${driver.id}`).set(authHeaders(otherToken));
    assert.equal(other.status, 403);
    assert.equal(other.body.error.code, 'forbidden');

    const admin = await request(app).get(`/api/drivers/${driver.id}`).set(adminHeaders());
    assert.equal(admin.status, 200);
  });

  it('GET /:id inconnu (équipe) → 404 not_found', async () => {
    const res = await request(app).get(`/api/drivers/${UNKNOWN_ID}`).set(adminHeaders());
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'not_found');
  });
});
