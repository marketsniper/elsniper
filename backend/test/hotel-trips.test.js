// Tests des réservations de taxi par un hôtel partenaire POUR SES CLIENTS
// (migration 003) : création en USD (grille touriste −5 %) avec coordonnées du client, règles
// d'accès, historique, flux complet jusqu'à la notation par l'hôtel.
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

async function bookHotelTrip(token, hotelId, extra = {}) {
  return request(app)
    .post('/api/trips')
    .set(authHeaders(token))
    .send({
      hotelId,
      clientName: 'M. Dupont',
      clientPhone: '+33612345678',
      tripType: 'private',
      pickupLocation: 'Hôtel Test, Nungwi',
      dropoffLocation: 'Aéroport AAKIA',
      ...extra,
    });
}

describe('Hôtel — réservation de taxi pour un client', () => {
  it('création : 201, prix USD figé (grille touriste −5 %), coordonnées du client', async () => {
    const { token, hotel } = await createHotel();
    const res = await bookHotelTrip(token, hotel.id);
    assert.equal(res.status, 201);
    assert.equal(res.body.hotel_id, hotel.id);
    assert.equal(res.body.user_id, null);
    assert.equal(res.body.client_name, 'M. Dupont');
    assert.equal(res.body.client_phone, '+33612345678');
    assert.equal(res.body.currency, 'USD');
    // Zone Nord (Nungwi) : privé 50 USD → 47,50 USD pour l'hôtel (−5 %).
    assert.equal(Number(res.body.price), 50.35);
    assert.equal(res.body.status, 'requested');
    assert.ok(res.body.whatsapp_link.includes('wa.me'));
  });

  it('le tarif local (shared_local) est refusé à un hôtel → 403 local_only', async () => {
    const { token, hotel } = await createHotel();
    const res = await bookHotelTrip(token, hotel.id, { tripType: 'shared_local' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'local_only');
  });

  it('un hôtel ne peut pas réserver au nom d’un autre hôtel → 403', async () => {
    const { hotel } = await createHotel();
    const { token: otherToken } = await createHotel();
    const res = await bookHotelTrip(otherToken, hotel.id);
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'forbidden');
  });

  it('clientName/clientPhone obligatoires → 400 validation_error', async () => {
    const { token, hotel } = await createHotel();
    const res = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        hotelId: hotel.id,
        tripType: 'private',
        pickupLocation: 'Hôtel Test',
        dropoffLocation: 'Aéroport',
      });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'validation_error');
  });

  it('userId et hotelId en même temps → 400 validation_error', async () => {
    const { token: userToken, user } = await createTourist();
    const { hotel } = await createHotel();
    const res = await request(app)
      .post('/api/trips')
      .set(authHeaders(userToken))
      .send({
        userId: user.id,
        hotelId: hotel.id,
        clientName: 'X Y',
        clientPhone: '+33600000000',
        tripType: 'private',
        pickupLocation: 'A',
        dropoffLocation: 'B',
      });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'validation_error');
  });

  it('historique GET /trips?hotelId= : l’hôtel voit ses courses, un tiers non', async () => {
    const { token, hotel } = await createHotel();
    const created = await bookHotelTrip(token, hotel.id);
    assert.equal(created.status, 201);

    const list = await request(app)
      .get(`/api/trips?hotelId=${hotel.id}`)
      .set(authHeaders(token));
    assert.equal(list.status, 200);
    assert.ok(list.body.some((t) => t.id === created.body.id));

    const { token: touristToken } = await createTourist();
    const forbidden = await request(app)
      .get(`/api/trips?hotelId=${hotel.id}`)
      .set(authHeaders(touristToken));
    assert.equal(forbidden.status, 403);

    const asAdmin = await request(app)
      .get(`/api/trips?hotelId=${hotel.id}`)
      .set(adminHeaders());
    assert.equal(asAdmin.status, 200);
  });

  it('flux complet : assignation → paiement par l’hôtel → scans chauffeur → notation par l’hôtel', async () => {
    const { token, hotel } = await createHotel();
    const { token: driverToken, driver } = await createVerifiedDriver();
    const trip = (await bookHotelTrip(token, hotel.id)).body;

    const assigned = await request(app)
      .patch(`/api/trips/${trip.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: driver.id });
    assert.equal(assigned.status, 200);

    const payment = await request(app)
      .post(`/api/trips/${trip.id}/payment`)
      .set(authHeaders(token))
      .send({});
    assert.equal(payment.status, 201);

    // Un tiers ne peut pas payer/confirmer la course de l'hôtel
    const { token: strangerToken } = await createTourist();
    const strangerConfirm = await request(app)
      .post(`/api/payments/${payment.body.id}/confirm`)
      .set(authHeaders(strangerToken))
      .send({});
    assert.equal(strangerConfirm.status, 403);

    const confirmed = await request(app)
      .post(`/api/payments/${payment.body.id}/confirm`)
      .set(authHeaders(token))
      .send({});
    assert.equal(confirmed.status, 200);

    const started = await request(app)
      .patch(`/api/trips/${trip.id}/start`)
      .set(authHeaders(driverToken))
      .send({});
    assert.equal(started.status, 200);

    const completed = await request(app)
      .patch(`/api/trips/${trip.id}/complete`)
      .set(authHeaders(driverToken))
      .send({});
    assert.equal(completed.status, 200);
    assert.equal(completed.body.status, 'completed');

    const rated = await request(app)
      .post(`/api/trips/${trip.id}/rating`)
      .set(authHeaders(token))
      .send({ rating: 5, comment: 'Client ravi' });
    assert.equal(rated.status, 200);
    assert.equal(rated.body.rating, 5);
  });

  it('GET /trips/:id : accessible à l’hôtel réservateur, pas à un tiers', async () => {
    const { token, hotel } = await createHotel();
    const trip = (await bookHotelTrip(token, hotel.id)).body;

    const own = await request(app).get(`/api/trips/${trip.id}`).set(authHeaders(token));
    assert.equal(own.status, 200);

    const { token: touristToken } = await createTourist();
    const forbidden = await request(app)
      .get(`/api/trips/${trip.id}`)
      .set(authHeaders(touristToken));
    assert.equal(forbidden.status, 403);
  });
});
