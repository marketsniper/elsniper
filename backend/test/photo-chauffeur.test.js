// LA PHOTO DU CHAUFFEUR, VUE PAR LE CLIENT.
//
// Le client voyait le nom, la plaque et le modèle : de quoi reconnaître la
// voiture, pas l'homme au volant. À l'aéroport, de nuit, entre dix taxis
// blancs, c'est le visage qui rassure.
//
// Ces tests verrouillent les trois règles qui comptent : le portrait part
// avec la course DÈS l'assignation (il sert avant de monter, pas après),
// seul le chauffeur concerné — ou l'équipe — peut le poser, et l'équipe
// garde le dernier mot en le retirant.
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { pool } from '../src/db.js';
import {
  adminHeaders,
  app,
  authHeaders,
  createTourist,
  createVerifiedDriver,
  useTestDb,
} from './setup.js';

useTestDb();

const PHOTO = 'https://zanzigo-api.onrender.com/uploads/portrait-test.jpg';

function espionnerAlertes() {
  const alertes = [];
  const original = console.log;
  mock.method(console, 'log', (...args) => {
    const ligne = args.join(' ');
    if (ligne.includes('[notif équipe stub]')) alertes.push(ligne);
    original.apply(console, args);
  });
  return alertes;
}

/** Une course demandée par un touriste, avec un chauffeur assigné. */
async function courseAvecChauffeur(driverId) {
  const { token, user } = await createTourist();
  const creation = await request(app)
    .post('/api/trips')
    .set(authHeaders(token))
    .send({
      clientName: 'Client Test',
      clientPhone: '+33600000000',
      tripType: 'private',
      pickupLocation: 'Nungwi',
      dropoffLocation: 'Stone Town',
      userId: user.id,
    });
  assert.equal(creation.status, 201, JSON.stringify(creation.body));
  const assignation = await request(app)
    .patch(`/api/trips/${creation.body.id}/assign-driver`)
    .set(adminHeaders())
    .send({ driverId });
  assert.equal(assignation.status, 200, JSON.stringify(assignation.body));
  return { token, tripId: creation.body.id };
}

describe('Photo du chauffeur', () => {
  it('le chauffeur pose son portrait, et l’équipe en est prévenue', async () => {
    const alertes = espionnerAlertes();
    const { token, driver } = await createVerifiedDriver();

    const res = await request(app)
      .patch(`/api/drivers/${driver.id}/photo`)
      .set(authHeaders(token))
      .send({ photoUrl: PHOTO });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.photo_url, PHOTO);
    assert.ok(res.body.photo_updated_at, 'la date de dépôt n’est pas posée');

    // C'est la seule image de l'app qu'un inconnu verra : l'équipe la relit.
    assert.ok(
      alertes.some((l) => l.includes('Photo de chauffeur')),
      `aucune alerte équipe (reçues : ${alertes.join(' | ') || 'aucune'})`
    );
  });

  it('le client la reçoit DÈS l’assignation, avant même d’avoir payé', async () => {
    espionnerAlertes();
    const { token: jetonChauffeur, driver } = await createVerifiedDriver();
    await request(app)
      .patch(`/api/drivers/${driver.id}/photo`)
      .set(authHeaders(jetonChauffeur))
      .send({ photoUrl: PHOTO });

    const { token, tripId } = await courseAvecChauffeur(driver.id);
    const course = await request(app).get(`/api/trips/${tripId}`).set(authHeaders(token));
    assert.equal(course.status, 200);
    assert.equal(course.body.driver_photo_url, PHOTO, 'le portrait ne parvient pas au client');
    // Le portrait sert AVANT de monter : le retenir jusqu'au paiement le
    // rendrait inutile. Le NUMÉRO, lui, reste caché — règle inchangée.
    assert.equal(course.body.driver_phone, null, 'le numéro fuite avant paiement');
  });

  it('sans photo, le client reçoit null — jamais une adresse cassée', async () => {
    espionnerAlertes();
    const { driver } = await createVerifiedDriver();
    const { token, tripId } = await courseAvecChauffeur(driver.id);
    const course = await request(app).get(`/api/trips/${tripId}`).set(authHeaders(token));
    assert.equal(course.body.driver_photo_url, null);
  });

  it('un chauffeur ne peut pas poser la photo d’un autre', async () => {
    espionnerAlertes();
    const { driver } = await createVerifiedDriver();
    const autre = await createVerifiedDriver();

    const res = await request(app)
      .patch(`/api/drivers/${driver.id}/photo`)
      .set(authHeaders(autre.token))
      .send({ photoUrl: PHOTO });
    assert.equal(res.status, 403);

    const { rows } = await pool.query('SELECT photo_url FROM drivers WHERE id = $1', [driver.id]);
    assert.equal(rows[0].photo_url, null);
  });

  it('l’équipe garde le dernier mot : elle peut retirer une photo', async () => {
    espionnerAlertes();
    const { token, driver } = await createVerifiedDriver();
    await request(app)
      .patch(`/api/drivers/${driver.id}/photo`)
      .set(authHeaders(token))
      .send({ photoUrl: PHOTO });

    const retrait = await request(app)
      .delete(`/api/drivers/${driver.id}/photo`)
      .set(adminHeaders());
    assert.equal(retrait.status, 200);
    assert.equal(retrait.body.photo_url, null);

    // …et le chauffeur ne peut pas se retirer lui-même de la modération.
    const parLeChauffeur = await request(app)
      .delete(`/api/drivers/${driver.id}/photo`)
      .set(authHeaders(token));
    assert.equal(parLeChauffeur.status, 401);
  });

  it('une adresse qui n’est pas une URL est refusée', async () => {
    espionnerAlertes();
    const { token, driver } = await createVerifiedDriver();
    const res = await request(app)
      .patch(`/api/drivers/${driver.id}/photo`)
      .set(authHeaders(token))
      .send({ photoUrl: 'pas-une-url' });
    assert.equal(res.status, 400);
  });
});
