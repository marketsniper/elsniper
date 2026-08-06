// Onglets client : Réserver, Mes trajets, Colis, Profil.
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import type { ColorValue } from 'react-native';

import { couleurs } from '@/lib/theme';

function icone(nom: React.ComponentProps<typeof Ionicons>['name']) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={nom} size={size} color={color} />
  );
}

export default function LayoutOnglets() {
  return (
    <Tabs
      initialRouteName="reserver"
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
        name="reserver"
        options={{ title: 'Réserver', tabBarIcon: icone('car-outline') }}
      />
      <Tabs.Screen
        name="trajets"
        options={{ title: 'Mes trajets', tabBarIcon: icone('time-outline') }}
      />
      <Tabs.Screen
        name="colis"
        options={{ title: 'Colis', tabBarIcon: icone('cube-outline') }}
      />
      <Tabs.Screen
        name="profil"
        options={{ title: 'Profil', tabBarIcon: icone('person-outline') }}
      />
    </Tabs>
  );
}
