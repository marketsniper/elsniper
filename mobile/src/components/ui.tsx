// Petits composants UI partagés, style « Zanzibar » (turquoise / sable / blanc).
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { FondPlage, type NomFond } from '@/components/FondPlage';
import { LANGUES, useT, libelleStatutColis, libelleStatutTrajet } from '@/lib/i18n';
import {
  couleurs,
  couleursStatutColis,
  couleursStatutTrajet,
  espaces,
  ombres,
  rayons,
  tailles,
} from '@/lib/theme';
import type { StatutColis, StatutTrajet } from '@/lib/types';

type NomIonicons = React.ComponentProps<typeof Ionicons>['name'];

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
  return (
    <FondPlage fond={fond} voile="clair">
      <SafeAreaView style={styles.ecran} edges={['top', 'left', 'right']}>
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

/** Logotype texte « zanziGo » : zanzi en prune, Go en corail (Coucher de soleil). */
export function LogoZanziGo({
  taille = 40,
  surFonce = false,
}: {
  taille?: number;
  surFonce?: boolean;
}) {
  return (
    <Text style={[styles.logo, { fontSize: taille }]} accessibilityRole="header">
      <Text style={{ color: surFonce ? couleurs.blanc : couleurs.encre }}>zanzi</Text>
      <Text style={{ color: couleurs.primaire }}>Go</Text>
    </Text>
  );
}

/** Carte blanche arrondie. */
export function Carte({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.carte, style]}>{children}</View>;
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
  ton?: 'info' | 'attente' | 'succes';
}) {
  const fonds = {
    info: couleurs.primaireClair,
    attente: couleurs.attenteFond,
    succes: couleurs.succesFond,
  } as const;
  const textes = {
    info: couleurs.primaireFonce,
    attente: couleurs.attente,
    succes: couleurs.succes,
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

const styles = StyleSheet.create({
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
    borderWidth: 1,
    borderColor: couleurs.bordure,
    minWidth: 44,
    alignItems: 'center',
  },
  pillLangueActive: {
    backgroundColor: couleurs.primaire,
    borderColor: couleurs.primaire,
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
  titre: {
    fontSize: 24,
    fontWeight: '700',
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
    backgroundColor: couleurs.primaire,
  },
  boutonSecondaire: {
    backgroundColor: couleurs.surface,
    borderWidth: 1.5,
    borderColor: couleurs.primaire,
  },
  boutonDanger: {
    backgroundColor: couleurs.danger,
  },
  contenuBouton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
  },
  texteBouton: {
    fontSize: 16,
    fontWeight: '600',
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
    backgroundColor: couleurs.surface,
    borderWidth: 1,
    borderColor: couleurs.bordure,
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
});
