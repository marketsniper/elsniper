// ══════════════════════════════════════════════════════════════════════════
// LA COURSE — la scène qui ne s'arrête jamais.
//
// zanziGo est une entreprise de taxi, et jusqu'ici il n'y avait pas une
// seule voiture dans l'application. Celle-ci roule : un chauffeur, deux
// passagers, un madafu — la noix de coco fraîche qu'on boit à la paille au
// bord de la route, et la boisson de l'île.
//
// COMMENT C'EST ANIMÉ, ET POURQUOI COMME ÇA.
// La voiture NE BOUGE PAS : c'est le monde qui défile derrière elle. C'est la
// convention du cinéma, et surtout c'est ce qui coûte le moins cher — trois
// translations au lieu d'un objet qui traverse l'écran et qu'il faudrait
// redessiner. Trois plans, à trois vitesses, et c'est l'écart entre ces
// vitesses qui fabrique la profondeur :
//   · les palmes du fond, lentes (28 s) ;
//   · le bas-côté, intermédiaire (11 s) ;
//   · la chaussée, rapide (2,4 s) — elle passe sous les roues.
// Chaque plan est dessiné DEUX FOIS côte à côte et glissé d'exactement une
// largeur : à la fin de la boucle, l'image est identique au départ. Aucune
// couture visible, et rien à recalculer.
//
// TOUT PASSE PAR LE PILOTE NATIF (`useNativeDriver`). Les translations
// partent sur le fil d'animation du téléphone et ne réveillent pas le
// JavaScript : le défilement de la page reste fluide pendant que la voiture
// roule, même sur un téléphone d'entrée de gamme.
//
// ET ELLE S'ARRÊTE QUAND IL LE FAUT : si le système déclare « réduire les
// animations », la scène est rendue immobile. Ce réglage existe pour les
// personnes que le mouvement rend malades ; on ne le contourne pas.
// ══════════════════════════════════════════════════════════════════════════
import React from 'react';
import { Animated, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { Cocotier, Touffe } from '@/components/marques/Flore';
import { useBoucle, useMouvementAutorise } from '@/lib/mouvement';

import { couleurs, espaces, rayons, stylesReactifs } from '@/lib/theme';

const HAUTEUR = 132;
/** Le repère du dessin de la voiture : 224 × 92, roues posées sur y = 88. */
const VOITURE = { l: 224, h: 100 };

function bruit(graine: number): () => number {
  let etat = graine >>> 0;
  return () => {
    etat = (Math.imul(etat, 1664525) + 1013904223) >>> 0;
    return etat / 4294967296;
  };
}

/** Une bande qui défile : le motif est dessiné deux fois et glissé d'une largeur. */
function Bande({
  largeur,
  secondes,
  active,
  children,
  style,
}: {
  largeur: number;
  secondes: number;
  active: boolean;
  children: React.ReactNode;
  style?: object;
}) {
  const t = useBoucle(secondes, active);
  const x = t.interpolate({ inputRange: [0, 1], outputRange: [0, -largeur] });
  return (
    <Animated.View
      style={[
        { position: 'absolute', flexDirection: 'row', transform: [{ translateX: x }] },
        style,
      ]}
    >
      {children}
      {children}
    </Animated.View>
  );
}

/** LE DÉCOR DU FOND — des cocotiers, en silhouette, loin derrière. */
function Decor({ largeur, graine }: { largeur: number; graine: number }) {
  const teinte = couleurs.encre;
  const arbres = React.useMemo(() => {
    const r = bruit(graine);
    const n = Math.max(3, Math.round(largeur / 190));
    return Array.from({ length: n }, (_, i) => ({
      x: (largeur / n) * (i + 0.15 + r() * 0.7),
      h: 58 + r() * 40,
      penche: (r() * 2 - 1) * 8,
      opacite: 0.09 + r() * 0.07,
    }));
  }, [largeur, graine]);
  return (
    <Svg width={largeur} height={HAUTEUR}>
      {arbres.map((a, i) => (
        <Cocotier
          key={i}
          x={a.x}
          y={HAUTEUR - 22}
          taille={a.h}
          angle={a.penche}
          teinte={teinte}
          opacite={a.opacite}
        />
      ))}
    </Svg>
  );
}

/** LE BAS-CÔTÉ — les herbes du bord de route, plus près, donc plus vites. */
function BasCote({ largeur, graine }: { largeur: number; graine: number }) {
  const teinte = couleurs.encre;
  const touffes = React.useMemo(() => {
    const r = bruit(graine);
    const n = Math.round(largeur / 40);
    return Array.from({ length: n }, (_, i) => ({
      x: (largeur / n) * (i + r() * 0.8),
      h: 10 + r() * 14,
      angle: (r() * 2 - 1) * 12,
      opacite: 0.13 + r() * 0.12,
    }));
  }, [largeur, graine]);
  return (
    <Svg width={largeur} height={HAUTEUR}>
      {touffes.map((t, i) => (
        <Touffe
          key={i}
          x={t.x}
          y={HAUTEUR - 20}
          taille={t.h}
          angle={t.angle}
          teinte={teinte}
          opacite={t.opacite}
        />
      ))}
    </Svg>
  );
}

/**
 * LA CHAUSSÉE — la bande axiale, qui file sous les roues.
 *
 * Elle ne défile pas seule : la ROUTE, elle, est immobile (voir `LaCourse`).
 * Sans surface sous les roues, la voiture flottait au milieu des herbes.
 */
function Chaussee({ largeur }: { largeur: number }) {
  const traits: React.ReactElement[] = [];
  const pas = 48;
  for (let x = 0; x < largeur; x += pas) {
    traits.push(
      <Rect key={x} x={x} y={HAUTEUR - 11} width={26} height={3} rx={1.5} fill={couleurs.sable} opacity={0.75} />
    );
  }
  return (
    <Svg width={largeur} height={HAUTEUR}>
      {traits}
    </Svg>
  );
}

/** LE TAXI — chauffeur, deux passagers, et le madafu. */
function Taxi() {
  const { primaire, blanc, encre, turquoise } = couleurs;
  return (
    <Svg width={VOITURE.l} height={VOITURE.h} viewBox="0 0 224 100">
      {/* La carrosserie, AVEC ses passages de roue : c'est l'arc découpé
          au-dessus de chaque roue qui la détache du corps, sur toutes les
          peaux — sans lui, une carrosserie claire avale une roue claire. */}
      <Path
        d="M 12 82 L 12 63 C 12 58 15 55 20 54 L 44 50 L 58 25 C 61 21 65 19 70 19
           L 142 19 C 149 19 154 21 158 26 L 176 52 L 202 57 C 209 58 212 62 212 68
           L 212 82 L 192 82 A 18 18 0 0 0 156 82 L 74 82 A 18 18 0 0 0 38 82 Z"
        fill={primaire}
      />
      {/* les vitres */}
      <Path d="M 68 26 L 120 26 L 120 51 L 52 51 Z" fill={blanc} />
      <Path d="M 127 26 L 140 26 C 144 26 147 27 149 30 L 163 51 L 127 51 Z" fill={blanc} />
      <G fill={encre}>
        {/* les deux passagers, à l'arrière */}
        <Circle cx={70} cy={38} r={7.6} />
        <Path d="M 59 51 q 11 -11 22 0 Z" />
        <Circle cx={95} cy={38} r={7.4} />
        <Path d="M 84 51 q 11 -11 22 0 Z" />
        {/* le bras levé, depuis l'épaule */}
        <Path d="M 102 46 L 108 37" stroke={encre} strokeWidth={3.6} strokeLinecap="round" />
        {/* le chauffeur */}
        <Circle cx={136} cy={37} r={6.4} />
        <Path d="M 128 51 q 8 -10 17 -1 L 145 51 Z" />
      </G>
      {/* LE MADAFU — noix de coco fraîche et sa paille. La seule tache de
          couleur froide du dessin : c'est ce qui la fait lire comme une
          boisson et non comme une troisième tête. */}
      <Path
        d="M 104 30 q 6.5 -4.5 12 0 q 3.5 5.5 -1 10 q -5.5 4.5 -11 0 q -4.5 -4.5 0 -10 Z"
        fill={turquoise}
      />
      <Path d="M 113 30 L 117 25" stroke={encre} strokeWidth={2.6} strokeLinecap="round" />
      <Circle cx={56} cy={80} r={16.5} fill={encre} />
      <Circle cx={56} cy={80} r={7} fill={blanc} />
      <Circle cx={174} cy={80} r={16.5} fill={encre} />
      <Circle cx={174} cy={80} r={7} fill={blanc} />
    </Svg>
  );
}

export function LaCourse() {
  const { width } = useWindowDimensions();
  const anime = useMouvementAutorise();

  // La bande fait au moins une largeur d'écran, arrondie pour que les motifs
  // ne se coupent pas au raccord.
  const bande = Math.max(360, Math.ceil(width / 40) * 40);

  // LE TANGAGE. La voiture ne roule pas sur du marbre : elle monte et
  // descend de deux pixels, sur un cycle qui ne tombe jamais en phase avec
  // celui de la chaussée — sinon l'œil verrait un métronome.
  const tangage = useBoucle(1.7, anime);
  const y = tangage.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, -2, 0, 1.4, 0],
  });

  return (
    <View style={styles.cadre}>
      {/* LA ROUTE — immobile. C'est le sol : ce sont les bandes peintes
          dessus qui défilent, pas le bitume. */}
      <View style={styles.route} />
      <Bande largeur={bande} secondes={28} active={anime}>
        <Decor largeur={bande} graine={7717} />
      </Bande>
      <Bande largeur={bande} secondes={11} active={anime}>
        <BasCote largeur={bande} graine={4093} />
      </Bande>
      <Bande largeur={bande} secondes={2.4} active={anime}>
        <Chaussee largeur={bande} />
      </Bande>
      <Animated.View style={[styles.voiture, { transform: [{ translateY: y }] }]}>
        <Taxi />
      </Animated.View>
    </View>
  );
}

const styles = stylesReactifs(() => ({
  cadre: {
    height: HAUTEUR,
    marginBottom: espaces.m,
    borderRadius: rayons.carte,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  route: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 26,
    backgroundColor: couleurs.encre,
    opacity: 0.16,
  },
  voiture: {
    alignSelf: 'center',
    // Les roues du dessin descendent jusqu'à y = 96,5 : le repère doit
    // aller jusqu'à 100, sinon elles sont coupées net — c'était le cas.
    // Ensuite on cale la voiture pour qu'elles POSENT sur la chaussée.
    marginBottom: 4,
  },
}));
