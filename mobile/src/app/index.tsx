// Aiguillage initial selon l'état d'authentification.
import { Redirect } from 'expo-router';
import React from 'react';

import { ChargementCentre } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { champ, type StatutVerification } from '@/lib/types';

export default function Index() {
  const { session, chargement } = useAuth();

  if (chargement) return <ChargementCentre />;

  // Pas connecté : page d'accueil de marque (choix du profil).
  if (!session) return <Redirect href="/(auth)/accueil" />;

  // Profil chauffeur : mode chauffeur si validé, sinon suivi de candidature.
  if (session.driver) {
    const verifie =
      champ<StatutVerification>(session.driver, 'verification_status', 'verificationStatus') ===
      'verified';
    return <Redirect href={verifie ? '/(driver)/courses' : '/(auth)/pro'} />;
  }

  // Connecté mais sans profil : retour au choix de profil.
  if (!session.user && !session.hotel) return <Redirect href="/(auth)/accueil" />;

  // Client ou hôtel : onglets principaux (l'hôtel réserve pour ses clients).
  return <Redirect href="/(tabs)/reserver" />;
}
