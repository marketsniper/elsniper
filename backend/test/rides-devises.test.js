// Cloison des devises sur les taxis partagés, de bout en bout :
// un LOCAL voit et paie TOUJOURS en shillings (liste, réservation),
// et le chauffeur voit chaque réservation dans la devise du client.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  app,
  authHeaders,
  createLocal,
  createVerifiedDriver,
  useTestDb,
} from './setup.js';

useTestDb();

describe('Devises taxi partagé (parcours local complet)', () => {
  it('local : TZS sur la liste, la réservation et la fiche chauffeur', async () => {
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const { token: tokenLocal } = await createLocal();

    const depart = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const posted = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({ origin: 'Aéroport (AAKIA)', destination: 'Nungwi', departureAt: depart, seatsTotal: 6 });
    assert.equal(posted.status, 201);

    // Liste vue par le local : prix TZS, jamais de champ USD.
    const liste = await request(app).get('/api/rides').set(authHeaders(tokenLocal));
    const ride = liste.body[0];
    assert.equal(ride.currency, 'TZS');
    assert.equal(Number(ride.price_per_seat), 15000);
    assert.equal(ride.price_per_seat_usd, undefined);

    // Réservation par le local : la réponse reste en TZS.
    const resa = await request(app)
      .post(`/api/rides/${ride.id}/book`)
      .set(authHeaders(tokenLocal))
      .send({ seats: 2 });
    assert.equal(resa.status, 201);
    assert.equal(resa.body.currency, 'TZS');
    assert.equal(Number(resa.body.price_per_seat), 15000);
    assert.equal(resa.body.price_per_seat_usd, undefined);

    // Fiche chauffeur : la réservation du local est étiquetée local + TZS,
    // et l'annonce elle-même porte les deux prix (TZS locaux, USD touristes).
    const mine = await request(app).get('/api/rides/mine').set(authHeaders(tokenChauffeur));
    const annonce = mine.body[0];
    assert.equal(Number(annonce.price_per_seat), 15000);
    assert.equal(Number(annonce.price_per_seat_usd), 18);
    const booking = annonce.bookings[0];
    assert.equal(booking.client_type, 'local');
    assert.equal(booking.currency, 'TZS');
    assert.equal(Number(booking.price_per_seat), 15000);
    assert.equal(Number(booking.net_per_seat), 13500);
  });
});
