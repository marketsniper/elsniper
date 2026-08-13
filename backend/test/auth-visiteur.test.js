// Visiteurs (touristes/résidents) : identification par NUMÉRO + MOT DE
// PASSE choisi par le client — aucun code à recevoir. Garde-fous : jamais
// de pouvoirs chauffeur, comptes locaux renvoyés vers leur rubrique, hash
// jamais exposé par l'API.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  adminHeaders,
  app,
  authHeaders,
  createLocal,
  createTourist,
  nextPhone,
  useTestDb,
  DOC_URL,
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

  it('ancien compte sans mot de passe : le PREMIER mot de passe saisi est adopté', async () => {
    const { user } = await createTourist();
    const premiere = await request(app)
      .post('/api/auth/visitor-login')
      .send({ phone: user.phone, password: 'PremierMdp1' });
    assert.equal(premiere.status, 200, JSON.stringify(premiere.body));

    // Le mot de passe est désormais exigé.
    const mauvais = await request(app)
      .post('/api/auth/visitor-login')
      .send({ phone: user.phone, password: 'AutreChose1' });
    assert.equal(mauvais.status, 401);
    const bon = await request(app)
      .post('/api/auth/visitor-login')
      .send({ phone: user.phone, password: 'PremierMdp1' });
    assert.equal(bon.status, 200);
  });

  it('garde-fous : compte local → 409 ; jeton visiteur sans pouvoirs chauffeur ni compte local', async () => {
    const { user: local } = await createLocal();
    const connexionLocal = await request(app)
      .post('/api/auth/visitor-login')
      .send({ phone: local.phone, password: 'PeuImporte1' });
    assert.equal(connexionLocal.status, 409);
    assert.equal(connexionLocal.body.error.code, 'not_visitor_account');

    const phone = nextPhone();
    const { body } = await request(app)
      .post('/api/auth/visitor-register')
      .send({ phone, password: 'MonSecret1' });
    // Pas de création de compte local avec un jeton visiteur.
    const localRefuse = await request(app)
      .post('/api/users')
      .set(authHeaders(body.token))
      .send({ fullName: 'Faux Local', phone, accountType: 'local', idDocumentUrl: DOC_URL });
    assert.equal(localRefuse.status, 403);
    // Pas d'espace chauffeur.
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
