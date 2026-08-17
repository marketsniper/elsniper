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
  createTourist,
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
    assert.equal(Number(annonce.price_per_seat_usd), 16);
    const booking = annonce.bookings[0];
    assert.equal(booking.client_type, 'local');
    assert.equal(booking.currency, 'TZS');
    assert.equal(Number(booking.price_per_seat), 15000);
    // Commission partagé local 15 % : le chauffeur touche 85 %.
    assert.equal(Number(booking.net_per_seat), 12750);
  });

  it('téléphone équipe : l\'identité CLIENT prime sur la clé admin (touriste = USD)', async () => {
    // Le téléphone de l'équipe garde la clé X-Admin-Key enregistrée ET sert
    // à tester des comptes clients : un touriste connecté dessus doit voir
    // et payer en USD — jamais la grille locale en shillings.
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const { token: tokenTouriste } = await createTourist();

    const depart = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({ origin: 'Aéroport (AAKIA)', destination: 'Nungwi', departureAt: depart, seatsTotal: 4 });

    // Jeton touriste + clé équipe sur la même requête.
    const liste = await request(app)
      .get('/api/rides')
      .set(authHeaders(tokenTouriste))
      .set(adminHeaders());
    assert.equal(liste.body[0].currency, 'USD');
    assert.equal(Number(liste.body[0].price_per_seat_usd), 16);
    assert.equal(liste.body[0].price_per_seat, undefined);

    const resa = await request(app)
      .post(`/api/rides/${liste.body[0].id}/book`)
      .set(authHeaders(tokenTouriste))
      .set(adminHeaders())
      .send({ seats: 1 });
    assert.equal(resa.status, 201);
    assert.equal(resa.body.payment.currency, 'USD');
    assert.equal(Number(resa.body.payment.amount), 16);

    // « Mes places » du touriste : USD aussi, même avec la clé embarquée.
    const mesPlaces = await request(app)
      .get('/api/rides/reservations')
      .set(authHeaders(tokenTouriste))
      .set(adminHeaders());
    assert.equal(mesPlaces.body[0].currency, 'USD');
    assert.equal(Number(mesPlaces.body[0].amount), 16);
    // Le client sait quel taxi assure le trajet : plaque + modèle visibles.
    assert.ok(mesPlaces.body[0].vehicle_plate);
    assert.equal(mesPlaces.body[0].vehicle_model, 'Toyota Noah');
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

  it('trajet court (privé < 35 USD) : pas de taxi partagé du tout', async () => {
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const depart = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    // Paje → Jambiani : privé 12 USD → l'annonce partagée est refusée.
    const refus = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({ origin: 'Paje', destination: 'Jambiani', departureAt: depart, seatsTotal: 4 });
    assert.equal(refus.status, 422);
    assert.equal(refus.body.error.code, 'no_shared_route');
  });

  it('tarif local UNIQUEMENT sur les grands axes (privé ≥ 40 USD) — ailleurs, prix touriste en TZS', async () => {
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const depart = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    // Kiwengwa → Jambiani : privé 40 USD — juste au seuil, donc partagé
    // autorisé ET place locale à 15 000.
    const moyen = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({ origin: 'Kiwengwa', destination: 'Jambiani', departureAt: depart, seatsTotal: 4 });
    assert.equal(moyen.status, 201, JSON.stringify(moyen.body));
    assert.equal(Number(moyen.body.price_per_seat), 15000);
    // Sous le seuil (Pongwe → Paje, privé 25 USD) : pas de taxi partagé du
    // tout — la course privée est la seule option.
    const court = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({ origin: 'Pongwe', destination: 'Paje', departureAt: depart, seatsTotal: 4 });
    assert.equal(court.status, 422, JSON.stringify(court.body));
    // Grande traversée (Matemwe → Paje, privé 40 USD ≥ 40) :
    // le tarif local unifié reste valable.
    const grand = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({ origin: 'Matemwe', destination: 'Paje', departureAt: depart, seatsTotal: 4 });
    assert.equal(grand.status, 201);
    assert.equal(Number(grand.body.price_per_seat), 15000);
    // Les grands axes du NORD gardent leur place à 15 000 malgré la baisse
    // du transfert à 40 USD : c'est tout l'intérêt du seuil abaissé.
    const nord = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({ origin: 'Stone Town', destination: 'Nungwi', departureAt: depart, seatsTotal: 4 });
    assert.equal(nord.status, 201, JSON.stringify(nord.body));
    assert.equal(Number(nord.body.price_per_seat), 15000);
  });

  it('départ passé de +10 min : annonce automatiquement CLÔTURÉE (pas annulée), invisible, non réservable', async () => {
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

    // …et marquée CLÔTURÉE (le trajet a eu lieu — jamais « annulée » : la
    // règle des 10 minutes sanctionne les passagers en retard, pas le taxi).
    const mine = await request(app).get('/api/rides/mine').set(authHeaders(tokenChauffeur));
    const annonce = mine.body.find((r) => r.id === posted.body.id);
    assert.equal(annonce.status, 'closed');
  });

  it('départ passé de moins de 10 min : l\'annonce reste ouverte côté chauffeur', async () => {
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
    const { token: tokenChauffeur, driver } = await createVerifiedDriver();
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

    // Les compteurs de gains se mettent à jour AUTOMATIQUEMENT au paiement :
    // équipe (CA + net zanziGo) et chauffeur (net), sans attendre le départ.
    const statsEquipe = await request(app).get('/api/stats').set(adminHeaders());
    assert.equal(statsEquipe.body.revenue.today.places, 2);
    assert.equal(Number(statsEquipe.body.revenue.today.ca.TZS), 30000);
    // Commission 15 % sur le partagé local : 4 500 TZS pour zanziGo.
    assert.equal(Number(statsEquipe.body.revenue.today.gains.TZS), 4500);

    const statsChauffeur = await request(app)
      .get(`/api/drivers/${driver.id}/stats`)
      .set(authHeaders(tokenChauffeur));
    assert.equal(statsChauffeur.body.today.places, 2);
    // Net chauffeur : 85 % de 30 000 = 25 500 TZS.
    assert.equal(Number(statsChauffeur.body.today.gains.TZS), 25500);
  });
});

describe('Réservation impayée : annulation automatique après 5 minutes', () => {
  it('non payée à +6 min → annulée, places rendues au chauffeur, paiement failed', async () => {
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const { token: tokenLocal } = await createLocal();

    const depart = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const posted = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({ origin: 'Aéroport (AAKIA)', destination: 'Nungwi', departureAt: depart, seatsTotal: 6 });

    const resa = await request(app)
      .post(`/api/rides/${posted.body.id}/book`)
      .set(authHeaders(tokenLocal))
      .send({ seats: 2 });
    assert.equal(resa.status, 201);
    assert.equal(resa.body.seats_available, 4);

    // On vieillit la réservation de 6 minutes (le temps a passé, pas payé).
    await pool.query(
      `UPDATE ride_bookings SET created_at = now() - interval '6 minutes'
       WHERE ride_id = $1`,
      [posted.body.id]
    );

    // Le chauffeur recharge sa fiche : les 2 places sont revenues,
    // la réservation annulée a disparu.
    const mine = await request(app).get('/api/rides/mine').set(authHeaders(tokenChauffeur));
    const annonce = mine.body.find((r) => r.id === posted.body.id);
    assert.equal(annonce.seats_available, 6);
    assert.equal(annonce.bookings.length, 0);

    // Le paiement en attente est soldé en échec — plus rien à encaisser.
    const enAttente = await request(app).get('/api/payments?status=pending').set(adminHeaders());
    assert.equal(enAttente.body.find((p) => p.id === resa.body.payment.id), undefined);
    const echoues = await request(app).get('/api/payments?status=failed').set(adminHeaders());
    assert.ok(echoues.body.find((p) => p.id === resa.body.payment.id));
  });

  it('payée dans les temps → la réservation survit au balayage', async () => {
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const { token: tokenLocal } = await createLocal();

    const depart = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const posted = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({ origin: 'Aéroport (AAKIA)', destination: 'Paje', departureAt: depart, seatsTotal: 6 });

    const resa = await request(app)
      .post(`/api/rides/${posted.body.id}/book`)
      .set(authHeaders(tokenLocal))
      .send({ seats: 3 });
    await request(app)
      .post(`/api/payments/${resa.body.payment.id}/confirm`)
      .set(adminHeaders())
      .send({});

    // Même vieillie de 6 minutes, une réservation PAYÉE reste en place.
    await pool.query(
      `UPDATE ride_bookings SET created_at = now() - interval '6 minutes'
       WHERE ride_id = $1`,
      [posted.body.id]
    );
    const mine = await request(app).get('/api/rides/mine').set(authHeaders(tokenChauffeur));
    const annonce = mine.body.find((r) => r.id === posted.body.id);
    assert.equal(annonce.seats_available, 3);
    assert.equal(annonce.bookings.length, 1);
    assert.equal(annonce.bookings[0].paid, true);
  });
});
