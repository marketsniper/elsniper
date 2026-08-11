// Tests hôtels partenaires : compte email + mot de passe, connexion,
// ownership, historique des colis.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  HOTEL_PASSWORD,
  adminHeaders,
  app,
  authHeaders,
  createHotel,
  createTourist,
  nextHotelEmail,
  nextPhone,
  useTestDb,
} from './setup.js';

useTestDb();

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('Hôtels (hotels)', () => {
  it('création de compte (email + mot de passe) → 201, sans hash exposé', async () => {
    const email = nextHotelEmail();
    const res = await request(app)
      .post('/api/hotels')
      .send({
        name: 'Hotel Baraka',
        contactName: 'Fatma',
        email,
        password: HOTEL_PASSWORD,
        phone: nextPhone(),
        zone: 'Nungwi',
        address: 'Plage de Nungwi',
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Hotel Baraka');
    assert.equal(res.body.email, email);
    assert.equal(res.body.password_hash, undefined);
  });

  it('connexion hotel-login → 200 {token, hotel} ; mauvais mot de passe → 401', async () => {
    const { email } = await createHotel();

    const ok = await request(app)
      .post('/api/auth/hotel-login')
      .send({ email, password: HOTEL_PASSWORD });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token);
    assert.equal(ok.body.hotel.password_hash, undefined);

    const bad = await request(app)
      .post('/api/auth/hotel-login')
      .send({ email, password: 'mauvais-mot-de-passe' });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.error.code, 'invalid_credentials');

    const unknown = await request(app)
      .post('/api/auth/hotel-login')
      .send({ email: 'inconnu@test.example.com', password: HOTEL_PASSWORD });
    assert.equal(unknown.status, 401);
  });

  it('email déjà utilisé → 409 duplicate ; mot de passe trop court → 400', async () => {
    const { email } = await createHotel();
    const dup = await request(app)
      .post('/api/hotels')
      .send({
        name: 'Hotel Copie',
        contactName: 'X Y',
        email,
        password: HOTEL_PASSWORD,
        phone: nextPhone(),
        zone: 'Paje',
      });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'duplicate');

    const weak = await request(app)
      .post('/api/hotels')
      .send({
        name: 'Hotel Faible',
        contactName: 'X Y',
        email: nextHotelEmail(),
        password: 'court',
        phone: nextPhone(),
        zone: 'Paje',
      });
    assert.equal(weak.status, 400);
    assert.equal(weak.body.error.code, 'validation_error');
  });

  it('corps invalide (zone manquante) → 400 validation_error', async () => {
    const res = await request(app)
      .post('/api/hotels')
      .send({
        name: 'Hotel Sans Zone',
        contactName: 'Fatma',
        email: nextHotelEmail(),
        password: HOTEL_PASSWORD,
        phone: nextPhone(),
      });
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
      size: 'medium',
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

describe('Vérification des comptes hôtels', () => {
  it('un nouvel hôtel est pending ; il apparaît dans GET /hotels (équipe)', async () => {
    const { hotel } = await createHotel({ verify: false });
    assert.equal(hotel.verification_status, 'pending');

    const liste = await request(app).get('/api/hotels').set(adminHeaders());
    assert.equal(liste.status, 200);
    assert.equal(liste.body.length, 1);
    assert.equal(liste.body[0].id, hotel.id);
    assert.equal(liste.body[0].password_hash, undefined);
  });

  it('GET /hotels sans clé équipe → 401/403', async () => {
    const { token } = await createHotel();
    const res = await request(app).get('/api/hotels').set(authHeaders(token));
    assert.ok([401, 403].includes(res.status));
  });

  it('hôtel pending : réserver une course → 403 hotel_not_verified ; après validation → 201', async () => {
    const { token, hotel } = await createHotel({ verify: false });

    const corps = {
      hotelId: hotel.id,
      clientName: 'Guest Smith',
      clientPhone: nextPhone(),
      tripType: 'private',
      pickupLocation: 'Aéroport de Zanzibar',
      dropoffLocation: 'Nungwi',
    };
    const bloque = await request(app).post('/api/trips').set(authHeaders(token)).send(corps);
    assert.equal(bloque.status, 403);
    assert.equal(bloque.body.error.code, 'hotel_not_verified');

    const verif = await request(app)
      .patch(`/api/hotels/${hotel.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'verified' });
    assert.equal(verif.status, 200);
    assert.equal(verif.body.verification_status, 'verified');

    const ok = await request(app).post('/api/trips').set(authHeaders(token)).send(corps);
    assert.equal(ok.status, 201);
  });

  it('hôtel pending : créer un colis → 403 hotel_not_verified', async () => {
    const { token, hotel } = await createHotel({ verify: false });
    const res = await request(app)
      .post('/api/packages')
      .set(authHeaders(token))
      .send({
        senderType: 'hotel',
        senderHotelId: hotel.id,
        size: 'small',
        pickupLocation: 'Hotel Baraka, Nungwi',
        dropoffLocation: 'Stone Town',
        recipientName: 'Omar',
        recipientPhone: nextPhone(),
      });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'hotel_not_verified');
  });

  it('PATCH /:id/verify : même statut → 409 ; blocage d\'un hôtel vérifié → 200', async () => {
    const { hotel } = await createHotel();

    const deja = await request(app)
      .patch(`/api/hotels/${hotel.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'verified' });
    assert.equal(deja.status, 409);
    assert.equal(deja.body.error.code, 'invalid_status');

    const bloque = await request(app)
      .patch(`/api/hotels/${hotel.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'rejected' });
    assert.equal(bloque.status, 200);
    assert.equal(bloque.body.verification_status, 'rejected');
  });
});
