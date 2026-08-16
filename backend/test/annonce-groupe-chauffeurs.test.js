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
  it('est EN SWAHILI SEUL, courte, et donne trajet, heure et gain', async () => {
    const course = await courseAvecClient({ bulky: true });
    const vue = await request(app).get(`/api/trips/${course.id}`).set(adminHeaders());
    assert.equal(vue.status, 200);

    const annonce = vue.body.message_groupe_chauffeurs;
    assert.ok(annonce, 'annonce absente');
    assert.match(annonce, /SAFARI MPYA/, 'titre swahili absent');
    assert.match(annonce, /Nungwi ➡️ Paje/, 'trajet absent');
    assert.match(annonce, /🕒 (LEO|KESHO|\d{2}\/\d{2}) saa \d{2}:\d{2}/, 'jour et heure absents');
    assert.match(annonce, /💰 Unapata [\d,]+ TZS/, 'gain en shillings absent');
    assert.match(annonce, /🧳 Mizigo mikubwa/, 'gros bagages non signalés');
    assert.match(annonce, /Nani yupo\? Jibu hapa\./, 'appel à répondre absent');
    assert.match(annonce, /Namba: [0-9a-f]{8}/, 'référence courte absente');
    assert.ok(vue.body.lien_groupe_chauffeurs?.startsWith('https://wa.me/?text='), 'lien absent');

    // PLUS UN MOT D'ANGLAIS : c'était la moitié du message pour rien.
    for (const mot of ['Driver', 'Who is available', 'Large luggage', 'Ref:', 'Private ride']) {
      assert.ok(!annonce.includes(mot), `« ${mot} » ne doit plus figurer dans l'annonce`);
    }
    // Et elle reste courte : un coup d'œil au volant, pas un pavé.
    assert.ok(
      annonce.split('\n').length <= 12,
      `annonce trop longue (${annonce.split('\n').length} lignes)`
    );
  });

  it('course immédiate : l’urgence est dite en swahili', async () => {
    // Sans horaire choisi, le client attend maintenant : il faut que ça se voie.
    const compte = await request(app)
      .post('/api/auth/register')
      .send({ username: `sasa${Math.floor(Math.random() * 100000)}`, password: 'MonSecret1' });
    const profil = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${compte.body.token}`)
      .send({ fullName: 'Juma Ali', accountType: 'tourist' });
    const course = await request(app)
      .post('/api/trips')
      .set('Authorization', `Bearer ${compte.body.token}`)
      .send({
        userId: profil.body.id,
        tripType: 'private',
        pickupLocation: 'Nungwi',
        dropoffLocation: 'Paje',
      });
    assert.equal(course.status, 201, JSON.stringify(course.body));
    const vue = await request(app).get(`/api/trips/${course.body.id}`).set(adminHeaders());
    assert.match(vue.body.message_groupe_chauffeurs, /SASA HIVI — mteja anasubiri/);
  });

  it('ne laisse JAMAIS filtrer le nom ni le numéro du client', async () => {
    const course = await courseAvecClient();
    const vue = await request(app).get(`/api/trips/${course.id}`).set(adminHeaders());
    const annonce = vue.body.message_groupe_chauffeurs;
    assert.ok(!/Amina/i.test(annonce), 'le nom du client est dans l’annonce');
    assert.ok(!/255700111222/.test(annonce), 'le numéro du client est dans l’annonce');
  });

  it('annonce le gain NET en shillings, jamais le prix payé par le client', async () => {
    const course = await courseAvecClient();
    const vue = await request(app).get(`/api/trips/${course.id}`).set(adminHeaders());
    const annonce = vue.body.message_groupe_chauffeurs;

    const net = Number(course.price) - Number(course.commission);
    assert.ok(Number.isFinite(net) && net > 0, 'gain net incalculable');
    // La course est en USD ; le chauffeur, lui, raisonne en shillings.
    const netTzs = Math.round(net * 2600);
    assert.ok(
      annonce.includes(netTzs.toLocaleString('en-US')),
      `le gain net converti (${netTzs} TZS) devrait figurer dans l’annonce`
    );
    // Le prix payé par le client n'a rien à faire là : il révélerait la
    // commission zanziGo à tout le groupe.
    const prixTzs = Math.round(Number(course.price) * 2600);
    assert.ok(
      !annonce.includes(prixTzs.toLocaleString('en-US')),
      'le prix client ne doit pas figurer dans l’annonce'
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
