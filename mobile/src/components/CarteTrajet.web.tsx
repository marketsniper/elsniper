// LA CARTE DU TRAJET — version WEB (la PWA, celle que les clients ouvrent).
//
// « Comme sur Uber » (demande du client, 31/08/2026) : une vraie carte sur
// laquelle on OPÈRE, pas une illustration. Le fond est OpenStreetMap — libre,
// sans clé ni compte, lisible à Zanzibar — servi par Leaflet, chargé depuis
// son CDN au premier montage : pas de dépendance npm, pas de reconstruction
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
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { IleDeZanzibar } from '@/components/Ile';
import type { ProprietesCarteTrajet } from '@/components/CarteTrajet';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, ombres, policeMontant, rayons, stylesReactifs } from '@/lib/theme';
import { coordonneesVille, kmEntrePoints } from '@/lib/types';

export type { ProprietesCarteTrajet };

// Leaflet vient d'un CDN : pas de paquet npm, donc pas de types. On manipule
// ses objets en « inconnu assumé » — la surface utilisée tient en dix appels.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Leaflet = any;

const ADRESSE_LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist';
const TUILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
/** Au-delà, un toucher sur la carte ne s'aimante plus : on est en mer. */
const AIMANT_MAX_KM = 30;
const HAUTEUR_CARTE = 230;

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
    cadree: boolean;
  } | null>(null);
  const [prete, setPrete] = React.useState(false);
  const [indisponible, setIndisponible] = React.useState(false);

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

  // ── LA CARTE, MONTÉE UNE FOIS ────────────────────────────────────────────
  React.useEffect(() => {
    let vivant = true;
    chargerLeaflet()
      .then((L) => {
        if (!vivant || !divRef.current || carteRef.current) return;
        const carte = L.map(divRef.current, {
          // La molette reste à la page : une carte qui capture le défilement
          // au survol rend tout l'écran pénible. Les boutons +/− suffisent.
          scrollWheelZoom: false,
          zoomControl: true,
        });
        L.tileLayer(TUILES, { maxZoom: 17, attribution: ATTRIBUTION }).addTo(carte);
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
    };
  }, []);

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
      // Un trait TIRETÉ : c'est un raccourci à vol d'oiseau, pas la route —
      // un trait plein promettrait un itinéraire qu'on ne connaît pas.
      L.polyline([coordDepart, coordArrivee], {
        color: couleurs.primaire,
        weight: 3,
        dashArray: '7 7',
      }).addTo(selection);
      carte.fitBounds(L.latLngBounds([coordDepart, coordArrivee]), {
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

  // L'aide suit le geste : elle dit toujours LE prochain toucher utile.
  const aide = !depart
    ? t('carte_aide_depart')
    : !arrivee
      ? t('carte_aide_arrivee')
      : t('carte_aide_recommencer');

  return (
    <View style={styles.carte}>
      {/* LE SLOGAN COIFFE LA CARTE : sur le web elle remplace le bandeau de
          l'île, et le slogan ne doit disparaître sur aucune plateforme. */}
      <View style={styles.entete}>
        <Text style={styles.titre}>{t('accueil_slogan')}</Text>
        <Text style={styles.aide}>{aide}</Text>
      </View>
      <View style={styles.cadre}>
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
  // La carte est un BLOC de l'écran, au même relief que les autres cartes.
  // overflow hidden : les tuiles doivent épouser les angles arrondis.
  carte: {
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.carte,
    overflow: 'hidden',
    marginBottom: espaces.s,
    ...ombres.carte,
  },
  entete: {
    paddingHorizontal: espaces.l,
    paddingTop: espaces.m,
    paddingBottom: espaces.s,
    gap: 3,
  },
  titre: {
    fontFamily: policeMontant(),
    fontSize: 20,
    lineHeight: 25,
    color: couleurs.encre,
  },
  aide: {
    fontSize: 12.5,
    lineHeight: 17,
    color: couleurs.texteSecondaire,
  },
  cadre: {
    height: HAUTEUR_CARTE,
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
  // applications de cartes — en bas à droite, à portée de pouce.
  boutonPosition: {
    position: 'absolute',
    right: espaces.m,
    bottom: espaces.m,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: couleurs.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...ombres.carte,
  },
}));
