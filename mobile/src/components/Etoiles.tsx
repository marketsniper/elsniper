// Notation 1 à 5 étoiles (affichage et saisie).
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

import { couleurs, espaces, stylesReactifs } from '@/lib/theme';

export function Etoiles({
  note,
  onChange,
  taille = 32,
}: {
  note: number;
  onChange?: (note: number) => void;
  taille?: number;
}) {
  return (
    <View style={styles.rangee}>
      {[1, 2, 3, 4, 5].map((valeur) => (
        <Pressable
          key={valeur}
          onPress={onChange ? () => onChange(valeur) : undefined}
          disabled={!onChange}
          hitSlop={6}
        >
          <Ionicons
            name={valeur <= note ? 'star' : 'star-outline'}
            size={taille}
            color={valeur <= note ? couleurs.etoile : couleurs.bordure}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = stylesReactifs(() => ({
  rangee: {
    flexDirection: 'row',
    gap: espaces.s,
  },
}));
