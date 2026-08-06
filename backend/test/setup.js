// Socle commun de la suite de tests (node --test + supertest).
//
// - Applique les migrations db/migrations/*.sql sur la base de TEST
//   (zanzigo_test) si besoin — même logique idempotente que scripts/migrate.js.
// - Tronque toutes les tables entre chaque test (TRUNCATE ... RESTART
//   IDENTITY CASCADE) : chaque test repart d'une base vide, déterministe.
// - Helpers d'authentification : le flux OTP réel (request-otp → devCode
//   exposé hors production → verify-otp → JWT), plus les créations de
//   profils (touriste, résident, chauffeur, hôtel) et les headers admin.
// - L'app Express est montée en mémoire via createApp() (supertest,
//   aucun listen() sur un port).
//
// Usage dans un fichier de test :
//   import { useTestDb, app, ... } from './setup.js';
//   useTestDb(); // enregistre les hooks before/beforeEach/after
import { after, before, beforeEach } from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import { createApp } from '../src/app.js';

// ===== Garde-fous : ne JAMAIS tourner sur une autre base que zanzigo_test =====
if (!/\/zanzigo_test(\?|$)/.test(config.databaseUrl)) {
  throw new Error(
    `Les tests exigent DATABASE_URL sur la base zanzigo_test (reçu : ${config.databaseUrl}). ` +
      'Lancer via "npm test".'
  );
}
if (config.env !== 'test') {
  throw new Error('Les tests exigent NODE_ENV=test (rate limiting désactivé). Lancer via "npm test".');
}

// App Express montée en mémoire (aucun port ouvert)
export const app = createApp();

// ===== Migrations (idempotent, même logique que scripts/migrate.js) =====
const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'db',
  'migrations'
);

export async function applyMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const { rows } = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (rows.length > 0) continue;
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

// ===== Nettoyage : toutes les tables sauf schema_migrations =====
export async function truncateAll() {
  const { rows } = await pool.query(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  await pool.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

// Enregistre les hooks standards d'un fichier de test :
// migrations avant tout, base tronquée avant CHAQUE test, pool fermé à la fin.
export function useTestDb() {
  before(async () => {
    await applyMigrations();
  });
  beforeEach(async () => {
    await truncateAll();
  });
  after(async () => {
    await pool.end();
  });
}

// ===== Données uniques par processus de test =====

// Numéros au format international (^\+[1-9]\d{6,14}$), uniques dans le
// processus — la base est tronquée entre tests, mais l'unicité évite toute
// collision au sein d'un même test.
let phoneCounter = 0;
export function nextPhone() {
  phoneCounter += 1;
  return `+2557${String(10000000 + phoneCounter)}`;
}

// Plaques uniques (contrainte UNIQUE sur drivers.vehicle_plate)
let plateCounter = 0;
export function nextPlate() {
  plateCounter += 1;
  return `Z ${String(1000 + plateCounter)} TST`;
}

// URL factice de document (Zod exige une URL valide)
export const DOC_URL = 'https://files.example.com/document.jpg';

// ===== Helpers HTTP =====

// Headers admin (équipe zanziGo) — dev-admin-key en dev/test
export function adminHeaders() {
  return { 'X-Admin-Key': config.adminApiKey };
}

// Headers Bearer
export function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

// Flux OTP complet : request-otp (devCode exposé hors production) →
// verify-otp → {token, user, driver, hotel}
export async function authenticate(phone) {
  const otpRes = await request(app).post('/api/auth/request-otp').send({ phone });
  if (otpRes.status !== 200 || !otpRes.body.devCode) {
    throw new Error(`request-otp a échoué pour ${phone} : ${JSON.stringify(otpRes.body)}`);
  }
  const verifyRes = await request(app)
    .post('/api/auth/verify-otp')
    .send({ phone, code: otpRes.body.devCode });
  if (verifyRes.status !== 200 || !verifyRes.body.token) {
    throw new Error(`verify-otp a échoué pour ${phone} : ${JSON.stringify(verifyRes.body)}`);
  }
  return verifyRes.body; // {token, user, driver, hotel}
}

// Touriste : OTP → profil (USD, vérifié d'office — aucun document requis).
// Retour : {token, user}
export async function createTourist({ phone = nextPhone(), fullName = 'Alice Tourist', email } = {}) {
  const { token } = await authenticate(phone);
  const res = await request(app)
    .post('/api/users')
    .set(authHeaders(token))
    .send({ fullName, phone, accountType: 'tourist', ...(email ? { email } : {}) });
  if (res.status !== 201) {
    throw new Error(`création touriste échouée : ${JSON.stringify(res.body)}`);
  }
  return { token, user: res.body };
}

// Résident : OTP → profil (TZS, pending) → PATCH verify par l'équipe
// (sauf verify: false pour garder un compte en attente).
// Retour : {token, user}
export async function createResident({
  phone = nextPhone(),
  fullName = 'Bakari Resident',
  verify = true,
} = {}) {
  const { token } = await authenticate(phone);
  const res = await request(app)
    .post('/api/users')
    .set(authHeaders(token))
    .send({ fullName, phone, accountType: 'resident', idDocumentUrl: DOC_URL });
  if (res.status !== 201) {
    throw new Error(`création résident échouée : ${JSON.stringify(res.body)}`);
  }
  let user = res.body;
  if (verify) {
    const verifyRes = await request(app)
      .patch(`/api/users/${user.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'verified' });
    if (verifyRes.status !== 200) {
      throw new Error(`vérification résident échouée : ${JSON.stringify(verifyRes.body)}`);
    }
    user = verifyRes.body;
  }
  return { token, user };
}

// Candidature chauffeur (pending, sans QR véhicule).
// Retour : {token, driver}
export async function createDriverApplication({
  phone = nextPhone(),
  fullName = 'Juma Driver',
  zone = 'Stone Town',
  vehiclePlate = nextPlate(),
} = {}) {
  const { token } = await authenticate(phone);
  const res = await request(app)
    .post('/api/drivers')
    .set(authHeaders(token))
    .send({
      fullName,
      phone,
      licenseNumber: `LIC-${vehiclePlate.replace(/\s/g, '')}`,
      vehiclePlate,
      vehicleModel: 'Toyota Noah',
      zone,
      licenseDocumentUrl: DOC_URL,
      idDocumentUrl: DOC_URL,
    });
  if (res.status !== 201) {
    throw new Error(`candidature chauffeur échouée : ${JSON.stringify(res.body)}`);
  }
  return { token, driver: res.body };
}

// Chauffeur vérifié par l'équipe : candidature → PATCH verify (admin) →
// QR véhicule VEH-... généré.
// Retour : {token, driver}
export async function createVerifiedDriver(opts = {}) {
  const { token, driver } = await createDriverApplication(opts);
  const verifyRes = await request(app)
    .patch(`/api/drivers/${driver.id}/verify`)
    .set(adminHeaders())
    .send({ status: 'verified' });
  if (verifyRes.status !== 200) {
    throw new Error(`vérification chauffeur échouée : ${JSON.stringify(verifyRes.body)}`);
  }
  return { token, driver: verifyRes.body };
}

// Hôtel partenaire : OTP → profil (pas de workflow de vérification côté hôtels).
// Retour : {token, hotel}
export async function createHotel({
  phone = nextPhone(),
  name = 'Hôtel Test',
  contactName = 'Contact Test',
  zone = 'Nungwi',
} = {}) {
  const { token } = await authenticate(phone);
  const res = await request(app)
    .post('/api/hotels')
    .set(authHeaders(token))
    .send({ name, phone, contactName, zone });
  if (res.status !== 201) {
    throw new Error(`création hôtel échouée : ${JSON.stringify(res.body)}`);
  }
  return { token, hotel: res.body };
}
