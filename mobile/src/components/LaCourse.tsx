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
import { Animated, Easing, Pressable, View, useWindowDimensions } from 'react-native';
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
    // Les traits sont la MÊME encre que la bande (peinte à 0,16 dessous),
    // trois fois plus dense : l'écart d'opacité garantit le contraste sur
    // TOUTES les peaux. Peints en `sable`, ils disparaissaient sur les peaux
    // claires — blanc cassé sur gris très clair, la route devenait une bande
    // unie sous la voiture.
    traits.push(
      <Rect key={x} x={x} y={HAUTEUR - 11} width={26} height={3} rx={1.5} fill={couleurs.encre} opacity={0.55} />
    );
  }
  return (
    <Svg width={largeur} height={HAUTEUR}>
      {traits}
    </Svg>
  );
}

/**
 * LES TROIS VÉHICULES DE L'ÎLE.
 *
 * Chaque écran montre celui qui lui correspond — c'est ce qui dit au client
 * OÙ il vient d'arriver, avant même qu'il lise le titre :
 *   · le TAXI sur la réservation et chez le chauffeur ;
 *   · le DALA-DALA, le camion-bus à banquettes, sur les trajets partagés ;
 *   · le PIKIPIKI, la moto qui porte les colis, sur les colis.
 *
 * TOUS SUIVENT LA MÊME RÈGLE DE COULEUR, et elle a été vérifiée sur les
 * quatre peaux, pas sur une :
 *   · la carrosserie prend `primaire` — toujours contrastée avec le fond ;
 *   · les vitres et le colis prennent `blanc` — toujours contrasté avec la
 *     carrosserie ;
 *   · les gens prennent `encre` — toujours contrasté avec les vitres.
 * Et les roues sont posées dans des PASSAGES DÉCOUPÉS : sans eux, une roue
 * claire disparaît dans une carrosserie claire sur la peau Lagon.
 */
export type NomVehicule = 'taxi' | 'dala' | 'pikipiki';

/** LE TAXI — un chauffeur, deux passagers, et le madafu. */
function Taxi() {
  const { primaire, blanc, encre, turquoise } = couleurs;
  return (
    <Svg width={VOITURE.l} height={VOITURE.h} viewBox="0 0 224 100">
      <Path
        d="M 12 82 L 12 63 C 12 58 15 55 20 54 L 44 50 L 58 25 C 61 21 65 19 70 19
           L 142 19 C 149 19 154 21 158 26 L 176 52 L 202 57 C 209 58 212 62 212 68
           L 212 82 L 192 82 A 18 18 0 0 0 156 82 L 74 82 A 18 18 0 0 0 38 82 Z"
        fill={primaire}
      />
      <Path d="M 68 26 L 120 26 L 120 51 L 52 51 Z" fill={blanc} />
      <Path d="M 127 26 L 140 26 C 144 26 147 27 149 30 L 163 51 L 127 51 Z" fill={blanc} />
      <G fill={encre}>
        <Circle cx={70} cy={38} r={7.6} />
        <Path d="M 59 51 q 11 -11 22 0 Z" />
        <Circle cx={95} cy={38} r={7.4} />
        <Path d="M 84 51 q 11 -11 22 0 Z" />
        <Path d="M 102 46 L 108 37" stroke={encre} strokeWidth={3.6} strokeLinecap="round" />
        <Circle cx={136} cy={37} r={6.4} />
        <Path d="M 128 51 q 8 -10 17 -1 L 145 51 Z" />
      </G>
      {/* LE MADAFU — la noix de coco fraîche, à la paille. La seule tache de
          couleur froide : sans elle, elle se lisait comme une 3ᵉ tête. */}
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

/** LE DALA-DALA — quatre passagers sur la banquette, le chauffeur en cabine. */
function Dala() {
  const { primaire, blanc, encre } = couleurs;
  return (
    <Svg width={VOITURE.l} height={VOITURE.h} viewBox="0 0 224 100">
      {/* la caisse bâchée, puis la cabine */}
      <Path d="M 16 84 L 16 32 q 0 -8 8 -8 L 128 24 q 8 0 8 8 L 136 84 Z" fill={primaire} />
      <Path
        d="M 136 84 L 136 42 q 0 -6 6 -6 L 176 36 q 5 0 8 5 L 198 62 q 4 4 4 9 L 202 84 Z"
        fill={primaire}
      />
      {/* l'ouverture latérale : c'est par là qu'on voit les gens */}
      <Rect x={26} y={36} width={98} height={30} rx={3} fill={blanc} />
      <Path d="M 146 44 L 172 42 q 4 0 6 4 L 190 62 L 146 62 Z" fill={blanc} />
      <G fill={encre}>
        {[44, 66, 88, 110].map((x) => (
          <G key={x}>
            <Circle cx={x} cy={47} r={6.4} />
            <Path d={`M ${x - 9} 66 q 9 -12 19 0 Z`} />
          </G>
        ))}
        <Circle cx={160} cy={52} r={6} />
        <Path d="M 152 66 q 8 -11 17 -1 L 169 66 Z" />
      </G>
      <Circle cx={56} cy={80} r={16} fill={encre} />
      <Circle cx={56} cy={80} r={6.6} fill={blanc} />
      <Circle cx={170} cy={80} r={16} fill={encre} />
      <Circle cx={170} cy={80} r={6.6} fill={blanc} />
    </Svg>
  );
}

/** LE PIKIPIKI — la moto, et le colis sanglé sur le porte-bagages. */
function Pikipiki() {
  const { primaire, blanc, encre } = couleurs;
  return (
    <Svg width={VOITURE.l} height={VOITURE.h} viewBox="0 0 224 100">
      {/* roues, fourche, guidon */}
      <Circle cx={62} cy={78} r={17} fill="none" stroke={encre} strokeWidth={5.5} />
      <Circle cx={62} cy={78} r={4} fill={encre} />
      <Circle cx={176} cy={78} r={17} fill="none" stroke={encre} strokeWidth={5.5} />
      <Circle cx={176} cy={78} r={4} fill={encre} />
      <Path d="M 176 78 L 152 46" stroke={encre} strokeWidth={5} strokeLinecap="round" />
      <Path d="M 152 46 L 150 36" stroke={encre} strokeWidth={4.5} strokeLinecap="round" />
      <Path d="M 140 38 L 160 40" stroke={encre} strokeWidth={4.5} strokeLinecap="round" />
      {/* cadre, selle, réservoir */}
      <Path
        d="M 62 78 L 96 58 L 152 48"
        stroke={primaire}
        strokeWidth={7}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M 96 58 L 116 74" stroke={primaire} strokeWidth={6} fill="none" strokeLinecap="round" />
      <Path d="M 78 56 q 20 -8 34 -1 l -3 7 q -16 -4 -31 1 Z" fill={primaire} />
      <Path d="M 116 50 q 16 -6 28 0 q -4 8 -14 8 q -11 0 -14 -8 Z" fill={primaire} />
      {/* LE COLIS, sanglé — plus petit que le premier essai, qui rendait la
          moto instable à l'œil, et posé plus bas sur le porte-bagages. */}
      <Rect x={34} y={40} width={44} height={28} rx={4} fill={blanc} stroke={encre} strokeWidth={3} />
      <Path d="M 56 40 L 56 68" stroke={encre} strokeWidth={3} />
      <Path d="M 34 54 L 78 54" stroke={encre} strokeWidth={3} />
      {/* le conducteur, penché sur le guidon */}
      <G fill={encre}>
        <Circle cx={112} cy={24} r={9.5} />
        <Path d="M 96 56 q 2 -22 16 -22 q 13 0 12 13 l -3 9 Z" />
        <Path d="M 122 38 Q 136 34, 148 40" stroke={encre} strokeWidth={5} fill="none" strokeLinecap="round" />
        <Path
          d="M 102 56 L 100 72 L 114 75"
          stroke={encre}
          strokeWidth={5.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>
    </Svg>
  );
}

const VEHICULES: Record<NomVehicule, () => React.ReactElement> = {
  taxi: Taxi,
  dala: Dala,
  pikipiki: Pikipiki,
};

export function LaCourse({
  vehicule = 'taxi',
  compacte = false,
}: {
  vehicule?: NomVehicule;
  /** La forme d'onglet : plus basse, pour ne pas voler la place au contenu. */
  compacte?: boolean;
} = {}) {
  const { width } = useWindowDimensions();
  const anime = useMouvementAutorise();
  const Vehicule = VEHICULES[vehicule];
  const echelle = compacte ? 0.74 : 1;

  const bande = Math.max(360, Math.ceil(width / 40) * 40);

  // LE TANGAGE. Le véhicule ne roule pas sur du marbre : il monte et descend
  // de deux pixels, sur un cycle qui ne tombe jamais en phase avec celui de
  // la chaussée — sinon l'œil verrait un métronome.
  const tangage = useBoucle(1.7, anime);
  const roulis = tangage.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, -2, 0, 1.4, 0],
  });

  // LE BOND — la seule chose qui répond au doigt. On touche la scène, le
  // véhicule saute. Rien d'autre : une animation qu'on peut déclencher en
  // rafale doit être bornée, sinon elle devient un jouet qui mange la
  // batterie. Le ressort revient tout seul à zéro.
  const bond = React.useRef(new Animated.Value(0)).current;
  const sauter = React.useCallback(() => {
    if (!anime) return;
    bond.setValue(0);
    Animated.sequence([
      Animated.timing(bond, { toValue: 1, duration: 190, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(bond, { toValue: 0, friction: 4, tension: 90, useNativeDriver: true }),
    ]).start();
  }, [bond, anime]);
  const hauteurBond = bond.interpolate({ inputRange: [0, 1], outputRange: [0, -16] });

  return (
    <Pressable
      onPress={sauter}
      accessibilityRole="image"
      accessibilityLabel={t3(vehicule)}
      style={styles.cadre}
    >
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
      <Animated.View
        style={[
          styles.voiture,
          { transform: [{ translateY: Animated.add(roulis, hauteurBond) }, { scale: echelle }] },
        ]}
      >
        <Vehicule />
      </Animated.View>
    </Pressable>
  );
}

/** Le nom du véhicule, pour les lecteurs d'écran. */
function t3(v: NomVehicule): string {
  return v === 'dala' ? 'Dala-dala' : v === 'pikipiki' ? 'Pikipiki' : 'Taxi';
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
    // Les roues du dessin descendent jusqu'à y = 96,5 : le repère va donc
    // jusqu'à 100, sinon elles sont coupées net — c'était le cas.
    // Ensuite on cale le véhicule pour qu'elles POSENT sur la chaussée.
    marginBottom: 4,
  },
}));
