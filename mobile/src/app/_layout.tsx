// Mise en page racine : fournit le contexte d'auth et la pile de navigation.
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';

import { AuthProvider } from '@/lib/auth';
import { couleurs } from '@/lib/theme';

export default function LayoutRacine() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
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
        <Stack.Screen name="trip/[id]" options={{ title: 'Trajet' }} />
        <Stack.Screen name="package/nouveau" options={{ title: 'Nouveau colis' }} />
        <Stack.Screen name="package/[id]" options={{ title: 'Colis' }} />
        <Stack.Screen name="course/[id]" options={{ title: 'Course' }} />
      </Stack>
    </AuthProvider>
  );
}
