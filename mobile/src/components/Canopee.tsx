// ══════════════════════════════════════════════════════════════════════════
// LA CANOPÉE — la lisière végétale de l'écran d'accueil.
//
// LE PROBLÈME QU'ELLE RÉSOUT. Sur un téléphone, l'accueil est plein. Sur un
// écran large, le même contenu devient un ruban étroit posé au milieu d'un
// grand vide : la colonne de lecture est plafonnée — et elle doit l'être,
// une ligne de texte de 900 px ne se lit pas — mais rien n'occupe les marges.
// La canopée les habite.
//
// CE QU'ELLE DESSINE, ET POURQUOI CES TROIS-LÀ.
//  · LE GIROFLE. Zanzibar est l'île aux épices : le clou de girofle figure
//    sur les armes de l'archipel et a fait sa fortune. C'est le motif
//    végétal qui appartient à cette île et à aucune autre.
//  · LA PALME. Le cocotier borde chaque route de l'île. La fronde arque
//    depuis le bord de l'écran vers l'intérieur : c'est elle qui donne la
//    profondeur, parce qu'elle vient de HORS du cadre.
//  · LE PIQUET À MWANI. Les bâtons plantés dans le platier pour tenir les
//    cordes à algues, et le motif le plus reconnaissable de la côte est.
//    C'est déjà la grammaire des étapes d'une course, dans la frise de
//    statut : le fond et l'interface parlent la même langue.
//  · ET UN SEUL COLOBE, perché. Un seul : répété, il deviendrait un papier
//    peint à mascotte, exactement ce que la marque s'interdit.
//
// COMMENT ELLE ÉVITE DE RESSEMBLER À UN FOND D'ÉCRAN. Les positions, les
// tailles et les inclinaisons sortent d'un générateur pseudo-aléatoire à
// graine fixe — le même que les laisses de mer de l'estran. Rien n'est aligné,
// rien ne se répète à intervalle régulier, et le dessin est le même à chaque
// ouverture : ni grille, ni hasard qui bouge sous les yeux du client.
//
// COMMENT ELLE ÉVITE DE GÊNER. Elle ne pousse QUE dans les marges, et la
// largeur des marges suit celle de la fenêtre : sur un téléphone elle
// affleure les bords, sur un écran large elle occupe tout ce que la colonne
// de lecture laisse. Opacité de 7 à 11 % : on ne la regarde pas, on la sent.
// ══════════════════════════════════════════════════════════════════════════
import React from 'react';
import { Animated, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg from 'react-native-svg';

import { ColobeLointain, Girofle, Palme, Piquets, type Motif } from '@/components/marques/Flore';

import { useBoucle, useMouvementAutorise } from '@/lib/mouvement';
import { couleurs } from '@/lib/theme';

/** La largeur maximale de la colonne de lecture — au-delà, c'est la marge. */
const COLONNE = 560;

function bruit(graine: number): () => number {
  let etat = graine >>> 0;
  return () => {
    etat = (Math.imul(etat, 1664525) + 1013904223) >>> 0;
    return etat / 4294967296;
  };
}

type Espece = 'palme' | 'girofle' | 'piquets' | 'colobe';

export function Canopee() {
  const { width, height } = useWindowDimensions();
  const anime = useMouvementAutorise();
  const teinte = couleurs.encre;

  const semis = React.useMemo(() => {
    const hauteur = Math.max(height, 900);
    // La marge : ce que la colonne de lecture laisse de chaque côté. Sur un
    // téléphone elle est nulle — la canopée se replie alors sur les angles.
    const marge = Math.max(0, (width - COLONNE) / 2);
    const large = marge > 110;
    const r = bruit(20260822);
    const dessins: { espece: Espece; motif: Motif }[] = [];
    const poser = (espece: Espece, motif: Motif) => dessins.push({ espece, motif });
    const entre = (a: number, b: number) => a + r() * (b - a);

    // ── 1. LA CANOPÉE DES ANGLES. De grandes palmes qui pendent depuis le
    //    haut de l'écran vers l'intérieur. C'est la couche qui donne la
    //    profondeur : elles viennent de HORS du cadre, donc il y a un dehors.
    for (const gauche of [true, false]) {
      const combien = large ? 5 : 3;
      for (let i = 0; i < combien; i += 1) {
        const L = entre(width * 0.26, width * 0.46) * (large ? 1 : 0.78);
        poser('palme', {
          // Le point d'attache sort du cadre : la palme est coupée par le bord.
          x: gauche ? entre(-width * 0.06, width * 0.1) : width - entre(-width * 0.06, width * 0.1),
          y: entre(-hauteur * 0.03, hauteur * 0.16),
          taille: L,
          // Elle part vers le bas-intérieur : 40° à 95° depuis l'horizontale.
          angle: gauche ? entre(38, 96) : 180 - entre(38, 96),
          teinte,
          opacite: entre(0.07, 0.13),
        });
      }
    }

    // ── 2. LA LISIÈRE DES MARGES. Rameaux de giroflier et petites palmes,
    //    seulement là où le contenu ne passe pas.
    if (marge > 60) {
      const combien = Math.min(22, Math.round((marge * hauteur) / 26000));
      for (let i = 0; i < combien; i += 1) {
        const gauche = r() < 0.5;
        const dedans = entre(-marge * 0.18, marge * 0.92);
        const x = gauche ? dedans : width - dedans;
        const y = entre(hauteur * 0.16, hauteur * 0.98);
        if (r() < 0.62) {
          poser('girofle', {
            x,
            y,
            taille: entre(46, 104),
            angle: entre(-18, 18),
            teinte,
            opacite: entre(0.08, 0.14),
          });
        } else {
          const L = entre(90, 190);
          poser('palme', {
            x,
            y,
            taille: L,
            angle: gauche ? entre(-40, 30) : 180 - entre(-40, 30),
            teinte,
            opacite: entre(0.06, 0.11),
          });
        }
      }
    } else {
      // Téléphone : trois rameaux qui affleurent les bords, pas davantage.
      for (let i = 0; i < 3; i += 1) {
        const gauche = r() < 0.5;
        poser('girofle', {
          x: gauche ? entre(-14, 26) : width - entre(-14, 26),
          y: entre(hauteur * 0.3, hauteur * 0.92),
          taille: entre(58, 96),
          angle: entre(-16, 16),
          teinte,
          opacite: entre(0.07, 0.11),
        });
      }
    }

    // ── 3. L'HORIZON DE PIQUETS. Une rangée basse, sur toute la largeur :
    //    la ligne où le platier commence. C'est ce qui assied la page.
    const rangees = Math.max(2, Math.round(width / 420));
    for (let i = 0; i < rangees; i += 1) {
      poser('piquets', {
        x: (width / rangees) * i + entre(-30, 30),
        y: hauteur * entre(0.955, 0.995),
        taille: entre(110, 190),
        angle: entre(-2, 2),
        teinte,
        opacite: entre(0.07, 0.12),
      });
    }

    return dessins;
  }, [width, height, teinte]);

  // QUATRE BOUQUETS, QUATRE SOUFFLES. Les motifs sont répartis en quatre
  // groupes, et chaque groupe ondule sur sa propre période. Un seul groupe
  // aurait fait battre tout l'écran à la même mesure — un métronome, pas du
  // vent. Quatre valeurs animées suffisent pour trente motifs : la rotation
  // porte sur le CALQUE, pas sur chaque dessin.
  const bouquets = React.useMemo(() => {
    const groupes: (typeof semis)[] = [[], [], [], []];
    semis.forEach((d, i) => groupes[i % 4].push(d));
    return groupes;
  }, [semis]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {bouquets.map((groupe, i) => (
        <Souffle key={i} periode={9 + i * 2.5} amplitude={0.7 + i * 0.22} retard={i * 1.6} anime={anime}>
          <Svg width="100%" height="100%">
            {groupe.map(({ espece, motif }, k) => {
              if (espece === 'palme') return <Palme key={k} {...motif} />;
              if (espece === 'girofle') return <Girofle key={k} {...motif} />;
              return <Piquets key={k} {...motif} />;
            })}
          </Svg>
        </Souffle>
      ))}
      <ColobeVoyageur largeur={width} hauteur={Math.max(height, 900)} anime={anime} />
    </View>
  );
}

/**
 * UN SOUFFLE — le calque entier bascule de moins d'un degré et demi.
 *
 * La rotation pivote au centre de l'écran : les motifs des bords, les plus
 * éloignés du pivot, se déplacent donc le plus — exactement comme des palmes
 * dont on ne voit que l'extrémité bouger. Neuf points d'interpolation
 * approchent une sinusoïde ; avec quatre, on sentirait les angles.
 */
function Souffle({
  periode,
  amplitude,
  retard,
  anime,
  children,
}: {
  periode: number;
  amplitude: number;
  retard: number;
  anime: boolean;
  children: React.ReactNode;
}) {
  const t = useBoucle(periode, anime, retard);
  const A = amplitude;
  const angle = t.interpolate({
    inputRange: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
    outputRange: [
      '0deg',
      `${(A * 0.71).toFixed(2)}deg`,
      `${A.toFixed(2)}deg`,
      `${(A * 0.71).toFixed(2)}deg`,
      '0deg',
      `${(-A * 0.71).toFixed(2)}deg`,
      `${(-A).toFixed(2)}deg`,
      `${(-A * 0.71).toFixed(2)}deg`,
      '0deg',
    ],
  });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: angle }] }]}>
      {children}
    </Animated.View>
  );
}

/**
 * LE COLOBE QUI TRAVERSE LA CANOPÉE.
 *
 * Il entre par un bord, franchit l'écran en quatre bonds, et sort par
 * l'autre. Puis il recommence, après une longue absence — c'est l'absence qui
 * fait l'événement : un singe qui passe toutes les huit secondes est un
 * papier peint, un singe qui passe une fois par demi-minute est une
 * apparition.
 *
 * Les bonds sont de VRAIES paraboles : la montée est plus lente que la
 * descente, et le corps bascule dans l'axe du saut.
 */
function ColobeVoyageur({
  largeur,
  hauteur,
  anime,
}: {
  largeur: number;
  hauteur: number;
  anime: boolean;
}) {
  const t = useBoucle(34, anime);
  const taille = largeur > 700 ? 76 : 52;
  // La traversée n'occupe que le premier tiers de la boucle : le reste est
  // l'attente, hors de l'écran.
  const TRAVERSEE = 0.34;
  const bonds = 4;
  const entrees: number[] = [];
  const hauteurs: number[] = [];
  const inclinaisons: string[] = [];
  const pas = TRAVERSEE / (bonds * 2);
  for (let i = 0; i <= bonds * 2; i += 1) {
    entrees.push(i * pas);
    // Une branche sur deux : on est au sommet du bond (impair) ou posé (pair).
    hauteurs.push(i % 2 === 0 ? 0 : -46);
    inclinaisons.push(i % 2 === 0 ? '0deg' : '-13deg');
  }
  entrees.push(1);
  hauteurs.push(0);
  inclinaisons.push('0deg');

  const x = t.interpolate({
    inputRange: [0, TRAVERSEE, TRAVERSEE + 0.0001, 1],
    outputRange: [-taille * 1.6, largeur + taille * 1.6, -taille * 1.6, -taille * 1.6],
  });
  const y = t.interpolate({ inputRange: entrees, outputRange: hauteurs });
  const inclinaison = t.interpolate({ inputRange: entrees, outputRange: inclinaisons });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: hauteur * 0.17,
        left: 0,
        opacity: 0.15,
        transform: [{ translateX: x }, { translateY: y }, { rotate: inclinaison }],
      }}
    >
      <Svg width={taille} height={taille} viewBox="0 0 48 48">
        <ColobeLointain x={0} y={0} taille={48} angle={0} teinte={couleurs.encre} opacite={1} />
      </Svg>
    </Animated.View>
  );
}
