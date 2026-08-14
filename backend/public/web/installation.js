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
  var rechargeFaite = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (rechargeFaite) return;
    rechargeFaite = true;
    window.location.reload();
  });
}

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
