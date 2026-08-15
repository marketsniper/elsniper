// La remise partenaire de 5 % : sur les courses privées, et seulement là.
//
// Une place de taxi partagé se vend déjà au tarif le plus bas de la grille et
// le chauffeur remplit sa voiture place par place — la remiser prendrait sur
// sa part. L'hôtel garde son avantage là où il y a de la marge.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { priceTrip } from '../src/services/pricingService.js';
import { app, authHeaders, createHotel, nextPhone, useTestDb } from './setup.js';

useTestDb();

const route = { pickup: 'Stone Town', dropoff: 'Nungwi' };

describe('Remise partenaire hôtel', () => {
  it('s’applique sur une course privée', () => {
    const client = priceTrip('private', 'tourist', route);
    const hotel = priceTrip('private', 'hotel', route);
    assert.equal(client.price, 45);
    assert.equal(hotel.price, 42.75, '5 % sous le prix client');
  });

  it('NE s’applique PAS sur une place de taxi partagé', () => {
    const client = priceTrip('shared_tourist', 'tourist', route);
    const hotel = priceTrip('shared_tourist', 'hotel', route);
    assert.equal(
      hotel.price,
      client.price,
      `une place partagée coûte le même prix à l'hôtel (${client.price} attendu, reçu ${hotel.price})`
    );
  });

  it('NE s’applique PAS non plus sur un retour affiché', () => {
    const client = priceTrip('posted_return', 'tourist', route);
    const hotel = priceTrip('posted_return', 'hotel', route);
    assert.equal(hotel.price, client.price);
  });

  it('la remise résident, elle, reste sur les deux', () => {
    // Le résident vérifié garde ses −10 % partout : c'est une remise de
    // personne, pas de professionnel qui revend la course.
    assert.equal(priceTrip('private', 'resident', route).price, 40.5);
    assert.equal(
      priceTrip('shared_tourist', 'resident', route).price,
      Math.round(18 * 0.9 * 100) / 100
    );
  });

  it('un colis d’hôtel se paie plein tarif', async () => {
    // Sur un colis, le chauffeur touche une part fixe : remiser rognerait ce
    // qui le décide à faire le détour. L'hôtel garde sa fidélité à la place.
    const { token, hotel } = await createHotel();
    const res = await request(app)
      .post('/api/packages')
      .set(authHeaders(token))
      .send({
        senderType: 'hotel',
        size: 'medium',
        senderHotelId: hotel.id,
        pickupLocation: 'Hotel Baraka, Nungwi',
        dropoffLocation: 'Stone Town',
        recipientName: 'Omar Destinataire',
        recipientPhone: nextPhone(),
      });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(Number(res.body.price), 10, 'le tarif colis medium est 10 USD, sans remise');
  });

  it('la part du chauffeur sur une place partagée reste entière', () => {
    // 20 % de commission sur le prix plein : le chauffeur touche la même
    // chose, que la place soit vendue par un hôtel ou par le client.
    const client = priceTrip('shared_tourist', 'tourist', route);
    const hotel = priceTrip('shared_tourist', 'hotel', route);
    assert.equal(hotel.price - hotel.commission, client.price - client.commission);
  });
});
