// Mise à jour de la version installée (PWA) : à chaque ouverture, on
// redemande le service worker au serveur. Sans ça, un téléphone pouvait
// rester des jours sur une ancienne version — et les corrections
// n'arrivaient jamais jusqu'au client.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready
    .then(function (enregistrement) {
      enregistrement.update();
      // Toutes les heures si l'application reste ouverte.
      setInterval(function () {
        enregistrement.update();
      }, 60 * 60 * 1000);
    })
    .catch(function () {});
  // Une nouvelle version a pris la main : on recharge une seule fois pour
  // que l'écran affiché corresponde vraiment au code installé.
  // Exception : la toute première installation, où personne ne tenait la
  // barre avant. La page affichée est déjà la bonne — la recharger ne servait
  // qu'à faire clignoter l'écran à chaque première visite.
  var premiereInstallation = !navigator.serviceWorker.controller;
  var rechargeFaite = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (premiereInstallation || rechargeFaite) return;
    rechargeFaite = true;
    window.location.reload();
  });
}

// ===== LA VERSION AFFICHÉE EST-ELLE BIEN LA DERNIÈRE ? =====================
//
// L'iPhone ne ferme pas vraiment une application ajoutée à l'écran d'accueil :
// il en garde une photographie et la ravive telle quelle. Résultat, un
// téléphone pouvait rester des heures sur une version périmée alors que son
// propriétaire l'avait « fermée et rouverte » plusieurs fois.
//
// On ne compte donc plus sur le téléphone. À chaque ouverture — et à chaque
// retour à l'écran — on demande au serveur sa carte d'identité (version.json,
// jamais mise en cache) et on la compare au code réellement chargé dans la
// page. S'ils diffèrent, on se remet à neuf sans rien demander à personne.
(function () {
  var CLE = 'zanzigo-version-remise-a-neuf';
  var enCours = false;
  var dernierControle = 0;

  // Nom du fichier de l'application effectivement chargé dans cette page.
  // Il change à chaque version : c'est le repère le plus sûr, et le seul que
  // les anciennes versions savent déjà donner.
  function versionChargee() {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var nom = (scripts[i].getAttribute('src') || '').split('/').pop();
      if (/^entry-[0-9a-f]+\.js$/.test(nom)) return nom;
    }
    return null;
  }

  function memoire(cle) {
    try {
      return window.localStorage.getItem(cle);
    } catch (e) {
      return null;
    }
  }

  function retenir(cle, valeur) {
    try {
      window.localStorage.setItem(cle, valeur);
    } catch (e) {
      // Navigation privée : tant pis, on ne se remettra à neuf qu'une fois
      // par ouverture de page (le drapeau `enCours` suffit).
    }
  }

  async function controler() {
    if (enCours) return;
    // Au plus un contrôle par minute : le retour à l'écran peut se produire
    // plusieurs fois de suite.
    var maintenant = Date.now();
    if (maintenant - dernierControle < 60 * 1000) return;
    dernierControle = maintenant;

    var chargee = versionChargee();
    if (!chargee) return;
    try {
      var reponse = await fetch('/web/version.json?t=' + maintenant, { cache: 'no-store' });
      if (!reponse.ok) return;
      var enLigne = await reponse.json();
      if (!enLigne || !enLigne.entree || enLigne.entree === chargee) return;

      // GARDE-FOU : une seule remise à neuf par version en ligne. Si le
      // serveur restait en désaccord avec lui-même, la page se rechargerait
      // en boucle — pire que le défaut qu'on corrige.
      if (memoire(CLE) === enLigne.entree) return;
      retenir(CLE, enLigne.entree);

      enCours = true;
      if (typeof window.zanzigoForcerMiseAJour === 'function') await window.zanzigoForcerMiseAJour();
      else window.location.reload();
    } catch (e) {
      // Serveur endormi ou réseau coupé : on réessaiera au prochain retour.
    }
  }

  // À l'ouverture, puis à chaque fois que l'écran revient au premier plan.
  controler();
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) controler();
  });
  window.addEventListener('focus', controler);
  window.addEventListener('pageshow', function (evenement) {
    // `persisted` : la page revient telle quelle de la mémoire du navigateur.
    if (evenement.persisted) controler();
  });
})();

/**
 * Vide tout ce qui est gardé en mémoire par le navigateur et recharge :
 * le dernier recours quand un appareil reste coincé sur une vieille version.
 * Appelé depuis l'application (bouton « Mettre à jour l'application »).
 */
window.zanzigoForcerMiseAJour = async function () {
  try {
    if ('serviceWorker' in navigator) {
      var enregistrements = await navigator.serviceWorker.getRegistrations();
      await Promise.all(enregistrements.map(function (e) { return e.unregister(); }));
    }
    if (window.caches) {
      var noms = await caches.keys();
      await Promise.all(noms.map(function (n) { return caches.delete(n); }));
    }
  } catch (e) {
    // Peu importe la raison : on recharge quand même.
  }
  window.location.reload(true);
};

// Bouton « Installer zanziGo » : apparaît en bas de l'écran dès que le
// navigateur autorise l'installation (Chrome / Edge, événement
// beforeinstallprompt) — un seul geste au lieu de chercher l'icône dans la
// barre d'adresse. Disparaît une fois l'app installée ou le bouton refusé.
(function () {
  var evenement = null;

  function retirer() {
    var bouton = document.getElementById('zanzigo-installer');
    if (bouton) bouton.remove();
  }

  function afficher() {
    if (document.getElementById('zanzigo-installer')) return;
    var bouton = document.createElement('button');
    bouton.id = 'zanzigo-installer';
    bouton.type = 'button';
    bouton.textContent = '📥 Installer zanziGo';
    bouton.style.cssText = [
      'position:fixed',
      'bottom:18px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:9999',
      'background:#E4572E',
      'color:#FFF8F2',
      'border:none',
      'border-radius:999px',
      'padding:13px 24px',
      'font-size:16px',
      'font-weight:700',
      'font-family:system-ui,sans-serif',
      'box-shadow:0 6px 20px rgba(51,34,43,0.35)',
      'cursor:pointer',
    ].join(';');
    bouton.addEventListener('click', function () {
      if (!evenement) return retirer();
      evenement.prompt();
      evenement.userChoice.finally(function () {
        evenement = null;
        retirer();
      });
    });
    document.body.appendChild(bouton);
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    evenement = e;
    afficher();
  });

  window.addEventListener('appinstalled', retirer);
})();
