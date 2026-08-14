// Passe-plat entre `Alert.alert` et la fenêtre dessinée par zanziGo.
//
// `Alert.alert` est appelé depuis vingt endroits de l'application, sans rien
// savoir de l'affichage. Il dépose ici sa demande ; le composant
// <FournisseurDialogues>, monté à la racine, l'affiche par-dessus l'écran
// courant. Aucun de ces vingt appels n'a eu besoin de changer.
import type { AlertButton } from 'react-native';

export interface DemandeDialogue {
  titre: string;
  message?: string;
  boutons: AlertButton[];
}

type Ecouteur = (demande: DemandeDialogue) => void;

let ecouteur: Ecouteur | null = null;

/** Le fournisseur s'annonce au démarrage. Renvoie de quoi se retirer. */
export function sabonnerAuxDialogues(surDemande: Ecouteur): () => void {
  ecouteur = surDemande;
  return () => {
    if (ecouteur === surDemande) ecouteur = null;
  };
}

/**
 * Demande l'affichage d'une fenêtre. Renvoie false si personne n'écoute —
 * l'appelant se rabat alors sur la boîte du navigateur, pour qu'une question
 * ne se perde jamais.
 */
export function ouvrirDialogue(demande: DemandeDialogue): boolean {
  if (!ecouteur) return false;
  ecouteur(demande);
  return true;
}
