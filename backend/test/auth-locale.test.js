// Locaux : même identification que les visiteurs — numéro + MOT DE PASSE
// choisi (les endpoints clients servent tous les profils users). Garde-fous
// conservés : jamais de pouvoirs chauffeur avec un jeton client.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  app,
  authHeaders,
  createLocal,
  createVerifiedDriver,
  nextPhone,
  useTestDb,
  DOC_URL,
} from './setup.js';

useTestDb();

describe('Locaux : numéro + mot de passe', () => {
  it('inscription → profil local (carte NIDA) → connexion → tarif TZS', async () => {
    const phone = nextPhone();
    const inscription = await request(app)
      .post('/api/auth/visitor-register')
      .send({ phone, password: 'SiriYangu1' });
    assert.equal(inscription.status, 201, JSON.stringify(inscription.body));

    const profil = await request(app)
      .post('/api/users')
      .set(authHeaders(inscription.body.token))
      .send({
        fullName: 'Juma MotDePasse',
        phone,
        accountType: 'local',
        idDocumentUrl: DOC_URL,
      });
    assert.equal(profil.status, 201, JSON.stringify(profil.body));
    assert.equal(profil.body.account_type, 'local');
    assert.equal(profil.body.currency, 'TZS');
    assert.equal(profil.body.password_hash, undefined);

    const connexion = await request(app)
      .post('/api/auth/visitor-login')
      .send({ phone, password: 'SiriYangu1' });
    assert.equal(connexion.status, 200, JSON.stringify(connexion.body));
    assert.equal(connexion.body.user.id, profil.body.id);

    const mauvais = await request(app)
      .post('/api/auth/visitor-login')
      .send({ phone, password: 'SiriMbaya1' });
    assert.equal(mauvais.status, 401);
  });

  it('ancien compte local (sans mot de passe) : le premier mot de passe saisi est adopté', async () => {
    const { user } = await createLocal();
    const premiere = await request(app)
      .post('/api/auth/visitor-login')
      .send({ phone: user.phone, password: 'PremierMdp1' });
    assert.equal(premiere.status, 200, JSON.stringify(premiere.body));
    assert.equal(premiere.body.user.id, user.id);

    const mauvais = await request(app)
      .post('/api/auth/visitor-login')
      .send({ phone: user.phone, password: 'AutreChose1' });
    assert.equal(mauvais.status, 401);
  });

  it('numéro d\'un chauffeur via la connexion client : jamais les pouvoirs chauffeur', async () => {
    const { driver } = await createVerifiedDriver();
    // Le chauffeur n'a pas de compte client : connexion client → 401.
    const connexion = await request(app)
      .post('/api/auth/visitor-login')
      .send({ phone: driver.phone, password: 'PeuImporte1' });
    assert.equal(connexion.status, 401);
  });
});
