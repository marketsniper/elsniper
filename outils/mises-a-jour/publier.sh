#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# PUBLIER UNE MISE À JOUR À DISTANCE.
#
#   bash outils/mises-a-jour/publier.sh "ce que change cette version"
#
# Une mise à jour à distance ne pousse QUE du JavaScript : écrans, textes,
# couleurs, prix, images. Jamais de code natif. Le test
# backend/test/imports-natifs.test.js le vérifie avant chaque publication —
# c'est lui qui empêche d'envoyer aux téléphones du code qu'ils ne savent pas
# exécuter.
#
# PUBLIER LE MÊME CODE POUR DEUX GÉNÉRATIONS D'APPLICATIONS :
#
#   bash outils/mises-a-jour/publier.sh "…" --aussi exposdk:54.0.0
#
# Le jour où l'on change de socle (voir LISEZMOI.md), les applications déjà
# installées gardent l'ancien et n'ont plus rien. Cette option republie le
# même JavaScript sous l'ancien socle, pour qu'elles continuent d'être
# servies. Il n'existe pas de drapeau --runtime-version sur « eas update » :
# la seule voie est de modifier app.json entre deux publications, ce que le
# script fait puis défait.
# ══════════════════════════════════════════════════════════════════════════
set -euo pipefail
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$RACINE"

MESSAGE="${1:?Il faut un message : bash publier.sh \"ce que ça change\"}"
AUSSI=""
[ "${2:-}" = "--aussi" ] && AUSSI="${3:?--aussi attend un socle, ex. exposdk:54.0.0}"

echo "── Vérification : le code n'utilise que ce que l'application sait faire"
(cd backend && NODE_ENV=test node --test test/imports-natifs.test.js >/dev/null) \
  || { echo "REFUSÉ : du code natif absent des téléphones s'est glissé dans la mise à jour."; exit 1; }

cd mobile
SOCLE="$(node node_modules/expo-updates/bin/cli.js runtimeversion:resolve --platform android | node -e "
  let e='';process.stdin.on('data',d=>e+=d).on('end',()=>console.log(JSON.parse(e).runtimeVersion))")"
echo "── Socle courant : $SOCLE"

publier() {
  EXPO_PUBLIC_API_URL=https://zanzigo-api.onrender.com/api \
  EXPO_PUBLIC_VERSION="$(date -u +%Y-%m-%d.%H%M)-$(git rev-parse --short=7 HEAD)" \
  npx eas-cli@latest update --branch preview --environment preview \
    --non-interactive --message "$1"
}

echo "── Publication sur le socle $SOCLE"
publier "$MESSAGE"

if [ -n "$AUSSI" ]; then
  echo "── Republication du MÊME code sur le socle $AUSSI"
  cp app.json app.json.avant-double
  node -e "
    const fs=require('fs'); const c=JSON.parse(fs.readFileSync('app.json','utf8'));
    c.expo.runtimeVersion='$AUSSI';
    fs.writeFileSync('app.json', JSON.stringify(c,null,2)+'\n');"
  # Le socle est relu ici même : eas-cli interroge le projet au moment du
  # publish, il ne garde aucune valeur en mémoire.
  publier "$MESSAGE (socle $AUSSI)" || true
  mv app.json.avant-double app.json
  echo "── app.json restauré"
fi

echo
echo "Publié. Les téléphones prendront la mise à jour à leur prochaine ouverture."
