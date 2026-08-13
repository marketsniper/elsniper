// Pack d'améliorations : n° de vol, aller-retour ×1,8, options véhicule,
// pourboire, parrainage (clients + chauffeurs), liste d'attente du taxi
// partagé, dates d'expiration des documents chauffeurs, sauvegarde.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { pool } from '../src/db.js';
import {
  adminHeaders,
  app,
  authHeaders,
  createTourist,
  createVerifiedDriver,
  nextPhone,
  useTestDb,
} from './setup.js';

useTestDb();

describe('Pack améliorations', () => {
  it('transfert aéroport : n° de vol + options enregistrés et visibles sur la course', async () => {
    const { token, user } = await createTourist();
    const creation = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: user.id,
        tripType: 'private',
        pickupLocation: 'Aéroport (AAKIA)',
        dropoffLocation: 'Nungwi',
        flightNumber: 'et815',
        babySeat: true,
        bulkyLuggage: true,
      });
    assert.equal(creation.status, 201, JSON.stringify(creation.body));
    assert.equal(creation.body.flight_number, 'ET815'); // normalisé en majuscules
    assert.equal(creation.body.baby_seat, true);
    assert.equal(creation.body.bulky_luggage, true);
    assert.equal(creation.body.round_trip, false);
    assert.equal(Number(creation.body.price), 50); // aller simple : prix normal
  });

  it('aller-retour avec attente : prix et commission ×1,8 (privé uniquement)', async () => {
    const { token, user } = await createTourist();
    const ar = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: user.id,
        tripType: 'private',
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Nungwi',
        roundTrip: true,
      });
    assert.equal(ar.status, 201, JSON.stringify(ar.body));
    assert.equal(ar.body.round_trip, true);
    assert.equal(Number(ar.body.price), 90); // 50 × 1,8
    assert.equal(Number(ar.body.commission), 9); // 5 × 1,8

    // Sur un partagé, le drapeau est ignoré (pas d'aller-retour partagé).
    const partage = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: user.id,
        tripType: 'shared_tourist',
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Nungwi',
        roundTrip: true,
      });
    assert.equal(partage.status, 201);
    assert.equal(partage.body.round_trip, false);
    assert.equal(Number(partage.body.price), 18);
  });

  it('pourboire : course terminée uniquement, une seule fois, plafonné', async () => {
    const { token, user } = await createTourist();
    const { driver, token: driverToken } = await createVerifiedDriver();
    const trip = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: user.id,
        tripType: 'private',
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Paje',
      });

    // Avant la fin de la course : refusé.
    const tropTot = await request(app)
      .post(`/api/trips/${trip.body.id}/tip`)
      .set(authHeaders(token))
      .send({ amount: 5 });
    assert.equal(tropTot.status, 409);

    // Assignation → paiement → départ → arrivée.
    await request(app)
      .patch(`/api/trips/${trip.body.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: driver.id });
    const paiement = await request(app)
      .post(`/api/trips/${trip.body.id}/payment`)
      .set(authHeaders(token));
    await request(app)
      .post(`/api/payments/${paiement.body.id}/confirm`)
      .set(authHeaders(token));
    await request(app)
      .patch(`/api/trips/${trip.body.id}/start`)
      .set(authHeaders(driverToken))
      .send({});
    await request(app)
      .patch(`/api/trips/${trip.body.id}/complete`)
      .set(authHeaders(driverToken))
      .send({});

    // Plafond : 200 USD max sur une course en USD.
    const tropGros = await request(app)
      .post(`/api/trips/${trip.body.id}/tip`)
      .set(authHeaders(token))
      .send({ amount: 500 });
    assert.equal(tropGros.status, 400);
    assert.equal(tropGros.body.error.code, 'tip_too_high');

    const ok = await request(app)
      .post(`/api/trips/${trip.body.id}/tip`)
      .set(authHeaders(token))
      .send({ amount: 5 });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(Number(ok.body.tip_amount), 5);

    const doublon = await request(app)
      .post(`/api/trips/${trip.body.id}/tip`)
      .set(authHeaders(token))
      .send({ amount: 2 });
    assert.equal(doublon.status, 409);
    assert.equal(doublon.body.error.code, 'already_tipped');

    // Le chauffeur voit le pourboire sur sa course.
    const courses = await request(app)
      .get(`/api/drivers/${driver.id}/trips`)
      .set(authHeaders(driverToken));
    assert.equal(Number(courses.body[0].tip_amount), 5);
  });

  it('parrainage client : code ZG- attribué, filleul relié, code invalide refusé', async () => {
    const { user: parrain } = await createTourist();
    assert.match(parrain.referral_code, /^ZG-[A-Z0-9]{6}$/);

    // Filleul : inscription avec le code du parrain (en minuscules — toléré).
    const phone = nextPhone();
    const jeton = await request(app)
      .post('/api/auth/visitor-register')
      .send({ phone, password: 'FilleulMdp1' });
    const filleul = await request(app)
      .post('/api/users')
      .set(authHeaders(jeton.body.token))
      .send({
        fullName: 'Filleul Heureux',
        phone,
        accountType: 'tourist',
        referralCode: parrain.referral_code.toLowerCase(),
      });
    assert.equal(filleul.status, 201, JSON.stringify(filleul.body));
    assert.equal(filleul.body.referred_by_user_id, parrain.id);
    assert.match(filleul.body.referral_code, /^ZG-/); // il a son propre code

    // Code invalide → 400 explicite (pas de parrainage perdu en silence).
    const phone2 = nextPhone();
    const jeton2 = await request(app)
      .post('/api/auth/visitor-register')
      .send({ phone: phone2, password: 'FilleulMdp2' });
    const rate = await request(app)
      .post('/api/users')
      .set(authHeaders(jeton2.body.token))
      .send({ fullName: 'Code Faux', phone: phone2, accountType: 'tourist', referralCode: 'ZG-ZZZZZZ' });
    assert.equal(rate.status, 400);
    assert.equal(rate.body.error.code, 'invalid_referral_code');

    // L'équipe voit le nom du parrain dans la liste clients.
    const liste = await request(app).get('/api/users').set(adminHeaders());
    const ligneFilleul = liste.body.find((u) => u.id === filleul.body.id);
    assert.equal(ligneFilleul.referred_by_name, parrain.full_name);
  });

  it('parrainage : la récompense est acquise à la 2e course TERMINÉE du filleul', async () => {
    const { user: parrain } = await createTourist();
    const phone = nextPhone();
    const jeton = await request(app)
      .post('/api/auth/visitor-register')
      .send({ phone, password: 'FilleulMdp1' });
    const filleul = await request(app)
      .post('/api/users')
      .set(authHeaders(jeton.body.token))
      .send({
        fullName: 'Filleul Assidu',
        phone,
        accountType: 'tourist',
        referralCode: parrain.referral_code,
      });

    const { driver, token: driverToken } = await createVerifiedDriver();
    const faireUneCourse = async () => {
      const trip = await request(app)
        .post('/api/trips')
        .set(authHeaders(jeton.body.token))
        .send({
          userId: filleul.body.id,
          tripType: 'private',
          pickupLocation: 'Stone Town',
          dropoffLocation: 'Paje',
        });
      await request(app)
        .patch(`/api/trips/${trip.body.id}/assign-driver`)
        .set(adminHeaders())
        .send({ driverId: driver.id });
      const paiement = await request(app)
        .post(`/api/trips/${trip.body.id}/payment`)
        .set(authHeaders(jeton.body.token));
      await request(app)
        .post(`/api/payments/${paiement.body.id}/confirm`)
        .set(authHeaders(jeton.body.token));
      await request(app)
        .patch(`/api/trips/${trip.body.id}/start`)
        .set(authHeaders(driverToken))
        .send({});
      await request(app)
        .patch(`/api/trips/${trip.body.id}/complete`)
        .set(authHeaders(driverToken))
        .send({});
    };

    // 1re course terminée : rien encore.
    await faireUneCourse();
    await new Promise((r) => setTimeout(r, 200));
    let { rows } = await pool.query('SELECT referral_rewarded_at FROM users WHERE id = $1', [
      filleul.body.id,
    ]);
    assert.equal(rows[0].referral_rewarded_at, null);

    // 2e course terminée : la récompense est acquise (horodatée une fois).
    await faireUneCourse();
    await new Promise((r) => setTimeout(r, 300));
    ({ rows } = await pool.query('SELECT referral_rewarded_at FROM users WHERE id = $1', [
      filleul.body.id,
    ]));
    assert.ok(rows[0].referral_rewarded_at, 'la récompense doit être acquise après 2 courses');
  });

  it('aéroport : le vrai nom « Abeid Amani Karume » est reconnu partout', async () => {
    const { privateUsdForRoute } = await import('../src/services/pricingService.js');
    // Grille hub inchangée sous le nouveau nom (et l'ancien reste accepté).
    assert.equal(privateUsdForRoute('Aéroport Abeid Amani Karume', 'Nungwi'), 50);
    assert.equal(privateUsdForRoute('Aéroport (AAKIA)', 'Nungwi'), 50);

    // Les annonces partagées acceptent les deux libellés de départ.
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const depart = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const nouveau = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({
        origin: 'Aéroport Abeid Amani Karume',
        destination: 'Nungwi',
        departureAt: depart,
        seatsTotal: 4,
      });
    assert.equal(nouveau.status, 201, JSON.stringify(nouveau.body));
    const ancien = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({ origin: 'Aéroport (AAKIA)', destination: 'Paje', departureAt: depart, seatsTotal: 4 });
    assert.equal(ancien.status, 201, JSON.stringify(ancien.body));
    // Et la liste servie aux menus n'affiche QUE le nouveau nom.
    const lieux = await request(app).get('/api/rides/locations');
    assert.ok(lieux.body.origins.includes('Aéroport Abeid Amani Karume'));
    assert.ok(!lieux.body.origins.includes('Aéroport (AAKIA)'));
  });

  it('liste d\'attente : demande posée, marquée trouvée quand une annonce correspond', async () => {
    const { token, user } = await createTourist();
    const demande = await request(app)
      .post('/api/rides/attente')
      .set(authHeaders(token))
      .send({ origin: 'Stone Town', destination: 'Nungwi', seats: 2 });
    assert.equal(demande.status, 201, JSON.stringify(demande.body));
    assert.equal(demande.body.seats, 2);

    // Le client voit sa demande ; l'équipe aussi, avec son contact.
    const mesDemandes = await request(app).get('/api/rides/attente').set(authHeaders(token));
    assert.equal(mesDemandes.body.length, 1);
    const equipe = await request(app).get('/api/rides/attente').set(adminHeaders());
    assert.equal(equipe.body[0].full_name, user.full_name);

    // Une annonce Stone Town → Nungwi sort : la demande passe « trouvée ».
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const depart = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const annonce = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({ origin: 'Stone Town', destination: 'Nungwi', departureAt: depart, seatsTotal: 4 });
    assert.equal(annonce.status, 201);
    // (signalement asynchrone — on interroge la base directement)
    await new Promise((r) => setTimeout(r, 300));
    const { rows } = await pool.query('SELECT matched_at FROM ride_waitlist WHERE id = $1', [
      demande.body.id,
    ]);
    assert.ok(rows[0].matched_at, 'la demande doit être marquée trouvée');
  });

  it('liste d\'attente : le client peut retirer sa demande', async () => {
    const { token } = await createTourist();
    const demande = await request(app)
      .post('/api/rides/attente')
      .set(authHeaders(token))
      .send({ origin: 'Paje', destination: 'Stone Town' });
    const retrait = await request(app)
      .post(`/api/rides/attente/${demande.body.id}/cancel`)
      .set(authHeaders(token));
    assert.equal(retrait.status, 200);
    assert.ok(retrait.body.cancelled_at);
    const mesDemandes = await request(app).get('/api/rides/attente').set(authHeaders(token));
    assert.equal(mesDemandes.body.length, 0);
  });

  it('documents chauffeur : l\'équipe pose les dates d\'expiration, l\'alerte se déclenche', async () => {
    const { driver } = await createVerifiedDriver();
    const bientot = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    const maj = await request(app)
      .patch(`/api/drivers/${driver.id}/documents`)
      .set(adminHeaders())
      .send({ licenseExpiresOn: bientot });
    assert.equal(maj.status, 200, JSON.stringify(maj.body));
    assert.equal(String(maj.body.license_expires_on).slice(0, 10), bientot);

    // Le balayage (déclenché par la liste équipe) marque la notification.
    await request(app).get('/api/drivers').set(adminHeaders());
    await new Promise((r) => setTimeout(r, 300));
    const { rows } = await pool.query('SELECT expiry_notified_at FROM drivers WHERE id = $1', [
      driver.id,
    ]);
    assert.ok(rows[0].expiry_notified_at, 'l\'alerte doit être marquée envoyée');
  });

  it('sauvegarde : export JSON complet réservé à l\'équipe', async () => {
    const { token } = await createTourist();
    const refus = await request(app).get('/api/stats/sauvegarde').set(authHeaders(token));
    assert.equal(refus.status, 401);

    const sauvegarde = await request(app).get('/api/stats/sauvegarde').set(adminHeaders());
    assert.equal(sauvegarde.status, 200);
    assert.ok(sauvegarde.body.exported_at);
    assert.ok(Array.isArray(sauvegarde.body.tables.users));
    assert.ok(Array.isArray(sauvegarde.body.tables.trips));
    assert.equal(sauvegarde.body.tables.otp_codes, undefined); // jamais exportés
    assert.match(sauvegarde.headers['content-disposition'], /zanzigo-sauvegarde-/);
  });
});
