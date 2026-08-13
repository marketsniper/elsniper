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
import { app, authHeaders, authenticate, nextHotelEmail, nextPhone, useTestDb, HOTEL_PASSWORD } from './setup.js';

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
