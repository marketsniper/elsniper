// Mise à jour automatique de la version web.
//
// Un iPhone est resté coincé des heures sur une version périmée : l'app
// ajoutée à l'écran d'accueil n'est jamais vraiment fermée, et tous les
// fichiers capables de la dépanner étaient servis avec un cache de 7 jours.
// Ces tests verrouillent la règle : seuls les fichiers dont le NOM change à
// chaque version peuvent être gardés ; tout le reste est revalidé.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, useTestDb } from './setup.js';

useTestDb();

const revalide = (res) => /no-cache/.test(res.headers['cache-control'] ?? '');

describe('Version web : le téléphone ne peut pas rester en arrière', () => {
  it('version.json annonce la version servie et n’est jamais mis en cache', async () => {
    const res = await request(app).get('/web/version.json');
    assert.equal(res.status, 200);
    const carte = JSON.parse(res.text);
    assert.ok(carte.version, 'estampille de version absente');
    assert.match(carte.entree, /^entry-[0-9a-f]+\.js$/, 'nom du fichier application absent');
    assert.ok(revalide(res), `version.json mis en cache : ${res.headers['cache-control']}`);
  });

  it('le fichier annoncé est bien celui que charge la page', async () => {
    const carte = JSON.parse((await request(app).get('/web/version.json')).text);
    const page = await request(app).get('/web/');
    assert.equal(page.status, 200);
    assert.ok(
      page.text.includes(carte.entree),
      `la page ne charge pas ${carte.entree} — les téléphones se remettraient à neuf en boucle`
    );
  });

  it('page, service worker et script de dépannage sont revalidés à chaque ouverture', async () => {
    for (const chemin of ['/web/', '/web/service-worker.js', '/web/installation.js']) {
      const res = await request(app).get(chemin);
      assert.equal(res.status, 200, `${chemin} introuvable`);
      assert.ok(revalide(res), `${chemin} gardé en cache : ${res.headers['cache-control']}`);
    }
  });

  it('les fichiers dont le nom change restent gardés longtemps', async () => {
    const carte = JSON.parse((await request(app).get('/web/version.json')).text);
    const res = await request(app).get(`/web/_expo/static/js/web/${carte.entree}`);
    assert.equal(res.status, 200);
    assert.match(
      res.headers['cache-control'] ?? '',
      /max-age=\d{5,}/,
      'les gros fichiers seraient retéléchargés à chaque ouverture'
    );
  });

  it('le service worker vide l’ancien cache et recharge les fenêtres ouvertes', async () => {
    const sw = (await request(app).get('/web/service-worker.js')).text;
    assert.ok(!/zanzigo-web-v1'/.test(sw), 'le nom du cache n’a pas changé : l’ancien survivrait');
    assert.ok(/navigate\(/.test(sw), 'les fenêtres ouvertes ne sont pas rechargées');
    assert.ok(
      /version\.json/.test(sw),
      'la carte d’identité doit échapper au service worker, sinon elle serait servie de mémoire'
    );
  });
});
