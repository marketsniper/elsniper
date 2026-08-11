// Palette « Nuit d'océan » de zanziGo : marine profonde, turquoise néon, or.
// (Direction D choisie par l'équipe — l'océan de nuit, esprit beach club.)
import type { StatutColis, StatutTrajet } from './types';

export const couleurs = {
  primaire: '#35C4B5', // turquoise néon
  primaireFonce: '#7FE0D5', // texte turquoise clair posé sur les fonds teal sombres
  primaireClair: '#123A41', // fond teal profond (pastilles, encarts info)
  sable: '#10222E', // fond principal — marine profonde (nom historique conservé)
  blanc: '#FFFFFF',
  encre: '#EAF2F4', // texte principal — écume
  texteSecondaire: '#8FA6B0',
  bordure: '#29455A',
  danger: '#E5484D',
  dangerFonce: '#FCA5A5', // texte des encarts d'erreur
  dangerFond: '#3B1A1E', // fond rouge sombre (bandeaux d'erreur)
  dangerBordure: '#7F2E35',
  succes: '#58D6A8',
  succesFond: '#14383B',
  attente: '#E4B95B',
  attenteFond: '#3E3320',
  orange: '#F0A24A', // orange doux (statut « Chauffeur confirmé »)
  orangeFond: '#3D2C18',
  etoile: '#E4B95B', // étoiles de notation — or
  voile: 'rgba(4, 10, 15, 0.7)', // voile sombre du scanner
  succesClair: '#6EE7B7', // texte succès sur fond sombre (scanner)
  dangerClair: '#FCA5A5', // texte erreur sur fond sombre (scanner)
  // Photos de plage en fond, voilées de marine pour la lisibilité nocturne.
  voilePhotoClair: 'rgba(16, 34, 46, 0.88)', // voile marine sur les écrans formulaires/listes
  voilePhotoSombre: 'rgba(4, 10, 15, 0.55)', // assombrissement bas des écrans d'accueil
  carteTranslucide: 'rgba(26, 50, 66, 0.95)', // cartes marine claire semi-opaques
  // Rôles propres à « Nuit d'océan »
  surface: '#1A3242', // surfaces pleines : champs de saisie, menus, barre d'onglets
  surPrimaire: '#0B1B24', // texte/icônes posés SUR le turquoise (boutons)
  or: '#D8AE5E', // accent or : logo, touches premium
  nuit: '#0B1B24', // fonds les plus profonds (carte Chauffeur de l'accueil)
};

export const rayons = {
  carte: 16,
  bouton: 12,
  pastille: 999,
};

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

/** Ombres douces réutilisables (iOS + elevation Android). */
export const ombres = {
  carte: {
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  douce: {
    shadowColor: '#35C4B5',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
} as const;

/** Couleurs de pastille par statut de trajet (fond doux + texte lisible). */
export const couleursStatutTrajet: Record<StatutTrajet, { fond: string; texte: string }> = {
  requested: { fond: couleurs.attenteFond, texte: couleurs.attente }, // orange doux
  driver_confirmed: { fond: couleurs.orangeFond, texte: couleurs.orange }, // orange
  paid: { fond: couleurs.primaireClair, texte: couleurs.primaireFonce }, // turquoise clair
  in_progress: { fond: couleurs.primaire, texte: couleurs.surPrimaire }, // turquoise
  completed: { fond: couleurs.succesFond, texte: couleurs.succes }, // vert
  cancelled: { fond: couleurs.bordure, texte: couleurs.texteSecondaire }, // gris
};

/** Couleurs de pastille par statut de colis. */
export const couleursStatutColis: Record<StatutColis, { fond: string; texte: string }> = {
  created: { fond: couleurs.attenteFond, texte: couleurs.attente },
  paid: { fond: couleurs.primaireClair, texte: couleurs.primaireFonce },
  picked_up: { fond: couleurs.primaire, texte: couleurs.surPrimaire },
  delivered: { fond: couleurs.succesFond, texte: couleurs.succes },
  cancelled: { fond: couleurs.bordure, texte: couleurs.texteSecondaire }, // gris
};
