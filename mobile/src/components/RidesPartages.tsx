// Section « Trajets partagés à venir » : trajets ouverts postés par les
// chauffeurs (GET /rides). Réservation de place(s) DANS L'APP : choix du
// nombre de places (− / +), POST /rides/:id/book décompte automatiquement
// les places sur l'annonce du chauffeur, puis WhatsApp s'ouvre avec la
// notification pré-remplie pour l'équipe.
// Devise affichée : le serveur envoie price_per_seat_usd aux profils USD
// et price_per_seat (TZS) aux locaux/chauffeurs — on affiche le champ présent.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Selecteur } from '@/components/Selecteur';
import { api, ErreurApi } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import { champ, DESTINATIONS_RIDES, formaterDate, formaterMontant, type Ride } from '@/lib/types';

export function RidesPartages() {
  const { t } = useT();
  const [rides, setRides] = useState<Ride[]>([]);
  const [charge, setCharge] = useState(false);
  const [chargeInitiale, setChargeInitiale] = useState(true);
  const toutesDestinations = t('rides_toutes');
  const [filtreDestination, setFiltreDestination] = useState('');
  const [destinations, setDestinations] = useState<string[]>(DESTINATIONS_RIDES);
  // Nombre de places choisi par trajet (défaut 1) et réservation en cours.
  const [placesChoisies, setPlacesChoisies] = useState<Record<string, number>>({});
  const [reservationEnCours, setReservationEnCours] = useState<string | null>(null);
  const [messageOk, setMessageOk] = useState('');
  const [erreur, setErreur] = useState('');

  const reserver = async (ride: Ride, places: number) => {
    setReservationEnCours(ride.id);
    setErreur('');
    setMessageOk('');
    try {
      const reponse = await api.reserverPlacesRide(ride.id, places);
      setMessageOk(t('rides_reservation_ok', { n: places }));
      setPlacesChoisies((prev) => ({ ...prev, [ride.id]: 1 }));
      await rafraichir();
      // Notification WhatsApp pré-remplie vers l'équipe.
      const lien = champ<string>(reponse, 'whatsapp_link', 'whatsappLink');
      if (lien) await Linking.openURL(lien);
    } catch (e) {
      if (e instanceof ErreurApi && e.code === 'not_enough_seats') {
        setErreur(t('rides_erreur_places'));
        await rafraichir();
      } else if (e instanceof ErreurApi && e.code === 'ride_closed') {
        setErreur(t('rides_erreur_ferme'));
        await rafraichir();
      } else {
        setErreur(e instanceof ErreurApi ? e.message : t('rides_erreur_reservation'));
      }
    } finally {
      setReservationEnCours(null);
    }
  };

  const rafraichir = useCallback(async () => {
    setCharge(true);
    try {
      setRides(await api.listerRides());
    } catch {
      // silencieux : la section affiche simplement l'état vide
    } finally {
      setCharge(false);
      setChargeInitiale(false);
    }
    try {
      const lieux = await api.lieuxRides();
      if (lieux.destinations.length > 0) setDestinations(lieux.destinations);
    } catch {
      // silencieux : repli sur la liste locale
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      rafraichir();
    }, [rafraichir])
  );

  const filtreActif = filtreDestination !== '' && filtreDestination !== toutesDestinations;
  const ridesFiltres = filtreActif
    ? rides.filter((ride) => champ<string>(ride, 'destination') === filtreDestination)
    : rides;

  return (
    <View style={styles.section}>
      <Text style={styles.titreSection}>{t('rides_titre')}</Text>
      <Text style={styles.sousTitreSection}>{t('rides_soustitre')}</Text>

      {rides.length > 0 && (
        <Selecteur
          label={t('rides_filtre')}
          valeur={filtreActif ? filtreDestination : toutesDestinations}
          options={[toutesDestinations, ...destinations]}
          onChange={setFiltreDestination}
        />
      )}

      {!!messageOk && (
        <View style={styles.encartOk}>
          <Ionicons name="checkmark-circle" size={18} color={couleurs.succes} />
          <Text style={styles.texteOk}>{messageOk}</Text>
        </View>
      )}
      {!!erreur && (
        <View style={styles.encartErreur}>
          <Ionicons name="alert-circle" size={18} color={couleurs.danger} />
          <Text style={styles.texteErreur}>{erreur}</Text>
        </View>
      )}

      {chargeInitiale && charge && (
        <ActivityIndicator color={couleurs.primaire} style={styles.chargement} />
      )}

      {!charge && !chargeInitiale && rides.length === 0 && (
        <View style={styles.vide}>
          <Ionicons name="people-outline" size={22} color={couleurs.texteSecondaire} />
          <Text style={styles.texteVide}>{t('rides_vide')}</Text>
        </View>
      )}
      {!charge && !chargeInitiale && rides.length > 0 && ridesFiltres.length === 0 && (
        <View style={styles.vide}>
          <Ionicons name="people-outline" size={22} color={couleurs.texteSecondaire} />
          <Text style={styles.texteVide}>
            {t('rides_vide_destination', { destination: filtreDestination })}
          </Text>
        </View>
      )}

      {ridesFiltres.map((ride) => {
        const placesRestantes = Number(champ(ride, 'seats_available', 'seatsAvailable') ?? 0);
        // Devise selon le champ présent : USD prioritaire s'il est envoyé.
        const prixUsd = champ<number | string>(ride, 'price_per_seat_usd', 'pricePerSeatUsd');
        const prixTzs = champ<number | string>(ride, 'price_per_seat', 'pricePerSeat');
        const prixPlace = prixUsd !== undefined ? prixUsd : prixTzs;
        const devise = prixUsd !== undefined ? 'USD' : champ<string>(ride, 'currency') ?? 'TZS';
        const nomChauffeur = champ<string>(ride, 'driver_name', 'driverName');
        const vehicule = champ<string>(ride, 'vehicle_model', 'vehicleModel');
        const noteBrute = champ<number | string>(ride, 'driver_rating', 'driverRating');
        const note =
          noteBrute !== undefined && Number.isFinite(Number(noteBrute))
            ? Number(noteBrute).toFixed(1)
            : null;
        const places = Math.min(placesChoisies[ride.id] ?? 1, Math.max(placesRestantes, 1));
        const enCours = reservationEnCours === ride.id;
        return (
          <View key={ride.id} style={styles.carte}>
            <Text style={styles.itineraire}>
              {champ(ride, 'origin', 'origine') ?? '?'}{'  '}
              <Text style={styles.fleche}>→</Text>{'  '}
              {champ(ride, 'destination') ?? '?'}
            </Text>
            <View style={styles.ligneDetails}>
              <View style={styles.detail}>
                <Ionicons name="time-outline" size={14} color={couleurs.texteSecondaire} />
                <Text style={styles.texteDetail}>
                  {formaterDate(champ(ride, 'departure_at', 'departureAt'))}
                </Text>
              </View>
              <View style={styles.detail}>
                <Ionicons name="people-outline" size={14} color={couleurs.texteSecondaire} />
                <Text style={styles.texteDetail}>
                  {t(placesRestantes > 1 ? 'rides_places_restantes' : 'rides_place_restante', {
                    n: placesRestantes,
                  })}
                </Text>
              </View>
            </View>
            <View style={styles.ligneDetails}>
              <View style={styles.detail}>
                <Ionicons name="person-outline" size={14} color={couleurs.texteSecondaire} />
                <Text style={styles.texteDetail}>
                  {nomChauffeur ?? t('rides_chauffeur_defaut')}
                  {vehicule ? ` · ${vehicule}` : ''}
                </Text>
              </View>
              {note !== null && (
                <View style={styles.detail}>
                  <Ionicons name="star" size={14} color={couleurs.etoile} />
                  <Text style={styles.texteDetail}>{note}</Text>
                </View>
              )}
            </View>
            <View style={styles.piedCarte}>
              <Text style={styles.prix}>
                {prixPlace !== undefined
                  ? `${formaterMontant(prixPlace, devise)} ${t('rides_par_place')}`
                  : '—'}
              </Text>
              <View style={styles.zoneReservation}>
                <View style={styles.compteur}>
                  <Pressable
                    onPress={() =>
                      setPlacesChoisies((prev) => ({ ...prev, [ride.id]: Math.max(1, places - 1) }))
                    }
                    hitSlop={8}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.boutonCompteur, pressed && { opacity: 0.6 }]}
                  >
                    <Ionicons name="remove" size={16} color={couleurs.primaireFonce} />
                  </Pressable>
                  <Text style={styles.nbPlaces}>{places}</Text>
                  <Pressable
                    onPress={() =>
                      setPlacesChoisies((prev) => ({
                        ...prev,
                        [ride.id]: Math.min(placesRestantes, places + 1),
                      }))
                    }
                    hitSlop={8}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.boutonCompteur, pressed && { opacity: 0.6 }]}
                  >
                    <Ionicons name="add" size={16} color={couleurs.primaireFonce} />
                  </Pressable>
                </View>
                <Pressable
                  onPress={() => reserver(ride, places)}
                  disabled={enCours || placesRestantes < 1}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.boutonReserver,
                    (pressed || enCours) && { opacity: 0.7 },
                  ]}
                >
                  {enCours ? (
                    <ActivityIndicator size="small" color={couleurs.blanc} />
                  ) : (
                    <Ionicons name="checkmark-circle-outline" size={16} color={couleurs.blanc} />
                  )}
                  <Text style={styles.texteReserver}>{t('rides_reserver')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: espaces.m,
  },
  titreSection: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
    marginTop: espaces.s,
  },
  sousTitreSection: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
    marginTop: -espaces.s,
  },
  chargement: {
    paddingVertical: espaces.l,
  },
  vide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.carte,
    padding: espaces.l,
  },
  texteVide: {
    flex: 1,
    fontSize: 13,
    color: couleurs.texteSecondaire,
    lineHeight: 18,
  },
  carte: {
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.carte,
    padding: espaces.l,
    gap: espaces.s,
    ...ombres.carte,
  },
  itineraire: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
    lineHeight: 21,
  },
  fleche: {
    color: couleurs.primaire,
    fontWeight: '800',
  },
  ligneDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: espaces.m,
    flexWrap: 'wrap',
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs,
    flexShrink: 1,
  },
  texteDetail: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
  },
  piedCarte: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
    marginTop: espaces.xs,
    flexWrap: 'wrap',
  },
  zoneReservation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
  },
  compteur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    backgroundColor: couleurs.blanc,
    borderRadius: rayons.pastille,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    paddingHorizontal: espaces.s,
    paddingVertical: 4,
  },
  boutonCompteur: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nbPlaces: {
    fontSize: 15,
    fontWeight: '800',
    color: couleurs.encre,
    minWidth: 18,
    textAlign: 'center',
  },
  encartOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    backgroundColor: couleurs.succesFond,
    borderRadius: rayons.carte,
    padding: espaces.m,
  },
  texteOk: {
    flex: 1,
    fontSize: 13,
    color: couleurs.succes,
    fontWeight: '600',
  },
  encartErreur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    backgroundColor: couleurs.dangerFond,
    borderRadius: rayons.carte,
    padding: espaces.m,
  },
  texteErreur: {
    flex: 1,
    fontSize: 13,
    color: couleurs.danger,
    fontWeight: '600',
  },
  prix: {
    fontSize: 15,
    fontWeight: '800',
    color: couleurs.primaire,
    flexShrink: 1,
  },
  boutonReserver: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    backgroundColor: couleurs.primaire,
    borderRadius: rayons.pastille,
    paddingHorizontal: espaces.l,
    paddingVertical: espaces.s + 2,
  },
  texteReserver: {
    color: couleurs.blanc,
    fontSize: 13,
    fontWeight: '700',
  },
});
