// Sélecteur maison (aucune dépendance) : champ pressable + Modal avec liste
// scrollable de choix. Style aligné sur le composant Champ.
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useT } from '@/lib/i18n';
import { couleurs, espaces, rayons, tailles } from '@/lib/theme';

export function Selecteur({
  label,
  valeur,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  valeur: string;
  options: string[];
  placeholder?: string;
  onChange: (valeur: string) => void;
}) {
  const { t } = useT();
  const [ouvert, setOuvert] = useState(false);
  const texteVide = placeholder ?? t('commun_choisir');

  return (
    <View style={styles.conteneur}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setOuvert(true)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.champ, pressed && { opacity: 0.7 }]}
      >
        <Text style={valeur ? styles.valeur : styles.placeholder}>
          {valeur || texteVide}
        </Text>
        <Ionicons name="chevron-down" size={18} color={couleurs.texteSecondaire} />
      </Pressable>

      <Modal
        visible={ouvert}
        transparent
        animationType="fade"
        onRequestClose={() => setOuvert(false)}
      >
        <Pressable style={styles.voile} onPress={() => setOuvert(false)}>
          <Pressable style={styles.feuille} onPress={(e) => e.stopPropagation()}>
            <View style={styles.enTeteFeuille}>
              <Text style={styles.titreFeuille}>{label}</Text>
              <Pressable onPress={() => setOuvert(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={couleurs.texteSecondaire} />
              </Pressable>
            </View>
            <ScrollView style={styles.listeChoix} showsVerticalScrollIndicator>
              {options.map((option) => {
                const choisi = option === valeur;
                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      onChange(option);
                      setOuvert(false);
                    }}
                    style={({ pressed }) => [
                      styles.choix,
                      choisi && styles.choixActif,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={[styles.texteChoix, choisi && styles.texteChoixActif]}>
                      {option}
                    </Text>
                    {choisi && (
                      <Ionicons name="checkmark" size={20} color={couleurs.primaire} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: {
    gap: espaces.xs,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  champ: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaces.s,
    backgroundColor: couleurs.blanc,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.bouton,
    paddingHorizontal: espaces.m,
    minHeight: tailles.champ,
  },
  valeur: {
    fontSize: 16,
    color: couleurs.encre,
    flexShrink: 1,
  },
  placeholder: {
    fontSize: 16,
    color: couleurs.texteSecondaire,
    flexShrink: 1,
  },
  voile: {
    flex: 1,
    backgroundColor: couleurs.voile,
    justifyContent: 'flex-end',
  },
  feuille: {
    backgroundColor: couleurs.blanc,
    borderTopLeftRadius: rayons.carte,
    borderTopRightRadius: rayons.carte,
    paddingBottom: espaces.xl,
    maxHeight: '70%',
  },
  enTeteFeuille: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: espaces.l,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
  },
  titreFeuille: {
    fontSize: 16,
    fontWeight: '700',
    color: couleurs.encre,
  },
  listeChoix: {
    paddingHorizontal: espaces.s,
  },
  choix: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
    paddingVertical: espaces.m,
    paddingHorizontal: espaces.m,
    borderRadius: rayons.bouton,
    minHeight: tailles.champ - 4,
  },
  choixActif: {
    backgroundColor: couleurs.primaireClair,
  },
  texteChoix: {
    fontSize: 16,
    color: couleurs.encre,
    flexShrink: 1,
  },
  texteChoixActif: {
    fontWeight: '700',
    color: couleurs.primaireFonce,
  },
});
