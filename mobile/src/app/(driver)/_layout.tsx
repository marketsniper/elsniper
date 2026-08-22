// Onglets du mode chauffeur : Mes courses, Annonces, Scanner, Profil
// (titres traduits).
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import type { ColorValue } from 'react-native';

import { MarqueEntete } from '@/components/ui';
import { useRetourSiDeconnecte } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { couleurs } from '@/lib/theme';

function icone(nom: React.ComponentProps<typeof Ionicons>['name']) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={nom} size={size} color={color} />
  );
}

export default function LayoutChauffeur() {
  useRetourSiDeconnecte();
  const { t } = useT();
  return (
    <Tabs
      initialRouteName="courses"
      screenOptions={{
        // Transparents : le lagon de la racine traverse la navigation.
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
        tabBarStyle: {
          backgroundColor: couleurs.fondOnglets,
          borderTopColor: couleurs.bordure,
        },
        sceneStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Tabs.Screen
        name="courses"
        options={{ title: t('onglet_courses'), tabBarIcon: icone('car-outline') }}
      />
      <Tabs.Screen
        name="annonces"
        options={{ title: t('onglet_annonces'), tabBarIcon: icone('megaphone-outline') }}
      />
      <Tabs.Screen
        name="scanner"
        options={{ title: t('onglet_scanner'), tabBarIcon: icone('qr-code-outline'), headerShown: false }}
      />
      <Tabs.Screen
        name="compte"
        options={{ title: t('onglet_profil'), tabBarIcon: icone('person-outline') }}
      />
    </Tabs>
  );
}
