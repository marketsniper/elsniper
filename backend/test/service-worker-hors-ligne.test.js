// Le service worker face au réseau qui lâche.
//
// Un écran « Ce site est inaccessible » (ERR_FAILED) est apparu sur la version
// web alors que le serveur répondait normalement : le service worker rendait
// `Response.error()` dès qu'un aller-retour échouait, et le navigateur affiche
// alors SA page d'erreur — qui ne réessaie jamais. Sur un hébergement gratuit
// qui s'endort et redémarre à chaque mise en ligne, ça arrive pour de bon.
//
// Ces tests exécutent le vrai fichier du service worker dans un navigateur
// simulé et vérifient qu'aucun chemin ne mène plus à cet écran.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const SOURCE = new URL('../pwa/service-worker.js', import.meta.url);
const ORIGINE = 'https://zanzigo-api.onrender.com';

/**
 * Charge le service worker dans un environnement minimal et rend de quoi
 * déclencher ses événements.
 *
 * @param reseau  ce que fait `fetch` : reçoit le n° de la tentative.
 * @param enCache contenu du cache au départ, par chemin.
 */
async function chargerServiceWorker({ reseau, enCache = {} }) {
  const source = await readFile(SOURCE, 'utf8');
  const ecouteurs = {};
  const cache = new Map(Object.entries(enCache));
  let tentatives = 0;

  const cleDe = (requete) =>
    new URL(typeof requete === 'string' ? requete : requete.url, ORIGINE).pathname;

  const boiteCache = {
    match: async (requete) => cache.get(cleDe(requete)) ?? undefined,
    put: async (requete, reponse) => void cache.set(cleDe(requete), reponse),
    add: async (requete) => {
      const reponse = await contexte.fetch(requete);
      if (!reponse.ok) throw new Error('add a échoué');
      cache.set(cleDe(requete), reponse);
    },
  };

  const contexte = {
    self: {
      addEventListener: (nom, fn) => void (ecouteurs[nom] = fn),
      registration: { active: null, showNotification: async () => {} },
      clients: { matchAll: async () => [], claim: async () => {} },
      skipWaiting: () => {},
      location: { origin: ORIGINE },
    },
    caches: {
      open: async () => boiteCache,
      keys: async () => [],
      delete: async () => true,
      match: boiteCache.match,
    },
    fetch: async (requete) => reseau(++tentatives, cleDe(requete)),
    // Les pauses du service worker (seconde chance) ne doivent pas ralentir
    // les tests : on les rend immédiates.
    setTimeout: (fn) => void fn(),
    Request: class {
      constructor(url, init) {
        this.url = new URL(url, ORIGINE).toString();
        this.init = init;
        this.method = 'GET';
      }
    },
    Response,
    URL,
    Promise,
    console,
  };
  contexte.self.fetch = contexte.fetch;
  vm.createContext(contexte);
  vm.runInContext(source, contexte);

  /** Joue l'événement `fetch` du service worker et rend ce qu'il a servi. */
  const demander = async (chemin, mode = 'navigate') => {
    let servi;
    ecouteurs.fetch({
      request: { method: 'GET', url: ORIGINE + chemin, mode },
      respondWith: (promesse) => void (servi = promesse),
    });
    return servi === undefined ? null : await servi;
  };

  return { demander, ecouteurs, cache, nbTentatives: () => tentatives };
}

const coupe = () => {
  throw new TypeError('Failed to fetch');
};
const page = (corps) => new Response(corps, { status: 200 });

describe('Service worker : le réseau qui lâche ne doit jamais bloquer', () => {
  it("réseau coupé et cache vide : un écran d'attente, pas l'erreur du navigateur", async () => {
    const sw = await chargerServiceWorker({ reseau: coupe });
    const reponse = await sw.demander('/web/equipe');

    // `Response.error()` a `type: 'error'` et un statut 0 : c'est CE cas qui
    // déclenche « Ce site est inaccessible ».
    assert.notEqual(reponse.type, 'error', "le navigateur afficherait son écran d'erreur");
    assert.equal(reponse.status, 200);
    const html = await reponse.text();
    assert.match(html, /zanzi/i, "l'écran d'attente ne porte pas la marque");
    assert.match(html, /location\.reload/, "l'écran d'attente ne réessaie pas tout seul");
  });

  it('un refus passager : la seconde tentative sert la vraie page', async () => {
    const sw = await chargerServiceWorker({
      reseau: (n) => (n === 1 ? coupe() : page('<html>application</html>')),
    });
    const reponse = await sw.demander('/web/');

    assert.equal(reponse.status, 200);
    assert.match(await reponse.text(), /application/);
    assert.equal(sw.nbTentatives(), 2, 'la seconde chance a disparu');
  });

  it('réseau coupé mais version déjà vue : on ressert la dernière connue', async () => {
    const sw = await chargerServiceWorker({
      reseau: coupe,
      enCache: { '/web/': page('<html>derniere version</html>') },
    });
    const reponse = await sw.demander('/web/equipe');

    assert.match(await reponse.text(), /derniere version/, "l'application hors ligne a disparu");
  });

  it('une page servie est gardée pour la prochaine coupure', async () => {
    const sw = await chargerServiceWorker({ reseau: () => page('<html>application</html>') });
    await sw.demander('/web/');
    await new Promise((suite) => setImmediate(suite)); // la mise en cache est différée

    assert.ok(sw.cache.has('/web/'), 'rien gardé : la prochaine coupure serait un mur');
  });

  it("l'API et la carte de version ne passent jamais par le cache", async () => {
    const sw = await chargerServiceWorker({ reseau: coupe });

    assert.equal(await sw.demander('/api/trips', 'cors'), null, "l'API est interceptée");
    assert.equal(
      await sw.demander('/web/version.json', 'cors'),
      null,
      'la carte de version est interceptée : un appareil pourrait rester sur une version périmée'
    );
  });

  it("l'installation met la coquille de côté avant la première coupure", async () => {
    const sw = await chargerServiceWorker({
      reseau: (n, chemin) =>
        chemin === '/web/version.json'
          ? page(JSON.stringify({ version: 'test', entree: 'entry-abc.js' }))
          : page('<html>application</html>'),
    });
    let attendu;
    sw.ecouteurs.install({ waitUntil: (promesse) => void (attendu = promesse) });
    await attendu;

    assert.ok(sw.cache.has('/web/'), 'coquille non préchargée');
    assert.ok(
      sw.cache.has('/web/_expo/static/js/web/entry-abc.js'),
      "fichier de l'application non préchargé : la coquille afficherait un écran vide"
    );
  });
});
