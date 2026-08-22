#!/usr/bin/env python3
"""
LA RECETTE DE VALIDATION DE LA MARQUE.

Une marque n'est pas une illustration : elle doit tenir dans un carré de
16 × 16 pixels, en noir pur, et y rester UNE SEULE forme. Si elle a besoin
de couleur, de dégradé ou d'un détail pour se lire, ce n'est plus une marque.

    pip install cairosvg pillow scipy
    python3 outils/marque/verifier.py

Deux seuils, et ils ne se négocient pas :
  · UNE composante connexe à 16 px (voisinage à 8) — sinon la marque se
    disloque en confettis dès qu'elle est petite ;
  · 20 % à 30 % de couverture d'encre — en dessous elle disparaît, au-dessus
    elle devient une tache.
"""
import io
import os
import sys

import cairosvg
import numpy as np
from PIL import Image
from scipy import ndimage

FICHIER = os.path.join(os.path.dirname(__file__), 'colobe.svg')
VOISINAGE_8 = np.ones((3, 3), int)


def mesurer(chemin, taille, seuil=140):
    png = cairosvg.svg2png(url=chemin, output_width=taille, output_height=taille,
                           background_color='white')
    encre = np.array(Image.open(io.BytesIO(png)).convert('L')) < seuil
    _, n = ndimage.label(encre, structure=VOISINAGE_8)
    return n, encre.mean() * 100


def main():
    chemin = sys.argv[1] if len(sys.argv) > 1 else FICHIER
    faute = False
    for taille in (16, 24, 32, 48, 128):
        composantes, couverture = mesurer(chemin, taille)
        verdict = ''
        if composantes != 1:
            verdict, faute = f'  ✗ {composantes} composantes au lieu d\'une', True
        elif taille == 16 and not 20 <= couverture <= 30:
            verdict, faute = '  ✗ couverture hors des bornes 20–30 %', True
        print(f'{taille:4d} px : {composantes} composante(s), {couverture:5.1f} % d\'encre{verdict}')
    print('\nMARQUE VALIDE.' if not faute else '\nMARQUE REFUSÉE.')
    return 1 if faute else 0


if __name__ == '__main__':
    sys.exit(main())
