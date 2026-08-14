// Chauffeurs : numéro + MOT DE PASSE aussi — inscription (jeton candidat),
// candidature avec documents (le hash s'y pose), connexion qui ouvre
// l'espace chauffeur. Les jetons clients ne déposent jamais de candidature.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  adminHeaders,
  app,
  authHeaders,
  createVerifiedDriver,
  nextPhone,
  nextPlate,
  useTestDb,
  DOC_URL,
} from './setup.js';

useTestDb();

describe('Chauffeurs : numéro + mot de passe', () => {
  it('inscription → candidature → validation équipe → connexion → espace chauffeur', async () => {
    const phone = nextPhone();
    const inscription = await request(app)
      .post('/api/auth/driver-register')
      .send({ phone, password: 'DerevaMdp1' });
    assert.equal(inscription.status, 201, JSON.stringify(inscription.body));

    const candidature = await request(app)
      .post('/api/drivers')
      .set(authHeaders(inscription.body.token))
      .send({
        fullName: 'Chauffeur MotDePasse',
        phone,
        licenseNumber: 'DL-778899',
        vehiclePlate: nextPlate(),
        zone: 'Nungwi',
        licenseDocumentUrl: DOC_URL,
        insuranceDocumentUrl: DOC_URL,
        vehiclePhotoUrl: DOC_URL,
      });
    assert.equal(candidature.status, 201, JSON.stringify(candidature.body));
    assert.equal(candidature.body.password_hash, undefined);

    // L'équipe valide la candidature.
    const validation = await request(app)
      .patch(`/api/drivers/${candidature.body.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'verified' });
    assert.equal(validation.status, 200);

    // Connexion chauffeur : l'espace chauffeur s'ouvre (GET /rides/mine).
    const connexion = await request(app)
      .post('/api/auth/driver-login')
      .send({ phone, password: 'DerevaMdp1' });
    assert.equal(connexion.status, 200, JSON.stringify(connexion.body));
    assert.equal(connexion.body.driver.id, candidature.body.id);
    assert.equal(connexion.body.driver.password_hash, undefined);
    const mine = await request(app)
      .get('/api/rides/mine')
      .set(authHeaders(connexion.body.token));
    assert.equal(mine.status, 200);

    const mauvais = await request(app)
      .post('/api/auth/driver-login')
      .send({ phone, password: 'MauvaisMdp1' });
    assert.equal(mauvais.status, 401);
  });

  it('numéro déjà chauffeur → 409 à l\'inscription ; ancien chauffeur adopte son premier mot de passe', async () => {
    const { driver } = await createVerifiedDriver();
    const doublon = await request(app)
      .post('/api/auth/driver-register')
      .send({ phone: driver.phone, password: 'UnAutreMdp1' });
    assert.equal(doublon.status, 409);
    assert.equal(doublon.body.error.code, 'account_exists');

    // Ancien chauffeur (créé par code, sans hash) : premier mot de passe adopté.
    const premiere = await request(app)
      .post('/api/auth/driver-login')
      .send({ phone: driver.phone, password: 'PremierMdp1' });
    assert.equal(premiere.status, 200);
    assert.equal(premiere.body.driver.id, driver.id);
    const mauvais = await request(app)
      .post('/api/auth/driver-login')
      .send({ phone: driver.phone, password: 'AutreChose1' });
    assert.equal(mauvais.status, 401);
  });

  it('inscrit mais dossier pas encore déposé : il se reconnecte et reprend où il en était', async () => {
    const phone = nextPhone();
    const inscription = await request(app)
      .post('/api/auth/driver-register')
      .send({ phone, password: 'DerevaMdp1' });
    assert.equal(inscription.status, 201);

    // Il ferme l'application pour aller chercher ses papiers, puis revient.
    const retour = await request(app)
      .post('/api/auth/driver-login')
      .send({ phone, password: 'DerevaMdp1' });
    assert.equal(retour.status, 200, JSON.stringify(retour.body));
    assert.equal(retour.body.driver, null); // dossier encore à déposer
    assert.ok(retour.body.token);

    const mauvais = await request(app)
      .post('/api/auth/driver-login')
      .send({ phone, password: 'PasLeBon1' });
    assert.equal(mauvais.status, 401);

    // Le jeton de reconnexion dépose bien la candidature.
    const candidature = await request(app)
      .post('/api/drivers')
      .set(authHeaders(retour.body.token))
      .send({
        fullName: 'Chauffeur Revenu',
        phone,
        licenseNumber: 'DL-424242',
        vehiclePlate: nextPlate(),
        zone: 'Paje',
        licenseDocumentUrl: DOC_URL,
        insuranceDocumentUrl: DOC_URL,
        vehiclePhotoUrl: DOC_URL,
      });
    assert.equal(candidature.status, 201, JSON.stringify(candidature.body));

    // Dossier déposé : la connexion ouvre maintenant sa fiche chauffeur.
    const apres = await request(app)
      .post('/api/auth/driver-login')
      .send({ phone, password: 'DerevaMdp1' });
    assert.equal(apres.status, 200);
    assert.equal(apres.body.driver.id, candidature.body.id);
  });

  it('un jeton CLIENT ne dépose jamais de candidature chauffeur', async () => {
    const phone = nextPhone();
    const { body } = await request(app)
      .post('/api/auth/visitor-register')
      .send({ phone, password: 'ClientMdp1' });
    const candidature = await request(app)
      .post('/api/drivers')
      .set(authHeaders(body.token))
      .send({
        fullName: 'Faux Chauffeur',
        phone,
        licenseNumber: 'DL-000111',
        vehiclePlate: nextPlate(),
        zone: 'Paje',
        licenseDocumentUrl: DOC_URL,
        insuranceDocumentUrl: DOC_URL,
        vehiclePhotoUrl: DOC_URL,
      });
    assert.equal(candidature.status, 403);
    assert.equal(candidature.body.error.code, 'driver_register_required');
  });
});
