// ══════════════════════════════════════════════════════════════════════════
// LE THÈME zanziGo — DEUX PEAUX.
//
//  · « bento » — Bento Zanzibar. Crème, encre noire, corail. Des blocs
//    cernés d'un trait épais, chacun posé sur son ombre franche. Aucun
//    dégradé, aucune photo : tout se lit en plein soleil, à bout de bras.
//    C'est la peau de l'application — clients, chauffeurs, équipe.
//
//  · « nuit » — Nuit d'épices. Presque noir, filets d'or, corail.
//    La nuit de Stone Town.
//
//  · « verre » — Lagon de verre. Des panneaux translucides posés sur un
//    lagon : turquoise en haut à gauche, corail à droite, violet en bas.
//    Le fond ne bouge pas, les cartes flottent au-dessus — c'est la
//    profondeur qui donne la hiérarchie, pas les traits. C'est la peau de
//    l'application (21/08/2026).
//
// Les deux peaux exposent EXACTEMENT les mêmes noms de couleurs. Aucun écran
// n'a besoin de savoir laquelle est active : `couleurs.encre` donne l'encre
// de la peau du moment. La bascule se fait dans FournisseurPeau, plus bas.
// ══════════════════════════════════════════════════════════════════════════
import React from 'react';
import { Platform, StyleSheet, type TextStyle } from 'react-native';

import { decalageSolaire, secteurSolaire } from './soleil';
import type { StatutColis, StatutTrajet } from './types';

export type NomPeau = 'bento' | 'nuit' | 'verre' | 'estran';

interface Palette {
  primaire: string;
  primaireFonce: string;
  primaireClair: string;
  sable: string;
  blanc: string;
  encre: string;
  texteSecondaire: string;
  bordure: string;
  danger: string;
  dangerFonce: string;
  dangerFond: string;
  dangerBordure: string;
  succes: string;
  /** Texte posé SUR un aplat `succes` — sombre sur les verts clairs des
   *  peaux sombres, blanc sur le vert profond de Bento. */
  surSucces: string;
  succesFond: string;
  attente: string;
  attenteFond: string;
  orange: string;
  orangeFond: string;
  etoile: string;
  voile: string;
  succesClair: string;
  dangerClair: string;
  voilePhotoClair: string;
  voilePhotoSombre: string;
  /** Fond de la barre d'onglets — la seule surface qui reste posée sur le
   *  contenu qui défile. Sombre sur les peaux sombres, blanche sur Bento :
   *  un voile prune sur du crème passe pour une salissure. */
  fondOnglets: string;
  carteTranslucide: string;
  surface: string;
  surPrimaire: string;
  or: string;
  nuit: string;
  vertFeu: string;
  surVertFeu: string;
  turquoise: string;
  /** Toujours blanc, quelle que soit la peau : QR, icônes sur pastille pleine. */
  surVoile: string;
  /** Bloc de mise en avant, plus profond que les cartes (gains du jour, carte chauffeur). */
  accentFond: string;
  /** Texte principal posé sur `accentFond`. */
  surAccent: string;
  /** Texte secondaire posé sur `accentFond`. */
  surAccentDoux: string;
  /**
   * LA CARTE « CHAUFFEUR » de la page d'accueil — un aplat PLEIN au milieu
   * de trois cartes translucides. Un orange pastel : assez chaud pour
   * accrocher l'œil sur le crème comme sur le lagon, assez doux pour ne pas
   * voler la vedette au corail, qui reste la couleur des actions.
   */
  chauffeurFond: string;
  /** Titre posé sur `chauffeurFond`. */
  surChauffeur: string;
  /** Sous-titre et chevron posés sur `chauffeurFond`. */
  surChauffeurDoux: string;
}

// ─────────────────────────── 02 · BENTO ZANZIBAR ───────────────────────────
const BENTO: Palette = {
  primaire: '#E4572E', // corail — la couleur d'action
  primaireFonce: '#B93C1B', // corail profond (textes sur fonds rosés)
  primaireClair: '#FFE7D8', // rosé pâle (pastilles, encarts info)
  sable: '#FFF4E8', // fond principal — crème (nom historique conservé)
  blanc: '#FFFFFF',
  encre: '#241017', // texte principal ET trait des cartes
  texteSecondaire: '#7A5A50',
  bordure: '#F0DFCB', // filet doux : séparateurs, pastilles neutres
  danger: '#D62828',
  dangerFonce: '#8F1616',
  dangerFond: '#FDEAEA',
  dangerBordure: '#F6C8C8',
  succes: '#1F7A3D',
  surSucces: '#FFFFFF',
  succesFond: '#DDF0E1',
  attente: '#9A6511',
  attenteFond: '#FCEBC8',
  orange: '#EA580C',
  orangeFond: '#FFE7D0',
  etoile: '#F2B84B',
  voile: 'rgba(36, 16, 23, 0.72)', // voile sombre du scanner
  succesClair: '#7BE3A3', // texte succès sur fond sombre (scanner)
  dangerClair: '#FCA5A5',
  voilePhotoClair: '#FFF4E8', // plus de photo : le fond est plein
  voilePhotoSombre: 'rgba(36, 16, 23, 0.55)',
  fondOnglets: '#FFFFFF',
  carteTranslucide: '#FFFFFF', // les cartes sont BLANCHES et opaques
  surface: '#FFFFFF', // champs de saisie, menus, barre d'onglets
  surPrimaire: '#FFF4E8', // texte/icônes posés SUR le corail
  or: '#F2B84B',
  nuit: '#241017',
  vertFeu: '#15A34A', // « l'argent est arrivé, tu peux y aller »
  surVertFeu: '#FFFFFF',
  turquoise: '#0E9AA7', // LE CLIENT sur une carte
  surVoile: '#FFFFFF',
  accentFond: '#241017',
  surAccent: '#FFF4E8',
  surAccentDoux: 'rgba(255, 244, 232, 0.72)',
  chauffeurFond: '#F9A97E',
  surChauffeur: '#241017',
  surChauffeurDoux: 'rgba(36, 16, 23, 0.74)',
};

// ──────────────────────────── 03 · NUIT D'ÉPICES ───────────────────────────
const NUIT: Palette = {
  // Dans « Nuit d'épices », l'accent n'est pas le corail mais L'OR : sur du
  // presque-noir, c'est lui qui porte le nom, les boutons et les montants.
  // Le corail reste présent en alerte et en orange.
  primaire: '#F2B84B',
  primaireFonce: '#F7CE7E', // or clair : textes et flèches sur fond noir
  primaireClair: 'rgba(242, 184, 75, 0.16)',
  sable: '#100C14', // fond principal — noir violacé
  blanc: '#191320', // « blanc » = la surface la plus claire de la peau
  encre: '#F0E7DC', // texte principal — crème
  texteSecondaire: '#A2918C',
  bordure: 'rgba(242, 184, 75, 0.32)', // filet d'or
  danger: '#E5484D',
  dangerFonce: '#FF9EA1',
  dangerFond: 'rgba(229, 72, 77, 0.14)',
  dangerBordure: 'rgba(229, 72, 77, 0.36)',
  succes: '#5FD08A',
  surSucces: '#08120F',
  succesFond: 'rgba(95, 208, 138, 0.14)',
  attente: '#F2B84B',
  attenteFond: 'rgba(242, 184, 75, 0.16)',
  orange: '#FF8A5B',
  orangeFond: 'rgba(255, 138, 91, 0.16)',
  etoile: '#F2B84B',
  voile: 'rgba(8, 5, 11, 0.82)',
  succesClair: '#7BE3A3',
  dangerClair: '#FCA5A5',
  voilePhotoClair: '#100C14',
  voilePhotoSombre: 'rgba(8, 5, 11, 0.6)',
  fondOnglets: 'rgba(8, 5, 11, 0.6)',
  carteTranslucide: '#191320',
  surface: '#1F1726',
  surPrimaire: '#150E06', // texte posé SUR l'or : encre chaude, très lisible
  or: '#F2B84B',
  nuit: '#0A070D',
  vertFeu: '#15A34A',
  surVertFeu: '#FFFFFF',
  turquoise: '#2BB3B8',
  surVoile: '#FFFFFF',
  // Un noir CHAUD, tiré vers l'or : c'est ce qui détache le bloc du fond
  // violacé sans allumer une couleur de plus.
  accentFond: '#221A10',
  surAccent: '#F5EDE1',
  surAccentDoux: 'rgba(245, 237, 225, 0.66)',
  chauffeurFond: '#F2A97E',
  surChauffeur: '#1A0F08',
  surChauffeurDoux: 'rgba(26, 15, 8, 0.74)',
};

// ─────────────────────────── 01 · LAGON DE VERRE ───────────────────────────
// Rien n'est opaque : les surfaces sont des voiles blancs posés sur le
// dégradé, cernés d'un filet clair. La couleur d'action est le BLANC —
// c'est lui qui ressort d'un fond déjà coloré, pas un accent de plus.
const VERRE: Palette = {
  primaire: '#F4FBFC', // le verre le plus clair : boutons, onglet actif
  primaireFonce: '#FFD9C9', // rosé : liens, flèches d'en-tête
  primaireClair: 'rgba(255, 255, 255, 0.18)', // bulles d'icônes, encarts
  sable: '#0E2733', // le lagon profond, sous le dégradé
  blanc: '#123240', // panneaux OPAQUES : fenêtres de confirmation
  encre: '#F4FBFC',
  texteSecondaire: 'rgba(244, 251, 252, 0.68)',
  bordure: 'rgba(255, 255, 255, 0.26)',
  danger: '#FF6B6B',
  dangerFonce: '#FFC9C9',
  dangerFond: 'rgba(255, 107, 107, 0.18)',
  dangerBordure: 'rgba(255, 107, 107, 0.42)',
  succes: '#5EE6B5',
  surSucces: '#0E2733',
  succesFond: 'rgba(94, 230, 181, 0.18)',
  attente: '#FFD08A',
  attenteFond: 'rgba(255, 208, 138, 0.18)',
  orange: '#FF9E7A',
  orangeFond: 'rgba(255, 158, 122, 0.18)',
  etoile: '#F2B84B',
  voile: 'rgba(6, 20, 27, 0.82)',
  succesClair: '#7BE3A3',
  dangerClair: '#FCA5A5',
  voilePhotoClair: '#0E2733',
  voilePhotoSombre: 'rgba(6, 20, 27, 0.55)',
  fondOnglets: 'rgba(6, 20, 27, 0.55)',
  carteTranslucide: 'rgba(255, 255, 255, 0.13)',
  surface: 'rgba(255, 255, 255, 0.14)',
  surPrimaire: '#0E2733', // l'encre posée SUR le verre blanc
  or: '#F2B84B',
  nuit: '#0A1A22',
  vertFeu: '#15A34A',
  surVertFeu: '#FFFFFF',
  turquoise: '#37C4C9',
  surVoile: '#FFFFFF',
  accentFond: 'rgba(255, 255, 255, 0.2)',
  surAccent: '#F4FBFC',
  surAccentDoux: 'rgba(244, 251, 252, 0.7)',
  chauffeurFond: '#FFB693',
  surChauffeur: '#0E2733',
  surChauffeurDoux: 'rgba(14, 39, 51, 0.76)',
};

// ──────────────────────────── 05 · ESTRAN ─────────────────────────────────
//
// LA CARTE MARINE DE ZANZIBAR.
//
// Deux fois par jour la mer recule de plusieurs centaines de mètres et l'île
// montre ses courbes de niveau : bancs de sable, herbiers, tombant du récif.
// C'est cette lecture-là que porte la peau — un relevé bathymétrique en
// strates, des cartes posées à des profondeurs mesurées, et UNE seule chose
// chaude à l'écran : l'orange qui demande d'agir.
//
// Trois corrections de fond par rapport au lagon précédent :
//  · l'eau du lagon n'est pas turquoise. Les herbiers en couvrent l'essentiel
//    et la donnent JADE, presque olive. Le turquoise n'existe qu'en bandes
//    étroites, sur le sable nu — il redevient donc un accent, pas un champ.
//  · la peau est CLAIRE. Le texte sombre sur fond clair se lit mieux (la
//    pupille se contracte, moins d'aberrations optiques) et l'écart se creuse
//    dans le noir — c'est-à-dire dans la voiture du chauffeur, la nuit. En
//    plein soleil les deux polarités se valent : une peau sombre n'apporte
//    donc rien et coûte le reflet.
//  · les surfaces qui portent du texte sont OPAQUES. Un panneau translucide
//    n'a pas de contraste mesurable : il dépend de ce qui passe derrière. Le
//    verre dépoli reste, mais pour le décor.
const ESTRAN: Palette = {
  primaire: '#D4551F', // l'étoile de l'estran — la couleur d'action, et rien d'autre
  primaireFonce: '#0B4A47', // teal profond : liens, chiffres, libellés qui portent
  primaireClair: '#FBE4D6', // pastilles et encarts d'information
  sable: '#E7EEEB', // l'estran découvert — le fond de tous les écrans
  blanc: '#FFFFFF',
  encre: '#0A2A2E', // le tombant : texte principal, et couleur de toutes les ombres
  texteSecondaire: '#41615F', // l'herbier
  bordure: '#D2DEDA',
  danger: '#8E1F26', // l'oursin — volontairement sourd, il ne doit pas crier
  dangerFonce: '#6B141A',
  dangerFond: '#F7E4E4',
  dangerBordure: '#E6C4C4',
  succes: '#0E6E34',
  surSucces: '#FFFFFF',
  succesFond: '#DDEEE2',
  attente: '#8A5A12',
  attenteFond: '#F7E9CE',
  orange: '#B4541B',
  orangeFond: '#FAE4D5',
  etoile: '#C9891A', // l'or clair disparaît sur un fond clair : on l'assombrit
  voile: 'rgba(10, 42, 46, 0.74)',
  succesClair: '#7BE3A3',
  dangerClair: '#FCA5A5',
  voilePhotoClair: '#E7EEEB',
  voilePhotoSombre: 'rgba(10, 42, 46, 0.55)',
  fondOnglets: '#FFFFFF',
  carteTranslucide: '#FFFFFF', // OPAQUE : la profondeur vient de l'ombre, pas de la transparence
  surface: '#FFFFFF',
  surPrimaire: '#FFFFFF',
  or: '#C9891A',
  nuit: '#0A2A2E',
  vertFeu: '#0E6E34',
  surVertFeu: '#FFFFFF',
  turquoise: '#0B6E74', // le lagon à un mètre — le repère CLIENT sur une carte
  surVoile: '#FFFFFF',
  accentFond: '#0A2A2E',
  surAccent: '#E7EEEB',
  surAccentDoux: 'rgba(231, 238, 235, 0.74)',
  chauffeurFond: '#F2B389',
  surChauffeur: '#3A1C0C',
  surChauffeurDoux: 'rgba(58, 28, 12, 0.74)',
};

const PEAUX: Record<NomPeau, Palette> = { bento: BENTO, nuit: NUIT, verre: VERRE, estran: ESTRAN };

/**
 * LA PEAU DE L'APPLICATION — « Lagon de verre » (21/08/2026).
 *
 * C'est ici, et nulle part ailleurs, qu'on en change : le layout racine la
 * lit, et la variable de module démarre déjà dessus. Le jour où elle était
 * choisie dans le layout, les styles écrits DIRECTEMENT dans le JSX de la
 * racine — évalués avant le rendu du fournisseur — prenaient encore les
 * couleurs de la peau précédente : l'application s'ouvrait sur un fond crème
 * sous un dégradé de lagon.
 */
export const PEAU_PAR_DEFAUT: NomPeau = 'verre';

// La peau active. Volontairement une variable de module : les feuilles de
// style sont construites hors composant, elles doivent pouvoir la consulter
// sans passer par React.
let peauActive: NomPeau = PEAU_PAR_DEFAUT;

export function peauCourante(): NomPeau {
  return peauActive;
}

// ─────────────────────────── L'HEURE DU JOUR ───────────────────────────────
// Le secteur solaire courant : la direction dans laquelle le soleil de
// Zanzibar jette les ombres à cet instant. Comme la peau, c'est une variable
// de module — les feuilles de style sont construites hors composant.
let secteurActif = secteurSolaire();

export function secteurCourant(): number {
  return secteurActif;
}

/** Bascule l'heure du jour. Renvoie true si le secteur a changé. */
export function appliquerSecteur(secteur: number): boolean {
  if (secteurActif === secteur) return false;
  secteurActif = secteur;
  return true;
}

/**
 * Bascule la peau. Renvoie true si elle a changé — les feuilles réactives
 * se reconstruiront alors au prochain accès.
 */
export function appliquerPeau(nom: NomPeau): boolean {
  if (peauActive === nom) return false;
  peauActive = nom;
  return true;
}

/** Miroir vers la palette de la peau active : `couleurs.encre` suit la peau. */
export const couleurs = new Proxy({} as Palette, {
  get: (_cible, cle) => PEAUX[peauActive][cle as keyof Palette],
  has: (_cible, cle) => cle in BENTO,
  ownKeys: () => Reflect.ownKeys(BENTO),
  getOwnPropertyDescriptor: (_cible, cle) => ({
    value: PEAUX[peauActive][cle as keyof Palette],
    enumerable: true,
    configurable: true,
  }),
}) as Palette;

// ─────────────────────────────── LES FORMES ────────────────────────────────
interface Rayons {
  carte: number;
  bouton: number;
  pastille: number;
}
const RAYONS: Record<NomPeau, Rayons> = {
  bento: { carte: 13, bouton: 12, pastille: 999 },
  nuit: { carte: 12, bouton: 12, pastille: 999 },
  // Le verre est généreux : des angles serrés casseraient l'effet de panneau.
  verre: { carte: 18, bouton: 16, pastille: 999 },
  // L'estran : des angles mesurés. Une carte marine a des cartouches, pas des
  // galets — et un arrondi uniforme partout est l'un des tics du design
  // fabriqué à la chaîne.
  estran: { carte: 14, bouton: 10, pastille: 999 },
};

export const rayons = new Proxy({} as Rayons, {
  get: (_cible, cle) => RAYONS[peauActive][cle as keyof Rayons],
  has: (_cible, cle) => cle in RAYONS.bento,
  ownKeys: () => Reflect.ownKeys(RAYONS.bento),
  getOwnPropertyDescriptor: (_cible, cle) => ({
    value: RAYONS[peauActive][cle as keyof Rayons],
    enumerable: true,
    configurable: true,
  }),
}) as Rayons;

export const espaces = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  xxl: 32,
};

/** Hauteurs tactiles généreuses (champs et boutons). */
export const tailles = {
  champ: 52,
  bouton: 52,
  avatar: 76,
};

// ─────────────────────── LA SIGNATURE D'UNE CARTE ──────────────────────────
// `ombres.carte` ne porte plus seulement une ombre : c'est TOUT ce qui fait
// qu'un bloc est un bloc. En Bento, c'est un trait d'encre épais posé sur une
// ombre franche, sans flou — l'effet « papier découpé » de la direction. En
// Nuit d'épices, c'est un filet d'or et une ombre profonde.
// Volontairement plus étroit qu'un ViewStyle : ces propriétés-là existent
// aussi sur une Image, et le relief se pose parfois sur un logo.
interface Relief {
  borderWidth: number;
  borderColor: string;
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
}
interface Ombres {
  carte: Relief;
  douce: Relief;
  /**
   * L'OMBRE DE CONTACT — la petite ombre dense, juste sous l'objet.
   *
   * React Native n'accepte qu'UNE ombre par vue : une ombre longue et douce
   * fait flotter, une ombre courte et dense fait poser, et il faut les deux
   * pour qu'un objet ait l'air pesant. `Carte` la peint donc sur une couche
   * intérieure. Optionnelle : les peaux qui n'en veulent pas ne changent pas.
   */
  contact?: Relief;
}
const OMBRES: Record<NomPeau, Ombres> = {
  bento: {
    carte: {
      borderWidth: 2,
      borderColor: BENTO.encre,
      shadowColor: BENTO.encre,
      shadowOpacity: 1,
      shadowRadius: 0,
      shadowOffset: { width: 3, height: 3 },
      elevation: 0,
    },
    douce: {
      borderWidth: 2,
      borderColor: BENTO.encre,
      shadowColor: BENTO.encre,
      shadowOpacity: 1,
      shadowRadius: 0,
      shadowOffset: { width: 4, height: 4 },
      elevation: 0,
    },
  },
  nuit: {
    carte: {
      borderWidth: 1,
      borderColor: 'rgba(242, 184, 75, 0.32)',
      shadowColor: '#000000',
      shadowOpacity: 0.5,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    douce: {
      borderWidth: 1,
      borderColor: 'rgba(242, 184, 75, 0.42)',
      shadowColor: '#000000',
      shadowOpacity: 0.6,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 5,
    },
  },
  // Le verre : un filet clair, et une ombre profonde mais LARGE — c'est elle
  // qui décolle le panneau du lagon et donne l'impression d'épaisseur.
  verre: {
    carte: {
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.24)',
      shadowColor: '#02141C',
      shadowOpacity: 0.42,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    douce: {
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.38)',
      shadowColor: '#02141C',
      shadowOpacity: 0.5,
      shadowRadius: 34,
      shadowOffset: { width: 0, height: 14 },
      elevation: 6,
    },
  },
  // ─── L'ESTRAN : UNE SEULE SOURCE DE LUMIÈRE, HAUTE ───────────────────────
  //
  // Ce qui fait lire la profondeur n'est pas la force de l'ombre, c'est sa
  // COHÉRENCE : deux directions de lumière dans un même écran détruisent
  // l'illusion. Ici tout tombe verticalement, comme le soleil au 6e parallèle
  // sud à midi. Et chaque carte porte DEUX ombres : une longue et douce qui
  // la décolle, une courte et dense qui la pose. C'est le couple qui donne le
  // poids — une ombre seule fait un autocollant.
  estran: {
    carte: {
      borderWidth: 1,
      borderColor: ESTRAN.bordure,
      shadowColor: ESTRAN.encre,
      shadowOpacity: 0.13,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 3,
    },
    douce: {
      borderWidth: 1,
      borderColor: ESTRAN.bordure,
      shadowColor: ESTRAN.encre,
      shadowOpacity: 0.18,
      shadowRadius: 34,
      shadowOffset: { width: 0, height: 18 },
      elevation: 6,
    },
    contact: {
      borderWidth: 0,
      borderColor: 'transparent',
      shadowColor: ESTRAN.encre,
      shadowOpacity: 0.1,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
  },
};

/**
 * Le relief, ORIENTÉ PAR LE SOLEIL RÉEL.
 *
 * Le design fixe la LONGUEUR de chaque ombre ; le ciel de Zanzibar en donne
 * la DIRECTION. `shadowOffset` est donc recalculé à partir de sa propre
 * norme et du secteur solaire du moment : à gauche le matin, ramassée sous la
 * carte à midi, à droite le soir. Une peau à ombre nulle (Bento porte un
 * décalage franc de parti pris, pas une ombre de lumière) garde la sienne :
 * on ne touche qu'aux ombres qui prétendent venir d'une source.
 */
const RELIEFS_ORIENTES = new Map<string, Relief>();

function reliefOriente(peau: NomPeau, cle: keyof Ombres): Relief | undefined {
  const brut = OMBRES[peau][cle];
  if (!brut) return brut;
  // Bento assume une ombre « papier découpé » : pas de flou, pas de soleil.
  if (brut.shadowRadius === 0 || brut.shadowOpacity === undefined) return brut;
  const memo = `${peau}:${String(cle)}:${secteurActif}`;
  let oriente = RELIEFS_ORIENTES.get(memo);
  if (!oriente) {
    oriente = { ...brut, shadowOffset: decalageSolaire(secteurActif, brut.shadowOffset) };
    RELIEFS_ORIENTES.set(memo, oriente);
  }
  return oriente;
}

export const ombres = new Proxy({} as Ombres, {
  get: (_cible, cle) => reliefOriente(peauActive, cle as keyof Ombres),
  has: (_cible, cle) => cle in OMBRES.bento,
  ownKeys: () => Reflect.ownKeys(OMBRES.bento),
  getOwnPropertyDescriptor: (_cible, cle) => ({
    value: reliefOriente(peauActive, cle as keyof Ombres),
    enumerable: true,
    configurable: true,
  }),
}) as Ombres;

// ──────────────────────────── LA TYPOGRAPHIE ───────────────────────────────
/**
 * INSTRUMENT SANS, la voix de la direction : gras serré sur les titres,
 * lisible et neutre sur le reste.
 *
 * Quatre fichiers, un par graisse : React Native ne synthétise pas le gras
 * d'une police chargée à la main, il faut nommer la coupe exacte.
 */
/**
 * LA VOIX DE CHAQUE PEAU.
 *
 * La police fait partie de la direction, pas du réglage global : les feuilles
 * de style étant déjà construites peau par peau, `poserLaPolice` peut choisir
 * la famille du moment sans que rien d'autre ne bouge.
 *
 * · Instrument Sans — les trois premières directions.
 * · ARCHIVO, sur l'estran. Grotesque à très grande hauteur d'x et à
 *   descendantes courtes : à corps égal, il rend plus de millimètres de
 *   glyphe qu'Instrument Sans. Ça compte ici — passer de 3 à 4 mm de hauteur
 *   de glyphe améliore le seuil de lisibilité MÊME en pleine lumière, et nos
 *   chauffeurs lisent au coup d'œil, moteur tournant.
 * · FAUSTINA pour les montants. Un serif de labeur, pas un serif de mode :
 *   il donne aux chiffres une assise que la grotesque n'a pas, et il évite le
 *   couple « grotesque + serif d'affichage » qu'on voit sur toutes les
 *   planches fabriquées à la chaîne. Même fonderie qu'Archivo (Omnibus-Type),
 *   donc des métriques verticales voisines : « 48 » et « USD » se posent sur
 *   la même ligne de base sans rattrapage à la main.
 */
const POLICES_PAR_PEAU: Record<NomPeau, { 400: string; 500: string; 600: string; 700: string }> = {
  bento: {
    400: 'InstrumentSans',
    500: 'InstrumentSans-Medium',
    600: 'InstrumentSans-SemiBold',
    700: 'InstrumentSans-Bold',
  },
  nuit: {
    400: 'InstrumentSans',
    500: 'InstrumentSans-Medium',
    600: 'InstrumentSans-SemiBold',
    700: 'InstrumentSans-Bold',
  },
  verre: {
    400: 'InstrumentSans',
    500: 'InstrumentSans-Medium',
    600: 'InstrumentSans-SemiBold',
    700: 'InstrumentSans-Bold',
  },
  estran: {
    400: 'Archivo',
    500: 'Archivo-Medium',
    600: 'Archivo-SemiBold',
    700: 'Archivo-Bold',
  },
};

/** Compatibilité : la famille de la peau ACTIVE, par graisse. */
export const POLICES = new Proxy({} as Record<400 | 500 | 600 | 700, string>, {
  get: (_c, cle) => POLICES_PAR_PEAU[peauActive][Number(cle) as 400],
}) as Record<400 | 500 | 600 | 700, string>;

/**
 * LA POLICE DES MONTANTS — à poser À LA MAIN, jamais injectée.
 *
 * `poserLaPolice` ne remplit que les styles SANS fontFamily : il suffit donc
 * d'écrire `fontFamily: POLICE_MONTANT` là où un chiffre doit peser.
 * Renvoie la famille d'interface sur les peaux qui n'ont pas de serif.
 */
export function policeMontant(): string {
  return peauActive === 'estran' ? 'Faustina-Bold' : POLICES_PAR_PEAU[peauActive][700];
}

/** Les fichiers à charger au démarrage (expo-font). */
export const FICHIERS_POLICES = {
  InstrumentSans: require('../../assets/fonts/InstrumentSans-Regular.ttf'),
  'InstrumentSans-Medium': require('../../assets/fonts/InstrumentSans-Medium.ttf'),
  'InstrumentSans-SemiBold': require('../../assets/fonts/InstrumentSans-SemiBold.ttf'),
  'InstrumentSans-Bold': require('../../assets/fonts/InstrumentSans-Bold.ttf'),
  Archivo: require('../../assets/fonts/Archivo-Regular.ttf'),
  'Archivo-Medium': require('../../assets/fonts/Archivo-Medium.ttf'),
  'Archivo-SemiBold': require('../../assets/fonts/Archivo-SemiBold.ttf'),
  'Archivo-Bold': require('../../assets/fonts/Archivo-Bold.ttf'),
  'Faustina-SemiBold': require('../../assets/fonts/Faustina-SemiBold.ttf'),
  'Faustina-Bold': require('../../assets/fonts/Faustina-Bold.ttf'),
};

function familleSelonPoids(poids: unknown): string {
  const p = String(poids ?? '400');
  if (p === 'bold' || p === '700' || p === '800' || p === '900') return POLICES[700];
  if (p === '600') return POLICES[600];
  if (p === '500') return POLICES[500];
  return POLICES[400];
}

/**
 * LE VRAI VERRE DÉPOLI — sur le web seulement.
 *
 * `backdrop-filter` floute ce qui passe DERRIÈRE le panneau : c'est ce qui
 * sépare un vrai verre dépoli d'un simple voile blanc. React Native ne
 * connaît pas cette propriété sur téléphone ; l'application installée garde
 * le voile translucide, qui en donne déjà l'impression. La version web — la
 * PWA, celle que les clients ouvrent en scannant le QR — a le verre pour de
 * bon.
 */
const FLOU_VERRE =
  Platform.OS === 'web' ? { backdropFilter: 'blur(20px) saturate(160%)' } : null;

/** Les surfaces qui reçoivent le flou : celles peintes en verre. */
const SURFACES_DE_VERRE = new Set([VERRE.carteTranslucide, VERRE.surface, VERRE.primaireClair]);

/**
 * Pose la police sur tout style qui parle de texte.
 *
 * React Native n'a pas de police globale : sans ce passage, il aurait fallu
 * écrire `fontFamily` dans les quelque huit cents styles de l'application —
 * et en oublier. Toute entrée qui porte une taille ou une graisse reçoit la
 * coupe correspondante ; celles qui nomment déjà une police sont laissées
 * telles quelles.
 */
function poserLaPolice<T extends Record<string, unknown>>(feuille: T): T {
  const verre = peauActive === 'verre' && FLOU_VERRE;
  const sortie: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(feuille)) {
    const entree = valeur as Record<string, unknown>;
    if (!entree || typeof entree !== 'object') {
      sortie[cle] = entree;
      continue;
    }
    let finale = entree;
    if (('fontSize' in finale || 'fontWeight' in finale) && !('fontFamily' in finale)) {
      finale = { ...finale, fontFamily: familleSelonPoids(finale.fontWeight) };
    }
    if (verre && SURFACES_DE_VERRE.has(finale.backgroundColor as string)) {
      finale = { ...finale, ...FLOU_VERRE };
    }
    sortie[cle] = finale;
  }
  return sortie as T;
}

// ───────────────────────── LES FEUILLES RÉACTIVES ──────────────────────────
/**
 * Comme StyleSheet.create, mais la feuille est (re)construite pour CHAQUE
 * peau, à la demande, puis gardée en mémoire.
 *
 * Une feuille ordinaire fige ses couleurs au chargement du module — bien
 * avant qu'on sache si l'utilisateur est un voyageur ou un hôtel. Ici,
 * `styles.carte` va chercher la feuille de la peau du moment : la bascule
 * est immédiate, sans recharger l'application.
 */
export function stylesReactifs<
  T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<Record<string, unknown>>,
>(fabrique: () => T & StyleSheet.NamedStyles<Record<string, unknown>>): T {
  // Clé : la peau ET l'heure du jour. Une feuille construite ce matin porte
  // des ombres tournées vers l'ouest ; elle ne doit pas resservir ce soir.
  const feuilles = new Map<string, T>();
  const feuille = (): Record<string | symbol, unknown> => {
    const cle = `${peauActive}:${secteurActif}`;
    let f = feuilles.get(cle);
    if (!f) {
      f = StyleSheet.create(poserLaPolice(fabrique()));
      feuilles.set(cle, f);
    }
    return f as Record<string | symbol, unknown>;
  };
  return new Proxy({} as T, {
    get: (_cible, cle) => feuille()[cle],
    has: (_cible, cle) => cle in feuille(),
    ownKeys: () => Reflect.ownKeys(feuille()),
    getOwnPropertyDescriptor: (_cible, cle) => ({
      value: feuille()[cle],
      enumerable: true,
      configurable: true,
    }),
  });
}

// ──────────────────────── LES PASTILLES DE STATUT ──────────────────────────
type Ton = { fond: string; texte: string };

function tonsTrajet(p: Palette): Record<StatutTrajet, Ton> {
  return {
    requested: { fond: p.attenteFond, texte: p.attente },
    driver_confirmed: { fond: p.orangeFond, texte: p.orange },
    // PAYÉE = feu vert plein. C'est le repère du chauffeur : tant qu'il n'est
    // pas allumé, il n'a ni le nom ni le numéro du client.
    paid: { fond: p.vertFeu, texte: p.surVertFeu },
    in_progress: { fond: p.primaire, texte: p.surPrimaire },
    completed: { fond: p.succesFond, texte: p.succes },
    cancelled: { fond: p.bordure, texte: p.texteSecondaire },
  };
}

function tonsColis(p: Palette): Record<StatutColis, Ton> {
  return {
    created: { fond: p.attenteFond, texte: p.attente },
    paid: { fond: p.vertFeu, texte: p.surVertFeu },
    picked_up: { fond: p.primaire, texte: p.surPrimaire },
    delivered: { fond: p.succesFond, texte: p.succes },
    cancelled: { fond: p.bordure, texte: p.texteSecondaire },
  };
}

const TONS_TRAJET: Record<NomPeau, Record<StatutTrajet, Ton>> = {
  bento: tonsTrajet(BENTO),
  nuit: tonsTrajet(NUIT),
  verre: tonsTrajet(VERRE),
  estran: tonsTrajet(ESTRAN),
};
const TONS_COLIS: Record<NomPeau, Record<StatutColis, Ton>> = {
  bento: tonsColis(BENTO),
  nuit: tonsColis(NUIT),
  verre: tonsColis(VERRE),
  estran: tonsColis(ESTRAN),
};

/** Couleurs de pastille par statut de trajet (fond doux + texte lisible). */
export const couleursStatutTrajet = new Proxy({} as Record<StatutTrajet, Ton>, {
  get: (_cible, cle) => TONS_TRAJET[peauActive][cle as StatutTrajet],
  has: (_cible, cle) => cle in TONS_TRAJET.bento,
  ownKeys: () => Reflect.ownKeys(TONS_TRAJET.bento),
  getOwnPropertyDescriptor: (_cible, cle) => ({
    value: TONS_TRAJET[peauActive][cle as StatutTrajet],
    enumerable: true,
    configurable: true,
  }),
}) as Record<StatutTrajet, Ton>;

/** Couleurs de pastille par statut de colis. */
export const couleursStatutColis = new Proxy({} as Record<StatutColis, Ton>, {
  get: (_cible, cle) => TONS_COLIS[peauActive][cle as StatutColis],
  has: (_cible, cle) => cle in TONS_COLIS.bento,
  ownKeys: () => Reflect.ownKeys(TONS_COLIS.bento),
  getOwnPropertyDescriptor: (_cible, cle) => ({
    value: TONS_COLIS[peauActive][cle as StatutColis],
    enumerable: true,
    configurable: true,
  }),
}) as Record<StatutColis, Ton>;

/**
 * LES QUELQUES COULEURS D'UNE PEAU QUI N'EST PAS L'ACTIVE.
 *
 * Les miroirs ci-dessus renvoient toujours la peau du moment — parfait pour
 * dessiner l'application, inutilisable pour dessiner l'APERÇU d'une autre.
 * Le sélecteur de design a besoin de montrer les deux côte à côte : il vient
 * les chercher ici, nommément.
 */
export function apercuPeau(nom: NomPeau): {
  fond: string;
  carte: string;
  bordure: string;
  texte: string;
  secondaire: string;
  accent: string;
} {
  const p = PEAUX[nom];
  return {
    fond: p.sable,
    carte: p.carteTranslucide,
    bordure: p.bordure,
    texte: p.encre,
    secondaire: p.texteSecondaire,
    accent: p.primaire,
  };
}

// ──────────────────────── LA BASCULE, CÔTÉ REACT ───────────────────────────
const ContextePeau = React.createContext<NomPeau>(PEAU_PAR_DEFAUT);

/** La peau active, pour les rares écrans qui veulent s'y adapter. */
export function usePeau(): NomPeau {
  return React.useContext(ContextePeau);
}

/**
 * Applique une peau à tout ce qui est en dessous.
 *
 * La variable de module est posée PENDANT le rendu, avant celui des enfants :
 * quand un hôtel se connecte, ses écrans se dessinent déjà en Nuit d'épices,
 * sans une image de la peau précédente.
 */
export function FournisseurPeau({
  nom,
  children,
}: {
  nom: NomPeau;
  children: React.ReactNode;
}) {
  appliquerPeau(nom);
  return React.createElement(ContextePeau.Provider, { value: nom }, children);
}

// ─────────────────────── L'HEURE DU JOUR, CÔTÉ REACT ──────────────────────
const ContexteSoleil = React.createContext<number>(secteurActif);

/** Le secteur solaire du moment, pour les écrans qui veulent s'y adapter. */
export function useSecteurSolaire(): number {
  return React.useContext(ContexteSoleil);
}

/**
 * Fait suivre au thème l'heure qu'il est réellement à Zanzibar.
 *
 * Un relevé au montage, puis toutes les dix minutes. Le secteur ne change
 * qu'environ toutes les deux heures : la plupart des relevés ne provoquent
 * aucun rendu. Quand il change, la `key` remonte l'arbre — c'est le même
 * mécanisme que la bascule de peau, et pour la même raison : les feuilles de
 * style sont lues à la volée et ne se redessinent pas sur un simple contexte.
 */
export function FournisseurSoleil({ children }: { children: React.ReactNode }) {
  const [secteur, setSecteur] = React.useState(secteurActif);
  React.useEffect(() => {
    const relever = () => setSecteur(secteurSolaire());
    relever();
    const minuterie = setInterval(relever, 600000);
    return () => clearInterval(minuterie);
  }, []);
  appliquerSecteur(secteur);
  return React.createElement(ContexteSoleil.Provider, { value: secteur }, children);
}

export type { Palette, TextStyle };
