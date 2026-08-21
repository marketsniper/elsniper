// Un restaurant partenaire, exactement comme un hôtel.
//
// Il fait livrer (colis) et commande des taxis pour ses clients. Le compte,
// le crédit prépayé, la fidélité et la vérification par l'équipe sont les
// mêmes — seul le nom change à l'écran et dans les messages, parce qu'un
// restaurateur à qui on parle de « son hôtel » se demande à qui on s'adresse.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { adminHeaders, app, authHeaders, nextPhone, useTestDb } from './setup.js';

useTestDb();

let compteur = 0;

async function inscrire(partnerType, nom) {
  compteur += 1;
  const email = `resto${Date.now()}${compteur}@exemple.test`;
  const res = await request(app)
    .post('/api/hotels')
    .send({
      name: nom,
      contactName: 'Salma Juma',
      email,
      password: 'MonSecret1',
      phone: nextPhone(),
      zone: 'Nungwi',
      ...(partnerType ? { partnerType } : {}),
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const connexion = await request(app)
    .post('/api/auth/hotel-login')
    .send({ email, password: 'MonSecret1' });
  return { partenaire: res.body, jeton: connexion.body.token };
}

async function verifier(id) {
  const res = await request(app)
    .patch(`/api/hotels/${id}/verify`)
    .set(adminHeaders())
    .send({ status: 'verified' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
}

describe('Restaurants partenaires', () => {
  it('un restaurant s’inscrit et l’équipe le valide', async () => {
    const { partenaire } = await inscrire('restaurant', 'Lukmaan Restaurant');
    assert.equal(partenaire.partner_type, 'restaurant');
    assert.equal(partenaire.verification_status, 'pending');
    assert.equal(partenaire.password_hash, undefined, 'le hash ne doit jamais sortir');
    await verifier(partenaire.id);
  });

  it('un partenaire inscrit sans préciser reste un hôtel', async () => {
    // Les comptes créés avant l'ouverture aux restaurants ne changent pas.
    const { partenaire } = await inscrire(null, 'Baraka Beach Hotel');
    assert.equal(partenaire.partner_type, 'hotel');
  });

  it('un type inventé est refusé', async () => {
    const res = await request(app)
      .post('/api/hotels')
      .send({
        name: 'Boutique Ali',
        contactName: 'Ali',
        email: `boutique${Date.now()}@exemple.test`,
        password: 'MonSecret1',
        phone: nextPhone(),
        zone: 'Paje',
        partnerType: 'boutique',
      });
    assert.equal(res.status, 400);
  });

  it('le restaurant fait livrer un colis, à son nom', async () => {
    const { partenaire, jeton } = await inscrire('restaurant', 'Lukmaan Restaurant');
    await verifier(partenaire.id);

    const colis = await request(app)
      .post('/api/packages')
      .set(authHeaders(jeton))
      .send({
        senderType: 'hotel',
        size: 'small',
        senderHotelId: partenaire.id,
        pickupLocation: 'Lukmaan Restaurant, Stone Town',
        dropoffLocation: 'Paje',
        recipientName: 'Omar Destinataire',
        recipientPhone: nextPhone(),
      });
    assert.equal(colis.status, 201, JSON.stringify(colis.body));
    assert.equal(colis.body.sender_hotel_id, partenaire.id);
    // Plein tarif : la remise partenaire ne vaut que sur les courses privées.
    assert.equal(Number(colis.body.price), 5);
    // Le message envoyé à l'équipe dit « restaurant », pas « hôtel ».
    const message = decodeURIComponent(colis.body.whatsapp_link ?? '');
    assert.match(message, /Lukmaan Restaurant \(restaurant,/);
  });

  it('le restaurant commande un taxi pour son client', async () => {
    const { partenaire, jeton } = await inscrire('restaurant', 'Lukmaan Restaurant');
    await verifier(partenaire.id);

    const course = await request(app)
      .post('/api/trips')
      .set(authHeaders(jeton))
      .send({
        hotelId: partenaire.id,
        clientName: 'Amina Hassan',
        clientPhone: nextPhone(),
        tripType: 'private',
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Nungwi',
        scheduledAt: new Date(Date.now() + 7200000).toISOString(),
      });
    assert.equal(course.status, 201, JSON.stringify(course.body));
    assert.equal(course.body.hotel_id, partenaire.id);
    // La remise partenaire de 5 % vaut aussi pour un restaurant : 45 → 42,75.
    assert.equal(Number(course.body.price), 47.5);
    const message = decodeURIComponent(course.body.whatsapp_link ?? '');
    assert.match(message, /Lukmaan Restaurant \(restaurant\) pour Amina Hassan/);
  });

  it('non vérifié, un restaurant ne réserve rien — et on lui parle correctement', async () => {
    const { partenaire, jeton } = await inscrire('restaurant', 'Lukmaan Restaurant');
    const course = await request(app)
      .post('/api/trips')
      .set(authHeaders(jeton))
      .send({
        hotelId: partenaire.id,
        clientName: 'Amina Hassan',
        clientPhone: nextPhone(),
        tripType: 'private',
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Nungwi',
      });
    assert.equal(course.status, 403, JSON.stringify(course.body));
    assert.match(course.body.error.message, /Compte restaurant en attente/);
  });

  it('l’équipe voit hôtels et restaurants dans la même file, et peut trier', async () => {
    const resto = await inscrire('restaurant', 'Lukmaan Restaurant');
    const hotel = await inscrire(null, 'Baraka Beach Hotel');

    const tous = await request(app).get('/api/hotels?verificationStatus=pending').set(adminHeaders());
    assert.equal(tous.status, 200);
    const ids = tous.body.map((p) => p.id);
    assert.ok(ids.includes(resto.partenaire.id), 'le restaurant manque dans la file');
    assert.ok(ids.includes(hotel.partenaire.id), "l'hôtel manque dans la file");

    const restosSeuls = await request(app)
      .get('/api/hotels?verificationStatus=pending&partnerType=restaurant')
      .set(adminHeaders());
    assert.equal(restosSeuls.status, 200);
    assert.ok(restosSeuls.body.every((p) => p.partner_type === 'restaurant'));
    assert.ok(restosSeuls.body.some((p) => p.id === resto.partenaire.id));
  });
});
