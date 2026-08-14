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
sed -i 's|  <link rel="icon" href="/web/favicon.ico" /></head>|    <style id="zanzigo-web">\n      body {\n        background: #33222b;\n      }\n      @media (min-width: 720px) {\n        #root {\n          max-width: 640px;\n          width: 100%;\n          margin: 0 auto;\n          box-shadow: 0 0 48px rgba(0, 0, 0, 0.45);\n          position: relative;\n          overflow: hidden;\n        }\n      }\n    </style>\n  <link rel="icon" href="/web/favicon.ico" /></head>|' "$INDEX"

# ===== PWA : fichiers (manifest, service worker, icônes) + balises =====
cp "$RACINE/backend/pwa/"* "$RACINE/backend/public/web/"

# Balises PWA dans <head> : manifest, couleur de thème, icône iOS, plein écran iOS.
sed -i 's|  <link rel="icon" href="/web/favicon.ico" /></head>|  <link rel="icon" href="/web/favicon.ico" />\n    <link rel="manifest" href="/web/manifest.webmanifest" />\n    <meta name="theme-color" content="#E4572E" />\n    <link rel="apple-touch-icon" href="/web/apple-touch-icon.png" />\n    <meta name="apple-mobile-web-app-capable" content="yes" />\n    <meta name="apple-mobile-web-app-status-bar-style" content="default" />\n    <meta name="apple-mobile-web-app-title" content="zanziGo" />\n  </head>|' "$INDEX"

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
echo "OK — backend/public/web rafraîchi, PWA incluse (API: $API_URL)"
