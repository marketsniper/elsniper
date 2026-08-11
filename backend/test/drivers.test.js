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
  createTourist,
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

  it('candidature rejetée → pas de QR véhicule ; réintégration → 200 avec QR généré', async () => {
    const { driver } = await createDriverApplication();
    const rejected = await request(app)
      .patch(`/api/drivers/${driver.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'rejected' });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.verification_status, 'rejected');
    assert.equal(rejected.body.vehicle_qr_code, null);

    const doubleRejet = await request(app)
      .patch(`/api/drivers/${driver.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'rejected' });
    assert.equal(doubleRejet.status, 409);
    assert.equal(doubleRejet.body.error.code, 'invalid_status');

    // Un chauffeur refusé/radié peut être réintégré par l'équipe.
    const retry = await request(app)
      .patch(`/api/drivers/${driver.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'verified' });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.verification_status, 'verified');
    assert.match(retry.body.vehicle_qr_code, /^VEH-/);
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

describe('Chauffeur — compteur de gains', () => {
  it('courses terminées et colis livrés comptés avec gains nets ; autre chauffeur → 403', async () => {
    const { token, user } = await createTourist();
    const { token: driverToken, driver } = await createVerifiedDriver();

    // Course complète : création → assignation → paiement → départ → arrivée.
    const trip = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: user.id,
        tripType: 'private',
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Kendwa',
      });
    assert.equal(trip.status, 201);
    await request(app)
      .patch(`/api/trips/${trip.body.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: driver.id });
    const paiement = await request(app)
      .post(`/api/trips/${trip.body.id}/payment`)
      .set(authHeaders(token));
    await request(app)
      .post(`/api/payments/${paiement.body.id}/confirm`)
      .set(authHeaders(token));
    const qr = (await request(app).get(`/api/drivers/${driver.id}`).set(adminHeaders())).body
      .vehicle_qr_code;
    await request(app)
      .patch(`/api/trips/${trip.body.id}/start`)
      .set(authHeaders(driverToken))
      .send({ qrCode: qr });
    const fin = await request(app)
      .patch(`/api/trips/${trip.body.id}/complete`)
      .set(authHeaders(driverToken))
      .send({ qrCode: qr });
    assert.equal(fin.status, 200);

    const stats = await request(app)
      .get(`/api/drivers/${driver.id}/stats`)
      .set(authHeaders(driverToken));
    assert.equal(stats.status, 200);
    assert.equal(stats.body.today.courses, 1);
    // Kendwa (Nord) privé 50 USD, commission 10 % → net 45 USD.
    assert.equal(stats.body.today.gains.USD, 45);
    assert.equal(stats.body.week.courses, 1);
    assert.equal(stats.body.month.courses, 1);
    assert.equal(stats.body.today.colis, 0);

    const { token: autreToken } = await createVerifiedDriver({ fullName: 'Autre Chauffeur' });
    const interdit = await request(app)
      .get(`/api/drivers/${driver.id}/stats`)
      .set(authHeaders(autreToken));
    assert.equal(interdit.status, 403);
  });
});

describe('Équipe — liste des taxis et radiation', () => {
  it('la recherche équipe expose la dernière position GPS du chauffeur', async () => {
    const { token, driver } = await createVerifiedDriver();

    const avant = await request(app).get('/api/drivers').set(adminHeaders());
    assert.equal(avant.status, 200);
    assert.equal(avant.body[0].last_lat, null);

    await request(app)
      .patch(`/api/drivers/${driver.id}/location`)
      .set(authHeaders(token))
      .send({ lat: -5.72, lng: 39.29 });

    const apres = await request(app).get('/api/drivers').set(adminHeaders());
    const ligne = apres.body.find((d) => d.id === driver.id);
    assert.equal(ligne.last_lat, -5.72);
    assert.equal(ligne.last_lng, 39.29);
    assert.ok(ligne.position_updated_at);
  });

  it('radiation d\'un chauffeur vérifié → retiré de la recherche, annonces ouvertes fermées', async () => {
    const { token, driver } = await createVerifiedDriver();

    const demain = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const annonce = await request(app)
      .post('/api/rides')
      .set(authHeaders(token))
      .send({
        origin: 'Aéroport (AAKIA)',
        destination: 'Nungwi',
        departureAt: demain,
        seatsTotal: 4,
      });
    assert.equal(annonce.status, 201);

    const radiation = await request(app)
      .patch(`/api/drivers/${driver.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'rejected' });
    assert.equal(radiation.status, 200);
    assert.equal(radiation.body.verification_status, 'rejected');
    // Le QR véhicule fixe n'est pas effacé (réintégration possible).
    assert.match(radiation.body.vehicle_qr_code, /^VEH-/);

    const recherche = await request(app).get('/api/drivers').set(adminHeaders());
    assert.ok(!recherche.body.some((d) => d.id === driver.id), 'chauffeur radié exclu');

    const { rows } = await pool.query('SELECT status FROM posted_rides WHERE id = $1', [
      annonce.body.id,
    ]);
    assert.equal(rows[0].status, 'closed');
  });
});

describe('Chauffeur — liste de ses courses assignées', () => {
  it('GET /:id/trips : les courses assignées apparaissent ; autre chauffeur → 403', async () => {
    const { token, user } = await createTourist();
    const { token: driverToken, driver } = await createVerifiedDriver();

    const vide = await request(app)
      .get(`/api/drivers/${driver.id}/trips`)
      .set(authHeaders(driverToken));
    assert.equal(vide.status, 200);
    assert.deepEqual(vide.body, []);

    const trip = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: user.id,
        tripType: 'private',
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Paje',
      });
    assert.equal(trip.status, 201);
    await request(app)
      .patch(`/api/trips/${trip.body.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: driver.id });

    const liste = await request(app)
      .get(`/api/drivers/${driver.id}/trips`)
      .set(authHeaders(driverToken));
    assert.equal(liste.status, 200);
    assert.equal(liste.body.length, 1);
    assert.equal(liste.body[0].id, trip.body.id);
    assert.equal(liste.body[0].status, 'driver_confirmed');

    const { token: autreToken } = await createVerifiedDriver({ fullName: 'Autre Chauffeur' });
    const interdit = await request(app)
      .get(`/api/drivers/${driver.id}/trips`)
      .set(authHeaders(autreToken));
    assert.equal(interdit.status, 403);

    const equipe = await request(app)
      .get(`/api/drivers/${driver.id}/trips`)
      .set(adminHeaders());
    assert.equal(equipe.status, 200);
    assert.equal(equipe.body.length, 1);
  });
});
