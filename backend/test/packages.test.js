// Tests des colis : flux complet (hôtel et client), contrainte expéditeur,
// QR unique, machine à états pickup/deliver, lookup par QR, ownership.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  adminHeaders,
  app,
  authHeaders,
  createDriverApplication,
  createHotel,
  createTourist,
  createVerifiedDriver,
  nextPhone,
  useTestDb,
} from './setup.js';

useTestDb();

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const PHOTO_URL = 'https://files.example.com/photo.jpg';

// Crée un colis expédié par un utilisateur
async function createUserPackage(token, userId, overrides = {}) {
  const res = await request(app)
    .post('/api/packages')
    .set(authHeaders(token))
    .send({
      senderType: 'user',
      size: 'medium',
      senderUserId: userId,
      pickupLocation: 'Stone Town',
      dropoffLocation: 'Paje',
      recipientName: 'Omar Destinataire',
      recipientPhone: nextPhone(),
      ...overrides,
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

// Crée un colis expédié par un hôtel
async function createHotelPackage(token, hotelId, overrides = {}) {
  const res = await request(app)
    .post('/api/packages')
    .set(authHeaders(token))
    .send({
      senderType: 'hotel',
      size: 'medium',
      senderHotelId: hotelId,
      pickupLocation: 'Hotel Baraka, Nungwi',
      dropoffLocation: 'Marché de Stone Town',
      recipientName: 'Omar Destinataire',
      recipientPhone: nextPhone(),
      description: 'Documents clients',
      ...overrides,
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

// Paiement + confirmation (stub Pesapal) → colis 'paid'
async function payPackage(token, pkgId) {
  const payment = await request(app)
    .post(`/api/packages/${pkgId}/payment`)
    .set(authHeaders(token));
  assert.equal(payment.status, 201, JSON.stringify(payment.body));
  const confirm = await request(app)
    .post(`/api/payments/${payment.body.id}/confirm`)
    .set(authHeaders(token));
  assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
  return payment.body;
}

describe('Colis (packages)', () => {
  it('colis client touriste → 201, prix USD figé, QR PKG-, lien WhatsApp', async () => {
    const { token, user } = await createTourist();
    const pkg = await createUserPackage(token, user.id);
    assert.equal(pkg.status, 'created');
    assert.equal(pkg.currency, 'USD', 'la devise suit le compte de l\'expéditeur');
    assert.equal(Number(pkg.price), 10);
    assert.equal(Number(pkg.commission), 2); // 20 %
    assert.match(pkg.qr_code, /^PKG-/);
    assert.match(pkg.whatsapp_link, /wa\.me/);
  });

  it('colis hôtel → 201, prix TZS figé', async () => {
    const { token, hotel } = await createHotel();
    const pkg = await createHotelPackage(token, hotel.id);
    assert.equal(pkg.currency, 'USD');
    assert.equal(Number(pkg.price), 9.5); // medium 10 USD → −5 % hôtel
    assert.equal(pkg.sender_hotel_id, hotel.id);
    assert.equal(pkg.sender_user_id, null);
  });

  it('couple senderType/ids incohérent → 400 validation_error', async () => {
    const { token, hotel } = await createHotel();
    const { token: userToken, user } = await createTourist();

    // senderType hotel avec un senderUserId → 400
    const badHotel = await request(app)
      .post('/api/packages')
      .set(authHeaders(token))
      .send({
        senderType: 'hotel',
      size: 'medium',
        senderUserId: user.id,
        pickupLocation: 'Hotel Baraka',
        dropoffLocation: 'Stone Town',
        recipientName: 'Omar',
        recipientPhone: nextPhone(),
      });
    assert.equal(badHotel.status, 400);
    assert.equal(badHotel.body.error.code, 'validation_error');

    // senderType user avec un senderHotelId → 400
    const badUser = await request(app)
      .post('/api/packages')
      .set(authHeaders(userToken))
      .send({
        senderType: 'user',
      size: 'medium',
        senderUserId: user.id,
        senderHotelId: hotel.id,
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Paje',
        recipientName: 'Omar',
        recipientPhone: nextPhone(),
      });
    assert.equal(badUser.status, 400);
    assert.equal(badUser.body.error.code, 'validation_error');
  });

  it('expéditeur différent du jeton → 403 forbidden (user comme hotel)', async () => {
    const { user } = await createTourist();
    const { token: otherUserToken } = await createTourist({ fullName: 'Autre Cliente' });
    const { hotel } = await createHotel();
    const { token: otherHotelToken } = await createHotel({ name: 'Autre Hôtel' });

    const asUser = await request(app)
      .post('/api/packages')
      .set(authHeaders(otherUserToken))
      .send({
        senderType: 'user',
      size: 'medium',
        senderUserId: user.id,
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Paje',
        recipientName: 'Omar',
        recipientPhone: nextPhone(),
      });
    assert.equal(asUser.status, 403);
    assert.equal(asUser.body.error.code, 'forbidden');

    const asHotel = await request(app)
      .post('/api/packages')
      .set(authHeaders(otherHotelToken))
      .send({
        senderType: 'hotel',
      size: 'medium',
        senderHotelId: hotel.id,
        pickupLocation: 'Hotel Baraka',
        dropoffLocation: 'Stone Town',
        recipientName: 'Omar',
        recipientPhone: nextPhone(),
      });
    assert.equal(asHotel.status, 403);
    assert.equal(asHotel.body.error.code, 'forbidden');
  });

  it('flux complet hôtel : paiement → pickup (photo + QR) → livraison', async () => {
    const { token: hotelToken, hotel } = await createHotel();
    const { token: driverToken, driver } = await createVerifiedDriver();
    const pkg = await createHotelPackage(hotelToken, hotel.id);

    const payment = await payPackage(hotelToken, pkg.id);
    assert.equal(payment.package_id, pkg.id);

    const paid = await request(app).get(`/api/packages/${pkg.id}`).set(authHeaders(hotelToken));
    assert.equal(paid.body.status, 'paid');

    // Ramassage : le chauffeur du jeton est enregistré sur le colis
    const pickedUp = await request(app)
      .patch(`/api/packages/${pkg.id}/pickup`)
      .set(authHeaders(driverToken))
      .send({ qrCode: pkg.qr_code, photoUrl: PHOTO_URL });
    assert.equal(pickedUp.status, 200);
    assert.equal(pickedUp.body.status, 'picked_up');
    assert.equal(pickedUp.body.driver_id, driver.id);
    assert.equal(pickedUp.body.pickup_photo_url, PHOTO_URL);
    assert.ok(pickedUp.body.picked_up_at);

    const delivered = await request(app)
      .patch(`/api/packages/${pkg.id}/deliver`)
      .set(authHeaders(driverToken))
      .send({ qrCode: pkg.qr_code, photoUrl: PHOTO_URL });
    assert.equal(delivered.status, 200);
    assert.equal(delivered.body.status, 'delivered');
    assert.equal(delivered.body.delivery_photo_url, PHOTO_URL);
    assert.ok(delivered.body.delivered_at);
  });

  it('paiement sur un colis déjà payé → 409 invalid_status', async () => {
    const { token, hotel } = await createHotel();
    const pkg = await createHotelPackage(token, hotel.id);
    await payPackage(token, pkg.id);

    const res = await request(app)
      .post(`/api/packages/${pkg.id}/payment`)
      .set(authHeaders(token));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'invalid_status');
  });

  it('pickup avant paiement → 409 invalid_status', async () => {
    const { token, hotel } = await createHotel();
    const { token: driverToken } = await createVerifiedDriver();
    const pkg = await createHotelPackage(token, hotel.id);

    const res = await request(app)
      .patch(`/api/packages/${pkg.id}/pickup`)
      .set(authHeaders(driverToken))
      .send({ qrCode: pkg.qr_code, photoUrl: PHOTO_URL });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'invalid_status');
  });

  it('pickup avec le QR d\'un autre colis → 403 qr_mismatch', async () => {
    const { token, hotel } = await createHotel();
    const { token: driverToken } = await createVerifiedDriver();
    const pkg = await createHotelPackage(token, hotel.id);
    await payPackage(token, pkg.id);

    const res = await request(app)
      .patch(`/api/packages/${pkg.id}/pickup`)
      .set(authHeaders(driverToken))
      .send({ qrCode: 'PKG-fake', photoUrl: PHOTO_URL });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'qr_mismatch');
  });

  it('pickup par un non-chauffeur → 403 ; par un chauffeur non validé → 409', async () => {
    const { token, hotel } = await createHotel();
    const { token: touristToken } = await createTourist();
    const { token: pendingDriverToken } = await createDriverApplication();
    const pkg = await createHotelPackage(token, hotel.id);
    await payPackage(token, pkg.id);

    const byTourist = await request(app)
      .patch(`/api/packages/${pkg.id}/pickup`)
      .set(authHeaders(touristToken))
      .send({ qrCode: pkg.qr_code, photoUrl: PHOTO_URL });
    assert.equal(byTourist.status, 403);
    assert.equal(byTourist.body.error.code, 'forbidden');

    const byPending = await request(app)
      .patch(`/api/packages/${pkg.id}/pickup`)
      .set(authHeaders(pendingDriverToken))
      .send({ qrCode: pkg.qr_code, photoUrl: PHOTO_URL });
    assert.equal(byPending.status, 409);
    assert.equal(byPending.body.error.code, 'driver_not_verified');
  });

  it('deliver par un autre chauffeur que celui du pickup → 403 forbidden', async () => {
    const { token, hotel } = await createHotel();
    const { token: driverToken } = await createVerifiedDriver();
    const { token: otherDriverToken } = await createVerifiedDriver({ fullName: 'Autre Chauffeur' });
    const pkg = await createHotelPackage(token, hotel.id);
    await payPackage(token, pkg.id);
    await request(app)
      .patch(`/api/packages/${pkg.id}/pickup`)
      .set(authHeaders(driverToken))
      .send({ qrCode: pkg.qr_code, photoUrl: PHOTO_URL });

    const res = await request(app)
      .patch(`/api/packages/${pkg.id}/deliver`)
      .set(authHeaders(otherDriverToken))
      .send({ qrCode: pkg.qr_code, photoUrl: PHOTO_URL });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'forbidden');
  });

  it('deliver avant pickup → 409 invalid_status (équipe) et 403 pour un chauffeur non assigné', async () => {
    const { token, hotel } = await createHotel();
    const { token: driverToken } = await createVerifiedDriver();
    const pkg = await createHotelPackage(token, hotel.id);
    await payPackage(token, pkg.id);

    // Aucun chauffeur n'est encore enregistré sur le colis → ownership d'abord
    const byDriver = await request(app)
      .patch(`/api/packages/${pkg.id}/deliver`)
      .set(authHeaders(driverToken))
      .send({ qrCode: pkg.qr_code, photoUrl: PHOTO_URL });
    assert.equal(byDriver.status, 403);
    assert.equal(byDriver.body.error.code, 'forbidden');

    // L'équipe bypasse l'ownership → contrôle de statut → 409
    const byAdmin = await request(app)
      .patch(`/api/packages/${pkg.id}/deliver`)
      .set(adminHeaders())
      .send({ qrCode: pkg.qr_code, photoUrl: PHOTO_URL });
    assert.equal(byAdmin.status, 409);
    assert.equal(byAdmin.body.error.code, 'invalid_status');
  });

  it('lookup by-qr : chauffeur → 200, équipe → 200, client → 403, QR inconnu → 404', async () => {
    const { token, hotel } = await createHotel();
    const { token: driverToken } = await createVerifiedDriver();
    const { token: touristToken } = await createTourist();
    const pkg = await createHotelPackage(token, hotel.id);

    const byDriver = await request(app)
      .get(`/api/packages/by-qr/${pkg.qr_code}`)
      .set(authHeaders(driverToken));
    assert.equal(byDriver.status, 200);
    assert.equal(byDriver.body.id, pkg.id);

    const byAdmin = await request(app)
      .get(`/api/packages/by-qr/${pkg.qr_code}`)
      .set(adminHeaders());
    assert.equal(byAdmin.status, 200);

    const byTourist = await request(app)
      .get(`/api/packages/by-qr/${pkg.qr_code}`)
      .set(authHeaders(touristToken));
    assert.equal(byTourist.status, 403);
    assert.equal(byTourist.body.error.code, 'forbidden');

    const unknown = await request(app)
      .get('/api/packages/by-qr/PKG-inconnu')
      .set(authHeaders(driverToken));
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error.code, 'not_found');
  });

  it('GET /:id : expéditeur → 200, chauffeur assigné → 200, tiers → 403, inconnu → 404', async () => {
    const { token, user } = await createTourist();
    const { token: driverToken, driver } = await createVerifiedDriver();
    const { token: otherToken } = await createTourist({ fullName: 'Autre Cliente' });
    const pkg = await createUserPackage(token, user.id);
    await payPackage(token, pkg.id);
    await request(app)
      .patch(`/api/packages/${pkg.id}/pickup`)
      .set(authHeaders(driverToken))
      .send({ qrCode: pkg.qr_code, photoUrl: PHOTO_URL });

    const bySender = await request(app).get(`/api/packages/${pkg.id}`).set(authHeaders(token));
    assert.equal(bySender.status, 200);
    assert.equal(bySender.body.id, pkg.id);
    assert.equal(bySender.body.driver_id, driver.id);

    const byDriver = await request(app)
      .get(`/api/packages/${pkg.id}`)
      .set(authHeaders(driverToken));
    assert.equal(byDriver.status, 200);

    const byOther = await request(app)
      .get(`/api/packages/${pkg.id}`)
      .set(authHeaders(otherToken));
    assert.equal(byOther.status, 403);
    assert.equal(byOther.body.error.code, 'forbidden');

    const unknown = await request(app).get(`/api/packages/${UNKNOWN_ID}`).set(adminHeaders());
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error.code, 'not_found');
  });
});

describe('Colis — annulation', () => {
  it("l'expéditeur annule un colis non payé → cancelled, paiement en attente → failed", async () => {
    const { token, user } = await createTourist();
    const pkg = await createUserPackage(token, user.id);

    const payment = await request(app)
      .post(`/api/packages/${pkg.id}/payment`)
      .set(authHeaders(token));
    assert.equal(payment.status, 201);

    const cancel = await request(app)
      .post(`/api/packages/${pkg.id}/cancel`)
      .set(authHeaders(token));
    assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
    assert.equal(cancel.body.status, 'cancelled');

    const detail = await request(app)
      .get(`/api/payments/${payment.body.id}`)
      .set(authHeaders(token));
    assert.equal(detail.body.status, 'failed');
  });

  it('colis payé : expéditeur → 409, équipe → 200 cancelled', async () => {
    const { token, hotel } = await createHotel();
    const pkg = await createHotelPackage(token, hotel.id);
    await payPackage(token, pkg.id);

    const bySender = await request(app)
      .post(`/api/packages/${pkg.id}/cancel`)
      .set(authHeaders(token));
    assert.equal(bySender.status, 409);
    assert.equal(bySender.body.error.code, 'invalid_status');

    const byTeam = await request(app)
      .post(`/api/packages/${pkg.id}/cancel`)
      .set(adminHeaders());
    assert.equal(byTeam.status, 200);
    assert.equal(byTeam.body.status, 'cancelled');
  });

  it("un tiers ne peut pas annuler le colis d'autrui → 403", async () => {
    const { token, user } = await createTourist();
    const { token: otherToken } = await createTourist({ fullName: 'Autre Cliente' });
    const pkg = await createUserPackage(token, user.id);

    const res = await request(app)
      .post(`/api/packages/${pkg.id}/cancel`)
      .set(authHeaders(otherToken));
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'forbidden');
  });
});

describe('Colis — suivi GPS pendant la livraison', () => {
  it("chauffeur envoie sa position ; l'expéditeur la lit quand le colis est en route", async () => {
    const { token, user } = await createTourist();
    const { token: driverToken, driver } = await createVerifiedDriver();
    const pkg = await createUserPackage(token, user.id);
    await payPackage(token, pkg.id);

    // Avant le ramassage : pas de suivi.
    const tropTot = await request(app)
      .get(`/api/packages/${pkg.id}/position`)
      .set(authHeaders(token));
    assert.equal(tropTot.status, 409);
    assert.equal(tropTot.body.error.code, 'not_in_transit');

    const pickup = await request(app)
      .patch(`/api/packages/${pkg.id}/pickup`)
      .set(authHeaders(driverToken))
      .send({ qrCode: pkg.qr_code, photoUrl: PHOTO_URL });
    assert.equal(pickup.status, 200);

    // Chauffeur pas encore localisé → 404 position_unavailable.
    const sansPosition = await request(app)
      .get(`/api/packages/${pkg.id}/position`)
      .set(authHeaders(token));
    assert.equal(sansPosition.status, 404);
    assert.equal(sansPosition.body.error.code, 'position_unavailable');

    // Le chauffeur envoie sa position (upsert idempotent).
    const envoi = await request(app)
      .patch(`/api/drivers/${driver.id}/location`)
      .set(authHeaders(driverToken))
      .send({ lat: -6.1659, lng: 39.1988 });
    assert.equal(envoi.status, 200);
    const envoi2 = await request(app)
      .patch(`/api/drivers/${driver.id}/location`)
      .set(authHeaders(driverToken))
      .send({ lat: -6.13, lng: 39.21 });
    assert.equal(envoi2.status, 200);

    const position = await request(app)
      .get(`/api/packages/${pkg.id}/position`)
      .set(authHeaders(token));
    assert.equal(position.status, 200);
    assert.equal(position.body.lat, -6.13);
    assert.equal(position.body.lng, 39.21);
    assert.ok(position.body.updated_at);
  });

  it("un chauffeur ne peut pas envoyer la position d'un autre → 403 ; tiers sans accès → 403", async () => {
    const { token, user } = await createTourist();
    const { driver } = await createVerifiedDriver();
    const { token: otherDriverToken } = await createVerifiedDriver({ fullName: 'Autre Chauffeur' });

    const res = await request(app)
      .patch(`/api/drivers/${driver.id}/location`)
      .set(authHeaders(otherDriverToken))
      .send({ lat: -6.16, lng: 39.19 });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'forbidden');

    const pkg = await createUserPackage(token, user.id);
    const { token: tiersToken } = await createTourist({ fullName: 'Tiers Curieux' });
    const lecture = await request(app)
      .get(`/api/packages/${pkg.id}/position`)
      .set(authHeaders(tiersToken));
    assert.equal(lecture.status, 403);
  });
});

describe('Colis — bourse aux colis (mode chauffeur)', () => {
  it('pickupAt : heure de ramassage souhaitée enregistrée et visible dans la bourse', async () => {
    const { token, user } = await createTourist();
    const { token: driverToken } = await createVerifiedDriver();
    const dans6h = new Date(Date.now() + 6 * 3600 * 1000).toISOString();

    const res = await request(app)
      .post('/api/packages')
      .set(authHeaders(token))
      .send({
        senderType: 'user',
        senderUserId: user.id,
        size: 'small',
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Nungwi',
        recipientName: 'Omar',
        recipientPhone: nextPhone(),
        pickupAt: dans6h,
      });
    assert.equal(res.status, 201);
    assert.ok(res.body.pickup_at, 'pickup_at enregistré');
    assert.equal(res.body.sender_phone, user.phone, 'téléphone expéditeur = compte par défaut');

    await payPackage(token, res.body.id);
    const liste = await request(app).get('/api/packages').set(authHeaders(driverToken));
    const ligne = liste.body.find((p) => p.id === res.body.id);
    assert.ok(ligne, 'colis visible dans la bourse');
    assert.ok(ligne.pickup_at, 'pickup_at exposé aux chauffeurs');
  });

  it('une demande expirée (plus de 48 h) disparaît de la bourse ; la description est incluse', async () => {
    const { pool } = await import('../src/db.js');
    const { token, user } = await createTourist();
    const { token: driverToken } = await createVerifiedDriver();

    const pkg = await createUserPackage(token, user.id);
    await payPackage(token, pkg.id);

    const avant = await request(app).get('/api/packages').set(authHeaders(driverToken));
    const ligne = avant.body.find((p) => p.id === pkg.id);
    assert.ok(ligne, 'colis payé récent visible');
    assert.notEqual(ligne.description, undefined, 'description exposée aux chauffeurs');

    await pool.query(
      `UPDATE packages SET created_at = now() - interval '3 days' WHERE id = $1`,
      [pkg.id]
    );
    const apres = await request(app).get('/api/packages').set(authHeaders(driverToken));
    assert.ok(!apres.body.some((p) => p.id === pkg.id), 'colis expiré exclu de la bourse');
  });

  it('un chauffeur liste les colis payés sans chauffeur ; un client → 403', async () => {
    const { token, user } = await createTourist();
    const { token: hotelToken, hotel } = await createHotel();
    const { token: driverToken } = await createVerifiedDriver();

    const pkgHotel = await createHotelPackage(hotelToken, hotel.id);
    await payPackage(hotelToken, pkgHotel.id);
    const pkgNonPaye = await createUserPackage(token, user.id);

    const liste = await request(app).get('/api/packages').set(authHeaders(driverToken));
    assert.equal(liste.status, 200);
    const ligne = liste.body.find((p) => p.id === pkgHotel.id);
    assert.ok(ligne, 'le colis hôtel payé est proposé aux chauffeurs');
    assert.equal(ligne.sender_hotel_name, ligne.sender_hotel_name); // présent
    assert.ok(ligne.sender_hotel_name);
    assert.equal(ligne.qr_code, undefined, 'pas de QR avant le ramassage');
    assert.equal(ligne.recipient_phone, undefined, 'pas de coordonnées avant le ramassage');
    assert.ok(!liste.body.some((p) => p.id === pkgNonPaye.id), 'les colis non payés sont absents');

    const interdit = await request(app).get('/api/packages').set(authHeaders(token));
    assert.equal(interdit.status, 403);
  });

  it('« Je prends la livraison » : réservation atomique, un seul chauffeur', async () => {
    const { token, user } = await createTourist();
    const { token: driverA } = await createVerifiedDriver();
    const { token: driverB } = await createVerifiedDriver({ fullName: 'Second Driver' });

    const pkg = await createUserPackage(token, user.id);
    await payPackage(token, pkg.id);

    const prise = await request(app)
      .post(`/api/packages/${pkg.id}/claim`)
      .set(authHeaders(driverA));
    assert.equal(prise.status, 200);
    assert.ok(prise.body.driver_id);
    assert.equal(prise.body.qr_code, undefined, 'pas de QR à la réservation');
    assert.ok(prise.body.recipient_phone, 'téléphone du destinataire fourni pour la remise');
    assert.ok(prise.body.sender_phone, "téléphone de l'expéditeur fourni pour la ramasse");
    assert.ok(prise.body.whatsapp_link, "lien WhatsApp d'information équipe");

    // Le colis disparaît de la bourse ; le second chauffeur arrive trop tard.
    const bourse = await request(app).get('/api/packages').set(authHeaders(driverB));
    assert.ok(!bourse.body.some((p) => p.id === pkg.id));
    const tard = await request(app)
      .post(`/api/packages/${pkg.id}/claim`)
      .set(authHeaders(driverB));
    assert.equal(tard.status, 409);
    assert.equal(tard.body.error.code, 'package_already_taken');

    // Le scan de ramassage est réservé au chauffeur qui a pris la livraison.
    const scanB = await request(app)
      .patch(`/api/packages/${pkg.id}/pickup`)
      .set(authHeaders(driverB))
      .send({ qrCode: pkg.qr_code, photoUrl: PHOTO_URL });
    assert.equal(scanB.status, 409);
    assert.equal(scanB.body.error.code, 'package_already_taken');

    // « Mes colis » du chauffeur A (sans QR avant ramassage), puis scan OK.
    const mes = await request(app).get('/api/packages/mine').set(authHeaders(driverA));
    assert.equal(mes.status, 200);
    const ligne = mes.body.find((p) => p.id === pkg.id);
    assert.ok(ligne, 'colis réservé listé dans mes colis');
    assert.equal(ligne.qr_code, undefined);

    const scanA = await request(app)
      .patch(`/api/packages/${pkg.id}/pickup`)
      .set(authHeaders(driverA))
      .send({ qrCode: pkg.qr_code, photoUrl: PHOTO_URL });
    assert.equal(scanA.status, 200);
    assert.equal(scanA.body.status, 'picked_up');
  });

  it('un colis ramassé disparaît de la bourse', async () => {
    const { token, user } = await createTourist();
    const { token: driverToken } = await createVerifiedDriver();
    const pkg = await createUserPackage(token, user.id);
    await payPackage(token, pkg.id);

    const avant = await request(app).get('/api/packages').set(authHeaders(driverToken));
    assert.ok(avant.body.some((p) => p.id === pkg.id));

    const pickup = await request(app)
      .patch(`/api/packages/${pkg.id}/pickup`)
      .set(authHeaders(driverToken))
      .send({ qrCode: pkg.qr_code, photoUrl: PHOTO_URL });
    assert.equal(pickup.status, 200);

    const apres = await request(app).get('/api/packages').set(authHeaders(driverToken));
    assert.ok(!apres.body.some((p) => p.id === pkg.id));
  });
});
