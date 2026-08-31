// LA CARTE DU TRAJET — version APP INSTALLÉE.
//
// La vraie carte interactive (fond OpenStreetMap, villes touchables) vit dans
// CarteTrajet.web.tsx : elle repose sur Leaflet, une bibliothèque web chargée
// au premier montage, que l'application native ne peut pas exécuter. Ici, on
// garde le bandeau de l'île — le rendu en volume d'Unguja et le slogan — qui
// remplissait déjà ce rôle : montrer ce que zanziGo couvre.
//
// Les deux fichiers exposent la même signature : l'écran Réserver n'a pas à
// savoir sur quelle plateforme il tourne.
import React from 'react';

import { IleDeZanzibar } from '@/components/Ile';

export interface ProprietesCarteTrajet {
  depart: string;
  arrivee: string;
  /** Les lieux proposés (liste du serveur, repli local sinon). */
  lieux: string[];
  /** Les arrivées autorisées depuis le départ courant (règle Stone Town). */
  arriveesPermises: string[];
  /** Le point GPS exact du client (« Ma position »), s'il l'a partagé. */
  pointExact?: { lat: number; lng: number } | null;
  onDepart: (ville: string) => void;
  onArrivee: (ville: string) => void;
  /** Déclenche le parcours « Ma position » de l'écran (GPS → ville). */
  onMaPosition?: () => void;
  /** Recherche GPS en cours : le bouton de position montre un sablier. */
  chargePosition?: boolean;
}

export function CarteTrajet(_props: ProprietesCarteTrajet) {
  return <IleDeZanzibar />;
}
