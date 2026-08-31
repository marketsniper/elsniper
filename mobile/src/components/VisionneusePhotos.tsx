// VISIONNEUSE DE PHOTOS — les photos d'un véhicule EN GRAND, par-dessus
// l'écran (demande du client, 31/08/2026 : « ouvrir les photos en grand »).
//
// Différente de VisionneuseDocument : ici il n'y a pas UN document à lire
// mais une SÉRIE de photos à feuilleter — on balaie de l'une à l'autre
// (pages pleines largeur), le compteur dit où l'on est, et deux flèches
// servent la souris sur le web. La pièce est volontairement SOMBRE quelle
// que soit la peau : une photo se regarde dans le noir, comme partout.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { useT } from '@/lib/i18n';
import { espaces, stylesReactifs } from '@/lib/theme';

interface Photo {
  id: string;
  url: string;
}

export function VisionneusePhotos({
  photos,
  index,
  titre,
  onFermer,
}: {
  photos: Photo[];
  /** Position de la photo ouverte, ou null : visionneuse fermée. */
  index: number | null;
  /** En-tête optionnel (marque + modèle du véhicule). */
  titre?: string;
  onFermer: () => void;
}) {
  const { t } = useT();
  const { width } = useWindowDimensions();
  const [courant, setCourant] = React.useState(0);
  const liste = React.useRef<FlatList<Photo> | null>(null);

  // À chaque ouverture, on repart de la photo touchée.
  React.useEffect(() => {
    if (index !== null) setCourant(index);
  }, [index]);

  const aller = (i: number) => {
    const borne = Math.max(0, Math.min(photos.length - 1, i));
    liste.current?.scrollToIndex({ index: borne, animated: true });
    setCourant(borne);
  };

  return (
    <Modal visible={index !== null} transparent animationType="fade" onRequestClose={onFermer}>
      <View style={styles.fond}>
        <View style={styles.entete}>
          {!!titre && (
            <Text style={styles.titre} numberOfLines={1}>
              {titre}
            </Text>
          )}
          {photos.length > 1 && (
            <Text style={styles.compteur}>
              {courant + 1} / {photos.length}
            </Text>
          )}
          <Pressable
            onPress={onFermer}
            accessibilityRole="button"
            accessibilityLabel={t('commun_fermer')}
            hitSlop={12}
          >
            <Ionicons name="close-circle" size={34} color="#FFFFFF" />
          </Pressable>
        </View>

        <FlatList
          ref={liste}
          data={photos}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(photo) => photo.id}
          initialScrollIndex={index ?? 0}
          // Pages pleines largeur : sans cette géométrie déclarée,
          // initialScrollIndex ne sait pas où sauter.
          getItemLayout={(_donnees, i) => ({ length: width, offset: width * i, index: i })}
          // Le compteur suit le doigt — onScroll plutôt que la fin d'inertie,
          // qui ne se déclenche pas toujours sur le web.
          onScroll={(evenement) =>
            setCourant(
              Math.max(
                0,
                Math.min(
                  photos.length - 1,
                  Math.round(evenement.nativeEvent.contentOffset.x / width)
                )
              )
            )
          }
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <View style={[styles.page, { width }]}>
              <Image source={{ uri: item.url }} style={styles.image} resizeMode="contain" />
            </View>
          )}
        />

        {/* Les flèches : à la souris (réception d'hôtel, ordinateur), on ne
            balaie pas — on clique. Chacune ne s'affiche que s'il reste une
            photo de son côté. */}
        {photos.length > 1 && courant > 0 && (
          <Pressable
            onPress={() => aller(courant - 1)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.fleche, styles.flecheGauche, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="chevron-back" size={30} color="#FFFFFF" />
          </Pressable>
        )}
        {photos.length > 1 && courant < photos.length - 1 && (
          <Pressable
            onPress={() => aller(courant + 1)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.fleche, styles.flecheDroite, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="chevron-forward" size={30} color="#FFFFFF" />
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = stylesReactifs(() => ({
  // La pièce sombre, quelle que soit la peau : les photos y gagnent toutes.
  fond: {
    flex: 1,
    backgroundColor: 'rgba(4, 8, 6, 0.96)',
  },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    paddingTop: 48,
    paddingHorizontal: espaces.l,
    paddingBottom: espaces.s,
  },
  titre: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  compteur: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  page: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fleche: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flecheGauche: { left: espaces.m },
  flecheDroite: { right: espaces.m },
}));
