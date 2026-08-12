// Stockage clé/valeur local : SecureStore sur téléphone, localStorage dans un
// navigateur (SecureStore n'existe pas sur le web — son module y est vide).
// Toutes les mémorisations locales de l'app passent par ici pour que la
// version web (hôtels sur ordinateur) fonctionne comme la version mobile.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export async function lireStockage(cle: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(cle) ?? null;
    } catch {
      return null; // navigation privée : localStorage peut être interdit
    }
  }
  return SecureStore.getItemAsync(cle);
}

export async function ecrireStockage(cle: string, valeur: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(cle, valeur);
    } catch {
      // navigation privée : la session ne survivra pas au rechargement
    }
    return;
  }
  await SecureStore.setItemAsync(cle, valeur);
}

export async function supprimerStockage(cle: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.removeItem(cle);
    } catch {
      // rien à faire
    }
    return;
  }
  await SecureStore.deleteItemAsync(cle);
}
