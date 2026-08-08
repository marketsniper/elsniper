// Palette « Zanzibar » de zanziGo : turquoise océan, sable, blanc.
import type { StatutColis, StatutTrajet } from './types';

export const couleurs = {
  primaire: '#0D9488', // turquoise océan
  primaireFonce: '#0B7C72',
  primaireClair: '#CCFBF1',
  sable: '#F5F0E8',
  blanc: '#FFFFFF',
  encre: '#1F2937',
  texteSecondaire: '#6B7280',
  bordure: '#E5E7EB',
  danger: '#DC2626',
  dangerFonce: '#B91C1C', // texte des encarts d'erreur
  dangerFond: '#FEF2F2', // fond rouge très clair (bandeaux d'erreur)
  dangerBordure: '#FECACA',
  succes: '#059669',
  succesFond: '#D1FAE5',
  attente: '#D97706',
  attenteFond: '#FEF3C7',
  orange: '#EA580C', // orange franc (statut « Chauffeur confirmé »)
  orangeFond: '#FFEDD5',
  etoile: '#F59E0B', // étoiles de notation
  voile: 'rgba(31, 41, 55, 0.65)', // voile sombre du scanner (encre translucide)
  succesClair: '#6EE7B7', // texte succès sur fond sombre (scanner)
  dangerClair: '#FCA5A5', // texte erreur sur fond sombre (scanner)
  // Design tropical : photos de plage en fond, voiles de lisibilité.
  voilePhotoClair: 'rgba(255, 250, 244, 0.82)', // voile blanc sur les écrans formulaires/listes
  voilePhotoSombre: 'rgba(15, 23, 42, 0.55)', // assombrissement bas des écrans d'accueil
  carteTranslucide: 'rgba(255, 255, 255, 0.94)', // cartes blanches semi-opaques sur photo
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
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  douce: {
    shadowColor: '#0D9488',
    shadowOpacity: 0.12,
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
  in_progress: { fond: couleurs.primaire, texte: couleurs.blanc }, // turquoise
  completed: { fond: couleurs.succesFond, texte: couleurs.succes }, // vert
  cancelled: { fond: couleurs.bordure, texte: couleurs.texteSecondaire }, // gris
};

/** Couleurs de pastille par statut de colis. */
export const couleursStatutColis: Record<StatutColis, { fond: string; texte: string }> = {
  created: { fond: couleurs.attenteFond, texte: couleurs.attente },
  paid: { fond: couleurs.primaireClair, texte: couleurs.primaireFonce },
  picked_up: { fond: couleurs.primaire, texte: couleurs.blanc },
  delivered: { fond: couleurs.succesFond, texte: couleurs.succes },
  cancelled: { fond: couleurs.bordure, texte: couleurs.texteSecondaire }, // gris
};
