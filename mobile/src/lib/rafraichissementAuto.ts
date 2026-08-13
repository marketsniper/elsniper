// Rafraîchissement AUTOMATIQUE d'un écran : tant que la page est affichée,
// la fonction de rechargement est rappelée à intervalle régulier. Le client
// voit ainsi son statut évoluer tout seul (chauffeur confirmé par l'équipe,
// paiement validé, place annulée…) sans avoir à toucher quoi que ce soit.
// L'intervalle s'arrête dès que l'écran n'est plus au premier plan.
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

export const INTERVALLE_RAFRAICHISSEMENT_MS = 20000;

export function useRafraichissementAuto(
  recharger: () => void | Promise<unknown>,
  ms: number = INTERVALLE_RAFRAICHISSEMENT_MS
) {
  // Toujours la dernière version du rechargement, sans relancer le minuteur.
  const rechargerRef = useRef(recharger);
  rechargerRef.current = recharger;

  useFocusEffect(
    useCallback(() => {
      const minuteur = setInterval(() => {
        void rechargerRef.current();
      }, ms);
      return () => clearInterval(minuteur);
    }, [ms])
  );
}
