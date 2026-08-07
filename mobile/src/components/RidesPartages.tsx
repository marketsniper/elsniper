// Section « Trajets partagés à venir » : trajets ouverts postés par les
// chauffeurs (GET /rides). Réservation d'une place via WhatsApp (lien
// whatsapp_link pré-rempli vers l'équipe).
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Selecteur } from '@/components/Selecteur';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import {
  champ,
  DESTINATIONS_RIDES,
  deviseUtilisateur,
  formaterDate,
  formaterMontant,
  type Ride,
} from '@/lib/types';

// Contact WhatsApp de l'équipe zanziGo (secours si whatsapp_link absent).
const WHATSAPP_EQUIPE = 'https://wa.me/255779000000';

const TOUTES_DESTINATIONS = 'Toutes les destinations';

export function RidesPartages() {
  const { session } = useAuth();
  // Devise d'affichage : USD pour les touristes (price_per_seat_usd), TZS
  // pour les résidents, hôtels et chauffeurs (price_per_seat). Même liste
  // pour tous — seule la devise affichée change.
  const utilisateur = session?.user ?? null;
  const enUsd = !!utilisateur && deviseUtilisateur(utilisateur) === 'USD';
  const [rides, setRides] = useState<Ride[]>([]);
  const [charge, setCharge] = useState(false);
  const [chargeInitiale, setChargeInitiale] = useState(true);
  const [filtreDestination, setFiltreDestination] = useState(TOUTES_DESTINATIONS);
  const [destinations, setDestinations] = useState<string[]>(DESTINATIONS_RIDES);

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

  const ridesFiltres =
    filtreDestination === TOUTES_DESTINATIONS
      ? rides
      : rides.filter((ride) => champ<string>(ride, 'destination') === filtreDestination);

  return (
    <View style={styles.section}>
      <Text style={styles.titreSection}>Trajets partagés à venir</Text>
      <Text style={styles.sousTitreSection}>
        Postés par nos chauffeurs — réservez votre place via l&apos;équipe.
      </Text>

      {rides.length > 0 && (
        <Selecteur
          label="Filtrer par destination"
          valeur={filtreDestination}
          options={[TOUTES_DESTINATIONS, ...destinations]}
          onChange={setFiltreDestination}
        />
      )}

      {chargeInitiale && charge && (
        <ActivityIndicator color={couleurs.primaire} style={styles.chargement} />
      )}

      {!charge && !chargeInitiale && rides.length === 0 && (
        <View style={styles.vide}>
          <Ionicons name="people-outline" size={22} color={couleurs.texteSecondaire} />
          <Text style={styles.texteVide}>
            Aucun trajet partagé pour l&apos;instant — revenez plus tard.
          </Text>
        </View>
      )}
      {!charge && !chargeInitiale && rides.length > 0 && ridesFiltres.length === 0 && (
        <View style={styles.vide}>
          <Ionicons name="people-outline" size={22} color={couleurs.texteSecondaire} />
          <Text style={styles.texteVide}>
            Aucun trajet partagé vers {filtreDestination} pour l&apos;instant.
          </Text>
        </View>
      )}

      {ridesFiltres.map((ride) => {
        const placesRestantes = Number(champ(ride, 'seats_available', 'seatsAvailable') ?? 0);
        const prixTzs = champ<number | string>(ride, 'price_per_seat', 'pricePerSeat');
        const prixUsd = champ<number | string>(ride, 'price_per_seat_usd', 'pricePerSeatUsd');
        const prixPlace = enUsd && prixUsd !== undefined ? prixUsd : prixTzs;
        const devise =
          enUsd && prixUsd !== undefined ? 'USD' : champ<string>(ride, 'currency') ?? 'TZS';
        const nomChauffeur = champ<string>(ride, 'driver_name', 'driverName');
        const vehicule = champ<string>(ride, 'vehicle_model', 'vehicleModel');
        const noteBrute = champ<number | string>(ride, 'driver_rating', 'driverRating');
        const note =
          noteBrute !== undefined && Number.isFinite(Number(noteBrute))
            ? Number(noteBrute).toFixed(1)
            : null;
        const lien = champ<string>(ride, 'whatsapp_link', 'whatsappLink') ?? WHATSAPP_EQUIPE;
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
                  {placesRestantes} {placesRestantes > 1 ? 'places restantes' : 'place restante'}
                </Text>
              </View>
            </View>
            <View style={styles.ligneDetails}>
              <View style={styles.detail}>
                <Ionicons name="person-outline" size={14} color={couleurs.texteSecondaire} />
                <Text style={styles.texteDetail}>
                  {nomChauffeur ?? 'Chauffeur zanziGo'}
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
                {prixPlace !== undefined ? `${formaterMontant(prixPlace, devise)} / place` : '—'}
              </Text>
              <Pressable
                onPress={() => Linking.openURL(lien)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.boutonReserver, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="logo-whatsapp" size={16} color={couleurs.blanc} />
                <Text style={styles.texteReserver}>Réserver une place</Text>
              </Pressable>
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
    backgroundColor: couleurs.blanc,
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
    backgroundColor: couleurs.blanc,
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
