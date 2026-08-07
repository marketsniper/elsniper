// Tests des trajets partagés postés par les chauffeurs : publication
// (chauffeur validé uniquement), liste publique des trajets à venir,
// gestion des places et clôture par le propriétaire.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  adminHeaders,
  app,
  authHeaders,
  createDriverApplication,
  createTourist,
  createVerifiedDriver,
  useTestDb,
} from './setup.js';

useTestDb();

const inOneDay = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString();
const yesterday = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString();

async function postRide(token, extra = {}) {
  return request(app)
    .post('/api/rides')
    .set(authHeaders(token))
    .send({
      origin: 'Stone Town',
      destination: 'Nungwi',
      departureAt: inOneDay(),
      seatsTotal: 4,
      pricePerSeat: 10000,
      ...extra,
    });
}

describe('Trajets partagés (rides)', () => {
  it('un chauffeur validé publie un trajet → 201, places = total, TZS, lien WhatsApp', async () => {
    const { token } = await createVerifiedDriver();
    const res = await postRide(token, { notes: 'Départ devant le marché' });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'open');
    assert.equal(res.body.seats_total, 4);
    assert.equal(res.body.seats_available, 4);
    assert.equal(res.body.currency, 'TZS');
    assert.equal(Number(res.body.price_per_seat), 10000);
    // 10 000 TZS au taux par défaut (2600 TZS/USD) → 4 USD (arrondi au dollar sup.)
    assert.equal(res.body.price_per_seat_usd, 4);
    assert.ok(res.body.whatsapp_link.includes('wa.me'));
  });

  it('chauffeur non validé → 403 driver_not_verified ; non-chauffeur → 403', async () => {
    const { token: pendingToken } = await createDriverApplication();
    const pending = await postRide(pendingToken);
    assert.equal(pending.status, 403);
    assert.equal(pending.body.error.code, 'driver_not_verified');

    const { token: touristToken } = await createTourist();
    const tourist = await postRide(touristToken);
    assert.equal(tourist.status, 403);
    assert.equal(tourist.body.error.code, 'forbidden');
  });

  it('départ dans le passé → 400 departure_in_past', async () => {
    const { token } = await createVerifiedDriver();
    const res = await postRide(token, { departureAt: yesterday() });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'departure_in_past');
  });

  it('la liste publique montre les trajets ouverts à venir avec les infos chauffeur', async () => {
    const { token, driver } = await createVerifiedDriver();
    const ride = (await postRide(token)).body;

    const { token: touristToken } = await createTourist();
    const list = await request(app).get('/api/rides').set(authHeaders(touristToken));
    assert.equal(list.status, 200);
    const found = list.body.find((r) => r.id === ride.id);
    assert.ok(found, 'le trajet doit être listé');
    assert.equal(found.driver_name, driver.full_name);
    assert.ok(found.whatsapp_link.includes('wa.me'));

    const anonymous = await request(app).get('/api/rides');
    assert.equal(anonymous.status, 401);
  });

  it('un trajet clôturé ou sans places disparaît de la liste publique', async () => {
    const { token } = await createVerifiedDriver();
    const closed = (await postRide(token)).body;
    const full = (await postRide(token, { destination: 'Paje' })).body;

    await request(app)
      .patch(`/api/rides/${closed.id}`)
      .set(authHeaders(token))
      .send({ status: 'closed' });
    await request(app)
      .patch(`/api/rides/${full.id}`)
      .set(authHeaders(token))
      .send({ seatsAvailable: 0 });

    const { token: touristToken } = await createTourist();
    const list = await request(app).get('/api/rides').set(authHeaders(touristToken));
    assert.ok(!list.body.some((r) => r.id === closed.id));
    assert.ok(!list.body.some((r) => r.id === full.id));
  });

  it('GET /rides/mine : le chauffeur voit tous ses trajets, un client → 403', async () => {
    const { token } = await createVerifiedDriver();
    const ride = (await postRide(token)).body;
    await request(app)
      .patch(`/api/rides/${ride.id}`)
      .set(authHeaders(token))
      .send({ status: 'closed' });

    const mine = await request(app).get('/api/rides/mine').set(authHeaders(token));
    assert.equal(mine.status, 200);
    assert.ok(mine.body.some((r) => r.id === ride.id));

    const { token: touristToken } = await createTourist();
    const forbidden = await request(app).get('/api/rides/mine').set(authHeaders(touristToken));
    assert.equal(forbidden.status, 403);
  });

  it('mise à jour des places : propriétaire OK, dépassement → 400, autre chauffeur → 403, équipe OK', async () => {
    const { token } = await createVerifiedDriver();
    const ride = (await postRide(token)).body;

    const updated = await request(app)
      .patch(`/api/rides/${ride.id}`)
      .set(authHeaders(token))
      .send({ seatsAvailable: 2 });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.seats_available, 2);

    const tooMany = await request(app)
      .patch(`/api/rides/${ride.id}`)
      .set(authHeaders(token))
      .send({ seatsAvailable: 9 });
    assert.equal(tooMany.status, 400);

    const { token: otherDriverToken } = await createVerifiedDriver();
    const foreign = await request(app)
      .patch(`/api/rides/${ride.id}`)
      .set(authHeaders(otherDriverToken))
      .send({ seatsAvailable: 1 });
    assert.equal(foreign.status, 403);

    const byAdmin = await request(app)
      .patch(`/api/rides/${ride.id}`)
      .set(adminHeaders())
      .send({ seatsAvailable: 1 });
    assert.equal(byAdmin.status, 200);
  });
});
