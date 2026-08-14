// « Je ne reçois pas d'alerte quand je dois marquer comme payé. »
//
// Un client qui demande à régler crée un paiement EN ATTENTE que l'équipe
// devra encaisser puis valider à la main. Elle doit l'apprendre à la seconde,
// sans dépendre du message WhatsApp que le client pense — ou ne pense pas —
// à envoyer. Les paiements qui se confirment tout seuls (Pesapal, capture
// PayPal) n'ont personne à réveiller.
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { adminHeaders, app, useTestDb } from './setup.js';
import {
  alertePaiementColis,
  alertePaiementCourse,
  aValiderALaMain,
} from '../src/services/paiementManuel.js';

useTestDb();

/**
 * Capture les alertes réellement parties vers l'équipe.
 *
 * Sans canal configuré (le cas des tests), notifierEquipe trace
 * « [notif équipe stub] <sujet> » : on écoute donc la sortie du serveur, ce
 * qui vérifie le vrai chemin de production plutôt qu'un substitut.
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

async function courseConfirmee() {
  const compte = await request(app)
    .post('/api/auth/register')
    .send({ username: `client${Math.floor(Math.random() * 1000000)}`, password: 'MonSecret1' });
  const profil = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${compte.body.token}`)
    .send({ fullName: 'Amina Hassan', accountType: 'tourist' });

  const inscription = await request(app)
    .post('/api/auth/driver-register')
    .send({ phone: `+25578${Math.floor(Math.random() * 1000000)}`, password: 'DerevaMdp1' });
  const chauffeur = await request(app)
    .post('/api/drivers')
    .set('Authorization', `Bearer ${inscription.body.token}`)
    .send({
      fullName: 'Hamisi Bakari',
      phone: JSON.parse(
        Buffer.from(inscription.body.token.split('.')[1], 'base64').toString()
      ).phone,
      licenseNumber: `DL-${Math.floor(Math.random() * 100000)}`,
      vehiclePlate: `T${Math.floor(Math.random() * 900 + 100)} ZGO`,
      zone: 'Nungwi',
      licenseDocumentUrl: 'https://exemple.test/a.png',
      insuranceDocumentUrl: 'https://exemple.test/b.png',
      vehiclePhotoUrl: 'https://exemple.test/c.png',
    });
  await request(app)
    .patch(`/api/drivers/${chauffeur.body.id}/verify`)
    .set(adminHeaders())
    .send({ status: 'verified' });

  const course = await request(app)
    .post('/api/trips')
    .set('Authorization', `Bearer ${compte.body.token}`)
    .send({
      userId: profil.body.id,
      tripType: 'private',
      pickupLocation: 'Nungwi',
      dropoffLocation: 'Paje',
      scheduledAt: new Date(Date.now() + 7200000).toISOString(),
    });
  await request(app)
    .patch(`/api/trips/${course.body.id}/assign-driver`)
    .set(adminHeaders())
    .send({ driverId: chauffeur.body.id });
  return { course: course.body, jeton: compte.body.token };
}

describe('Alerte « paiement à encaisser »', () => {
  it('une demande de paiement d’une course réveille l’équipe', async (t) => {
    const { course, jeton } = await courseConfirmee();
    const alertes = espionnerAlertes();
    t.after(() => mock.restoreAll());

    const paiement = await request(app)
      .post(`/api/trips/${course.id}/payment`)
      .set('Authorization', `Bearer ${jeton}`)
      .send({});
    assert.equal(paiement.status, 201, JSON.stringify(paiement.body));

    assert.ok(
      alertes.some((ligne) => ligne.includes('Paiement à encaisser — course')),
      `aucune alerte partie (reçues : ${alertes.join(' | ') || 'aucune'})`
    );
  });

  it('une demande de paiement d’un colis réveille l’équipe', async (t) => {
    const compte = await request(app)
      .post('/api/auth/register')
      .send({ username: `envoi${Math.floor(Math.random() * 1000000)}`, password: 'MonSecret1' });
    const profil = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${compte.body.token}`)
      .send({ fullName: 'Amina Hassan', accountType: 'tourist', phone: '+255700111222' });
    const colis = await request(app)
      .post('/api/packages')
      .set('Authorization', `Bearer ${compte.body.token}`)
      .send({
        senderType: 'user',
        senderUserId: profil.body.id,
        size: 'medium',
        pickupLocation: 'Nungwi',
        dropoffLocation: 'Paje',
        recipientName: 'Juma Ali',
        recipientPhone: '+255700333444',
      });
    assert.equal(colis.status, 201, JSON.stringify(colis.body));

    const alertes = espionnerAlertes();
    t.after(() => mock.restoreAll());

    const paiement = await request(app)
      .post(`/api/packages/${colis.body.id}/payment`)
      .set('Authorization', `Bearer ${compte.body.token}`)
      .send({});
    assert.equal(paiement.status, 201, JSON.stringify(paiement.body));

    assert.ok(
      alertes.some((ligne) => ligne.includes('Paiement à encaisser — colis')),
      `aucune alerte pour le colis (reçues : ${alertes.join(' | ') || 'aucune'})`
    );
  });

  it('le message dit quoi encaisser, et où le valider', () => {
    const course = alertePaiementCourse({
      id: 'abc-123',
      pickup_location: 'Nungwi',
      dropoff_location: 'Paje',
      scheduled_at: new Date('2026-08-15T09:30:00Z').toISOString(),
      price: 65,
      currency: 'USD',
      client_name: 'Amina Hassan',
    });
    assert.match(course.sujet, /Paiement à encaisser — course/);
    assert.match(course.texte, /Nungwi → Paje/, 'le trajet manque');
    assert.match(course.texte, /65 USD/, 'le montant manque');
    assert.match(course.texte, /15\/08\/2026 12:30/, "l'heure de Zanzibar manque");
    assert.match(course.texte, /Marquer payé/, 'le geste à faire n’est pas rappelé');

    const colis = alertePaiementColis({
      id: 'def-456',
      pickup_location: 'Stone Town',
      dropoff_location: 'Kendwa',
      size: 'medium',
      price: 26000,
      currency: 'TZS',
      qr_code: 'PKG-XYZ',
    });
    assert.match(colis.texte, /PKG-XYZ/, 'le QR du colis manque');
    assert.match(colis.texte, /Marquer payé/);
  });

  it('la règle : seuls les paiements à valider à la main déclenchent une alerte', () => {
    assert.equal(aValiderALaMain('WHATSAPP-abc'), true);
    assert.equal(aValiderALaMain('PAYPALME-abc'), true);
    // Ceux-là se confirment tout seuls : personne à réveiller.
    assert.equal(aValiderALaMain('PAYPAL-abc'), false);
    assert.equal(aValiderALaMain('a1b2c3-pesapal'), false);
    assert.equal(aValiderALaMain(null), false);
  });
});
