// Sélecteur maison (aucune dépendance) : champ pressable + Modal avec une
// liste défilante de choix.
//
// Chaque ligne est une CARTE, pas un simple texte : le nom du lieu, et
// dessous ce qu'on veut savoir avant de choisir — la côte, la distance en
// kilomètres, le temps de route. C'est la liste du prototype « Lagon de
// verre » : on fait défiler, on lit, on touche.
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { useT } from '@/lib/i18n';
import { couleurs, espaces, ombres, rayons, stylesReactifs, tailles } from '@/lib/theme';

export function Selecteur({
  label,
  valeur,
  options,
  placeholder,
  libelleOption,
  detailOption,
  onChange,
}: {
  label: string;
  valeur: string;
  options: string[];
  placeholder?: string;
  /**
   * Texte affiché pour une option, quand il diffère de la valeur envoyée.
   * Sert aux options qui ne sont pas des lieux — « Ma position », par
   * exemple, dont le choix déclenche le GPS.
   */
  libelleOption?: (option: string) => string;
  /**
   * Deuxième ligne d'une option : zone, distance, durée… Renvoie null quand
   * il n'y a rien à dire (« Ma position » avant que le GPS ait répondu).
   */
  detailOption?: (option: string) => string | null;
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
                const detail = detailOption?.(option) ?? null;
                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      onChange(option);
                      setOuvert(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: choisi }}
                    style={({ pressed }) => [
                      styles.choix,
                      choisi && styles.choixActif,
                      pressed && styles.choixEnfonce,
                    ]}
                  >
                    <View style={styles.texteschoix}>
                      <Text style={[styles.texteChoix, choisi && styles.texteChoixActif]}>
                        {libelleOption ? libelleOption(option) : option}
                      </Text>
                      {!!detail && <Text style={styles.detailChoix}>{detail}</Text>}
                    </View>
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

const styles = stylesReactifs(() => ({
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
    ...ombres.carte,
    backgroundColor: couleurs.surface,
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
    // Opaque, volontairement : la liste recouvre l'écran, elle ne flotte pas
    // dessus. Deux couches de verre l'une sur l'autre ne se lisent plus.
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
    paddingHorizontal: espaces.m,
  },
  choix: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
    marginTop: espaces.s,
    paddingVertical: espaces.m,
    paddingHorizontal: espaces.l,
    borderRadius: rayons.bouton,
    minHeight: tailles.champ,
    ...ombres.carte,
    backgroundColor: couleurs.carteTranslucide,
  },
  choixActif: {
    backgroundColor: couleurs.primaireClair,
    borderColor: couleurs.primaire,
  },
  // L'appui s'enfonce au lieu de pâlir : sur du verre, la transparence en
  // moins ne se voit pas.
  choixEnfonce: {
    transform: [{ scale: 0.98 }],
  },
  texteschoix: {
    flexShrink: 1,
    gap: 2,
  },
  texteChoix: {
    fontSize: 16,
    fontWeight: '600',
    color: couleurs.encre,
  },
  texteChoixActif: {
    color: couleurs.primaireFonce,
  },
  detailChoix: {
    fontSize: 12.5,
    color: couleurs.texteSecondaire,
  },
}));
