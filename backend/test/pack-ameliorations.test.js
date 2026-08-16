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
    assert.equal(Number(creation.body.price), 45); // aller simple : prix normal
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
    assert.equal(Number(ar.body.price), 81); // 45 × 1,8
    assert.equal(Number(ar.body.commission), 12.15); // 81 × 15 %

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
    assert.equal(Number(partage.body.price), 15); // privé 45 → place 15
  });

  it('Stone Town et son ferry : même place, aucune course entre les deux', async () => {
    const { token, user } = await createTourist();
    // Cinq minutes à pied : il n'y a rien à vendre entre ces deux points.
    for (const [depart, arrivee] of [
      ['Stone Town Ferry', 'Stone Town'],
      ['Stone Town', 'Stone Town Ferry'],
    ]) {
      const refus = await request(app)
        .post('/api/trips')
        .set(authHeaders(token))
        .send({
          userId: user.id,
          tripType: 'private',
          pickupLocation: depart,
          dropoffLocation: arrivee,
        });
      assert.equal(refus.status, 422, `${depart} → ${arrivee}`);
      assert.equal(refus.body.error.code, 'route_indisponible');
    }

    // L'aéroport, lui, est à sept kilomètres : c'est un vrai transfert, et
    // l'un des plus demandés de l'île. 17 USD, commission 20 %.
    for (const [depart, arrivee] of [
      ['Aéroport international Abeid Amani Karume', 'Stone Town'],
      ['Stone Town', 'Aéroport international Abeid Amani Karume'],
      ['Aéroport (AAKIA)', 'Stone Town Ferry'],
    ]) {
      const transfert = await request(app)
        .post('/api/trips')
        .set(authHeaders(token))
        .send({
          userId: user.id,
          tripType: 'private',
          pickupLocation: depart,
          dropoffLocation: arrivee,
        });
      assert.equal(transfert.status, 201, `${depart} → ${arrivee} : ${JSON.stringify(transfert.body)}`);
      assert.equal(Number(transfert.body.price), 17, `${depart} → ${arrivee}`);
      assert.equal(Number(transfert.body.commission), 2.55, `${depart} → ${arrivee}`);
    }

    // Trop court pour un taxi partagé : l'annonce reste refusée.
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const depart = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const annonce = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({
        origin: 'Aéroport international Abeid Amani Karume',
        destination: 'Stone Town',
        departureAt: depart,
        seatsTotal: 4,
      });
    assert.equal(annonce.status, 422);
    // Les vraies liaisons (aéroport → plages) restent ouvertes.
    const ok = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: user.id,
        tripType: 'private',
        pickupLocation: 'Aéroport international Abeid Amani Karume',
        dropoffLocation: 'Nungwi',
      });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(Number(ok.body.price), 45);
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

  it('aéroport : le nom officiel complet est affiché, les anciens libellés restent acceptés', async () => {
    const { privateUsdForRoute } = await import('../src/services/pricingService.js');
    // Grille hub inchangée sous tous les libellés.
    assert.equal(privateUsdForRoute('Aéroport international Abeid Amani Karume', 'Nungwi'), 45);
    assert.equal(privateUsdForRoute('Aéroport Abeid Amani Karume', 'Nungwi'), 45);
    assert.equal(privateUsdForRoute('Aéroport (AAKIA)', 'Nungwi'), 45);

    // Les annonces partagées acceptent nouveau ET anciens libellés de départ.
    const { token: tokenChauffeur } = await createVerifiedDriver();
    const depart = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const nouveau = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({
        origin: 'Aéroport international Abeid Amani Karume',
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
    // Et la liste servie aux menus n'affiche QUE le nom officiel complet.
    const lieux = await request(app).get('/api/rides/locations');
    assert.ok(lieux.body.origins.includes('Aéroport international Abeid Amani Karume'));
    assert.ok(!lieux.body.origins.includes('Aéroport (AAKIA)'));
    assert.ok(!lieux.body.origins.includes('Aéroport Abeid Amani Karume'));
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

  it('place non payée : libérée automatiquement, SANS que personne consulte', async () => {
    const { token: tokenChauffeur, driver } = await createVerifiedDriver();
    const { token, user } = await createTourist();
    const depart = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const annonce = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({ origin: 'Stone Town', destination: 'Nungwi', departureAt: depart, seatsTotal: 4 });
    assert.equal(annonce.status, 201, JSON.stringify(annonce.body));

    const resa = await request(app)
      .post(`/api/rides/${annonce.body.id}/book`)
      .set(authHeaders(token))
      .send({ seats: 2 });
    assert.equal(resa.status, 201, JSON.stringify(resa.body));
    const bookingId = resa.body.booking_id;
    assert.ok(bookingId, 'la réponse doit porter l\'identifiant de la place');

    // On antidate la réservation : elle a été faite il y a 10 minutes.
    await pool.query(
      `UPDATE ride_bookings SET created_at = now() - interval '10 minutes' WHERE id = $1`,
      [bookingId]
    );
    await pool.query(
      `UPDATE payments SET created_at = now() - interval '10 minutes' WHERE ride_booking_id = $1`,
      [bookingId]
    );

    // ENTRETIEN AUTOMATIQUE : personne n'ouvre l'application, c'est le
    // serveur qui fait le ménage tout seul.
    const { passageEntretien } = await import('../src/services/entretienService.js');
    const liberees = await passageEntretien();
    assert.ok(
      liberees.some((b) => b.id === bookingId),
      'la place impayée doit être libérée par le passage automatique'
    );

    // La place est annulée, le paiement soldé, les sièges remis en vente.
    const { rows: apres } = await pool.query(
      'SELECT cancelled_at FROM ride_bookings WHERE id = $1',
      [bookingId]
    );
    assert.ok(apres[0].cancelled_at, 'la réservation doit être annulée');
    const { rows: paiement } = await pool.query(
      'SELECT status FROM payments WHERE ride_booking_id = $1',
      [bookingId]
    );
    assert.equal(paiement[0].status, 'failed');
    const { rows: place } = await pool.query(
      'SELECT seats_available, seats_total FROM posted_rides WHERE id = $1',
      [annonce.body.id]
    );
    assert.equal(place[0].seats_available, place[0].seats_total, 'les places retournent en vente');
    assert.ok(driver.id);
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
