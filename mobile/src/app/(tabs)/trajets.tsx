// Onglet « Mes trajets » : liste des courses de l'utilisateur.
// Mode hôtel : historique des réservations de l'hôtel (GET /trips?hotelId=),
// avec le nom du client sur chaque carte.
// « Faire le ménage » : masque les courses terminées/annulées antérieures au
// coup de balai (local à l'appareil — rien n'est supprimé chez zanziGo).
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Etoiles } from '@/components/Etoiles';
import { FondPlage } from '@/components/FondPlage';
import { BadgeStatutTrajet, Bouton, BoutonRafraichir, EtatVide, TexteErreur } from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formaterDateRelativeI18n, libelleTypeTrajet, useT } from '@/lib/i18n';
import { estBalaye, lireCoupDeBalai, passerCoupDeBalai } from '@/lib/menageLocal';
import { useRafraichissementAuto } from '@/lib/rafraichissementAuto';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import {
  champ,
  formaterMontant,
  formaterPrix,
  trajetExpire,
  type ReservationPlace,
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
  // Places de taxi partagé réservées (annulables jusqu'à 24 h avant le départ).
  const [places, setPlaces] = useState<ReservationPlace[]>([]);
  const [annulationEnCours, setAnnulationEnCours] = useState<string | null>(null);
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
      // Places de taxi partagé (silencieux : la section reste vide en cas d'échec).
      api.mesReservationsPlaces().then(setPlaces).catch(() => {});
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

  // La page se met à jour toute seule : chauffeur confirmé, paiement
  // validé, place annulée… le client n'a rien à toucher.
  useRafraichissementAuto(rafraichir);

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

  // Places à venir, non annulées — les autres n'ont plus rien à faire ici.
  const placesVisibles = places.filter(
    (place) => !place.cancelled && new Date(place.departure_at).getTime() > Date.now()
  );

  // Annulation d'une place : le dialogue précise le remboursement (100 % à
  // +48 h du départ, 50 % entre 24 h et 48 h) — même barème que le serveur.
  const annulerPlace = (place: ReservationPlace) => {
    const message =
      place.paid && place.refund_rate
        ? t('place_annuler_confirm_rembours', {
            montant: formaterMontant(
              Math.round(place.amount * place.refund_rate * 100) / 100,
              place.currency
            ),
            taux: String(place.refund_rate * 100),
          })
        : t('place_annuler_confirm');
    Alert.alert(t('place_annuler'), message, [
      { text: t('commun_confirmer_non'), style: 'cancel' },
      {
        text: t('commun_confirmer_oui'),
        style: 'destructive',
        onPress: async () => {
          setAnnulationEnCours(place.id);
          setErreur('');
          try {
            const resultat = await api.annulerReservationPlace(place.id);
            if (resultat.refund) {
              Alert.alert(
                t('trip_annulee_titre'),
                t('place_annulee_rembours', {
                  montant: formaterMontant(resultat.refund.amount, resultat.refund.currency),
                })
              );
            }
            // L'équipe est prévenue automatiquement par le serveur (e-mail).
            await rafraichir();
          } catch (e) {
            setErreur(e instanceof ErreurApi ? e.message : t('commun_annulation_impossible'));
          } finally {
            setAnnulationEnCours(null);
          }
        },
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
        ListHeaderComponent={
          <>
            {erreur ? <TexteErreur>{erreur}</TexteErreur> : null}
            {placesVisibles.length > 0 && (
              <View style={styles.blocPlaces}>
                <Text style={styles.titrePlaces}>🚌 {t('places_titre')}</Text>
                {placesVisibles.map((place) => (
                  <View key={place.id} style={styles.carte}>
                    <Text style={styles.itineraire}>
                      {place.origin}{'  '}
                      <Text style={styles.fleche}>→</Text>{'  '}
                      {place.destination}
                    </Text>
                    <View style={styles.pied}>
                      <Text style={styles.date}>
                        {formaterDateRelativeI18n(place.departure_at, t)}
                      </Text>
                      <Text style={styles.prix}>
                        {formaterMontant(place.amount, place.currency)}
                      </Text>
                    </View>
                    <View style={styles.lignePlace}>
                      <Text style={styles.detailPlace}>
                        {t('places_detail', { n: place.seats })}
                      </Text>
                      <Text
                        style={[
                          styles.badgePlace,
                          place.paid ? styles.badgePlacePayee : styles.badgePlaceAttente,
                        ]}
                      >
                        {place.paid ? `✔ ${t('places_payee')}` : `⏳ ${t('places_a_payer')}`}
                      </Text>
                    </View>
                    {place.cancellable ? (
                      <Bouton
                        titre={t('place_annuler')}
                        icone="close-circle-outline"
                        variante="secondaire"
                        onPress={() => annulerPlace(place)}
                        charge={annulationEnCours === place.id}
                      />
                    ) : place.paid ? (
                      <Text style={styles.notePlace}>{t('place_trop_tard')}</Text>
                    ) : null}
                  </View>
                ))}
                <Text style={styles.reglePlaces}>{t('resa_regle_annulation')}</Text>
                {/* Contact WhatsApp : uniquement EN CAS DE PROBLÈME — les
                    notifications de routine partent automatiquement. */}
                <Pressable
                  onPress={() => Linking.openURL('https://wa.me/255666241749')}
                  accessibilityRole="button"
                  style={({ pressed }) => pressed && { opacity: 0.7 }}
                >
                  <Text style={styles.lienContact}>💬 {t('places_contact')}</Text>
                </Pressable>
              </View>
            )}
          </>
        }
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
      <BoutonRafraichir onPress={rafraichir} enCours={charge} />
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
  blocPlaces: {
    gap: espaces.m,
    marginBottom: espaces.m,
  },
  titrePlaces: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
  },
  lignePlace: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: espaces.s,
  },
  detailPlace: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
    fontWeight: '600',
  },
  badgePlace: {
    fontSize: 12.5,
    fontWeight: '700',
    paddingHorizontal: espaces.s,
    paddingVertical: 3,
    borderRadius: rayons.pastille,
    overflow: 'hidden',
  },
  // Teinte NEUTRE : le vert est réservé aux paiements par crédit hôtel.
  badgePlacePayee: {
    color: couleurs.encre,
    backgroundColor: couleurs.bordure,
  },
  badgePlaceAttente: {
    color: couleurs.attente,
    backgroundColor: couleurs.attenteFond,
  },
  notePlace: {
    fontSize: 12.5,
    color: couleurs.texteSecondaire,
    lineHeight: 18,
  },
  reglePlaces: {
    fontSize: 12.5,
    color: couleurs.texteSecondaire,
    lineHeight: 18,
  },
  lienContact: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.primaireFonce,
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
