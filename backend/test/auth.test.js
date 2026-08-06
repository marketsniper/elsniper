// Tests d'authentification : flux OTP → JWT, cas d'erreur, protections,
// réhydratation du jeton, routes équipe (X-Admin-Key).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { pool } from '../src/db.js';
import {
  adminHeaders,
  app,
  authHeaders,
  authenticate,
  createTourist,
  nextPhone,
  useTestDb,
} from './setup.js';

useTestDb();

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('Santé du serveur', () => {
  it('GET /health et GET /api/health → 200 ok', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');

    const apiRes = await request(app).get('/api/health');
    assert.equal(apiRes.status, 200);
    assert.equal(apiRes.body.status, 'ok');
  });

  it('route inconnue → 404 not_found', async () => {
    const res = await request(app).get('/api/nexiste-pas');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'not_found');
  });
});

describe('Authentification OTP', () => {
  it('request-otp → sent, expiration 10 min, devCode 6 chiffres hors production', async () => {
    const res = await request(app).post('/api/auth/request-otp').send({ phone: nextPhone() });
    assert.equal(res.status, 200);
    assert.equal(res.body.sent, true);
    assert.equal(res.body.expiresInMinutes, 10);
    assert.match(res.body.devCode, /^\d{6}$/, 'devCode exposé hors production');
  });

  it('request-otp avec téléphone mal formé → 400 validation_error', async () => {
    const res = await request(app).post('/api/auth/request-otp').send({ phone: '0777123456' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'validation_error');
  });

  it('request-otp → verify-otp : jeton délivré, profils null', async () => {
    const phone = nextPhone();
    const otpRes = await request(app).post('/api/auth/request-otp').send({ phone });
    assert.equal(otpRes.status, 200);

    const verifyRes = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone, code: otpRes.body.devCode });
    assert.equal(verifyRes.status, 200);
    assert.equal(typeof verifyRes.body.token, 'string');
    assert.equal(verifyRes.body.user, null);
    assert.equal(verifyRes.body.driver, null);
    assert.equal(verifyRes.body.hotel, null);

    // Le jeton est accepté par une route protégée (403 ownership, pas 401)
    const probe = await request(app)
      .get(`/api/users/${UNKNOWN_ID}`)
      .set(authHeaders(verifyRes.body.token));
    assert.equal(probe.status, 403);
  });

  it('mauvais code → 401 invalid_otp', async () => {
    const phone = nextPhone();
    const otpRes = await request(app).post('/api/auth/request-otp').send({ phone });
    const wrongCode = otpRes.body.devCode === '000000' ? '000001' : '000000';
    const res = await request(app).post('/api/auth/verify-otp').send({ phone, code: wrongCode });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'invalid_otp');
  });

  it('code mal formé (5 chiffres) → 400 validation_error', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone: nextPhone(), code: '12345' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'validation_error');
  });

  it('code expiré → 401 invalid_otp', async () => {
    const phone = nextPhone();
    const otpRes = await request(app).post('/api/auth/request-otp').send({ phone });
    // On force l'expiration du code directement en SQL
    await pool.query(
      `UPDATE otp_codes SET expires_at = now() - interval '1 minute' WHERE phone = $1`,
      [phone]
    );
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone, code: otpRes.body.devCode });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'invalid_otp');
  });

  it('code déjà consommé non rejouable → 401 invalid_otp', async () => {
    const phone = nextPhone();
    const otpRes = await request(app).post('/api/auth/request-otp').send({ phone });
    const first = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone, code: otpRes.body.devCode });
    assert.equal(first.status, 200);

    const replay = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone, code: otpRes.body.devCode });
    assert.equal(replay.status, 401);
    assert.equal(replay.body.error.code, 'invalid_otp');
  });

  it('nouvelle demande OTP : le code précédent est invalidé', async () => {
    const phone = nextPhone();
    const otp1 = await request(app).post('/api/auth/request-otp').send({ phone });
    const otp2 = await request(app).post('/api/auth/request-otp').send({ phone });

    const oldCode = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone, code: otp1.body.devCode });
    assert.equal(oldCode.status, 401, 'ancien code invalidé');

    const newCode = await request(app)
      .post('/api/auth/verify-otp')
      .send({ phone, code: otp2.body.devCode });
    assert.equal(newCode.status, 200, 'dernier code valide');
  });

  it('jeton émis AVANT la création du profil : réhydraté par téléphone à chaque requête', async () => {
    const phone = nextPhone();
    const { token } = await authenticate(phone); // jeton sans userId

    const created = await request(app)
      .post('/api/users')
      .set(authHeaders(token))
      .send({ fullName: 'Nouvelle Cliente', phone, accountType: 'tourist' });
    assert.equal(created.status, 201);

    // Le MÊME jeton donne accès au profil créé après son émission
    const res = await request(app)
      .get(`/api/users/${created.body.id}`)
      .set(authHeaders(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.id, created.body.id);
  });

  it('verify-otp après création du profil : user rattaché dans la réponse', async () => {
    const phone = nextPhone();
    const { user } = await createTourist({ phone });

    const again = await authenticate(phone);
    assert.equal(again.user.id, user.id);
    assert.equal(again.driver, null);
    assert.equal(again.hotel, null);
  });
});

describe('Protections des routes', () => {
  it('route protégée sans jeton → 401 unauthorized', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ fullName: 'X', phone: nextPhone(), accountType: 'tourist' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'unauthorized');
  });

  it('jeton invalide → 401 unauthorized', async () => {
    const res = await request(app)
      .get(`/api/users/${UNKNOWN_ID}`)
      .set(authHeaders('jeton.bidon.invalide'));
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'unauthorized');
  });

  it('route admin sans X-Admin-Key → 401 admin_required', async () => {
    const { token } = await authenticate(nextPhone());
    const res = await request(app)
      .patch(`/api/users/${UNKNOWN_ID}/verify`)
      .set(authHeaders(token))
      .send({ status: 'verified' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'admin_required');
  });

  it('route admin avec mauvaise clé → 401 admin_required', async () => {
    const res = await request(app)
      .patch(`/api/users/${UNKNOWN_ID}/verify`)
      .set({ 'X-Admin-Key': 'mauvaise-cle' })
      .send({ status: 'verified' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'admin_required');
  });

  it('la clé admin valide passe requireAuth sans JWT (bypass ownership)', async () => {
    const res = await request(app).get(`/api/users/${UNKNOWN_ID}`).set(adminHeaders());
    assert.equal(res.status, 404, 'clé acceptée → 404 not_found (pas 401/403)');
    assert.equal(res.body.error.code, 'not_found');
  });
});
