// Onglet « Mes trajets » : liste des courses de l'utilisateur.
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Badge, SousTitre } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { couleurs, espaces, rayons } from '@/lib/theme';
import {
  champ,
  formaterDate,
  formaterPrix,
  LIBELLES_STATUT_TRAJET,
  LIBELLES_TYPE_TRAJET,
  type StatutTrajet,
  type Trajet,
  type TypeTrajet,
} from '@/lib/types';

function tonStatut(statut: StatutTrajet | undefined) {
  switch (statut) {
    case 'completed':
      return 'succes' as const;
    case 'cancelled':
      return 'danger' as const;
    case 'requested':
      return 'attente' as const;
    default:
      return 'primaire' as const;
  }
}

export default function EcranTrajets() {
  const router = useRouter();
  const { session } = useAuth();
  const [trajets, setTrajets] = useState<Trajet[]>([]);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');

  const rafraichir = useCallback(async () => {
    const utilisateur = session?.user;
    if (!utilisateur) return;
    setCharge(true);
    setErreur('');
    try {
      const liste = await api.listerTrajets(utilisateur.id);
      setTrajets(liste);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Chargement impossible.');
    } finally {
      setCharge(false);
    }
  }, [session?.user]);

  useFocusEffect(
    useCallback(() => {
      rafraichir();
    }, [rafraichir])
  );

  return (
    <View style={styles.conteneur}>
      <FlatList
        data={trajets}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.liste}
        refreshControl={
          <RefreshControl refreshing={charge} onRefresh={rafraichir} tintColor={couleurs.primaire} />
        }
        ListEmptyComponent={
          <View style={styles.vide}>
            <SousTitre>
              {erreur || 'Aucun trajet pour le moment. Réservez votre première course !'}
            </SousTitre>
          </View>
        }
        renderItem={({ item }) => {
          const statut = champ<StatutTrajet>(item, 'status', 'statut');
          const type = champ<TypeTrajet>(item, 'trip_type', 'tripType');
          return (
            <Pressable
              onPress={() => router.push(`/trip/${item.id}`)}
              style={({ pressed }) => [styles.carte, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.enTete}>
                <Text style={styles.type}>
                  {type ? LIBELLES_TYPE_TRAJET[type] ?? type : 'Course'}
                </Text>
                <Badge
                  texte={statut ? LIBELLES_STATUT_TRAJET[statut] ?? statut : '—'}
                  ton={tonStatut(statut)}
                />
              </View>
              <Text style={styles.itineraire}>
                {champ(item, 'pickup_location', 'pickupLocation') ?? '?'} →{' '}
                {champ(item, 'dropoff_location', 'dropoffLocation') ?? '?'}
              </Text>
              <View style={styles.pied}>
                <Text style={styles.date}>
                  {formaterDate(champ(item, 'scheduled_at', 'scheduledAt', 'created_at', 'createdAt'))}
                </Text>
                <Text style={styles.prix}>{formaterPrix(item)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: {
    flex: 1,
    backgroundColor: couleurs.sable,
  },
  liste: {
    padding: espaces.l,
    gap: espaces.m,
    flexGrow: 1,
  },
  vide: {
    alignItems: 'center',
    paddingTop: espaces.xl * 2,
  },
  carte: {
    backgroundColor: couleurs.blanc,
    borderRadius: rayons.carte,
    padding: espaces.l,
    gap: espaces.s,
  },
  enTete: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  type: {
    fontSize: 16,
    fontWeight: '700',
    color: couleurs.encre,
    flexShrink: 1,
  },
  itineraire: {
    fontSize: 14,
    color: couleurs.encre,
  },
  pied: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
  },
  prix: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.primaire,
  },
});
