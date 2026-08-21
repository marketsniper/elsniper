// LA REMISE DE PARRAINAGE AUTOMATIQUE — le parcours entier, sans un geste.
//
// La règle : quand le filleul termine sa 2e course, 5 $ de crédit sont posés
// AUTOMATIQUEMENT sur son compte et sur celui de son parrain. Ce crédit se
// déduit tout seul du paiement de leur prochaine course — 5 USD sur une
// course en dollars, 13 000 TZS (le taux de la grille) pour un local.
//
// Trois lignes rouges à ne jamais franchir :
//  1. le PRIX de la course ne bouge pas, la COMMISSION du chauffeur non plus
//     — la remise sort de la marge zanziGo, pas de la poche du chauffeur ;
//  2. le crédit n'est consommé qu'à la CONFIRMATION du paiement — un lien
//     abandonné ne coûte rien ;
//  3. une course annulée REND le crédit (la remise n'est pas de l'argent
//     versé : elle se rend, elle ne se rembourse pas).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  adminHeaders,
  app,
  authHeaders,
  authenticate,
  createTourist,
  createVerifiedDriver,
  nextPhone,
  useTestDb,
} from './setup.js';

useTestDb();

// Un filleul inscrit avec le code de son parrain.
async function creerFilleul(parrain) {
  const phone = nextPhone();
  const { token } = await authenticate(phone);
  const res = await request(app)
    .post('/api/users')
    .set(authHeaders(token))
    .send({
      fullName: 'Filleul Test',
      phone,
      accountType: 'tourist',
      referralCode: parrain.referral_code,
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { token, user: res.body };
}

// Une course de bout en bout : création → chauffeur → paiement confirmé →
// démarrée → TERMINÉE (c'est la clôture qui déclenche le parrainage).
async function courseTerminee(token, user) {
  const { token: tokenChauffeur, driver } = await createVerifiedDriver();
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
  const paiement = await request(app)
    .post(`/api/trips/${course.body.id}/payment`)
    .set(authHeaders(token))
    .send({ method: 'mobile' });
  assert.equal(paiement.status, 201, JSON.stringify(paiement.body));
  await request(app).post(`/api/payments/${paiement.body.id}/confirm`).set(authHeaders(token));
  await request(app)
    .patch(`/api/trips/${course.body.id}/start`)
    .set(authHeaders(tokenChauffeur));
  const fin = await request(app)
    .patch(`/api/trips/${course.body.id}/complete`)
    .set(authHeaders(tokenChauffeur));
  assert.equal(fin.status, 200, JSON.stringify(fin.body));
  return { course: course.body, paiement: paiement.body };
}

const creditDe = async (userId) => {
  const res = await request(app).get(`/api/users/${userId}`).set(adminHeaders());
  return Number(res.body.credit_parrainage_usd ?? 0);
};

describe('Parrainage : le crédit se pose et se déduit tout seul', () => {
  it('2e course TERMINÉE → 5 $ chacun ; 3e course → remise déduite, commission intacte', async () => {
    const { user: parrain, token: tokenParrain } = await createTourist({
      fullName: 'Philippe Parrain',
    });
    const { token, user: filleul } = await creerFilleul(parrain);

    // Une seule course terminée : rien — c'est la 2e qui déclenche.
    await courseTerminee(token, filleul);
    assert.equal(await creditDe(filleul.id), 0, 'une course ne suffit pas');

    await courseTerminee(token, filleul);
    assert.equal(await creditDe(filleul.id), 5, 'le filleul est crédité');
    assert.equal(await creditDe(parrain.id), 5, 'le parrain aussi, sans rien faire');

    // Le filleul VOIT son crédit sur son propre profil — il n'a pas à nous
    // croire sur parole (c'est la carte 🎁 de l'écran Profil).
    const monProfil = await request(app)
      .get(`/api/users/${filleul.id}`)
      .set(authHeaders(token));
    assert.equal(Number(monProfil.body.credit_parrainage_usd), 5);

    // 3e course du filleul : l'écran annonce la remise AVANT le paiement…
    const { token: tokenChauffeur3, driver: chauffeur3 } = await createVerifiedDriver();
    const troisieme = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: filleul.id,
        tripType: 'private',
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Nungwi',
      });
    await request(app)
      .patch(`/api/trips/${troisieme.body.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: chauffeur3.id });
    const fiche = await request(app)
      .get(`/api/trips/${troisieme.body.id}`)
      .set(authHeaders(token));
    assert.equal(Number(fiche.body.remise_parrainage_disponible_usd), 5);

    // …et le paiement la déduit : 47 − 5 = 42 USD → carte 43,68 (4 % sur la
    // base remisée), remise figée sur la ligne.
    const paiement = await request(app)
      .post(`/api/trips/${troisieme.body.id}/payment`)
      .set(authHeaders(token))
      .send({ method: 'carte' });
    assert.equal(paiement.status, 201, JSON.stringify(paiement.body));
    assert.equal(Number(paiement.body.remise_parrainage), 5);
    assert.equal(Number(paiement.body.amount), 45.76);
    assert.equal(Number(paiement.body.surcharge), 1.76);
    assert.match(paiement.body.mention_parrainage, /Remise parrainage/);
    assert.equal(Number(paiement.body.prix_course), 49, 'le PRIX ne bouge pas');

    // Le crédit n'est PAS consommé tant que rien n'est payé…
    assert.equal(await creditDe(filleul.id), 5);
    // …il l'est à la confirmation.
    await request(app).post(`/api/payments/${paiement.body.id}/confirm`).set(authHeaders(token));
    assert.equal(await creditDe(filleul.id), 0, 'crédit consommé une seule fois');

    // La COMMISSION du chauffeur est calculée sur 47, pas sur 42 : la
    // remise est le geste commercial de zanziGo, pas celui du chauffeur.
    const vue = await request(app).get(`/api/trips/${troisieme.body.id}`).set(adminHeaders());
    assert.equal(Number(vue.body.price), 49);
    assert.equal(Number(vue.body.commission), 4);

    // Le PARRAIN, lui aussi, voit sa remise sur sa prochaine course —
    // en portefeuille mobile : (47 − 5) × 2 600 = 109 200 TZS.
    const { driver: chauffeurP } = await createVerifiedDriver();
    const courseParrain = await request(app)
      .post('/api/trips')
      .set(authHeaders(tokenParrain))
      .send({
        userId: parrain.id,
        tripType: 'private',
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Nungwi',
      });
    await request(app)
      .patch(`/api/trips/${courseParrain.body.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: chauffeurP.id });
    const paiementParrain = await request(app)
      .post(`/api/trips/${courseParrain.body.id}/payment`)
      .set(authHeaders(tokenParrain))
      .send({ method: 'mobile' });
    assert.equal(Number(paiementParrain.body.amount), 114400);
    assert.equal(Number(paiementParrain.body.remise_parrainage), 5);
  });

  it('changer de moyen conserve la remise — elle ne disparaît pas en route', async () => {
    const { user: parrain } = await createTourist({ fullName: 'Parrain Bascule' });
    const { token, user: filleul } = await creerFilleul(parrain);
    await courseTerminee(token, filleul);
    await courseTerminee(token, filleul);

    const { driver } = await createVerifiedDriver();
    const course = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: filleul.id,
        tripType: 'private',
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Nungwi',
      });
    await request(app)
      .patch(`/api/trips/${course.body.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: driver.id });
    const paiement = await request(app)
      .post(`/api/trips/${course.body.id}/payment`)
      .set(authHeaders(token))
      .send({ method: 'carte' });
    assert.equal(Number(paiement.body.amount), 45.76);

    const bascule = await request(app)
      .post(`/api/payments/${paiement.body.id}/moyen`)
      .set(authHeaders(token))
      .send({ moyen: 'mobile' });
    assert.equal(bascule.status, 200, JSON.stringify(bascule.body));
    // (47 − 5) × 2 600 : la base reste remisée après la bascule.
    assert.equal(Number(bascule.body.amount), 114400);
  });

  it('course annulée après paiement : l\'argent est remboursé ET le crédit revient', async () => {
    const { user: parrain } = await createTourist({ fullName: 'Parrain Rendu' });
    const { token, user: filleul } = await creerFilleul(parrain);
    await courseTerminee(token, filleul);
    await courseTerminee(token, filleul);

    const { driver } = await createVerifiedDriver();
    const dans72h = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const course = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: filleul.id,
        tripType: 'private',
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Nungwi',
        scheduledAt: dans72h,
      });
    await request(app)
      .patch(`/api/trips/${course.body.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: driver.id });
    const paiement = await request(app)
      .post(`/api/trips/${course.body.id}/payment`)
      .set(authHeaders(token))
      .send({ method: 'carte' });
    await request(app).post(`/api/payments/${paiement.body.id}/confirm`).set(authHeaders(token));
    assert.equal(await creditDe(filleul.id), 0, 'crédit consommé au paiement');

    const annulation = await request(app)
      .post(`/api/trips/${course.body.id}/cancel`)
      .set(authHeaders(token));
    assert.equal(annulation.status, 200, JSON.stringify(annulation.body));
    // Remboursé en argent : ce qu'il a réellement payé, hors frais carte —
    // 43,68 − 1,68 = 42,00 (la remise n'était pas de l'argent versé).
    assert.equal(Number(annulation.body.refund.amount), 44);
    // Et le crédit revient, prêt pour la prochaine course.
    assert.equal(await creditDe(filleul.id), 5, 'le crédit est rendu');
  });
});
