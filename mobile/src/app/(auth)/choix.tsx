// Ancien écran de choix de profil — remplacé par la page d'accueil de marque.
// Conservé en simple redirection pour ne casser aucun lien existant.
import { Redirect } from 'expo-router';
import React from 'react';

export default function EcranChoix() {
  return <Redirect href="/(auth)/accueil" />;
}
