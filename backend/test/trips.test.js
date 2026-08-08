// Tests des courses taxi : flux complet, grille tarifaire figée, règle du
// tarif local (résident vérifié), machine à états, scans QR, ownership, notes.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { pool } from '../src/db.js';
import {
  adminHeaders,
  app,
  authHeaders,
  createLocal,
  createResident,
  createTourist,
  createDriverApplication,
  createVerifiedDriver,
  useTestDb,
} from './setup.js';

useTestDb();

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

// Crée une course (private par défaut) pour un client donné
async function createTrip(token, userId, overrides = {}) {
  const res = await request(app)
    .post('/api/trips')
    .set(authHeaders(token))
    .send({
      userId,
      tripType: 'private',
      pickupLocation: 'Aéroport AAKIA',
      dropoffLocation: 'Nungwi Beach',
      ...overrides,
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

// L'équipe confirme un chauffeur sur la course
async function assignDriver(tripId, driverId) {
  const res = await request(app)
    .patch(`/api/trips/${tripId}/assign-driver`)
    .set(adminHeaders())
    .send({ driverId });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

// Paiement créé par le client puis confirmé (stub Pesapal) → course 'paid'
async function payTrip(userToken, tripId) {
  const payment = await request(app)
    .post(`/api/trips/${tripId}/payment`)
    .set(authHeaders(userToken));
  assert.equal(payment.status, 201, JSON.stringify(payment.body));
  const confirm = await request(app)
    .post(`/api/payments/${payment.body.id}/confirm`)
    .set(authHeaders(userToken));
  assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
  return payment.body;
}

describe('Courses taxi (trips)', () => {
  it('flux complet : création → assignation → paiement → start → complete', async () => {
    const { token: userToken, user } = await createTourist();
    const { token: driverToken, driver } = await createVerifiedDriver();

    // Création : prix USD figé côté serveur (private → 50 USD, commission 10 %)
    const trip = await createTrip(userToken, user.id);
    assert.equal(trip.status, 'requested');
    assert.equal(trip.currency, 'USD');
    assert.equal(Number(trip.price), 50);
    assert.equal(Number(trip.commission), 5); // 10 % — le chauffeur reçoit 45 USD
    assert.match(trip.whatsapp_link, /wa\.me/);
    assert.equal(trip.driver_id, null);

    // Confirmation du chauffeur par l'équipe
    const assigned = await assignDriver(trip.id, driver.id);
    assert.equal(assigned.status, 'driver_confirmed');
    assert.equal(assigned.driver_id, driver.id);

    // Paiement (stub Pesapal) → course payée
    const payment = await payTrip(userToken, trip.id);
    assert.equal(payment.trip_id, trip.id);
    assert.equal(Number(payment.amount), 50);
    const paid = await request(app).get(`/api/trips/${trip.id}`).set(authHeaders(userToken));
    assert.equal(paid.body.status, 'paid');

    // Scan départ (QR du véhicule assigné) → in_progress
    const started = await request(app)
      .patch(`/api/trips/${trip.id}/start`)
      .set(authHeaders(driverToken))
      .send({ qrCode: driver.vehicle_qr_code });
    assert.equal(started.status, 200);
    assert.equal(started.body.status, 'in_progress');
    assert.ok(started.body.started_at);

    // Scan arrivée → completed + stats mensuelles du chauffeur incrémentées
    const completed = await request(app)
      .patch(`/api/trips/${trip.id}/complete`)
      .set(authHeaders(driverToken))
      .send({ qrCode: driver.vehicle_qr_code });
    assert.equal(completed.status, 200);
    assert.equal(completed.body.status, 'completed');
    assert.ok(completed.body.completed_at);

    const { rows } = await pool.query(
      'SELECT trips_completed FROM driver_monthly_stats WHERE driver_id = $1',
      [driver.id]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].trips_completed, 1);
  });

  it('grille tarifaire figée par type et devise', async () => {
    const { token: touristToken, user: tourist } = await createTourist();
    const { token: residentToken, user: resident } = await createResident();

    const shared = await createTrip(touristToken, tourist.id, { tripType: 'shared_tourist' });
    assert.equal(Number(shared.price), 18);
    assert.equal(shared.currency, 'USD');

    const posted = await createTrip(touristToken, tourist.id, { tripType: 'posted_return' });
    assert.equal(Number(posted.price), 18);

    // Trajet spécial Nungwi ↔ Paje : 65 USD en privé (58,50 pour un résident).
    const special = await createTrip(touristToken, tourist.id, {
      pickupLocation: 'Nungwi',
      dropoffLocation: 'Paje',
    });
    assert.equal(Number(special.price), 65);
    const specialResident = await createTrip(residentToken, resident.id, {
      pickupLocation: 'Paje',
      dropoffLocation: 'Nungwi',
    });
    assert.equal(Number(specialResident.price), 58.5);

    // Résident vérifié : remise de 10 % sur le tarif touriste, en USD.
    const privateResident = await createTrip(residentToken, resident.id);
    assert.equal(Number(privateResident.price), 45);
    assert.equal(privateResident.currency, 'USD');

    // Résident NON vérifié : plein tarif touriste tant que les documents
    // de résidence ne sont pas validés.
    const { token: pendingToken, user: pending } = await createResident({ verify: false });
    const privatePending = await createTrip(pendingToken, pending.id);
    assert.equal(Number(privatePending.price), 50);

    // Local vérifié (carte tanzanienne) : tarif unique 15 000 TZS partout.
    const { token: localToken, user: local } = await createLocal();
    const privateLocal = await createTrip(localToken, local.id);
    assert.equal(Number(privateLocal.price), 15000);
    assert.equal(privateLocal.currency, 'TZS');
    const sharedLocalFlat = await createTrip(localToken, local.id, { tripType: 'shared_tourist' });
    assert.equal(Number(sharedLocalFlat.price), 15000);
  });

  it('scheduledAt (ISO avec offset) accepté et stocké', async () => {
    const { token, user } = await createTourist();
    const trip = await createTrip(token, user.id, { scheduledAt: '2026-09-01T10:00:00+03:00' });
    assert.ok(trip.scheduled_at);
  });

  it('shared_local par un touriste ou un résident → 403 local_only', async () => {
    const { token, user } = await createTourist();
    const res = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({ userId: user.id, tripType: 'shared_local', pickupLocation: 'Stone Town', dropoffLocation: 'Bububu' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'local_only');

    const { token: resToken, user: resident } = await createResident();
    const asResident = await request(app)
      .post('/api/trips')
      .set(authHeaders(resToken))
      .send({ userId: resident.id, tripType: 'shared_local', pickupLocation: 'Stone Town', dropoffLocation: 'Bububu' });
    assert.equal(asResident.status, 403);
    assert.equal(asResident.body.error.code, 'local_only');
  });

  it('local non vérifié → 403 local_not_verified (toute réservation)', async () => {
    const { token, user } = await createLocal({ verify: false });
    const res = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({ userId: user.id, tripType: 'private', pickupLocation: 'Stone Town', dropoffLocation: 'Bububu' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'local_not_verified');
  });

  it('shared_local par un local vérifié → 201, tarif unique 15 000 TZS figé', async () => {
    const { token, user } = await createLocal();
    const trip = await createTrip(token, user.id, { tripType: 'shared_local' });
    assert.equal(trip.currency, 'TZS');
    assert.equal(Number(trip.price), 15000);
  });

  it('création pour un autre userId que le jeton → 403 forbidden', async () => {
    const { user } = await createTourist();
    const { token: otherToken } = await createTourist({ fullName: 'Autre Cliente' });
    const res = await request(app)
      .post('/api/trips')
      .set(authHeaders(otherToken))
      .send({ userId: user.id, tripType: 'private', pickupLocation: 'A2', dropoffLocation: 'B2' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'forbidden');
  });

  it('corps invalide → 400 validation_error ; user inconnu (équipe) → 404', async () => {
    const { token, user } = await createTourist();
    const invalid = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({ userId: user.id, tripType: 'private', pickupLocation: 'A2' });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, 'validation_error');

    const unknown = await request(app)
      .post('/api/trips')
      .set(adminHeaders())
      .send({ userId: UNKNOWN_ID, tripType: 'private', pickupLocation: 'A2', dropoffLocation: 'B2' });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error.code, 'not_found');
  });

  it('assignation sans clé équipe → 401 admin_required', async () => {
    const { token, user } = await createTourist();
    const { driver } = await createVerifiedDriver();
    const trip = await createTrip(token, user.id);
    const res = await request(app)
      .patch(`/api/trips/${trip.id}/assign-driver`)
      .set(authHeaders(token))
      .send({ driverId: driver.id });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'admin_required');
  });

  it('assignation d\'un chauffeur non validé → 409 driver_not_verified', async () => {
    const { token, user } = await createTourist();
    const { driver } = await createDriverApplication();
    const trip = await createTrip(token, user.id);
    const res = await request(app)
      .patch(`/api/trips/${trip.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: driver.id });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'driver_not_verified');
  });

  it('assignation d\'un chauffeur indisponible → 409 driver_not_available', async () => {
    const { token, user } = await createTourist();
    const { driver } = await createVerifiedDriver();
    await pool.query('UPDATE drivers SET available = false WHERE id = $1', [driver.id]);
    const trip = await createTrip(token, user.id);
    const res = await request(app)
      .patch(`/api/trips/${trip.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: driver.id });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'driver_not_available');
  });

  it('assignation d\'une course déjà confirmée → 409 invalid_status', async () => {
    const { token, user } = await createTourist();
    const { driver } = await createVerifiedDriver();
    const trip = await createTrip(token, user.id);
    await assignDriver(trip.id, driver.id);
    const again = await request(app)
      .patch(`/api/trips/${trip.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: driver.id });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'invalid_status');
  });

  it('paiement avant confirmation d\'un chauffeur → 409 invalid_status', async () => {
    const { token, user } = await createTourist();
    const trip = await createTrip(token, user.id);
    const res = await request(app).post(`/api/trips/${trip.id}/payment`).set(authHeaders(token));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'invalid_status');
  });

  it('paiement par un autre client → 403 forbidden', async () => {
    const { token, user } = await createTourist();
    const { token: otherToken } = await createTourist({ fullName: 'Autre Cliente' });
    const { driver } = await createVerifiedDriver();
    const trip = await createTrip(token, user.id);
    await assignDriver(trip.id, driver.id);
    const res = await request(app)
      .post(`/api/trips/${trip.id}/payment`)
      .set(authHeaders(otherToken));
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'forbidden');
  });

  it('start avant paiement → 409 ; par le client → 403 ; mauvais QR → 403 qr_mismatch', async () => {
    const { token, user } = await createTourist();
    const { token: driverToken, driver } = await createVerifiedDriver();
    const trip = await createTrip(token, user.id);
    await assignDriver(trip.id, driver.id);

    // Statut driver_confirmed (pas encore payé) → 409
    const beforePaid = await request(app)
      .patch(`/api/trips/${trip.id}/start`)
      .set(authHeaders(driverToken))
      .send({ qrCode: driver.vehicle_qr_code });
    assert.equal(beforePaid.status, 409);
    assert.equal(beforePaid.body.error.code, 'invalid_status');

    await payTrip(token, trip.id);

    // Le client n'est pas le chauffeur assigné → 403
    const byTourist = await request(app)
      .patch(`/api/trips/${trip.id}/start`)
      .set(authHeaders(token))
      .send({ qrCode: driver.vehicle_qr_code });
    assert.equal(byTourist.status, 403);
    assert.equal(byTourist.body.error.code, 'forbidden');

    // QR d'un autre véhicule → 403 qr_mismatch
    const wrongQr = await request(app)
      .patch(`/api/trips/${trip.id}/start`)
      .set(authHeaders(driverToken))
      .send({ qrCode: 'VEH-fake-qr' });
    assert.equal(wrongQr.status, 403);
    assert.equal(wrongQr.body.error.code, 'qr_mismatch');
  });

  it('start par un autre chauffeur que l\'assigné → 403 forbidden', async () => {
    const { token, user } = await createTourist();
    const { driver } = await createVerifiedDriver();
    const { token: otherDriverToken } = await createVerifiedDriver({ fullName: 'Autre Chauffeur' });
    const trip = await createTrip(token, user.id);
    await assignDriver(trip.id, driver.id);
    await payTrip(token, trip.id);

    const res = await request(app)
      .patch(`/api/trips/${trip.id}/start`)
      .set(authHeaders(otherDriverToken))
      .send({ qrCode: driver.vehicle_qr_code });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'forbidden');
  });

  it('complete sur une course non démarrée → 409 invalid_status', async () => {
    const { token, user } = await createTourist();
    const { token: driverToken, driver } = await createVerifiedDriver();
    const trip = await createTrip(token, user.id);
    await assignDriver(trip.id, driver.id);
    await payTrip(token, trip.id);

    const res = await request(app)
      .patch(`/api/trips/${trip.id}/complete`)
      .set(authHeaders(driverToken))
      .send({ qrCode: driver.vehicle_qr_code });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'invalid_status');
  });

  it('notes : 5/5 enregistrée, moyenne chauffeur mise à jour, double note → 409', async () => {
    const { token, user } = await createTourist();
    const { token: driverToken, driver } = await createVerifiedDriver();
    const trip = await createTrip(token, user.id);
    await assignDriver(trip.id, driver.id);
    await payTrip(token, trip.id);
    await request(app)
      .patch(`/api/trips/${trip.id}/start`)
      .set(authHeaders(driverToken))
      .send({ qrCode: driver.vehicle_qr_code });
    await request(app)
      .patch(`/api/trips/${trip.id}/complete`)
      .set(authHeaders(driverToken))
      .send({ qrCode: driver.vehicle_qr_code });

    const rated = await request(app)
      .post(`/api/trips/${trip.id}/rating`)
      .set(authHeaders(token))
      .send({ rating: 5, comment: 'Karibu sana !' });
    assert.equal(rated.status, 200);
    assert.equal(rated.body.rating, 5);
    assert.equal(rated.body.rating_comment, 'Karibu sana !');

    const driverAfter = await request(app)
      .get(`/api/drivers/${driver.id}`)
      .set(authHeaders(driverToken));
    assert.equal(Number(driverAfter.body.rating_avg), 5);
    assert.equal(driverAfter.body.rating_count, 1);

    const again = await request(app)
      .post(`/api/trips/${trip.id}/rating`)
      .set(authHeaders(token))
      .send({ rating: 1 });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'already_rated');

    // La moyenne n'a pas bougé après le doublon
    const unchanged = await request(app)
      .get(`/api/drivers/${driver.id}`)
      .set(authHeaders(driverToken));
    assert.equal(Number(unchanged.body.rating_avg), 5);
    assert.equal(unchanged.body.rating_count, 1);
  });

  it('note sur une course non terminée → 409 ; par un tiers → 403', async () => {
    const { token, user } = await createTourist();
    const { token: otherToken } = await createTourist({ fullName: 'Autre Cliente' });
    const trip = await createTrip(token, user.id);

    const early = await request(app)
      .post(`/api/trips/${trip.id}/rating`)
      .set(authHeaders(token))
      .send({ rating: 4 });
    assert.equal(early.status, 409);
    assert.equal(early.body.error.code, 'invalid_status');

    const foreign = await request(app)
      .post(`/api/trips/${trip.id}/rating`)
      .set(authHeaders(otherToken))
      .send({ rating: 1 });
    assert.equal(foreign.status, 403);
    assert.equal(foreign.body.error.code, 'forbidden');
  });

  it('historique GET /trips?userId : titulaire → 200, tiers → 403, équipe → 200', async () => {
    const { token, user } = await createTourist();
    const { token: otherToken } = await createTourist({ fullName: 'Autre Cliente' });
    const trip = await createTrip(token, user.id);

    const own = await request(app)
      .get('/api/trips')
      .query({ userId: user.id })
      .set(authHeaders(token));
    assert.equal(own.status, 200);
    assert.deepEqual(own.body.map((t) => t.id), [trip.id]);

    const other = await request(app)
      .get('/api/trips')
      .query({ userId: user.id })
      .set(authHeaders(otherToken));
    assert.equal(other.status, 403);
    assert.equal(other.body.error.code, 'forbidden');

    const admin = await request(app)
      .get('/api/trips')
      .query({ userId: user.id })
      .set(adminHeaders());
    assert.equal(admin.status, 200);
    assert.equal(admin.body.length, 1);
  });

  it('GET /:id : chauffeur assigné → 200, autre chauffeur → 403, tiers → 403, inconnu → 404', async () => {
    const { token, user } = await createTourist();
    const { token: driverToken, driver } = await createVerifiedDriver();
    const { token: otherDriverToken } = await createVerifiedDriver({ fullName: 'Autre Chauffeur' });
    const { token: otherUserToken } = await createTourist({ fullName: 'Autre Cliente' });
    const trip = await createTrip(token, user.id);
    await assignDriver(trip.id, driver.id);

    const assigned = await request(app).get(`/api/trips/${trip.id}`).set(authHeaders(driverToken));
    assert.equal(assigned.status, 200, 'le chauffeur assigné voit la course');
    assert.equal(assigned.body.id, trip.id);

    const otherDriver = await request(app)
      .get(`/api/trips/${trip.id}`)
      .set(authHeaders(otherDriverToken));
    assert.equal(otherDriver.status, 403);

    const otherUser = await request(app)
      .get(`/api/trips/${trip.id}`)
      .set(authHeaders(otherUserToken));
    assert.equal(otherUser.status, 403);
    assert.equal(otherUser.body.error.code, 'forbidden');

    const notFoundRes = await request(app).get(`/api/trips/${UNKNOWN_ID}`).set(adminHeaders());
    assert.equal(notFoundRes.status, 404);
    assert.equal(notFoundRes.body.error.code, 'not_found');
  });
});

describe('Courses — annulation', () => {
  it('le client annule une course demandée → cancelled', async () => {
    const { token, user } = await createTourist();
    const trip = await createTrip(token, user.id);

    const res = await request(app)
      .post(`/api/trips/${trip.id}/cancel`)
      .set(authHeaders(token));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, 'cancelled');
  });

  it('annulation après confirmation du chauffeur : le paiement en attente passe à failed', async () => {
    const { token, user } = await createTourist();
    const { driver } = await createVerifiedDriver();
    const trip = await createTrip(token, user.id);
    await assignDriver(trip.id, driver.id);

    const payment = await request(app)
      .post(`/api/trips/${trip.id}/payment`)
      .set(authHeaders(token));
    assert.equal(payment.status, 201);

    const cancel = await request(app)
      .post(`/api/trips/${trip.id}/cancel`)
      .set(authHeaders(token));
    assert.equal(cancel.status, 200);
    assert.equal(cancel.body.status, 'cancelled');

    // Le paiement orphelin n'est plus confirmable.
    const detail = await request(app)
      .get(`/api/payments/${payment.body.id}`)
      .set(authHeaders(token));
    assert.equal(detail.body.status, 'failed');
    const confirm = await request(app)
      .post(`/api/payments/${payment.body.id}/confirm`)
      .set(authHeaders(token));
    assert.equal(confirm.status, 409);
    assert.equal(confirm.body.error.code, 'payment_already_processed');
  });

  it('course payée : client → 409, équipe → 200 cancelled', async () => {
    const { token, user } = await createTourist();
    const { driver } = await createVerifiedDriver();
    const trip = await createTrip(token, user.id);
    await assignDriver(trip.id, driver.id);
    await payTrip(token, trip.id);

    const byClient = await request(app)
      .post(`/api/trips/${trip.id}/cancel`)
      .set(authHeaders(token));
    assert.equal(byClient.status, 409);
    assert.equal(byClient.body.error.code, 'invalid_status');

    const byTeam = await request(app)
      .post(`/api/trips/${trip.id}/cancel`)
      .set(adminHeaders());
    assert.equal(byTeam.status, 200);
    assert.equal(byTeam.body.status, 'cancelled');
  });

  it('un tiers ne peut pas annuler → 403 ; double annulation → 409', async () => {
    const { token, user } = await createTourist();
    const { token: otherToken } = await createTourist({ fullName: 'Autre Cliente' });
    const trip = await createTrip(token, user.id);

    const tiers = await request(app)
      .post(`/api/trips/${trip.id}/cancel`)
      .set(authHeaders(otherToken));
    assert.equal(tiers.status, 403);
    assert.equal(tiers.body.error.code, 'forbidden');

    await request(app).post(`/api/trips/${trip.id}/cancel`).set(authHeaders(token));
    const encore = await request(app)
      .post(`/api/trips/${trip.id}/cancel`)
      .set(authHeaders(token));
    assert.equal(encore.status, 409);
    assert.equal(encore.body.error.code, 'invalid_status');
  });
});
