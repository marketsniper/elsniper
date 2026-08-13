// Service worker zanziGo (version web /web).
// Stratégie volontairement simple et sûre :
//  - l'API (/api/…) n'est JAMAIS interceptée ni mise en cache ;
//  - les assets hachés (_expo/, assets/) sont servis cache d'abord — leurs
//    noms changent à chaque build, donc jamais de contenu périmé ;
//  - les pages (/web/…) sont servies réseau d'abord, avec repli sur la
//    dernière version en cache quand le réseau est coupé.
const CACHE = 'zanzigo-web-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    caches
      .keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // jamais l'API

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

  // Pages /web : réseau d'abord, repli hors-ligne sur la coquille en cache.
  if (url.pathname === '/web' || url.pathname.startsWith('/web/')) {
    evenement.respondWith(
      fetch(requete)
        .then((reponse) => {
          if (reponse.ok && requete.mode === 'navigate') {
            const copie = reponse.clone();
            caches.open(CACHE).then((cache) => cache.put('/web/', copie));
          }
          return reponse;
        })
        .catch(async () => {
          const secours = await caches.match(requete.mode === 'navigate' ? '/web/' : requete);
          return secours ?? Response.error();
        })
    );
  }
});
