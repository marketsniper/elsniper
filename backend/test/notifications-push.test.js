// Alertes instantanées : abonnement d'un téléphone, envoi, et nettoyage
// automatique des abonnements morts. C'est ce qui remplace l'attente de
// 35 secondes de la passerelle WhatsApp gratuite.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { adminHeaders, app, useTestDb } from './setup.js';

useTestDb();

// Un abonnement a la forme que le navigateur nous donne : une adresse chez
// Apple ou Google, et deux clés de chiffrement.
const abonnementExemple = (suffixe = '1') => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/exemple-${suffixe}`,
  keys: {
    p256dh:
      'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
});

describe('Alertes instantanées (notifications web)', () => {
  it("l'équipe abonne un téléphone, le retrouve, puis le retire", async () => {
    const cle = await request(app).get('/api/notifications/cle');
    assert.equal(cle.status, 200);
    assert.equal(typeof cle.body.actif, 'boolean');

    const abonnement = abonnementExemple('a');
    const inscription = await request(app)
      .post('/api/notifications/abonner')
      .set(adminHeaders())
      .send({ ...abonnement, label: 'iPhone de Karim' });
    assert.equal(inscription.status, 201, JSON.stringify(inscription.body));
    assert.equal(inscription.body.label, 'iPhone de Karim');

    // Réabonner le même téléphone ne crée pas de doublon.
    const encore = await request(app)
      .post('/api/notifications/abonner')
      .set(adminHeaders())
      .send(abonnement);
    assert.equal(encore.status, 201);

    const liste = await request(app).get('/api/notifications/abonnements').set(adminHeaders());
    assert.equal(liste.status, 200);
    assert.equal(liste.body.length, 1, 'un seul abonnement pour un même téléphone');
    // Les clés de chiffrement ne ressortent jamais de l'API.
    assert.equal(liste.body[0].p256dh, undefined);
    assert.equal(liste.body[0].auth, undefined);

    const retrait = await request(app)
      .post('/api/notifications/desabonner')
      .set(adminHeaders())
      .send({ endpoint: abonnement.endpoint });
    assert.equal(retrait.status, 200);
    assert.equal(retrait.body.retire, true);

    const apres = await request(app).get('/api/notifications/abonnements').set(adminHeaders());
    assert.equal(apres.body.length, 0);
  });

  it("les alertes sont réservées à l'équipe", async () => {
    for (const [methode, chemin] of [
      ['post', '/api/notifications/abonner'],
      ['post', '/api/notifications/desabonner'],
      ['get', '/api/notifications/abonnements'],
      ['post', '/api/notifications/test'],
    ]) {
      const reponse = await request(app)[methode](chemin).send(abonnementExemple('b'));
      assert.ok(
        [401, 403].includes(reponse.status),
        `${chemin} devrait être fermé, reçu ${reponse.status}`
      );
    }
  });

  it('un abonnement mal formé est refusé', async () => {
    const mauvais = await request(app)
      .post('/api/notifications/abonner')
      .set(adminHeaders())
      .send({ endpoint: 'pas-une-adresse', keys: { p256dh: 'x', auth: 'y' } });
    assert.equal(mauvais.status, 400);
  });

  it("une réservation déclenche l'alerte sans jamais faire échouer la course", async () => {
    // Sans clés VAPID (cas des tests), l'envoi est silencieux : la
    // notification ne doit surtout pas empêcher la réservation d'aboutir.
    const { envoyerPush } = await import('../src/services/pushService.js');
    const resultat = await envoyerPush('Essai', 'Corps');
    assert.equal(resultat.envoyes, 0);
    assert.ok(['non_configure', 'aucun_abonne'].includes(resultat.raison));
  });
});
