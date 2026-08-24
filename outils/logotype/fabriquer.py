"""L'ICÔNE zanziGo : le monogramme « zG », dans la police de l'application.

Le logotype est le nom entier — mais sept lettres ne rentrent pas dans un rond
de 48 px. Uber n'y met pas « Uber », Bolt n'y met pas « Bolt ». On garde les
deux lettres qui portent le nom, et les deux couleurs : le « z » de zanzi en
blanc, le « G » de Go en vert.

Contrastes MESURÉS, pas supposés :
  fond  #073B57  bleu océan profond (le bleu du drapeau, la mer autour d'Unguja)
  z     #FFFFFF  11,85:1
  G     #2ECC71   5,64:1  (le vert du drapeau, la végétation)

Le navigateur ne sert qu'à DESSINER les lettres, sur fond transparent : sa
fenêtre headless est plus courte que demandé (87 lignes blanches en bas du
premier jet), et un aplat qu'il produit n'est pas fiable. Les fonds et les
cadrages sont composés ici, au pixel.
"""
import pathlib, subprocess
from PIL import Image

import base64

BASE = pathlib.Path(__file__).parent
RACINE = BASE.parent.parent
CHROME = '/opt/pw-browsers/chromium'
FOND, BLANC, VERT = (7, 59, 87), '#FFFFFF', '#2ECC71'
# La police du logotype est celle de l'application, prise dans le dépôt :
# le logo et les textes viennent de la même main.
POLICE = RACINE / 'mobile/assets/fonts/Archivo-Bold.ttf'
b64 = base64.b64encode(POLICE.read_bytes()).decode()

def lettres(texte_html, cote=1600):
    """Dessine les glyphes en transparent, puis les recadre sur leur encre."""
    f = BASE / '_rendu.html'
    f.write_text(f"""<!doctype html><meta charset="utf-8"><style>
@font-face{{font-family:'Archivo';src:url(data:font/ttf;base64,{b64}) format('truetype');font-weight:700;}}
*{{margin:0}}
body{{width:{cote}px;height:{cote}px;display:flex;align-items:center;justify-content:center}}
span{{font-family:Archivo;font-weight:700;font-size:520px;letter-spacing:-0.055em;line-height:1}}
</style><span>{texte_html}</span>""")
    subprocess.run([CHROME, '--headless', '--no-sandbox', '--force-device-scale-factor=1',
                    '--default-background-color=00000000', '--virtual-time-budget=3000',
                    f'--screenshot={BASE}/_rendu.png', f'--window-size={cote},{cote}',
                    '--hide-scrollbars', f'file://{f}'], check=True, capture_output=True)
    im = Image.open(BASE / '_rendu.png').convert('RGBA')
    return im.crop(im.getchannel('A').getbbox())

ZG = lettres(f'<span style="color:{BLANC}">z</span><span style="color:{VERT}">G</span>')
ZG_MONO = lettres(f'<span style="color:{BLANC}">z</span><span style="color:{BLANC}">G</span>')
Z_SEUL = lettres(f'<span style="color:{BLANC}">z</span>')
print('encre zG', ZG.size, ' · z seul', Z_SEUL.size)

def composer(glyphes, cote, part, fond):
    """Le monogramme, occupant `part` de la largeur, centré sur `fond`."""
    fond_im = Image.new('RGBA', (cote, cote), (*FOND, 255) if fond else (0, 0, 0, 0))
    if part > 0:
        large = int(cote * part)
        haut = max(1, round(glyphes.height * large / glyphes.width))
        # Si la hauteur dépasse la part visée, c'est elle qui commande.
        if haut > large:
            haut, large = large, max(1, round(glyphes.width * large / glyphes.height))
        g = glyphes.resize((large, haut), Image.LANCZOS)
        fond_im.alpha_composite(g, ((cote - large) // 2, (cote - haut) // 2))
    return fond_im

R = str(RACINE)
#  chemin                                                    côté  part  fond  glyphes
SORTIES = [
    (f'{R}/mobile/assets/images/icon.png',                   1024, 0.66, True,  ZG),
    # Le favicon vit à 16 et 32 px : deux lettres y deviennent une bouillie.
    # On garde le « z », comme un logo se réduit à son initiale.
    (f'{R}/mobile/assets/images/favicon.png',                   96, 0.42, True,  Z_SEUL),
    (f'{R}/mobile/assets/images/splash-icon.png',               512, 0.72, False, ZG),
    (f'{R}/mobile/assets/images/android-icon-background.png',  1024, 0.00, True,  ZG),
    (f'{R}/mobile/assets/images/android-icon-foreground.png',  1024, 0.52, False, ZG),
    (f'{R}/mobile/assets/images/android-icon-monochrome.png',  1024, 0.52, False, ZG_MONO),
    (f'{R}/backend/pwa/icone-192.png',                          192, 0.66, True,  ZG),
    (f'{R}/backend/pwa/icone-512.png',                          512, 0.66, True,  ZG),
    (f'{R}/backend/pwa/icone-maskable-512.png',                 512, 0.66, True,  ZG),
    (f'{R}/backend/pwa/apple-touch-icon.png',                   180, 0.66, True,  ZG),
]

for chemin, cote, part, fond, glyphes in SORTIES:
    im = composer(glyphes, cote, part, fond)
    if fond:
        plat = Image.new('RGB', im.size, FOND)
        plat.paste(im, (0, 0), im)
        im = plat
    im.save(chemin)
    print('écrit', chemin.split('/')[-1], im.size)
