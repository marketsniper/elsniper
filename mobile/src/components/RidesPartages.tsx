// Section « Trajets partagés à venir » : trajets ouverts postés par les
// chauffeurs (GET /rides). Réservation de place(s) DANS L'APP : choix du
// nombre de places (− / +), POST /rides/:id/book décompte automatiquement
// les places sur l'annonce du chauffeur, puis WhatsApp s'ouvre avec la
// notification pré-remplie pour l'équipe.
// Lisibilité : annonces triées par heure de départ et REGROUPÉES PAR JOUR
// (Aujourd'hui / Demain / date), filtre destination en pastilles, places
// restantes en couleur (vert = large, orange = presque plein).
// Devise affichée : le serveur envoie price_per_seat_usd aux profils USD
// et price_per_seat (TZS) aux locaux/chauffeurs — on affiche le champ présent.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { useRafraichissementAuto } from '@/lib/rafraichissementAuto';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT, type FonctionT, type Langue } from '@/lib/i18n';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import { champ, DESTINATIONS_RIDES, formaterMontant, type Ride, type TypeCompte } from '@/lib/types';

const LOCALES: Record<Langue, string> = { fr: 'fr-FR', en: 'en-GB', sw: 'sw-TZ' };

/** Heure de départ « 14:30 » (le jour est porté par le bandeau de groupe). */
function heureDepart(valeur: unknown, langue: Langue): string {
  const d = new Date(String(valeur ?? ''));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(LOCALES[langue], { hour: '2-digit', minute: '2-digit' });
}

/** Bandeau de jour : Aujourd'hui, Demain, sinon « jeudi 13 août ». */
function libelleJour(valeur: unknown, t: FonctionT, langue: Langue): string {
  const d = new Date(String(valeur ?? ''));
  if (Number.isNaN(d.getTime())) return '?';
  const memeJour = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const aujourdHui = new Date();
  const demain = new Date(aujourdHui);
  demain.setDate(demain.getDate() + 1);
  if (memeJour(d, aujourdHui)) return t('sel_aujourdhui');
  if (memeJour(d, demain)) return t('sel_demain');
  return d.toLocaleDateString(LOCALES[langue], { weekday: 'long', day: 'numeric', month: 'long' });
}

export function RidesPartages() {
  const { t, langue } = useT();
  const { session } = useAuth();
  // Cloison tarifaire : un profil LOCAL ne doit JAMAIS voir de dollars —
  // quoi que contienne la réponse, on affiche son prix TZS.
  const estLocal =
    champ<TypeCompte>(session?.user, 'account_type', 'accountType') === 'local';
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
      // L'équipe est prévenue automatiquement par le serveur (e-mail) —
      // plus de message WhatsApp à envoyer par le client.
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

  // Les places restantes bougent en direct : la liste se recharge toute
  // seule tant que l'écran est affiché.
  useRafraichissementAuto(rafraichir);

  useFocusEffect(
    useCallback(() => {
      rafraichir();
    }, [rafraichir])
  );

  const filtreActif = filtreDestination !== '' && filtreDestination !== toutesDestinations;
  // Un trajet dont l'heure de départ est passée s'efface immédiatement de la
  // liste, même si l'écran n'a pas été rechargé depuis le serveur.
  const ridesAVenir = rides.filter((ride) => {
    const depart = new Date(String(champ(ride, 'departure_at', 'departureAt') ?? '')).getTime();
    return Number.isFinite(depart) && depart > Date.now();
  });
  const ridesFiltres = filtreActif
    ? ridesAVenir.filter((ride) => champ<string>(ride, 'destination') === filtreDestination)
    : ridesAVenir;

  // Tri chronologique puis regroupement par jour : un bandeau par journée,
  // pour que l'œil retrouve d'abord LE JOUR, puis l'heure.
  const ridesTries = [...ridesFiltres].sort(
    (a, b) =>
      new Date(String(champ(a, 'departure_at', 'departureAt') ?? '')).getTime() -
      new Date(String(champ(b, 'departure_at', 'departureAt') ?? '')).getTime()
  );
  const groupesParJour: { jour: string; liste: Ride[] }[] = [];
  for (const ride of ridesTries) {
    const jour = libelleJour(champ(ride, 'departure_at', 'departureAt'), t, langue);
    const dernier = groupesParJour[groupesParJour.length - 1];
    if (dernier && dernier.jour === jour) dernier.liste.push(ride);
    else groupesParJour.push({ jour, liste: [ride] });
  }

  return (
    <View style={styles.section}>
      <Text style={styles.titreSection}>{t('rides_titre')}</Text>
      <Text style={styles.sousTitreSection}>{t('rides_soustitre')}</Text>

      {rides.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rangeeChips}
        >
          {[toutesDestinations, ...destinations].map((dest) => {
            const actif = dest === toutesDestinations ? !filtreActif : filtreDestination === dest;
            return (
              <Pressable
                key={dest}
                onPress={() => setFiltreDestination(dest === toutesDestinations ? '' : dest)}
                accessibilityRole="button"
                style={[styles.chip, actif && styles.chipActif]}
              >
                <Text style={[styles.texteChip, actif && styles.texteChipActif]}>{dest}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
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

      {groupesParJour.map((groupe) => (
        <View key={groupe.jour} style={styles.groupeJour}>
          <View style={styles.enTeteJour}>
            <Ionicons name="calendar-outline" size={14} color={couleurs.primaireFonce} />
            <Text style={styles.texteJour}>{groupe.jour}</Text>
            <View style={styles.filetJour} />
          </View>
          {groupe.liste.map((ride) => {
        const placesRestantes = Number(champ(ride, 'seats_available', 'seatsAvailable') ?? 0);
        // Devise selon le profil : un LOCAL voit toujours son prix TZS ;
        // les autres profils voient le prix USD si le serveur l'envoie.
        const prixUsd = champ<number | string>(ride, 'price_per_seat_usd', 'pricePerSeatUsd');
        const prixTzs = champ<number | string>(ride, 'price_per_seat', 'pricePerSeat');
        const prixPlace = estLocal ? prixTzs : prixUsd !== undefined ? prixUsd : prixTzs;
        const devise = estLocal
          ? champ<string>(ride, 'currency') ?? 'TZS'
          : prixUsd !== undefined
            ? 'USD'
            : champ<string>(ride, 'currency') ?? 'TZS';
        const nomChauffeur = champ<string>(ride, 'driver_name', 'driverName');
        const vehicule = champ<string>(ride, 'vehicle_model', 'vehicleModel');
        const plaque = champ<string>(ride, 'vehicle_plate', 'vehiclePlate');
        const noteBrute = champ<number | string>(ride, 'driver_rating', 'driverRating');
        const note =
          noteBrute !== undefined && Number.isFinite(Number(noteBrute))
            ? Number(noteBrute).toFixed(1)
            : null;
        const places = Math.min(placesChoisies[ride.id] ?? 1, Math.max(placesRestantes, 1));
        const enCours = reservationEnCours === ride.id;
        // Places restantes en couleur : vert = large, orange = presque plein.
        const complet = placesRestantes < 1;
        const presquePlein = placesRestantes >= 1 && placesRestantes <= 2;
        return (
          <View key={ride.id} style={styles.carte}>
            <View style={styles.enTeteCarte}>
              <View style={styles.pastilleHeure}>
                <Ionicons name="time-outline" size={13} color={couleurs.primaireFonce} />
                <Text style={styles.texteHeure}>
                  {heureDepart(champ(ride, 'departure_at', 'departureAt'), langue)}
                </Text>
              </View>
              <View
                style={[
                  styles.pastillePlaces,
                  presquePlein && styles.pastillePlacesAttente,
                  complet && styles.pastillePlacesComplet,
                ]}
              >
                <Ionicons
                  name="people"
                  size={12}
                  color={
                    complet
                      ? couleurs.texteSecondaire
                      : presquePlein
                        ? couleurs.attente
                        : couleurs.succes
                  }
                />
                <Text
                  style={[
                    styles.textePlaces,
                    presquePlein && { color: couleurs.attente },
                    complet && { color: couleurs.texteSecondaire },
                  ]}
                >
                  {complet
                    ? t('rides_complet')
                    : t(placesRestantes > 1 ? 'rides_places_restantes' : 'rides_place_restante', {
                        n: placesRestantes,
                      })}
                </Text>
              </View>
            </View>
            <Text style={styles.itineraire}>
              {champ(ride, 'origin', 'origine') ?? '?'}{'  '}
              <Text style={styles.fleche}>→</Text>{'  '}
              {champ(ride, 'destination') ?? '?'}
            </Text>
            <View style={styles.ligneDetails}>
              <View style={styles.detail}>
                <Ionicons name="person-outline" size={14} color={couleurs.texteSecondaire} />
                <Text style={styles.texteDetail}>
                  {nomChauffeur ?? t('rides_chauffeur_defaut')}
                  {vehicule ? ` · ${vehicule}` : ''}
                  {plaque ? ` · ${plaque}` : ''}
                </Text>
              </View>
              {note !== null && (
                <View style={styles.detail}>
                  <Ionicons name="star" size={14} color={couleurs.etoile} />
                  <Text style={styles.texteDetail}>{note}</Text>
                </View>
              )}
            </View>
            <View style={styles.filetCarte} />
            <View style={styles.piedCarte}>
              <Text style={styles.prix}>
                {prixPlace !== undefined
                  ? `${formaterMontant(prixPlace, devise)} ${t('rides_par_place')}`
                  : '—'}
              </Text>
              <View style={styles.zoneReservation}>
                {!complet && (
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
                )}
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
                    <ActivityIndicator size="small" color={couleurs.surPrimaire} />
                  ) : (
                    <Ionicons name="checkmark-circle-outline" size={16} color={couleurs.surPrimaire} />
                  )}
                  <Text style={styles.texteReserver}>{t('rides_reserver')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        );
          })}
        </View>
      ))}
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
  rangeeChips: {
    gap: espaces.s,
    paddingVertical: espaces.xs,
  },
  chip: {
    borderRadius: rayons.pastille,
    borderWidth: 1.5,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.carteTranslucide,
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.s,
  },
  chipActif: {
    borderColor: couleurs.primaire,
    backgroundColor: couleurs.primaire,
  },
  texteChip: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  texteChipActif: {
    color: couleurs.surPrimaire,
  },
  groupeJour: {
    gap: espaces.m,
  },
  enTeteJour: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    marginTop: espaces.xs,
  },
  texteJour: {
    fontSize: 13,
    fontWeight: '800',
    color: couleurs.primaireFonce,
    textTransform: 'capitalize',
    letterSpacing: 0.3,
  },
  filetJour: {
    flex: 1,
    height: 1,
    backgroundColor: couleurs.bordure,
  },
  enTeteCarte: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.s,
    flexWrap: 'wrap',
  },
  pastilleHeure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs,
    backgroundColor: couleurs.primaireClair,
    borderRadius: rayons.pastille,
    paddingHorizontal: espaces.m,
    paddingVertical: 4,
  },
  texteHeure: {
    fontSize: 14,
    fontWeight: '800',
    color: couleurs.primaireFonce,
  },
  pastillePlaces: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs,
    backgroundColor: couleurs.succesFond,
    borderRadius: rayons.pastille,
    paddingHorizontal: espaces.m,
    paddingVertical: 4,
  },
  pastillePlacesAttente: {
    backgroundColor: couleurs.attenteFond,
  },
  pastillePlacesComplet: {
    backgroundColor: couleurs.bordure,
  },
  textePlaces: {
    fontSize: 12,
    fontWeight: '700',
    color: couleurs.succes,
  },
  filetCarte: {
    height: 1,
    backgroundColor: couleurs.bordure,
    marginVertical: espaces.xs,
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
    backgroundColor: couleurs.surface,
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
    color: couleurs.surPrimaire,
    fontSize: 13,
    fontWeight: '700',
  },
});
