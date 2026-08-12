// Tests des paiements : détail (ownership), confirmation en mode stub
// Pesapal (payeur uniquement), avancement de la cible (trip/colis → paid),
// double confirmation.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  adminHeaders,
  app,
  authHeaders,
  createHotel,
  createTourist,
  createVerifiedDriver,
  useTestDb,
} from './setup.js';

useTestDb();

// Course confirmée + lien de paiement pour un touriste.
// Retour : {token, user, trip, payment}
async function createTripPayment() {
  const { token, user } = await createTourist();
  const { driver } = await createVerifiedDriver();

  const tripRes = await request(app)
    .post('/api/trips')
    .set(authHeaders(token))
    .send({
      userId: user.id,
      tripType: 'private',
      pickupLocation: 'Stone Town',
      dropoffLocation: 'Kendwa',
    });
  assert.equal(tripRes.status, 201);

  const assignRes = await request(app)
    .patch(`/api/trips/${tripRes.body.id}/assign-driver`)
    .set(adminHeaders())
    .send({ driverId: driver.id });
  assert.equal(assignRes.status, 200);

  const paymentRes = await request(app)
    .post(`/api/trips/${tripRes.body.id}/payment`)
    .set(authHeaders(token))
    .send({});
  assert.equal(paymentRes.status, 201);

  return { token, user, trip: assignRes.body, payment: paymentRes.body };
}

// Colis hôtel + lien de paiement.
// Retour : {token, hotel, pkg, payment}
async function createPackagePayment() {
  const { token, hotel } = await createHotel();

  const pkgRes = await request(app)
    .post('/api/packages')
    .set(authHeaders(token))
    .send({
      senderType: 'hotel',
      size: 'medium',
      senderHotelId: hotel.id,
      pickupLocation: 'Hôtel Test, Nungwi',
      dropoffLocation: 'Stone Town',
      recipientName: 'Omar Destinataire',
      recipientPhone: '+255780000001',
    });
  assert.equal(pkgRes.status, 201);

  const paymentRes = await request(app)
    .post(`/api/packages/${pkgRes.body.id}/payment`)
    .set(authHeaders(token))
    .send({});
  assert.equal(paymentRes.status, 201);

  return { token, hotel, pkg: pkgRes.body, payment: paymentRes.body };
}

describe('Paiements — détail', () => {
  it('le payeur (client de la course) lit son paiement, montant et devise figés', async () => {
    const { token, trip, payment } = await createTripPayment();
    const res = await request(app)
      .get(`/api/payments/${payment.id}`)
      .set(authHeaders(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.trip_id, trip.id);
    assert.equal(res.body.status, 'pending');
    assert.equal(Number(res.body.amount), Number(trip.price));
    assert.equal(res.body.currency, trip.currency);
    assert.ok(res.body.payment_link);
  });

  it("l'équipe (clé admin) lit n'importe quel paiement", async () => {
    const { payment } = await createTripPayment();
    const res = await request(app)
      .get(`/api/payments/${payment.id}`)
      .set(adminHeaders());
    assert.equal(res.status, 200);
    assert.equal(res.body.id, payment.id);
  });

  it('un tiers ne peut pas lire le paiement → 403 forbidden', async () => {
    const { payment } = await createTripPayment();
    const { token: otherToken } = await createTourist();
    const res = await request(app)
      .get(`/api/payments/${payment.id}`)
      .set(authHeaders(otherToken));
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'forbidden');
  });

  it('paiement inconnu → 404 not_found', async () => {
    const { token } = await createTourist();
    const res = await request(app)
      .get('/api/payments/00000000-0000-0000-0000-000000000000')
      .set(authHeaders(token));
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'not_found');
  });
});

describe('Paiements — confirmation (mode stub Pesapal)', () => {
  it('le payeur confirme → payment confirmed + confirmed_at, la course passe à paid', async () => {
    const { token, trip, payment } = await createTripPayment();
    const res = await request(app)
      .post(`/api/payments/${payment.id}/confirm`)
      .set(authHeaders(token))
      .send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'confirmed');
    assert.ok(res.body.confirmed_at);

    const tripRes = await request(app)
      .get(`/api/trips/${trip.id}`)
      .set(authHeaders(token));
    assert.equal(tripRes.body.status, 'paid');
  });

  it('double confirmation → 409 payment_already_processed', async () => {
    const { token, payment } = await createTripPayment();
    await request(app)
      .post(`/api/payments/${payment.id}/confirm`)
      .set(authHeaders(token))
      .send({});
    const res = await request(app)
      .post(`/api/payments/${payment.id}/confirm`)
      .set(authHeaders(token))
      .send({});
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'payment_already_processed');
  });

  it('webhook Pesapal (IPN) : confirme un paiement pending, inconnu → 200 sans effet', async () => {
    const { token, trip, payment } = await createTripPayment();

    // Notification IPN avec la référence du paiement : en stub, le statut
    // vérifié est COMPLETED → paiement confirmé et course payée, sans aucun
    // jeton (c'est Pesapal qui appelle).
    const ipn = await request(app)
      .post('/api/payments/pesapal-ipn')
      .send({ OrderTrackingId: payment.pesapal_reference });
    assert.equal(ipn.status, 200);
    assert.equal(ipn.body.status, 200);

    const releve = await request(app)
      .get(`/api/payments/${payment.id}`)
      .set(authHeaders(token));
    assert.equal(releve.body.status, 'confirmed');
    const tripRes = await request(app).get(`/api/trips/${trip.id}`).set(authHeaders(token));
    assert.equal(tripRes.body.status, 'paid');

    // Référence inconnue : réponse 200 (accusé de réception), aucun effet.
    const inconnu = await request(app)
      .post('/api/payments/pesapal-ipn')
      .send({ OrderTrackingId: 'ref-inconnue' });
    assert.equal(inconnu.status, 200);
  });

  it('confirmer un paiement solde les doublons pending de la même cible en failed', async () => {
    const { token, trip, payment } = await createTripPayment();
    // Le client a rappuyé sur « payer » : second paiement en attente.
    const doublon = await request(app)
      .post(`/api/trips/${trip.id}/payment`)
      .set(authHeaders(token));
    assert.equal(doublon.status, 201);

    await request(app)
      .post(`/api/payments/${payment.id}/confirm`)
      .set(authHeaders(token))
      .send({});

    const releve = await request(app)
      .get(`/api/payments/${doublon.body.id}`)
      .set(authHeaders(token));
    assert.equal(releve.body.status, 'failed', 'le doublon est soldé automatiquement');
  });

  it('un tiers ne peut pas confirmer → 403 forbidden (paiement toujours pending)', async () => {
    const { token, payment } = await createTripPayment();
    const { token: otherToken } = await createTourist();
    const res = await request(app)
      .post(`/api/payments/${payment.id}/confirm`)
      .set(authHeaders(otherToken))
      .send({});
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'forbidden');

    const detail = await request(app)
      .get(`/api/payments/${payment.id}`)
      .set(authHeaders(token));
    assert.equal(detail.body.status, 'pending');
  });

  it('sans jeton → 401 unauthorized', async () => {
    const { payment } = await createTripPayment();
    const res = await request(app)
      .post(`/api/payments/${payment.id}/confirm`)
      .send({});
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'unauthorized');
  });
});

describe('Paiements — colis (expéditeur hôtel)', () => {
  it("l'hôtel expéditeur confirme → le colis passe à paid", async () => {
    const { token, pkg, payment } = await createPackagePayment();
    const res = await request(app)
      .post(`/api/payments/${payment.id}/confirm`)
      .set(authHeaders(token))
      .send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'confirmed');

    const pkgRes = await request(app)
      .get(`/api/packages/${pkg.id}`)
      .set(authHeaders(token));
    assert.equal(pkgRes.body.status, 'paid');
  });

  it('un tiers ne peut ni lire ni confirmer le paiement du colis → 403', async () => {
    const { payment } = await createPackagePayment();
    const { token: otherToken } = await createTourist();

    const read = await request(app)
      .get(`/api/payments/${payment.id}`)
      .set(authHeaders(otherToken));
    assert.equal(read.status, 403);

    const confirm = await request(app)
      .post(`/api/payments/${payment.id}/confirm`)
      .set(authHeaders(otherToken))
      .send({});
    assert.equal(confirm.status, 403);
  });
});
