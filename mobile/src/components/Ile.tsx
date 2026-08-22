// ══════════════════════════════════════════════════════════════════════════
// UNGUJA, EN VOLUME.
//
// Ce n'est pas une illustration : c'est un rendu tridimensionnel de l'île,
// construit sur le VRAI trait de côte (frontières administratives de
// Zanzibar réunies, 1 564 km² — l'île en fait 1 666), sur les VRAIES routes
// de l'île (235 km : l'axe du nord vers Nungwi, la B2 vers Chwaka, la
// descente sur Paje, la côte est, la route de Kizimkazi) et sur les
// coordonnées exactes des villes que zanziGo dessert.
//
// Le rendu est fait UNE FOIS, hors de l'application, et livré en image :
// l'application ne calcule rien, n'embarque aucun moteur 3D, et ne dépend
// d'aucun module natif. Le fichier pèse 65 Ko — le prix d'une photo.
//
// La lecture, dans l'ordre : la pierre corallienne dont l'île est faite, le
// lagon puis le platier, les routes gravées en terre cuite, et un piquet à
// chaque ville desservie — le même piquet que les étapes d'une course.
// ══════════════════════════════════════════════════════════════════════════
import React from 'react';
import { Animated, Easing, Image, Text, View } from 'react-native';

import { useT } from '@/lib/i18n';
import { couleurs, espaces, ombres, policeMontant, rayons, stylesReactifs } from '@/lib/theme';
import { nombreVillesDesservies } from '@/lib/types';

/** Proportions du fichier — pour que l'image ne se déforme jamais. */
const RAPPORT = 980 / 1155;

/**
 * LA HAUTEUR DE L'ÎLE, dans le bandeau de « Réserver ».
 *
 * L'écran s'ouvre dix fois par semaine : une île de 300 px y repousserait le
 * formulaire sous la ligne de flottaison. Mais à 104 px elle passait pour une
 * vignette posée là — le vrai relief, les routes gravées, les piquets des
 * villes ne se lisaient plus. 144 px : le trait de côte redevient lisible,
 * et la carte entière tient toujours au-dessus du choix de trajet.
 */
const HAUTEUR = 144;

export function IleDeZanzibar() {
  const { t } = useT();

  // LE POSÉ. L'île arrive légèrement au-dessus de sa place et descend s'y
  // asseoir. Une seule animation, au montage, en pilote natif — c'est ce qui
  // fait la différence entre un objet posé et une image collée.
  const pose = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(pose, {
      toValue: 1,
      duration: 620,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pose]);

  return (
    <View style={styles.carte}>
      <Animated.View
        style={{
          opacity: pose,
          transform: [
            { translateY: pose.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) },
            { scale: pose.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] }) },
          ],
        }}
      >
        <Image
          source={require('../../assets/images/unguja.png')}
          style={styles.image}
          resizeMode="contain"
          accessibilityLabel={t('ile_alt')}
        />
      </Animated.View>
      <View style={styles.textes}>
        <Text style={styles.titre}>{t('ile_titre')}</Text>
        <Text style={styles.legende}>
          {t('ile_legende', { villes: String(nombreVillesDesservies()) })}
        </Text>
      </View>
    </View>
  );
}

const styles = stylesReactifs(() => ({
  // L'île avait beau être un vrai rendu du relief, posée à nu sur le fond
  // elle se lisait comme une vignette d'illustration. Un cadre la déclare :
  // c'est une carte, et c'est ce que zanziGo couvre.
  carte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.carte,
    paddingVertical: espaces.s,
    paddingRight: espaces.m,
    // À gauche, presque rien : l'île touche presque le bord, et c'est ce
    // débord qui lui donne sa place sans allonger le bandeau.
    paddingLeft: espaces.xs,
    marginBottom: espaces.s,
    // Le relief de la peau du moment : c'est lui qui porte le liseré et
    // l'ombre, chaque design ayant les siens (le trait épais du Bento, le
    // halo doux du Lagon). Les redéclarer ici les aurait écrasés.
    ...ombres.carte,
  },
  image: {
    width: HAUTEUR * RAPPORT,
    height: HAUTEUR,
  },
  textes: {
    flex: 1,
    gap: 3,
  },
  titre: {
    fontFamily: policeMontant(),
    fontSize: 22,
    color: couleurs.encre,
  },
  legende: {
    fontSize: 13,
    lineHeight: 18,
    color: couleurs.texteSecondaire,
  },
}));
