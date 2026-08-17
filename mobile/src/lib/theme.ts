// Palette « Coucher de soleil » de zanziGo : corail chaud, crème dorée, prune.
// (Direction B choisie par l'équipe — le ciel de Zanzibar à 18 h 30.)
import type { StatutColis, StatutTrajet } from './types';

export const couleurs = {
  primaire: '#E4572E', // corail couchant
  primaireFonce: '#B93C1B', // corail profond (textes sur fonds rosés)
  primaireClair: '#FFE0D2', // rosé (pastilles, encarts info)
  sable: '#FBF0E4', // fond principal — crème dorée (nom historique conservé)
  blanc: '#FFFFFF',
  encre: '#33222B', // texte principal — prune
  texteSecondaire: '#8A7168',
  bordure: '#F0DFD2',
  danger: '#DC2626',
  dangerFonce: '#B91C1C', // texte des encarts d'erreur
  dangerFond: '#FEF2F2', // fond rouge très clair (bandeaux d'erreur)
  dangerBordure: '#FECACA',
  succes: '#5A7D2A',
  succesFond: '#E5EFD8',
  attente: '#B77A12',
  attenteFond: '#FCE9C4',
  orange: '#EA580C', // orange franc (statut « Chauffeur confirmé »)
  orangeFond: '#FFEDD5',
  etoile: '#F2B84B', // étoiles de notation — doré
  voile: 'rgba(30, 15, 22, 0.68)', // voile sombre du scanner (prune translucide)
  succesClair: '#6EE7B7', // texte succès sur fond sombre (scanner)
  dangerClair: '#FCA5A5', // texte erreur sur fond sombre (scanner)
  // Photos de plage en fond, voilées de crème chaude pour la lisibilité.
  voilePhotoClair: 'rgba(255, 247, 238, 0.86)', // voile crème sur les écrans formulaires/listes
  voilePhotoSombre: 'rgba(30, 15, 22, 0.55)', // assombrissement bas des écrans d'accueil
  carteTranslucide: 'rgba(255, 253, 250, 0.94)', // cartes blanc chaud semi-opaques
  // Rôles introduits avec les directions B/D
  surface: '#FFFDFA', // surfaces pleines : champs de saisie, menus, barre d'onglets
  surPrimaire: '#FFF8F2', // texte/icônes posés SUR le corail (boutons)
  or: '#F2B84B', // accent doré : étoiles, touches premium
  nuit: '#33222B', // fonds les plus profonds (carte Chauffeur de l'accueil)
  // FEU VERT — « l'argent est arrivé, tu peux y aller ». Volontairement plus
  // vif que le vert olive `succes` : c'est un repère qu'un chauffeur doit
  // reconnaître d'un coup d'œil, au soleil, sans lire. Réservé au statut
  // PAYÉE — celui qui lui ouvre les coordonnées du client.
  vertFeu: '#15A34A',
  surVertFeu: '#FFFFFF',
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
    shadowColor: '#5C3A2E',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  douce: {
    shadowColor: '#E4572E',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
} as const;

/** Couleurs de pastille par statut de trajet (fond doux + texte lisible). */
export const couleursStatutTrajet: Record<StatutTrajet, { fond: string; texte: string }> = {
  requested: { fond: couleurs.attenteFond, texte: couleurs.attente }, // orange doux
  driver_confirmed: { fond: couleurs.orangeFond, texte: couleurs.orange }, // orange
  // PAYÉE = feu vert plein. C'est le repère du chauffeur : tant qu'il n'est
  // pas allumé, il n'a ni le nom ni le numéro du client (vueChauffeur, côté
  // serveur). Vert plein pour qu'il saute aux yeux ; « Terminée » garde le
  // vert doux, une course finie n'appelle plus rien.
  paid: { fond: couleurs.vertFeu, texte: couleurs.surVertFeu },
  in_progress: { fond: couleurs.primaire, texte: couleurs.surPrimaire }, // corail
  completed: { fond: couleurs.succesFond, texte: couleurs.succes }, // vert doux
  cancelled: { fond: couleurs.bordure, texte: couleurs.texteSecondaire }, // gris
};

/** Couleurs de pastille par statut de colis. */
export const couleursStatutColis: Record<StatutColis, { fond: string; texte: string }> = {
  created: { fond: couleurs.attenteFond, texte: couleurs.attente },
  // Même repère que pour les courses : payé = feu vert, à prendre.
  paid: { fond: couleurs.vertFeu, texte: couleurs.surVertFeu },
  picked_up: { fond: couleurs.primaire, texte: couleurs.surPrimaire },
  delivered: { fond: couleurs.succesFond, texte: couleurs.succes },
  cancelled: { fond: couleurs.bordure, texte: couleurs.texteSecondaire }, // gris
};
