# Le logotype zanziGo, et l'icône qui en dérive

**Le nom EST le logo** — comme Uber, Bolt, Lyft. Il n'y a plus de
pictogramme : le logotype est écrit PAR l'application, dans sa propre police
(Archivo Bold) et dans les couleurs de la peau du moment. Il n'y a donc aucun
fichier à regénérer quand on change de thème, et le mot ne peut pas se
retrouver invisible sur un fond qu'on n'avait pas prévu.

Les couleurs vivent dans `mobile/src/lib/theme.ts`, deux par peau :
`marqueNom` et `marqueGo`. « Go » est vert, et c'est voulu : go, c'est vert.

| peau | « zanzi » | « Go » | contraste mesuré |
|---|---|---|---|
| **Girofle (noir)** | `#FFFFFF` | `#2ECC71` — le vert DE L'ICÔNE | 19,1 / 9,07 |
| Bento (crème) | `#0A4E7A` bleu océan | `#0E7343` vert profond | 8,12 / 5,45 |
| Estran (clair) | `#0A4E7A` | `#0E7343` | 7,48 / 5,02 |
| Nuit (noir) | `#FFFFFF` | `#12A150` vert franc | 19,4 / 5,75 |
| Lagon (dégradé) | `#FFFFFF` | `#A8FAD5` menthe | 3,62 / 2,98 |

« Girofle » est le cas particulier dans l'autre sens : c'est la seule peau qui
reprend EXACTEMENT les trois couleurs du fichier d'icône — le presque-noir,
le `#2ECC71`, le blanc. Le logotype n'y est donc pas adapté à un fond, il
est chez lui. C'est la peau par défaut depuis le 25/08/2026.

Le Lagon est le cas particulier : c'est un DÉGRADÉ, pas un aplat. Derrière le
logotype, le fond réellement peint est un turquoise moyen (`#2A949B`, mesuré
au pixel), pas le lagon profond de la palette. Sur ce turquoise, même le blanc
plafonne à 3,62:1 — aucun vert ne fera mieux. On y prend donc la menthe la
plus claire qui reste verte.

## L'icône

Sept lettres ne rentrent pas dans un rond de 48 px : Uber n'y met pas
« Uber », Bolt n'y met pas « Bolt ». On garde les deux lettres qui portent le
nom, `zG`, blanc et vert sur le bleu océan `#073B57` (11,85:1 et 5,64:1).
Le favicon, lui, vit à 16 et 32 px : deux lettres y deviennent une bouillie,
il garde le `z` seul.

`zG` est plus large que haut (612 × 370). Ce qu'un masque rond recoupe, ce
n'est pas la boîte mais la DIAGONALE : la largeur utile se déduit de
`61,1 % / 1,17 ≈ 52 %` pour Android, `80 % / 1,17 ≈ 68 %` pour le maskable.
Vérifié au rasteriseur : 0,00 % d'encre perdue.

## Rejouer

```bash
python3 outils/logotype/fabriquer.py
```

Écrit les dix fichiers (icône iOS, favicon, écran de démarrage, les trois
couches adaptatives Android, et les quatre icônes de la PWA). Le navigateur
ne sert qu'à DESSINER les lettres sur fond transparent : sa fenêtre headless
est plus courte que demandé — le premier jet laissait 87 lignes blanches en
bas du fond adaptatif. Les aplats et les cadrages sont composés au pixel.
