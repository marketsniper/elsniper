// Identification simplifiée des clients : un IDENTIFIANT choisi + un mot
// de passe. Plus d'indicatif ni de numéro à saisir pour entrer — et les
// comptes créés avant (par numéro) continuent de se connecter.
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
  DOC_URL,
} from './setup.js';

useTestDb();

// Identifiant unique par test (la base est partagée entre les scénarios).
let compteur = 0;
const nextIdentifiant = () => `zanzi.test${Date.now() % 100000}x${++compteur}`;

describe('Clients : identifiant + mot de passe', () => {
  it('création de compte → profil → connexion → réservation', async () => {
    const username = nextIdentifiant();
    const inscription = await request(app)
      .post('/api/auth/register')
      .send({ username, password: 'MonSecret1' });
    assert.equal(inscription.status, 201, JSON.stringify(inscription.body));
    assert.ok(inscription.body.token);
    assert.equal(inscription.body.user, null);

    // Profil SANS téléphone : l'identifiant suffit désormais.
    const profil = await request(app)
      .post('/api/users')
      .set(authHeaders(inscription.body.token))
      .send({ fullName: 'Touriste Identifiant', accountType: 'tourist' });
    assert.equal(profil.status, 201, JSON.stringify(profil.body));
    assert.equal(profil.body.username, username);
    assert.equal(profil.body.password_hash, undefined);

    // Connexion avec l'identifiant (insensible à la casse).
    const connexion = await request(app)
      .post('/api/auth/login')
      .send({ identifier: username.toUpperCase(), password: 'MonSecret1' });
    assert.equal(connexion.status, 200, JSON.stringify(connexion.body));
    assert.equal(connexion.body.user.id, profil.body.id);

    // Mauvais mot de passe → refus.
    const mauvais = await request(app)
      .post('/api/auth/login')
      .send({ identifier: username, password: 'MauvaisMdp1' });
    assert.equal(mauvais.status, 401);
    assert.equal(mauvais.body.error.code, 'invalid_credentials');

    // Le jeton permet de réserver.
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

  it('identifiant déjà pris → 409 explicite (à l\'inscription ET à la création du profil)', async () => {
    const username = nextIdentifiant();
    const premier = await request(app)
      .post('/api/auth/register')
      .send({ username, password: 'MonSecret1' });
    await request(app)
      .post('/api/users')
      .set(authHeaders(premier.body.token))
      .send({ fullName: 'Premier Arrive', accountType: 'tourist' });

    const doublon = await request(app)
      .post('/api/auth/register')
      .send({ username: username.toUpperCase(), password: 'AutreMdp1' });
    assert.equal(doublon.status, 409);
    assert.equal(doublon.body.error.code, 'username_taken');
  });

  it('identifiant mal formé refusé (espace, accent, trop court)', async () => {
    for (const username of ['ab', 'jean dupont', 'aminé', 'a'.repeat(21)]) {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username, password: 'MonSecret1' });
      assert.equal(res.status, 400, `« ${username} » aurait dû être refusé`);
    }
  });

  it('un LOCAL s\'inscrit pareil : identifiant + carte NIDA, tarif TZS', async () => {
    const username = nextIdentifiant();
    const inscription = await request(app)
      .post('/api/auth/register')
      .send({ username, password: 'SiriYangu1' });
    const profil = await request(app)
      .post('/api/users')
      .set(authHeaders(inscription.body.token))
      .send({
        fullName: 'Juma Identifiant',
        accountType: 'local',
        idDocumentUrl: DOC_URL,
        phone: nextPhone(), // contact WhatsApp, facultatif
      });
    assert.equal(profil.status, 201, JSON.stringify(profil.body));
    assert.equal(profil.body.account_type, 'local');
    assert.equal(profil.body.currency, 'TZS');
    assert.equal(profil.body.verification_status, 'pending');

    const connexion = await request(app)
      .post('/api/auth/login')
      .send({ identifier: username, password: 'SiriYangu1' });
    assert.equal(connexion.status, 200);
    assert.equal(connexion.body.user.id, profil.body.id);
  });

  it('les anciens comptes se connectent TOUJOURS avec leur numéro', async () => {
    const { user } = await createTourist();
    const connexion = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.phone, password: 'PremierMdp1' });
    assert.equal(connexion.status, 200, JSON.stringify(connexion.body));
    assert.equal(connexion.body.user.id, user.id);

    // Le mot de passe est désormais exigé pour ce compte.
    const mauvais = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.phone, password: 'AutreChose1' });
    assert.equal(mauvais.status, 401);
  });

  it('identifiant inconnu → 401 avec invitation à créer un compte', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'personne.inconnue', password: 'PeuImporte1' });
    assert.equal(res.status, 401);
    assert.match(res.body.error.message, /Créez votre compte/i);
  });

  it('mot de passe oublié : l\'équipe le réinitialise (identifiant conservé)', async () => {
    const username = nextIdentifiant();
    const inscription = await request(app)
      .post('/api/auth/register')
      .send({ username, password: 'AncienMdp1' });
    const profil = await request(app)
      .post('/api/users')
      .set(authHeaders(inscription.body.token))
      .send({ fullName: 'Oublieuse Identifiant', accountType: 'tourist' });

    const reset = await request(app)
      .patch(`/api/users/${profil.body.id}/password`)
      .set(adminHeaders())
      .send({ password: 'NouveauMdp1' });
    assert.equal(reset.status, 200);

    const ancienne = await request(app)
      .post('/api/auth/login')
      .send({ identifier: username, password: 'AncienMdp1' });
    assert.equal(ancienne.status, 401);
    const nouvelle = await request(app)
      .post('/api/auth/login')
      .send({ identifier: username, password: 'NouveauMdp1' });
    assert.equal(nouvelle.status, 200);
  });
});
