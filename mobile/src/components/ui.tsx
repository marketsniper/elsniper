// Petits composants UI partagés, style « Zanzibar » (turquoise / sable / blanc).
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { HeaderHeightContext } from '@react-navigation/elements';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EstranDeZanzibar, FondPlage, LagonDeVerre, type NomFond } from '@/components/FondPlage';
import { LANGUES, useT, libelleStatutColis, libelleStatutTrajet, type CleChaine } from '@/lib/i18n';
import { PEAUX_AU_CHOIX, usePreferencePeau } from '@/lib/preferencePeau';
import {
  apercuPeau,
  couleurs,
  couleursStatutColis,
  couleursStatutTrajet,
  espaces,
  ombres,
  rayons,
  stylesReactifs,
  tailles,
  usePeau,
  useSecteurSolaire,
  type NomPeau,
} from '@/lib/theme';
import type { StatutColis, StatutTrajet } from '@/lib/types';

type NomIonicons = React.ComponentProps<typeof Ionicons>['name'];

// LE VRAI FLOU, sur téléphone. `expo-blur` est un module NATIF : les binaires
// installés avant son arrivée ne l'ont pas. La mise à jour à distance pousse
// le JavaScript d'expo-blur, jamais son natif — il faut donc DEMANDER au
// binaire s'il sait le rendre, avant de s'en servir.
//
// LE PIÈGE, ET IL A MORDU. La première version de ce garde était un
// try/catch autour du require. Il n'a jamais rien gardé : `expo-blur` ne
// passe pas par `requireNativeModule`, qui lève quand le natif manque, mais
// par `requireNativeViewManager`, qui ne lève JAMAIS — il se contente d'un
// avertissement, et seulement en développement (voir
// expo-modules-core/src/NativeViewManagerAdapter.native.tsx). Le require
// réussissait donc, et chaque Carte de chaque écran montait une vue native
// que le binaire ne connaissait pas.
//
// La bonne sonde est `requireOptionalNativeModule`, qui renvoie `null` au
// lieu de lever. « ExpoBlurView » est le nom déclaré côté natif
// (expo-blur/android/.../BlurModule.kt : `Name("ExpoBlurView")`).
type ComposantFlou = React.ComponentType<{
  intensity?: number;
  tint?: string;
  experimentalBlurMethod?: string;
  style?: StyleProp<ViewStyle>;
}>;
let VueFloue: ComposantFlou | null = null;
if (Platform.OS !== 'web' && requireOptionalNativeModule('ExpoBlurView')) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  VueFloue = require('expo-blur').BlurView as ComposantFlou;
}

/**
 * Conteneur d'écran : photo de plage en fond (voile blanc de lisibilité),
 * zone sûre, clavier géré, défilement optionnel, tirer-pour-rafraîchir
 * optionnel (onRefresh).
 */
export function Ecran({
  children,
  defiler = true,
  fond = 'lagon',
  onRefresh,
}: {
  children: React.ReactNode;
  defiler?: boolean;
  fond?: NomFond;
  onRefresh?: () => Promise<unknown> | void;
}) {
  // L'HEURE DU JOUR. Tous les écrans passent par ici : c'est le seul point
  // d'abonnement nécessaire pour que la direction des ombres suive le soleil
  // de Zanzibar. Un abonnement plus haut n'aurait rien redessiné — les
  // feuilles de style sont lues à la volée, un écran déjà rendu ne repart pas
  // parce qu'un contexte a changé au-dessus de lui.
  useSecteurSolaire();

  const [rafraichit, setRafraichit] = React.useState(false);
  const rafraichir = async () => {
    if (!onRefresh) return;
    setRafraichit(true);
    try {
      await onRefresh();
    } finally {
      setRafraichit(false);
    }
  };
  // Un compteur neuf par écran : la première carte de CHAQUE écran arrive en
  // premier, même si l'écran précédent en affichait douze.
  const rang = React.useRef(0);
  const compteur = React.useMemo(() => ({ suivant: () => rang.current++ }), []);

  // L'en-tête flotte par-dessus l'écran (headerTransparent) : le contenu
  // s'écarte de sa hauteur. Le contexte est absent quand l'en-tête est caché
  // — zéro, et la zone sûre du haut reprend le relais.
  const hauteurEntete = React.useContext(HeaderHeightContext) ?? 0;

  // « L'entrant se rassemble » : l'écran arrive un souffle trop grand et
  // légèrement effacé, puis se pose. Les cartes remontent ensuite en décalé.
  // Le lagon, lui, ne bouge pas : il est peint sous la navigation.
  const arrivee = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(arrivee, { toValue: 1, duration: 380, useNativeDriver: true }).start();
  }, [arrivee]);

  return (
    <RangDesCartes.Provider value={compteur}>
    <Animated.View
      style={{
        flex: 1,
        opacity: arrivee,
        transform: [{ scale: arrivee.interpolate({ inputRange: [0, 1], outputRange: [1.045, 1] }) }],
      }}
    >
    <FondPlage fond={fond} voile="clair">
      <SafeAreaView
        style={[styles.ecran, hauteurEntete > 0 && { paddingTop: hauteurEntete }]}
        edges={hauteurEntete > 0 ? ['left', 'right'] : ['top', 'left', 'right']}
      >
        <KeyboardAvoidingView
          style={styles.flexible}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {defiler ? (
            <ScrollView
              contentContainerStyle={styles.contenuDefilant}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              refreshControl={
                onRefresh ? (
                  <RefreshControl
                    refreshing={rafraichit}
                    onRefresh={rafraichir}
                    tintColor={couleurs.primaire}
                  />
                ) : undefined
              }
            >
              {children}
            </ScrollView>
          ) : (
            <View style={styles.contenuFixe}>{children}</View>
          )}
        </KeyboardAvoidingView>
        {/* Touche rafraîchir visible : le tirer-pour-rafraîchir n'est pas
            connu de tout le monde — un bouton flottant est plus simple. */}
        {onRefresh && <BoutonRafraichir onPress={rafraichir} enCours={rafraichit} />}
      </SafeAreaView>
    </FondPlage>
    </Animated.View>
    </RangDesCartes.Provider>
  );
}

/**
 * Bouton flottant « rafraîchir » (rond, en bas à droite) — pour les écrans
 * clients : une simple touche recharge la page, sans geste à connaître.
 */
export function BoutonRafraichir({
  onPress,
  enCours = false,
}: {
  onPress: () => void;
  enCours?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={enCours}
      accessibilityRole="button"
      accessibilityLabel="Rafraîchir"
      style={({ pressed }) => [styles.boutonRafraichir, pressed && { opacity: 0.8 }]}
    >
      {enCours ? (
        <ActivityIndicator size="small" color={couleurs.surPrimaire} />
      ) : (
        <Ionicons name="refresh" size={22} color={couleurs.surPrimaire} />
      )}
    </Pressable>
  );
}

/** Pills « FR · EN · SW » de changement de langue. */
export function SelecteurLangue({ compact = false }: { compact?: boolean }) {
  const { langue, changerLangue } = useT();
  return (
    <View style={[styles.rangeeLangues, compact && styles.rangeeLanguesCompacte]}>
      {LANGUES.map(({ code, libelle }) => {
        const active = code === langue;
        return (
          <Pressable
            key={code}
            onPress={() => changerLangue(code)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.pillLangue,
              active && styles.pillLangueActive,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[styles.textePillLangue, active && styles.textePillLangueActif]}>
              {libelle}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Le nom et le « quand l'utiliser » de chaque peau. Une TABLE, pas un
// ternaire : le sélecteur était écrit pour exactement deux peaux, et une
// troisième se serait affichée sous le nom de la première.
const LIBELLES_PEAU: Record<NomPeau, { nom: CleChaine; quand: CleChaine }> = {
  verre: { nom: 'peau_lagon', quand: 'peau_lagon_quand' },
  bento: { nom: 'peau_bento', quand: 'peau_bento_quand' },
  nuit: { nom: 'peau_nuit', quand: 'peau_nuit_quand' },
  estran: { nom: 'peau_estran', quand: 'peau_estran_quand' },
};

/**
 * LE CHOIX DU DESIGN.
 *
 * Zanzibar, midi, sur la plage : un écran sombre devient un miroir. Le même
 * écran sous une paillote au coucher du soleil est le plus reposant qui
 * soit. Plutôt que de trancher à la place du client, on lui montre les deux
 * et on le laisse choisir selon la lumière qu'il a autour de lui.
 *
 * L'aperçu n'est pas une pastille de couleur : c'est un écran miniature —
 * fond, panneau, deux lignes de texte, bouton — dessiné dans les VRAIES
 * couleurs de la peau. On choisit ce qu'on voit.
 */
export function SelecteurPeau({ compact = false }: { compact?: boolean }) {
  const { peau, choisir } = usePreferencePeau();
  const { t } = useT();
  return (
    <View style={styles.rangeePeaux}>
      {PEAUX_AU_CHOIX.map((nom) => {
        const actif = peau === nom;
        const vue = apercuPeau(nom);
        const mots = LIBELLES_PEAU[nom];
        return (
          <Pressable
            key={nom}
            onPress={() => choisir(nom)}
            accessibilityRole="radio"
            accessibilityState={{ selected: actif }}
            accessibilityLabel={t(mots.nom)}
            style={({ pressed }) => [
              styles.casePeau,
              actif && styles.casePeauActive,
              pressed && { opacity: 0.75 },
            ]}
          >
            <View
              style={[
                styles.apercuPeau,
                compact && styles.apercuPeauCompact,
                { backgroundColor: vue.fond },
              ]}
            >
              {nom === 'verre' && <LagonDeVerre fond={vue.fond} />}
              {nom === 'estran' && <EstranDeZanzibar fond={vue.fond} />}
              <View
                style={[
                  styles.apercuCarte,
                  { backgroundColor: vue.carte, borderColor: vue.bordure },
                ]}
              >
                <View
                  style={[styles.apercuBarre, { backgroundColor: vue.texte, width: '75%' }]}
                />
                <View
                  style={[styles.apercuBarre, { backgroundColor: vue.secondaire, width: '50%' }]}
                />
              </View>
              <View style={[styles.apercuBouton, { backgroundColor: vue.accent }]} />
            </View>
            <View style={styles.enTetePeau}>
              <Text style={styles.nomPeau}>{t(mots.nom)}</Text>
              {actif && (
                <Ionicons name="checkmark-circle" size={18} color={couleurs.primaire} />
              )}
            </View>
            {!compact && <Text style={styles.quandPeau}>{t(mots.quand)}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Logotype texte « zanziGo » : zanzi en prune, Go en corail (Coucher de soleil). */
export function LogoZanziGo({
  taille = 40,
  surFonce = false,
}: {
  taille?: number;
  surFonce?: boolean;
}) {
  // « Go » doit rester DISTINCT du reste du mot sur toutes les peaux. Sur le
  // Lagon, la couleur d'action est le verre le plus clair — la même valeur que
  // l'encre : le mot serait sorti d'un seul ton. On bascule alors sur la
  // couleur d'action foncée, qui elle tranche toujours.
  const accent = couleurs.primaire === couleurs.encre ? couleurs.primaireFonce : couleurs.primaire;
  return (
    <Text style={[styles.logo, { fontSize: taille }]} accessibilityRole="header">
      <Text style={{ color: surFonce ? couleurs.blanc : couleurs.encre }}>zanzi</Text>
      <Text style={{ color: accent }}>Go</Text>
    </Text>
  );
}

/**
 * LE RANG D'UNE CARTE DANS SON ÉCRAN.
 *
 * « Les cartes remontent en décalé » : pour décaler, il faut savoir qui est
 * premier. Chaque écran ouvre un compteur, chaque carte y prend son numéro à
 * la volée — aucun écran n'a à numéroter ses cartes à la main.
 */
const RangDesCartes = React.createContext<{ suivant: () => number } | null>(null);

function useRangDeCarte(): number {
  const compteur = React.useContext(RangDesCartes);
  const rang = React.useRef<number | null>(null);
  if (rang.current === null) rang.current = compteur ? compteur.suivant() : 0;
  return rang.current;
}

/** Panneau de verre arrondi — il remonte en place à l'ouverture de l'écran. */
export function Carte({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const rang = useRangDeCarte();
  const entree = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(entree, {
      toValue: 1,
      duration: 380,
      // Au-delà de la sixième, on ne décale plus : sur une longue liste, la
      // dernière carte serait arrivée trois secondes après la première.
      delay: Math.min(rang, 6) * 60,
      useNativeDriver: true,
    }).start();
  }, [entree, rang]);

  // Le calque de flou vit DANS la carte, découpé à son arrondi. Le mettre
  // sur la carte elle-même exigerait overflow:hidden, qui tue l'ombre iOS.
  const verre = usePeau() === 'verre' && VueFloue;

  return (
    <Animated.View
      style={[
        styles.carte,
        {
          opacity: entree,
          transform: [
            { translateY: entree.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
          ],
        },
        style,
      ]}
    >
      {/* L'OMBRE DE CONTACT — la petite ombre dense juste sous l'objet. La
          carte porte déjà l'ombre longue et douce qui la décolle du fond ;
          celle-ci la POSE. React Native n'accepte qu'une ombre par vue : il
          faut donc deux couches pour qu'une carte ait du poids. */}
      {!!ombres.contact && (
        <View style={styles.calqueContact} pointerEvents="none" />
      )}
      {verre && VueFloue && (
        <View style={styles.calqueFlou} pointerEvents="none">
          <VueFloue
            intensity={26}
            tint="dark"
            // Sans cette méthode, Android ne floute pas : il pose un simple
            // voile — autant garder le nôtre.
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}
      {children}
    </Animated.View>
  );
}

/**
 * SECTION REPLIÉE.
 *
 * L'écran de réservation posait douze questions d'un coup ; on en pose trois,
 * et on range le reste ici. Ce qui est rare ne doit pas encombrer ce qui est
 * fréquent — mais doit rester à une touche.
 */
export function Depliant({
  titre,
  resume,
  children,
}: {
  titre: string;
  /** Ce qui a été choisi, visible sans ouvrir. */
  resume?: string;
  children: React.ReactNode;
}) {
  const [ouvert, setOuvert] = React.useState(false);
  return (
    <View style={styles.depliant}>
      <Pressable
        onPress={() => setOuvert((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: ouvert }}
        style={({ pressed }) => [styles.depliantTete, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.depliantTextes}>
          <Text style={styles.depliantTitre}>{titre}</Text>
          {!!resume && <Text style={styles.depliantResume}>{resume}</Text>}
        </View>
        <Ionicons
          name={ouvert ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={couleurs.texteSecondaire}
        />
      </Pressable>
      {ouvert && <View style={styles.depliantCorps}>{children}</View>}
    </View>
  );
}

export function Titre({ children }: { children: React.ReactNode }) {
  return <Text style={styles.titre}>{children}</Text>;
}

export function SousTitre({
  children,
  centre = false,
}: {
  children: React.ReactNode;
  centre?: boolean;
}) {
  return <Text style={[styles.sousTitre, centre && styles.texteCentre]}>{children}</Text>;
}

/** Bouton principal / secondaire / danger, avec état de chargement et icône optionnelle. */
export function Bouton({
  titre,
  onPress,
  variante = 'primaire',
  icone,
  charge = false,
  desactive = false,
  style,
}: {
  titre: string;
  onPress: () => void;
  variante?: 'primaire' | 'secondaire' | 'danger';
  icone?: NomIonicons;
  charge?: boolean;
  desactive?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inactif = desactive || charge;
  // Sur turquoise néon, un texte marine sombre lit mieux que du blanc ;
  // les boutons danger (rouge) gardent leur texte blanc.
  const couleurContenu =
    variante === 'secondaire'
      ? couleurs.primaire
      : variante === 'danger'
        ? couleurs.blanc
        : couleurs.surPrimaire;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactif}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.bouton,
        variante === 'primaire' && styles.boutonPrimaire,
        variante === 'secondaire' && styles.boutonSecondaire,
        variante === 'danger' && styles.boutonDanger,
        (pressed || inactif) && { opacity: 0.6 },
        style,
      ]}
    >
      {charge ? (
        <ActivityIndicator color={couleurContenu} />
      ) : (
        <View style={styles.contenuBouton}>
          {icone && <Ionicons name={icone} size={20} color={couleurContenu} />}
          <Text style={[styles.texteBouton, { color: couleurContenu }]}>{titre}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Champ de saisie avec étiquette (hauteur tactile généreuse). */
export function Champ({
  label,
  ...props
}: { label: string } & TextInputProps) {
  return (
    <View style={styles.champConteneur}>
      <Text style={styles.champLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={couleurs.texteSecondaire}
        {...props}
        style={[styles.champSaisie, props.multiline && styles.champMultiligne, props.style]}
      />
    </View>
  );
}

/** Pastille de statut colorée. */
export function Badge({
  texte,
  ton = 'neutre',
}: {
  texte: string;
  ton?: 'neutre' | 'succes' | 'attente' | 'danger' | 'primaire';
}) {
  const fonds = {
    neutre: couleurs.bordure,
    succes: couleurs.succesFond,
    attente: couleurs.attenteFond,
    danger: couleurs.dangerBordure,
    primaire: couleurs.primaireClair,
  } as const;
  const textes = {
    neutre: couleurs.encre,
    succes: couleurs.succes,
    attente: couleurs.attente,
    danger: couleurs.dangerFonce,
    primaire: couleurs.primaireFonce,
  } as const;
  return (
    <View style={[styles.badge, { backgroundColor: fonds[ton] }]}>
      <Text style={[styles.texteBadge, { color: textes[ton] }]}>{texte}</Text>
    </View>
  );
}

/**
 * Pastille de statut d'un trajet — couleurs officielles :
 * Demandée orange doux, Chauffeur confirmé orange, Payée turquoise clair,
 * En cours turquoise, Terminée vert, Annulée gris.
 */
export function BadgeStatutTrajet({ statut }: { statut: StatutTrajet | undefined }) {
  const { t } = useT();
  const ton = statut ? couleursStatutTrajet[statut] : undefined;
  return (
    <View
      style={[styles.badge, { backgroundColor: ton?.fond ?? couleurs.bordure }]}
    >
      <Text style={[styles.texteBadge, { color: ton?.texte ?? couleurs.encre }]}>
        {libelleStatutTrajet(statut, t)}
      </Text>
    </View>
  );
}

/** Pastille de statut d'un colis (Créé → Payé → Ramassé → Livré). */
export function BadgeStatutColis({ statut }: { statut: StatutColis | undefined }) {
  const { t } = useT();
  const ton = statut ? couleursStatutColis[statut] : undefined;
  return (
    <View
      style={[styles.badge, { backgroundColor: ton?.fond ?? couleurs.bordure }]}
    >
      <Text style={[styles.texteBadge, { color: ton?.texte ?? couleurs.encre }]}>
        {libelleStatutColis(statut, t)}
      </Text>
    </View>
  );
}

/** Ligne « label : valeur » pour les récapitulatifs. */
export function LigneInfo({ label, valeur }: { label: string; valeur: string }) {
  return (
    <View style={styles.ligneInfo}>
      <Text style={styles.ligneInfoLabel}>{label}</Text>
      <Text style={styles.ligneInfoValeur}>{valeur}</Text>
    </View>
  );
}

/** Encart d'erreur doux : fond rouge très clair, texte rouge foncé. */
export function TexteErreur({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <View style={styles.encartErreur}>
      <Ionicons name="alert-circle" size={20} color={couleurs.dangerFonce} />
      <Text style={styles.texteErreur}>{children}</Text>
    </View>
  );
}

/** Encart d'information doux (pédagogie, confirmations, attentes). */
export function EncartInfo({
  children,
  icone = 'information-circle',
  ton = 'info',
}: {
  children: React.ReactNode;
  icone?: NomIonicons;
  // `feuVert` = vert PLEIN, la bonne nouvelle qu'on ne peut pas rater
  // (« payée, tu peux y aller »). `succes` reste le vert doux, discret.
  ton?: 'info' | 'attente' | 'succes' | 'feuVert';
}) {
  const fonds = {
    info: couleurs.primaireClair,
    attente: couleurs.attenteFond,
    succes: couleurs.succesFond,
    feuVert: couleurs.vertFeu,
  } as const;
  const textes = {
    info: couleurs.primaireFonce,
    attente: couleurs.attente,
    succes: couleurs.succes,
    feuVert: couleurs.surVertFeu,
  } as const;
  return (
    <View style={[styles.encartInfo, { backgroundColor: fonds[ton] }]}>
      <Ionicons name={icone} size={20} color={textes[ton]} />
      <Text style={[styles.texteEncartInfo, { color: textes[ton] }]}>{children}</Text>
    </View>
  );
}

/** État vide chaleureux : icône dans une bulle, titre, message, action optionnelle. */
export function EtatVide({
  icone,
  titre,
  message,
  children,
}: {
  icone: NomIonicons;
  titre: string;
  message?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.etatVide}>
      <View style={styles.bulleVide}>
        <Ionicons name={icone} size={34} color={couleurs.primaire} />
      </View>
      <Text style={styles.titreVide}>{titre}</Text>
      {!!message && <Text style={[styles.sousTitre, styles.texteCentre]}>{message}</Text>}
      {children}
    </View>
  );
}

/** Indicateur de chargement centré plein écran, avec message optionnel. */
export function ChargementCentre({ message }: { message?: string }) {
  return (
    <View style={styles.chargement}>
      <ActivityIndicator size="large" color={couleurs.primaire} />
      {!!message && <Text style={styles.messageChargement}>{message}</Text>}
    </View>
  );
}

const styles = stylesReactifs(() => ({
  ecran: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  flexible: {
    flex: 1,
  },
  boutonRafraichir: {
    position: 'absolute',
    right: espaces.l,
    bottom: espaces.l,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: couleurs.primaire,
    alignItems: 'center',
    justifyContent: 'center',
    ...ombres.carte,
  },
  // ─── LE CHOIX DU DESIGN ────────────────────────────────────────────────
  // `flexWrap` : la rangée était dimensionnée pour exactement deux cases.
  // `minWidth` garde une case lisible quand il y en a trois.
  rangeePeaux: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaces.m,
  },
  casePeau: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 130,
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.carte,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espaces.s,
    gap: 6,
  },
  // La case choisie porte un liseré de la couleur d'action : on voit
  // laquelle est en service sans lire la coche.
  casePeauActive: {
    borderWidth: 2,
    borderColor: couleurs.primaire,
  },
  // L'aperçu : un écran miniature, aux proportions d'un téléphone.
  apercuPeau: {
    height: 96,
    borderRadius: 12,
    overflow: 'hidden',
    padding: 10,
    justifyContent: 'space-between',
  },
  apercuPeauCompact: {
    height: 64,
    padding: 7,
  },
  apercuCarte: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    gap: 5,
  },
  apercuBarre: {
    height: 4,
    borderRadius: 2,
    // Les barres évoquent du texte : à pleine opacité elles feraient des
    // traits de peinture, pas des lignes lues de loin.
    opacity: 0.85,
  },
  apercuBouton: {
    height: 14,
    borderRadius: 7,
  },
  enTetePeau: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaces.xs,
  },
  nomPeau: {
    fontSize: 14,
    fontWeight: '700',
    color: couleurs.encre,
  },
  quandPeau: {
    fontSize: 12,
    lineHeight: 16,
    color: couleurs.texteSecondaire,
  },
  rangeeLangues: {
    flexDirection: 'row',
    gap: espaces.xs,
    alignSelf: 'flex-end',
  },
  rangeeLanguesCompacte: {
    alignSelf: 'center',
  },
  pillLangue: {
    borderRadius: rayons.pastille,
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.s,
    backgroundColor: couleurs.carteTranslucide,
    // Cerné comme tout le reste — sans l'ombre portée : cinq pastilles
    // posées sur leur ombre feraient un tapis de relief pour rien.
    borderWidth: 2,
    borderColor: couleurs.encre,
    minWidth: 44,
    alignItems: 'center',
  },
  pillLangueActive: {
    backgroundColor: couleurs.primaire,
  },
  textePillLangue: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.texteSecondaire,
  },
  textePillLangueActif: {
    color: couleurs.surPrimaire,
  },
  contenuDefilant: {
    padding: espaces.l,
    paddingBottom: espaces.xl * 2,
    gap: espaces.m,
  },
  contenuFixe: {
    flex: 1,
    padding: espaces.l,
    gap: espaces.m,
  },
  logo: {
    fontWeight: '800' as TextStyle['fontWeight'],
    letterSpacing: -1,
  },
  carte: {
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.carte,
    padding: espaces.l,
    gap: espaces.s,
    ...ombres.carte,
  },
  // Le flou, découpé à l'arrondi de la carte. `overflow` est ici et pas sur
  // la carte : masquer la carte masquerait aussi son ombre (iOS).
  calqueContact: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: rayons.carte,
    backgroundColor: couleurs.carteTranslucide,
    ...(ombres.contact ?? {}),
  },
  calqueFlou: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: rayons.carte,
    overflow: 'hidden',
  },
  depliant: {
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.carte,
    ...ombres.carte,
  },
  depliantTete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    paddingHorizontal: espaces.l,
    paddingVertical: espaces.m,
    minHeight: tailles.champ,
  },
  depliantTextes: {
    flex: 1,
    gap: 2,
  },
  depliantTitre: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
  },
  depliantResume: {
    fontSize: 12.5,
    color: couleurs.texteSecondaire,
  },
  depliantCorps: {
    gap: espaces.m,
    paddingHorizontal: espaces.l,
    paddingBottom: espaces.l,
  },
  titre: {
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: couleurs.encre,
  },
  sousTitre: {
    fontSize: 15,
    color: couleurs.texteSecondaire,
    lineHeight: 21,
  },
  texteCentre: {
    textAlign: 'center',
  },
  bouton: {
    borderRadius: rayons.bouton,
    paddingVertical: 14,
    paddingHorizontal: espaces.l,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: tailles.bouton,
  },
  boutonPrimaire: {
    ...ombres.carte,
    backgroundColor: couleurs.primaire,
  },
  boutonSecondaire: {
    ...ombres.carte,
    backgroundColor: couleurs.surface,
    borderColor: couleurs.primaire,
  },
  boutonDanger: {
    ...ombres.carte,
    backgroundColor: couleurs.danger,
  },
  contenuBouton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
  },
  texteBouton: {
    fontSize: 16,
    fontWeight: '700',
  },
  champConteneur: {
    gap: espaces.xs,
  },
  champLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  champSaisie: {
    ...ombres.carte,
    backgroundColor: couleurs.surface,
    borderRadius: rayons.bouton,
    paddingHorizontal: espaces.m,
    paddingVertical: 14,
    fontSize: 16,
    color: couleurs.encre,
    minHeight: tailles.champ,
  },
  champMultiligne: {
    minHeight: tailles.champ * 1.5,
    textAlignVertical: 'top',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: rayons.pastille,
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.xs,
  },
  texteBadge: {
    fontSize: 12,
    fontWeight: '700',
  },
  ligneInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: espaces.m,
    paddingVertical: 2,
  },
  ligneInfoLabel: {
    color: couleurs.texteSecondaire,
    fontSize: 14,
  },
  ligneInfoValeur: {
    color: couleurs.encre,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  encartErreur: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espaces.s,
    backgroundColor: couleurs.dangerFond,
    borderWidth: 1,
    borderColor: couleurs.dangerBordure,
    borderRadius: rayons.bouton,
    padding: espaces.m,
  },
  texteErreur: {
    flex: 1,
    color: couleurs.dangerFonce,
    fontSize: 14,
    lineHeight: 20,
  },
  encartInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espaces.s,
    borderRadius: rayons.bouton,
    padding: espaces.m,
  },
  texteEncartInfo: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  etatVide: {
    alignItems: 'center',
    gap: espaces.m,
    paddingVertical: espaces.xxl,
    paddingHorizontal: espaces.l,
  },
  bulleVide: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titreVide: {
    fontSize: 18,
    fontWeight: '700',
    color: couleurs.encre,
    textAlign: 'center',
  },
  chargement: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaces.m,
    backgroundColor: couleurs.sable,
  },
  messageChargement: {
    fontSize: 15,
    color: couleurs.texteSecondaire,
  },
}));
