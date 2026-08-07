// Onglet « Mes trajets » : liste des courses de l'utilisateur.
// Mode hôtel : historique des réservations de l'hôtel (GET /trips?hotelId=),
// avec le nom du client sur chaque carte.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Etoiles } from '@/components/Etoiles';
import { BadgeStatutTrajet, Bouton, EtatVide, TexteErreur } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import {
  champ,
  formaterDateRelative,
  formaterPrix,
  LIBELLES_TYPE_TRAJET,
  type StatutTrajet,
  type Trajet,
  type TypeTrajet,
} from '@/lib/types';

export default function EcranTrajets() {
  const router = useRouter();
  const { session } = useAuth();
  const [trajets, setTrajets] = useState<Trajet[]>([]);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');

  const hotel = session?.hotel ?? null;
  const modeHotel = !!hotel;

  const rafraichir = useCallback(async () => {
    const utilisateur = session?.user;
    if (!utilisateur && !hotel) return;
    setCharge(true);
    setErreur('');
    try {
      const liste = hotel
        ? await api.listerTrajetsHotel(hotel.id)
        : await api.listerTrajets(utilisateur!.id);
      setTrajets(liste);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Chargement impossible. Tirez pour réessayer.');
    } finally {
      setCharge(false);
    }
  }, [session?.user, hotel]);

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
        ListHeaderComponent={erreur ? <TexteErreur>{erreur}</TexteErreur> : null}
        ListEmptyComponent={
          !charge && !erreur ? (
            <EtatVide
              icone="car-outline"
              titre="Aucun trajet pour l'instant"
              message={
                modeHotel
                  ? 'Réservez un premier taxi pour l’un de vos clients !'
                  : 'Votre première course vous attend !'
              }
            >
              <Bouton
                titre="Réserver une course"
                icone="add-circle-outline"
                onPress={() => router.push('/(tabs)/reserver')}
              />
            </EtatVide>
          ) : null
        }
        renderItem={({ item }) => {
          const statut = champ<StatutTrajet>(item, 'status', 'statut');
          const type = champ<TypeTrajet>(item, 'trip_type', 'tripType');
          const nomClient = champ<string>(item, 'client_name', 'clientName');
          const note = champ<number>(item, 'rating');
          return (
            <Pressable
              onPress={() => router.push(`/trip/${item.id}`)}
              style={({ pressed }) => [styles.carte, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.enTete}>
                <Text style={styles.type}>
                  {type ? LIBELLES_TYPE_TRAJET[type] ?? type : 'Course'}
                </Text>
                <BadgeStatutTrajet statut={statut} />
              </View>
              <Text style={styles.itineraire}>
                {champ(item, 'pickup_location', 'pickupLocation') ?? '?'}{'  '}
                <Text style={styles.fleche}>→</Text>{'  '}
                {champ(item, 'dropoff_location', 'dropoffLocation') ?? '?'}
              </Text>
              {modeHotel && !!nomClient && (
                <View style={styles.ligneClient}>
                  <Ionicons name="person-outline" size={14} color={couleurs.texteSecondaire} />
                  <Text style={styles.client}>{nomClient}</Text>
                </View>
              )}
              <View style={styles.pied}>
                <Text style={styles.date}>
                  {formaterDateRelative(
                    champ(item, 'scheduled_at', 'scheduledAt', 'created_at', 'createdAt')
                  )}
                </Text>
                <Text style={styles.prix}>{formaterPrix(item)}</Text>
              </View>
              {statut === 'driver_confirmed' && (
                <View style={styles.rangeeAction}>
                  <View style={styles.boutonPayer}>
                    <Ionicons name="card-outline" size={16} color={couleurs.blanc} />
                    <Text style={styles.textePayer}>Payer maintenant</Text>
                  </View>
                </View>
              )}
              {statut === 'completed' &&
                (note !== undefined ? (
                  <Etoiles note={Number(note)} taille={18} />
                ) : (
                  <View style={styles.ligneClient}>
                    <Ionicons name="star-outline" size={14} color={couleurs.etoile} />
                    <Text style={styles.aNoter}>Touchez pour noter votre course</Text>
                  </View>
                ))}
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
  carte: {
    backgroundColor: couleurs.blanc,
    borderRadius: rayons.carte,
    padding: espaces.l,
    gap: espaces.s,
    ...ombres.carte,
  },
  enTete: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  type: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
    flexShrink: 1,
  },
  itineraire: {
    fontSize: 16,
    fontWeight: '700',
    color: couleurs.encre,
    lineHeight: 22,
  },
  fleche: {
    color: couleurs.primaire,
    fontWeight: '800',
  },
  ligneClient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs,
  },
  client: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
    fontWeight: '600',
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
  rangeeAction: {
    marginTop: espaces.xs,
  },
  boutonPayer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaces.s,
    backgroundColor: couleurs.primaire,
    borderRadius: rayons.bouton,
    paddingVertical: espaces.m,
  },
  textePayer: {
    color: couleurs.blanc,
    fontSize: 14,
    fontWeight: '700',
  },
  aNoter: {
    fontSize: 13,
    color: couleurs.attente,
    fontWeight: '600',
  },
});
