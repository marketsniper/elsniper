// Mode chauffeur — trajets partagés publiés (rides).
// « Proposer un trajet » : POST /rides {origin, destination, departureAt,
// seatsTotal (1-8), notes?} — le PRIX PAR PLACE est fixé automatiquement par
// la grille zanziGo selon la zone du trajet. Chauffeur VALIDÉ uniquement
// (403 driver_not_verified sinon, 400 departure_in_past si l'heure est passée).
// « Mes trajets publiés » : GET /rides/mine, ajustement des places et
// clôture/annulation via PATCH /rides/:id. Lieux : listes fermées servies par
// GET /rides/locations (repli local ORIGINES_RIDES / DESTINATIONS_RIDES).
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

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
import { estBalaye, lireCoupDeBalai, passerCoupDeBalai } from '@/lib/menageLocal';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import {
  champ,
  DESTINATIONS_RIDES,
  formaterDate,
  formaterMontant,
  ORIGINES_RIDES,
  tarifTrajetProfil,
  TAUX_USD_TZS,
  type ReservationRide,
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
  const router = useRouter();
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
  const [notes, setNotes] = useState('');

  // Prix par place projetés (grille zanziGo, miroir local) : shillings pour
  // les locaux, dollars pour les touristes — affichés dès l'itinéraire choisi.
  const itineraireChoisi =
    origine && destination ? { depart: origine, arrivee: destination } : undefined;
  const tarifLocalProjete = itineraireChoisi
    ? tarifTrajetProfil('shared_local', 'local', itineraireChoisi)
    : null;
  const tarifTouristeProjete = itineraireChoisi
    ? tarifTrajetProfil('shared_tourist', 'tourist', itineraireChoisi)
    : null;
  const prixProjetes =
    tarifLocalProjete && tarifTouristeProjete
      ? { tzs: tarifLocalProjete.montant, usd: tarifTouristeProjete.montant }
      : null;
  const [erreur, setErreur] = useState('');
  const [messageOk, setMessageOk] = useState('');
  const [charge, setCharge] = useState(false);

  const [mesRides, setMesRides] = useState<Ride[]>([]);
  const [erreurListe, setErreurListe] = useState('');
  const [balai, setBalai] = useState(0);
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
    if (chauffeur) setBalai(await lireCoupDeBalai('annonces', chauffeur.id));
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
    setCharge(true);
    try {
      const annonce = await api.creerRide({
        origin: origine,
        destination: destination,
        departureAt: departIso,
        seatsTotal: nbPlaces,
        notes: notes.trim() || undefined,
      });
      setOrigine('');
      setDestination('');
      setDateDepart('');
      setHeureDepart('');
      setPlaces('4');
      setNotes('');
      setMessageOk(t('annonces_publie'));
      await rafraichir();
      // L'équipe est prévenue automatiquement par le serveur (e-mail) —
      // plus de message WhatsApp à envoyer par le chauffeur.
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

  // Annonces encore en ligne d'un côté, historique (clôturées/annulées) de
  // l'autre — les mélanger rendait la liste illisible. Le ménage masque
  // l'historique antérieur au coup de balai (local au téléphone).
  const annoncesOuvertes = mesRides.filter(
    (ride) => champ<StatutRide>(ride, 'status', 'statut') === 'open'
  );
  // Le balai compare la date de CRÉATION de l'annonce (toujours dans le
  // passé) — pas celle du départ : une annonce annulée avant un départ
  // futur doit pouvoir s'effacer immédiatement.
  const annoncesPassees = mesRides.filter(
    (ride) =>
      champ<StatutRide>(ride, 'status', 'statut') !== 'open' &&
      !estBalaye(champ(ride, 'created_at', 'createdAt', 'departure_at', 'departureAt'), balai)
  );

  const faireLeMenage = () => {
    if (!chauffeur) return;
    Alert.alert(t('menage_titre'), t('menage_texte'), [
      { text: t('commun_annuler'), style: 'cancel' },
      {
        text: t('menage_confirmer'),
        style: 'destructive',
        onPress: async () => setBalai(await passerCoupDeBalai('annonces', chauffeur.id)),
      },
    ]);
  };

  const carteAnnonce = (ride: Ride) => {
    const statut = champ<StatutRide>(ride, 'status', 'statut');
    const prixTzs = champ<number | string>(ride, 'price_per_seat', 'pricePerSeat');
    const prixUsd = champ<number | string>(ride, 'price_per_seat_usd', 'pricePerSeatUsd');
    const total = Number(champ(ride, 'seats_total', 'seatsTotal') ?? 0);
    const restantes = Number(champ(ride, 'seats_available', 'seatsAvailable') ?? 0);
    const reservations = champ<ReservationRide[]>(ride, 'bookings') ?? [];
    const estOuverte = statut === 'open';
    // Gain net cumulé des places PAYÉES uniquement, tout converti en
    // shillings (les places touristes en USD comptent × taux) — le compteur
    // du chauffeur ne bouge qu'au paiement. Les réservations encore dans
    // leur fenêtre de paiement (5 min) sont affichées à part.
    const reservationsPayees = reservations.filter((resa) => resa.paid);
    const gainTotalTzs = Math.round(
      reservationsPayees.reduce((somme, resa) => {
        const net = Number(resa.net_per_seat ?? 0) * resa.seats;
        return somme + (resa.currency === 'USD' ? net * TAUX_USD_TZS : net);
      }, 0)
    );
    const placesEnAttente = reservations
      .filter((resa) => !resa.paid)
      .reduce((somme, resa) => somme + resa.seats, 0);
    const complet = estOuverte && restantes === 0;
    return (
      <Pressable
        key={ride.id}
        onPress={() => router.push(`/annonce/${ride.id}`)}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.carteRide,
          !estOuverte && styles.carteRidePassee,
          pressed && { opacity: 0.75 },
        ]}
      >
        <View style={styles.enTeteRide}>
          <Text style={styles.itineraire}>
            {champ(ride, 'origin', 'origine') ?? '?'}{'  '}
            <Text style={styles.fleche}>→</Text>{'  '}
            {champ(ride, 'destination') ?? '?'}
          </Text>
          {complet ? (
            <Badge texte={`🎉 ${t('rides_complet')}`} ton="succes" />
          ) : (
            <Badge texte={libelleStatutRide(statut, t)} ton={tonStatut(statut)} />
          )}
        </View>
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
              {t(total > 1 ? 'rides_places_restantes' : 'rides_place_restante', {
                n: `${restantes}/${total}`,
              })}
            </Text>
          </View>
        </View>
        {prixTzs !== undefined && prixUsd !== undefined && (
          <Text style={styles.prixRide}>
            {t('annonces_prix_deux', {
              tzs: formaterMontant(prixTzs, 'TZS'),
              usd: formaterMontant(prixUsd, 'USD'),
            })}
          </Text>
        )}
        {/* Gain net cumulé en shillings — places PAYÉES uniquement. */}
        {gainTotalTzs > 0 && (
          <Text style={styles.gainRide}>
            💰 {t('annonces_gain_cumule')} : {formaterMontant(gainTotalTzs, 'TZS')}
          </Text>
        )}
        {/* Blocages temporaires : payé sous 5 min ou la place se libère. */}
        {placesEnAttente > 0 && (
          <Text style={styles.attenteRide}>
            {t('annonces_places_attente', { n: placesEnAttente })}
          </Text>
        )}
        <View style={styles.ligneOuvrir}>
          <Text style={[styles.texteOuvrir, reservations.length > 0 && styles.texteOuvrirFort]}>
            {reservations.length > 0
              ? t('annonces_nb_resa', { n: reservations.length })
              : t('annonces_aucune_resa')}
            {'  ·  '}
            {t('annonces_ouvrir_detail')}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={couleurs.primaire} />
        </View>
      </Pressable>
    );
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
        {!!origine && !!destination && prixProjetes && (
          <EncartInfo icone="cash-outline">
            {t('annonce_prix_label')} : {t('annonces_prix_deux', {
              tzs: formaterMontant(prixProjetes.tzs, 'TZS'),
              usd: formaterMontant(prixProjetes.usd, 'USD'),
            })}
          </EncartInfo>
        )}
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

      <Text style={styles.titreSection}>
        {t('annonces_ouvertes')} ({annoncesOuvertes.length})
      </Text>
      {/* Règle des 10 minutes : le serveur annule automatiquement. */}
      <EncartInfo icone="time-outline" ton="attente">
        {t('annonces_regle_retard')}
      </EncartInfo>
      <TexteErreur>{erreurListe}</TexteErreur>
      {annoncesOuvertes.length === 0 && !erreurListe && (
        <EtatVide
          icone="megaphone-outline"
          titre={t('annonces_vide_titre')}
          message={t('annonces_vide_texte')}
        />
      )}
      {annoncesOuvertes.map(carteAnnonce)}

      {/* Historique séparé : les annonces clôturées/annulées ne se mélangent
          plus aux annonces encore réservables. */}
      {annoncesPassees.length > 0 && (
        <Text style={styles.titreSection}>
          {t('annonces_historique')} ({annoncesPassees.length})
        </Text>
      )}
      {annoncesPassees.map(carteAnnonce)}
      {annoncesPassees.length > 0 && (
        <Bouton
          titre={`${t('menage_bouton')} (${annoncesPassees.length})`}
          icone="trash-outline"
          variante="secondaire"
          onPress={faireLeMenage}
        />
      )}
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
  carteRidePassee: {
    opacity: 0.65,
  },
  texteOuvrirFort: {
    fontWeight: '800',
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
  gainRide: {
    fontSize: 14.5,
    fontWeight: '800',
    color: couleurs.succes,
  },
  attenteRide: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.attente,
  },
  blocReservations: {
    backgroundColor: couleurs.surface,
    borderRadius: rayons.bouton,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espaces.m,
    gap: espaces.xs,
  },
  titreReservations: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.encre,
  },
  ligneReservation: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
    lineHeight: 19,
  },
  ligneOuvrir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaces.s,
    marginTop: espaces.xs,
  },
  texteOuvrir: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
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
