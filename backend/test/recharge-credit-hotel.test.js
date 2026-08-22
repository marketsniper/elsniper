// LA DEMANDE DE RECHARGE DE CRÉDIT D'UN PARTENAIRE.
//
// Un hôtel a demandé une recharge et l'équipe ne l'a jamais su : le bouton
// « Recharger mon crédit » ouvrait WhatsApp et ne touchait pas le serveur.
// Aucune alerte, aucune trace, rien dans le tableau de bord — la demande
// n'existait que dans une conversation.
//
// Ces tests verrouillent le chemin complet : la demande s'enregistre, elle
// ALERTE l'équipe, elle attend dans une file, et c'est le geste « Créditer »
// qui la solde en écrivant du même coup la ligne du livre de comptes.
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { pool } from '../src/db.js';
import { alerteDemandeRecharge } from '../src/routes/hotels.js';
import { adminHeaders, app, authHeaders, createHotel, useTestDb } from './setup.js';

useTestDb();

/**
 * Capte les alertes réellement parties vers l'équipe.
 *
 * Sans canal configuré (le cas des tests), notifierEquipe trace
 * « [notif équipe stub] <sujet> » : on écoute la sortie du serveur, ce qui
 * vérifie le VRAI chemin de production plutôt qu'un substitut. Le stub ne
 * journalise que le sujet — le corps du message se vérifie à part, sur
 * alerteDemandeRecharge().
 */
function espionnerAlertes() {
  const alertes = [];
  const original = console.log;
  mock.method(console, 'log', (...args) => {
    const ligne = args.join(' ');
    if (ligne.includes('[notif équipe stub]')) alertes.push(ligne);
    original.apply(console, args);
  });
  return alertes;
}

async function demander(token, hotelId, corps) {
  return request(app)
    .post(`/api/hotels/${hotelId}/credit-requests`)
    .set(authHeaders(token))
    .send({ amount: 100, method: 'mobile_money', ...corps });
}

describe('Recharge de crédit — la demande d’un partenaire ne peut plus se perdre', () => {
  it('la demande s’enregistre, alerte l’équipe et entre dans la file', async () => {
    const alertes = espionnerAlertes();
    const { token, hotel } = await createHotel({ name: 'Hôtel Kilindi' });

    const res = await demander(token, hotel.id, { amount: 150, note: 'Payé ce matin' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.status, 'pending');
    assert.equal(Number(res.body.amount), 150);

    // L'ALERTE — c'est elle qui manquait.
    assert.ok(
      alertes.some((l) => l.includes('recharge de crédit') && l.includes('Hôtel Kilindi')),
      `aucune alerte équipe partie (reçues : ${alertes.join(' | ') || 'aucune'})`
    );

    // LA FILE — c'est elle qui permet de la retrouver le lendemain.
    const file = await request(app).get('/api/hotels/credit-requests').set(adminHeaders());
    assert.equal(file.status, 200);
    const mienne = file.body.find((d) => d.id === res.body.id);
    assert.ok(mienne, 'la demande n’apparaît pas dans la file de l’équipe');
    assert.equal(mienne.hotel_name, 'Hôtel Kilindi');
    assert.equal(Number(mienne.credit_balance), 0);
  });

  it('l’alerte dit quoi faire, avec le montant, le moyen et le solde', async () => {
    const { sujet, texte } = alerteDemandeRecharge(
      { name: 'Hôtel Kilindi', phone: '+255700000009', partner_type: 'hotel', credit_balance: 40 },
      { amount: 150, method: 'mobile_money', note: 'Payé ce matin' }
    );
    assert.match(sujet, /Demande de recharge de crédit — Hôtel Kilindi/);
    assert.match(texte, /Montant demandé: 150 USD/);
    assert.match(texte, /Moyen annoncé: portefeuille mobile/);
    assert.match(texte, /Solde actuel: 40 USD/);
    assert.match(texte, /Note: Payé ce matin/);
    assert.match(texte, /WhatsApp: \+255700000009/);
    // Une alerte qui ne dit pas quoi faire oblige à deviner.
    assert.match(texte, /Créditer/);
    assert.match(texte, /Recharges de crédit/);
  });

  it('un restaurant est appelé restaurant, pas hôtel', async () => {
    const { texte } = alerteDemandeRecharge(
      { name: 'Chez Amina', phone: '+255700000010', partner_type: 'restaurant', credit_balance: 0 },
      { amount: 30, method: 'cash' }
    );
    assert.match(texte, /^Restaurant: Chez Amina/);
    assert.match(texte, /Moyen annoncé: espèces/);
    assert.ok(!/Note:/.test(texte), 'une note vide ne doit pas laisser de ligne');
  });

  it('« Créditer » monte le solde, écrit le livre de comptes et solde la demande', async () => {
    espionnerAlertes();
    const { token, hotel } = await createHotel();
    const demande = (await demander(token, hotel.id, { amount: 200 })).body;

    const res = await request(app)
      .post(`/api/hotels/credit-requests/${demande.id}/credit`)
      .set(adminHeaders())
      .send({});
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.balance, 200);
    assert.equal(res.body.request.status, 'credited');

    const credit = await request(app)
      .get(`/api/hotels/${hotel.id}/credit`)
      .set(authHeaders(token));
    assert.equal(credit.body.balance, 200);
    const ligne = credit.body.transactions.find((t) => t.reason === 'topup');
    assert.ok(ligne, 'aucune ligne « topup » dans le livre de comptes');
    assert.equal(Number(ligne.amount), 200);

    // Elle sort de la file : sinon elle serait recréditée le lendemain.
    const file = await request(app).get('/api/hotels/credit-requests').set(adminHeaders());
    assert.ok(!file.body.some((d) => d.id === demande.id), 'la demande soldée reste dans la file');
  });

  it('l’équipe peut corriger le montant : 100 demandés, 95 arrivés', async () => {
    espionnerAlertes();
    const { token, hotel } = await createHotel();
    const demande = (await demander(token, hotel.id, { amount: 100 })).body;

    const res = await request(app)
      .post(`/api/hotels/credit-requests/${demande.id}/credit`)
      .set(adminHeaders())
      .send({ amount: 95, note: 'Frais de retrait déduits' });
    assert.equal(res.status, 200);
    assert.equal(res.body.balance, 95);
    assert.equal(Number(res.body.request.credited_amount), 95);
    assert.equal(res.body.request.decision_note, 'Frais de retrait déduits');
  });

  it('une demande déjà traitée n’est jamais créditée deux fois', async () => {
    espionnerAlertes();
    const { token, hotel } = await createHotel();
    const demande = (await demander(token, hotel.id, { amount: 60 })).body;

    await request(app)
      .post(`/api/hotels/credit-requests/${demande.id}/credit`)
      .set(adminHeaders())
      .send({});
    const rejoue = await request(app)
      .post(`/api/hotels/credit-requests/${demande.id}/credit`)
      .set(adminHeaders())
      .send({});
    assert.equal(rejoue.status, 409);
    assert.equal(rejoue.body.error.code, 'request_already_decided');

    const { rows } = await pool.query('SELECT credit_balance FROM hotels WHERE id = $1', [hotel.id]);
    assert.equal(Number(rows[0].credit_balance), 60, 'le solde a été crédité deux fois');
  });

  it('deux appuis sur le bouton ne font pas deux demandes à créditer', async () => {
    espionnerAlertes();
    const { token, hotel } = await createHotel();
    assert.equal((await demander(token, hotel.id, { amount: 50 })).status, 201);

    const seconde = await demander(token, hotel.id, { amount: 50 });
    assert.equal(seconde.status, 409);
    assert.equal(seconde.body.error.code, 'pending_request_exists');
  });

  it('refuser sort la demande de la file sans toucher au solde', async () => {
    espionnerAlertes();
    const { token, hotel } = await createHotel();
    const demande = (await demander(token, hotel.id, { amount: 80 })).body;

    const res = await request(app)
      .post(`/api/hotels/credit-requests/${demande.id}/reject`)
      .set(adminHeaders())
      .send({ note: 'Versement jamais arrivé' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'rejected');

    const credit = await request(app)
      .get(`/api/hotels/${hotel.id}/credit`)
      .set(authHeaders(token));
    assert.equal(credit.body.balance, 0, 'un refus a crédité le compte');

    // Et le partenaire peut redemander : le verrou ne vaut que pour l'attente.
    assert.equal((await demander(token, hotel.id, { amount: 80 })).status, 201);
  });

  it('le partenaire voit ses demandes, et personne ne voit celles des autres', async () => {
    espionnerAlertes();
    const { token, hotel } = await createHotel();
    const autre = await createHotel();
    await demander(token, hotel.id, { amount: 120 });

    const miennes = await request(app)
      .get(`/api/hotels/${hotel.id}/credit-requests`)
      .set(authHeaders(token));
    assert.equal(miennes.status, 200);
    assert.equal(miennes.body.length, 1);
    assert.equal(miennes.body[0].status, 'pending');

    const espion = await request(app)
      .get(`/api/hotels/${hotel.id}/credit-requests`)
      .set(authHeaders(autre.token));
    assert.equal(espion.status, 403);
  });

  it('un partenaire ne peut ni se créditer lui-même ni vider la file', async () => {
    espionnerAlertes();
    const { token, hotel } = await createHotel();
    const demande = (await demander(token, hotel.id, { amount: 500 })).body;

    // La file et les décisions sont derrière la CLÉ D'ÉQUIPE, pas derrière un
    // rôle : un jeton de partenaire, si valide soit-il, n'y donne pas accès —
    // le serveur répond 401 admin_required.
    const crediter = await request(app)
      .post(`/api/hotels/credit-requests/${demande.id}/credit`)
      .set(authHeaders(token))
      .send({});
    assert.equal(crediter.status, 401);
    assert.equal(crediter.body.error.code, 'admin_required');

    const file = await request(app).get('/api/hotels/credit-requests').set(authHeaders(token));
    assert.equal(file.status, 401);

    const refuser = await request(app)
      .post(`/api/hotels/credit-requests/${demande.id}/reject`)
      .set(authHeaders(token))
      .send({});
    assert.equal(refuser.status, 401);

    const { rows } = await pool.query('SELECT credit_balance FROM hotels WHERE id = $1', [hotel.id]);
    assert.equal(Number(rows[0].credit_balance), 0);
  });

  it('un compte partenaire non vérifié ne peut pas demander de recharge', async () => {
    espionnerAlertes();
    const { token, hotel } = await createHotel({ verify: false });
    const res = await demander(token, hotel.id, { amount: 100 });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'hotel_not_verified');
  });
});
