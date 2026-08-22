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

  it('page, service worker et scripts de dépannage sont revalidés à chaque ouverture', async () => {
    for (const chemin of [
      '/web/',
      '/web/service-worker.js',
      '/web/mise-a-jour.js',
      '/web/installation.js',
    ]) {
      const res = await request(app).get(chemin);
      assert.equal(res.status, 200, `${chemin} introuvable`);
      assert.ok(revalide(res), `${chemin} gardé en cache : ${res.headers['cache-control']}`);
    }
  });

  it('la page appelle le script de mise à jour, seul chemin sûr vers un appareil en retard', async () => {
    // Un appareil peut garder installation.js une semaine en mémoire ; la
    // PAGE, elle, est revérifiée à chaque ouverture. C'est donc par elle que
    // la mise à jour automatique doit arriver.
    const page = await request(app).get('/web/');
    assert.ok(page.text.includes('/web/mise-a-jour.js'), 'script de mise à jour absent de la page');
    const script = await request(app).get('/web/mise-a-jour.js');
    assert.ok(/version\.json/.test(script.text), 'la comparaison de version a disparu');
    assert.ok(/zanzigoForcerMiseAJour/.test(script.text), 'la remise à neuf a disparu');
    assert.ok(/visibilitychange/.test(script.text), 'le contrôle au retour à l’écran a disparu');
    // Se recharger au retour du sélecteur de photos effacerait le formulaire
    // et la pièce jointe que le client vient de choisir.
    assert.ok(
      /zanzigoEnvoiEnCours/.test(script.text),
      'la mise à jour ne patiente plus pendant un envoi de pièce jointe'
    );
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

  it('les icônes portent leur empreinte, et chacune existe', async () => {
    // Une application posée sur l'écran d'accueil garde l'icône qu'elle avait
    // le jour de l'installation : le téléphone ne la redemande QUE si son
    // ADRESSE change. Avec « icone-192.png » figé, un nouveau logo ne
    // remplaçait jamais l'ancien — l'écran d'accueil restait en arrière.
    const manifeste = JSON.parse((await request(app).get('/web/manifest.webmanifest')).text);
    assert.ok(manifeste.icons.length >= 3, 'le manifeste a perdu des icônes');
    for (const icone of manifeste.icons) {
      assert.match(
        icone.src,
        /^\/web\/[a-z0-9-]+\.[0-9a-f]{8,}\.png$/,
        `${icone.src} n'a pas d'empreinte : le téléphone garderait l'ancien logo`
      );
      const fichier = await request(app).get(icone.src);
      assert.equal(fichier.status, 200, `${icone.src} est annoncé mais introuvable`);
    }

    // Même règle pour l'icône iOS, qui vit dans la page et non le manifeste.
    const page = await request(app).get('/web/');
    const apple = page.text.match(/apple-touch-icon" href="([^"]+)"/);
    assert.ok(apple, 'la balise apple-touch-icon a disparu de la page');
    assert.match(
      apple[1],
      /^\/web\/apple-touch-icon\.[0-9a-f]{8,}\.png$/,
      'l’icône iOS garde un nom fixe'
    );
    assert.equal((await request(app).get(apple[1])).status, 200, 'icône iOS introuvable');
  });

  it('le service worker change à chaque version, sinon l’ancienne apparence survit', async () => {
    // Le navigateur ne réinstalle le service worker que s'il DIFFÈRE de celui
    // qu'il a déjà, à l'octet près. Avec un nom de cache écrit en dur, il
    // restait identique d'une mise en ligne à l'autre : ni ménage des vieux
    // caches, ni rechargement des fenêtres — le code prévu pour ça ne
    // s'exécutait jamais, et l'utilisateur voyait toujours l'écran d'avant.
    const version = JSON.parse((await request(app).get('/web/version.json')).text).version;
    const sw = (await request(app).get('/web/service-worker.js')).text;
    assert.ok(
      sw.includes(`zanzigo-web-${version}`),
      `le service worker ne porte pas l’estampille ${version} : le cache d’avant survivrait`
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
