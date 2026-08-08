// Mode chauffeur — trajets partagés publiés (rides).
// « Proposer un trajet » : POST /rides {origin, destination, departureAt,
// seatsTotal (1-8), pricePerSeat (TZS), notes?} — chauffeur VALIDÉ uniquement
// (403 driver_not_verified sinon, 400 departure_in_past si l'heure est passée).
// « Mes trajets publiés » : GET /rides/mine, ajustement des places et
// clôture/annulation via PATCH /rides/:id. Lieux : listes fermées servies par
// GET /rides/locations (repli local ORIGINES_RIDES / DESTINATIONS_RIDES).
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
import {
  HEURES_CHOIX,
  isoDepuisChoix,
  libellesDates,
  libelleStatutRide,
  useT,
} from '@/lib/i18n';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import {
  champ,
  DESTINATIONS_RIDES,
  formaterDate,
  formaterMontant,
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
  const { t, langue } = useT();
  const chauffeur = session?.driver ?? null;
  const verifie =
    champ<StatutVerification>(chauffeur, 'verification_status', 'verificationStatus') ===
    'verified';

  // Dates proposées au départ (Aujourd'hui, Demain, +6 jours), langue active.
  const choixDates = libellesDates(t, langue);

  const [origine, setOrigine] = useState('');
  const [destination, setDestination] = useState('');
  const [dateDepart, setDateDepart] = useState('');
  const [heureDepart, setHeureDepart] = useState('');
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
    } catch {
      setErreurListe(t('annonces_erreur_chargement'));
    }
    try {
      const lieux = await api.lieuxRides();
      if (lieux.origins.length > 0) setOrigines(lieux.origins);
      if (lieux.destinations.length > 0) setDestinations(lieux.destinations);
    } catch {
      // silencieux : repli sur les listes locales
    }
  }, [chauffeur, t]);

  useFocusEffect(
    useCallback(() => {
      rafraichir();
    }, [rafraichir])
  );

  const publier = async () => {
    setErreur('');
    setMessageOk('');
    if (!origine || !destination) {
      setErreur(t('annonces_erreur_lieux'));
      return;
    }
    const departIso =
      dateDepart && heureDepart ? isoDepuisChoix(choixDates, dateDepart, heureDepart) : null;
    if (!departIso) {
      setErreur(t('sel_erreur_datetime'));
      return;
    }
    if (new Date(departIso).getTime() <= Date.now()) {
      setErreur(t('annonces_erreur_futur'));
      return;
    }
    const nbPlaces = Number(places);
    if (!Number.isInteger(nbPlaces) || nbPlaces < 1 || nbPlaces > PLACES_MAX) {
      setErreur(t('annonces_erreur_places', { max: PLACES_MAX }));
      return;
    }
    const prix = Number(prixPlace.replace(/[\s]/g, ''));
    if (!Number.isFinite(prix) || prix <= 0) {
      setErreur(t('annonces_erreur_prix'));
      return;
    }
    setCharge(true);
    try {
      await api.creerRide({
        origin: origine,
        destination: destination,
        departureAt: departIso,
        seatsTotal: nbPlaces,
        pricePerSeat: prix,
        notes: notes.trim() || undefined,
      });
      setOrigine('');
      setDestination('');
      setDateDepart('');
      setHeureDepart('');
      setPlaces('4');
      setPrixPlace('');
      setNotes('');
      setMessageOk(t('annonces_publie'));
      await rafraichir();
    } catch (e) {
      if (e instanceof ErreurApi && e.code === 'departure_in_past') {
        setErreur(t('annonces_erreur_futur'));
      } else if (e instanceof ErreurApi && e.code === 'driver_not_verified') {
        setErreur(t('annonces_erreur_non_verifie'));
      } else {
        setErreur(e instanceof ErreurApi ? e.message : t('annonces_erreur_publication'));
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
    } catch {
      setErreurListe(t('annonces_erreur_places_maj'));
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
    } catch {
      setErreurListe(t('annonces_erreur_statut'));
    } finally {
      setActionEnCours(null);
    }
  };

  return (
    <Ecran fond="vagues" onRefresh={rafraichir}>
      {!verifie && (
        <EncartInfo icone="hourglass-outline" ton="attente">
          {t('annonces_attente')}
        </EncartInfo>
      )}

      <Carte>
        <Titre>{t('annonces_proposer')}</Titre>
        <Text style={styles.explication}>{t('annonces_intro')}</Text>
        <Selecteur
          label={t('annonces_origine')}
          valeur={origine}
          options={origines}
          placeholder={t('annonces_origine_placeholder')}
          onChange={setOrigine}
        />
        <Selecteur
          label={t('annonces_destination')}
          valeur={destination}
          options={destinations}
          placeholder={t('annonces_destination_placeholder')}
          onChange={setDestination}
        />
        <View style={styles.rangeeChamps}>
          <View style={styles.demiChamp}>
            <Selecteur
              label={t('sel_date')}
              valeur={dateDepart}
              options={choixDates}
              onChange={setDateDepart}
            />
          </View>
          <View style={styles.demiChamp}>
            <Selecteur
              label={t('sel_heure')}
              valeur={heureDepart}
              options={HEURES_CHOIX}
              onChange={setHeureDepart}
            />
          </View>
        </View>
        <View style={styles.rangeeChamps}>
          <View style={styles.demiChamp}>
            <Champ
              label={t('annonces_places', { max: PLACES_MAX })}
              value={places}
              onChangeText={setPlaces}
              keyboardType="number-pad"
              placeholder="4"
            />
          </View>
          <View style={styles.demiChamp}>
            <Champ
              label={t('annonces_prix_place')}
              value={prixPlace}
              onChangeText={setPrixPlace}
              keyboardType="number-pad"
              placeholder="8000"
            />
          </View>
        </View>
        <Champ
          label={t('annonces_notes')}
          value={notes}
          onChangeText={setNotes}
          placeholder={t('annonces_notes_placeholder')}
          multiline
        />
        {!!messageOk && (
          <EncartInfo icone="checkmark-circle-outline" ton="succes">
            {messageOk}
          </EncartInfo>
        )}
        <TexteErreur>{erreur}</TexteErreur>
        <Bouton
          titre={t('annonces_publier')}
          icone="megaphone-outline"
          onPress={publier}
          charge={charge}
          desactive={!verifie}
        />
      </Carte>

      <Text style={styles.titreSection}>{t('annonces_mes_trajets')}</Text>
      <TexteErreur>{erreurListe}</TexteErreur>
      {mesRides.length === 0 && !erreurListe && (
        <EtatVide
          icone="megaphone-outline"
          titre={t('annonces_vide_titre')}
          message={t('annonces_vide_texte')}
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
              <Badge texte={libelleStatutRide(statut, t)} ton={tonStatut(statut)} />
            </View>
            <View style={styles.ligneDetails}>
              <View style={styles.detail}>
                <Ionicons name="time-outline" size={14} color={couleurs.texteSecondaire} />
                <Text style={styles.texteDetail}>
                  {formaterDate(champ(ride, 'departure_at', 'departureAt'))}
                </Text>
              </View>
              <Text style={styles.prixRide}>
                {prix !== undefined
                  ? `${formaterMontant(prix, devise)} ${t('rides_par_place')}`
                  : '—'}
              </Text>
            </View>
            <View style={styles.rangeePlaces}>
              <Text style={styles.textePlaces}>
                {t(total > 1 ? 'rides_places_restantes' : 'rides_place_restante', {
                  n: `${restantes}/${total}`,
                })}
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
                  <Text style={styles.texteAction}>{t('annonces_cloturer')}</Text>
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
                  <Text style={[styles.texteAction, { color: couleurs.danger }]}>
                    {t('commun_annuler')}
                  </Text>
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
    backgroundColor: couleurs.carteTranslucide,
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
