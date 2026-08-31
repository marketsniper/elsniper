// VISIONNEUSE DE PHOTOS — les photos d'un véhicule EN GRAND, par-dessus
// l'écran (demande du client, 31/08/2026 : « ouvrir les photos en grand »).
//
// Différente de VisionneuseDocument : ici il n'y a pas UN document à lire
// mais une SÉRIE de photos à feuilleter — on balaie de l'une à l'autre
// (pages pleines largeur), le compteur dit où l'on est, et deux flèches
// servent la souris sur le web. La pièce est volontairement SOMBRE quelle
// que soit la peau : une photo se regarde dans le noir, comme partout.
//
// LE ZOOM : toucher la photo l'agrandit (×2,4) et on se déplace dedans au
// doigt ; un second toucher — ou la loupe de l'en-tête — revient à la vue
// entière. Pas de pincement : la PWA fige l'échelle de la page (viewport),
// et un geste à deux doigts ne traverse pas React Native Web — le toucher,
// lui, marche partout pareil.
//
// LES HAUTEURS SONT EN PIXELS, à dessein : une page en height:'100%' dans
// une FlatList s'effondre à zéro sur le web (le conteneur interne mesure
// auto) — la visionneuse s'ouvrait NOIRE, photos invisibles.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
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

/** L'agrandissement du zoom : assez pour lire un détail, pas de quoi pixelliser. */
const FACTEUR_ZOOM = 2.4;
/** L'en-tête (barre d'état + titre) et la marge basse, en pixels. */
const HAUTEUR_ENTETE = 104;
const MARGE_BASSE = 24;

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
  const { width, height } = useWindowDimensions();
  const [courant, setCourant] = React.useState(0);
  const [zoome, setZoome] = React.useState(false);
  const liste = React.useRef<FlatList<Photo> | null>(null);

  // La zone d'image : tout l'écran moins l'en-tête — en PIXELS (voir en-tête
  // du fichier : les pourcentages s'effondrent dans une FlatList web).
  const hauteurPage = Math.max(200, height - HAUTEUR_ENTETE - MARGE_BASSE);

  // À chaque ouverture, on repart de la photo touchée, en vue entière.
  React.useEffect(() => {
    if (index !== null) {
      setCourant(index);
      setZoome(false);
    }
  }, [index]);

  const aller = (i: number) => {
    const borne = Math.max(0, Math.min(photos.length - 1, i));
    liste.current?.scrollToIndex({ index: borne, animated: true });
    setCourant(borne);
  };

  const photoCourante = photos[Math.max(0, Math.min(photos.length - 1, courant))];

  return (
    <Modal visible={index !== null} transparent animationType="fade" onRequestClose={onFermer}>
      <View style={styles.fond}>
        <View style={styles.entete}>
          {titre ? (
            <Text style={styles.titre} numberOfLines={1}>
              {titre}
            </Text>
          ) : (
            // Sans titre, ce vide pousse compteur et boutons à droite.
            <View style={styles.ressort} />
          )}
          {photos.length > 1 && (
            <Text style={styles.compteur}>
              {courant + 1} / {photos.length}
            </Text>
          )}
          {/* La loupe : le même aller-retour que le toucher sur la photo —
              visible, pour que le zoom ne soit pas un geste à deviner. */}
          <Pressable
            onPress={() => setZoome((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={t('photos_ouvrir')}
            hitSlop={12}
          >
            <Ionicons name={zoome ? 'remove-circle' : 'add-circle'} size={32} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={onFermer}
            accessibilityRole="button"
            accessibilityLabel={t('commun_fermer')}
            hitSlop={12}
          >
            <Ionicons name="close-circle" size={34} color="#FFFFFF" />
          </Pressable>
        </View>

        {zoome && photoCourante ? (
          // LE ZOOM : la photo courante, agrandie, dans un défilement à deux
          // axes (vertical qui porte un horizontal — le duo classique pour se
          // déplacer librement dans une image). Un toucher revient à la vue
          // entière.
          <ScrollView
            style={{ height: hauteurPage }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.contenuZoom}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Pressable onPress={() => setZoome(false)} accessibilityRole="button">
                <Image
                  source={{ uri: photoCourante.url }}
                  style={{ width: width * FACTEUR_ZOOM, height: hauteurPage * FACTEUR_ZOOM }}
                  resizeMode="contain"
                />
              </Pressable>
            </ScrollView>
          </ScrollView>
        ) : (
          <FlatList
            ref={liste}
            data={photos}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={{ height: hauteurPage, flexGrow: 0 }}
            keyExtractor={(photo) => photo.id}
            initialScrollIndex={index ?? 0}
            // Pages pleines largeur : sans cette géométrie déclarée,
            // initialScrollIndex ne sait pas où sauter.
            getItemLayout={(_donnees, i) => ({ length: width, offset: width * i, index: i })}
            // Le compteur suit le doigt — onScroll plutôt que la fin
            // d'inertie, qui ne se déclenche pas toujours sur le web.
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
              <Pressable
                onPress={() => setZoome(true)}
                accessibilityRole="button"
                accessibilityLabel={t('photos_ouvrir')}
                style={[styles.page, { width, height: hauteurPage }]}
              >
                <Image
                  source={{ uri: item.url }}
                  style={{ width, height: hauteurPage }}
                  resizeMode="contain"
                />
              </Pressable>
            )}
          />
        )}

        {/* Les flèches : à la souris (réception d'hôtel, ordinateur), on ne
            balaie pas — on clique. Chacune ne s'affiche que s'il reste une
            photo de son côté, et jamais pendant le zoom. */}
        {!zoome && photos.length > 1 && courant > 0 && (
          <Pressable
            onPress={() => aller(courant - 1)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.fleche, styles.flecheGauche, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="chevron-back" size={30} color="#FFFFFF" />
          </Pressable>
        )}
        {!zoome && photos.length > 1 && courant < photos.length - 1 && (
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
    minHeight: HAUTEUR_ENTETE,
  },
  titre: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  ressort: { flex: 1 },
  compteur: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  contenuZoom: {
    flexGrow: 1,
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
