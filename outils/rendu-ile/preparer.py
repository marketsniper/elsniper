#!/usr/bin/env python3
"""
Prépare la géométrie de l'île à partir de données publiques.

Produit `unguja-geo.json` : le trait de côte d'Unguja, la ceinture de lagon et
le platier, les 235 km de routes de l'île et les coordonnées des villes
desservies — le tout en KILOMÈTRES réels, origine au centre de l'île.

Source du trait de côte : geoBoundaries (gbOpen, Tanzanie, niveau 1). Les
trois régions d'Unguja — Zanzibar North, Zanzibar South & Central, Zanzibar
Urban/West — sont réunies en un seul polygone. Contrôle : la surface obtenue
vaut 1 564 km² ; l'île en fait 1 666 (l'écart tient à la simplification des
frontières administratives et aux îlots exclus).

Dépendances : shapely. Réseau requis (une seule fois).
    pip install shapely
    python3 preparer.py
"""
import json, math, urllib.request
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union, nearest_points

SOURCE = ('https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/'
          'releaseData/gbOpen/TZA/ADM1/geoBoundaries-TZA-ADM1_simplified.geojson')
REGIONS = {'Zanzibar South & Central', 'Zanzibar North', 'Zanzibar Urban/West'}

# Villes desservies + carrefours réels du réseau routier (latitude, longitude).
LIEUX = {
    'Stone Town': (-6.1620, 39.1910), 'Aéroport': (-6.2210, 39.2230),
    'Fumba': (-6.3148, 39.2848), 'Nungwi': (-5.7272, 39.2992),
    'Kendwa': (-5.7516, 39.2912), 'Matemwe': (-5.8422, 39.3582),
    'Pwani Mchangani': (-5.9242, 39.3561), 'Kiwengwa': (-5.9901, 39.3761),
    'Pongwe': (-6.0484, 39.4052), 'Uroa': (-6.0930, 39.4237),
    'Chwaka': (-6.1652, 39.4351), 'Michamvi': (-6.1445, 39.4955),
    'Dongwe': (-6.1912, 39.5317), 'Bwejuu': (-6.2372, 39.5323),
    'Paje': (-6.2667, 39.5341), 'Jambiani': (-6.3219, 39.5468),
    'Makunduchi': (-6.4127, 39.5534), 'Mtende': (-6.4547, 39.5276),
    'Kizimkazi': (-6.4544, 39.4728),
    # Carrefours : ils portent les routes, ils ne sont pas desservis.
    'Mahonda': (-5.9800, 39.2700), 'Kinyasini': (-5.9000, 39.3050),
    'Dunga': (-6.1550, 39.3250), 'Tunguu': (-6.2050, 39.2900),
    'Bambi': (-6.2900, 39.3350), 'Kitogani': (-6.3250, 39.4150),
    'Muyuni': (-6.4150, 39.4450),
}
VILLES = [n for n in LIEUX if n not in
          {'Mahonda', 'Kinyasini', 'Dunga', 'Tunguu', 'Bambi', 'Kitogani', 'Muyuni'}]

ROUTES = [
    ['Stone Town', 'Mahonda', 'Kinyasini', 'Nungwi'],        # B1, l'axe du nord
    ['Nungwi', 'Kendwa'],
    ['Kinyasini', 'Matemwe'],
    ['Kinyasini', 'Pwani Mchangani', 'Kiwengwa'],
    ['Kiwengwa', 'Pongwe', 'Uroa', 'Chwaka'],                # la côte est
    ['Stone Town', 'Dunga', 'Chwaka'],                       # B2
    ['Stone Town', 'Aéroport', 'Tunguu'],
    ['Tunguu', 'Bambi', 'Kitogani', 'Paje'],
    ['Paje', 'Bwejuu', 'Dongwe', 'Michamvi'],
    ['Paje', 'Jambiani', 'Makunduchi', 'Mtende'],
    ['Kitogani', 'Muyuni', 'Kizimkazi'],
    ['Tunguu', 'Fumba'],
]


def contour_unguja():
    brut = json.loads(urllib.request.urlopen(SOURCE, timeout=120).read())
    parts = []
    for f in brut['features']:
        if f['properties']['shapeName'] not in REGIONS:
            continue
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        parts += [Polygon(p[0]).buffer(0) for p in polys]
    # Le tampon aller-retour soude les frontières internes des trois régions.
    u = unary_union([p.buffer(0.0009) for p in parts]).buffer(-0.0009)
    u = max(u.geoms, key=lambda g: g.area) if u.geom_type == 'MultiPolygon' else u
    return u.simplify(0.0006, preserve_topology=True)


def main():
    ile_deg = contour_unguja()
    xs, ys = ile_deg.exterior.coords.xy
    lon0, lat0 = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    kx, ky = 111.320 * math.cos(math.radians(lat0)), 110.574
    proj = lambda lon, lat: (round((lon - lon0) * kx, 3), round((lat - lat0) * ky, 3))

    ile = Polygon([proj(x, y) for x, y in zip(xs, ys)])
    print(f'île : {ile.area:.0f} km²  ({len(ile.exterior.coords)} points)')

    terre = ile.buffer(-0.8)   # les routes restent à 800 m du trait de côte
    ramener = lambda p: (p if terre.contains(Point(p))
                         else tuple(nearest_points(terre, Point(p))[0].coords[0]))
    brut = {n: proj(c[1], c[0]) for n, c in LIEUX.items()}
    # Les ROUTES sont ramenées vers l'intérieur pour ne jamais courir sur
    # l'eau ; les VILLES, elles, restent à leur position vraie — la plupart
    # sont des villages de bord de mer, les pousser à 800 m dans les terres
    # les déplacerait visiblement.
    pts = {n: ramener(p) for n, p in brut.items()}
    dans_lile = lambda p: (p if ile.contains(Point(p))
                           else tuple(nearest_points(ile.buffer(-0.15), Point(p))[0].coords[0]))
    villes = {n: dans_lile(brut[n]) for n in VILLES}

    def tracer(noms):
        ls = LineString([pts[n] for n in noms])
        n = max(2, int(ls.length / 0.8))
        p = [ramener((q.x, q.y)) for q in
             (ls.interpolate(i / n, normalized=True) for i in range(n + 1))]
        for _ in range(4):                       # lissage, en restant à terre
            p = [p[0]] + [ramener((( p[i-1][0] + 2*p[i][0] + p[i+1][0]) / 4,
                                   ( p[i-1][1] + 2*p[i][1] + p[i+1][1]) / 4))
                          for i in range(1, len(p) - 1)] + [p[-1]]
        return [[round(a, 3), round(b, 3)] for a, b in p]

    routes = [tracer(r) for r in ROUTES]
    print(f'routes : {sum(LineString(r).length for r in routes):.0f} km')

    anneau = lambda p: [[round(x, 3), round(y, 3)]
                        for x, y in zip(*p.exterior.coords.xy)]
    json.dump({
        'ile': anneau(ile),
        'lagon': anneau(ile.buffer(2.4, join_style=1, quad_segs=8).simplify(0.10)),
        'recif': anneau(ile.buffer(5.0, join_style=1, quad_segs=8).simplify(0.14)),
        'routes': routes,
        'villes': {n: [round(villes[n][0], 3), round(villes[n][1], 3)] for n in VILLES},
    }, open('unguja-geo.json', 'w'))
    print(f'unguja-geo.json écrit — {len(VILLES)} villes desservies')


if __name__ == '__main__':
    main()
