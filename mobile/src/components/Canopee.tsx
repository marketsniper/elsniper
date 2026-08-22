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
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

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

/**
 * UNE PALME DE COCOTIER.
 *
 * Ce qui distingue une palme d'une branche de conifère — le premier essai
 * donnait un sapin — tient à trois choses, et il faut les trois :
 *  · les folioles sont LONGUES, du tiers de la palme au milieu du rachis ;
 *  · elles partent VERS L'ARRIÈRE, inclinées vers la base, jamais
 *    perpendiculaires ;
 *  · elles RETOMBENT — chacune s'infléchit vers le bas sous son propre poids,
 *    et d'autant plus qu'elle est longue.
 * Le rachis, lui, s'arque et s'affine vers la pointe.
 */
function Palme({ x, y, taille, angle, teinte, opacite }: Motif) {
  const L = taille;
  const folioles: React.ReactElement[] = [];
  const n = 17;
  // Le rachis : quadratique de (0,0) à (L, -L*0.22), contrôle (L*0.5, -L*0.40).
  const rachis = (t: number) => ({
    px: 2 * (1 - t) * t * (L * 0.5) + t * t * L,
    py: 2 * (1 - t) * t * (-L * 0.4) + t * t * (-L * 0.22),
  });
  for (let i = 1; i <= n; i += 1) {
    const t = i / (n + 1);
    const { px, py } = rachis(t);
    // Longues au milieu, courtes aux deux bouts.
    const l = L * 0.36 * Math.sin(Math.PI * t) ** 0.55;
    for (const sens of [1, -1]) {
      // Départ incliné VERS LA BASE (dx négatif), puis retombée (dy positif
      // croissant) : c'est la courbe qui fait la palme.
      const dx1 = -l * 0.18;
      const dy1 = sens * l * 0.42;
      const dx2 = -l * 0.34;
      const dy2 = sens * l * 0.72 + l * 0.34;
      folioles.push(
        <Path
          key={`${i}${sens}`}
          d={`M ${px} ${py} q ${dx1} ${dy1}, ${dx2} ${dy2}`}
          stroke={teinte}
          strokeWidth={L * 0.011}
          strokeLinecap="round"
          fill="none"
        />
      );
    }
  }
  return (
    <G transform={`translate(${x} ${y}) rotate(${angle})`} opacity={opacite}>
      {folioles}
      <Path
        d={`M 0 0 Q ${L * 0.5} ${-L * 0.4}, ${L} ${-L * 0.22}`}
        stroke={teinte}
        strokeWidth={L * 0.022}
        strokeLinecap="round"
        fill="none"
      />
    </G>
  );
}

/**
 * UN RAMEAU DE GIROFLIER — trois boutons floraux sur leur tige, et deux
 * feuilles lancéolées.
 *
 * Un bouton ISOLÉ, dessiné avec ses quatre sépales ouverts, se lit comme une
 * petite main ouverte : c'était le premier essai, et il était mauvais. Le
 * rameau lève l'ambiguïté — c'est la branche qui dit « plante », pas le
 * bouton.
 */
function Girofle({ x, y, taille, angle, teinte, opacite }: Motif) {
  const L = taille;
  const t = L * 0.055;
  const boutons = [
    { bx: 0, by: -L, l: 1 },
    { bx: -L * 0.3, by: -L * 0.82, l: 0.86 },
    { bx: L * 0.28, by: -L * 0.78, l: 0.82 },
  ];
  return (
    <G transform={`translate(${x} ${y}) rotate(${angle})`} opacity={opacite}>
      <Path
        d={`M 0 0 Q ${L * 0.06} ${-L * 0.4}, 0 ${-L * 0.62}`}
        stroke={teinte}
        strokeWidth={t}
        strokeLinecap="round"
        fill="none"
      />
      {[-1, 1].map((sens) => (
        <Path
          key={sens}
          d={`M 0 ${-L * 0.34} q ${sens * L * 0.3} ${-L * 0.02}, ${sens * L * 0.42} ${-L * 0.2} q ${-sens * L * 0.24} ${-L * 0.04}, ${-sens * L * 0.42} ${L * 0.2} Z`}
          fill={teinte}
        />
      ))}
      {boutons.map((b, i) => (
        <G key={i}>
          <Path
            d={`M 0 ${-L * 0.62} L ${b.bx} ${b.by}`}
            stroke={teinte}
            strokeWidth={t * 0.8}
            strokeLinecap="round"
          />
          <Ellipse
            cx={b.bx}
            cy={b.by - L * 0.06 * b.l}
            rx={L * 0.075 * b.l}
            ry={L * 0.13 * b.l}
            fill={teinte}
          />
          {[-28, -9, 9, 28].map((a) => (
            <Path
              key={a}
              d={`M ${b.bx} ${b.by - L * 0.15 * b.l} L ${
                b.bx + Math.sin((a * Math.PI) / 180) * L * 0.1 * b.l
              } ${b.by - L * 0.15 * b.l - Math.cos((a * Math.PI) / 180) * L * 0.09 * b.l}`}
              stroke={teinte}
              strokeWidth={t * 0.7}
              strokeLinecap="round"
            />
          ))}
        </G>
      ))}
    </G>
  );
}

/** UNE RANGÉE DE PIQUETS À MWANI, reliés par une corde détendue. */
function Piquets({ x, y, taille, angle, teinte, opacite }: Motif) {
  const L = taille;
  const n = 5;
  const pas = L / (n - 1);
  const hauteurs = [0.82, 1, 0.9, 1.06, 0.86];
  return (
    <G transform={`translate(${x} ${y}) rotate(${angle})`} opacity={opacite}>
      {hauteurs.map((h, i) => (
        <Path
          key={i}
          d={`M ${i * pas} 0 L ${i * pas} ${-L * 0.4 * h}`}
          stroke={teinte}
          strokeWidth={L * 0.035}
          strokeLinecap="round"
        />
      ))}
      {/* la corde : elle pend entre chaque piquet */}
      <Path
        d={hauteurs
          .map((h, i) =>
            i === 0
              ? `M 0 ${-L * 0.4 * h}`
              : `Q ${(i - 0.5) * pas} ${-L * 0.4 * Math.min(h, hauteurs[i - 1]) + L * 0.05}, ${
                  i * pas
                } ${-L * 0.4 * h}`
          )
          .join(' ')}
        stroke={teinte}
        strokeWidth={L * 0.018}
        fill="none"
      />
    </G>
  );
}

/** LE COLOBE, PERCHÉ — un seul dans toute la canopée. */
function ColobeLointain({ x, y, taille, angle, teinte, opacite }: Motif) {
  const k = taille / 48;
  return (
    <G transform={`translate(${x} ${y}) rotate(${angle}) scale(${k})`} opacity={opacite}>
      <G fill={teinte} stroke={teinte} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M 18 27 C 21 20, 29 17, 34 18.5 C 37.5 19.5, 38 23.5, 35 26.5 C 32 29.5, 25 34, 21 33 C 18 32, 17 29, 18 27 Z" />
        <Circle cx={38.4} cy={16.8} r={3.3} />
        <Path d="M 19 27 C 12.5 27.5, 7 30, 5 34" strokeWidth={6} fill="none" />
        <Path d="M 22.5 32 C 17 35, 13 39, 10 43" strokeWidth={4} fill="none" />
        <Path d="M 35 25.5 C 38 26.5, 41 26.5, 44 25" strokeWidth={3.2} fill="none" />
        <Path d="M 18 28 C 11 26, 5 20, 5 13 C 5 8, 9 4.5, 14 4.5" strokeWidth={3.2} fill="none" />
      </G>
    </G>
  );
}

interface Motif {
  x: number;
  y: number;
  taille: number;
  angle: number;
  teinte: string;
  opacite: number;
}

type Espece = 'palme' | 'girofle' | 'piquets' | 'colobe';

export function Canopee() {
  const { width, height } = useWindowDimensions();
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

    // ── 4. LE COLOBE. UN SEUL dans toute la canopée : répété, il deviendrait
    //    un papier peint à mascotte, exactement ce que la marque s'interdit.
    //    Il est perché dans les palmes d'un angle, pas posé au milieu.
    const gauche = r() < 0.5;
    poser('colobe', {
      x: gauche ? entre(width * 0.04, width * 0.12) : width - entre(width * 0.04, width * 0.12),
      y: hauteur * entre(0.12, 0.24),
      taille: large ? 104 : 62,
      angle: gauche ? 0 : 0,
      teinte,
      opacite: 0.13,
    });

    return dessins;
  }, [width, height, teinte]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        {semis.map(({ espece, motif }, i) => {
          if (espece === 'palme') return <Palme key={i} {...motif} />;
          if (espece === 'girofle') return <Girofle key={i} {...motif} />;
          if (espece === 'piquets') return <Piquets key={i} {...motif} />;
          return <ColobeLointain key={i} {...motif} />;
        })}
      </Svg>
    </View>
  );
}
