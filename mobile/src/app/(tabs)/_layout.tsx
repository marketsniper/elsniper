// Onglets client : Réserver, Location, Mes trajets, Colis, Profil (titres
// traduits). La Location vient JUSTE APRÈS Réserver (demande du client) :
// les deux façons de se déplacer d'abord, le suivi et le reste ensuite.
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MarqueEntete } from '@/components/ui';
import { useRetourSiDeconnecte } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { couleurs } from '@/lib/theme';

// Taille FIXE, plus grande que celle que propose la barre : à cinq onglets,
// les icônes par défaut se serraient et sortaient rognées sur iPhone
// (capture du client, 31/08/2026).
function icone(nom: React.ComponentProps<typeof Ionicons>['name']) {
  return ({ color }: { color: ColorValue; size: number }) => (
    <Ionicons name={nom} size={26} color={color} />
  );
}

export default function LayoutOnglets() {
  useRetourSiDeconnecte();
  const { t } = useT();
  // La barre est dimensionnée À LA MAIN : icône 26 + libellé + respirations.
  // Dès qu'on fixe une hauteur, la marge du bas (barre iPhone) est à notre
  // charge — d'où les insets ajoutés explicitement.
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      initialRouteName="reserver"
      screenOptions={{
        // Transparents : le lagon posé à la racine traverse l'en-tête et la
        // scène. Seule la barre d'onglets garde un voile, pour que le contenu
        // qui défile dessous ne rende pas les libellés illisibles.
        headerStyle: { backgroundColor: 'transparent' },
        headerTransparent: true,
        headerTitleStyle: { color: couleurs.encre, fontWeight: '700' },
        headerShadowVisible: false,
        // La marque, à gauche de CHAQUE en-tête : c'est le seul endroit que
        // voit un utilisateur déjà connecté, qui ne repasse jamais par
        // l'écran d'entrée.
        headerLeft: () => <MarqueEntete />,
        tabBarActiveTintColor: couleurs.primaire,
        tabBarInactiveTintColor: couleurs.texteSecondaire,
        tabBarLabelStyle: { fontSize: 11.5, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: couleurs.fondOnglets,
          borderTopColor: couleurs.bordure,
          height: 62 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 6),
        },
        sceneStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Tabs.Screen
        name="reserver"
        options={{ title: t('onglet_reserver'), tabBarIcon: icone('car-outline') }}
      />
      <Tabs.Screen
        name="location"
        options={{ title: t('onglet_location'), tabBarIcon: icone('car-sport-outline') }}
      />
      <Tabs.Screen
        name="trajets"
        options={{ title: t('onglet_trajets'), tabBarIcon: icone('time-outline') }}
      />
      <Tabs.Screen
        name="colis"
        options={{ title: t('onglet_colis'), tabBarIcon: icone('cube-outline') }}
      />
      <Tabs.Screen
        name="profil"
        options={{ title: t('onglet_profil'), tabBarIcon: icone('person-outline') }}
      />
    </Tabs>
  );
}
