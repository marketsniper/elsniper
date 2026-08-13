// Annulation par le CLIENT d'un voyage payé, avec barème de remboursement :
// ≥ 48 h avant le départ = 100 %, entre 24 h et 48 h = 50 %, < 24 h =
// refusée. Les remboursements dus arrivent dans le tableau de bord équipe
// (GET /payments/remboursements) et se soldent d'un bouton.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  adminHeaders,
  app,
  authHeaders,
  createLocal,
  createTourist,
  createVerifiedDriver,
  useTestDb,
} from './setup.js';

useTestDb();

// Poste une annonce de taxi partagé qui part dans `heures` heures.
async function posterAnnonce(tokenChauffeur, heures, seatsTotal = 6) {
  const res = await request(app)
    .post('/api/rides')
    .set(authHeaders(tokenChauffeur))
    .send({
      origin: 'Aéroport (AAKIA)',
      destination: 'Nungwi',
      departureAt: new Date(Date.now() + heures * 3600 * 1000).toISOString(),
      seatsTotal,
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

// Réserve `seats` places et paie (stub : le payeur confirme).
async function reserverEtPayer(tokenClient, rideId, seats) {
  const resa = await request(app)
    .post(`/api/rides/${rideId}/book`)
    .set(authHeaders(tokenClient))
    .send({ seats });
  assert.equal(resa.status, 201, JSON.stringify(resa.body));
  const confirm = await request(app)
    .post(`/api/payments/${resa.body.payment.id}/confirm`)
    .set(authHeaders(tokenClient));
  assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
  return resa.body;
}

describe('Annulation des places de taxi partagé (barème 24/48 h)', () => {
  it('à +48 h : annulation, remboursement 100 %, places rendues au chauffeur', async () => {
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const { token: tokenLocal } = await createLocal();
    const annonce = await posterAnnonce(tokenChauffeur, 72);
    await reserverEtPayer(tokenLocal, annonce.id, 2);

    // La réservation apparaît dans « mes places », annulable à 100 %.
    const mesPlaces = await request(app)
      .get('/api/rides/reservations')
      .set(authHeaders(tokenLocal));
    assert.equal(mesPlaces.status, 200);
    const place = mesPlaces.body[0];
    assert.equal(place.seats, 2);
    assert.equal(place.paid, true);
    assert.equal(place.cancellable, true);
    assert.equal(place.refund_rate, 1);
    assert.equal(place.currency, 'TZS');
    assert.equal(Number(place.amount), 30000);

    const annulation = await request(app)
      .post(`/api/rides/reservations/${place.id}/cancel`)
      .set(authHeaders(tokenLocal));
    assert.equal(annulation.status, 200, JSON.stringify(annulation.body));
    assert.equal(annulation.body.refund.rate, 1);
    assert.equal(Number(annulation.body.refund.amount), 30000);
    assert.equal(annulation.body.refund.currency, 'TZS');
    assert.ok(annulation.body.whatsapp_link.includes('wa.me'));

    // Les 2 places retournent sur l'annonce du chauffeur.
    const mine = await request(app).get('/api/rides/mine').set(authHeaders(tokenChauffeur));
    assert.equal(mine.body[0].seats_available, 6);

    // Le remboursement dû arrive dans le tableau de bord équipe…
    const dus = await request(app).get('/api/payments/remboursements').set(adminHeaders());
    assert.equal(dus.status, 200);
    assert.equal(dus.body.length, 1);
    assert.equal(Number(dus.body[0].refund_amount), 30000);
    assert.equal(dus.body[0].ride_origin, 'Aéroport (AAKIA)');

    // …et se solde d'un bouton (une seule fois).
    const solde = await request(app)
      .post(`/api/payments/${dus.body[0].id}/rembourse`)
      .set(adminHeaders());
    assert.equal(solde.status, 200);
    const encore = await request(app)
      .post(`/api/payments/${dus.body[0].id}/rembourse`)
      .set(adminHeaders());
    assert.equal(encore.status, 409);
    const vide = await request(app).get('/api/payments/remboursements').set(adminHeaders());
    assert.equal(vide.body.length, 0);
  });

  it('entre 24 h et 48 h : remboursement 50 %', async () => {
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const { token: tokenLocal } = await createLocal();
    const annonce = await posterAnnonce(tokenChauffeur, 30);
    await reserverEtPayer(tokenLocal, annonce.id, 2);

    const mesPlaces = await request(app)
      .get('/api/rides/reservations')
      .set(authHeaders(tokenLocal));
    assert.equal(mesPlaces.body[0].refund_rate, 0.5);

    const annulation = await request(app)
      .post(`/api/rides/reservations/${mesPlaces.body[0].id}/cancel`)
      .set(authHeaders(tokenLocal));
    assert.equal(annulation.status, 200);
    assert.equal(annulation.body.refund.rate, 0.5);
    assert.equal(Number(annulation.body.refund.amount), 15000);
  });

  it('à moins de 24 h : annulation refusée, la place reste due', async () => {
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const { token: tokenLocal } = await createLocal();
    const annonce = await posterAnnonce(tokenChauffeur, 10);
    await reserverEtPayer(tokenLocal, annonce.id, 1);

    const mesPlaces = await request(app)
      .get('/api/rides/reservations')
      .set(authHeaders(tokenLocal));
    assert.equal(mesPlaces.body[0].cancellable, false);
    assert.equal(mesPlaces.body[0].refund_rate, null);

    const annulation = await request(app)
      .post(`/api/rides/reservations/${mesPlaces.body[0].id}/cancel`)
      .set(authHeaders(tokenLocal));
    assert.equal(annulation.status, 409);
    assert.equal(annulation.body.error.code, 'cancellation_too_late');
  });

  it('place non payée : annulable sans remboursement, paiement pending soldé', async () => {
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const { token: tokenLocal } = await createLocal();
    const annonce = await posterAnnonce(tokenChauffeur, 10);
    const resa = await request(app)
      .post(`/api/rides/${annonce.id}/book`)
      .set(authHeaders(tokenLocal))
      .send({ seats: 1 });
    assert.equal(resa.status, 201);

    const annulation = await request(app)
      .post(`/api/rides/reservations/${resa.body.payment.ride_booking_id}/cancel`)
      .set(authHeaders(tokenLocal));
    assert.equal(annulation.status, 200);
    assert.equal(annulation.body.refund, null);

    // Le paiement en attente est soldé — plus rien au tableau équipe.
    const pendings = await request(app).get('/api/payments?status=pending').set(adminHeaders());
    assert.equal(pendings.body.length, 0);
    // La place est revenue sur l'annonce.
    const mine = await request(app).get('/api/rides/mine').set(authHeaders(tokenChauffeur));
    assert.equal(mine.body[0].seats_available, 6);
  });

  it('seul le client qui a réservé peut annuler sa place', async () => {
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const { token: tokenLocal } = await createLocal();
    const { token: tokenAutre } = await createLocal();
    const annonce = await posterAnnonce(tokenChauffeur, 72);
    const resa = await reserverEtPayer(tokenLocal, annonce.id, 1);

    const annulation = await request(app)
      .post(`/api/rides/reservations/${resa.payment.ride_booking_id}/cancel`)
      .set(authHeaders(tokenAutre));
    assert.equal(annulation.status, 403);
  });
});

describe('Annulation d\'une course payée (barème 24/48 h)', () => {
  async function coursePayee(heuresAvantDepart) {
    const { token, user } = await createTourist();
    const { driver } = await createVerifiedDriver();
    const creation = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: user.id,
        tripType: 'private',
        pickupLocation: 'Aéroport AAKIA',
        dropoffLocation: 'Nungwi Beach',
        scheduledAt: new Date(Date.now() + heuresAvantDepart * 3600 * 1000).toISOString(),
      });
    assert.equal(creation.status, 201, JSON.stringify(creation.body));
    const trip = creation.body;
    const assigned = await request(app)
      .patch(`/api/trips/${trip.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: driver.id });
    assert.equal(assigned.status, 200);
    const paiement = await request(app)
      .post(`/api/trips/${trip.id}/payment`)
      .set(authHeaders(token));
    assert.equal(paiement.status, 201);
    const confirm = await request(app)
      .post(`/api/payments/${paiement.body.id}/confirm`)
      .set(authHeaders(token));
    assert.equal(confirm.status, 200);
    return { token, trip };
  }

  it('payée, départ à +72 h : annulée, remboursement 100 %', async () => {
    const { token, trip } = await coursePayee(72);
    const annulation = await request(app)
      .post(`/api/trips/${trip.id}/cancel`)
      .set(authHeaders(token));
    assert.equal(annulation.status, 200, JSON.stringify(annulation.body));
    assert.equal(annulation.body.status, 'cancelled');
    assert.equal(annulation.body.refund.rate, 1);
    assert.equal(Number(annulation.body.refund.amount), Number(trip.price));
    assert.ok(annulation.body.whatsapp_link.includes('wa.me'));

    const dus = await request(app).get('/api/payments/remboursements').set(adminHeaders());
    assert.equal(dus.body.length, 1);
    assert.equal(dus.body[0].trip_pickup, 'Aéroport AAKIA');
  });

  it('payée, départ à +30 h : remboursement 50 %', async () => {
    const { token, trip } = await coursePayee(30);
    const annulation = await request(app)
      .post(`/api/trips/${trip.id}/cancel`)
      .set(authHeaders(token));
    assert.equal(annulation.status, 200);
    assert.equal(annulation.body.refund.rate, 0.5);
    assert.equal(Number(annulation.body.refund.amount), Number(trip.price) / 2);
  });

  it('payée, départ à moins de 24 h : refusée pour le client', async () => {
    const { token, trip } = await coursePayee(10);
    const annulation = await request(app)
      .post(`/api/trips/${trip.id}/cancel`)
      .set(authHeaders(token));
    assert.equal(annulation.status, 409);
    assert.equal(annulation.body.error.code, 'invalid_status');
  });

  it('payée sans date planifiée : refusée pour le client (l\'équipe garde la main)', async () => {
    const { token, user } = await createTourist();
    const { driver } = await createVerifiedDriver();
    const creation = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: user.id,
        tripType: 'private',
        pickupLocation: 'Aéroport AAKIA',
        dropoffLocation: 'Nungwi Beach',
      });
    const trip = creation.body;
    await request(app)
      .patch(`/api/trips/${trip.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: driver.id });
    const paiement = await request(app)
      .post(`/api/trips/${trip.id}/payment`)
      .set(authHeaders(token));
    await request(app)
      .post(`/api/payments/${paiement.body.id}/confirm`)
      .set(authHeaders(token));

    const annulation = await request(app)
      .post(`/api/trips/${trip.id}/cancel`)
      .set(authHeaders(token));
    assert.equal(annulation.status, 409);

    // L'équipe, elle, peut toujours annuler.
    const parEquipe = await request(app)
      .post(`/api/trips/${trip.id}/cancel`)
      .set(adminHeaders());
    assert.equal(parEquipe.status, 200);
    assert.equal(parEquipe.body.status, 'cancelled');
    // Annulation par l'équipe : pas de remboursement automatique tracé.
    assert.equal(parEquipe.body.refund, null);
  });
});
