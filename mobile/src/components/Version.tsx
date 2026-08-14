// Estampille de version + bouton de dernier recours « Mettre à jour ».
//
// Sans repère visible, impossible de savoir à distance quelle version tourne
// vraiment sur le téléphone d'un client : on corrigeait un défaut sans
// pouvoir vérifier que la correction lui était arrivée. Le numéro s'affiche
// discrètement en bas de l'accueil ; un appui dessus vide tout ce que le
// navigateur garde en mémoire et recharge la dernière version.
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Bouton, Carte, SousTitre } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { couleurs, espaces } from '@/lib/theme';

export const VERSION_APP = process.env.EXPO_PUBLIC_VERSION ?? 'dev';

function forcer() {
  if (Platform.OS !== 'web') return;
  const global = globalThis as unknown as { zanzigoForcerMiseAJour?: () => void; location?: Location };
  if (typeof global.zanzigoForcerMiseAJour === 'function') global.zanzigoForcerMiseAJour();
  else global.location?.reload();
}

/**
 * Carte « Version de l'application », sur l'écran Mon compte.
 *
 * L'étiquette discrète du bas de l'accueil ne servait qu'aux personnes NON
 * connectées : un client déjà entré dans l'application ne repassait jamais par
 * cet écran, et n'avait donc aucun moyen de se dépanner. Ici, le bouton est à
 * portée de main, en toutes lettres.
 */
export function CarteVersion() {
  const { t } = useT();
  return (
    <Carte>
      <SousTitre>{t('version_carte_titre')}</SousTitre>
      <Text style={styles.explication}>{t('version_carte_texte', { version: VERSION_APP })}</Text>
      {Platform.OS === 'web' && (
        <View style={styles.bouton}>
          <Bouton
            titre={t('version_bouton')}
            icone="refresh-circle-outline"
            variante="secondaire"
            onPress={forcer}
          />
        </View>
      )}
    </Carte>
  );
}

export function EtiquetteVersion({ couleur = 'rgba(255,255,255,0.55)' }: { couleur?: string }) {
  const { t } = useT();
  const [confirme, setConfirme] = useState(false);

  return (
    <Pressable
      onPress={() => (confirme ? forcer() : setConfirme(true))}
      accessibilityRole="button"
      hitSlop={10}
      style={({ pressed }) => [styles.zone, pressed && { opacity: 0.6 }]}
    >
      <Text style={[styles.texte, { color: couleur }]}>
        {confirme ? t('version_forcer') : t('version_etiquette', { version: VERSION_APP })}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  explication: {
    fontSize: 14,
    lineHeight: 20,
    color: couleurs.texteSecondaire,
  },
  bouton: {
    marginTop: espaces.xs,
  },
  zone: {
    alignItems: 'center',
    paddingVertical: espaces.s,
  },
  texte: {
    fontSize: 11.5,
    fontWeight: '600',
    textAlign: 'center',
  },
});
