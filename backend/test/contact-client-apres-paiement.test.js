// LES COORDONNÉES DU CLIENT NE S'OUVRENT QU'AU PAIEMENT VALIDÉ.
//
// Depuis la bourse aux courses, un chauffeur se sert lui-même : personne de
// l'équipe ne relit ce qu'il obtient. La règle doit donc tenir côté SERVEUR —
// pas côté écran, qu'un chauffeur curieux contournerait en lisant l'API.
//
// Avant validation du paiement : il voit le travail (trajet, heure, gain) et
// rien du client. Après : nom, téléphone et point de rendez-vous exact, pour
// qu'il puisse appeler et arriver à la bonne porte.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  adminHeaders,
  app,
  authHeaders,
  createTourist,
  createVerifiedDriver,
  useTestDb,
} from './setup.js';

useTestDb();

const NOM_CLIENT = 'Amina Coordonnees';
const TEL_CLIENT = '+255700456789';

// Une course privée prise par le chauffeur via la bourse, avec la position
// exacte partagée par le client.
async function coursePriseParChauffeur() {
  const { token, user } = await createTourist({ phone: TEL_CLIENT, fullName: NOM_CLIENT });
  const { token: jetonChauffeur, driver } = await createVerifiedDriver();

  const course = await request(app)
    .post('/api/trips')
    .set(authHeaders(token))
    .send({
      userId: user.id,
      tripType: 'private',
      pickupLocation: 'Nungwi',
      dropoffLocation: 'Paje',
    });
  assert.equal(course.status, 201, JSON.stringify(course.body));

  // Le client partage son point de rendez-vous exact.
  const position = await request(app)
    .patch(`/api/trips/${course.body.id}/pickup-position`)
    .set(authHeaders(token))
    .send({ lat: -5.7264, lng: 39.2968 });
  assert.equal(position.status, 200, JSON.stringify(position.body));

  const prise = await request(app)
    .post(`/api/trips/${course.body.id}/claim`)
    .set(authHeaders(jetonChauffeur));
  assert.equal(prise.status, 200, JSON.stringify(prise.body));

  return { id: course.body.id, jetonChauffeur, jetonClient: token, driver };
}

const vueDuChauffeur = async (id, jeton) => {
  const res = await request(app).get(`/api/trips/${id}`).set(authHeaders(jeton));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
};

// Fait valider le paiement par l'équipe (circuit manuel : c'est elle qui
// confirme après réception de l'argent).
async function equipeValideLePaiement(id, jetonClient) {
  const paiement = await request(app)
    .post(`/api/trips/${id}/payment`)
    .set(authHeaders(jetonClient));
  assert.equal(paiement.status, 201, JSON.stringify(paiement.body));
  const confirme = await request(app)
    .post(`/api/payments/${paiement.body.id}/confirm`)
    .set(adminHeaders())
    .send({});
  assert.equal(confirme.status, 200, JSON.stringify(confirme.body));
}

describe('Coordonnées du client : verrouillées jusqu’au paiement validé', () => {
  it('course prise mais pas encore payée : ni nom, ni numéro, ni position', async () => {
    const { id, jetonChauffeur } = await coursePriseParChauffeur();
    const vue = await vueDuChauffeur(id, jetonChauffeur);

    assert.equal(vue.status, 'driver_confirmed');
    assert.equal(vue.contact_client_visible, false, 'le verrou doit être annoncé à l’app');
    assert.equal(vue.client_name, null, 'le nom du client a filtré');
    assert.equal(vue.client_phone, null, 'le numéro du client a filtré');
    assert.equal(vue.pickup_lat, null, 'la position exacte a filtré');
    assert.equal(vue.pickup_lng, null, 'la position exacte a filtré');
    // Le lien WhatsApp d'équipe contient le nom du réservateur : il ne doit
    // pas atterrir sur le téléphone du chauffeur.
    assert.equal(vue.whatsapp_link, null, 'le lien d’équipe a filtré');

    // Le travail, lui, reste entièrement lisible — sinon il ne peut rien faire.
    assert.equal(vue.pickup_location, 'Nungwi');
    assert.equal(vue.dropoff_location, 'Paje');
    assert.ok(Number(vue.price) > 0);
  });

  it('paiement validé par l’équipe : nom, numéro et position s’ouvrent', async () => {
    const { id, jetonChauffeur, jetonClient } = await coursePriseParChauffeur();
    await equipeValideLePaiement(id, jetonClient);

    const vue = await vueDuChauffeur(id, jetonChauffeur);
    assert.equal(vue.status, 'paid');
    assert.equal(vue.contact_client_visible, true);
    assert.equal(vue.client_name, NOM_CLIENT, 'le chauffeur doit savoir qui il prend');
    assert.equal(vue.client_phone, TEL_CLIENT, 'le chauffeur doit pouvoir appeler');
    assert.equal(Number(vue.pickup_lat), -5.7264, 'la position exacte doit s’ouvrir');
    assert.equal(Number(vue.pickup_lng), 39.2968);
  });

  it('la liste « mes courses » du chauffeur suit la même règle', async () => {
    const { id, jetonChauffeur, jetonClient, driver } = await coursePriseParChauffeur();

    const avant = await request(app)
      .get(`/api/drivers/${driver.id}/trips`)
      .set(authHeaders(jetonChauffeur));
    assert.equal(avant.status, 200);
    const ligneAvant = avant.body.find((c) => c.id === id);
    assert.ok(ligneAvant, 'la course doit figurer dans la liste du chauffeur');
    assert.equal(ligneAvant.client_phone, null, 'le numéro a filtré dans la liste');
    assert.equal(ligneAvant.pickup_lat, null, 'la position a filtré dans la liste');
    assert.equal(ligneAvant.contact_client_visible, false);

    await equipeValideLePaiement(id, jetonClient);

    const apres = await request(app)
      .get(`/api/drivers/${driver.id}/trips`)
      .set(authHeaders(jetonChauffeur));
    const ligneApres = apres.body.find((c) => c.id === id);
    assert.equal(ligneApres.client_phone, TEL_CLIENT);
    assert.equal(ligneApres.contact_client_visible, true);
    assert.equal(Number(ligneApres.pickup_lat), -5.7264);
  });

  it('la réponse de « Je prends cette course » ne livre rien non plus', async () => {
    const { token, user } = await createTourist({ fullName: 'Bilal Discret' });
    const { token: jetonChauffeur } = await createVerifiedDriver();
    const course = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: user.id,
        tripType: 'private',
        pickupLocation: 'Kiwengwa',
        dropoffLocation: 'Stone Town',
      });
    const prise = await request(app)
      .post(`/api/trips/${course.body.id}/claim`)
      .set(authHeaders(jetonChauffeur));
    assert.equal(prise.status, 200);
    assert.equal(prise.body.contact_client_visible, false);
    assert.equal(prise.body.client_phone, null);
    assert.equal(prise.body.whatsapp_link, null);
  });

  it('l’équipe et le client, eux, voient tout dès le départ', async () => {
    const { id, jetonClient } = await coursePriseParChauffeur();

    const vueEquipe = await request(app).get(`/api/trips/${id}`).set(adminHeaders());
    assert.equal(vueEquipe.status, 200);
    assert.notEqual(vueEquipe.body.contact_client_visible, false, 'l’équipe ne doit rien perdre');
    assert.equal(Number(vueEquipe.body.pickup_lat), -5.7264);
    assert.ok(vueEquipe.body.whatsapp_link, 'le lien d’équipe doit rester pour l’équipe');

    const vueClient = await request(app).get(`/api/trips/${id}`).set(authHeaders(jetonClient));
    assert.equal(vueClient.status, 200);
    assert.equal(Number(vueClient.body.pickup_lat), -5.7264);
  });
});
