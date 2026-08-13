// Fidélité + crédit prépayé des hôtels partenaires (migration 016) :
// - 1 bon « colis offert » toutes les 10 courses TERMINÉES (attribution
//   paresseuse, sans double octroi) ;
// - bon consommé à la création d'un colis → colis directement payé ;
// - compte crédit : l'équipe crédite, l'hôtel paie courses et colis avec,
//   débit atomique et solde jamais négatif.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { pool } from '../src/db.js';
import {
  adminHeaders,
  app,
  authHeaders,
  createHotel,
  createTourist,
  createVerifiedDriver,
  useTestDb,
} from './setup.js';

useTestDb();

/** Insère directement n courses terminées pour l'hôtel (raccourci de test). */
async function seedCompletedTrips(hotelId, driverId, n) {
  for (let i = 0; i < n; i += 1) {
    await pool.query(
      `INSERT INTO trips (hotel_id, driver_id, client_name, client_phone, trip_type, pickup_location,
                          dropoff_location, price, commission, currency, status, completed_at)
       VALUES ($1, $2, 'Client Test', '+33600000000', 'private', 'Nungwi', 'Aéroport (AAKIA)',
               47.5, 7.13, 'USD', 'completed', now())`,
      [hotelId, driverId]
    );
  }
}

async function createHotelPackage(token, hotelId, extra = {}) {
  return request(app)
    .post('/api/packages')
    .set(authHeaders(token))
    .send({
      senderType: 'hotel',
      senderHotelId: hotelId,
      size: 'medium',
      pickupLocation: 'Hôtel Test, Nungwi',
      dropoffLocation: 'Stone Town',
      recipientName: 'Mme Riziki',
      recipientPhone: '+255700000001',
      ...extra,
    });
}

describe('Fidélité hôtels — bons colis offerts', () => {
  it('19 courses → 0 bon ; 20 courses → 1 bon ; pas de double octroi', async () => {
    const { token, hotel } = await createHotel();
    const { driver } = await createVerifiedDriver();

    await seedCompletedTrips(hotel.id, driver.id, 19);
    let res = await request(app).get(`/api/hotels/${hotel.id}/fidelite`).set(authHeaders(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.completed_trips, 19);
    assert.equal(res.body.progress, 19);
    assert.equal(res.body.vouchers_available, 0);

    await seedCompletedTrips(hotel.id, driver.id, 1);
    res = await request(app).get(`/api/hotels/${hotel.id}/fidelite`).set(authHeaders(token));
    assert.equal(res.body.completed_trips, 20);
    assert.equal(res.body.progress, 0);
    assert.equal(res.body.vouchers_available, 1);

    // Reconsulter n'octroie pas de second bon.
    res = await request(app).get(`/api/hotels/${hotel.id}/fidelite`).set(authHeaders(token));
    assert.equal(res.body.vouchers_available, 1);
  });

  it('un autre hôtel ne voit pas ma fidélité → 403', async () => {
    const { hotel } = await createHotel();
    const { token: autreToken } = await createHotel();
    const res = await request(app)
      .get(`/api/hotels/${hotel.id}/fidelite`)
      .set(authHeaders(autreToken));
    assert.equal(res.status, 403);
  });

  it('bon utilisé à la création d\'un colis → colis PAYÉ direct, bon consommé', async () => {
    const { token, hotel } = await createHotel();
    const { driver } = await createVerifiedDriver();
    await seedCompletedTrips(hotel.id, driver.id, 20);
    await request(app).get(`/api/hotels/${hotel.id}/fidelite`).set(authHeaders(token));

    const colis = await createHotelPackage(token, hotel.id, { useVoucher: true });
    assert.equal(colis.status, 201);
    assert.equal(colis.body.status, 'paid');
    assert.equal(colis.body.voucher_used, true);

    // Trace comptable : paiement confirmé référencé VOUCHER-…
    const { rows: paiements } = await pool.query(
      'SELECT * FROM payments WHERE package_id = $1',
      [colis.body.id]
    );
    assert.equal(paiements.length, 1);
    assert.equal(paiements[0].status, 'confirmed');
    assert.ok(paiements[0].pesapal_reference.startsWith('VOUCHER-'));

    // Le bon est consommé : un second envoi gratuit → 409 no_voucher.
    const refus = await createHotelPackage(token, hotel.id, { useVoucher: true });
    assert.equal(refus.status, 409);
    assert.equal(refus.body.error.code, 'no_voucher');
  });

  it('useVoucher par un client (non-hôtel) → 403 ; hôtel sans bon → 409', async () => {
    // Client particulier : les bons sont réservés aux hôtels.
    const { token: touristToken, user } = await createTourist();
    const refusClient = await request(app)
      .post('/api/packages')
      .set(authHeaders(touristToken))
      .send({
        senderType: 'user',
        senderUserId: user.id,
        size: 'small',
        pickupLocation: 'Nungwi',
        dropoffLocation: 'Paje',
        recipientName: 'Xavier',
        recipientPhone: '+255700000002',
        useVoucher: true,
      });
    assert.equal(refusClient.status, 403);

    // Hôtel vérifié mais sans aucun bon : 409 no_voucher.
    const { token, hotel } = await createHotel();
    const refusSansBon = await createHotelPackage(token, hotel.id, { useVoucher: true });
    assert.equal(refusSansBon.status, 409);
    assert.equal(refusSansBon.body.error.code, 'no_voucher');
  });
});

describe('Crédit prépayé hôtels', () => {
  it('équipe crédite → solde et historique ; débit sous zéro refusé', async () => {
    const { token, hotel } = await createHotel();

    const credit = await request(app)
      .post(`/api/hotels/${hotel.id}/credit`)
      .set(adminHeaders())
      .send({ amount: 200, note: 'Recharge M-Pesa reçue' });
    assert.equal(credit.status, 200);
    assert.equal(credit.body.balance, 200);

    const etat = await request(app)
      .get(`/api/hotels/${hotel.id}/credit`)
      .set(authHeaders(token));
    assert.equal(etat.body.balance, 200);
    assert.equal(etat.body.transactions.length, 1);
    assert.equal(etat.body.transactions[0].reason, 'topup');

    const retrait = await request(app)
      .post(`/api/hotels/${hotel.id}/credit`)
      .set(adminHeaders())
      .send({ amount: -500 });
    assert.equal(retrait.status, 409);
    assert.equal(retrait.body.error.code, 'insufficient_credit');
  });

  it('sans clé équipe → 401', async () => {
    const { token, hotel } = await createHotel();
    const res = await request(app)
      .post(`/api/hotels/${hotel.id}/credit`)
      .set(authHeaders(token))
      .send({ amount: 100 });
    assert.equal(res.status, 401);
  });

  it('course payée avec le crédit : débit, paiement confirmé, course paid', async () => {
    const { token, hotel } = await createHotel();
    const { driver } = await createVerifiedDriver();
    await request(app)
      .post(`/api/hotels/${hotel.id}/credit`)
      .set(adminHeaders())
      .send({ amount: 100 });

    const trip = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        hotelId: hotel.id,
        clientName: 'M. Dupont',
        clientPhone: '+33612345678',
        tripType: 'private',
        pickupLocation: 'Hôtel Test, Nungwi',
        dropoffLocation: 'Aéroport (AAKIA)',
      });
    assert.equal(trip.status, 201);
    await request(app)
      .patch(`/api/trips/${trip.body.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: driver.id });

    const paiement = await request(app)
      .post(`/api/trips/${trip.body.id}/payment`)
      .set(authHeaders(token))
      .send({ method: 'credit' });
    assert.equal(paiement.status, 201);
    assert.equal(paiement.body.status, 'confirmed');
    assert.equal(paiement.body.payment_method, 'credit');

    const apres = await request(app).get(`/api/trips/${trip.body.id}`).set(authHeaders(token));
    assert.equal(apres.body.status, 'paid');

    // 100 − 47,50 = 52,50 restants.
    const etat = await request(app).get(`/api/hotels/${hotel.id}/credit`).set(authHeaders(token));
    assert.equal(etat.body.balance, 52.5);
  });

  it('crédit insuffisant pour une course → 409, rien n\'est débité', async () => {
    const { token, hotel } = await createHotel();
    const { driver } = await createVerifiedDriver();
    await request(app)
      .post(`/api/hotels/${hotel.id}/credit`)
      .set(adminHeaders())
      .send({ amount: 10 });

    const trip = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        hotelId: hotel.id,
        clientName: 'M. Dupont',
        clientPhone: '+33612345678',
        tripType: 'private',
        pickupLocation: 'Hôtel Test, Nungwi',
        dropoffLocation: 'Aéroport (AAKIA)',
      });
    await request(app)
      .patch(`/api/trips/${trip.body.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: driver.id });

    const paiement = await request(app)
      .post(`/api/trips/${trip.body.id}/payment`)
      .set(authHeaders(token))
      .send({ method: 'credit' });
    assert.equal(paiement.status, 409);
    assert.equal(paiement.body.error.code, 'insufficient_credit');

    const etat = await request(app).get(`/api/hotels/${hotel.id}/credit`).set(authHeaders(token));
    assert.equal(etat.body.balance, 10);
  });

  it('colis payé avec le crédit : débit et colis paid', async () => {
    const { token, hotel } = await createHotel();
    await request(app)
      .post(`/api/hotels/${hotel.id}/credit`)
      .set(adminHeaders())
      .send({ amount: 50 });

    const colis = await createHotelPackage(token, hotel.id);
    assert.equal(colis.status, 201);
    assert.equal(colis.body.status, 'created');

    const paiement = await request(app)
      .post(`/api/packages/${colis.body.id}/payment`)
      .set(authHeaders(token))
      .send({ method: 'credit' });
    assert.equal(paiement.status, 201);
    assert.equal(paiement.body.payment_method, 'credit');

    const apres = await request(app)
      .get(`/api/packages/${colis.body.id}`)
      .set(authHeaders(token));
    assert.equal(apres.body.status, 'paid');

    // Colis medium hôtel : 10 USD − 5 % = 9,50 → 50 − 9,50 = 40,50.
    const etat = await request(app).get(`/api/hotels/${hotel.id}/credit`).set(authHeaders(token));
    assert.equal(etat.body.balance, 40.5);
  });
});

describe('Conversion des bons en crédit', () => {
  it('un bon converti = +10 USD de crédit ; sans bon → 409', async () => {
    const { token, hotel } = await createHotel();
    const { driver } = await createVerifiedDriver();
    await seedCompletedTrips(hotel.id, driver.id, 20);
    await request(app).get(`/api/hotels/${hotel.id}/fidelite`).set(authHeaders(token));

    const conversion = await request(app)
      .post(`/api/hotels/${hotel.id}/vouchers/convertir`)
      .set(authHeaders(token))
      .send({});
    assert.equal(conversion.status, 200);
    assert.equal(conversion.body.credited, 10);
    assert.equal(conversion.body.balance, 10);

    // Le bon est consommé : plus rien à convertir.
    const refus = await request(app)
      .post(`/api/hotels/${hotel.id}/vouchers/convertir`)
      .set(authHeaders(token))
      .send({});
    assert.equal(refus.status, 409);
    assert.equal(refus.body.error.code, 'no_voucher');

    // La fidélité reflète le bon utilisé, le crédit la recharge.
    const fidelite = await request(app)
      .get(`/api/hotels/${hotel.id}/fidelite`)
      .set(authHeaders(token));
    assert.equal(fidelite.body.vouchers_available, 0);
    assert.equal(fidelite.body.vouchers_used, 1);
    const etat = await request(app).get(`/api/hotels/${hotel.id}/credit`).set(authHeaders(token));
    assert.equal(etat.body.balance, 10);
    assert.equal(etat.body.transactions[0].reason, 'voucher_credit');
  });
});
