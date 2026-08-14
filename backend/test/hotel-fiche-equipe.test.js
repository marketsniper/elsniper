// Fiche complète d'un hôtel, ouverte depuis le tableau de bord de l'équipe :
// tout ce que l'écran affiche doit être lisible avec la SEULE clé équipe
// (coordonnées, crédit et ses mouvements, fidélité, réservations, colis),
// et rester fermé à un autre hôtel.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { adminHeaders, app, authHeaders, createHotel, useTestDb } from './setup.js';

useTestDb();

describe("Fiche hôtel côté équipe", () => {
  it("l'équipe ouvre la fiche complète d'un hôtel et lui ajoute du crédit", async () => {
    const { hotel, token } = await createHotel();

    // Une réservation et un colis, pour que la fiche ait du contenu.
    const course = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        hotelId: hotel.id,
        clientName: 'Client Hôtel',
        clientPhone: '+255700111222',
        tripType: 'private',
        pickupLocation: 'Nungwi',
        dropoffLocation: 'Paje',
      });
    assert.equal(course.status, 201, JSON.stringify(course.body));

    // 1. Coordonnées de l'établissement.
    const fiche = await request(app).get(`/api/hotels/${hotel.id}`).set(adminHeaders());
    assert.equal(fiche.status, 200, JSON.stringify(fiche.body));
    assert.equal(fiche.body.id, hotel.id);
    assert.ok(fiche.body.name);
    assert.equal(fiche.body.password_hash, undefined); // jamais exposé

    // 2. Crédit : l'équipe ajoute 50 $ après avoir reçu l'argent.
    const recharge = await request(app)
      .post(`/api/hotels/${hotel.id}/credit`)
      .set(adminHeaders())
      .send({ amount: 50, note: 'Espèces reçues' });
    assert.equal(recharge.status, 200, JSON.stringify(recharge.body));
    assert.equal(recharge.body.balance, 50);

    const credit = await request(app).get(`/api/hotels/${hotel.id}/credit`).set(adminHeaders());
    assert.equal(credit.status, 200);
    assert.equal(credit.body.balance, 50);
    assert.equal(credit.body.transactions.length, 1);
    assert.equal(credit.body.transactions[0].reason, 'topup');
    assert.equal(credit.body.transactions[0].reference, 'Espèces reçues');
    assert.ok(credit.body.transactions[0].created_at); // la date s'affiche sur la fiche

    // Un montant négatif corrige une erreur de saisie.
    const correction = await request(app)
      .post(`/api/hotels/${hotel.id}/credit`)
      .set(adminHeaders())
      .send({ amount: -20 });
    assert.equal(correction.status, 200);
    assert.equal(correction.body.balance, 30);

    // 3. Fidélité, 4. réservations, 5. colis.
    const fidelite = await request(app)
      .get(`/api/hotels/${hotel.id}/fidelite`)
      .set(adminHeaders());
    assert.equal(fidelite.status, 200);
    assert.equal(typeof fidelite.body.completed_trips, 'number');
    assert.ok(fidelite.body.trips_per_voucher > 0);

    const courses = await request(app)
      .get(`/api/trips?hotelId=${hotel.id}`)
      .set(adminHeaders());
    assert.equal(courses.status, 200);
    assert.equal(courses.body.length, 1);
    assert.equal(courses.body[0].pickup_location, 'Nungwi');

    const colis = await request(app)
      .get(`/api/hotels/${hotel.id}/packages`)
      .set(adminHeaders());
    assert.equal(colis.status, 200);
    assert.ok(Array.isArray(colis.body));
  });

  it("un hôtel ne peut pas ouvrir la fiche d'un autre hôtel", async () => {
    const premier = await createHotel();
    const second = await createHotel();

    for (const chemin of ['', '/credit', '/fidelite', '/packages']) {
      const reponse = await request(app)
        .get(`/api/hotels/${premier.hotel.id}${chemin}`)
        .set(authHeaders(second.token));
      assert.equal(reponse.status, 403, `${chemin} : ${JSON.stringify(reponse.body)}`);
    }

    // Et il ne se crédite évidemment pas lui-même : créditer exige la clé de
    // l'équipe, qu'un jeton hôtel ne porte pas (401 « clé équipe requise »).
    const recharge = await request(app)
      .post(`/api/hotels/${premier.hotel.id}/credit`)
      .set(authHeaders(premier.token))
      .send({ amount: 500 });
    assert.ok([401, 403].includes(recharge.status), `refus attendu, reçu ${recharge.status}`);
  });
});
