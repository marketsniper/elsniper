// Estampille de version + bouton de dernier recours « Mettre à jour ».
//
// Sans repère visible, impossible de savoir à distance quelle version tourne
// vraiment sur le téléphone d'un client : on corrigeait un défaut sans
// pouvoir vérifier que la correction lui était arrivée. Le numéro s'affiche
// discrètement en bas de l'accueil ; un appui dessus vide tout ce que le
// navigateur garde en mémoire et recharge la dernière version.
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { useT } from '@/lib/i18n';
import { espaces } from '@/lib/theme';

export const VERSION_APP = process.env.EXPO_PUBLIC_VERSION ?? 'dev';

export function EtiquetteVersion({ couleur = 'rgba(255,255,255,0.55)' }: { couleur?: string }) {
  const { t } = useT();
  const [confirme, setConfirme] = useState(false);

  const forcer = () => {
    if (Platform.OS !== 'web') return;
    const global = globalThis as unknown as { zanzigoForcerMiseAJour?: () => void; location?: Location };
    if (typeof global.zanzigoForcerMiseAJour === 'function') global.zanzigoForcerMiseAJour();
    else global.location?.reload();
  };

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
