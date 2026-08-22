# Unguja en volume — le rendu 3D de l'île

L'image `mobile/assets/images/unguja.png` est un **vrai rendu tridimensionnel**,
calculé ici puis livré en image. L'application n'embarque aucun moteur 3D et ne
calcule rien à l'exécution : elle affiche un fichier de 68 Ko.

C'est un choix mesuré. Un moteur 3D à l'exécution (`three` + `expo-gl`) aurait
ajouté ~90 Ko compressés au paquet web, un module natif — donc un nouveau
binaire à installer pour tous les testeurs — et une classe de plantages
nouvelle sur les téléphones d'entrée de gamme. Le rendu hors ligne donne une
image de meilleure qualité pour zéro coût côté client.

## Ce que l'image contient

| Élément | Origine |
|---|---|
| Trait de côte | geoBoundaries (gbOpen, Tanzanie, ADM1) — les trois régions d'Unguja réunies. Surface obtenue : 1 564 km², l'île en fait 1 666. |
| Lagon et platier | Le trait de côte élargi de 2,4 km puis 5 km. |
| Routes | 235 km : l'axe du nord (B1) vers Nungwi, la B2 vers Chwaka, la descente sur Paje, la route de la côte est, la route de Kizimkazi. Tracées par carrefours réels, densifiées au kilomètre, lissées, et **ramenées à terre** à chaque itération. |
| Villes | Les 19 villes desservies, aux coordonnées exactes de `mobile/src/lib/types.ts`. |
| Matière | Calcaire corallien — l'île EST du corail fossile. |
| Lumière | Un soleil bas venu du nord-ouest, une ambiance ciel/lagon, un appoint froid au sud-est. |

## Refaire le rendu

```bash
cd outils/rendu-ile
pip install shapely pillow
npm install playwright-core      # le navigateur est déjà là : /opt/pw-browsers/chromium

# 1. la géométrie (réseau requis, une seule fois)
python3 preparer.py

# 2. three.js, en local (le CDN n'est pas joignable depuis l'atelier)
curl -sLo three.module.js https://unpkg.com/three@0.180.0/build/three.module.js
curl -sLo three.core.js   https://unpkg.com/three@0.180.0/build/three.core.js

# 3. le rendu
python3 -m http.server 4444 &
node rendre.mjs "w=1600&h=1600&dpr=2&azim=28&elev=34&dist=250&fov=18" brut.png

# 4. recadrage sur l'île, réduction, palette de 128 couleurs
python3 recadrer.py
cp unguja.png ../../mobile/assets/images/unguja.png
```

`scene.html` accepte tous ses réglages en paramètres d'URL : `azim`, `elev`,
`dist`, `fov`, `roll`, `soleil`, `ciel`, `appoint`, `ombre`, `expo`, `route`,
`piquet`, `hpiquet`, `cx`/`cy`/`cz`. Pour essayer un autre cadrage, il suffit
donc de changer la requête — aucun code à toucher.
