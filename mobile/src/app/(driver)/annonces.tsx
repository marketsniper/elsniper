// Mode chauffeur — trajets partagés publiés (rides).
// « Proposer un trajet » : POST /rides {origin, destination, departureAt,
// seatsTotal (1-8), pricePerSeat (TZS), notes?} — chauffeur VALIDÉ uniquement
// (403 driver_not_verified sinon, 400 departure_in_past si l'heure est passée).
// « Mes trajets publiés » : GET /rides/mine, ajustement des places et
// clôture/annulation via PATCH /rides/:id.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Selecteur } from '@/components/Selecteur';
import {
  Badge,
  Bouton,
  Carte,
  Champ,
  Ecran,
  EncartInfo,
  EtatVide,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import {
  champ,
  DESTINATIONS_RIDES,
  formaterDate,
  formaterMontant,
  LIBELLES_STATUT_RIDE,
  ORIGINES_RIDES,
  type Ride,
  type StatutRide,
  type StatutVerification,
} from '@/lib/types';

const PLACES_MAX = 8;

function tonStatut(statut: StatutRide | undefined) {
  switch (statut) {
    case 'open':
      return 'primaire' as const;
    case 'cancelled':
      return 'danger' as const;
    default:
      return 'neutre' as const;
  }
}

export default function EcranAnnonces() {
  const { session } = useAuth();
  const chauffeur = session?.driver ?? null;
  const verifie =
    champ<StatutVerification>(chauffeur, 'verification_status', 'verificationStatus') ===
    'verified';

  const [origine, setOrigine] = useState('');
  const [destination, setDestination] = useState('');
  const [depart, setDepart] = useState('');
  const [places, setPlaces] = useState('4');
  const [prixPlace, setPrixPlace] = useState('');
  const [notes, setNotes] = useState('');
  const [erreur, setErreur] = useState('');
  const [messageOk, setMessageOk] = useState('');
  const [charge, setCharge] = useState(false);

  const [mesRides, setMesRides] = useState<Ride[]>([]);
  const [erreurListe, setErreurListe] = useState('');
  // Id du trajet dont une action rapide est en cours (places / statut).
  const [actionEnCours, setActionEnCours] = useState<string | null>(null);
  // Listes fermées des lieux (serveur), avec repli sur les valeurs locales.
  const [origines, setOrigines] = useState<string[]>(ORIGINES_RIDES);
  const [destinations, setDestinations] = useState<string[]>(DESTINATIONS_RIDES);

  const rafraichir = useCallback(async () => {
    if (!chauffeur) return;
    try {
      setMesRides(await api.listerMesRides());
      setErreurListe('');
    } catch (e) {
      setErreurListe(e instanceof Error ? e.message : 'Chargement des annonces impossible.');
    }
    try {
      const lieux = await api.lieuxRides();
      if (lieux.origins.length > 0) setOrigines(lieux.origins);
      if (lieux.destinations.length > 0) setDestinations(lieux.destinations);
    } catch {
      // silencieux : repli sur les listes locales
    }
  }, [chauffeur]);

  useFocusEffect(
    useCallback(() => {
      rafraichir();
    }, [rafraichir])
  );

  const publier = async () => {
    setErreur('');
    setMessageOk('');
    if (!origine || !destination) {
      setErreur('Choisissez le hub de départ et la ville de destination.');
      return;
    }
    const date = new Date(depart.trim().replace(' ', 'T'));
    if (!depart.trim() || Number.isNaN(date.getTime())) {
      setErreur('Date de départ invalide. Format attendu : AAAA-MM-JJ HH:MM.');
      return;
    }
    if (date.getTime() <= Date.now()) {
      setErreur("L'heure de départ doit être dans le futur.");
      return;
    }
    const nbPlaces = Number(places);
    if (!Number.isInteger(nbPlaces) || nbPlaces < 1 || nbPlaces > PLACES_MAX) {
      setErreur(`Le nombre de places doit être compris entre 1 et ${PLACES_MAX}.`);
      return;
    }
    const prix = Number(prixPlace.replace(/[\s]/g, ''));
    if (!Number.isFinite(prix) || prix <= 0) {
      setErreur('Indiquez le prix par place en TZS (ex. : 8000).');
      return;
    }
    setCharge(true);
    try {
      await api.creerRide({
        origin: origine,
        destination: destination,
        departureAt: date.toISOString(),
        seatsTotal: nbPlaces,
        pricePerSeat: prix,
        notes: notes.trim() || undefined,
      });
      setOrigine('');
      setDestination('');
      setDepart('');
      setPlaces('4');
      setPrixPlace('');
      setNotes('');
      setMessageOk('Trajet publié ! Les clients peuvent maintenant réserver une place.');
      await rafraichir();
    } catch (e) {
      if (e instanceof ErreurApi && e.code === 'departure_in_past') {
        setErreur("L'heure de départ doit être dans le futur.");
      } else if (e instanceof ErreurApi && e.code === 'driver_not_verified') {
        setErreur("Votre compte chauffeur est en attente de validation par l'équipe.");
      } else {
        setErreur(e instanceof ErreurApi ? e.message : 'La publication du trajet a échoué.');
      }
    } finally {
      setCharge(false);
    }
  };

  const ajusterPlaces = async (ride: Ride, delta: number) => {
    const total = Number(champ(ride, 'seats_total', 'seatsTotal') ?? PLACES_MAX);
    const actuelles = Number(champ(ride, 'seats_available', 'seatsAvailable') ?? 0);
    const suivantes = Math.min(Math.max(actuelles + delta, 0), total);
    if (suivantes === actuelles) return;
    setActionEnCours(ride.id);
    setErreurListe('');
    try {
      await api.modifierRide(ride.id, { seatsAvailable: suivantes });
      await rafraichir();
    } catch (e) {
      setErreurListe(e instanceof Error ? e.message : 'Ajustement des places impossible.');
    } finally {
      setActionEnCours(null);
    }
  };

  const changerStatut = async (ride: Ride, statut: 'closed' | 'cancelled') => {
    setActionEnCours(ride.id);
    setErreurListe('');
    try {
      await api.modifierRide(ride.id, { status: statut });
      await rafraichir();
    } catch (e) {
      setErreurListe(e instanceof Error ? e.message : 'Mise à jour du trajet impossible.');
    } finally {
      setActionEnCours(null);
    }
  };

  return (
    <Ecran>
      {!verifie && (
        <EncartInfo icone="hourglass-outline" ton="attente">
          La publication de trajets partagés sera disponible une fois votre compte chauffeur
          validé par l&apos;équipe.
        </EncartInfo>
      )}

      <Carte>
        <Titre>Proposer un trajet</Titre>
        <Text style={styles.explication}>
          Publiez un trajet partagé : les clients réservent leur place via l&apos;équipe
          zanziGo.
        </Text>
        <Selecteur
          label="Origine (hub de départ)"
          valeur={origine}
          options={origines}
          placeholder="Choisir le hub de départ…"
          onChange={setOrigine}
        />
        <Selecteur
          label="Destination"
          valeur={destination}
          options={destinations}
          placeholder="Choisir la ville d'arrivée…"
          onChange={setDestination}
        />
        <Champ
          label="Départ (AAAA-MM-JJ HH:MM)"
          value={depart}
          onChangeText={setDepart}
          placeholder="Ex. : 2026-08-10 14:30"
        />
        <View style={styles.rangeeChamps}>
          <View style={styles.demiChamp}>
            <Champ
              label={`Places (1 à ${PLACES_MAX})`}
              value={places}
              onChangeText={setPlaces}
              keyboardType="number-pad"
              placeholder="4"
            />
          </View>
          <View style={styles.demiChamp}>
            <Champ
              label="Prix par place (TZS)"
              value={prixPlace}
              onChangeText={setPrixPlace}
              keyboardType="number-pad"
              placeholder="8000"
            />
          </View>
        </View>
        <Champ
          label="Notes (optionnel)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Ex. : départ devant le marché, bagages légers"
          multiline
        />
        {!!messageOk && (
          <EncartInfo icone="checkmark-circle-outline" ton="succes">
            {messageOk}
          </EncartInfo>
        )}
        <TexteErreur>{erreur}</TexteErreur>
        <Bouton
          titre="Publier le trajet"
          icone="megaphone-outline"
          onPress={publier}
          charge={charge}
          desactive={!verifie}
        />
      </Carte>

      <Text style={styles.titreSection}>Mes trajets publiés</Text>
      <TexteErreur>{erreurListe}</TexteErreur>
      {mesRides.length === 0 && !erreurListe && (
        <EtatVide
          icone="megaphone-outline"
          titre="Aucun trajet publié"
          message="Vos trajets partagés apparaîtront ici avec leurs places restantes."
        />
      )}
      {mesRides.map((ride) => {
        const statut = champ<StatutRide>(ride, 'status', 'statut');
        const total = Number(champ(ride, 'seats_total', 'seatsTotal') ?? 0);
        const restantes = Number(champ(ride, 'seats_available', 'seatsAvailable') ?? 0);
        const prix = champ<number | string>(ride, 'price_per_seat', 'pricePerSeat');
        const devise = champ<string>(ride, 'currency') ?? 'TZS';
        const ouvert = statut === 'open';
        const occupe = actionEnCours === ride.id;
        return (
          <View key={ride.id} style={styles.carteRide}>
            <View style={styles.enTeteRide}>
              <Text style={styles.itineraire}>
                {champ(ride, 'origin', 'origine') ?? '?'}{'  '}
                <Text style={styles.fleche}>→</Text>{'  '}
                {champ(ride, 'destination') ?? '?'}
              </Text>
              <Badge
                texte={statut ? LIBELLES_STATUT_RIDE[statut] ?? statut : '—'}
                ton={tonStatut(statut)}
              />
            </View>
            <View style={styles.ligneDetails}>
              <View style={styles.detail}>
                <Ionicons name="time-outline" size={14} color={couleurs.texteSecondaire} />
                <Text style={styles.texteDetail}>
                  {formaterDate(champ(ride, 'departure_at', 'departureAt'))}
                </Text>
              </View>
              <Text style={styles.prixRide}>
                {prix !== undefined ? `${formaterMontant(prix, devise)} / place` : '—'}
              </Text>
            </View>
            <View style={styles.rangeePlaces}>
              <Text style={styles.textePlaces}>
                {restantes}/{total} {total > 1 ? 'places restantes' : 'place restante'}
              </Text>
              {ouvert && (
                <View style={styles.boutonsPlaces}>
                  <Pressable
                    onPress={() => ajusterPlaces(ride, -1)}
                    disabled={occupe || restantes <= 0}
                    style={({ pressed }) => [
                      styles.boutonRond,
                      (pressed || occupe || restantes <= 0) && { opacity: 0.5 },
                    ]}
                  >
                    <Ionicons name="remove" size={18} color={couleurs.primaireFonce} />
                  </Pressable>
                  <Pressable
                    onPress={() => ajusterPlaces(ride, 1)}
                    disabled={occupe || restantes >= total}
                    style={({ pressed }) => [
                      styles.boutonRond,
                      (pressed || occupe || restantes >= total) && { opacity: 0.5 },
                    ]}
                  >
                    <Ionicons name="add" size={18} color={couleurs.primaireFonce} />
                  </Pressable>
                </View>
              )}
            </View>
            {ouvert && (
              <View style={styles.rangeeActions}>
                <Pressable
                  onPress={() => changerStatut(ride, 'closed')}
                  disabled={occupe}
                  style={({ pressed }) => [
                    styles.boutonAction,
                    (pressed || occupe) && { opacity: 0.5 },
                  ]}
                >
                  <Ionicons name="lock-closed-outline" size={15} color={couleurs.primaireFonce} />
                  <Text style={styles.texteAction}>Clôturer</Text>
                </Pressable>
                <Pressable
                  onPress={() => changerStatut(ride, 'cancelled')}
                  disabled={occupe}
                  style={({ pressed }) => [
                    styles.boutonAction,
                    styles.boutonAnnuler,
                    (pressed || occupe) && { opacity: 0.5 },
                  ]}
                >
                  <Ionicons name="close-circle-outline" size={15} color={couleurs.danger} />
                  <Text style={[styles.texteAction, { color: couleurs.danger }]}>Annuler</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </Ecran>
  );
}

const styles = StyleSheet.create({
  explication: {
    fontSize: 14,
    color: couleurs.texteSecondaire,
    lineHeight: 20,
  },
  rangeeChamps: {
    flexDirection: 'row',
    gap: espaces.m,
  },
  demiChamp: {
    flex: 1,
  },
  titreSection: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
    marginTop: espaces.s,
  },
  carteRide: {
    backgroundColor: couleurs.blanc,
    borderRadius: rayons.carte,
    padding: espaces.l,
    gap: espaces.s,
    ...ombres.carte,
  },
  enTeteRide: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  itineraire: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
    flexShrink: 1,
    lineHeight: 21,
  },
  fleche: {
    color: couleurs.primaire,
    fontWeight: '800',
  },
  ligneDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
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
  prixRide: {
    fontSize: 14,
    fontWeight: '800',
    color: couleurs.primaire,
  },
  rangeePlaces: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  textePlaces: {
    fontSize: 14,
    fontWeight: '600',
    color: couleurs.encre,
  },
  boutonsPlaces: {
    flexDirection: 'row',
    gap: espaces.s,
  },
  boutonRond: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeeActions: {
    flexDirection: 'row',
    gap: espaces.m,
    marginTop: espaces.xs,
  },
  boutonAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs,
    borderRadius: rayons.pastille,
    borderWidth: 1.5,
    borderColor: couleurs.primaire,
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.s,
  },
  boutonAnnuler: {
    borderColor: couleurs.dangerBordure,
  },
  texteAction: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.primaireFonce,
  },
});
