// Pile du parcours d'authentification / création de profil (titres traduits).
import { Stack } from 'expo-router';
import React from 'react';

import { useT } from '@/lib/i18n';
import { couleurs } from '@/lib/theme';

export default function LayoutAuth() {
  const { t } = useT();
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
      {/* En-tête NON transparent : avec la transparence, le contenu passait
          sous la barre du haut et le logo zanziGo se retrouvait coupé. */}
      <Stack.Screen name="telephone" options={{ title: '' }} />
      <Stack.Screen name="otp" options={{ title: t('titre_otp') }} />
      <Stack.Screen name="choix" options={{ headerShown: false }} />
      <Stack.Screen name="client" options={{ title: t('titre_client') }} />
      <Stack.Screen name="hotel" options={{ title: t('titre_hotel') }} />
      <Stack.Screen name="hotel-inscription" options={{ title: t('titre_hotel_inscription') }} />
      <Stack.Screen name="pro" options={{ title: t('titre_pro') }} />
    </Stack>
  );
}
