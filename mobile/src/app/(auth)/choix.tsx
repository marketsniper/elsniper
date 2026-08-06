// Choix du type de profil après une première connexion.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Ecran, SousTitre, Titre } from '@/components/ui';
import { couleurs, espaces, rayons } from '@/lib/theme';

function CarteChoix({
  icone,
  titre,
  description,
  onPress,
}: {
  icone: React.ComponentProps<typeof Ionicons>['name'];
  titre: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.carte, pressed && { opacity: 0.7 }]}>
      <View style={styles.icone}>
        <Ionicons name={icone} size={28} color={couleurs.primaire} />
      </View>
      <View style={styles.textes}>
        <Text style={styles.titreCarte}>{titre}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color={couleurs.texteSecondaire} />
    </Pressable>
  );
}

export default function EcranChoix() {
  const router = useRouter();
  return (
    <Ecran>
      <Titre>Qui êtes-vous ?</Titre>
      <SousTitre>Choisissez votre profil pour terminer votre inscription.</SousTitre>
      <CarteChoix
        icone="person-outline"
        titre="Je suis client"
        description="Touriste ou résident : réservez des courses et envoyez des colis."
        onPress={() => router.push('/(auth)/client')}
      />
      <CarteChoix
        icone="car-outline"
        titre="Je suis chauffeur"
        description="Rejoignez la flotte zanziGo (candidature via l'équipe)."
        onPress={() => router.push({ pathname: '/(auth)/pro', params: { type: 'chauffeur' } })}
      />
      <CarteChoix
        icone="business-outline"
        titre="Je représente un hôtel"
        description="Envois de colis et navettes pour vos clients (via l'équipe)."
        onPress={() => router.push({ pathname: '/(auth)/pro', params: { type: 'hotel' } })}
      />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  carte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    backgroundColor: couleurs.blanc,
    borderRadius: rayons.carte,
    padding: espaces.l,
  },
  icone: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textes: {
    flex: 1,
    gap: 2,
  },
  titreCarte: {
    fontSize: 16,
    fontWeight: '700',
    color: couleurs.encre,
  },
  description: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
    lineHeight: 18,
  },
});
