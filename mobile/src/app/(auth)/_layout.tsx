// Pile du parcours d'authentification / création de profil.
import { Stack } from 'expo-router';
import React from 'react';

import { couleurs } from '@/lib/theme';

export default function LayoutAuth() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: couleurs.sable },
        headerTintColor: couleurs.primaireFonce,
        headerTitleStyle: { color: couleurs.encre, fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: couleurs.sable },
      }}
    >
      <Stack.Screen name="accueil" options={{ headerShown: false }} />
      <Stack.Screen name="telephone" options={{ title: '', headerTransparent: true }} />
      <Stack.Screen name="otp" options={{ title: 'Code de vérification' }} />
      <Stack.Screen name="choix" options={{ headerShown: false }} />
      <Stack.Screen name="client" options={{ title: 'Profil client' }} />
      <Stack.Screen name="hotel" options={{ title: 'Hôtel partenaire' }} />
      <Stack.Screen name="hotel-inscription" options={{ title: 'Compte partenaire' }} />
      <Stack.Screen name="pro" options={{ title: 'Devenir chauffeur' }} />
    </Stack>
  );
}
