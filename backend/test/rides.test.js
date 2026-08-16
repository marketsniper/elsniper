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
  createHotel,
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
      origin: 'Aéroport (AAKIA)',
      destination: 'Nungwi',
      departureAt: inOneDay(),
      seatsTotal: 4,
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
    assert.equal(Number(res.body.price_per_seat), 15000); // grille Nord, fixée par zanziGo
    // Le chauffeur voit LES DEUX prix : TZS (locaux) et USD (touristes) —
    // chaque client paie dans sa devise, le chauffeur doit le savoir.
    assert.equal(Number(res.body.price_per_seat_usd), 15);
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

  it('point de départ hors des deux hubs → 400 ; arrivée inconnue → 400', async () => {
    const { token } = await createVerifiedDriver();
    const badOrigin = await postRide(token, { origin: 'Zanzibar City Mall' });
    assert.equal(badOrigin.status, 400);
    assert.equal(badOrigin.body.error.code, 'validation_error');

    const badDestination = await postRide(token, { destination: 'Zanzibar City Mall' });
    assert.equal(badDestination.status, 400);
    assert.equal(badDestination.body.error.code, 'validation_error');
  });

  it('GET /rides/locations : listes pour les menus déroulants', async () => {
    const res = await request(app).get('/api/rides/locations');
    assert.equal(res.status, 200);
    assert.ok(res.body.origins.includes('Aéroport international Abeid Amani Karume'));
    assert.ok(res.body.origins.includes('Stone Town Ferry'));
    assert.ok(res.body.origins.includes('Nungwi'), 'les villes sont aussi des départs');
    assert.ok(res.body.destinations.includes('Nungwi'));
    // L'aéroport est une ARRIVÉE à part entière (rentrer prendre son vol).
    assert.ok(
      res.body.destinations.includes('Aéroport international Abeid Amani Karume'),
      'l’aéroport doit être une arrivée proposée'
    );
    assert.ok(res.body.destinations.length >= 10);
  });

  it('Makunduchi → aéroport : un chauffeur du sud peut poster ce retour (201)', async () => {
    const { token } = await createVerifiedDriver();
    const res = await postRide(token, {
      origin: 'Makunduchi',
      destination: 'Aéroport international Abeid Amani Karume',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.origin, 'Makunduchi');
    assert.equal(res.body.destination, 'Aéroport international Abeid Amani Karume');
  });

  it('aéroport → aéroport : départ = arrivée → 422 route_indisponible', async () => {
    const { token } = await createVerifiedDriver();
    const res = await postRide(token, {
      origin: 'Aéroport (AAKIA)', // ancien libellé accepté au départ
      destination: 'Aéroport international Abeid Amani Karume',
    });
    assert.equal(res.status, 422, JSON.stringify(res.body));
    assert.equal(res.body.error.code, 'route_indisponible');
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

  it('cloison tarifaire : touriste 15 USD, résident vérifié 13,50 USD, local TZS', async () => {
    const { token } = await createVerifiedDriver();
    const ride = (await postRide(token)).body;

    const { token: touristToken } = await createTourist();
    const forTourist = await request(app).get('/api/rides').set(authHeaders(touristToken));
    const t = forTourist.body.find((r) => r.id === ride.id);
    assert.equal(t.price_per_seat_usd, 15);
    assert.equal(t.currency, 'USD');
    assert.equal(t.price_per_seat, undefined, 'le prix local ne doit pas fuiter vers un touriste');
    assert.ok(t.whatsapp_link.includes(encodeURIComponent('15 USD')));

    const { createResident, createLocal } = await import('./setup.js');

    // Résident vérifié : remise de 10 % sur 15 USD → 13,50, jamais le prix local.
    const { token: residentToken } = await createResident();
    const forResident = await request(app).get('/api/rides').set(authHeaders(residentToken));
    const r = forResident.body.find((x) => x.id === ride.id);
    assert.equal(r.price_per_seat_usd, 13.5);
    assert.equal(r.currency, 'USD');
    assert.equal(r.price_per_seat, undefined);

    // Local (carte tanzanienne) : le prix TZS du chauffeur, jamais l'USD.
    const { token: localToken } = await createLocal();
    const forLocal = await request(app).get('/api/rides').set(authHeaders(localToken));
    const l = forLocal.body.find((x) => x.id === ride.id);
    assert.equal(Number(l.price_per_seat), 15000);
    assert.equal(l.currency, 'TZS');
    assert.equal(l.price_per_seat_usd, undefined, 'le tarif touriste ne s’affiche pas aux locaux');
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

describe('Trajets partagés — réservation de places dans l\'app', () => {
  it('un touriste réserve 2 places → décompte automatique, trace et notification', async () => {
    const { token: driverToken } = await createVerifiedDriver();
    const ride = (await postRide(driverToken)).body;
    const { token } = await createTourist();

    const res = await request(app)
      .post(`/api/rides/${ride.id}/book`)
      .set(authHeaders(token))
      .send({ seats: 2 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.seats_available, 2, '4 places − 2 réservées');
    assert.equal(res.body.booked_seats, 2);
    assert.match(res.body.whatsapp_link, /wa\.me/);
    assert.match(decodeURIComponent(res.body.whatsapp_link), /Places réservées: 2/);
    // Cloison touriste : jamais le prix TZS du chauffeur.
    assert.equal(res.body.price_per_seat, undefined);

    // Le chauffeur voit ses places restantes à jour ET le détail de la
    // réservation : type de client et prix de la place selon ce type.
    const mine = await request(app).get('/api/rides/mine').set(authHeaders(driverToken));
    assert.equal(Number(mine.body[0].seats_available), 2);
    assert.equal(mine.body[0].bookings.length, 1);
    assert.equal(mine.body[0].bookings[0].seats, 2);
    assert.equal(mine.body[0].bookings[0].client_type, 'tourist');
    assert.equal(mine.body[0].bookings[0].price_per_seat, 15); // Nungwi : privé 45 → place 15
    assert.equal(mine.body[0].bookings[0].currency, 'USD');
    assert.equal(mine.body[0].bookings[0].commission_per_seat, 3); // 20 % de 15
    assert.equal(mine.body[0].bookings[0].net_per_seat, 12); // le chauffeur garde 80 %
  });

  it('surréservation → 409 not_enough_seats, places inchangées', async () => {
    const { token: driverToken } = await createVerifiedDriver();
    const ride = (await postRide(driverToken, { seatsTotal: 2 })).body;
    const { token } = await createTourist();

    const trop = await request(app)
      .post(`/api/rides/${ride.id}/book`)
      .set(authHeaders(token))
      .send({ seats: 3 });
    assert.equal(trop.status, 409);
    assert.equal(trop.body.error.code, 'not_enough_seats');

    const ok = await request(app)
      .post(`/api/rides/${ride.id}/book`)
      .set(authHeaders(token))
      .send({ seats: 2 });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.seats_available, 0);
  });

  it('trajet clôturé ou passé → 409 ride_closed ; sans jeton → 401', async () => {
    const { token: driverToken } = await createVerifiedDriver();
    const ride = (await postRide(driverToken)).body;
    await request(app)
      .patch(`/api/rides/${ride.id}`)
      .set(authHeaders(driverToken))
      .send({ status: 'closed' });
    const { token } = await createTourist();

    const ferme = await request(app)
      .post(`/api/rides/${ride.id}/book`)
      .set(authHeaders(token))
      .send({ seats: 1 });
    assert.equal(ferme.status, 409);
    assert.equal(ferme.body.error.code, 'ride_closed');

    const sansJeton = await request(app).post(`/api/rides/${ride.id}/book`).send({ seats: 1 });
    assert.equal(sansJeton.status, 401);
  });

  it('hôtel non vérifié → 403 hotel_not_verified, aucune place décomptée', async () => {
    const { token: driverToken } = await createVerifiedDriver();
    const ride = (await postRide(driverToken)).body;
    const { token: hotelToken } = await createHotel({ verify: false });

    const res = await request(app)
      .post(`/api/rides/${ride.id}/book`)
      .set(authHeaders(hotelToken))
      .send({ seats: 2 });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'hotel_not_verified');

    const detail = await request(app).get('/api/rides').set(adminHeaders());
    const ligne = detail.body.find((r) => r.id === ride.id);
    assert.equal(ligne.seats_available, ride.seats_available);
  });
});
