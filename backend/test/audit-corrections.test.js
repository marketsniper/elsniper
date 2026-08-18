// LES CORRECTIONS DE L'AUDIT DU 18/08/2026 — chacune verrouillée par un test.
//
// Quatre familles de trous, toutes autour du même thème : l'argent encaissé
// doit TOUJOURS laisser une trace juste, quel que soit l'ordre des
// événements (chauffeur qui rend la course, annulation pendant le paiement,
// annonce annulée sous les passagers, changement de moyen).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
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

async function coursePrete({ scheduledAt, audience = 'tourist' } = {}) {
  const { token, user } =
    audience === 'local' ? await createLocal() : await createTourist();
  const { token: tokenChauffeur, driver } = await createVerifiedDriver();
  const course = await request(app)
    .post('/api/trips')
    .set(authHeaders(token))
    .send({
      userId: user.id,
      tripType: 'private',
      pickupLocation: 'Stone Town',
      dropoffLocation: 'Nungwi',
      ...(scheduledAt ? { scheduledAt } : {}),
    });
  assert.equal(course.status, 201, JSON.stringify(course.body));
  await request(app)
    .patch(`/api/trips/${course.body.id}/assign-driver`)
    .set(adminHeaders())
    .send({ driverId: driver.id });
  return { course: course.body, token, tokenChauffeur, driver };
}

async function payer(token, tripId, method) {
  const paiement = await request(app)
    .post(`/api/trips/${tripId}/payment`)
    .set(authHeaders(token))
    .send(method ? { method } : {});
  assert.ok([200, 201].includes(paiement.status), JSON.stringify(paiement.body));
  return paiement.body;
}

async function annonceReservee({ seats = 2, method = 'carte' } = {}) {
  const { token: tokenChauffeur, driver } = await createVerifiedDriver();
  const { token: tokenTouriste } = await createTourist();
  const depart = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
  const annonce = await request(app)
    .post('/api/rides')
    .set(authHeaders(tokenChauffeur))
    .send({ origin: 'Stone Town', destination: 'Nungwi', departureAt: depart, seatsTotal: 4 });
  assert.equal(annonce.status, 201, JSON.stringify(annonce.body));
  const resa = await request(app)
    .post(`/api/rides/${annonce.body.id}/book`)
    .set(authHeaders(tokenTouriste))
    .send({ seats, method });
  assert.equal(resa.status, 201, JSON.stringify(resa.body));
  return { annonce: annonce.body, resa: resa.body, tokenChauffeur, tokenTouriste, driver };
}

describe('Remboursements : la surcharge carte ne se rembourse JAMAIS', () => {
  it('place payée par carte, annulée à +48 h : remboursement = PRIX, pas montant débité', async () => {
    const { resa, tokenTouriste } = await annonceReservee({ seats: 2, method: 'carte' });
    // 2 places à 15 USD = 30 ; débité par carte : 31,20 (surcharge 1,20).
    assert.equal(Number(resa.payment.amount), 31.2);
    await request(app)
      .post(`/api/payments/${resa.payment.id}/confirm`)
      .set(authHeaders(tokenTouriste));

    const mesPlaces = await request(app)
      .get('/api/rides/reservations')
      .set(authHeaders(tokenTouriste));
    const annulation = await request(app)
      .post(`/api/rides/reservations/${mesPlaces.body[0].id}/cancel`)
      .set(authHeaders(tokenTouriste));
    assert.equal(annulation.status, 200, JSON.stringify(annulation.body));
    assert.equal(annulation.body.refund.rate, 1);
    // 30,00 — les 1,20 de frais bancaires sont chez la banque, pas chez nous.
    assert.equal(Number(annulation.body.refund.amount), 30);
  });
});

describe('paid_at : la trace qui survit à tout', () => {
  it('paiement confirmé APRÈS que le chauffeur a rendu la course : l\'argent reste vu', async () => {
    const { course, token, tokenChauffeur } = await coursePrete();
    const paiement = await payer(token, course.id);

    // Le chauffeur rend la course PENDANT que le client paie.
    const rendu = await request(app)
      .post(`/api/trips/${course.id}/release`)
      .set(authHeaders(tokenChauffeur));
    assert.equal(rendu.status, 200, JSON.stringify(rendu.body));

    // Le paiement aboutit quand même (l'argent est parti).
    const confirme = await request(app)
      .post(`/api/payments/${paiement.id}/confirm`)
      .set(authHeaders(token));
    assert.equal(confirme.status, 200, JSON.stringify(confirme.body));

    // La course est revenue en 'requested' MAIS paid_at est posé : la bourse
    // l'affiche déjà payée, et le prochain chauffeur la prend directement
    // en 'paid'.
    const vue = await request(app).get(`/api/trips/${course.id}`).set(adminHeaders());
    assert.equal(vue.body.status, 'requested');
    assert.ok(vue.body.paid_at, 'paid_at doit être posé même après le release');

    // …et le client ne peut PAS être facturé une seconde fois.
    const repaiement = await request(app)
      .post(`/api/trips/${course.id}/payment`)
      .set(authHeaders(token));
    assert.equal(repaiement.status, 409, 'plus de statut driver_confirmed = pas de re-facturation');
  });

  it('course payée puis rendue : le client qui annule a son remboursement TRACÉ', async () => {
    const dans72h = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const { course, token, tokenChauffeur } = await coursePrete({ scheduledAt: dans72h });
    const paiement = await payer(token, course.id);
    await request(app).post(`/api/payments/${paiement.id}/confirm`).set(authHeaders(token));
    await request(app).post(`/api/trips/${course.id}/release`).set(authHeaders(tokenChauffeur));

    // Avant la correction : statut 'requested' → annulation libre, AUCUN
    // remboursement tracé — l'argent encaissé disparaissait en silence.
    const annulation = await request(app)
      .post(`/api/trips/${course.id}/cancel`)
      .set(authHeaders(token));
    assert.equal(annulation.status, 200, JSON.stringify(annulation.body));
    assert.ok(annulation.body.refund, 'le remboursement doit être tracé');
    assert.equal(annulation.body.refund.rate, 1);
    // Prix 47 — la surcharge carte (1,88) reste hors du remboursement.
    assert.equal(Number(annulation.body.refund.amount), 47);

    const dus = await request(app).get('/api/payments/remboursements').set(adminHeaders());
    assert.equal(dus.body.length, 1, 'la ligne est dans « Remboursements à verser »');
  });

  it('confirmation sur une course DÉJÀ ANNULÉE : remboursement tracé, pas de silence', async () => {
    const { course, token } = await coursePrete();
    const paiement = await payer(token, course.id, 'mobile');

    // L'équipe annule la course pendant que le client paie sur son téléphone.
    await request(app).post(`/api/trips/${course.id}/cancel`).set(adminHeaders());
    // L'annulation solde le paiement en attente… mais l'argent peut quand
    // même arriver (réseau lent). On rejoue la confirmation sur la ligne :
    const confirme = await request(app)
      .post(`/api/payments/${paiement.id}/confirm`)
      .set(authHeaders(token));
    // Le paiement a été soldé 'failed' par l'annulation → 409 propre.
    assert.equal(confirme.status, 409);
  });
});

describe('Annonce annulée par le chauffeur : les passagers ne disparaissent pas', () => {
  it('réservations annulées, place payée remboursée à 100 % (hors frais carte)', async () => {
    const { annonce, resa, tokenChauffeur, tokenTouriste } = await annonceReservee({
      seats: 2,
      method: 'carte',
    });
    await request(app)
      .post(`/api/payments/${resa.payment.id}/confirm`)
      .set(authHeaders(tokenTouriste));

    const annulee = await request(app)
      .patch(`/api/rides/${annonce.id}`)
      .set(authHeaders(tokenChauffeur))
      .send({ status: 'cancelled' });
    assert.equal(annulee.status, 200, JSON.stringify(annulee.body));

    // La réservation est annulée côté client…
    const mesPlaces = await request(app)
      .get('/api/rides/reservations')
      .set(authHeaders(tokenTouriste));
    assert.equal(mesPlaces.body[0].cancelled, true);

    // …et le remboursement DÛ est tracé : 30 USD (prix), pas 31,20 (débité).
    const dus = await request(app).get('/api/payments/remboursements').set(adminHeaders());
    assert.equal(dus.body.length, 1);
    assert.equal(Number(dus.body[0].refund_amount), 30);
  });
});

describe('Changement de moyen : jamais de référence auto-confirmable', () => {
  it('en mode stub, /moyen produit un circuit MANUEL (WhatsApp), jamais un ordre stub', async () => {
    const { course, token } = await coursePrete();
    const paiement = await payer(token, course.id, 'carte');
    const bascule = await request(app)
      .post(`/api/payments/${paiement.id}/moyen`)
      .set(authHeaders(token))
      .send({ moyen: 'mobile' });
    assert.equal(bascule.status, 200, JSON.stringify(bascule.body));
    // Une référence STUB- se confirmerait toute seule sans l'équipe : la
    // porte est fermée — sans clés Pesapal, tout passe par WhatsApp.
    assert.match(bascule.body.pesapal_reference, /^WHATSAPP-/);
  });
});

describe('Comptabilité : le moyen enregistré dit la vérité', () => {
  it('un paiement par crédit hôtel est marqué credit, pas carte', async () => {
    const { createHotel } = await import('./setup.js');
    const { token: tokenHotel, hotel } = await createHotel();
    await request(app)
      .post(`/api/hotels/${hotel.id}/credit`)
      .set(adminHeaders())
      .send({ amount: 200 });
    const { driver } = await createVerifiedDriver();
    const course = await request(app)
      .post('/api/trips')
      .set(authHeaders(tokenHotel))
      .send({
        hotelId: hotel.id,
        clientName: 'Guest Smith',
        clientPhone: '+33612345678',
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
      .set(authHeaders(tokenHotel))
      .send({ method: 'credit' });
    assert.equal(paiement.status, 201, JSON.stringify(paiement.body));
    assert.equal(paiement.body.method, 'credit');
  });
});

describe('Radiation d\'un chauffeur : ses courses retournent à la bourse', () => {
  it('course payée en cours → rendue, paid_at conservé, visible des chauffeurs', async () => {
    const { course, token, driver } = await coursePrete();
    const paiement = await payer(token, course.id);
    await request(app).post(`/api/payments/${paiement.id}/confirm`).set(authHeaders(token));

    const radiation = await request(app)
      .post(`/api/drivers/${driver.id}/radier`)
      .set(adminHeaders());
    assert.equal(radiation.status, 200, JSON.stringify(radiation.body));

    const vue = await request(app).get(`/api/trips/${course.id}`).set(adminHeaders());
    assert.equal(vue.body.status, 'requested', 'rendue à la bourse');
    assert.equal(vue.body.driver_id, null);
    assert.ok(vue.body.paid_at, 'l\'argent encaissé reste vu');

    // Un autre chauffeur vérifié la voit et la reprend — directement payée.
    const { token: tokenRemplacant } = await createVerifiedDriver();
    const bourse = await request(app)
      .get('/api/trips/disponibles')
      .set(authHeaders(tokenRemplacant));
    assert.ok(
      bourse.body.some((c) => c.id === course.id && c.deja_payee === true),
      'la course payée est dans la bourse, marquée déjà payée'
    );
    const prise = await request(app)
      .post(`/api/trips/${course.id}/claim`)
      .set(authHeaders(tokenRemplacant));
    assert.equal(prise.status, 200, JSON.stringify(prise.body));
    assert.equal(prise.body.status, 'paid');
  });
});

describe('Comptes sans mot de passe et comptes révoqués', () => {
  it('le jeton d\'un chauffeur radié cesse de fonctionner immédiatement', async () => {
    const { token: tokenChauffeur, driver } = await createVerifiedDriver();
    // Avant la radiation, il accède à ses courses.
    const avant = await request(app)
      .get(`/api/drivers/${driver.id}/trips`)
      .set(authHeaders(tokenChauffeur));
    assert.equal(avant.status, 200);

    await request(app).post(`/api/drivers/${driver.id}/radier`).set(adminHeaders());

    // Après : son jeton (valable 30 jours) ne vaut plus rien.
    const apres = await request(app)
      .get(`/api/drivers/${driver.id}/trips`)
      .set(authHeaders(tokenChauffeur));
    assert.equal(apres.status, 401, JSON.stringify(apres.body));
  });
});
