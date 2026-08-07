// Tests utilisateurs : inscription touriste/résident, ownership, validation
// manuelle du document par l'équipe — plus l'upload de fichiers (documents).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  DOC_URL,
  adminHeaders,
  app,
  authHeaders,
  authenticate,
  createResident,
  createTourist,
  nextPhone,
  useTestDb,
} from './setup.js';

useTestDb();

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

// Petit PNG factice : multer ne lit que le mimetype déclaré, un buffer
// minimal suffit pour l'upload de test.
const PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('Utilisateurs (users)', () => {
  it('touriste créé en USD, vérifié d\'office', async () => {
    const phone = nextPhone();
    const { token } = await authenticate(phone);
    const res = await request(app)
      .post('/api/users')
      .set(authHeaders(token))
      .send({ fullName: 'Alice Tourist', phone, email: 'alice@example.com', accountType: 'tourist' });
    assert.equal(res.status, 201);
    assert.equal(res.body.currency, 'USD');
    assert.equal(res.body.verification_status, 'verified');
    assert.equal(res.body.account_type, 'tourist');
    assert.equal(res.body.email, 'alice@example.com');
  });

  it('résident créé en USD (remise après validation), en attente de vérification', async () => {
    const phone = nextPhone();
    const { token } = await authenticate(phone);
    const res = await request(app)
      .post('/api/users')
      .set(authHeaders(token))
      .send({ fullName: 'Bakari Resident', phone, accountType: 'resident', idDocumentUrl: DOC_URL });
    assert.equal(res.status, 201);
    assert.equal(res.body.currency, 'USD');
    assert.equal(res.body.verification_status, 'pending');
    assert.equal(res.body.id_document_url, DOC_URL);
  });

  it('résident sans document → 400 validation_error', async () => {
    const phone = nextPhone();
    const { token } = await authenticate(phone);
    const res = await request(app)
      .post('/api/users')
      .set(authHeaders(token))
      .send({ fullName: 'Sans Document', phone, accountType: 'resident' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'validation_error');
  });

  it('accountType inconnu → 400 validation_error', async () => {
    const phone = nextPhone();
    const { token } = await authenticate(phone);
    const res = await request(app)
      .post('/api/users')
      .set(authHeaders(token))
      .send({ fullName: 'Type Bidon', phone, accountType: 'alien' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'validation_error');
  });

  it('création avec un autre téléphone que le jeton → 403 phone_mismatch', async () => {
    const { token } = await authenticate(nextPhone());
    const res = await request(app)
      .post('/api/users')
      .set(authHeaders(token))
      .send({ fullName: 'Imposteur', phone: nextPhone(), accountType: 'tourist' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'phone_mismatch');
  });

  it('téléphone déjà enregistré → 409 duplicate', async () => {
    const phone = nextPhone();
    const { token } = await createTourist({ phone });
    const res = await request(app)
      .post('/api/users')
      .set(authHeaders(token))
      .send({ fullName: 'Doublon', phone, accountType: 'tourist' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'duplicate');
  });

  it('GET /:id : titulaire → 200, autre client → 403 forbidden, équipe → 200', async () => {
    const { token, user } = await createTourist();
    const { token: otherToken } = await createTourist({ fullName: 'Autre Cliente' });

    const own = await request(app).get(`/api/users/${user.id}`).set(authHeaders(token));
    assert.equal(own.status, 200);
    assert.equal(own.body.id, user.id);

    const other = await request(app).get(`/api/users/${user.id}`).set(authHeaders(otherToken));
    assert.equal(other.status, 403);
    assert.equal(other.body.error.code, 'forbidden');

    const admin = await request(app).get(`/api/users/${user.id}`).set(adminHeaders());
    assert.equal(admin.status, 200);
  });

  it('GET /:id inconnu (équipe) → 404 not_found', async () => {
    const res = await request(app).get(`/api/users/${UNKNOWN_ID}`).set(adminHeaders());
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'not_found');
  });

  it('verify sans clé équipe → 401 admin_required', async () => {
    const { token, user } = await createResident({ verify: false });
    const res = await request(app)
      .patch(`/api/users/${user.id}/verify`)
      .set(authHeaders(token))
      .send({ status: 'verified' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'admin_required');
  });

  it('verify résident → verified ; double verify → 409 invalid_status', async () => {
    const { user } = await createResident({ verify: false });

    const first = await request(app)
      .patch(`/api/users/${user.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'verified' });
    assert.equal(first.status, 200);
    assert.equal(first.body.verification_status, 'verified');

    const second = await request(app)
      .patch(`/api/users/${user.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'verified' });
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'invalid_status');
  });

  it('verify avec status rejected → compte rejeté (puis 409 si retraité)', async () => {
    const { user } = await createResident({ verify: false });
    const res = await request(app)
      .patch(`/api/users/${user.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'rejected' });
    assert.equal(res.status, 200);
    assert.equal(res.body.verification_status, 'rejected');

    const retry = await request(app)
      .patch(`/api/users/${user.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'verified' });
    assert.equal(retry.status, 409);
    assert.equal(retry.body.error.code, 'invalid_status');
  });

  it('verify d\'un touriste (déjà verified d\'office) → 409 invalid_status', async () => {
    const { user } = await createTourist();
    const res = await request(app)
      .patch(`/api/users/${user.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'verified' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'invalid_status');
  });
});

describe('Uploads (documents, photos)', () => {
  it('upload sans jeton → 401 unauthorized', async () => {
    const res = await request(app)
      .post('/api/uploads')
      .attach('file', PNG_BUFFER, { filename: 'photo.png', contentType: 'image/png' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'unauthorized');
  });

  it('upload d\'une image PNG → 201 {url, size, mimeType}', async () => {
    const { token } = await authenticate(nextPhone());
    const res = await request(app)
      .post('/api/uploads')
      .set(authHeaders(token))
      .attach('file', PNG_BUFFER, { filename: 'photo.png', contentType: 'image/png' });
    assert.equal(res.status, 201);
    assert.match(res.body.url, /^https?:\/\//);
    assert.equal(res.body.size, PNG_BUFFER.length);
    assert.equal(res.body.mimeType, 'image/png');
  });

  it('type de fichier non accepté → 400 unsupported_file_type', async () => {
    const { token } = await authenticate(nextPhone());
    const res = await request(app)
      .post('/api/uploads')
      .set(authHeaders(token))
      .attach('file', Buffer.from('bonjour'), { filename: 'notes.txt', contentType: 'text/plain' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'unsupported_file_type');
  });
});
