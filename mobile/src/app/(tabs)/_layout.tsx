// Onglets client : Réserver, Mes trajets, Colis, Profil (titres traduits).
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import type { ColorValue } from 'react-native';

import { useRetourSiDeconnecte } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { couleurs } from '@/lib/theme';

function icone(nom: React.ComponentProps<typeof Ionicons>['name']) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={nom} size={size} color={color} />
  );
}

export default function LayoutOnglets() {
  useRetourSiDeconnecte();
  const { t } = useT();
  return (
    <Tabs
      initialRouteName="reserver"
      screenOptions={{
        headerStyle: { backgroundColor: couleurs.sable },
        headerTitleStyle: { color: couleurs.encre, fontWeight: '700' },
        headerShadowVisible: false,
        tabBarActiveTintColor: couleurs.primaire,
        tabBarInactiveTintColor: couleurs.texteSecondaire,
        tabBarStyle: { backgroundColor: couleurs.surface, borderTopColor: couleurs.bordure },
        sceneStyle: { backgroundColor: couleurs.sable },
      }}
    >
      <Tabs.Screen
        name="reserver"
        options={{ title: t('onglet_reserver'), tabBarIcon: icone('car-outline') }}
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
