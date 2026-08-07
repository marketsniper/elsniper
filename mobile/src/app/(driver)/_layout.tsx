// Onglets du mode chauffeur : Mes courses, Annonces, Scanner, Profil
// (titres traduits).
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import type { ColorValue } from 'react-native';

import { useT } from '@/lib/i18n';
import { couleurs } from '@/lib/theme';

function icone(nom: React.ComponentProps<typeof Ionicons>['name']) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={nom} size={size} color={color} />
  );
}

export default function LayoutChauffeur() {
  const { t } = useT();
  return (
    <Tabs
      initialRouteName="courses"
      screenOptions={{
        headerStyle: { backgroundColor: couleurs.sable },
        headerTitleStyle: { color: couleurs.encre, fontWeight: '700' },
        headerShadowVisible: false,
        tabBarActiveTintColor: couleurs.primaire,
        tabBarInactiveTintColor: couleurs.texteSecondaire,
        tabBarStyle: { backgroundColor: couleurs.blanc },
        sceneStyle: { backgroundColor: couleurs.sable },
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
