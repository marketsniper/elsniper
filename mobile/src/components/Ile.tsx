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
import { Animated, Easing, Image, Text, View, useWindowDimensions } from 'react-native';

import { useT } from '@/lib/i18n';
import { couleurs, espaces, policeMontant, stylesReactifs } from '@/lib/theme';
import { nombreVillesDesservies } from '@/lib/types';

/** Proportions du fichier — pour que l'image ne se déforme jamais. */
const RAPPORT = 980 / 1155;

export function IleDeZanzibar({
  hauteur,
  compact = false,
}: {
  hauteur?: number;
  /**
   * La forme de bandeau, pour les écrans où l'île n'est PAS le sujet.
   * L'écran de réservation s'ouvre dix fois par semaine : une île de 300 px
   * y repousserait le formulaire sous la ligne de flottaison.
   */
  compact?: boolean;
}) {
  const { t } = useT();
  const { width } = useWindowDimensions();
  // L'île occupe une bonne moitié de la largeur, plafonnée : sur une tablette
  // ou un navigateur de bureau, une île de 700 px de haut serait une affiche,
  // pas un en-tête.
  const h = hauteur ?? (compact ? 104 : Math.min(300, Math.max(180, width * 0.72)));

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

  const image = (
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
        style={{ width: h * RAPPORT, height: h }}
        resizeMode="contain"
        accessibilityLabel={t('ile_alt')}
      />
    </Animated.View>
  );

  if (compact) {
    return (
      <View style={styles.bandeau}>
        {image}
        <View style={styles.textesBandeau}>
          <Text style={styles.titreBandeau}>{t('ile_titre')}</Text>
          <Text style={styles.legendeBandeau}>
            {t('ile_legende', { villes: String(nombreVillesDesservies()) })}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.bloc}>
      {image}
      <Text style={styles.titre}>{t('ile_titre')}</Text>
      <Text style={styles.legende}>
        {t('ile_legende', { villes: String(nombreVillesDesservies()) })}
      </Text>
    </View>
  );
}

const styles = stylesReactifs(() => ({
  bloc: {
    alignItems: 'center',
    gap: espaces.xs,
    marginBottom: espaces.m,
  },
  titre: {
    fontFamily: policeMontant(),
    fontSize: 26,
    color: couleurs.encre,
    marginTop: espaces.xs,
  },
  bandeau: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    marginBottom: espaces.s,
  },
  textesBandeau: {
    flex: 1,
    gap: 2,
  },
  titreBandeau: {
    fontFamily: policeMontant(),
    fontSize: 20,
    color: couleurs.encre,
  },
  legendeBandeau: {
    fontSize: 13,
    lineHeight: 18,
    color: couleurs.texteSecondaire,
  },
  legende: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: couleurs.texteSecondaire,
    paddingHorizontal: espaces.l,
  },
}));
