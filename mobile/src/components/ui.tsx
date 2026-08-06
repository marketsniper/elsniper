// Petits composants UI partagés, style « Zanzibar » (turquoise / sable / blanc).
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { couleurs, espaces, rayons } from '@/lib/theme';

/** Conteneur d'écran : fond sable + zone sûre + défilement optionnel. */
export function Ecran({
  children,
  defiler = true,
}: {
  children: React.ReactNode;
  defiler?: boolean;
}) {
  return (
    <SafeAreaView style={styles.ecran} edges={['top', 'left', 'right']}>
      {defiler ? (
        <ScrollView
          contentContainerStyle={styles.contenuDefilant}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.contenuFixe}>{children}</View>
      )}
    </SafeAreaView>
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

export function SousTitre({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sousTitre}>{children}</Text>;
}

/** Bouton principal / secondaire / danger, avec état de chargement. */
export function Bouton({
  titre,
  onPress,
  variante = 'primaire',
  charge = false,
  desactive = false,
  style,
}: {
  titre: string;
  onPress: () => void;
  variante?: 'primaire' | 'secondaire' | 'danger';
  charge?: boolean;
  desactive?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inactif = desactive || charge;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactif}
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
        <ActivityIndicator color={variante === 'secondaire' ? couleurs.primaire : couleurs.blanc} />
      ) : (
        <Text
          style={[
            styles.texteBouton,
            variante === 'secondaire' && { color: couleurs.primaire },
          ]}
        >
          {titre}
        </Text>
      )}
    </Pressable>
  );
}

/** Champ de saisie avec étiquette. */
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
        style={[styles.champSaisie, props.style]}
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
    succes: '#D1FAE5',
    attente: '#FEF3C7',
    danger: '#FEE2E2',
    primaire: couleurs.primaireClair,
  } as const;
  const textes = {
    neutre: couleurs.encre,
    succes: couleurs.succes,
    attente: couleurs.attente,
    danger: couleurs.danger,
    primaire: couleurs.primaireFonce,
  } as const;
  return (
    <View style={[styles.badge, { backgroundColor: fonds[ton] }]}>
      <Text style={[styles.texteBadge, { color: textes[ton] }]}>{texte}</Text>
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

/** Message d'erreur inline. */
export function TexteErreur({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <Text style={styles.texteErreur}>{children}</Text>;
}

/** Indicateur de chargement centré plein écran. */
export function ChargementCentre() {
  return (
    <View style={styles.chargement}>
      <ActivityIndicator size="large" color={couleurs.primaire} />
    </View>
  );
}

const styles = StyleSheet.create({
  ecran: {
    flex: 1,
    backgroundColor: couleurs.sable,
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
  carte: {
    backgroundColor: couleurs.blanc,
    borderRadius: rayons.carte,
    padding: espaces.l,
    gap: espaces.s,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
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
  bouton: {
    borderRadius: rayons.bouton,
    paddingVertical: 14,
    paddingHorizontal: espaces.l,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  boutonPrimaire: {
    backgroundColor: couleurs.primaire,
  },
  boutonSecondaire: {
    backgroundColor: couleurs.blanc,
    borderWidth: 1.5,
    borderColor: couleurs.primaire,
  },
  boutonDanger: {
    backgroundColor: couleurs.danger,
  },
  texteBouton: {
    color: couleurs.blanc,
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
    backgroundColor: couleurs.blanc,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.bouton,
    paddingHorizontal: espaces.m,
    paddingVertical: 12,
    fontSize: 16,
    color: couleurs.encre,
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
  texteErreur: {
    color: couleurs.danger,
    fontSize: 14,
  },
  chargement: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: couleurs.sable,
  },
});
