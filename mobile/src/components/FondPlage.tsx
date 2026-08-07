// Fond tropical réutilisable : photo de plage plein écran + voile de
// lisibilité. Voile 'clair' (blanc léger) pour les écrans formulaires/listes,
// voile 'sombre' (faux dégradé vers le bas, sans dépendance) pour l'accueil.
import React from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';

import { couleurs } from '@/lib/theme';

export type NomFond = 'coucherSoleil' | 'palmiers' | 'lagon' | 'vagues';

const IMAGES: Record<NomFond, ReturnType<typeof require>> = {
  coucherSoleil: require('../../assets/images/fond/coucher-soleil.jpg'),
  palmiers: require('../../assets/images/fond/palmiers.jpg'),
  lagon: require('../../assets/images/fond/lagon.jpg'),
  vagues: require('../../assets/images/fond/vagues.jpg'),
};

// Bandes empilées simulant un dégradé sombre vers le bas (aucune lib).
const OPACITES_DEGRADE = [0, 0.08, 0.18, 0.3, 0.42, 0.55];

export function FondPlage({
  fond,
  voile = 'clair',
  children,
}: {
  fond: NomFond;
  voile?: 'clair' | 'sombre';
  children: React.ReactNode;
}) {
  return (
    <ImageBackground source={IMAGES[fond]} style={styles.image} resizeMode="cover">
      {voile === 'clair' ? (
        <View style={styles.voileClair}>{children}</View>
      ) : (
        <View style={styles.conteneurSombre}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {OPACITES_DEGRADE.map((opacite, index) => (
              <View
                key={index}
                style={[styles.bandeDegrade, { backgroundColor: `rgba(15, 23, 42, ${opacite})` }]}
              />
            ))}
          </View>
          {children}
        </View>
      )}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  image: {
    flex: 1,
  },
  voileClair: {
    flex: 1,
    backgroundColor: couleurs.voilePhotoClair,
  },
  conteneurSombre: {
    flex: 1,
  },
  bandeDegrade: {
    flex: 1,
  },
});
