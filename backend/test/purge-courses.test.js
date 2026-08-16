// FAIRE LE VIDE — suppression définitive de courses par l'équipe.
//
// Outil de phase pilote : la base se remplit de courses de test et de courses
// annulées, et le tableau de bord devient illisible. Ces tests fixent les
// garde-fous : réservé à l'équipe, filtrable par statut, et un effacement
// TOTAL doit être confirmé explicitement — on ne vide pas l'historique des
// gains par distraction.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  adminHeaders,
  app,
  authHeaders,
  createTourist,
  createVerifiedDriver,
  useTestDb,
} from './setup.js';

useTestDb();

async function creerCourse(token, userId) {
  const res = await request(app)
    .post('/api/trips')
    .set(authHeaders(token))
    .send({
      userId,
      tripType: 'private',
      pickupLocation: 'Stone Town',
      dropoffLocation: 'Nungwi',
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

const listerEquipe = async () => {
  const res = await request(app).get('/api/trips').set(adminHeaders());
  assert.equal(res.status, 200);
  return res.body;
};

describe('Faire le vide (purge des courses)', () => {
  it('efface uniquement les statuts demandés', async () => {
    const { token, user } = await createTourist();
    const aGarder = await creerCourse(token, user.id); // reste 'requested'
    const aEffacer = await creerCourse(token, user.id);
    await request(app)
      .post(`/api/trips/${aEffacer.id}/cancel`)
      .set(authHeaders(token))
      .send({});

    const purge = await request(app)
      .post('/api/trips/purge')
      .set(adminHeaders())
      .send({ statuses: ['cancelled'] });
    assert.equal(purge.status, 200, JSON.stringify(purge.body));
    assert.ok(purge.body.courses >= 1, 'aucune course effacée');

    const restantes = await listerEquipe();
    const ids = restantes.map((t) => t.id);
    assert.ok(!ids.includes(aEffacer.id), 'la course annulée aurait dû disparaître');
    assert.ok(ids.includes(aGarder.id), 'la course demandée devait être gardée');
    assert.ok(
      restantes.every((t) => t.status !== 'cancelled'),
      'plus aucune course annulée ne doit subsister'
    );
  });

  it('efface aussi le paiement rattaché (sinon la clé étrangère bloquerait)', async () => {
    const { token, user } = await createTourist();
    const { driver } = await createVerifiedDriver();
    const course = await creerCourse(token, user.id);
    await request(app)
      .patch(`/api/trips/${course.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: driver.id });
    const paiement = await request(app)
      .post(`/api/trips/${course.id}/payment`)
      .set(authHeaders(token));
    assert.equal(paiement.status, 201, JSON.stringify(paiement.body));

    const purge = await request(app)
      .post('/api/trips/purge')
      .set(adminHeaders())
      .send({ statuses: ['driver_confirmed'] });
    assert.equal(purge.status, 200, JSON.stringify(purge.body));
    assert.ok(purge.body.paiements >= 1, 'le paiement rattaché devait être effacé aussi');

    const restantes = await listerEquipe();
    assert.ok(!restantes.map((t) => t.id).includes(course.id));
  });

  it('tout effacer exige une confirmation explicite', async () => {
    const { token, user } = await createTourist();
    const course = await creerCourse(token, user.id);

    // Sans filtre NI confirmation : refusé, rien n'est touché.
    const sansRien = await request(app).post('/api/trips/purge').set(adminHeaders()).send({});
    assert.equal(sansRien.status, 400);
    assert.ok(
      (await listerEquipe()).map((t) => t.id).includes(course.id),
      'la course ne devait pas être effacée'
    );

    // Avec la formule exacte : tout part.
    const tout = await request(app)
      .post('/api/trips/purge')
      .set(adminHeaders())
      .send({ confirm: 'EFFACER TOUT' });
    assert.equal(tout.status, 200, JSON.stringify(tout.body));
    assert.equal(tout.body.statuts, 'tous');
    assert.deepEqual(await listerEquipe(), [], 'la base des courses devait être vidée');
  });

  it('réservé à l’équipe : un client ne peut rien effacer', async () => {
    const { token, user } = await createTourist();
    const course = await creerCourse(token, user.id);

    const parClient = await request(app)
      .post('/api/trips/purge')
      .set(authHeaders(token))
      .send({ statuses: ['requested'] });
    assert.equal(parClient.status, 401);

    const sansJeton = await request(app).post('/api/trips/purge').send({ statuses: ['requested'] });
    assert.equal(sansJeton.status, 401);

    assert.ok(
      (await listerEquipe()).map((t) => t.id).includes(course.id),
      'la course devait rester intacte'
    );
  });
});

describe('Faire le vide — taxis partagés', () => {
  it('efface aussi annonces, places et liste d’attente quand on le demande', async () => {
    const { token: chauffeurToken } = await createVerifiedDriver();
    const annonce = await request(app)
      .post('/api/rides')
      .set(authHeaders(chauffeurToken))
      .send({
        origin: 'Stone Town',
        destination: 'Nungwi',
        departureAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        seatsTotal: 4,
      });
    assert.equal(annonce.status, 201, JSON.stringify(annonce.body));

    const { token, user } = await createTourist();
    const place = await request(app)
      .post(`/api/rides/${annonce.body.id}/book`)
      .set(authHeaders(token))
      .send({ seats: 2 });
    assert.equal(place.status, 201, JSON.stringify(place.body));

    // Sans l'option, les partagés survivent à une purge des courses.
    await request(app)
      .post('/api/trips/purge')
      .set(adminHeaders())
      .send({ confirm: 'EFFACER TOUT' });
    const encoreLa = await request(app).get('/api/rides').set(adminHeaders());
    assert.ok(
      encoreLa.body.some((r) => r.id === annonce.body.id),
      'sans l’option, l’annonce doit rester'
    );

    // Avec l'option : tout part.
    const purge = await request(app)
      .post('/api/trips/purge')
      .set(adminHeaders())
      .send({ confirm: 'EFFACER TOUT', partages: true });
    assert.equal(purge.status, 200, JSON.stringify(purge.body));
    assert.ok(purge.body.annonces >= 1, 'annonce non effacée');
    assert.ok(purge.body.places >= 1, 'place non effacée');

    const apres = await request(app).get('/api/rides').set(adminHeaders());
    assert.deepEqual(apres.body, [], 'plus aucune annonce ne doit subsister');
  });
});
