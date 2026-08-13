// Connexion LOCALE SANS CODE : le numéro suffit, entrée directe — avec les
// garde-fous (jamais de pouvoirs chauffeur, comptes visiteurs renvoyés vers
// l'e-mail, seuls des comptes locaux peuvent être créés).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  app,
  authHeaders,
  createTourist,
  createVerifiedDriver,
  nextPhone,
  useTestDb,
  DOC_URL,
} from './setup.js';

useTestDb();

describe('Connexion locale sans code', () => {
  it('nouveau numéro : entrée directe, création du profil local, réservation possible', async () => {
    const phone = nextPhone();
    const connexion = await request(app).post('/api/auth/local-login').send({ phone });
    assert.equal(connexion.status, 200, JSON.stringify(connexion.body));
    assert.ok(connexion.body.token);
    assert.equal(connexion.body.user, null);
    assert.equal(connexion.body.driver, null);

    const profil = await request(app)
      .post('/api/users')
      .set(authHeaders(connexion.body.token))
      .send({
        fullName: 'Juma Sans Code',
        phone,
        accountType: 'local',
        idDocumentUrl: DOC_URL,
      });
    assert.equal(profil.status, 201, JSON.stringify(profil.body));
    assert.equal(profil.body.account_type, 'local');
    assert.equal(profil.body.currency, 'TZS');

    // Reconnexion : le compte est retrouvé directement.
    const retour = await request(app).post('/api/auth/local-login').send({ phone });
    assert.equal(retour.body.user.id, profil.body.id);
  });

  it('le jeton sans code ne crée JAMAIS un compte touriste ni une candidature chauffeur', async () => {
    const phone = nextPhone();
    const { body } = await request(app).post('/api/auth/local-login').send({ phone });

    const touriste = await request(app)
      .post('/api/users')
      .set(authHeaders(body.token))
      .send({ fullName: 'Faux Touriste', phone, accountType: 'tourist' });
    assert.equal(touriste.status, 403);
    assert.equal(touriste.body.error.code, 'local_only');

    const candidature = await request(app)
      .post('/api/drivers')
      .set(authHeaders(body.token))
      .send({
        fullName: 'Faux Chauffeur',
        phone,
        licenseNumber: 'DL-123456',
        vehiclePlate: 'Z 123 ABC',
        zone: 'Nungwi',
        licenseDocumentUrl: DOC_URL,
        insuranceDocumentUrl: DOC_URL,
        vehiclePhotoUrl: DOC_URL,
      });
    assert.equal(candidature.status, 403);
    assert.equal(candidature.body.error.code, 'otp_required');
  });

  it('numéro d\'un compte visiteur → 409, renvoyé vers la connexion e-mail', async () => {
    const { user } = await createTourist();
    const connexion = await request(app)
      .post('/api/auth/local-login')
      .send({ phone: user.phone });
    assert.equal(connexion.status, 409);
    assert.equal(connexion.body.error.code, 'not_local_account');
  });

  it('numéro d\'un chauffeur : jamais les pouvoirs chauffeur sans code', async () => {
    const { driver } = await createVerifiedDriver();
    const connexion = await request(app)
      .post('/api/auth/local-login')
      .send({ phone: driver.phone });
    assert.equal(connexion.status, 200);
    assert.equal(connexion.body.driver, null);

    // L'espace chauffeur reste fermé à ce jeton.
    const mine = await request(app)
      .get('/api/rides/mine')
      .set(authHeaders(connexion.body.token));
    assert.equal(mine.status, 403);
  });
});
