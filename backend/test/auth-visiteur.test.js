// Visiteurs (touristes/résidents) : identification par NUMÉRO + MOT DE
// PASSE choisi par le client — aucun code à recevoir. Garde-fous : jamais
// de pouvoirs chauffeur avec un jeton client, hash jamais exposé par
// l'API. (Les locaux passent par les mêmes endpoints : voir auth-locale.)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  adminHeaders,
  app,
  authHeaders,
  createTourist,
  nextPhone,
  useTestDb,
} from './setup.js';

useTestDb();

describe('Visiteurs : numéro + mot de passe', () => {
  it('inscription → profil touriste → connexion → réservation', async () => {
    const phone = nextPhone();
    // 1. Inscription : numéro + mot de passe → jeton.
    const inscription = await request(app)
      .post('/api/auth/visitor-register')
      .send({ phone, password: 'MonSecret1' });
    assert.equal(inscription.status, 201, JSON.stringify(inscription.body));
    assert.ok(inscription.body.token);
    assert.equal(inscription.body.user, null);

    // 2. Création du profil : le mot de passe (hash du jeton) est posé.
    const profil = await request(app)
      .post('/api/users')
      .set(authHeaders(inscription.body.token))
      .send({ fullName: 'Touriste Motdepasse', phone, accountType: 'tourist' });
    assert.equal(profil.status, 201, JSON.stringify(profil.body));
    assert.equal(profil.body.password_hash, undefined); // jamais exposé

    // 3. Connexion avec le mot de passe.
    const connexion = await request(app)
      .post('/api/auth/visitor-login')
      .send({ phone, password: 'MonSecret1' });
    assert.equal(connexion.status, 200, JSON.stringify(connexion.body));
    assert.equal(connexion.body.user.id, profil.body.id);
    assert.equal(connexion.body.user.password_hash, undefined);

    // 4. Mauvais mot de passe → refus.
    const mauvais = await request(app)
      .post('/api/auth/visitor-login')
      .send({ phone, password: 'MauvaisMdp1' });
    assert.equal(mauvais.status, 401);
    assert.equal(mauvais.body.error.code, 'invalid_credentials');

    // 5. Le jeton visiteur peut réserver une course.
    const course = await request(app)
      .post('/api/trips')
      .set(authHeaders(connexion.body.token))
      .send({
        userId: profil.body.id,
        tripType: 'private',
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Nungwi',
      });
    assert.equal(course.status, 201, JSON.stringify(course.body));
  });

  it('numéro déjà inscrit → 409 account_exists ; numéro inconnu à la connexion → 401', async () => {
    const { user } = await createTourist();
    const doublon = await request(app)
      .post('/api/auth/visitor-register')
      .send({ phone: user.phone, password: 'UnAutreMdp1' });
    assert.equal(doublon.status, 409);
    assert.equal(doublon.body.error.code, 'account_exists');

    const inconnu = await request(app)
      .post('/api/auth/visitor-login')
      .send({ phone: nextPhone(), password: 'PeuImporte1' });
    assert.equal(inconnu.status, 401);
  });

  it('compte sans mot de passe : porte fermée — plus d\'adoption au premier essai', async () => {
    const { user } = await createTourist();
    const tentative = await request(app)
      .post('/api/auth/visitor-login')
      .send({ phone: user.phone, password: 'PremierMdp1' });
    assert.equal(tentative.status, 403, JSON.stringify(tentative.body));
    assert.equal(tentative.body.error.code, 'password_not_set');

    // L'équipe pose le mot de passe après vérification d'identité.
    await request(app)
      .patch(`/api/users/${user.id}/password`)
      .set(adminHeaders())
      .send({ password: 'PoseParEquipe1' });
    const mauvais = await request(app)
      .post('/api/auth/visitor-login')
      .send({ phone: user.phone, password: 'AutreChose1' });
    assert.equal(mauvais.status, 401);
    const bon = await request(app)
      .post('/api/auth/visitor-login')
      .send({ phone: user.phone, password: 'PoseParEquipe1' });
    assert.equal(bon.status, 200);
  });

  it('garde-fous : un jeton client n\'ouvre jamais l\'espace chauffeur', async () => {
    const phone = nextPhone();
    const { body } = await request(app)
      .post('/api/auth/visitor-register')
      .send({ phone, password: 'MonSecret1' });
    const mine = await request(app).get('/api/rides/mine').set(authHeaders(body.token));
    assert.equal(mine.status, 403);
  });

  it('mot de passe oublié : l\'équipe le réinitialise', async () => {
    const phone = nextPhone();
    const { body } = await request(app)
      .post('/api/auth/visitor-register')
      .send({ phone, password: 'AncienMdp1' });
    const profil = await request(app)
      .post('/api/users')
      .set(authHeaders(body.token))
      .send({ fullName: 'Oublieuse', phone, accountType: 'tourist' });

    const reset = await request(app)
      .patch(`/api/users/${profil.body.id}/password`)
      .set(adminHeaders())
      .send({ password: 'NouveauMdp1' });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.password_hash, undefined);

    const ancienne = await request(app)
      .post('/api/auth/visitor-login')
      .send({ phone, password: 'AncienMdp1' });
    assert.equal(ancienne.status, 401);
    const nouvelle = await request(app)
      .post('/api/auth/visitor-login')
      .send({ phone, password: 'NouveauMdp1' });
    assert.equal(nouvelle.status, 200);
  });
});
