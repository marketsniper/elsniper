// Fiche d'une PLACE en taxi partagé : le suivi complet côté client —
// étapes (réservée → payée → départ → terminée), taxi assigné, montant à
// régler avec la marche à suivre, et annulation au barème 24/48 h.
// Source : GET /rides/reservations (la place est retrouvée par son id).
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';

import { TimelineStatut } from '@/components/TimelineStatut';
import {
  Badge,
  Bouton,
  Carte,
  ChargementCentre,
  Ecran,
  EncartInfo,
  LigneInfo,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useRafraichissementAuto } from '@/lib/rafraichissementAuto';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, rayons } from '@/lib/theme';
import {
  formaterDate,
  formaterMontant,
  moyensPaiement,
  reglementPaiement,
  type MoyenPaiement,
  type ReservationPlace,
} from '@/lib/types';

const WHATSAPP_EQUIPE = 'https://wa.me/255666241749';

export default function EcranPlace() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT();
  const [place, setPlace] = useState<ReservationPlace | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargeAnnulation, setChargeAnnulation] = useState(false);
  // Moyen de paiement en cours d'enregistrement (n'anime que son bouton).
  const [moyenEnCours, setMoyenEnCours] = useState<MoyenPaiement | null>(null);
  const [introuvable, setIntrouvable] = useState(false);

  const charger = useCallback(async () => {
    if (!id) return;
    try {
      const places = await api.mesReservationsPlaces();
      const trouvee = places.find((p) => p.id === id) ?? null;
      setPlace(trouvee);
      setIntrouvable(!trouvee);
      setErreur('');
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('trip_introuvable'));
    }
  }, [id, t]);

  // Chargement à l'ouverture de la fiche (le rafraîchissement automatique
  // ne fait, lui, que revenir régulièrement ensuite).
  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );
  // La fiche se met à jour toute seule : dès que l'équipe valide le
  // paiement, le client voit « Paiement validé » sans rien toucher.
  useRafraichissementAuto(charger);

  if (!place) {
    return introuvable || erreur ? (
      <Ecran fond="palmiers">
        <TexteErreur>{erreur || t('trip_introuvable')}</TexteErreur>
        <Bouton
          titre={t('commun_retour_accueil')}
          icone="arrow-back-outline"
          variante="secondaire"
          onPress={() => router.replace('/(tabs)/trajets')}
        />
      </Ecran>
    ) : (
      <ChargementCentre message={t('trip_chargement')} />
    );
  }

  const montant = formaterMontant(place.amount, place.currency);
  const partie = new Date(place.departure_at).getTime() < Date.now();
  const terminee = place.ride_status === 'closed' || (partie && place.paid);
  // Étape courante de la fiche : réservée → payée → en route → terminée.
  const etapeCourante = place.cancelled
    ? 'reservee'
    : terminee
      ? 'terminee'
      : partie
        ? 'depart'
        : place.paid
          ? 'payee'
          : 'reservee';

  // Message WhatsApp de règlement, tout pré-rempli pour l'équipe.
  const messagePaiement = [
    '💳 Paiement place taxi partagé zanziGo',
    `Trajet: ${place.origin} → ${place.destination}`,
    `Départ: ${formaterDate(place.departure_at)}`,
    `Places: ${place.seats}`,
    `Montant: ${montant}`,
    `Réf: ${place.id}`,
    'Bonjour, je souhaite régler ma place — merci de me confirmer le moyen de paiement.',
  ].join('\n');

  // MOYENS DE PAIEMENT de la place. Le prix reste celui de la place ; le
  // règlement, lui, dépend du moyen : carte (prix + frais bancaires) ou
  // portefeuille mobile (converti en shillings, sans frais).
  const moyensDisponibles = place.moyens_disponibles ?? moyensPaiement(place.currency);
  const parCarte = reglementPaiement(place.amount, place.currency, 'carte');
  const parMobile = reglementPaiement(place.amount, place.currency, 'mobile');

  // Le client choisit son moyen : le serveur recalcule le montant et réécrit
  // le message de règlement, qu'on ouvre dans la foulée. Sans paiement
  // rattaché (cas très ancien), on retombe sur le message local.
  const reglerAvec = async (moyen: MoyenPaiement) => {
    setMoyenEnCours(moyen);
    setErreur('');
    try {
      const lienLocal = `${WHATSAPP_EQUIPE}?text=${encodeURIComponent(messagePaiement)}`;
      if (!place.payment_id) {
        await Linking.openURL(lienLocal);
        return;
      }
      const paiement = await api.choisirMoyenPaiement(place.payment_id, moyen);
      await Linking.openURL(String(paiement.payment_link ?? lienLocal));
      await charger();
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('trip_paiement_indisponible'));
    } finally {
      setMoyenEnCours(null);
    }
  };

  const annuler = () => {
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
          setChargeAnnulation(true);
          setErreur('');
          try {
            const resultat = await api.annulerReservationPlace(place.id);
            await charger();
            if (resultat.refund) {
              Alert.alert(
                t('trip_annulee_titre'),
                t('place_annulee_rembours', {
                  montant: formaterMontant(resultat.refund.amount, resultat.refund.currency),
                })
              );
            }
          } catch (e) {
            setErreur(e instanceof ErreurApi ? e.message : t('commun_annulation_impossible'));
          } finally {
            setChargeAnnulation(false);
          }
        },
      },
    ]);
  };

  return (
    <Ecran fond="palmiers" onRefresh={charger}>
      <Carte>
        <View style={styles.enTete}>
          <Titre>{t('place_fiche_titre')}</Titre>
          {place.cancelled ? (
            <Badge texte={t('places_annulee')} ton="danger" />
          ) : place.paid ? (
            <Badge texte={t('places_payee')} ton="succes" />
          ) : (
            <Badge texte={t('places_a_payer')} ton="attente" />
          )}
        </View>
        <Text style={styles.itineraire}>
          {place.origin}  <Text style={styles.fleche}>→</Text>  {place.destination}
        </Text>
        <LigneInfo label={t('place_depart')} valeur={formaterDate(place.departure_at)} />
        <LigneInfo label={t('places_titre')} valeur={t('places_detail', { n: place.seats })} />
        {!!place.driver_name && (
          <LigneInfo label={t('trip_taxi_chauffeur')} valeur={String(place.driver_name)} />
        )}
        {!!place.vehicle_model && (
          <LigneInfo label={t('trip_taxi_modele')} valeur={String(place.vehicle_model)} />
        )}
        {!!place.vehicle_plate && (
          <View style={styles.blocPlaque}>
            <Text style={styles.labelPlaque}>{t('trip_taxi_plaque')}</Text>
            <Text style={styles.plaque}>{String(place.vehicle_plate)}</Text>
          </View>
        )}
        <View style={styles.blocPrix}>
          <Text style={styles.labelPrix}>{t('place_montant')}</Text>
          <Text style={styles.prix}>{montant}</Text>
        </View>
      </Carte>

      <Carte>
        <Text style={styles.titreSuivi}>{t('trip_suivi')}</Text>
        <TimelineStatut
          etapes={[
            { cle: 'reservee', label: t('place_etape_reservee') },
            { cle: 'payee', label: t('place_etape_payee') },
            { cle: 'depart', label: t('place_etape_depart') },
            { cle: 'terminee', label: t('place_etape_terminee') },
          ]}
          statutCourant={etapeCourante}
          annule={place.cancelled}
        />
      </Carte>

      {/* Paiement : tant que l'équipe n'a pas validé, la marche à suivre est
          affichée noir sur blanc — le client sait quoi faire. */}
      {!place.cancelled && !place.paid && (
        <>
          <EncartInfo icone="cash-outline" ton="attente">
            {t('place_paiement_instructions', { montant })}
          </EncartInfo>
          {moyensDisponibles.length > 1 ? (
            <>
              <Text style={styles.titreMoyens}>{t('paiement_choix_titre')}</Text>
              <Bouton
                titre={t('paiement_carte', {
                  montant: formaterMontant(parCarte.montant, parCarte.devise),
                })}
                icone="card-outline"
                onPress={() => reglerAvec('carte')}
                charge={moyenEnCours === 'carte'}
                desactive={moyenEnCours !== null && moyenEnCours !== 'carte'}
              />
              <Text style={styles.detailMoyen}>
                {t('paiement_carte_detail', {
                  prix: montant,
                  frais: formaterMontant(parCarte.surcharge, parCarte.devise),
                })}
              </Text>
              <Bouton
                titre={t('paiement_mobile', {
                  montant: formaterMontant(parMobile.montant, parMobile.devise),
                })}
                icone="phone-portrait-outline"
                variante="secondaire"
                onPress={() => reglerAvec('mobile')}
                charge={moyenEnCours === 'mobile'}
                desactive={moyenEnCours !== null && moyenEnCours !== 'mobile'}
              />
              <Text style={styles.detailMoyen}>{t('paiement_mobile_detail')}</Text>
            </>
          ) : (
            <Bouton
              titre={t('place_payer_bouton', { montant })}
              icone="phone-portrait-outline"
              onPress={() => reglerAvec('mobile')}
              charge={moyenEnCours === 'mobile'}
            />
          )}
        </>
      )}
      {place.paid && !place.cancelled && (
        <EncartInfo icone="checkmark-circle-outline" ton="succes">
          {t('place_paiement_valide')}
        </EncartInfo>
      )}

      {place.cancellable && !place.cancelled && (
        <Bouton
          titre={t('place_annuler')}
          icone="close-circle-outline"
          variante="danger"
          onPress={annuler}
          charge={chargeAnnulation}
        />
      )}
      {!place.cancellable && place.paid && !place.cancelled && (
        <Text style={styles.note}>{t('place_trop_tard')}</Text>
      )}
      <Text style={styles.note}>{t('resa_regle_annulation')}</Text>

      <TexteErreur>{erreur}</TexteErreur>
      <Bouton
        titre={t('commun_contact_whatsapp')}
        icone="logo-whatsapp"
        variante="secondaire"
        onPress={() => Linking.openURL(WHATSAPP_EQUIPE)}
      />
      <Bouton
        titre={t('commun_retour_accueil')}
        icone="arrow-back-outline"
        variante="secondaire"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/trajets'))}
      />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  titreMoyens: {
    color: couleurs.encre,
    fontWeight: '700',
    fontSize: 15,
    marginTop: espaces.s,
  },
  // Ligne d'explication sous chaque bouton de paiement (frais, sans frais).
  detailMoyen: {
    color: couleurs.texteSecondaire,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -espaces.xs,
    marginBottom: espaces.s,
  },
  enTete: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  itineraire: {
    fontSize: 17,
    fontWeight: '700',
    color: couleurs.encre,
    lineHeight: 24,
  },
  fleche: {
    color: couleurs.primaire,
  },
  blocPrix: {
    marginTop: espaces.s,
    paddingTop: espaces.m,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    alignItems: 'center',
    gap: 2,
  },
  labelPrix: {
    fontSize: 14,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  prix: {
    fontSize: 26,
    fontWeight: '800',
    color: couleurs.primaire,
  },
  blocPlaque: {
    marginTop: espaces.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelPlaque: {
    fontSize: 14,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  plaque: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
    color: couleurs.encre,
    backgroundColor: couleurs.sable,
    borderWidth: 1.5,
    borderColor: couleurs.encre,
    borderRadius: 6,
    paddingHorizontal: espaces.m,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  titreSuivi: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
    marginBottom: espaces.s,
  },
  note: {
    fontSize: 12.5,
    color: couleurs.texteSecondaire,
    lineHeight: 18,
  },
});
