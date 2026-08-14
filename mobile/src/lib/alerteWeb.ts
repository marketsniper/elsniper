// Répare `Alert.alert` sur la version web.
//
// LE PROBLÈME
// Dans react-native-web, Alert.alert est une fonction VIDE :
//     class Alert { static alert() {} }
// Autrement dit, sur la version que tout le monde utilise (le lien, l'icône
// de l'écran d'accueil), aucune boîte de dialogue ne s'affichait jamais.
// Vingt et une actions en dépendaient — dont « Démarrer la course » du
// chauffeur, qui ne réagissait pas : la demande de confirmation partait dans
// le vide, donc la course ne démarrait jamais. Étaient aussi muettes les
// annulations de réservation, le ménage des anciennes annonces, la radiation
// d'un client, et les messages de remboursement.
//
// LA RÉPARATION
// On remplace cette fonction vide par les FENÊTRES ZANZIGO (composant
// <FournisseurDialogues>, monté à la racine) : même carte blanche, mêmes
// boutons, même corail que le reste de l'application.
// Si jamais ce fournisseur n'était pas encore monté, on se rabat sur les
// boîtes du navigateur — une question ne doit jamais se perdre.
// Les appels existants n'ont pas à changer, et ceux à venir marcheront aussi.
import { Alert, Platform, type AlertButton } from 'react-native';

import { ouvrirDialogue } from './dialogue';

export function reparerAlertesWeb(): void {
  if (Platform.OS !== 'web') return;
  const fenetre = globalThis as unknown as {
    alert?: (message: string) => void;
    confirm?: (message: string) => boolean;
  };
  const demander = fenetre.confirm;
  if (typeof demander !== 'function') return;

  Alert.alert = (titre: string, message?: string, boutons?: AlertButton[]) => {
    const liste = boutons ?? [];

    // Chemin normal : la fenêtre dessinée par zanziGo.
    if (ouvrirDialogue({ titre, message, boutons: liste.length ? liste : [{ text: 'OK' }] })) {
      return;
    }

    // Repli (fournisseur pas encore monté) : les boîtes du navigateur.
    const texte = [titre, message].filter(Boolean).join('\n\n');

    // Simple information : on affiche, puis on exécute l'action éventuelle.
    if (liste.length <= 1) {
      fenetre.alert?.(texte);
      liste[0]?.onPress?.();
      return;
    }

    // Question : le bouton d'annulation est celui marqué « cancel » (ou, à
    // défaut, le premier) ; l'action est le premier bouton non annulateur.
    const annulation = liste.find((b) => b.style === 'cancel') ?? liste[0];
    const action = liste.find((b) => b !== annulation) ?? liste[liste.length - 1];
    const libelle = action?.text ? `\n\n→ OK : ${action.text}` : '';
    if (demander(texte + libelle)) action?.onPress?.();
    else annulation?.onPress?.();
  };
}
