#!/usr/bin/env python3
"""Recadre le rendu sur l'ÎLE (pas sur son ombre) et l'allège."""
from PIL import Image
import numpy as np, os

im = Image.open('brut.png').convert('RGBA')
a = np.array(im)
ys, xs = np.where(a[:, :, 3] > 128)          # l'objet ; l'ombre est transparente
objet = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
tout = im.getchannel('A').getbbox()          # objet + ombre portée

# Cadre CENTRÉ SUR L'OBJET : sinon l'ombre, qui ne tombe que d'un côté,
# décale l'île dans l'écran.
cx, cy = (objet[0] + objet[2]) / 2, (objet[1] + objet[3]) / 2
dl = max(cx - tout[0], tout[2] - cx) + 8
dh = max(cy - tout[1], tout[3] - cy) + 8
c = im.crop((round(cx - dl), round(cy - dh), round(cx + dl), round(cy + dh)))

c = c.resize((980, round(980 * c.height / c.width)), Image.LANCZOS)
# 128 couleurs : le rendu est fait de facettes plates, la palette ne se voit
# pas — et le fichier passe de 380 Ko à 68 Ko.
c.quantize(colors=128, method=Image.FASTOCTREE).save('unguja.png', optimize=True)
print('unguja.png', c.size, round(os.path.getsize('unguja.png') / 1024), 'Ko')
