// Annonce prête à coller dans le groupe WhatsApp des chauffeurs.
//
// Deux exigences opposées : elle doit contenir de quoi décider (trajet, heure,
// gain net) et SURTOUT PAS ce qui appartient au client — ni son nom, ni son
// numéro. Le groupe compte des dizaines de chauffeurs ; seul celui qui est
// retenu reçoit les coordonnées.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { adminHeaders, app, useTestDb } from './setup.js';

useTestDb();

async function courseAvecClient({ tripType = 'private', bulky = false } = {}) {
  const compte = await request(app)
    .post('/api/auth/register')
    .send({ username: `client${Math.floor(Math.random() * 100000)}`, password: 'MonSecret1' });
  const profil = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${compte.body.token}`)
    .send({ fullName: 'Amina Hassan', accountType: 'tourist', phone: '+255700111222' });
  const course = await request(app)
    .post('/api/trips')
    .set('Authorization', `Bearer ${compte.body.token}`)
    .send({
      userId: profil.body.id,
      tripType,
      pickupLocation: 'Nungwi',
      dropoffLocation: 'Paje',
      scheduledAt: new Date(Date.now() + 7200000).toISOString(),
      bulkyLuggage: bulky,
    });
  assert.equal(course.status, 201, JSON.stringify(course.body));
  return course.body;
}

describe('Annonce pour le groupe des chauffeurs', () => {
  it('donne le trajet, l’heure et le gain net, en anglais et en swahili', async () => {
    const course = await courseAvecClient({ bulky: true });
    const vue = await request(app).get(`/api/trips/${course.id}`).set(adminHeaders());
    assert.equal(vue.status, 200);

    const annonce = vue.body.message_groupe_chauffeurs;
    assert.ok(annonce, 'annonce absente');
    assert.match(annonce, /Nungwi → Paje/, 'trajet absent');
    assert.match(annonce, /Driver \/ Dereva/, 'gain du chauffeur absent');
    assert.match(annonce, /Who is available/, 'appel en anglais absent');
    assert.match(annonce, /Nani yupo/, 'appel en swahili absent');
    assert.match(annonce, /Large luggage \/ Mizigo mikubwa/, 'gros bagages non signalés');
    assert.match(annonce, /Ref: [0-9a-f]{8}/, 'référence courte absente');
    assert.ok(vue.body.lien_groupe_chauffeurs?.startsWith('https://wa.me/?text='), 'lien absent');
  });

  it('ne laisse JAMAIS filtrer le nom ni le numéro du client', async () => {
    const course = await courseAvecClient();
    const vue = await request(app).get(`/api/trips/${course.id}`).set(adminHeaders());
    const annonce = vue.body.message_groupe_chauffeurs;
    assert.ok(!/Amina/i.test(annonce), 'le nom du client est dans l’annonce');
    assert.ok(!/255700111222/.test(annonce), 'le numéro du client est dans l’annonce');
  });

  it('annonce le gain NET, jamais le prix payé par le client', async () => {
    const course = await courseAvecClient();
    const vue = await request(app).get(`/api/trips/${course.id}`).set(adminHeaders());
    const annonce = vue.body.message_groupe_chauffeurs;

    const net = Math.round((Number(course.price) - Number(course.commission)) * 100) / 100;
    assert.ok(Number.isFinite(net) && net > 0, 'gain net incalculable');
    assert.ok(
      annonce.includes(String(net)) || annonce.includes(net.toLocaleString('en-US')),
      `le gain net (${net}) devrait figurer dans l’annonce`
    );
  });

  it('réservée à l’équipe : un client ne voit pas l’annonce', async () => {
    const compte = await request(app)
      .post('/api/auth/register')
      .send({ username: `cliente${Math.floor(Math.random() * 100000)}`, password: 'MonSecret1' });
    const profil = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${compte.body.token}`)
      .send({ fullName: 'Mme Dupont', accountType: 'tourist' });
    const course = await request(app)
      .post('/api/trips')
      .set('Authorization', `Bearer ${compte.body.token}`)
      .send({
        userId: profil.body.id,
        tripType: 'private',
        pickupLocation: 'Nungwi',
        dropoffLocation: 'Paje',
        scheduledAt: new Date(Date.now() + 7200000).toISOString(),
      });

    const vue = await request(app)
      .get(`/api/trips/${course.body.id}`)
      .set('Authorization', `Bearer ${compte.body.token}`);
    assert.equal(vue.status, 200);
    assert.equal(vue.body.message_groupe_chauffeurs, undefined);
    assert.equal(vue.body.lien_groupe_chauffeurs, undefined);
  });

  it('les taxis partagés n’ont pas d’annonce : ils se remplissent par la bourse', async () => {
    const course = await courseAvecClient({ tripType: 'shared_tourist' });
    const vue = await request(app).get(`/api/trips/${course.id}`).set(adminHeaders());
    assert.equal(vue.body.message_groupe_chauffeurs, undefined);
  });
});
