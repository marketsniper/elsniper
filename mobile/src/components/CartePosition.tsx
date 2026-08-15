// Où est ce chauffeur, MAINTENANT — une carte avec un point.
//
// Avant, toucher la position ouvrait Google Maps en mode itinéraire : on
// quittait zanziGo, et on se retrouvait avec un trajet à parcourir alors
// qu'on voulait seulement savoir si le chauffeur était dans le secteur.
// Ici, la carte s'affiche SUR PLACE, avec un point à l'endroit exact de sa
// dernière position. Le lien vers Google Maps reste dessous, pour les fois
// où l'on veut vraiment y aller.
//
// Fond de carte OpenStreetMap : libre, sans clé ni compte, et lisible à
// Zanzibar (les villages de la côte y figurent).
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Bouton } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { lienNavigation } from '@/lib/position';
import { couleurs, espaces, rayons } from '@/lib/theme';

/** Fenêtre affichée autour du point : ~1,1 km de côté, l'échelle du village. */
const MARGE_DEGRES = 0.01;

function lienOpenStreetMap(lat: number, lng: number): string {
  const bbox = [lng - MARGE_DEGRES, lat - MARGE_DEGRES, lng + MARGE_DEGRES, lat + MARGE_DEGRES];
  return (
    'https://www.openstreetmap.org/export/embed.html' +
    `?bbox=${bbox.join('%2C')}&layer=mapnik&marker=${lat}%2C${lng}`
  );
}

export function CartePosition({
  lat,
  lng,
  titre,
  hauteur = 190,
  navigation = false,
  lien = true,
}: {
  lat: number;
  lng: number;
  /** Ce qui est écrit au-dessus : zone, nom, fraîcheur de la position. */
  titre?: string;
  hauteur?: number;
  /**
   * Chauffeur en route vers un client : au lieu du petit lien, un vrai bouton
   * qui lance le guidage routier. C'est le geste principal, il doit se voir.
   */
  navigation?: boolean;
  /**
   * Le client qui relit SA propre position : la carte seule suffit. Lui
   * proposer un itinéraire jusqu'à lui-même n'aurait aucun sens.
   */
  lien?: boolean;
}) {
  const { t } = useT();
  const ouvrirItineraire = () =>
    Linking.openURL(
      navigation ? lienNavigation(lat, lng) : `https://www.google.com/maps?q=${lat},${lng}`
    );

  // Application installée (Android) : pas de carte intégrée, on garde le
  // bouton qui ouvre Maps — l'écran équipe s'utilise surtout sur le web.
  if (Platform.OS !== 'web') {
    // Rien à proposer : ni carte intégrée, ni itinéraire qui ait du sens.
    if (!navigation && !lien) return null;
    return (
      <Bouton
        titre={navigation ? t('carte_y_aller') : (titre ?? t('equipe_position'))}
        icone={navigation ? 'navigate' : 'location-outline'}
        variante={navigation ? 'primaire' : 'secondaire'}
        onPress={ouvrirItineraire}
      />
    );
  }

  return (
    <View style={styles.bloc}>
      {!!titre && (
        <View style={styles.ligneTitre}>
          <Ionicons name="location" size={15} color={couleurs.primaire} />
          <Text style={styles.titre}>{titre}</Text>
        </View>
      )}
      <View style={[styles.cadre, { height: hauteur }]}>
        {React.createElement('iframe', {
          src: lienOpenStreetMap(lat, lng),
          title: titre ?? t('equipe_position'),
          loading: 'lazy',
          style: { border: 0, width: '100%', height: '100%', display: 'block' },
        })}
      </View>
      {navigation ? (
        <Bouton titre={t('carte_y_aller')} icone="navigate" onPress={ouvrirItineraire} />
      ) : !lien ? null : (
        <Pressable
          onPress={ouvrirItineraire}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.lien, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="navigate-outline" size={14} color={couleurs.texteSecondaire} />
          <Text style={styles.texteLien}>{t('carte_itineraire')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: {
    gap: espaces.xs,
  },
  ligneTitre: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titre: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
    color: couleurs.encre,
  },
  cadre: {
    width: '100%',
    borderRadius: rayons.carte,
    overflow: 'hidden',
    backgroundColor: couleurs.primaireClair,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  lien: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: espaces.xs,
  },
  texteLien: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
});
