// LA SURCHARGE CARTE — les frais de la banque à la charge du payeur.
//
// Deux choses à protéger, et elles tirent dans des sens opposés : la marge de
// zanziGo (les frais bancaires étaient son premier poste de dépense) et la
// confiance du client (une surcharge découverte après coup vaut un avis
// négatif). D'où : elle s'applique, mais elle s'annonce.
//
// Et surtout : le PRIX DE LA COURSE ne bouge pas. La surcharge est une ligne
// à part — sinon la commission du chauffeur se calculerait dessus, ce qui
// reviendrait à lui faire payer les frais de la banque.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { config } from '../src/config.js';
import { montantAvecSurcharge, mentionSurcharge } from '../src/services/surchargeCarte.js';
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

async function coursePrete({ audience = 'tourist' } = {}) {
  const { token, user } =
    audience === 'local' ? await createLocal() : await createTourist();
  const { driver } = await createVerifiedDriver();
  const course = await request(app)
    .post('/api/trips')
    .set(authHeaders(token))
    .send({
      userId: user.id,
      tripType: 'private',
      pickupLocation: 'Stone Town',
      dropoffLocation: 'Nungwi',
    });
  assert.equal(course.status, 201, JSON.stringify(course.body));
  await request(app)
    .patch(`/api/trips/${course.body.id}/assign-driver`)
    .set(adminHeaders())
    .send({ driverId: driver.id });
  return { course: course.body, token };
}

describe('Surcharge carte : le calcul', () => {
  it('ajoute le taux au prix — et le taux d’équilibre n’est pas 3 %', () => {
    const { montant, surcharge, taux } = montantAvecSurcharge(47, 'USD');
    assert.equal(taux, config.surchargeCarte);
    assert.equal(surcharge, 1.88); // 47 × 4 %
    assert.equal(montant, 48.88);

    // LE PIÈGE : la banque prélève sur le montant DÉJÀ surchargé. À 3 % de
    // surcharge et 3,5 % de frais, il manquerait de l'argent — c'est
    // exactement pourquoi le taux retenu est 4 %.
    const fraisBanque = montant * 0.035;
    assert.ok(
      surcharge > fraisBanque,
      `la surcharge (${surcharge}) doit couvrir les frais réels (${fraisBanque.toFixed(2)})`
    );
  });

  it('ne touche JAMAIS un paiement en shillings (portefeuille mobile)', () => {
    const r = montantAvecSurcharge(122200, 'TZS');
    assert.equal(r.surcharge, 0);
    assert.equal(r.taux, 0);
    assert.equal(r.montant, 122200, 'le local paie le prix, point');
    assert.equal(mentionSurcharge(122200, 'TZS'), null, 'rien à annoncer');
  });

  it('s’annonce en toutes lettres', () => {
    assert.match(mentionSurcharge(47, 'USD'), /Frais bancaires carte 4 % : \+1\.88 USD/);
  });
});

describe('Surcharge carte : sur une vraie course', () => {
  it('le touriste règle prix + frais, et le voit avant de payer', async () => {
    const { course, token } = await coursePrete();
    const prix = Number(course.price);
    assert.equal(prix, 47, 'Stone Town → Nungwi après la hausse de 5 %');

    const paiement = await request(app)
      .post(`/api/trips/${course.id}/payment`)
      .set(authHeaders(token));
    assert.equal(paiement.status, 201, JSON.stringify(paiement.body));
    assert.equal(Number(paiement.body.prix_course), 47, 'le prix de la course est rappelé');
    assert.equal(Number(paiement.body.surcharge), 1.88);
    assert.equal(Number(paiement.body.amount), 48.88, 'ce qui est débité');
    assert.match(paiement.body.mention_surcharge, /Frais bancaires carte/);
    // Le message envoyé à l'équipe porte le même montant : pas deux vérités.
    assert.ok(decodeURIComponent(paiement.body.payment_link).includes('48.88'));
  });

  it('la COMMISSION et le gain du chauffeur ignorent la surcharge', async () => {
    const { course, token } = await coursePrete();
    await request(app).post(`/api/trips/${course.id}/payment`).set(authHeaders(token));

    const vue = await request(app).get(`/api/trips/${course.id}`).set(adminHeaders());
    assert.equal(Number(vue.body.price), 47, 'le prix de la course n’a pas bougé');
    assert.equal(Number(vue.body.commission), 4.7, '10 % de 47, pas de 48,88');
    // Le chauffeur touche 42,30 : la banque ne se sert pas dans sa poche.
    assert.equal(Number(vue.body.price) - Number(vue.body.commission), 42.3);
  });

  it('un LOCAL qui paie en shillings n’a aucune surcharge', async () => {
    const { course, token } = await coursePrete({ audience: 'local' });
    assert.equal(course.currency, 'TZS');

    const paiement = await request(app)
      .post(`/api/trips/${course.id}/payment`)
      .set(authHeaders(token));
    assert.equal(paiement.status, 201, JSON.stringify(paiement.body));
    assert.equal(Number(paiement.body.surcharge), 0);
    assert.equal(Number(paiement.body.amount), Number(course.price), 'le prix, sans un shilling de plus');
    assert.equal(paiement.body.mention_surcharge, null);
  });
});
