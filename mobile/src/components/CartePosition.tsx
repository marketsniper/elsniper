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
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';

/** Fenêtre affichée autour du point : ~1,1 km de côté, l'échelle du village. */
const MARGE_DEGRES = 0.01;

/**
 * Cadre TOUJOURS CENTRÉ sur le point principal.
 *
 * C'est ce qui permet de poser notre propre pictogramme (la petite voiture)
 * pile dessus : le centre de la fenêtre demandée reste le centre de la carte
 * affichée, quelle que soit la forme du cadre. Un marqueur placé ailleurs
 * qu'au centre dériverait, parce qu'OpenStreetMap élargit la vue pour la
 * remplir et choisit son propre zoom.
 *
 * @param cadrer Second point à garder dans le cadre — le client qui suit
 *   l'approche de son taxi veut les voir tous les deux, pas seulement le
 *   taxi tout seul au milieu de nulle part. On élargit alors la fenêtre
 *   SYMÉTRIQUEMENT, de quoi englober ce point sans décentrer le taxi.
 * @param voiture Dessine-t-on nous-mêmes le marqueur ? Si oui, on n'en
 *   demande pas un à OpenStreetMap : deux marqueurs se chevaucheraient.
 */
function lienOpenStreetMap(
  lat: number,
  lng: number,
  cadrer?: { lat: number; lng: number },
  voiture = false
): string {
  // Marge élargie d'un quart : sans ça, les points collent aux bords.
  const marge = MARGE_DEGRES * 1.25;
  const demiLat = cadrer ? Math.max(marge, Math.abs(lat - cadrer.lat) + marge) : marge;
  const demiLng = cadrer ? Math.max(marge, Math.abs(lng - cadrer.lng) + marge) : marge;
  const bbox = [lng - demiLng, lat - demiLat, lng + demiLng, lat + demiLat];
  return (
    'https://www.openstreetmap.org/export/embed.html' +
    `?bbox=${bbox.join('%2C')}&layer=mapnik` +
    (voiture ? '' : `&marker=${lat}%2C${lng}`)
  );
}

export function CartePosition({
  lat,
  lng,
  titre,
  hauteur = 190,
  navigation = false,
  lien = true,
  cadrer,
  marqueur = 'point',
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
  /** Second point à garder dans le cadre (sans marqueur). */
  cadrer?: { lat: number; lng: number };
  /**
   * Ce qu'on pose sur la carte. `point` : l'épingle d'OpenStreetMap, pour un
   * LIEU (un point de rendez-vous ne bouge pas). `voiture` : notre petite
   * voiture zanziGo, pour un VÉHICULE — le client qui regarde son taxi
   * approcher doit reconnaître une voiture, pas déchiffrer une épingle.
   */
  marqueur?: 'point' | 'voiture';
}) {
  const { t } = useT();
  const estVoiture = marqueur === 'voiture';
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
        icone={navigation ? 'navigate' : estVoiture ? 'car-sport' : 'location-outline'}
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
          src: lienOpenStreetMap(lat, lng, cadrer, estVoiture),
          title: titre ?? t('equipe_position'),
          loading: 'lazy',
          style: { border: 0, width: '100%', height: '100%', display: 'block' },
        })}
        {/* LA PETITE VOITURE, posée au centre — c'est-à-dire exactement sur
            le taxi, puisque le cadre est centré sur lui. Un halo derrière,
            pour qu'elle se détache du fond de carte quel qu'il soit ; elle
            ne capte pas le toucher, la carte reste manipulable dessous. */}
        {estVoiture && (
          <View style={styles.zoneVoiture} pointerEvents="none">
            <View style={styles.halo} />
            <View style={styles.pastilleVoiture}>
              <Ionicons name="car-sport" size={22} color={couleurs.surPrimaire} />
            </View>
          </View>
        )}
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
  // La voiture se pose au centre du cadre — et le cadre est centré sur le
  // taxi (voir lienOpenStreetMap).
  zoneVoiture: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(228, 87, 46, 0.22)',
  },
  pastilleVoiture: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: couleurs.primaire,
    alignItems: 'center',
    justifyContent: 'center',
    // Liseré blanc : la voiture reste lisible sur une route, un toit ou la mer.
    borderWidth: 3,
    borderColor: couleurs.blanc,
    ...ombres.carte,
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
