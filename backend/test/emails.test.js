// E-mails de bienvenue : récapitulatif d'inscription (clients) et
// informations de connexion (hôtels — SANS le mot de passe). En mode stub
// (pas de clé Resend), l'envoi ne bloque jamais l'inscription.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  emailBienvenueClient,
  emailBienvenueHotel,
  envoyerEmail,
  isEmailStub,
  notifierEquipe,
} from '../src/services/emailService.js';
import {
  app,
  authHeaders,
  authenticate,
  createTourist,
  nextHotelEmail,
  nextPhone,
  useTestDb,
  HOTEL_PASSWORD,
} from './setup.js';

useTestDb();

describe('E-mails de bienvenue', () => {
  it('client : récapitulatif avec nom, téléphone, profil et lien app', () => {
    const { subject, html } = emailBienvenueClient({
      full_name: 'Alice Voyage',
      phone: '+33612345678',
      email: 'alice@example.com',
      account_type: 'tourist',
      verification_status: 'verified',
    });
    assert.ok(subject.includes('zanziGo'));
    assert.ok(html.includes('Alice Voyage'));
    assert.ok(html.includes('+33612345678'));
    assert.ok(html.includes('Touriste'));
    assert.ok(html.includes('zanzigo-api.onrender.com/app'));
  });

  it('client local en attente : le statut de vérification est mentionné', () => {
    const { html } = emailBienvenueClient({
      full_name: 'Juma Local',
      phone: '+255700000001',
      account_type: 'local',
      verification_status: 'pending',
    });
    assert.ok(html.includes('shillings'));
    assert.ok(html.includes('vérification'));
  });

  it('hôtel : identifiants de connexion SANS le mot de passe', () => {
    const { subject, html } = emailBienvenueHotel({
      name: 'Bahari Lodge',
      contact_name: 'Fatma',
      email: 'contact@baharilodge.co.tz',
      phone: '+255777000111',
      zone: 'Nungwi',
    });
    assert.ok(subject.includes('partenaire'));
    assert.ok(html.includes('Bahari Lodge'));
    assert.ok(html.includes('contact@baharilodge.co.tz'));
    assert.ok(html.includes('zanzigo-api.onrender.com/web'));
    // Jamais de mot de passe en clair dans l'e-mail.
    assert.ok(!html.includes(HOTEL_PASSWORD));
    assert.ok(html.includes('jamais envoyé par e-mail'));
  });

  it('mode stub : envoyerEmail ne lève jamais et signale stub', async () => {
    assert.equal(isEmailStub(), true);
    const resultat = await envoyerEmail({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>test</p>',
    });
    assert.equal(resultat.sent, false);
    assert.equal(resultat.stub, true);
  });

  it('code OTP par e-mail : nouveau numéro → e-mail au choix ; compte existant → e-mail ENREGISTRÉ uniquement', async () => {
    // Nouveau numéro : le code part vers l'e-mail fourni (création de compte).
    const nouveau = await request(app)
      .post('/api/auth/request-otp')
      .send({ phone: '+255744556677', channel: 'email', email: 'voyageur@example.com' });
    assert.equal(nouveau.status, 200, JSON.stringify(nouveau.body));
    assert.equal(nouveau.body.channel, 'email');
    assert.equal(nouveau.body.emailMasked, 'v***@e***.com');
    // Le code fonctionne pour se connecter (mode pilote : devCode présent).
    const verif = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: '+255744556677', code: nouveau.body.devCode });
    assert.equal(verif.status, 200);

    // Compte EXISTANT avec e-mail : un e-mail fourni par un tiers est IGNORÉ
    // — le code part vers l'adresse enregistrée sur le compte.
    const { user } = await createTourist({ email: 'proprietaire@bonhotel.com' });
    const attaque = await request(app)
      .post('/api/auth/request-otp')
      .send({ phone: user.phone, channel: 'email', email: 'pirate@evil.com' });
    assert.equal(attaque.status, 200);
    // Masque de l'adresse ENREGISTRÉE (b*** = bonhotel), pas de celle du tiers.
    assert.equal(attaque.body.emailMasked, 'p***@b***.com');
    assert.ok(!JSON.stringify(attaque.body).includes('evil'));

    // Compte existant SANS e-mail : canal refusé proprement.
    const { user: sansEmail } = await createTourist();
    const refus = await request(app)
      .post('/api/auth/request-otp')
      .send({ phone: sansEmail.phone, channel: 'email', email: 'autre@example.com' });
    assert.equal(refus.status, 409);
    assert.equal(refus.body.error.code, 'email_unavailable');

    // Nouveau numéro sans e-mail fourni : 400 explicite.
    const manquant = await request(app)
      .post('/api/auth/request-otp')
      .send({ phone: '+255788990011', channel: 'email' });
    assert.equal(manquant.status, 400);
  });

  it('identité E-MAIL de bout en bout : code, connexion, profil touriste, réservation', async () => {
    // 1. Le visiteur demande son code avec SON E-MAIL SEUL — aucun téléphone.
    const demande = await request(app)
      .post('/api/auth/request-otp')
      .send({ email: 'Voyageuse@Exemple.com' });
    assert.equal(demande.status, 200, JSON.stringify(demande.body));
    assert.equal(demande.body.channel, 'email');
    assert.ok(demande.body.devCode);

    // 2. Connexion avec e-mail + code (la casse de l'e-mail est ignorée).
    const verif = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: 'voyageuse@exemple.com', code: demande.body.devCode });
    assert.equal(verif.status, 200, JSON.stringify(verif.body));
    assert.ok(verif.body.token);
    assert.equal(verif.body.user, null);

    // 3. Création du profil TOURISTE : e-mail imposé par le jeton, téléphone
    //    WhatsApp optionnel non vérifié.
    const profil = await request(app)
      .post('/api/users')
      .set(authHeaders(verif.body.token))
      .send({ fullName: 'Voyageuse Email', accountType: 'tourist', phone: '+33612345678' });
    assert.equal(profil.status, 201, JSON.stringify(profil.body));
    assert.equal(profil.body.email, 'voyageuse@exemple.com');
    assert.equal(profil.body.phone, '+33612345678');
    assert.equal(profil.body.verification_status, 'verified');

    // 3 bis. Un compte LOCAL par e-mail est refusé : SIM tanzanienne requise.
    const local = await request(app)
      .post('/api/users')
      .set(authHeaders(verif.body.token))
      .send({
        fullName: 'Local Interdit',
        accountType: 'local',
        idDocumentUrl: 'https://files.example.com/carte.jpg',
      });
    assert.equal(local.status, 403);
    assert.equal(local.body.error.code, 'local_phone_required');

    // 4. Reconnexion : le compte est retrouvé par e-mail, et il peut agir
    //    (créer une course privée) avec son jeton hydraté.
    const redemande = await request(app)
      .post('/api/auth/request-otp')
      .send({ email: 'voyageuse@exemple.com' });
    const reverif = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: 'voyageuse@exemple.com', code: redemande.body.devCode });
    assert.equal(reverif.body.user.id, profil.body.id);

    const course = await request(app)
      .post('/api/trips')
      .set(authHeaders(reverif.body.token))
      .send({
        userId: profil.body.id,
        tripType: 'private',
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Nungwi',
      });
    assert.equal(course.status, 201, JSON.stringify(course.body));
    assert.equal(course.body.currency, 'USD');
  });

  it('profil touriste par e-mail SANS téléphone du tout : accepté', async () => {
    const demande = await request(app)
      .post('/api/auth/request-otp')
      .send({ email: 'sans.tel@exemple.com' });
    const verif = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: 'sans.tel@exemple.com', code: demande.body.devCode });
    const profil = await request(app)
      .post('/api/users')
      .set(authHeaders(verif.body.token))
      .send({ fullName: 'Sans Téléphone', accountType: 'tourist' });
    assert.equal(profil.status, 201, JSON.stringify(profil.body));
    assert.equal(profil.body.phone, null);
  });

  it('notifierEquipe : jamais bloquant, même sans TEAM_EMAIL configuré', async () => {
    const resultat = await notifierEquipe('Test', 'ligne 1\nligne 2');
    assert.equal(resultat.sent, false);
  });

  it('inscriptions : client avec e-mail et hôtel réussissent en mode stub', async () => {
    const phone = nextPhone();
    const { token } = await authenticate(phone);
    const client = await request(app)
      .post('/api/users')
      .set(authHeaders(token))
      .send({
        fullName: 'Alice Emailée',
        phone,
        email: 'alice.email@example.com',
        accountType: 'tourist',
      });
    assert.equal(client.status, 201, JSON.stringify(client.body));

    const hotel = await request(app).post('/api/hotels').send({
      name: 'Hôtel Courriel',
      contactName: 'Karim',
      email: nextHotelEmail(),
      password: HOTEL_PASSWORD,
      phone: '+255777999888',
      zone: 'Paje',
    });
    assert.equal(hotel.status, 201, JSON.stringify(hotel.body));
    assert.equal(hotel.body.password_hash, undefined);
  });
});
