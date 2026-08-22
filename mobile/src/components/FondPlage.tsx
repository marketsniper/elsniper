// Le fond d'écran de zanziGo.
//
// Il a longtemps porté une photo de plage sous un voile de lisibilité. Les
// directions retenues depuis travaillent sans photo : un aplat (Bento, Nuit
// d'épices) ou — pour « Lagon de verre », la direction en service — un
// dégradé de lagon sur lequel les panneaux translucides viennent flotter.
//
// Le dégradé est dessiné en SVG : trois halos radiaux posés sur le bleu
// profond, exactement comme sur la planche. React Native n'a pas de dégradé
// natif, et react-native-svg est déjà là — inutile d'ajouter une dépendance
// qui obligerait à reconstruire l'application.
//
// Le composant garde son nom et ses props : trente écrans les passent.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

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
