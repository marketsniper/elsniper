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
      icon: '/web/icone-192.png',
      badge: '/web/icone-192.png',
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
