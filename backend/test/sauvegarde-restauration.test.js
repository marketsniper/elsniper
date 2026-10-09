// SAUVEGARDE → RESTAURATION : l'aller-retour qui protège des bases
// gratuites Render (elles expirent tous les 30 jours — on exporte avant,
// on réinjecte après, rien ne se perd).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { pool } from '../src/db.js';
import { adminHeaders, app, createVerifiedDriver, useTestDb } from './setup.js';

useTestDb();

describe('Sauvegarde puis restauration : le cycle complet', () => {
  it('exporte, vide, restaure — comptes identiques et séquences recalées', async () => {
    // Un chauffeur vérifié pose des lignes dans users, drivers,
    // driver_signups et uploaded_files — quatre tables liées entre elles.
    await createVerifiedDriver();

    const exporte = await request(app).get('/api/stats/sauvegarde').set(adminHeaders());
    assert.equal(exporte.status, 200);
    const avant = {};
    for (const [nom, lignes] of Object.entries(exporte.body.tables)) {
      if (lignes.length > 0) avant[nom] = lignes.length;
    }
    assert.ok(avant.drivers >= 1, 'le chauffeur doit être dans la sauvegarde');

    // La base « expire » : tout disparaît, comme à l'échéance Render.
    for (const nom of Object.keys(avant)) {
      await pool.query(`TRUNCATE "${nom}" CASCADE`);
    }

    const restaure = await request(app)
      .post('/api/stats/restauration')
      .set(adminHeaders())
      .send(exporte.body);
    assert.equal(restaure.status, 200);
    assert.deepEqual(restaure.body.echecs, {}, 'aucune table ne doit rester bloquée');
    for (const [nom, n] of Object.entries(avant)) {
      assert.equal(restaure.body.inserees[nom], n, `${nom} : toutes les lignes reviennent`);
    }

    // La base reste pleinement utilisable après restauration : une nouvelle
    // écriture passe (identifiants UUID et séquences recalées par la route).
    const { rows } = await pool.query(
      `INSERT INTO uploaded_files (mime_type, size, data)
       VALUES ('text/plain', 2, 'ok') RETURNING id`
    );
    assert.ok(rows[0].id, 'insertion possible après restauration');
  });

  it('ne touche jamais une table déjà remplie — rejouer ne duplique rien', async () => {
    await createVerifiedDriver();
    const exporte = await request(app).get('/api/stats/sauvegarde').set(adminHeaders());

    const { rows: avant } = await pool.query('SELECT COUNT(*)::int AS n FROM drivers');
    const rejoue = await request(app)
      .post('/api/stats/restauration')
      .set(adminHeaders())
      .send(exporte.body);
    assert.equal(rejoue.status, 200);
    assert.ok(rejoue.body.ignorees.includes('drivers'), 'drivers déjà remplie → ignorée');
    const { rows: apres } = await pool.query('SELECT COUNT(*)::int AS n FROM drivers');
    assert.equal(apres[0].n, avant[0].n, 'aucun doublon');
  });

  it('sans clé équipe → 401 ; sauvegarde difforme → 400', async () => {
    const sans = await request(app).post('/api/stats/restauration').send({ tables: {} });
    assert.equal(sans.status, 401);
    const difforme = await request(app)
      .post('/api/stats/restauration')
      .set(adminHeaders())
      .send({ pas: 'de tables' });
    assert.equal(difforme.status, 400);
  });
});
