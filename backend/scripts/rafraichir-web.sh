#!/usr/bin/env bash
# Reconstruit la version web (hôtels sur ordinateur) et la copie dans
# backend/public/web, en réappliquant les retouches d'index.html que
# l'export Expo écrase (titre français + colonne centrée sur grand écran).
# Usage : depuis la racine du dépôt,  bash backend/scripts/rafraichir-web.sh
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
API_URL="${EXPO_PUBLIC_API_URL:-https://zanzigo-api.onrender.com/api}"

cd "$RACINE/mobile"
EXPO_PUBLIC_API_URL="$API_URL" npx expo export --platform web --output-dir dist-web

rm -rf "$RACINE/backend/public/web"
cp -r dist-web "$RACINE/backend/public/web"

INDEX="$RACINE/backend/public/web/index.html"

# Titre + langue de la page.
sed -i 's|<html lang="en">|<html lang="fr">|' "$INDEX"
sed -i 's|<title>zanziGo</title>|<title>zanziGo — Taxi \&amp; colis à Zanzibar</title>|' "$INDEX"

# Colonne centrée façon téléphone sur grand écran (réception d'hôtel).
sed -i 's|  <link rel="icon" href="/web/favicon.ico" /></head>|    <style id="zanzigo-web">\n      body {\n        background: #33222b;\n      }\n      @media (min-width: 720px) {\n        #root {\n          max-width: 640px;\n          width: 100%;\n          margin: 0 auto;\n          box-shadow: 0 0 48px rgba(0, 0, 0, 0.45);\n          position: relative;\n          overflow: hidden;\n        }\n      }\n    </style>\n  <link rel="icon" href="/web/favicon.ico" /></head>|' "$INDEX"

grep -q 'zanzigo-web' "$INDEX" || { echo "ERREUR : retouche index.html non appliquée" >&2; exit 1; }
echo "OK — backend/public/web rafraîchi (API: $API_URL)"
