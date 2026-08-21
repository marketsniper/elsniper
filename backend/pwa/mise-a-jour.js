// Tout ce qui garantit qu'un téléphone affiche bien la DERNIÈRE version.
//
// Pourquoi un fichier à part, et pas la suite d'installation.js ? Parce qu'un
// iPhone gardait installation.js en mémoire pendant une semaine : le script
// chargé de dépanner l'appareil était lui-même enfermé dehors. Ce fichier-ci
// porte un nom neuf — aucun appareil ne l'a jamais mis en cache — et la page
// qui l'appelle, elle, est vérifiée à chaque ouverture. Il arrive donc
// partout dès la première visite, même sur un appareil resté en arrière.

// L'application s'est chargée : on efface le compteur de l'écran d'attente
// du service worker, pour que la prochaine panne réessaie vite (4 s) au lieu
// de repartir avec l'espacement de la panne précédente.
try {
  window.sessionStorage.removeItem('zanzigo-attente');
} catch (e) {
  // Navigation privée : sans mémoire, le compteur repart de zéro tout seul.
}

// ----- Une nouvelle version prend la main ---------------------------------
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

  // On recharge une seule fois pour que l'écran affiché corresponde vraiment
  // au code installé. Exception : la toute première installation, où personne
  // ne tenait la barre avant — la page affichée est déjà la bonne, et la
  // recharger ne faisait que clignoter l'écran à chaque première visite.
  var premiereInstallation = !navigator.serviceWorker.controller;
  var rechargeFaite = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (premiereInstallation || rechargeFaite) return;
    rechargeFaite = true;
    window.location.reload();
  });
}

/**
 * Vide tout ce qui est gardé en mémoire par le navigateur et recharge :
 * le dernier recours quand un appareil reste coincé sur une vieille version.
 * Appelé automatiquement (voir plus bas) et par le bouton « Mettre à jour
 * l'application » de l'écran Mon compte.
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

// ----- LA VERSION AFFICHÉE EST-ELLE BIEN LA DERNIÈRE ? ---------------------
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

  /**
   * Le client est-il en train de faire quelque chose ?
   *
   * Se remettre à neuf recharge la page : au milieu d'une inscription, ça
   * effacerait le formulaire et la pièce jointe qu'on vient de choisir. Or
   * c'est EXACTEMENT le moment où l'application revient au premier plan —
   * on sort du sélecteur de photos de l'iPhone. Dans le doute, on attend :
   * la mise à jour se fera au prochain retour, écran vide.
   */
  function occupe() {
    if (window.zanzigoEnvoiEnCours) return true;
    var champs = document.getElementsByTagName('input');
    for (var i = 0; i < champs.length; i++) {
      if (champs[i].type !== 'file' && champs[i].value) return true;
    }
    return false;
  }

  async function controler(force) {
    if (enCours) return;
    // Au plus un contrôle par minute : le retour à l'écran peut se produire
    // plusieurs fois de suite.
    var maintenant = Date.now();
    if (!force && maintenant - dernierControle < 60 * 1000) return;
    dernierControle = maintenant;

    var chargee = versionChargee();
    if (!chargee) return;
    try {
      // Le serveur gratuit s'endort : cette demande peut mettre une minute à
      // répondre. On ne lui met donc aucun délai — mieux vaut une réponse
      // tardive que rester sur une version périmée.
      var reponse = await fetch('/web/version.json?t=' + maintenant, { cache: 'no-store' });
      if (!reponse.ok) return;
      var enLigne = await reponse.json();
      if (!enLigne || !enLigne.entree || enLigne.entree === chargee) return;

      // Formulaire commencé ou pièce jointe en cours d'envoi : on ne touche
      // à rien. Le contrôle sera refait au prochain retour à l'écran.
      if (occupe()) {
        dernierControle = 0;
        return;
      }

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

  // Contrôle immédiat, sans attendre le prochain retour à l'écran.
  window.zanzigoVerifierVersion = function () {
    return controler(true);
  };

  // À l'ouverture, puis à chaque fois que l'écran revient au premier plan.
  controler();
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) controler();
  });
  window.addEventListener('focus', function () {
    controler();
  });
  window.addEventListener('pageshow', function (evenement) {
    // `persisted` : la page revient telle quelle de la mémoire du navigateur.
    if (evenement.persisted) controler();
  });
})();
