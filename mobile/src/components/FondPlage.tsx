// Le fond d'écran de zanziGo.
//
// Il a longtemps porté une photo de plage sous un voile de lisibilité. Les
// directions retenues depuis travaillent sans photo : un aplat (Bento, Nuit
// d'épices), un dégradé de lagon sous des panneaux translucides, un relevé
// bathymétrique, ou — pour « Girofle », la direction en service — un blanc
// d'écume que deux halos très faibles viennent orienter.
//
// Le dégradé est dessiné en SVG : trois halos radiaux posés sur le bleu
// profond, exactement comme sur la planche. React Native n'a pas de dégradé
// natif, et react-native-svg est déjà là — inutile d'ajouter une dépendance
// qui obligerait à reconstruire l'application.
//
// Le composant garde son nom et ses props : trente écrans les passent.
import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { couleurs, stylesReactifs, usePeau } from '@/lib/theme';

export type NomFond = 'coucherSoleil' | 'palmiers' | 'lagon' | 'vagues';

// Les trois halos du lagon : teinte, centre, rayon. Coordonnées en FRACTIONS
// de la boîte, pas en pourcentages : react-native-svg ne rend rien quand le
// rayon d'un dégradé radial est écrit « 78% ».
const HALOS = [
  { teinte: '#37C4C9', cx: 0.14, cy: 0.02, r: 0.85, opacite: 0.95 }, // turquoise
  { teinte: '#E4572E', cx: 0.94, cy: 0.24, r: 0.8, opacite: 0.92 }, // corail
  { teinte: '#7B4BC4', cx: 0.5, cy: 1.02, r: 0.85, opacite: 0.95 }, // violet
];

export function LagonDeVerre({ fond }: { fond?: string } = {}) {
  // Les identifiants SVG sont globaux au document sur le web : deux écrans
  // montés en même temps se voleraient leurs dégradés sans ce préfixe.
  const cle = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  // `fond` sert aux APERÇUS : montrer le lagon pendant que Bento est la peau
  // active demande d'imposer le bleu profond, que le miroir ne donne plus.
  const bleu = fond ?? couleurs.sable;
  return (
    <View style={styles.lagon} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          {HALOS.map((halo, i) => (
            <RadialGradient key={i} id={`${cle}-${i}`} cx={halo.cx} cy={halo.cy} r={halo.r}>
              <Stop offset="0" stopColor={halo.teinte} stopOpacity={halo.opacite} />
              <Stop offset="0.62" stopColor={halo.teinte} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={bleu} />
        {HALOS.map((_, i) => (
          <Rect key={i} x="0" y="0" width="100%" height="100%" fill={`url(#${cle}-${i})`} />
        ))}
      </Svg>
    </View>
  );
}

// ───────────────────────────── L'ESTRAN ────────────────────────────────────
//
// UN RELEVÉ BATHYMÉTRIQUE, DESSINÉ, PAS PHOTOGRAPHIÉ.
//
// Deux fois par jour la mer recule de plusieurs centaines de mètres et
// découvre les courbes de niveau de l'île. Le fond de l'application est ce
// relevé : cinq bandes séparées par des laisses de mer, de l'estran clair en
// haut au tombant du récif en bas.
//
// Les courbes sont ENGENDRÉES, pas tracées à la main : déplacement du point
// milieu, six itérations, rugosité H ≈ 0,62 — soit une dimension fractale
// D ≈ 1,38. C'est la bande pour laquelle une préférence humaine est
// documentée (Taylor et coll.) ; la littérature reste nuancée et pleine de
// différences individuelles, on ne lui fait pas dire plus que ça. Ce qu'on
// sait à coup sûr, en revanche, c'est qu'une courbe fractale ne ressemble
// PAS à une sinusoïde — et c'est ce qui distingue un rivage d'un motif
// fabriqué à la chaîne.
//
// Les graines sont EN DUR : aucun tirage au rendu. Deux téléphones du même
// couple doivent afficher exactement le même dessin, sinon l'application a
// l'air cassée.

const GRAINES = [7, 23, 41, 59, 83];

/** Générateur congruentiel linéaire — reproductible, sans dépendance. */
function bruit(graine: number): () => number {
  let etat = graine >>> 0;
  return () => {
    etat = (Math.imul(etat, 1664525) + 1013904223) >>> 0;
    return etat / 4294967296;
  };
}

/**
 * Une laisse de mer : 2^n + 1 hauteurs normalisées, par déplacement du point
 * milieu. À chaque itération on insère un point au milieu de chaque segment
 * et on le décale d'un bruit dont l'amplitude décroît en 2^(-H).
 */
function laisse(graine: number, iterations = 6, H = 0.62): number[] {
  const r = bruit(graine);
  let points = [0, 0];
  let amplitude = 1;
  for (let i = 0; i < iterations; i += 1) {
    const suivant: number[] = [];
    for (let k = 0; k < points.length - 1; k += 1) {
      suivant.push(points[k], (points[k] + points[k + 1]) / 2 + (r() * 2 - 1) * amplitude);
    }
    suivant.push(points[points.length - 1]);
    points = suivant;
    amplitude *= Math.pow(2, -H);
  }
  return points;
}

/**
 * Les cinq tons du relevé, du plus découvert au plus profond.
 *
 * La gamme est VOLONTAIREMENT resserrée. Au premier essai elle allait
 * jusqu'au jade soutenu : le bas de l'écran devenait un bloc qui se battait
 * avec les cartes, et les laisses de mer se lisaient comme du papier déchiré.
 * Un fond doit se laisser regarder sans qu'on le regarde. On garde la
 * bathymétrie — l'eau se fonce vers le bas — mais dans un souffle.
 */
const STRATES = ['#E2EAE6', '#D9E3DF', '#CEDAD6', '#C2D0CD', '#B3C5C3'];
// L'amplitude décroît avec la profondeur : le platier près du récif est
// tourmenté, le fond du chenal est lisse. C'est de la bathymétrie vraie.
const AMPLITUDES = [30, 22, 15, 10, 7];

/**
 * Le chemin fermé d'une bande : la laisse de mer en haut, puis on descend
 * jusqu'en bas de l'écran. Les bandes sont peintes l'une SUR l'autre — pas
 * de transparence, donc pas de couleur imprévisible sous le texte.
 */
function cheminBande(hauteurs: number[], y: number, amplitude: number, l: number, h: number) {
  const pas = l / (hauteurs.length - 1);
  let d = `M 0 ${(y + hauteurs[0] * amplitude).toFixed(1)}`;
  for (let i = 1; i < hauteurs.length; i += 1) {
    d += ` L ${(i * pas).toFixed(1)} ${(y + hauteurs[i] * amplitude).toFixed(1)}`;
  }
  return `${d} L ${l.toFixed(1)} ${h.toFixed(1)} L 0 ${h.toFixed(1)} Z`;
}

export function EstranDeZanzibar({ fond }: { fond?: string } = {}) {
  const cle = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const { width, height } = useWindowDimensions();
  // Une seule et même géométrie tant que la largeur ne change pas : ce calcul
  // ne doit pas repartir à chaque image.
  const bandes = React.useMemo(() => {
    const l = Math.max(1, width);
    const h = Math.max(1, height);
    // Le relevé commence sous l'en-tête et court jusqu'en bas.
    // Le relevé démarre sous la première carte, pas sous l'en-tête : une
    // laisse de mer qui coupe la carte d'ouverture en deux la fait paraître
    // déchirée.
    const depart = h * 0.46;
    const pas = (h - depart) / STRATES.length;
    return GRAINES.map((graine, k) => ({
      d: cheminBande(laisse(graine), depart + k * pas, AMPLITUDES[k], l, h),
      teinte: STRATES[k],
    }));
  }, [width, height]);

  return (
    <View style={styles.lagon} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          {/* Le ciel de l'estran : à peine un souffle plus clair en haut. Deux
              pour cent de variation — assez pour que la page ne soit pas un
              aplat mort, trop peu pour qu'on le remarque. */}
          <LinearGradient id={`${cle}-ciel`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#F3F8F5" stopOpacity="1" />
            <Stop offset="1" stopColor={fond ?? couleurs.sable} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${cle}-ciel)`} />
        {bandes.map((bande, i) => (
          <React.Fragment key={i}>
            <Path d={bande.d} fill={bande.teinte} />
            {/* La laisse elle-même : le trait d'écume que laisse la marée en
                se retirant. C'est lui qui fait « relevé » plutôt que « vague ». */}
            <Path
              d={bande.d}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={1}
              strokeOpacity={0.3}
            />
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
}

// ─────────────────────────────── L'ÉCUME ───────────────────────────────────
//
// LE FOND DE LA PEAU DE L'APPLICATION (clé 'girofle', direction « Écume »).
//
// Un aplat blanc suffirait à être lisible, mais il n'a pas de haut ni de
// bas : l'écran devient une feuille, et les cartes flottent dans le vide.
// Deux halos très faibles lui donnent une direction — le vert de la marque
// qui entre par en haut, une menthe d'eau peu profonde qui s'accumule en bas.
//
// DEUX VERTS, PAS UN VERT ET UN BLEU — même règle qu'aux directions
// précédentes : une couleur de plus qui ne sert à rien est une couleur en
// trop. Et c'est la demande du client à la lettre : du blanc, un peu de vert.
//
// Les opacités sont BASSES à dessein. Un halo qu'on remarque est un halo
// raté : celui-ci ne doit se voir que quand on retire la carte qui était
// posée dessus.
const HALOS_GIROFLE = [
  { teinte: '#2ECC71', cx: 0.2, cy: 0.0, r: 0.85, opacite: 0.12 }, // le vert zanziGo
  { teinte: '#9FD8BC', cx: 0.88, cy: 1.02, r: 0.8, opacite: 0.42 }, // la menthe des hauts-fonds
];

export function EcumeDeZanzibar({ fond }: { fond?: string } = {}) {
  // Comme pour le lagon : les identifiants SVG sont globaux au document sur
  // le web, deux écrans montés ensemble se voleraient leurs dégradés.
  const cle = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const blanc = fond ?? couleurs.sable;
  return (
    <View style={styles.lagon} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          {HALOS_GIROFLE.map((halo, i) => (
            <RadialGradient key={i} id={`${cle}-${i}`} cx={halo.cx} cy={halo.cy} r={halo.r}>
              <Stop offset="0" stopColor={halo.teinte} stopOpacity={halo.opacite} />
              <Stop offset="0.7" stopColor={halo.teinte} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={blanc} />
        {HALOS_GIROFLE.map((_, i) => (
          <Rect key={i} x="0" y="0" width="100%" height="100%" fill={`url(#${cle}-${i})`} />
        ))}
      </Svg>
    </View>
  );
}

export function FondPlage({
  children,
}: {
  /** Conservé pour la compatibilité : sans effet depuis le passage sans photo. */
  fond?: NomFond;
  /** Conservé pour la compatibilité : le fond est le même sur tous les écrans. */
  voile?: 'clair' | 'sombre';
  children: React.ReactNode;
}) {
  const peau = usePeau();
  // Chaque écran est OPAQUE et porte son propre lagon. C'est ce qui empêche
  // les onglets inactifs de transparaître : sur le web, ils restent affichés
  // derrière l'actif — seul un écran plein les recouvre. L'en-tête, lui,
  // FLOTTE par-dessus (headerTransparent) : le dégradé démarre à y=0 sous le
  // titre, aucune couture.
  return (
    <View style={styles.fond}>
      {peau === 'verre' && <LagonDeVerre />}
      {peau === 'estran' && <EstranDeZanzibar />}
      {peau === 'girofle' && <EcumeDeZanzibar />}
      {children}
    </View>
  );
}

const styles = stylesReactifs(() => ({
  fond: {
    flex: 1,
    backgroundColor: couleurs.sable,
  },
  lagon: {
    ...StyleSheet.absoluteFillObject,
  },
}));
