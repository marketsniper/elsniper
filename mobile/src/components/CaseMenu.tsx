// LES MENUS À CASES — chauffeur et équipe.
//
// Deux écrans s'ouvrent sur une grille de grosses cibles : « Mes courses »
// côté chauffeur, « Vue d'ensemble » côté équipe. Elles étaient statiques :
// on ne savait pas qu'on avait touché avant que l'écran change, et rien ne
// distinguait la case qui ATTEND quelque chose de celle qui dort.
//
// Ici, les cases répondent :
//  · elles entrent en cascade, une par une, quand l'écran s'ouvre ;
//  · elles s'enfoncent sous le doigt, le temps de l'appui ;
//  · le compteur d'une case qui appelle une action fait UN battement à
//    l'arrivée — un seul, pas une pulsation permanente : on veut attirer
//    l'œil, pas installer un gyrophare dans la poche du chauffeur.
//
// Tout est coupé si le téléphone demande moins d'animations.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { AccessibilityInfo, Animated, Pressable, Text, View } from 'react-native';

import { couleurs, espaces, ombres, rayons, stylesReactifs } from '@/lib/theme';

type NomIonicons = React.ComponentProps<typeof Ionicons>['name'];

/** Le réglage d'accessibilité « réduire les animations » du téléphone. */
function useMouvementReduit(): boolean {
  const [reduit, setReduit] = React.useState(false);
  React.useEffect(() => {
    let vivant = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => vivant && setReduit(v))
      .catch(() => {});
    const abonnement = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduit);
    return () => {
      vivant = false;
      abonnement?.remove();
    };
  }, []);
  return reduit;
}

export function GrilleMenu({ children }: { children: React.ReactNode }) {
  return <View style={styles.grille}>{children}</View>;
}

export function CaseMenu({
  icone,
  label,
  n,
  fleche = false,
  action = false,
  index = 0,
  compacte = false,
  onPress,
}: {
  icone: NomIonicons;
  label: string;
  /** Le compteur affiché. Ignoré quand `fleche` est vrai. */
  n?: number;
  /** Case qui mène ailleurs : une flèche remplace le compteur. */
  fleche?: boolean;
  /** La case appelle une action quand son compteur n'est pas à zéro. */
  action?: boolean;
  /** Rang dans la grille : décale l'entrée en cascade. */
  index?: number;
  /** Version resserrée (tableau de bord de l'équipe, dix cases à l'écran). */
  compacte?: boolean;
  onPress: () => void;
}) {
  const reduit = useMouvementReduit();
  const appelle = action && (n ?? 0) > 0;

  const entree = React.useRef(new Animated.Value(0)).current;
  const pression = React.useRef(new Animated.Value(1)).current;
  const battement = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (reduit) {
      entree.setValue(1);
      return;
    }
    Animated.timing(entree, {
      toValue: 1,
      duration: 340,
      delay: Math.min(index, 9) * 55,
      useNativeDriver: true,
    }).start();
  }, [entree, index, reduit]);

  React.useEffect(() => {
    if (reduit || !appelle) return;
    const beat = Animated.sequence([
      Animated.delay(Math.min(index, 9) * 55 + 420),
      Animated.spring(battement, { toValue: 1.22, useNativeDriver: true, speed: 20, bounciness: 14 }),
      Animated.spring(battement, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }),
    ]);
    beat.start();
    return () => beat.stop();
  }, [appelle, battement, index, reduit]);

  const enfoncer = (vers: number) =>
    Animated.spring(pression, { toValue: vers, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

  return (
    <Animated.View
      style={[
        styles.enveloppe,
        {
          opacity: entree,
          transform: [
            { translateY: entree.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
            { scale: pression },
          ],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => enfoncer(0.96)}
        onPressOut={() => enfoncer(1)}
        accessibilityRole="button"
        accessibilityLabel={fleche ? label : `${label}, ${n ?? 0}`}
        style={[styles.case, compacte && styles.caseCompacte]}
      >
        <View style={[styles.bulle, compacte && styles.bulleCompacte, appelle && styles.bulleAppel]}>
          <Ionicons
            name={icone}
            size={compacte ? 26 : 30}
            color={appelle ? couleurs.surPrimaire : couleurs.primaire}
          />
        </View>
        <Text style={[styles.label, compacte && styles.labelCompact]}>{label}</Text>
        <Animated.View
          style={[
            styles.pastille,
            appelle && styles.pastilleAppel,
            { transform: [{ scale: battement }] },
          ]}
        >
          {fleche ? (
            <Ionicons name="arrow-forward" size={14} color={couleurs.primaireFonce} />
          ) : (
            <Text style={[styles.textePastille, appelle && styles.textePastilleAppel]}>
              {n ?? 0}
            </Text>
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * UNE FAMILLE DE RUBRIQUES — le tableau de bord de l'équipe, regroupé.
 *
 * Quatorze cases à plat, c'était sept rangées à faire défiler en cherchant
 * des yeux : les paiements côtoyaient les hôtels, les candidatures les
 * courses. Ici les rubriques qui parlent de la même chose vivent dans la
 * MÊME carte — les courses ensemble, l'argent ensemble — et la carte porte
 * en tête la somme de ce qui attend une action : l'équipe sait où aller
 * avant d'avoir lu une seule ligne.
 *
 * Quand rien n'attend, la famille l'affiche aussi : une coche verte. Le
 * calme se lit au premier regard, pas en vérifiant quatorze compteurs.
 */
export function FamilleMenu({
  emoji,
  titre,
  actions = 0,
  aTraiter,
  index = 0,
  children,
}: {
  emoji: string;
  titre: string;
  /** La somme des compteurs qui appellent une action, toutes rubriques. */
  actions?: number;
  /** Le libellé du badge, déjà traduit (« 3 à traiter »). */
  aTraiter?: string;
  index?: number;
  children: React.ReactNode;
}) {
  const reduit = useMouvementReduit();
  const entree = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (reduit) {
      entree.setValue(1);
      return;
    }
    Animated.timing(entree, {
      toValue: 1,
      duration: 340,
      delay: Math.min(index, 6) * 80,
      useNativeDriver: true,
    }).start();
  }, [entree, index, reduit]);

  return (
    <Animated.View
      style={{
        opacity: entree,
        transform: [
          { translateY: entree.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
        ],
      }}
    >
      <View style={styles.familleCarte}>
        <View style={styles.familleEnTete}>
          <Text style={styles.familleEmoji}>{emoji}</Text>
          <Text style={styles.familleTitre}>{titre}</Text>
          {actions > 0 ? (
            <View style={styles.familleBadge}>
              <Text style={styles.familleBadgeTexte}>{aTraiter ?? String(actions)}</Text>
            </View>
          ) : (
            <Ionicons name="checkmark-circle" size={20} color={couleurs.succes} />
          )}
        </View>
        {children}
      </View>
    </Animated.View>
  );
}

/**
 * Une rubrique DANS sa famille : une ligne dense — icône, nom, compteur,
 * chevron. La densité est le but : quatre familles remplacent sept rangées
 * de cases, tout le tableau tient dans un écran.
 */
export function LigneMenu({
  icone,
  label,
  n,
  action = false,
  onPress,
}: {
  icone: NomIonicons;
  label: string;
  n?: number;
  action?: boolean;
  onPress: () => void;
}) {
  const appelle = action && (n ?? 0) > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${n ?? 0}`}
      style={({ pressed }) => [styles.ligne, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.ligneBulle, appelle && styles.bulleAppel]}>
        <Ionicons
          name={icone}
          size={17}
          color={appelle ? couleurs.surPrimaire : couleurs.primaire}
        />
      </View>
      <Text style={styles.ligneLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.pastille, appelle && styles.pastilleAppel]}>
        <Text style={[styles.textePastille, appelle && styles.textePastilleAppel]}>{n ?? 0}</Text>
      </View>
      <Ionicons name="chevron-forward" size={15} color={couleurs.texteSecondaire} />
    </Pressable>
  );
}

const styles = stylesReactifs(() => ({
  grille: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaces.m,
  },
  // L'enveloppe porte l'animation ; la case porte le dessin. Les séparer
  // évite que l'ombre portée saute à chaque image.
  enveloppe: {
    flexBasis: '45%',
    flexGrow: 1,
  },
  case: {
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.carte,
    paddingVertical: espaces.xl,
    paddingHorizontal: espaces.m,
    alignItems: 'center',
    gap: espaces.s,
    ...ombres.carte,
  },
  caseCompacte: {
    paddingVertical: espaces.l,
  },
  bulle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulleCompacte: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  bulleAppel: {
    backgroundColor: couleurs.primaire,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
    textAlign: 'center',
  },
  labelCompact: {
    fontSize: 13,
  },
  pastille: {
    minWidth: 32,
    alignItems: 'center',
    backgroundColor: couleurs.primaireClair,
    borderRadius: rayons.pastille,
    paddingHorizontal: espaces.s,
    paddingVertical: 3,
  },
  pastilleAppel: {
    backgroundColor: couleurs.primaire,
  },
  textePastille: {
    fontSize: 15,
    fontWeight: '800',
    color: couleurs.primaireFonce,
  },
  textePastilleAppel: {
    color: couleurs.surPrimaire,
  },
  familleCarte: {
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.carte,
    paddingVertical: espaces.s,
    paddingHorizontal: espaces.m,
    marginBottom: espaces.m,
    ...ombres.carte,
  },
  familleEnTete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    paddingVertical: espaces.s,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
    marginBottom: espaces.xs,
  },
  familleEmoji: {
    fontSize: 20,
  },
  familleTitre: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: couleurs.encre,
  },
  familleBadge: {
    backgroundColor: couleurs.primaire,
    borderRadius: rayons.pastille,
    paddingHorizontal: espaces.s,
    paddingVertical: 3,
  },
  familleBadgeTexte: {
    fontSize: 12,
    fontWeight: '800',
    color: couleurs.surPrimaire,
  },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    paddingVertical: 9,
  },
  ligneBulle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ligneLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: couleurs.encre,
  },
}));
