// Service worker zanziGo (version web /web).
// Stratégie volontairement simple et sûre :
//  - l'API (/api/…) n'est JAMAIS interceptée ni mise en cache ;
//  - les assets hachés (_expo/, assets/) sont servis cache d'abord — leurs
//    noms changent à chaque build, donc jamais de contenu périmé ;
//  - les pages (/web/…) sont servies réseau d'abord, avec repli sur la
//    dernière version en cache quand le réseau est coupé, et en tout dernier
//    recours sur un écran d'attente maison : JAMAIS « Ce site est
//    inaccessible » du navigateur, qui laisse l'utilisateur devant un mur.
const CACHE = 'zanzigo-web-2026-09-05.0946-5af9a35';
const COQUILLE = '/web/';

// Y avait-il déjà une version installée ? Si oui, les fenêtres ouvertes
// affichent l'ANCIENNE application : il faudra les recharger.
let remplaceUneVersion = false;

self.addEventListener('install', (evenement) => {
  remplaceUneVersion = !!self.registration.active;
  // La coquille de page est mise de côté DÈS l'installation. Sans elle, une
  // coupure réseau au mauvais moment — le serveur gratuit qui redémarre juste
  // après une mise en ligne, par exemple — ne laissait rien à servir.
  evenement.waitUntil(precharger());
  self.skipWaiting();
});

/** Coquille de page + fichier de l'application : de quoi démarrer hors ligne. */
async function precharger() {
  try {
    const cache = await caches.open(CACHE);
    await cache.add(new Request(COQUILLE, { cache: 'reload' }));
    // version.json annonce le nom du fichier de l'application (il change à
    // chaque version) : sans lui, la coquille seule afficherait un écran vide.
    const carte = await fetch('/web/version.json', { cache: 'no-store' });
    const version = carte.ok ? await carte.json() : null;
    if (version && version.entree) {
      await cache.add('/web/_expo/static/js/web/' + version.entree);
    }
  } catch (e) {
    // Hors ligne à l'installation : on repassera par le réseau, c'est tout.
  }
}

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    (async () => {
      // Le nom du cache change à chaque version : tout l'ancien contenu part,
      // y compris la coquille de page gardée pour le mode hors-ligne. C'est
      // elle qui pouvait faire revivre une version périmée pendant des jours.
      const noms = await caches.keys();
      await Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
      // Rechargement des fenêtres ouvertes : lancé, mais surtout PAS attendu.
      // Cette navigation repasse par ce service worker, qui doit d'abord avoir
      // fini de s'activer — l'attendre ici bloquait le chargement de la page.
      if (remplaceUneVersion) rechargerLesFenetres();
    })()
  );
});

/**
 * Recharge les fenêtres ouvertes après l'arrivée d'une nouvelle version.
 * Sans ça, un téléphone qui ne ferme jamais vraiment l'application (l'iPhone
 * garde l'écran en mémoire) reste sur l'ancienne indéfiniment.
 */
async function rechargerLesFenetres() {
  const fenetres = await self.clients.matchAll({ type: 'window' });
  await Promise.all(
    fenetres.map((fenetre) =>
      fenetre.navigate ? fenetre.navigate(fenetre.url).catch(() => {}) : Promise.resolve()
    )
  );
}

// ----- ALERTES INSTANTANÉES ------------------------------------------------
// Le serveur pousse l'alerte ; c'est ce service worker qui l'affiche, même
// quand l'application est fermée. C'est ce qui remplace l'attente de 35 s de
// la passerelle WhatsApp gratuite.
self.addEventListener('push', (evenement) => {
  let donnees = { titre: 'zanziGo', corps: '' };
  try {
    if (evenement.data) donnees = { ...donnees, ...evenement.data.json() };
  } catch (e) {
    if (evenement.data) donnees.corps = evenement.data.text();
  }
  evenement.waitUntil(
    Promise.all([
      // Si le tableau de bord est ouvert, il se met à jour tout de suite
      // au lieu d'attendre son rafraîchissement automatique.
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
        for (const fenetre of fenetres) {
          fenetre.postMessage({ type: 'zanzigo-alerte', titre: donnees.titre, corps: donnees.corps });
        }
      }),
      self.registration.showNotification(donnees.titre, {
      body: donnees.corps,
      icon: '/web/icone-192.7ed6082a5b.png',
      badge: '/web/icone-192.7ed6082a5b.png',
      // Un même sujet remplace l'alerte précédente au lieu de s'empiler.
      tag: donnees.tag || 'zanzigo',
      renotify: true,
      data: { url: donnees.url || '/web/equipe' },
      }),
    ])
  );
});

// Toucher l'alerte ouvre le tableau de bord (ou le ramène au premier plan).
self.addEventListener('notificationclick', (evenement) => {
  evenement.notification.close();
  const cible = (evenement.notification.data && evenement.notification.data.url) || '/web/equipe';
  evenement.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      for (const fenetre of fenetres) {
        if (fenetre.url.includes('/web') && 'focus' in fenetre) {
          fenetre.navigate(cible).catch(function () {});
          return fenetre.focus();
        }
      }
      return self.clients.openWindow(cible);
    })
  );
});

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // jamais l'API
  // Carte d'identité de la version en ligne : toujours demandée au serveur,
  // jamais servie de mémoire — c'est elle qui détecte les versions périmées.
  if (url.pathname === '/web/version.json') return;

  // Assets hachés : cache d'abord.
  if (url.pathname.startsWith('/web/_expo/') || url.pathname.startsWith('/web/assets/')) {
    evenement.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const enCache = await cache.match(requete);
        if (enCache) return enCache;
        const reponse = await fetch(requete);
        if (reponse.ok) cache.put(requete, reponse.clone());
        return reponse;
      })
    );
    return;
  }

  // Pages /web : réseau d'abord, puis les filets de sécurité (voir plus bas).
  if (url.pathname === '/web' || url.pathname.startsWith('/web/')) {
    evenement.respondWith(reponsePage(requete));
  }
});

/**
 * Une page /web, avec trois filets sous le réseau :
 *   1. seconde tentative — l'hébergement gratuit s'endort, et le tout premier
 *      appel après le réveil est parfois refusé net (connexion réinitialisée) ;
 *   2. la dernière version en cache — l'application marche hors ligne ;
 *   3. un écran d'attente maison qui réessaie tout seul.
 *
 * Le troisième filet existe pour une raison précise : rendre `Response.error()`
 * fait afficher au navigateur son propre écran « Ce site est inaccessible »,
 * qui ne réessaie jamais et donne l'impression que zanziGo est mort.
 */
async function reponsePage(requete) {
  const navigation = requete.mode === 'navigate';
  try {
    return await reseau(requete, navigation);
  } catch (premierEchec) {
    if (navigation) {
      try {
        await new Promise((suite) => setTimeout(suite, 1500));
        return await reseau(requete, navigation);
      } catch (secondEchec) {
        // Les deux tentatives ont échoué : on descend dans les filets.
      }
    }
    const secours = await caches.match(navigation ? COQUILLE : requete);
    if (secours) return secours;
    return navigation ? ecranAttente() : Response.error();
  }
}

/** Un aller-retour réseau, en gardant la page servie pour le mode hors ligne. */
async function reseau(requete, navigation) {
  const reponse = await fetch(requete);
  if (reponse.ok && navigation) {
    const copie = reponse.clone();
    caches.open(CACHE).then((cache) => cache.put(COQUILLE, copie)).catch(() => {});
  }
  return reponse;
}

/**
 * Écran d'attente servi en 200 : le navigateur l'affiche comme une page
 * normale, et cette page se recharge toute seule jusqu'au retour du serveur,
 * en espaçant les tentatives pour ne pas tourner en boucle serrée.
 */
function ecranAttente() {
  return new Response(HTML_ATTENTE, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const HTML_ATTENTE = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>zanziGo</title>
<style>
  html, body { height: 100%; margin: 0; }
  body { background: #0E2733; color: #F4FBFC; display: flex; align-items: center;
         justify-content: center; text-align: center; padding: 24px;
         font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .marque { font-size: 34px; font-weight: 800; letter-spacing: -0.5px; }
  .marque span { color: #FFD9C9; }
  .rond { width: 34px; height: 34px; margin: 22px auto; border-radius: 50%;
          border: 3px solid rgba(255,255,255,.24); border-top-color: #37C4C9;
          animation: tourne 0.9s linear infinite; }
  @keyframes tourne { to { transform: rotate(360deg); } }
  p { margin: 6px 0; font-size: 15px; line-height: 1.45; }
  .discret { color: rgba(255,224,210,.6); font-size: 13px; }
  button { margin-top: 22px; background: #F4FBFC; color: #0E2733; border: 0;
           border-radius: 999px; padding: 13px 26px; font-size: 15px;
           font-weight: 600; cursor: pointer; }
</style></head>
<body><div>
  <div class="marque">zanzi<span>Go</span></div>
  <div class="rond"></div>
  <p>Le serveur se réveille, un instant…</p>
  <p class="discret">The server is waking up · Seva inaamka</p>
  <button onclick="location.reload()">Réessayer</button>
</div>
<script>
  // Le serveur gratuit met jusqu'à une minute à se relever. On réessaie en
  // espaçant : 4 s, 8 s, 12 s… plafonné à 30 s, pour ne pas le harceler.
  var n = 0;
  try { n = parseInt(sessionStorage.getItem('zanzigo-attente') || '0', 10) || 0; } catch (e) {}
  n = n + 1;
  try { sessionStorage.setItem('zanzigo-attente', String(n)); } catch (e) {}
  setTimeout(function () { location.reload(); }, Math.min(4000 * n, 30000));
</script>
</body></html>`;
