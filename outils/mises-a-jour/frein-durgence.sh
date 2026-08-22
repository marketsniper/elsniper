#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# LE FREIN D'URGENCE.
#
# À lancer quand une mise à jour vient de casser l'application sur les
# téléphones. Il renvoie tout le monde au JavaScript embarqué dans
# l'application installée — c'est-à-dire à l'état du code le jour où l'APK a
# été construite. Ça marche, et ça revient en arrière de plusieurs semaines :
# c'est un frein, pas une correction.
#
# Effet : à la PROCHAINE ouverture de l'application. Pas pendant la session
# en cours.
#
# Après le frein, publier de nouveau remet tout le monde sur la nouvelle
# version — le frein ne se « désarme » pas, il est simplement dépassé.
# ══════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")/../../mobile"

SOCLE="$(node -e "console.log(require('./binaire.json').runtimeVersion)")"
CANAL="${1:-preview}"

echo "Frein d'urgence — canal « $CANAL », socle « $SOCLE »."
echo "Les téléphones repartiront sur le JavaScript de l'application installée."
read -r -p "Confirmer ? (oui/non) " reponse
[ "$reponse" = "oui" ] || { echo "Annulé."; exit 1; }

EXPO_TOKEN="${EXPO_TOKEN:?EXPO_TOKEN manquant}" npx eas-cli@latest update:roll-back-to-embedded \
  --branch "$CANAL" \
  --runtime-version "$SOCLE" \
  --platform all \
  --non-interactive \
  --message "Retour au JavaScript de l'application installée"

echo
echo "Fait. Les téléphones repartiront sur leur version d'origine à la prochaine ouverture."
echo "Corrigez, puis republiez normalement : la nouvelle version reprendra la main."
