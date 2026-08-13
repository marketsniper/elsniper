// Page /app : le raccourci web (aucune installation) doit rester l'option
// PRINCIPALE pour tout le monde — c'est le lien mis sur les QR codes publics
// (affiches d'hôtel). L'APK reste proposé, mais seulement comme option
// chauffeur secondaire.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, useTestDb } from './setup.js';

useTestDb();

describe('Page /app', () => {
  it('propose la version web en premier, avant toute mention de chauffeur/APK', async () => {
    const res = await request(app).get('/app');
    assert.equal(res.status, 200);
    const html = res.text;

    const indexWeb = html.indexOf('href="/web"');
    const indexChauffeur = html.indexOf('chauffeur zanziGo');
    assert.ok(indexWeb > -1, 'lien vers /web absent');
    assert.ok(indexChauffeur > -1, 'section chauffeur absente');
    assert.ok(
      indexWeb < indexChauffeur,
      'le lien /web doit apparaître avant la section chauffeur (priorité au zéro-installation)'
    );
  });

  it('/chauffeur : cible du QR chauffeurs — APK direct + contact WhatsApp', async () => {
    const res = await request(app).get('/chauffeur');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('.apk'), 'bouton APK absent');
    assert.ok(res.text.includes('wa.me'), 'contact WhatsApp absent');
    assert.ok(res.text.includes('Madereva'), 'version swahili absente');
  });
});
