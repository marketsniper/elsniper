// Aiguillage initial selon l'état d'authentification.
import { Redirect } from 'expo-router';
import React from 'react';

import { ChargementCentre } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function Index() {
  const { session, chargement } = useAuth();

  if (chargement) return <ChargementCentre />;

  // Pas connecté : parcours téléphone → OTP.
  if (!session) return <Redirect href="/(auth)/telephone" />;

  // Mode chauffeur si le compte est lié à un profil chauffeur.
  if (session.driver) return <Redirect href="/(driver)/courses" />;

  // Connecté mais sans profil : choix du type de compte.
  if (!session.user && !session.hotel) return <Redirect href="/(auth)/choix" />;

  // Client (ou hôtel) : onglets principaux.
  return <Redirect href="/(tabs)/reserver" />;
}
