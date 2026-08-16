// BOURSE AUX COURSES — le chauffeur se sert lui-même, l'équipe garde la main.
//
// Deux voies mènent une course à un chauffeur :
//   1. le chauffeur la prend depuis son app (premier arrivé, premier servi) ;
//   2. l'équipe l'assigne depuis son tableau de bord — y compris pour REPRENDRE
//      une course déjà prise (le chauffeur ne répond plus).
// Ces tests fixent les deux, plus la règle de vie privée : avant de prendre la
// course, le chauffeur ne voit ni le nom ni le téléphone du client.
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

async function creerCourse(token, userId, extra = {}) {
  const res = await request(app)
    .post('/api/trips')
    .set(authHeaders(token))
    .send({
      userId,
      tripType: 'private',
      pickupLocation: 'Stone Town',
      dropoffLocation: 'Nungwi',
      ...extra,
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

const disponibles = (token) =>
  request(app).get('/api/trips/disponibles').set(authHeaders(token));

describe('Bourse aux courses', () => {
  it('un chauffeur vérifié voit les courses libres — sans identité du client', async () => {
    const { token: clientToken, user } = await createTourist({ fullName: 'Amina Hassan' });
    const course = await creerCourse(clientToken, user.id, { flightNumber: 'TK123' });
    const { token: driverToken } = await createVerifiedDriver();

    const res = await disponibles(driverToken);
    assert.equal(res.status, 200);
    const vue = res.body.find((c) => c.id === course.id);
    assert.ok(vue, 'la course libre doit apparaître dans la bourse');

    // Ce que le chauffeur DOIT voir pour décider.
    assert.equal(vue.pickup_location, 'Stone Town');
    assert.equal(vue.dropoff_location, 'Nungwi');
    assert.equal(Number(vue.price), 45);
    assert.equal(Number(vue.net_chauffeur), 40.5, 'son gain net, commission déduite');
    assert.equal(vue.flight_number, 'TK123');

    // Ce qu'il ne doit PAS voir avant d'avoir pris la course.
    assert.equal(vue.client_name, undefined, 'le nom du client ne doit pas fuiter');
    assert.equal(vue.client_phone, undefined, 'le téléphone ne doit pas fuiter');
    assert.equal(vue.whatsapp_link, undefined);
    assert.equal(vue.pickup_lat, undefined, 'la position exacte ne doit pas fuiter');
  });

  it('un chauffeur NON vérifié ne prend rien ; un client n’accède pas à la bourse', async () => {
    const { token: clientToken, user } = await createTourist();
    const course = await creerCourse(clientToken, user.id);

    const { token: enAttente } = await createDriverApplication();
    const prise = await request(app)
      .post(`/api/trips/${course.id}/claim`)
      .set(authHeaders(enAttente));
    assert.equal(prise.status, 403);
    assert.equal(prise.body.error.code, 'driver_not_verified');

    const parClient = await disponibles(clientToken);
    assert.equal(parClient.status, 403, 'un client ne voit pas la bourse aux courses');
  });

  it('« Je prends cette course » : la course est à lui et quitte la bourse', async () => {
    const { token: clientToken, user } = await createTourist();
    const course = await creerCourse(clientToken, user.id);
    const { token: driverToken, driver } = await createVerifiedDriver();

    const prise = await request(app)
      .post(`/api/trips/${course.id}/claim`)
      .set(authHeaders(driverToken));
    assert.equal(prise.status, 200, JSON.stringify(prise.body));
    assert.equal(prise.body.driver_id, driver.id);
    assert.equal(prise.body.status, 'driver_confirmed');

    const apres = await disponibles(driverToken);
    assert.ok(
      !apres.body.some((c) => c.id === course.id),
      'une course prise disparaît de la bourse'
    );
  });

  it('deux chauffeurs, une course : le second reçoit un refus clair', async () => {
    const { token: clientToken, user } = await createTourist();
    const course = await creerCourse(clientToken, user.id);
    const { token: premier } = await createVerifiedDriver();
    const { token: second } = await createVerifiedDriver({ fullName: 'Autre Chauffeur' });

    const a = await request(app).post(`/api/trips/${course.id}/claim`).set(authHeaders(premier));
    assert.equal(a.status, 200);

    const b = await request(app).post(`/api/trips/${course.id}/claim`).set(authHeaders(second));
    assert.equal(b.status, 409);
    assert.equal(b.body.error.code, 'course_deja_prise');
    assert.match(b.body.error.message, /Trop tard/);
  });

  it('L’ÉQUIPE GARDE LA MAIN : elle assigne si personne ne prend…', async () => {
    const { token: clientToken, user } = await createTourist();
    const course = await creerCourse(clientToken, user.id);
    const { driver } = await createVerifiedDriver();

    const assignation = await request(app)
      .patch(`/api/trips/${course.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: driver.id });
    assert.equal(assignation.status, 200, JSON.stringify(assignation.body));
    assert.equal(assignation.body.driver_id, driver.id);
    assert.equal(assignation.body.status, 'driver_confirmed');
  });

  it('…et elle REPREND une course déjà prise si le chauffeur ne répond plus', async () => {
    const { token: clientToken, user } = await createTourist();
    const course = await creerCourse(clientToken, user.id);
    const { token: premierToken, driver: premier } = await createVerifiedDriver();
    const { driver: remplacant } = await createVerifiedDriver({ fullName: 'Chauffeur Remplaçant' });

    // Le premier prend la course…
    const prise = await request(app)
      .post(`/api/trips/${course.id}/claim`)
      .set(authHeaders(premierToken));
    assert.equal(prise.status, 200);
    assert.equal(prise.body.driver_id, premier.id);

    // …mais il est injoignable : l'équipe la confie à un autre.
    const reprise = await request(app)
      .patch(`/api/trips/${course.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: remplacant.id });
    assert.equal(reprise.status, 200, JSON.stringify(reprise.body));
    assert.equal(reprise.body.driver_id, remplacant.id, "l'équipe a bien repris la main");
    assert.equal(reprise.body.status, 'driver_confirmed');
  });

  it('une course payée n’est plus réattribuable (de l’argent est en jeu)', async () => {
    const { token: clientToken, user } = await createTourist();
    const course = await creerCourse(clientToken, user.id);
    const { token: driverToken } = await createVerifiedDriver();
    const { driver: autre } = await createVerifiedDriver({ fullName: 'Troisième Chauffeur' });

    await request(app).post(`/api/trips/${course.id}/claim`).set(authHeaders(driverToken));

    const paiement = await request(app)
      .post(`/api/trips/${course.id}/payment`)
      .set(authHeaders(clientToken));
    assert.equal(paiement.status, 201, JSON.stringify(paiement.body));
    await request(app)
      .post(`/api/payments/${paiement.body.id}/confirm`)
      .set(authHeaders(clientToken));

    const tropTard = await request(app)
      .patch(`/api/trips/${course.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: autre.id });
    assert.equal(tropTard.status, 409);
    assert.equal(tropTard.body.error.code, 'invalid_status');
  });

  it('les taxis partagés ne sont pas dans la bourse (ils ont la leur)', async () => {
    const { token: clientToken, user } = await createTourist();
    const partage = await request(app)
      .post('/api/trips')
      .set(authHeaders(clientToken))
      .send({
        userId: user.id,
        tripType: 'shared_tourist',
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Nungwi',
      });
    assert.equal(partage.status, 201, JSON.stringify(partage.body));

    const { token: driverToken } = await createVerifiedDriver();
    const res = await disponibles(driverToken);
    assert.ok(
      !res.body.some((c) => c.id === partage.body.id),
      'une course partagée ne doit pas apparaître dans la bourse aux courses privées'
    );
  });
});
