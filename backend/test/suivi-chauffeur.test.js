// « Où en est mon taxi ? » — le client suit l'approche de son chauffeur.
//
// Le suivi est un privilège du réservateur, borné dans le temps : il s'ouvre
// quand un chauffeur est confirmé et se ferme avec la course. On ne rend que
// la dernière position connue — jamais le téléphone du chauffeur, jamais son
// historique de déplacements.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { adminHeaders, app, useTestDb } from './setup.js';

useTestDb();

// Le taxi roule vers Nungwi.
const TAXI = { lat: -5.7305, lng: 39.3012 };

async function compte(prefixe) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ username: `${prefixe}${Math.floor(Math.random() * 1000000)}`, password: 'MonSecret1' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const profil = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${res.body.token}`)
    .send({ fullName: 'Amina Hassan', accountType: 'tourist' });
  return { jeton: res.body.token, userId: profil.body.id };
}

async function chauffeurVerifie() {
  const phone = `+25579${Math.floor(Math.random() * 1000000)}`;
  const insc = await request(app).post('/api/auth/driver-register').send({ phone, password: 'DerevaMdp1' });
  const profil = await request(app)
    .post('/api/drivers')
    .set('Authorization', `Bearer ${insc.body.token}`)
    .send({
      fullName: 'Hamisi Bakari',
      phone,
      licenseNumber: `DL-${Math.floor(Math.random() * 100000)}`,
      vehiclePlate: `T${Math.floor(Math.random() * 900 + 100)} ZGO`,
      zone: 'Nungwi',
      licenseDocumentUrl: 'https://exemple.test/a.png',
      insuranceDocumentUrl: 'https://exemple.test/b.png',
      vehiclePhotoUrl: 'https://exemple.test/c.png',
    });
  await request(app)
    .patch(`/api/drivers/${profil.body.id}/verify`)
    .set(adminHeaders())
    .send({ status: 'verified' });
  const connexion = await request(app)
    .post('/api/auth/driver-login')
    .send({ phone, password: 'DerevaMdp1' });
  return { id: profil.body.id, jeton: connexion.body.token, plaque: profil.body.vehicle_plate };
}

async function course(client) {
  const res = await request(app)
    .post('/api/trips')
    .set('Authorization', `Bearer ${client.jeton}`)
    .send({
      userId: client.userId,
      tripType: 'private',
      pickupLocation: 'Nungwi',
      dropoffLocation: 'Paje',
      scheduledAt: new Date(Date.now() + 7200000).toISOString(),
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

describe('Suivi du taxi par le client', () => {
  it('le réservateur voit son chauffeur avancer', async () => {
    const client = await compte('cliente');
    const taxi = await chauffeurVerifie();
    const trajet = await course(client);
    await request(app)
      .patch(`/api/trips/${trajet.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: taxi.id });
    await request(app)
      .patch(`/api/drivers/${taxi.id}/location`)
      .set('Authorization', `Bearer ${taxi.jeton}`)
      .send(TAXI);

    const vue = await request(app)
      .get(`/api/trips/${trajet.id}/driver-position`)
      .set('Authorization', `Bearer ${client.jeton}`);
    assert.equal(vue.status, 200, JSON.stringify(vue.body));
    assert.equal(Number(vue.body.lat), TAXI.lat);
    assert.equal(Number(vue.body.lng), TAXI.lng);
    assert.equal(vue.body.driver_name, 'Hamisi Bakari');
    assert.ok(vue.body.updated_at, "l'heure du relevé manque");
    // Le client n'a rien à faire du téléphone du chauffeur.
    assert.equal(vue.body.phone, undefined);
    assert.equal(vue.body.driver_id, undefined);
  });

  it('le point suit le taxi qui roule', async () => {
    const client = await compte('cliente');
    const taxi = await chauffeurVerifie();
    const trajet = await course(client);
    await request(app)
      .patch(`/api/trips/${trajet.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: taxi.id });
    await request(app)
      .patch(`/api/drivers/${taxi.id}/location`)
      .set('Authorization', `Bearer ${taxi.jeton}`)
      .send(TAXI);
    const plusPres = { lat: -5.7271, lng: 39.2985 };
    await request(app)
      .patch(`/api/drivers/${taxi.id}/location`)
      .set('Authorization', `Bearer ${taxi.jeton}`)
      .send(plusPres);

    const vue = await request(app)
      .get(`/api/trips/${trajet.id}/driver-position`)
      .set('Authorization', `Bearer ${client.jeton}`);
    assert.equal(Number(vue.body.lat), plusPres.lat);
  });

  it('un chauffeur confirmé mais pas encore repéré : on le dit', async () => {
    const client = await compte('cliente');
    const taxi = await chauffeurVerifie();
    const trajet = await course(client);
    await request(app)
      .patch(`/api/trips/${trajet.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: taxi.id });

    const vue = await request(app)
      .get(`/api/trips/${trajet.id}/driver-position`)
      .set('Authorization', `Bearer ${client.jeton}`);
    assert.equal(vue.status, 200, JSON.stringify(vue.body));
    assert.equal(vue.body.lat, null);
    assert.equal(vue.body.driver_name, 'Hamisi Bakari');
  });

  it('pas de chauffeur confirmé : rien à suivre', async () => {
    const client = await compte('cliente');
    const trajet = await course(client);
    const vue = await request(app)
      .get(`/api/trips/${trajet.id}/driver-position`)
      .set('Authorization', `Bearer ${client.jeton}`);
    assert.equal(vue.status, 409, JSON.stringify(vue.body));
    assert.equal(vue.body.error.code, 'no_driver');
  });

  it('un inconnu ne peut pas suivre le taxi de quelqu’un d’autre', async () => {
    const client = await compte('cliente');
    const intrus = await compte('intrus');
    const taxi = await chauffeurVerifie();
    const trajet = await course(client);
    await request(app)
      .patch(`/api/trips/${trajet.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: taxi.id });
    await request(app)
      .patch(`/api/drivers/${taxi.id}/location`)
      .set('Authorization', `Bearer ${taxi.jeton}`)
      .send(TAXI);

    const vol = await request(app)
      .get(`/api/trips/${trajet.id}/driver-position`)
      .set('Authorization', `Bearer ${intrus.jeton}`);
    assert.equal(vol.status, 403, JSON.stringify(vol.body));
  });

  it('course annulée : le suivi se ferme, on ne piste plus personne', async () => {
    const client = await compte('cliente');
    const taxi = await chauffeurVerifie();
    const trajet = await course(client);
    await request(app)
      .patch(`/api/trips/${trajet.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: taxi.id });
    await request(app)
      .patch(`/api/drivers/${taxi.id}/location`)
      .set('Authorization', `Bearer ${taxi.jeton}`)
      .send(TAXI);
    await request(app)
      .post(`/api/trips/${trajet.id}/cancel`)
      .set('Authorization', `Bearer ${client.jeton}`)
      .send({});

    const apres = await request(app)
      .get(`/api/trips/${trajet.id}/driver-position`)
      .set('Authorization', `Bearer ${client.jeton}`);
    assert.equal(apres.status, 409, JSON.stringify(apres.body));
  });
});
