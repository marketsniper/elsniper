// Mode chauffeur — PUBLIER un trajet partagé. Rien d'autre.
//
// POST /rides {origin, destination, departureAt, seatsTotal (1-8), notes?} —
// le PRIX PAR PLACE est fixé automatiquement par la grille zanziGo selon la
// zone du trajet. Chauffeur VALIDÉ uniquement (403 driver_not_verified sinon,
// 400 departure_in_past si l'heure est passée). Lieux : listes fermées
// servies par GET /rides/locations (repli local ORIGINES_RIDES /
// DESTINATIONS_RIDES).
//
// La LISTE des trajets déjà publiés a quitté cet écran, à la demande du
// terrain : elle vit dans la case « Mes trajets postés » du tableau de bord
// chauffeur. Ici, une seule chose à faire — d'où un formulaire, et c'est tout.
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Selecteur } from '@/components/Selecteur';
import { Bouton, Carte, Champ, Ecran, EncartInfo, TexteErreur, Titre } from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { HEURES_CHOIX, isoDepuisChoix, libellesDates, useT } from '@/lib/i18n';
import { couleurs, espaces } from '@/lib/theme';
import {
  champ,
  DESTINATIONS_RIDES,
  formaterMontant,
  ORIGINES_RIDES,
  tarifTrajetProfil,
  type StatutVerification,
} from '@/lib/types';

const PLACES_MAX = 8;

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

  // Listes fermées des lieux (serveur), avec repli sur les valeurs locales.
  const [origines, setOrigines] = useState<string[]>(ORIGINES_RIDES);
  const [destinations, setDestinations] = useState<string[]>(DESTINATIONS_RIDES);

  // Cet écran ne charge plus que ce dont le FORMULAIRE a besoin : la liste
  // des trajets publiés est partie dans la case « Mes trajets postés ».
  const rafraichir = useCallback(async () => {
    if (!chauffeur) return;
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

      {/* Règle des 10 minutes : elle concerne le trajet qu'on est en train de
          publier, elle reste donc ici, juste sous le formulaire. */}
      <EncartInfo icone="time-outline" ton="attente">
        {t('annonces_regle_retard')}
      </EncartInfo>

      {/* La LISTE des trajets déjà publiés a quitté cet écran : elle vit dans
          la case « Mes trajets postés » du tableau de bord. Cette page ne fait
          plus qu'UNE chose — publier — et le chauffeur sait où retrouver le
          reste. */}
      <EncartInfo icone="bus-outline">{t('annonces_liste_deplacee')}</EncartInfo>
      <Bouton
        titre={t('courses_case_mes_trajets')}
        icone="arrow-forward-circle-outline"
        variante="secondaire"
        onPress={() => router.push('/(driver)/courses')}
      />
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
});
