// Point de rendez-vous exact : le client le partage, le chauffeur le voit.
//
// « Nungwi » ne dit pas devant quelle porte attendre. Le client peut donc
// poser sa position exacte sur SA course — et seulement la sienne.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { adminHeaders, app, useTestDb } from './setup.js';

useTestDb();

// Nungwi, pointe nord.
const POINT = { lat: -5.7261, lng: 39.2971 };

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
  // Jeton porteur du driverId : c'est celui de l'espace chauffeur.
  const connexion = await request(app)
    .post('/api/auth/driver-login')
    .send({ phone, password: 'DerevaMdp1' });
  return { id: profil.body.id, jeton: connexion.body.token };
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

describe('Point de rendez-vous exact', () => {
  it('le client partage sa position, le chauffeur assigné la voit', async () => {
    const client = await compte('cliente');
    const taxi = await chauffeurVerifie();
    const trajet = await course(client);
    await request(app)
      .patch(`/api/trips/${trajet.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: taxi.id });

    const partage = await request(app)
      .patch(`/api/trips/${trajet.id}/pickup-position`)
      .set('Authorization', `Bearer ${client.jeton}`)
      .send(POINT);
    assert.equal(partage.status, 200, JSON.stringify(partage.body));
    assert.equal(Number(partage.body.pickup_lat), POINT.lat);
    assert.equal(Number(partage.body.pickup_lng), POINT.lng);
    assert.ok(partage.body.pickup_position_at, "l'heure du partage n'est pas enregistrée");

    // Le chauffeur assigné lit la course : le point y est.
    const vue = await request(app)
      .get(`/api/trips/${trajet.id}`)
      .set('Authorization', `Bearer ${taxi.jeton}`);
    assert.equal(vue.status, 200, JSON.stringify(vue.body));
    assert.equal(Number(vue.body.pickup_lat), POINT.lat);
    assert.equal(Number(vue.body.pickup_lng), POINT.lng);
  });

  it('un inconnu ne peut pas poser un point sur la course d’un autre', async () => {
    const client = await compte('cliente');
    const intrus = await compte('intrus');
    const trajet = await course(client);

    const vol = await request(app)
      .patch(`/api/trips/${trajet.id}/pickup-position`)
      .set('Authorization', `Bearer ${intrus.jeton}`)
      .send(POINT);
    assert.equal(vol.status, 403, JSON.stringify(vol.body));
  });

  it('une course terminée ou annulée n’accepte plus de point', async () => {
    const client = await compte('cliente');
    const trajet = await course(client);
    const annulation = await request(app)
      .post(`/api/trips/${trajet.id}/cancel`)
      .set('Authorization', `Bearer ${client.jeton}`)
      .send({});
    assert.equal(annulation.status, 200, JSON.stringify(annulation.body));

    const tard = await request(app)
      .patch(`/api/trips/${trajet.id}/pickup-position`)
      .set('Authorization', `Bearer ${client.jeton}`)
      .send(POINT);
    assert.equal(tard.status, 409, JSON.stringify(tard.body));
  });

  it('des coordonnées impossibles sont refusées', async () => {
    const client = await compte('cliente');
    const trajet = await course(client);
    const mauvais = await request(app)
      .patch(`/api/trips/${trajet.id}/pickup-position`)
      .set('Authorization', `Bearer ${client.jeton}`)
      .send({ lat: 120, lng: 39 });
    assert.equal(mauvais.status, 400);
  });

  it('le point peut être corrigé : le client s’est déplacé', async () => {
    const client = await compte('cliente');
    const trajet = await course(client);
    await request(app)
      .patch(`/api/trips/${trajet.id}/pickup-position`)
      .set('Authorization', `Bearer ${client.jeton}`)
      .send(POINT);
    const ailleurs = { lat: -6.1659, lng: 39.2026 }; // Stone Town
    const maj = await request(app)
      .patch(`/api/trips/${trajet.id}/pickup-position`)
      .set('Authorization', `Bearer ${client.jeton}`)
      .send(ailleurs);
    assert.equal(maj.status, 200);
    assert.equal(Number(maj.body.pickup_lat), ailleurs.lat);
  });
});
