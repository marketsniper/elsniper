// L'ICÔNE D'UNE CATÉGORIE DE LOCATION — un scooter pour « scooter », une
// moto pour « moto », un 4x4 surélevé pour « 4x4 »… (demande du client :
// « genre scooter tu mets un beau scooter »). Une seule table, réutilisée
// partout où une catégorie s'affiche : puces de filtre du catalogue,
// vignette sans photo, fiche véhicule. MaterialCommunityIcons est déjà
// embarqué par @expo/vector-icons — aucune image à télécharger, l'icône est
// vectorielle et prend la couleur qu'on lui donne.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';

type NomMci = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

// Vérifiées une à une dans le glyphmap embarqué : un nom inconnu rendrait
// un « ? » dans un carré, pire que pas d'icône du tout.
const ICONES: Record<string, NomMci> = {
  tourisme: 'car-hatchback',
  '4x4': 'car-lifted-pickup',
  luxe: 'car-sports',
  scooter: 'moped',
  moto: 'motorbike',
  // Pas de moto-cross dans la bibliothèque : le casque dit le sport.
  enduro: 'racing-helmet',
};

export function iconeCategorie(categorie: string | undefined): NomMci {
  return (categorie && ICONES[categorie]) || 'car-hatchback';
}

export function IconeCategorie({
  categorie,
  taille = 22,
  couleur,
}: {
  categorie: string | undefined;
  taille?: number;
  couleur: string;
}) {
  return <MaterialCommunityIcons name={iconeCategorie(categorie)} size={taille} color={couleur} />;
}
