// LE CHOIX DU MOYEN DE PAIEMENT — carte bancaire ou portefeuille mobile.
//
// Ce que ces tests protègent, dans l'ordre d'importance :
//  1. le PRIX de la course ne bouge jamais, quel que soit le moyen — sinon la
//     commission du chauffeur suivrait le mode de règlement du client ;
//  2. un local ne peut pas se retrouver devant un paiement par carte : son
//     moyen, c'est le portefeuille mobile, et la porte carte reste fermée ;
//  3. changer d'avis ne coûte rien : le montant est recalculé depuis le prix,
//     jamais depuis la somme déjà affichée (sinon les frais s'empilent).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { config } from '../src/config.js';
import { enShillings, moyensPour, reglement } from '../src/services/moyenPaiement.js';
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

describe('Moyens de paiement : la règle', () => {
  it('une facture en dollars propose les deux moyens, une facture en shillings un seul', () => {
    assert.deepEqual(moyensPour('USD'), ['carte', 'mobile']);
    assert.deepEqual(moyensPour('TZS'), ['mobile'], 'le local paie au portefeuille, point');
  });

  it('carte : le prix plus les frais de la banque, en dollars', () => {
    const r = reglement(47, 'USD', 'carte');
    assert.equal(r.devise, 'USD');
    assert.equal(r.montant, 48.88);
    assert.equal(r.surcharge, 1.88);
    assert.match(r.mention, /Frais bancaires carte/);
  });

  it('portefeuille mobile : le prix converti en shillings, sans un centime de frais', () => {
    const r = reglement(52, 'USD', 'mobile');
    assert.equal(r.devise, 'TZS');
    assert.equal(r.surcharge, 0, 'aucun frais sur le portefeuille mobile');
    assert.equal(r.montant, 52 * config.usdToTzsRate); // 135 200
    assert.match(r.mention, /Portefeuille mobile/);
  });

  it('la conversion arrondit AU-DESSUS, aux 100 TZS — jamais en défaveur de zanziGo', () => {
    // 42,30 USD (résident vérifié) × 2 600 = 109 980 → 110 000.
    assert.equal(enShillings(42.3), 110000);
    assert.ok(enShillings(42.3) >= 42.3 * config.usdToTzsRate);
    // Un montant déjà rond ne bouge pas.
    assert.equal(enShillings(47), 122200);
  });

  it('une facture en shillings ne se paie JAMAIS par carte', () => {
    assert.throws(() => reglement(16000, 'TZS', 'carte'), /Moyen de paiement indisponible/);
    const r = reglement(16000, 'TZS', 'mobile');
    assert.equal(r.montant, 16000, 'le prix, sans conversion ni frais');
    assert.equal(r.surcharge, 0);
  });
});

describe('Moyens de paiement : sur une vraie course', () => {
  it('touriste par CARTE : 46,80 USD débités, la course reste à 45', async () => {
    const { course, token } = await coursePrete();
    const paiement = await request(app)
      .post(`/api/trips/${course.id}/payment`)
      .set(authHeaders(token))
      .send({ method: 'carte' });
    assert.equal(paiement.status, 201, JSON.stringify(paiement.body));
    assert.equal(paiement.body.method, 'carte');
    assert.equal(paiement.body.currency, 'USD');
    assert.equal(Number(paiement.body.amount), 46.8);
    assert.equal(Number(paiement.body.surcharge), 1.8);
    assert.equal(Number(paiement.body.prix_course), 45);
    assert.deepEqual(paiement.body.moyens_disponibles, ['carte', 'mobile']);

    // Le prix et la commission du chauffeur, eux, n'ont pas bougé.
    const vue = await request(app).get(`/api/trips/${course.id}`).set(adminHeaders());
    assert.equal(Number(vue.body.price), 45);
    assert.equal(Number(vue.body.commission), 5.4);
  });

  it('touriste par PORTEFEUILLE MOBILE : 117 000 TZS, aucun frais, course toujours à 45 USD', async () => {
    const { course, token } = await coursePrete();
    const paiement = await request(app)
      .post(`/api/trips/${course.id}/payment`)
      .set(authHeaders(token))
      .send({ method: 'mobile' });
    assert.equal(paiement.status, 201, JSON.stringify(paiement.body));
    assert.equal(paiement.body.method, 'mobile');
    assert.equal(paiement.body.currency, 'TZS');
    assert.equal(Number(paiement.body.amount), 117000);
    assert.equal(Number(paiement.body.surcharge), 0);
    // Le message à l'équipe annonce le bon moyen ET la bonne somme : c'est
    // ce qu'elle attend sur le compte Tigo.
    const message = decodeURIComponent(paiement.body.payment_link);
    assert.match(message, /Portefeuille mobile/);
    assert.ok(message.includes('117000 TZS'));

    const vue = await request(app).get(`/api/trips/${course.id}`).set(adminHeaders());
    assert.equal(Number(vue.body.price), 45, 'la course est facturée 45 USD, pas 117 000 TZS');
    assert.equal(vue.body.currency, 'USD');
    assert.equal(Number(vue.body.commission), 5.4, 'la commission ignore le moyen de paiement');
  });

  it('sans choix, un touriste part sur la carte (comportement historique)', async () => {
    const { course, token } = await coursePrete();
    const paiement = await request(app)
      .post(`/api/trips/${course.id}/payment`)
      .set(authHeaders(token));
    assert.equal(paiement.body.method, 'carte');
    assert.equal(Number(paiement.body.amount), 46.8);
  });

  it('un LOCAL n\'a que le portefeuille mobile — la carte est refusée', async () => {
    const { course, token } = await coursePrete({ audience: 'local' });
    assert.equal(course.currency, 'TZS');

    const refus = await request(app)
      .post(`/api/trips/${course.id}/payment`)
      .set(authHeaders(token))
      .send({ method: 'carte' });
    assert.equal(refus.status, 422, JSON.stringify(refus.body));
    assert.equal(refus.body.error.code, 'moyen_indisponible');

    const paiement = await request(app)
      .post(`/api/trips/${course.id}/payment`)
      .set(authHeaders(token))
      .send({ method: 'mobile' });
    assert.equal(paiement.status, 201);
    assert.equal(paiement.body.method, 'mobile');
    assert.equal(paiement.body.currency, 'TZS');
    assert.equal(Number(paiement.body.amount), Number(course.price));
    assert.equal(Number(paiement.body.surcharge), 0);
    assert.deepEqual(paiement.body.moyens_disponibles, ['mobile']);
  });
});

describe('Changer de moyen avant de payer', () => {
  it('carte → mobile → carte : le montant repart du PRIX, les frais ne s\'empilent pas', async () => {
    const { course, token } = await coursePrete();
    const paiement = await request(app)
      .post(`/api/trips/${course.id}/payment`)
      .set(authHeaders(token))
      .send({ method: 'carte' });
    const id = paiement.body.id;

    const versMobile = await request(app)
      .post(`/api/payments/${id}/moyen`)
      .set(authHeaders(token))
      .send({ moyen: 'mobile' });
    assert.equal(versMobile.status, 200, JSON.stringify(versMobile.body));
    assert.equal(versMobile.body.method, 'mobile');
    assert.equal(versMobile.body.currency, 'TZS');
    assert.equal(Number(versMobile.body.amount), 117000);
    assert.equal(Number(versMobile.body.surcharge), 0);
    // Le lien de paiement suit : il porterait sinon l'ancienne somme.
    assert.ok(decodeURIComponent(versMobile.body.payment_link).includes('117000 TZS'));

    const retourCarte = await request(app)
      .post(`/api/payments/${id}/moyen`)
      .set(authHeaders(token))
      .send({ moyen: 'carte' });
    assert.equal(retourCarte.status, 200);
    assert.equal(Number(retourCarte.body.amount), 46.8, 'et pas 46,80 + 4 % de nouveau');
    assert.equal(Number(retourCarte.body.surcharge), 1.8);
  });

  it('un paiement déjà encaissé ne se rejoue pas', async () => {
    const { course, token } = await coursePrete();
    const paiement = await request(app)
      .post(`/api/trips/${course.id}/payment`)
      .set(authHeaders(token));
    await request(app)
      .post(`/api/payments/${paiement.body.id}/confirm`)
      .set(adminHeaders())
      .send({});

    const refus = await request(app)
      .post(`/api/payments/${paiement.body.id}/moyen`)
      .set(authHeaders(token))
      .send({ moyen: 'mobile' });
    assert.equal(refus.status, 409);
    assert.equal(refus.body.error.code, 'payment_already_processed');
  });

  it('le paiement d\'un autre client est intouchable', async () => {
    const { course, token } = await coursePrete();
    const paiement = await request(app)
      .post(`/api/trips/${course.id}/payment`)
      .set(authHeaders(token));
    const { token: autre } = await createTourist({ fullName: 'Autre Cliente' });

    const refus = await request(app)
      .post(`/api/payments/${paiement.body.id}/moyen`)
      .set(authHeaders(autre))
      .send({ moyen: 'mobile' });
    assert.equal(refus.status, 403);
  });
});

describe('Places de taxi partagé : même choix', () => {
  it('le touriste réserve en shillings et règle par portefeuille mobile', async () => {
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const { token: tokenTouriste } = await createTourist();
    const depart = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const annonce = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({ origin: 'Stone Town', destination: 'Nungwi', departureAt: depart, seatsTotal: 4 });
    assert.equal(annonce.status, 201);

    const resa = await request(app)
      .post(`/api/rides/${annonce.body.id}/book`)
      .set(authHeaders(tokenTouriste))
      .send({ seats: 2, method: 'mobile' });
    assert.equal(resa.status, 201, JSON.stringify(resa.body));
    // 2 places à 15 USD = 30 USD → 78 000 TZS, sans frais.
    assert.equal(resa.body.payment.method, 'mobile');
    assert.equal(resa.body.payment.currency, 'TZS');
    assert.equal(Number(resa.body.payment.amount), 78000);
    assert.equal(Number(resa.body.payment.surcharge), 0);

    // La fiche « ma place » montre les deux chiffres : le prix et ce qu'il y
    // a à régler — le client ne doit jamais avoir à faire la conversion.
    const mesPlaces = await request(app)
      .get('/api/rides/reservations')
      .set(authHeaders(tokenTouriste));
    assert.equal(Number(mesPlaces.body[0].amount), 30, 'le prix des 2 places');
    assert.equal(mesPlaces.body[0].currency, 'USD');
    assert.equal(Number(mesPlaces.body[0].reglement_montant), 78000);
    assert.equal(mesPlaces.body[0].reglement_devise, 'TZS');
    assert.equal(mesPlaces.body[0].reglement_moyen, 'mobile');
  });

  it('le local ne se voit proposer que le portefeuille mobile', async () => {
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const { token: tokenLocal } = await createLocal();
    const depart = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const annonce = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({ origin: 'Stone Town', destination: 'Nungwi', departureAt: depart, seatsTotal: 4 });

    const resa = await request(app)
      .post(`/api/rides/${annonce.body.id}/book`)
      .set(authHeaders(tokenLocal))
      .send({ seats: 1 });
    assert.equal(resa.status, 201);
    assert.equal(resa.body.payment.method, 'mobile');
    assert.equal(Number(resa.body.payment.amount), 17000);

    const mesPlaces = await request(app)
      .get('/api/rides/reservations')
      .set(authHeaders(tokenLocal));
    assert.deepEqual(mesPlaces.body[0].moyens_disponibles, ['mobile']);
  });
});

describe('Colis : même choix', () => {
  it('l\'expéditeur touriste peut régler son colis au portefeuille mobile', async () => {
    const { token, user } = await createTourist();
    const colis = await request(app)
      .post('/api/packages')
      .set(authHeaders(token))
      .send({
        senderType: 'user',
        senderUserId: user.id,
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Nungwi',
        size: 'small',
        recipientName: 'Amina',
        recipientPhone: '+255700000111',
      });
    assert.equal(colis.status, 201, JSON.stringify(colis.body));
    assert.equal(Number(colis.body.price), 5);

    const paiement = await request(app)
      .post(`/api/packages/${colis.body.id}/payment`)
      .set(authHeaders(token))
      .send({ method: 'mobile' });
    assert.equal(paiement.status, 201, JSON.stringify(paiement.body));
    assert.equal(paiement.body.method, 'mobile');
    assert.equal(paiement.body.currency, 'TZS');
    assert.equal(Number(paiement.body.amount), 13000); // 5 USD × 2 600
    assert.equal(Number(paiement.body.surcharge), 0);
  });
});

describe('Tableau de bord équipe', () => {
  it('chaque paiement en attente dit par quel moyen il arrive', async () => {
    const { course, token } = await coursePrete();
    await request(app)
      .post(`/api/trips/${course.id}/payment`)
      .set(authHeaders(token))
      .send({ method: 'mobile' });

    const enAttente = await request(app).get('/api/payments?status=pending').set(adminHeaders());
    assert.equal(enAttente.status, 200);
    const ligne = enAttente.body.find((p) => p.trip_id === course.id);
    assert.ok(ligne, 'paiement absent du tableau équipe');
    assert.equal(ligne.method, 'mobile');
    assert.equal(ligne.currency, 'TZS');
    assert.equal(Number(ligne.amount), 117000);
  });
});
