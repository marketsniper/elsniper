// Tests hôtels partenaires : inscription, ownership, historique des colis.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  adminHeaders,
  app,
  authHeaders,
  authenticate,
  createHotel,
  createTourist,
  nextPhone,
  useTestDb,
} from './setup.js';

useTestDb();

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('Hôtels (hotels)', () => {
  it('inscription partenaire → 201', async () => {
    const phone = nextPhone();
    const { token } = await authenticate(phone);
    const res = await request(app)
      .post('/api/hotels')
      .set(authHeaders(token))
      .send({ name: 'Hotel Baraka', contactName: 'Fatma', phone, zone: 'Nungwi', address: 'Plage de Nungwi' });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Hotel Baraka');
    assert.equal(res.body.contact_name, 'Fatma');
    assert.equal(res.body.zone, 'Nungwi');
  });

  it('inscription avec un autre téléphone que le jeton → 403 phone_mismatch', async () => {
    const { token } = await authenticate(nextPhone());
    const res = await request(app)
      .post('/api/hotels')
      .set(authHeaders(token))
      .send({ name: 'Hotel Imposteur', contactName: 'X Y', phone: nextPhone(), zone: 'Paje' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'phone_mismatch');
  });

  it('corps invalide (zone manquante) → 400 validation_error', async () => {
    const phone = nextPhone();
    const { token } = await authenticate(phone);
    const res = await request(app)
      .post('/api/hotels')
      .set(authHeaders(token))
      .send({ name: 'Hotel Sans Zone', contactName: 'Fatma', phone });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'validation_error');
  });

  it('GET /:id : l\'hôtel lui-même → 200, un tiers → 403 forbidden, équipe → 200', async () => {
    const { token, hotel } = await createHotel();
    const { token: touristToken } = await createTourist();

    const own = await request(app).get(`/api/hotels/${hotel.id}`).set(authHeaders(token));
    assert.equal(own.status, 200);
    assert.equal(own.body.id, hotel.id);

    const other = await request(app).get(`/api/hotels/${hotel.id}`).set(authHeaders(touristToken));
    assert.equal(other.status, 403);
    assert.equal(other.body.error.code, 'forbidden');

    const admin = await request(app).get(`/api/hotels/${hotel.id}`).set(adminHeaders());
    assert.equal(admin.status, 200);
  });

  it('GET /:id inconnu (équipe) → 404 not_found', async () => {
    const res = await request(app).get(`/api/hotels/${UNKNOWN_ID}`).set(adminHeaders());
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'not_found');
  });

  it('GET /:id/packages : historique des colis de l\'hôtel (lui-même et équipe)', async () => {
    const { token, hotel } = await createHotel();

    const pkgRes = await request(app)
      .post('/api/packages')
      .set(authHeaders(token))
      .send({
        senderType: 'hotel',
        senderHotelId: hotel.id,
        pickupLocation: 'Hotel Baraka, Nungwi',
        dropoffLocation: 'Marché de Stone Town',
        recipientName: 'Omar',
        recipientPhone: nextPhone(),
      });
    assert.equal(pkgRes.status, 201);

    const history = await request(app)
      .get(`/api/hotels/${hotel.id}/packages`)
      .set(authHeaders(token));
    assert.equal(history.status, 200);
    assert.equal(history.body.length, 1);
    assert.equal(history.body[0].id, pkgRes.body.id);

    const adminHistory = await request(app)
      .get(`/api/hotels/${hotel.id}/packages`)
      .set(adminHeaders());
    assert.equal(adminHistory.status, 200);
    assert.equal(adminHistory.body.length, 1);
  });

  it('GET /:id/packages par un tiers → 403 forbidden', async () => {
    const { hotel } = await createHotel();
    const { token: touristToken } = await createTourist();
    const res = await request(app)
      .get(`/api/hotels/${hotel.id}/packages`)
      .set(authHeaders(touristToken));
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'forbidden');
  });

  it('GET /:id/packages sur hôtel inconnu (équipe) → 404 not_found', async () => {
    const res = await request(app).get(`/api/hotels/${UNKNOWN_ID}/packages`).set(adminHeaders());
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'not_found');
  });
});
