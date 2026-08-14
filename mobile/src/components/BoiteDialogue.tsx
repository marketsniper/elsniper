// Fenêtres de confirmation au style zanziGo.
//
// Sur le web, React Native ne sait pas afficher de boîte de dialogue (sa
// fonction est vide) : on s'est d'abord rabattu sur celles du navigateur,
// grises et sans rapport avec l'application. Voici les vraies : même carte
// blanche, mêmes boutons, même corail que le reste de zanziGo.
//
// Le composant se monte UNE fois à la racine et écoute les demandes ; les
// écrans continuent d'appeler `Alert.alert` comme avant.
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type AlertButton } from 'react-native';

import { Bouton } from '@/components/ui';
import { sabonnerAuxDialogues, type DemandeDialogue } from '@/lib/dialogue';
import { couleurs, espaces, rayons } from '@/lib/theme';

export function FournisseurDialogues({ children }: { children: React.ReactNode }) {
  const [demande, setDemande] = useState<DemandeDialogue | null>(null);

  useEffect(() => sabonnerAuxDialogues((nouvelle) => setDemande(nouvelle)), []);

  const fermer = (bouton?: AlertButton) => {
    setDemande(null);
    // On laisse la fenêtre se refermer avant d'agir : l'action peut ouvrir
    // un autre écran, ou une autre question.
    if (bouton?.onPress) setTimeout(() => bouton.onPress?.(), 0);
  };

  const boutons = demande?.boutons ?? [];
  const annulation = boutons.find((b) => b.style === 'cancel');
  // Actions = tout sauf le bouton d'annulation, dans l'ordre d'origine.
  const actions = boutons.filter((b) => b !== annulation);
  const destructif = actions.some((b) => b.style === 'destructive');
  // Une seule action sans annulation possible : c'est une information.
  const information = boutons.length <= 1;

  return (
    <>
      {children}
      <Modal
        visible={!!demande}
        transparent
        animationType="fade"
        onRequestClose={() => fermer(annulation)}
      >
        {/* Toucher le voile revient à annuler — sauf pour une information,
            où le seul bouton est déjà la sortie. */}
        <Pressable
          style={styles.voile}
          onPress={() => (information ? fermer(boutons[0]) : fermer(annulation))}
        >
          {/* Le contenu ne se referme pas quand on le touche. */}
          <Pressable style={styles.carte} onPress={() => {}}>
            <View
              style={[
                styles.pastille,
                { backgroundColor: destructif ? couleurs.dangerFond : couleurs.primaireClair },
              ]}
            >
              <Ionicons
                name={destructif ? 'alert-circle' : information ? 'information-circle' : 'help-circle'}
                size={30}
                color={destructif ? couleurs.danger : couleurs.primaire}
              />
            </View>

            <Text style={styles.titre}>{demande?.titre}</Text>
            {!!demande?.message && <Text style={styles.message}>{demande.message}</Text>}

            <View style={styles.actions}>
              {actions.map((bouton, index) => (
                <Bouton
                  key={`${bouton.text}-${index}`}
                  titre={bouton.text ?? 'OK'}
                  variante={bouton.style === 'destructive' ? 'danger' : 'primaire'}
                  onPress={() => fermer(bouton)}
                />
              ))}
              {!!annulation && (
                <Pressable
                  onPress={() => fermer(annulation)}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={({ pressed }) => [styles.lienAnnuler, pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.texteAnnuler}>{annulation.text ?? 'Annuler'}</Text>
                </Pressable>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  voile: {
    flex: 1,
    backgroundColor: couleurs.voile,
    alignItems: 'center',
    justifyContent: 'center',
    padding: espaces.l,
  },
  carte: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: couleurs.blanc,
    borderRadius: rayons.carte,
    padding: espaces.l,
    gap: espaces.m,
    alignItems: 'center',
    // Ombre portée douce, pour détacher la fenêtre du fond.
    shadowColor: '#33222B',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  pastille: {
    width: 56,
    height: 56,
    borderRadius: rayons.pastille,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titre: {
    fontSize: 18,
    fontWeight: '800',
    color: couleurs.encre,
    textAlign: 'center',
    lineHeight: 24,
  },
  message: {
    fontSize: 15,
    color: couleurs.texteSecondaire,
    textAlign: 'center',
    lineHeight: 22,
  },
  actions: {
    width: '100%',
    gap: espaces.s,
    marginTop: espaces.xs,
  },
  lienAnnuler: {
    alignSelf: 'center',
    paddingVertical: espaces.s,
    paddingHorizontal: espaces.m,
  },
  texteAnnuler: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.texteSecondaire,
  },
});
