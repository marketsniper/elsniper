// Cloison des devises sur les taxis partagés, de bout en bout :
// un LOCAL voit et paie TOUJOURS en shillings (liste, réservation),
// et le chauffeur voit chaque réservation dans la devise du client.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { pool } from '../src/db.js';
import {
  adminHeaders,
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
    // Commission partagé local 15 % : le chauffeur touche 85 %.
    assert.equal(Number(booking.net_per_seat), 12750);
  });

  it('trajet spécial local : Nungwi ↔ Paje à 20 000 TZS la place (deux sens)', async () => {
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const depart = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const aller = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({ origin: 'Nungwi', destination: 'Paje', departureAt: depart, seatsTotal: 4 });
    assert.equal(aller.status, 201);
    assert.equal(Number(aller.body.price_per_seat), 20000);

    const retour = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({ origin: 'Paje', destination: 'Nungwi', departureAt: depart, seatsTotal: 4 });
    assert.equal(retour.status, 201);
    assert.equal(Number(retour.body.price_per_seat), 20000);

    // Les autres liaisons restent au tarif unifié 15 000 TZS.
    const standard = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({ origin: 'Stone Town Ferry', destination: 'Jambiani', departureAt: depart, seatsTotal: 4 });
    assert.equal(standard.status, 201);
    assert.equal(Number(standard.body.price_per_seat), 15000);
  });

  it('retard de +10 min : annonce automatiquement annulée, invisible, non réservable', async () => {
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const { token: tokenLocal } = await createLocal();

    const depart = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const posted = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({ origin: 'Aéroport (AAKIA)', destination: 'Nungwi', departureAt: depart, seatsTotal: 4 });
    assert.equal(posted.status, 201);

    // On force un départ dépassé de 11 minutes (impossible via l'API,
    // qui refuse les départs passés) — c'est le temps qui a passé.
    await pool.query(
      `UPDATE posted_rides SET departure_at = now() - interval '11 minutes' WHERE id = $1`,
      [posted.body.id]
    );

    // Invisible sur la place de marché…
    const liste = await request(app).get('/api/rides').set(authHeaders(tokenLocal));
    assert.equal(liste.body.find((r) => r.id === posted.body.id), undefined);

    // …non réservable…
    const resa = await request(app)
      .post(`/api/rides/${posted.body.id}/book`)
      .set(authHeaders(tokenLocal))
      .send({ seats: 1 });
    assert.equal(resa.status, 409);
    assert.equal(resa.body.error.code, 'ride_closed');

    // …et marquée ANNULÉE sur la liste du chauffeur.
    const mine = await request(app).get('/api/rides/mine').set(authHeaders(tokenChauffeur));
    const annonce = mine.body.find((r) => r.id === posted.body.id);
    assert.equal(annonce.status, 'cancelled');
  });

  it('retard de moins de 10 min : l\'annonce reste ouverte côté chauffeur', async () => {
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const depart = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const posted = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({ origin: 'Aéroport (AAKIA)', destination: 'Paje', departureAt: depart, seatsTotal: 4 });
    assert.equal(posted.status, 201);

    await pool.query(
      `UPDATE posted_rides SET departure_at = now() - interval '5 minutes' WHERE id = $1`,
      [posted.body.id]
    );

    const mine = await request(app).get('/api/rides/mine').set(authHeaders(tokenChauffeur));
    const annonce = mine.body.find((r) => r.id === posted.body.id);
    assert.equal(annonce.status, 'open');
  });
});

describe('Paiement des places de taxi partagé', () => {
  it('réservation → paiement pending au tableau équipe ; confirmation → place payée', async () => {
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const { token: tokenLocal } = await createLocal();

    const depart = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const posted = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({ origin: 'Aéroport (AAKIA)', destination: 'Nungwi', departureAt: depart, seatsTotal: 6 });

    // Un local réserve 2 places → paiement en attente de 2 × 15 000 TZS.
    const resa = await request(app)
      .post(`/api/rides/${posted.body.id}/book`)
      .set(authHeaders(tokenLocal))
      .send({ seats: 2 });
    assert.equal(resa.status, 201);
    assert.ok(resa.body.payment, 'le paiement doit accompagner la réservation');
    assert.equal(Number(resa.body.payment.amount), 30000);
    assert.equal(resa.body.payment.currency, 'TZS');
    assert.equal(resa.body.payment.status, 'pending');

    // Visible dans le tableau de bord équipe, avec le contexte du trajet.
    const enAttente = await request(app).get('/api/payments?status=pending').set(adminHeaders());
    const ligne = enAttente.body.find((p) => p.id === resa.body.payment.id);
    assert.ok(ligne, 'paiement absent du tableau équipe');
    assert.equal(ligne.ride_origin, 'Aéroport (AAKIA)');
    assert.equal(ligne.ride_destination, 'Nungwi');
    assert.equal(ligne.ride_seats, 2);
    assert.equal(ligne.ride_client_name, 'Juma Local');

    // L'équipe confirme (argent reçu) → la fiche chauffeur passe la place en payée.
    const confirme = await request(app)
      .post(`/api/payments/${resa.body.payment.id}/confirm`)
      .set(adminHeaders())
      .send({});
    assert.equal(confirme.status, 200);

    const mine = await request(app).get('/api/rides/mine').set(authHeaders(tokenChauffeur));
    assert.equal(mine.body[0].bookings[0].paid, true);
  });
});
