// ══════════════════════════════════════════════════════════════════════════
// LA MARQUE — le colobe roux de Zanzibar, en plein saut.
//
// POURQUOI CET ANIMAL. Piliocolobus kirkii est le seul grand mammifère
// endémique de l'île : environ 5 862 individus, « En danger » à l'UICN, et
// espèce phare de la conservation zanzibarite depuis le milieu des années
// 1990. « On ne le voit nulle part ailleurs » est littéralement l'argument de
// zanziGo face aux plateformes mondiales.
//
// ET POURQUOI C'ÉTAIT DISCUTABLE. Ce qui tue le colobe, ce sont les VOITURES.
// Avant la pose de ralentisseurs sur la route de Jozani, un individu était
// écrasé toutes les deux à trois semaines — 12 à 17 % du groupe concerné par
// an ; les collisions ont été divisées par deux depuis. Une plateforme de
// taxis qui prend le colobe pour emblème prend pour emblème l'animal que son
// propre métier écrase. En swahili il s'appelle d'ailleurs « kima punju », le
// singe poison : pour un paysan de Jozani-Pete, ce n'est pas une peluche.
//
// LA RÉPONSE. L'emblème ne DÉCORE pas : il PRODUIT UNE RÈGLE. Il ne sert qu'à
// une chose dans le produit — la consigne de vitesse opposable aux chauffeurs
// sur la route de Jozani (voir `traverseJozani` dans lib/types.ts et le
// bandeau de course). Un emblème qui produit une règle d'exploitation n'est
// plus un emblème.
//
// ══════════════════════════════════════════════════════════════════════════
// CE QUI EST MESURÉ DANS CE DESSIN, ET D'OÙ ÇA VIENT
//
//  · QUEUE ≈ CORPS. Tête-corps 45–50 cm, queue 42–55 cm : rapport médian
//    1,02. Nécessaire mais PAS suffisant — le vervet est à 1,22–1,53.
//  · ARRIÈRE-TRAIN DOMINANT. Indice intermembral 87 : les membres antérieurs
//    font 87 % des postérieurs. C'est CE rapport qui exclut le babouin (97),
//    le macaque (93) et le chimpanzé (106). D'où la cuisse épaisse de 6 unités
//    contre un bras de 3,2.
//  · PETIT CRÂNE, VENTRE PROFOND. L'estomac du colobe est sacculé en quatre
//    chambres, « plus grand que celui des autres singes de taille
//    comparable » : la masse ventrale est un fait anatomique, et c'est le
//    trait de silhouette qui survit le mieux à la réduction.
//  · LE SAUT. Piliocolobus est classé « sauteur » sur un corpus de 53 fémurs,
//    28 humérus et 45 os coxaux (Polvadore, McGraw & Daegling, 2024).
//
// CE QUI EN EST ABSENT, ET POURQUOI — le Kindchenschema (Lorenz ; Glocker et
// coll., Ethology 2009) : grande tête, front bombé, gros yeux placés bas,
// petit nez, joues rondes déclenchent la perception « mignon » ET la
// motivation de SOIN — c'est-à-dire qu'ils communiquent vulnérabilité et
// dépendance. Une entreprise à qui l'on confie 47 dollars et son vol de 5 h
// du matin ne peut pas se présenter en peluche. Donc, sans exception :
//    1. aucun œil, ni pupille ni reflet ;
//    2. aucune face vue de face — profil strict ;
//    3. aucune bouche, aucune joue ;
//    4. la tête est une TERMINAISON du tracé, jamais un portrait.
// La bascule vers la mascotte se produit dès qu'un seul de ces points cède.
//
// LE TEST QUI FAIT AUTORITÉ. `outils/marque/verifier.py` rend la marque à
// 16 px, seuille et compte les composantes connexes : il en faut UNE, et 20 à
// 30 % de couverture d'encre. Mesuré : 1 composante, 23,4 %. Si un jour la
// forme a besoin de couleur ou d'un détail pour se lire, ce n'est plus une
// marque — on recommence.
//
// La géométrie est la copie exacte de `outils/marque/colobe.svg`, et
// `backend/test/marque-colobe.test.js` vérifie qu'elle le reste.
// ══════════════════════════════════════════════════════════════════════════
import React from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { couleurs } from '@/lib/theme';

export function Colobe({
  taille = 24,
  couleur,
}: {
  taille?: number;
  /** Par défaut l'encre de la peau active. La marque est TOUJOURS monochrome. */
  couleur?: string;
}) {
  const teinte = couleur ?? couleurs.encre;
  return (
    <Svg width={taille} height={taille} viewBox="0 0 48 48">
      <G fill={teinte} stroke={teinte} strokeLinecap="round" strokeLinejoin="round">
        {/* le tronc — ventre profond sous un dos tendu */}
        <Path d="M 18 27 C 21 20, 29 17, 34 18.5 C 37.5 19.5, 38 23.5, 35 26.5 C 32 29.5, 25 34, 21 33 C 18 32, 17 29, 18 27 Z" />
        {/* la tête — petit crâne, simple terminaison */}
        <Circle cx={38.4} cy={16.8} r={3.3} />
        {/* les postérieurs — la masse dominante */}
        <Path d="M 19 27 C 12.5 27.5, 7 30, 5 34" strokeWidth={6} fill="none" />
        <Path d="M 22.5 32 C 17 35, 13 39, 10 43" strokeWidth={4} fill="none" />
        {/* l'antérieur — court et fin, tendu vers l'avant */}
        <Path d="M 35 25.5 C 38 26.5, 41 26.5, 44 25" strokeWidth={3.2} fill="none" />
        {/* la queue — aussi longue que le corps, en arc OUVERT */}
        <Path d="M 18 28 C 11 26, 5 20, 5 13 C 5 8, 9 4.5, 14 4.5" strokeWidth={3.2} fill="none" />
      </G>
    </Svg>
  );
}
