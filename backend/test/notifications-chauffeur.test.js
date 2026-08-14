// Alertes chauffeur : chacun ne reçoit QUE ce qui le concerne.
//
// Le risque de cette fonctionnalité n'est pas qu'une alerte manque : c'est
// qu'un chauffeur reçoive les alertes internes de l'équipe (paiements,
// candidatures, comptes clients) ou celles d'un confrère. Ces tests
// verrouillent le cloisonnement à l'endroit exact où il est décidé : la
// liste des destinataires.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { adminHeaders, app, useTestDb } from './setup.js';
import { destinataires, enregistrerAbonnement } from '../src/services/pushService.js';

useTestDb();

const abonnement = (suffixe) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/chauffeur-${suffixe}`,
  keys: {
    p256dh:
      'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
});

/** Chauffeur vérifié + son jeton. */
async function creerChauffeur(nom, suffixe) {
  const phone = `+25577000${suffixe}`;
  const inscription = await request(app)
    .post('/api/auth/driver-register')
    .send({ phone, password: 'DerevaMdp1' });
  assert.equal(inscription.status, 201, JSON.stringify(inscription.body));
  const token = inscription.body.token;

  const profil = await request(app)
    .post('/api/drivers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      fullName: nom,
      phone,
      licenseNumber: `DL-${suffixe}`,
      vehiclePlate: `T${suffixe} ZGO`,
      vehicleModel: 'Toyota Noah',
      zone: 'Nungwi',
      licenseDocumentUrl: 'https://exemple.test/permis.png',
      insuranceDocumentUrl: 'https://exemple.test/assurance.png',
      vehiclePhotoUrl: 'https://exemple.test/voiture.png',
    });
  assert.equal(profil.status, 201, JSON.stringify(profil.body));
  await request(app)
    .patch(`/api/drivers/${profil.body.id}/verify`)
    .set(adminHeaders())
    .send({ status: 'verified' });
  return { id: profil.body.id, token, phone };
}

describe('Alertes chauffeur', () => {
  it('un chauffeur abonne SON téléphone avec SON jeton', async () => {
    const hamisi = await creerChauffeur('Hamisi Bakari', '111');
    const inscription = await request(app)
      .post('/api/notifications/chauffeur/abonner')
      .set('Authorization', `Bearer ${hamisi.token}`)
      .send({ ...abonnement('111'), label: 'Téléphone de Hamisi' });

    assert.equal(inscription.status, 201, JSON.stringify(inscription.body));
    assert.equal(inscription.body.role, 'chauffeur');
    assert.equal(inscription.body.driver_id, hamisi.id);
  });

  it('les alertes de l’équipe ne partent JAMAIS chez un chauffeur', async () => {
    const hamisi = await creerChauffeur('Hamisi Bakari', '222');
    await enregistrerAbonnement({
      endpoint: 'https://fcm.googleapis.com/fcm/send/equipe-1',
      p256dh: abonnement('e').keys.p256dh,
      auth: abonnement('e').keys.auth,
      label: 'Téléphone équipe',
    });
    await request(app)
      .post('/api/notifications/chauffeur/abonner')
      .set('Authorization', `Bearer ${hamisi.token}`)
      .send(abonnement('222'));

    const equipe = await destinataires({ role: 'equipe' });
    assert.equal(equipe.length, 1, 'un seul téléphone équipe');
    assert.equal(equipe[0].label, 'Téléphone équipe');
    assert.ok(
      equipe.every((d) => d.driver_id === null),
      'aucun téléphone de chauffeur dans les destinataires de l’équipe'
    );
  });

  it('l’alerte d’une course ne part qu’au chauffeur concerné', async () => {
    const hamisi = await creerChauffeur('Hamisi Bakari', '333');
    const juma = await creerChauffeur('Juma Ali', '444');
    for (const [chauffeur, suffixe] of [
      [hamisi, '333'],
      [juma, '444'],
    ]) {
      await request(app)
        .post('/api/notifications/chauffeur/abonner')
        .set('Authorization', `Bearer ${chauffeur.token}`)
        .send(abonnement(suffixe));
    }

    const pourHamisi = await destinataires({ role: 'chauffeur', driverId: hamisi.id });
    assert.equal(pourHamisi.length, 1);
    assert.equal(pourHamisi[0].driver_id, hamisi.id);

    const pourJuma = await destinataires({ role: 'chauffeur', driverId: juma.id });
    assert.equal(pourJuma.length, 1);
    assert.equal(pourJuma[0].driver_id, juma.id);
    assert.notEqual(pourJuma[0].endpoint, pourHamisi[0].endpoint);
  });

  it('un chauffeur ne peut pas faire taire le téléphone d’un autre', async () => {
    const hamisi = await creerChauffeur('Hamisi Bakari', '555');
    const juma = await creerChauffeur('Juma Ali', '666');
    await request(app)
      .post('/api/notifications/chauffeur/abonner')
      .set('Authorization', `Bearer ${hamisi.token}`)
      .send(abonnement('555'));

    const vol = await request(app)
      .post('/api/notifications/chauffeur/desabonner')
      .set('Authorization', `Bearer ${juma.token}`)
      .send({ endpoint: abonnement('555').endpoint });
    assert.equal(vol.status, 200);
    assert.equal(vol.body.retire, false, 'le retrait ne doit pas avoir eu lieu');

    // Le téléphone de Hamisi est toujours alerté.
    const encore = await destinataires({ role: 'chauffeur', driverId: hamisi.id });
    assert.equal(encore.length, 1);

    // Lui, en revanche, peut couper le sien.
    const sien = await request(app)
      .post('/api/notifications/chauffeur/desabonner')
      .set('Authorization', `Bearer ${hamisi.token}`)
      .send({ endpoint: abonnement('555').endpoint });
    assert.equal(sien.body.retire, true);
  });

  it('un client ordinaire n’a pas accès aux alertes chauffeur', async () => {
    const compte = await request(app)
      .post('/api/auth/register')
      .send({ username: 'cliente77', password: 'MonSecret1' });
    assert.equal(compte.status, 201, JSON.stringify(compte.body));

    for (const chemin of [
      '/api/notifications/chauffeur/abonner',
      '/api/notifications/chauffeur/desabonner',
      '/api/notifications/chauffeur/test',
    ]) {
      const refus = await request(app)
        .post(chemin)
        .set('Authorization', `Bearer ${compte.body.token}`)
        .send(abonnement('777'));
      assert.equal(refus.status, 403, `${chemin} devrait être fermé à un client`);
    }
  });

  it('sans jeton du tout, rien n’est accessible', async () => {
    for (const chemin of [
      '/api/notifications/chauffeur/abonner',
      '/api/notifications/chauffeur/desabonner',
      '/api/notifications/chauffeur/test',
    ]) {
      const refus = await request(app).post(chemin).send(abonnement('888'));
      assert.ok([401, 403].includes(refus.status), `${chemin} reçu ${refus.status}`);
    }
  });

  it('une course attribuée aboutit, même sans alerte configurée', async () => {
    // L'essentiel : la notification ne peut pas faire échouer l'assignation.
    const hamisi = await creerChauffeur('Hamisi Bakari', '999');
    const client = await request(app)
      .post('/api/auth/register')
      .send({ username: 'clientalerte', password: 'MonSecret1' });
    const profil = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${client.body.token}`)
      .send({ fullName: 'Mme Dupont', accountType: 'tourist' });
    const course = await request(app)
      .post('/api/trips')
      .set('Authorization', `Bearer ${client.body.token}`)
      .send({
        userId: profil.body.id,
        tripType: 'private',
        pickupLocation: 'Nungwi',
        dropoffLocation: 'Paje',
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });
    assert.equal(course.status, 201, JSON.stringify(course.body));

    const assignation = await request(app)
      .patch(`/api/trips/${course.body.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: hamisi.id });
    assert.equal(assignation.status, 200, JSON.stringify(assignation.body));
    assert.equal(assignation.body.status, 'driver_confirmed');
  });
});
