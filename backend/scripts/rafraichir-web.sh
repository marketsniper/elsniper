#!/usr/bin/env bash
# Reconstruit la version web (hôtels sur ordinateur) et la copie dans
# backend/public/web, en réappliquant les retouches d'index.html que
# l'export Expo écrase (titre français + colonne centrée sur grand écran).
# Usage : depuis la racine du dépôt,  bash backend/scripts/rafraichir-web.sh
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
API_URL="${EXPO_PUBLIC_API_URL:-https://zanzigo-api.onrender.com/api}"

# Estampille de version, affichée dans l'application : elle permet de savoir
# d'un coup d'œil, à distance, quelle version tourne réellement sur le
# téléphone d'un chauffeur ou d'un client.
VERSION="${EXPO_PUBLIC_VERSION:-$(date -u +%Y-%m-%d.%H%M)-$(git -C "$RACINE" rev-parse --short HEAD 2>/dev/null || echo local)}"

cd "$RACINE/mobile"
# --clear : sans ça, le cache de compilation peut resservir un bundle
# construit avec une AUTRE adresse d'API (une session de test en local a
# déjà failli être mise en ligne à la place de la production).
EXPO_PUBLIC_API_URL="$API_URL" EXPO_PUBLIC_VERSION="$VERSION" \
  npx expo export --platform web --output-dir dist-web --clear

rm -rf "$RACINE/backend/public/web"
cp -r dist-web "$RACINE/backend/public/web"

INDEX="$RACINE/backend/public/web/index.html"

# Titre + langue de la page.
sed -i 's|<html lang="en">|<html lang="fr">|' "$INDEX"
sed -i 's|<title>zanziGo</title>|<title>zanziGo — Taxi \&amp; colis à Zanzibar</title>|' "$INDEX"

# Colonne centrée façon téléphone sur grand écran (réception d'hôtel).
sed -i 's|  <link rel="icon" href="/web/favicon.ico" /></head>|    <style id="zanzigo-web">\n      body {\n        background: #071A22;\n      }\n      @media (min-width: 720px) {\n        #root {\n          max-width: 640px;\n          width: 100%;\n          margin: 0 auto;\n          box-shadow: 0 0 48px rgba(0, 0, 0, 0.45);\n          position: relative;\n          overflow: hidden;\n        }\n      }\n    </style>\n  <link rel="icon" href="/web/favicon.ico" /></head>|' "$INDEX"

# ===== PWA : fichiers (manifest, service worker, icônes) + balises =====
cp "$RACINE/backend/pwa/"* "$RACINE/backend/public/web/"

# LES ICÔNES PORTENT LEUR EMPREINTE DANS LEUR NOM.
# Une application posée sur l'écran d'accueil garde l'icône qu'elle avait le
# jour de l'installation : le téléphone ne la redemande QUE si son adresse
# change. Tant qu'elle s'appelait « icone-192.png », un nouveau dessin ne
# remplaçait jamais l'ancien — le logo restait celui d'avant, indéfiniment.
# Le nom porte maintenant l'empreinte du fichier : nouveau dessin, nouvelle
# adresse, et le téléphone va la chercher.
APPLE_TOUCH="apple-touch-icon.png"
for ICONE in icone-192 icone-512 icone-maskable-512 apple-touch-icon; do
  SRC="$RACINE/backend/public/web/$ICONE.png"
  EMPREINTE="$(sha256sum "$SRC" | cut -c1-10)"
  mv "$SRC" "$RACINE/backend/public/web/$ICONE.$EMPREINTE.png"
  # Toutes les références, où qu'elles vivent : manifeste (icônes de
  # l'écran d'accueil) et service worker (icône des alertes push).
  sed -i "s|/web/$ICONE\.png|/web/$ICONE.$EMPREINTE.png|g" \
    "$RACINE/backend/public/web/manifest.webmanifest" \
    "$RACINE/backend/public/web/service-worker.js"
  # Le nom haché de l'icône iOS repart dans la balise du <head>.
  if [ "$ICONE" = "apple-touch-icon" ]; then APPLE_TOUCH="$ICONE.$EMPREINTE.png"; fi
done

# LE SERVICE WORKER DOIT CHANGER À CHAQUE VERSION.
# Le navigateur ne le réinstalle que s'il diffère de celui qu'il a déjà, à
# l'octet près. Avec un nom de cache figé dans le fichier, il restait
# identique d'une mise en ligne à l'autre : ni ménage des anciens caches, ni
# rechargement des fenêtres ouvertes — le code prévu pour ça ne s'exécutait
# jamais. Le nom du cache porte donc l'estampille de la version.
sed -i "s|^const CACHE = '[^']*';|const CACHE = 'zanzigo-web-$VERSION';|" \
  "$RACINE/backend/public/web/service-worker.js"

# Balises PWA dans <head> : manifest, couleur de thème, icône iOS, plein écran iOS.
sed -i 's|  <link rel="icon" href="/web/favicon.ico" /></head>|  <link rel="icon" href="/web/favicon.ico" />\n    <link rel="manifest" href="/web/manifest.webmanifest" />\n    <meta name="theme-color" content="#073B57" />\n    <link rel="apple-touch-icon" href="/web/'"$APPLE_TOUCH"'" />\n    <meta name="apple-mobile-web-app-capable" content="yes" />\n    <meta name="apple-mobile-web-app-status-bar-style" content="black" />\n    <meta name="apple-mobile-web-app-title" content="zanziGo" />\n  </head>|' "$INDEX"

# Enregistrement du service worker + bouton « Installer » en fin de <body>.
# mise-a-jour.js est appelé depuis la PAGE, qui est vérifiée à chaque
# ouverture : c'est le seul chemin qui atteint à coup sûr un appareil resté
# en arrière, même s'il garde encore l'ancien installation.js en mémoire.
sed -i 's|</body>|  <script>\n    if ("serviceWorker" in navigator) {\n      window.addEventListener("load", function () {\n        navigator.serviceWorker.register("/web/service-worker.js");\n      });\n    }\n  </script>\n  <script src="/web/mise-a-jour.js" defer></script>\n  <script src="/web/installation.js" defer></script>\n</body>|' "$INDEX"

# ===== CARTE D'IDENTITÉ DE LA VERSION EN LIGNE =====
# Un fichier minuscule, jamais mis en cache, qui dit quelle version le serveur
# sert vraiment. L'application le lit à chaque ouverture et à chaque retour à
# l'écran : si le téléphone affiche autre chose (l'iPhone ravive volontiers une
# vieille photographie de l'app), il se remet à neuf tout seul.
ENTREE="$(basename "$(ls "$RACINE/backend/public/web/_expo/static/js/web/"entry-*.js | head -n 1)")"
cat > "$RACINE/backend/public/web/version.json" <<JSON
{
  "version": "$VERSION",
  "entree": "$ENTREE"
}
JSON

# GARDE-FOU : le bundle doit interroger l'API demandée, et JAMAIS une
# adresse locale (sinon la version en ligne ne parlerait à aucun serveur).
if grep -rqE 'https?://(127\.0\.0\.1|localhost):[0-9]+/api' "$RACINE/backend/public/web/_expo/"; then
  echo "ERREUR : le bundle pointe sur une API LOCALE — reconstruction nécessaire" >&2
  exit 1
fi
grep -rq "$API_URL" "$RACINE/backend/public/web/_expo/" || {
  echo "ERREUR : l'adresse d'API attendue ($API_URL) est absente du bundle" >&2
  exit 1
}

grep -q 'zanzigo-web' "$INDEX" || { echo "ERREUR : retouche CSS non appliquée" >&2; exit 1; }
grep -q 'manifest.webmanifest' "$INDEX" || { echo "ERREUR : balises PWA non appliquées" >&2; exit 1; }
grep -rq "$VERSION" "$RACINE/backend/public/web/_expo/" || {
  echo "ERREUR : l'estampille de version ($VERSION) est absente du bundle" >&2; exit 1;
}
grep -q "$ENTREE" "$INDEX" || {
  echo "ERREUR : version.json annonce $ENTREE, absent de la page" >&2; exit 1;
}
grep -q 'service-worker.js' "$INDEX" || { echo "ERREUR : enregistrement SW non appliqué" >&2; exit 1; }
grep -q 'installation.js' "$INDEX" || { echo "ERREUR : bouton installer non appliqué" >&2; exit 1; }
grep -q 'mise-a-jour.js' "$INDEX" || { echo "ERREUR : mise à jour automatique non appliquée" >&2; exit 1; }
# GARDE-FOU DE L'ICÔNE : c'est le changement d'ADRESSE qui fait qu'un
# téléphone va rechercher le logo. Une seule référence restée sur l'ancien nom
# fixe, et l'icône de l'écran d'accueil resterait celle d'avant.
MANIFESTE="$RACINE/backend/public/web/manifest.webmanifest"
grep -qE '/web/icone-(192|512|maskable-512)\.png' "$MANIFESTE" && {
  echo "ERREUR : le manifeste garde une icône au nom fixe — l'écran d'accueil ne changerait pas" >&2
  exit 1
}
grep -qE 'href="/web/apple-touch-icon\.png"' "$INDEX" && {
  echo "ERREUR : l'icône iOS garde son nom fixe" >&2; exit 1;
}
# Et chaque icône annoncée doit exister : une adresse neuve qui ne mène nulle
# part vaut moins que l'ancienne — le téléphone garderait un carré vide.
for REF in $(grep -oE '/web/[a-z0-9.-]+\.png' "$MANIFESTE" "$INDEX" | cut -d: -f2- | sort -u); do
  [ -f "$RACINE/backend/public${REF}" ] || {
    echo "ERREUR : $REF est annoncé mais absent de backend/public/web" >&2; exit 1;
  }
done
# GARDE-FOU DU SERVICE WORKER : s'il ne change pas d'un octet, le navigateur
# ne le réinstalle pas, et l'ancien cache — donc l'ancienne apparence —
# survit. Son nom de cache doit porter l'estampille de CETTE version.
grep -q "zanzigo-web-$VERSION" "$RACINE/backend/public/web/service-worker.js" || {
  echo "ERREUR : le service worker ne porte pas l'estampille $VERSION" >&2; exit 1;
}

echo "OK — backend/public/web rafraîchi, PWA incluse (API: $API_URL)"
