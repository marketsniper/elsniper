// LA CARTE DU TRAJET — version WEB (la PWA, celle que les clients ouvrent).
//
// « Comme sur Uber » (demande du client, 31/08/2026) : une vraie carte sur
// laquelle on OPÈRE, pas une illustration. Depuis le 03/09/2026, elle s'ouvre
// À LA DEMANDE : fermée, l'écran ne montre qu'un chip discret (slogan +
// « Voir la carte ») — « la carte prenait trop de place ». Ouverte, c'est un
// FOND DE SCÈNE d'au moins la moitié de l'écran, pleine largeur, calibré pour
// que Départ et Arrivée restent visibles dessous ; le contenu glisse
// par-dessus comme une feuille, le slogan et l'aide flottent sur la carte,
// une croix la referme. Le fond par défaut est la VUE SATELLITE (imagerie
// Esri World Imagery — libre d'accès, sans clé) : l'île, ses lagons et ses
// toits, pas un plan gris ; un bouton bascule vers le plan OpenStreetMap
// pour qui préfère lire des noms de routes. Leaflet reste chargé depuis son
// CDN au premier montage : pas de dépendance npm, pas de reconstruction
// native, et l'app installée n'embarque pas un octet de plus.
//
// CE QU'ON PEUT Y FAIRE. Chaque ville desservie est une pastille touchable :
// le premier toucher pose le DÉPART, le second l'ARRIVÉE, le trajet se trace,
// et les menus déroulants en dessous suivent — c'est le même état, la grille
// tarifaire s'applique pareil. Un toucher ailleurs sur la carte s'aimante à
// la ville la plus proche : la grille ne connaît que des villes, un point au
// milieu d'un champ n'aurait pas de prix. Le bouton en bas à droite relance
// le parcours « Ma position » (GPS → ville la plus proche) de l'écran.
//
// Si Leaflet ne se charge pas (hors ligne, CDN bloqué), on retombe sur le
// bandeau de l'île — l'écran reste entier, la carte est un plus, pas un dû.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { IleDeZanzibar } from '@/components/Ile';
import type { ProprietesCarteTrajet } from '@/components/CarteTrajet';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, ombres, policeMontant, rayons, stylesReactifs } from '@/lib/theme';
import { coordonneesVille, itineraireRoutier, kmEntrePoints } from '@/lib/types';

export type { ProprietesCarteTrajet };

// Leaflet vient d'un CDN : pas de paquet npm, donc pas de types. On manipule
// ses objets en « inconnu assumé » — la surface utilisée tient en dix appels.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Leaflet = any;

const ADRESSE_LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist';
// Deux fonds au choix. Le satellite (par défaut) vient du service de tuiles
// public d'Esri — accès libre avec attribution, pas de clé ; le plan reste
// OpenStreetMap. Les deux calques sont créés une fois, la bascule les échange.
const TUILES_PLAN = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION_PLAN =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const TUILES_SATELLITE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ATTRIBUTION_SATELLITE = '&copy; <a href="https://www.esri.com/">Esri</a> — Maxar, Earthstar Geographics';
/** Au-delà, un toucher sur la carte ne s'aimante plus : on est en mer. */
const AIMANT_MAX_KM = 30;
/** Ce que la feuille de contenu recouvre en bas de la carte (le « deuxième
 *  plan » : les cartes suivantes glissent SUR la carte). Le défilement de
 *  l'écran garde son gap (espaces.m) — le chevauchement visible est donc
 *  DEBORD_BAS − espaces.m. */
const DEBORD_BAS = espaces.xl + espaces.m;
/** Les boutons posés sur la carte remontent au-dessus du chevauchement ET
 *  de la ligne d'attribution (relevée elle aussi, ~18 px de haut). */
const BOUTONS_BAS = DEBORD_BAS + espaces.xl;

let chargement: Promise<Leaflet> | null = null;

/** Charge leaflet.js + leaflet.css une seule fois pour toute l'application. */
function chargerLeaflet(): Promise<Leaflet> {
  if (chargement) return chargement;
  chargement = new Promise((resoudre, rejeter) => {
    const global = window as unknown as { L?: Leaflet };
    if (global.L) {
      resoudre(global.L);
      return;
    }
    const feuille = document.createElement('link');
    feuille.rel = 'stylesheet';
    feuille.href = `${ADRESSE_LEAFLET}/leaflet.css`;
    document.head.appendChild(feuille);
    // La feuille de contenu recouvre le bas de la carte : l'attribution
    // (obligatoire — OSM comme Esri) remonte au-dessus du chevauchement.
    // Règle SCOPÉE à cette carte : les autres cartes Leaflet de l'app
    // gardent leur attribution au bord.
    const reglages = document.createElement('style');
    reglages.textContent =
      `.carte-fond-reserver .leaflet-bottom .leaflet-control { margin-bottom: ${DEBORD_BAS + 4}px; }` +
      // Le zoom descend sous la croix « fermer » (toutes deux en haut à droite).
      '.carte-fond-reserver .leaflet-top.leaflet-right { top: 52px; }';
    document.head.appendChild(reglages);
    const script = document.createElement('script');
    script.src = `${ADRESSE_LEAFLET}/leaflet.js`;
    script.onload = () => (global.L ? resoudre(global.L) : rejeter(new Error('leaflet absent')));
    script.onerror = () => rejeter(new Error('leaflet injoignable'));
    document.head.appendChild(script);
  });
  return chargement;
}

export function CarteTrajet({
  depart,
  arrivee,
  lieux,
  arriveesPermises,
  pointExact,
  onDepart,
  onArrivee,
  onMaPosition,
  chargePosition = false,
}: ProprietesCarteTrajet) {
  const { t } = useT();
  const divRef = React.useRef<HTMLDivElement | null>(null);
  // Tout ce que Leaflet possède, dans UNE référence : la carte, le calque des
  // villes, le calque de la sélection. Rien de tout ça ne doit re-rendre React.
  const carteRef = React.useRef<{
    L: Leaflet;
    carte: any;
    villes: any;
    selection: any;
    fonds: { plan: any; satellite: any };
    cadree: boolean;
  } | null>(null);
  const [prete, setPrete] = React.useState(false);
  const [indisponible, setIndisponible] = React.useState(false);
  // Le fond du moment : satellite d'abord (demande du client, 01/09/2026).
  const [fondSatellite, setFondSatellite] = React.useState(true);
  // La carte s'ouvre À LA DEMANDE (fermée par défaut, demande du 03/09/2026) :
  // « la carte prend trop de place » — chacun l'appelle quand il en a besoin.
  const [ouverte, setOuverte] = React.useState(false);
  // Ouverte : « au moins la moitié de l'écran », mais pas plus — il faut
  // encore voir Départ et Arrivée dessous. Bornée du petit téléphone au
  // grand écran.
  const { height: hauteurFenetre } = useWindowDimensions();
  const hauteurCarte = Math.min(Math.max(Math.round(hauteurFenetre * 0.52), 320), 620);

  // LE CHOIX, décidé au moment du toucher — via une référence, parce que les
  // gestionnaires Leaflet sont posés une fois et liraient sinon des états morts.
  const choisirRef = React.useRef<(ville: string) => void>(() => {});
  choisirRef.current = (ville: string) => {
    if (!depart || (depart && arrivee)) {
      // Rien de posé, ou trajet complet : ce toucher repart d'un nouveau départ.
      if (arrivee) onArrivee('');
      onDepart(ville);
    } else if (ville === depart) {
      // Re-toucher son départ ne fait rien — pas de quoi surprendre.
    } else if (arriveesPermises.includes(ville)) {
      onArrivee(ville);
    } else {
      // Arrivée interdite (les trois points de Stone Town entre eux) : on la
      // prend comme nouveau départ plutôt que d'ignorer le geste.
      onDepart(ville);
    }
  };
  const lieuxRef = React.useRef(lieux);
  lieuxRef.current = lieux;

  // ── LA CARTE, MONTÉE À L'OUVERTURE ───────────────────────────────────────
  // Fermée, Leaflet n'existe pas (rien à télécharger, rien en mémoire).
  // Chaque ouverture repart d'une carte neuve ; la fermeture détruit tout.
  React.useEffect(() => {
    if (!ouverte) return;
    let vivant = true;
    chargerLeaflet()
      .then((L) => {
        if (!vivant || !divRef.current || carteRef.current) return;
        const carte = L.map(divRef.current, {
          // La molette reste à la page : une carte qui capture le défilement
          // au survol rend tout l'écran pénible. Les boutons +/− suffisent.
          scrollWheelZoom: false,
          // Le zoom passe à droite : le slogan flotte en haut à gauche.
          zoomControl: false,
        });
        L.control.zoom({ position: 'topright' }).addTo(carte);
        carte.getContainer().classList.add('carte-fond-reserver');
        const fonds = {
          plan: L.tileLayer(TUILES_PLAN, { maxZoom: 17, attribution: ATTRIBUTION_PLAN }),
          satellite: L.tileLayer(TUILES_SATELLITE, {
            maxZoom: 17,
            attribution: ATTRIBUTION_SATELLITE,
          }),
        };
        fonds.satellite.addTo(carte);
        carte.on('click', (evenement: any) => {
          const { lat, lng } = evenement.latlng;
          let proche: string | null = null;
          let distance = Infinity;
          for (const lieu of lieuxRef.current) {
            const coord = coordonneesVille(lieu);
            if (!coord) continue;
            const km = kmEntrePoints(lat, lng, coord[0], coord[1]);
            if (km < distance) {
              distance = km;
              proche = lieu;
            }
          }
          if (proche && distance <= AIMANT_MAX_KM) choisirRef.current(proche);
        });
        carteRef.current = {
          L,
          carte,
          villes: L.layerGroup().addTo(carte),
          selection: L.layerGroup().addTo(carte),
          fonds,
          cadree: false,
        };
        setPrete(true);
      })
      .catch(() => {
        if (vivant) setIndisponible(true);
      });
    return () => {
      vivant = false;
      carteRef.current?.carte.remove();
      carteRef.current = null;
      setPrete(false);
    };
  }, [ouverte]);

  // ── LE FOND : SATELLITE ⇄ PLAN ───────────────────────────────────────────
  React.useEffect(() => {
    const poignee = carteRef.current;
    if (!prete || !poignee) return;
    const { carte, fonds } = poignee;
    const entrant = fondSatellite ? fonds.satellite : fonds.plan;
    const sortant = fondSatellite ? fonds.plan : fonds.satellite;
    if (carte.hasLayer(sortant)) carte.removeLayer(sortant);
    if (!carte.hasLayer(entrant)) entrant.addTo(carte);
  }, [prete, fondSatellite]);

  // La hauteur suit la fenêtre (rotation, clavier, redimensionnement) :
  // Leaflet doit remesurer son cadre, sinon tuiles et touchers se décalent.
  React.useEffect(() => {
    carteRef.current?.carte.invalidateSize();
  }, [prete, hauteurCarte]);

  // ── LES VILLES, UNE PASTILLE CHACUNE ─────────────────────────────────────
  React.useEffect(() => {
    const poignee = carteRef.current;
    if (!prete || !poignee) return;
    const { L, carte, villes } = poignee;
    villes.clearLayers();
    const bornes: [number, number][] = [];
    for (const lieu of lieux) {
      const coord = coordonneesVille(lieu);
      if (!coord) continue;
      bornes.push(coord);
      L.circleMarker(coord, {
        radius: 7,
        color: '#FFFFFF',
        weight: 2,
        fillColor: couleurs.primaireFonce,
        fillOpacity: 1,
      })
        .bindTooltip(lieu)
        .on('click', () => choisirRef.current(lieu))
        .addTo(villes);
    }
    // Le premier cadrage : toute l'île, une seule fois — pas à chaque fois
    // que la liste des lieux se rafraîchit depuis le serveur.
    if (!poignee.cadree && bornes.length > 0) {
      carte.fitBounds(L.latLngBounds(bornes).pad(0.08));
      poignee.cadree = true;
    }
  }, [prete, lieux]);

  // ── LE TRAJET CHOISI : DEUX ÉPINGLES ET UN TRAIT ─────────────────────────
  React.useEffect(() => {
    const poignee = carteRef.current;
    if (!prete || !poignee) return;
    const { L, carte, selection } = poignee;
    selection.clearLayers();
    const coordDepart = depart ? coordonneesVille(depart) : null;
    const coordArrivee = arrivee ? coordonneesVille(arrivee) : null;
    if (coordDepart) {
      L.circleMarker(coordDepart, {
        radius: 10,
        color: '#FFFFFF',
        weight: 3,
        fillColor: couleurs.primaire,
        fillOpacity: 1,
      })
        .bindTooltip(`${t('commun_depart')} · ${depart}`, { permanent: true, direction: 'top' })
        .addTo(selection);
    }
    if (coordArrivee) {
      L.circleMarker(coordArrivee, {
        radius: 10,
        color: '#FFFFFF',
        weight: 3,
        fillColor: couleurs.turquoise,
        fillOpacity: 1,
      })
        .bindTooltip(`${t('commun_arrivee')} · ${arrivee}`, { permanent: true, direction: 'top' })
        .addTo(selection);
    }
    if (coordDepart && coordArrivee) {
      // Le trait suit les VILLES-ÉTAPES du chemin routier (le même graphe qui
      // fixe le prix au kilomètre) : Stone Town → Michamvi passe par Paje et
      // Bwejuu, pas par-dessus la baie de Chwaka. Il reste TIRETÉ : c'est une
      // approximation par étapes, pas l'itinéraire GPS mètre par mètre — un
      // trait plein promettrait plus qu'on ne sait.
      const etapes = itineraireRoutier(depart, arrivee);
      const points: [number, number][] =
        etapes && etapes.length >= 2
          ? etapes.map((p) => [p.lat, p.lng] as [number, number])
          : [coordDepart, coordArrivee];
      L.polyline(points, {
        color: couleurs.primaire,
        weight: 3,
        dashArray: '7 7',
      }).addTo(selection);
      carte.fitBounds(L.latLngBounds(points), {
        padding: [46, 46],
        maxZoom: 12,
      });
    }
    // « Ma position » : le point EXACT du client, distinct de la ville aimantée.
    if (pointExact) {
      L.circleMarker([pointExact.lat, pointExact.lng], {
        radius: 6,
        color: '#FFFFFF',
        weight: 2,
        fillColor: couleurs.turquoise,
        fillOpacity: 1,
      }).addTo(selection);
    }
  }, [prete, depart, arrivee, pointExact, t]);

  // CDN injoignable : on rend ce que rend l'app installée — le bandeau de
  // l'île. L'écran reste entier, les menus déroulants font le travail.
  if (indisponible) return <IleDeZanzibar />;

  // FERMÉE (l'état de départ) : un chip discret — le slogan reste, et un
  // bouton appelle la carte pour qui la veut. Le reste de l'écran respire.
  if (!ouverte) {
    return (
      <View style={styles.carteFermee}>
        <Text style={styles.titre}>{t('accueil_slogan')}</Text>
        <Pressable
          onPress={() => setOuverte(true)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.boutonOuvrir, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="map-outline" size={20} color={couleurs.primaireFonce} />
          <Text style={styles.texteOuvrir}>{t('carte_ouvrir')}</Text>
          <Ionicons name="chevron-down" size={18} color={couleurs.primaireFonce} />
        </Pressable>
      </View>
    );
  }

  // L'aide suit le geste : elle dit toujours LE prochain toucher utile.
  const aide = !depart
    ? t('carte_aide_depart')
    : !arrivee
      ? t('carte_aide_arrivee')
      : t('carte_aide_recommencer');

  return (
    <View style={styles.carte}>
      <View style={[styles.cadre, { height: hauteurCarte }]}>
        {React.createElement('div', {
          ref: (noeud: HTMLDivElement | null) => {
            divRef.current = noeud;
          },
          style: { width: '100%', height: '100%' },
        })}
        {!prete && (
          <View style={styles.voileChargement} pointerEvents="none">
            <ActivityIndicator size="small" color={couleurs.primaire} />
          </View>
        )}
        {/* LE SLOGAN FLOTTE SUR LA CARTE : la carte est le décor, l'interface
            se pose dessus. Le chip reste touchable (il BLOQUE le toucher) :
            un tap dessus ne doit pas choisir la ville cachée dessous. */}
        <View style={styles.enteteFlottante}>
          <Text style={styles.titre}>{t('accueil_slogan')}</Text>
          <Text style={styles.aide}>{aide}</Text>
        </View>
        {/* La croix qui referme la carte, en haut à droite (le zoom Leaflet
            est décalé dessous par la règle CSS scopée). */}
        <Pressable
          onPress={() => setOuverte(false)}
          accessibilityRole="button"
          accessibilityLabel={t('carte_fermer')}
          style={({ pressed }) => [styles.boutonFermer, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="close" size={22} color={couleurs.primaireFonce} />
        </Pressable>
        {/* La bascule satellite ⇄ plan, en bas à gauche. */}
        <Pressable
          onPress={() => setFondSatellite((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={fondSatellite ? t('carte_fond_plan') : t('carte_fond_satellite')}
          style={({ pressed }) => [styles.boutonFond, pressed && { opacity: 0.7 }]}
        >
          <Ionicons
            name={fondSatellite ? 'map-outline' : 'earth-outline'}
            size={20}
            color={couleurs.primaireFonce}
          />
        </Pressable>
        {!!onMaPosition && (
          <Pressable
            onPress={onMaPosition}
            accessibilityRole="button"
            accessibilityLabel={t('position_option')}
            style={({ pressed }) => [styles.boutonPosition, pressed && { opacity: 0.7 }]}
          >
            {chargePosition ? (
              <ActivityIndicator size="small" color={couleurs.primaireFonce} />
            ) : (
              <Ionicons name="locate" size={20} color={couleurs.primaireFonce} />
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = stylesReactifs(() => ({
  // FERMÉE : une carte ordinaire de l'écran — slogan + bouton d'ouverture.
  carteFermee: {
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.carte,
    padding: espaces.l,
    gap: espaces.m,
    ...ombres.carte,
  },
  boutonOuvrir: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    alignSelf: 'flex-start',
    backgroundColor: couleurs.primaireClair,
    borderRadius: rayons.bouton,
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.s + 2,
  },
  texteOuvrir: {
    fontSize: 14.5,
    fontWeight: '700',
    color: couleurs.primaireFonce,
  },
  // OUVERTE : la carte n'est plus un bloc parmi les autres — le FOND DE SCÈNE.
  // Les marges négatives annulent le padding de l'écran (pleine largeur,
  // collée en haut) et laissent la feuille de contenu recouvrir son bas.
  carte: {
    marginTop: -espaces.l,
    marginHorizontal: -espaces.l,
    marginBottom: -DEBORD_BAS,
    overflow: 'hidden',
  },
  // Le chip du slogan, posé sur la carte. Le retrait à droite laisse la
  // place aux boutons de zoom de Leaflet (en haut à droite).
  enteteFlottante: {
    position: 'absolute',
    top: espaces.m,
    left: espaces.m,
    right: 60,
    zIndex: 1100,
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.carte,
    paddingHorizontal: espaces.l,
    paddingVertical: espaces.s + 2,
    gap: 3,
    ...ombres.carte,
  },
  titre: {
    fontFamily: policeMontant(),
    fontSize: 19,
    lineHeight: 24,
    color: couleurs.encre,
  },
  aide: {
    fontSize: 12.5,
    lineHeight: 17,
    color: couleurs.texteSecondaire,
  },
  cadre: {
    // La hauteur (~62 % de la fenêtre) est posée à l'affichage.
    backgroundColor: couleurs.primaireClair,
  },
  voileChargement: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Le bouton « ma position », posé SUR la carte comme sur toutes les
  // applications de cartes — en bas à droite, au-dessus de la feuille de
  // contenu qui recouvre le bas de la carte.
  boutonPosition: {
    position: 'absolute',
    right: espaces.m,
    bottom: BOUTONS_BAS,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: couleurs.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
    ...ombres.carte,
  },
  // La croix « fermer », en haut à droite — même rond que les autres.
  boutonFermer: {
    position: 'absolute',
    top: espaces.m,
    right: espaces.m,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: couleurs.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
    ...ombres.carte,
  },
  // La bascule satellite ⇄ plan — même rond, en bas à gauche.
  boutonFond: {
    position: 'absolute',
    left: espaces.m,
    bottom: BOUTONS_BAS,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: couleurs.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
    ...ombres.carte,
  },
}));
