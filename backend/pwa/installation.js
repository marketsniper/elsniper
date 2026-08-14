// Bouton « Installer zanziGo » de la version web.
//
// Tout ce qui concerne la MISE À JOUR a déménagé dans mise-a-jour.js : ce
// fichier-ci pouvait rester une semaine en mémoire dans un iPhone, ce qui
// enfermait dehors le script chargé justement de dépanner l'appareil.

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
