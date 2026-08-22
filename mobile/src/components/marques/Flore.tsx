// ══════════════════════════════════════════════════════════════════════════
// LA FLORE — les primitives végétales de zanziGo.
//
// Elles vivent ici et pas dans un écran, parce que DEUX dessins d'un même
// cocotier finissent toujours par diverger : le premier essai de la scène de
// la course avait sa propre palme, en cinq traits droits, et elle se lisait
// comme un « V ». Une seule palme, partagée.
//
// Trois motifs, et chacun appartient à cette île :
//  · LA PALME DE COCOTIER — le cocotier borde chaque route d'Unguja.
//  · LE RAMEAU DE GIROFLIER — Zanzibar est l'île aux épices, et le clou de
//    girofle figure sur ses armes.
//  · LE PIQUET À MWANI — les bâtons plantés dans le platier pour tenir les
//    cordes à algues, motif le plus reconnaissable de la côte est. C'est
//    déjà la grammaire des étapes d'une course dans la frise de statut.
// ══════════════════════════════════════════════════════════════════════════
import React from 'react';
import { Circle, Ellipse, G, Path } from 'react-native-svg';

export interface Motif {
  x: number;
  y: number;
  taille: number;
  angle: number;
  teinte: string;
  opacite: number;
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
export function Palme({ x, y, taille, angle, teinte, opacite }: Motif) {
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
export function Girofle({ x, y, taille, angle, teinte, opacite }: Motif) {
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
export function Piquets({ x, y, taille, angle, teinte, opacite }: Motif) {
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

/**
 * UN COCOTIER ENTIER — un stipe arqué et sa couronne de palmes.
 *
 * Le stipe penche, et les palmes de la couronne sont les MÊMES que celles de
 * la canopée, simplement plus petites et tournées en éventail. C'est ce qui
 * fait la différence entre un arbre et une étoile à cinq branches.
 */
export function Cocotier({ x, y, taille, angle, teinte, opacite }: Motif) {
  const H = taille;
  const penche = H * 0.09;
  return (
    <G transform={`translate(${x} ${y}) rotate(${angle})`} opacity={opacite}>
      <Path
        d={`M 0 0 q ${penche * 1.6} ${-H * 0.55}, ${penche} ${-H}`}
        stroke={teinte}
        strokeWidth={H * 0.05}
        strokeLinecap="round"
        fill="none"
      />
      {[-116, -74, -30, 14, 58, 100].map((a, i) => (
        <Palme
          key={a}
          x={penche}
          y={-H}
          taille={H * (0.46 + (i % 2) * 0.08)}
          angle={a}
          teinte={teinte}
          opacite={1}
        />
      ))}
    </G>
  );
}

/**
 * UNE TOUFFE D'HERBE DE BORD DE ROUTE — cinq brins courbes issus d'un point.
 *
 * Des traits droits en éventail donnent un chevron, pas une touffe : ce sont
 * la COURBURE et les longueurs inégales qui font l'herbe.
 */
export function Touffe({ x, y, taille, angle, teinte, opacite }: Motif) {
  const H = taille;
  const brins = [-0.9, -0.45, 0, 0.4, 0.85];
  return (
    <G transform={`translate(${x} ${y}) rotate(${angle})`} opacity={opacite}>
      {brins.map((k, i) => {
        const l = H * (i === 2 ? 1 : 0.72 + (i % 2) * 0.16);
        return (
          <Path
            key={k}
            d={`M 0 0 q ${k * l * 0.22} ${-l * 0.62}, ${k * l * 0.62} ${-l}`}
            stroke={teinte}
            strokeWidth={Math.max(1.2, H * 0.06)}
            strokeLinecap="round"
            fill="none"
          />
        );
      })}
    </G>
  );
}

/**
 * LE COLOBE, VU DE LOIN — la marque, réduite au rang de motif.
 *
 * Un SEUL par écran. Répété, il deviendrait un papier peint à mascotte,
 * exactement ce que la marque s'interdit. La géométrie est celle de
 * `marques/Colobe.tsx`, à l'identique.
 */
export function ColobeLointain({ x, y, taille, angle, teinte, opacite }: Motif) {
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
