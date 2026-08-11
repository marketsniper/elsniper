// Mise en page racine : fournit la langue, le contexte d'auth et la pile de
// navigation (titres traduits).
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';

import { AuthProvider } from '@/lib/auth';
import { LangueProvider, useT } from '@/lib/i18n';
import { couleurs } from '@/lib/theme';

function PilesNavigation() {
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
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(driver)" options={{ headerShown: false }} />
      <Stack.Screen name="trip/[id]" options={{ title: t('titre_trajet') }} />
      <Stack.Screen name="package/nouveau" options={{ title: t('titre_nouveau_colis') }} />
      <Stack.Screen name="package/[id]" options={{ title: t('titre_colis') }} />
      <Stack.Screen name="course/[id]" options={{ title: t('titre_course') }} />
      <Stack.Screen name="equipe" options={{ title: t('titre_equipe') }} />
      <Stack.Screen name="annonce/[id]" options={{ title: t('titre_annonce') }} />
      <Stack.Screen name="colis-dispo/[id]" options={{ title: t('titre_colis_dispo') }} />
    </Stack>
  );
}

export default function LayoutRacine() {
  return (
    <LangueProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <PilesNavigation />
      </AuthProvider>
    </LangueProvider>
  );
}
