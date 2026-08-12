// Onglet « Mes trajets » : liste des courses de l'utilisateur.
// Mode hôtel : historique des réservations de l'hôtel (GET /trips?hotelId=),
// avec le nom du client sur chaque carte.
// « Faire le ménage » : masque les courses terminées/annulées antérieures au
// coup de balai (local à l'appareil — rien n'est supprimé chez zanziGo).
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Etoiles } from '@/components/Etoiles';
import { FondPlage } from '@/components/FondPlage';
import { BadgeStatutTrajet, Bouton, EtatVide, TexteErreur } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formaterDateRelativeI18n, libelleTypeTrajet, useT } from '@/lib/i18n';
import { estBalaye, lireCoupDeBalai, passerCoupDeBalai } from '@/lib/menageLocal';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import {
  champ,
  formaterPrix,
  trajetExpire,
  type StatutTrajet,
  type Trajet,
  type TypeTrajet,
} from '@/lib/types';

const STATUTS_FINIS: StatutTrajet[] = ['completed', 'cancelled'];

export default function EcranTrajets() {
  const router = useRouter();
  const { session } = useAuth();
  const { t } = useT();
  const [trajets, setTrajets] = useState<Trajet[]>([]);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');
  const [balai, setBalai] = useState(0);

  const hotel = session?.hotel ?? null;
  const modeHotel = !!hotel;
  const proprietaireId = hotel?.id ?? session?.user?.id ?? null;

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
      if (proprietaireId) setBalai(await lireCoupDeBalai('trajets', proprietaireId));
    } catch {
      setErreur(t('trajets_erreur'));
    } finally {
      setCharge(false);
    }
  }, [session?.user, hotel, proprietaireId, t]);

  useFocusEffect(
    useCallback(() => {
      rafraichir();
    }, [rafraichir])
  );

  // Courses affichées : les actives toujours ; les terminées, annulées ou
  // EXPIRÉES (jamais payées, heure passée) seulement si elles sont
  // postérieures au dernier coup de balai.
  const estNettoyable = (trajet: Trajet) =>
    STATUTS_FINIS.includes(champ<StatutTrajet>(trajet, 'status', 'statut') ?? 'requested') ||
    trajetExpire(trajet);
  const visibles = trajets.filter(
    (trajet) =>
      !estNettoyable(trajet) || !estBalaye(champ(trajet, 'created_at', 'createdAt'), balai)
  );
  const nbNettoyables = visibles.filter(estNettoyable).length;

  const faireLeMenage = () => {
    if (!proprietaireId) return;
    Alert.alert(t('menage_titre'), t('menage_texte'), [
      { text: t('commun_annuler'), style: 'cancel' },
      {
        text: t('menage_confirmer'),
        style: 'destructive',
        onPress: async () => setBalai(await passerCoupDeBalai('trajets', proprietaireId)),
      },
    ]);
  };

  return (
    <FondPlage fond="palmiers" voile="clair">
      <FlatList
        data={visibles}
        keyExtractor={(trajet) => trajet.id}
        contentContainerStyle={styles.liste}
        refreshControl={
          <RefreshControl refreshing={charge} onRefresh={rafraichir} tintColor={couleurs.primaire} />
        }
        ListHeaderComponent={erreur ? <TexteErreur>{erreur}</TexteErreur> : null}
        ListFooterComponent={
          nbNettoyables > 0 ? (
            <Bouton
              titre={`${t('menage_bouton')} (${nbNettoyables})`}
              icone="trash-outline"
              variante="secondaire"
              onPress={faireLeMenage}
              style={styles.boutonMenage}
            />
          ) : null
        }
        ListEmptyComponent={
          !charge && !erreur ? (
            <EtatVide
              icone="car-outline"
              titre={t('trajets_vide_titre')}
              message={modeHotel ? t('trajets_vide_texte_hotel') : t('trajets_vide_texte')}
            >
              <Bouton
                titre={t('trajets_reserver_bouton')}
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
                  {type ? libelleTypeTrajet(type, t) : t('trajets_course_defaut')}
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
                  {formaterDateRelativeI18n(
                    champ(item, 'scheduled_at', 'scheduledAt', 'created_at', 'createdAt'),
                    t
                  )}
                </Text>
                <Text style={styles.prix}>{formaterPrix(item)}</Text>
              </View>
              {statut === 'driver_confirmed' && (
                <View style={styles.rangeeAction}>
                  <View style={styles.boutonPayer}>
                    <Ionicons name="card-outline" size={16} color={couleurs.surPrimaire} />
                    <Text style={styles.textePayer}>{t('trajets_payer')}</Text>
                  </View>
                </View>
              )}
              {statut === 'completed' &&
                (note !== undefined ? (
                  <Etoiles note={Number(note)} taille={18} />
                ) : (
                  <View style={styles.ligneClient}>
                    <Ionicons name="star-outline" size={14} color={couleurs.etoile} />
                    <Text style={styles.aNoter}>{t('trajets_noter')}</Text>
                  </View>
                ))}
            </Pressable>
          );
        }}
      />
    </FondPlage>
  );
}

const styles = StyleSheet.create({
  liste: {
    padding: espaces.l,
    gap: espaces.m,
    flexGrow: 1,
  },
  carte: {
    backgroundColor: couleurs.carteTranslucide,
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
    color: couleurs.surPrimaire,
    fontSize: 14,
    fontWeight: '700',
  },
  aNoter: {
    fontSize: 13,
    color: couleurs.attente,
    fontWeight: '600',
  },
  boutonMenage: {
    marginTop: espaces.m,
  },
});
