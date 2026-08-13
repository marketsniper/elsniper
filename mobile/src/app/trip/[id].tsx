// Détail / confirmation d'un trajet : récap prix figé, timeline de statut,
// paiement Pesapal (uniquement après confirmation du chauffeur), contact
// WhatsApp équipe et notation quand la course est terminée
// (POST /trips/:id/rating {rating, comment?}).
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Etoiles } from '@/components/Etoiles';
import { TimelineStatut } from '@/components/TimelineStatut';
import {
  BadgeStatutTrajet,
  Bouton,
  Carte,
  Champ,
  ChargementCentre,
  Ecran,
  EncartInfo,
  LigneInfo,
  SousTitre,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRafraichissementAuto } from '@/lib/rafraichissementAuto';
import { libelleStatutTrajet, libelleTypeTrajet, useT } from '@/lib/i18n';
import { couleurs, espaces } from '@/lib/theme';
import {
  champ,
  ETAPES_TRAJET,
  formaterDate,
  formaterMontant,
  formaterPrix,
  tauxRemboursement,
  type StatutTrajet,
  type Trajet,
  type TypeTrajet,
} from '@/lib/types';

// Contact WhatsApp de l'équipe zanziGo (secours si whatsapp_link absent).
const WHATSAPP_EQUIPE = 'https://wa.me/255666241749';

export default function EcranTrajet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT();
  const { session } = useAuth();
  const [trajet, setTrajet] = useState<Trajet | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargePaiement, setChargePaiement] = useState(false);
  // Crédit prépayé (hôtels) : solde chargé au focus, bouton dédié si suffisant.
  const [soldeCredit, setSoldeCredit] = useState<number | null>(null);
  const [chargeCredit, setChargeCredit] = useState(false);
  const hotelId = session?.hotel?.id ?? null;
  // Paiement créé sur cet écran (pour la simulation de confirmation en dev).
  const [paiementId, setPaiementId] = useState<string | null>(null);
  // 'paypal' = circuit automatique (bouton « J'ai payé — vérifier »).
  const [methodePaiement, setMethodePaiement] = useState<string>('manual');
  const [chargeConfirmation, setChargeConfirmation] = useState(false);
  const [note, setNote] = useState(0);
  const [commentaire, setCommentaire] = useState('');
  const [chargeNote, setChargeNote] = useState(false);
  const [noteEnvoyee, setNoteEnvoyee] = useState(false);
  const [chargeAnnulation, setChargeAnnulation] = useState(false);

  const charger = useCallback(async () => {
    if (!id) return;
    try {
      setTrajet(await api.obtenirTrajet(id));
      setErreur('');
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('trip_introuvable'));
    }
  }, [id, t]);

  // La fiche se met à jour toute seule : chauffeur confirmé par l'équipe,
  // paiement validé… le client voit l'avancement sans rien toucher.
  useRafraichissementAuto(charger);

  useFocusEffect(
    useCallback(() => {
      charger();
      if (hotelId) {
        api
          .creditHotel(hotelId)
          .then((c) => setSoldeCredit(c.balance))
          .catch(() => setSoldeCredit(null));
      }
    }, [charger, hotelId])
  );

  if (!trajet) {
    return erreur ? (
      <Ecran fond="palmiers">
        <TexteErreur>{erreur}</TexteErreur>
      </Ecran>
    ) : (
      <ChargementCentre message={t('trip_chargement')} />
    );
  }

  const statut = champ<StatutTrajet>(trajet, 'status', 'statut');
  const typeTrajet = champ<TypeTrajet>(trajet, 'trip_type', 'tripType');
  const nomClient = champ<string>(trajet, 'client_name', 'clientName');
  // Le taxi assigné : dès que l'équipe a confirmé un chauffeur, le client
  // sait qui vient le chercher — nom, plaque d'immatriculation, modèle.
  const nomChauffeur = champ<string>(trajet, 'driver_name', 'driverName');
  const plaqueTaxi = champ<string>(trajet, 'vehicle_plate', 'vehiclePlate');
  const modeleTaxi = champ<string>(trajet, 'vehicle_model', 'vehicleModel');
  const lienWhatsapp = champ<string>(trajet, 'whatsapp_link', 'whatsappLink') ?? WHATSAPP_EQUIPE;
  const annule = statut === 'cancelled';
  // Règle serveur : le paiement n'est possible qu'après confirmation d'un chauffeur.
  const peutPayer = statut === 'driver_confirmed';
  // Annulation par le réservateur : libre avant paiement. Course PAYÉE avec
  // départ planifié : barème 24/48 h — remboursement 100 % à +48 h, 50 %
  // entre 24 h et 48 h, refusée à moins de 24 h (même règle côté serveur).
  const tauxRembours =
    statut === 'paid'
      ? tauxRemboursement(champ<string>(trajet, 'scheduled_at', 'scheduledAt'))
      : null;
  const peutAnnuler =
    statut === 'requested' || statut === 'driver_confirmed' || tauxRembours !== null;
  // Notation : course terminée, jamais notée (rating null côté serveur).
  const dejaNotee = champ<number>(trajet, 'rating') !== undefined;
  const peutNoter = statut === 'completed' && !dejaNotee && !noteEnvoyee;

  // Paiement en un geste avec le crédit prépayé de l'hôtel.
  const payerAvecCredit = async () => {
    setChargeCredit(true);
    setErreur('');
    try {
      const paiement = await api.payerTrajetAvecCredit(trajet.id);
      if (hotelId) {
        api.creditHotel(hotelId).then((c) => setSoldeCredit(c.balance)).catch(() => {});
      }
      await charger();
      // L'équipe est prévenue automatiquement par le serveur (e-mail).
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('trip_paiement_indisponible'));
    } finally {
      setChargeCredit(false);
    }
  };

  const payer = async () => {
    setChargePaiement(true);
    setErreur('');
    try {
      const paiement = await api.payerTrajet(trajet.id);
      setPaiementId(paiement.id ?? null);
      setMethodePaiement(String(paiement.payment_method ?? 'manual'));
      if (paiement.payment_link) {
        await Linking.openURL(paiement.payment_link);
      } else {
        setErreur(t('trip_lien_indisponible'));
      }
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('trip_paiement_indisponible'));
    } finally {
      setChargePaiement(false);
    }
  };

  // En dev/stub Pesapal : simule le webhook de confirmation du paiement.
  const simulerConfirmation = async () => {
    if (!paiementId) return;
    setChargeConfirmation(true);
    setErreur('');
    try {
      await api.confirmerPaiement(paiementId);
      setPaiementId(null);
      await charger();
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('trip_confirmation_impossible'));
    } finally {
      setChargeConfirmation(false);
    }
  };

  // Annulation avec confirmation (dialogue natif) — irréversible. Course
  // payée : le message précise le remboursement (100 % ou 50 %).
  const annuler = () => {
    const prix = Number(champ(trajet, 'price') ?? 0);
    const devise = String(champ(trajet, 'currency') ?? 'USD');
    const message =
      tauxRembours !== null
        ? t('trip_annuler_confirm_rembours', {
            montant: formaterMontant(Math.round(prix * tauxRembours * 100) / 100, devise),
            taux: String(tauxRembours * 100),
          })
        : t('trip_annuler_confirm');
    Alert.alert(t('trip_annuler'), message, [
      { text: t('commun_confirmer_non'), style: 'cancel' },
      {
        text: t('commun_confirmer_oui'),
        style: 'destructive',
        onPress: async () => {
          setChargeAnnulation(true);
          setErreur('');
          try {
            const resultat = await api.annulerTrajet(trajet.id);
            await charger();
            // Remboursement dû : l'équipe est prévenue automatiquement par
            // le serveur (e-mail).
            const refund = champ<{ amount: number; currency: string }>(resultat, 'refund');
            if (refund) {
              Alert.alert(
                t('trip_annulee_titre'),
                t('trip_annulee_rembours', {
                  montant: formaterMontant(refund.amount, refund.currency),
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

  const envoyerNote = async () => {
    if (note < 1) {
      setErreur(t('trip_note_erreur'));
      return;
    }
    setChargeNote(true);
    setErreur('');
    try {
      await api.noterTrajet(trajet.id, note, commentaire.trim() || undefined);
      setNoteEnvoyee(true);
    } catch (e) {
      if (e instanceof ErreurApi && e.code === 'already_rated') {
        setNoteEnvoyee(true);
      } else {
        setErreur(e instanceof ErreurApi ? e.message : t('trip_note_envoi_erreur'));
      }
    } finally {
      setChargeNote(false);
    }
  };

  return (
    <Ecran fond="palmiers" onRefresh={charger}>
      <Carte>
        <View style={styles.enTete}>
          <Titre>{t('trip_titre')}</Titre>
          <BadgeStatutTrajet statut={statut} />
        </View>
        {typeTrajet && (
          <LigneInfo label={t('commun_type')} valeur={libelleTypeTrajet(typeTrajet, t)} />
        )}
        {!!nomClient && <LigneInfo label={t('commun_client')} valeur={String(nomClient)} />}
        <LigneInfo
          label={t('commun_depart')}
          valeur={String(champ(trajet, 'pickup_location', 'pickupLocation') ?? '—')}
        />
        <LigneInfo
          label={t('commun_arrivee')}
          valeur={String(champ(trajet, 'dropoff_location', 'dropoffLocation') ?? '—')}
        />
        {!!champ(trajet, 'scheduled_at', 'scheduledAt') && (
          <LigneInfo
            label={t('trip_programme_le')}
            valeur={formaterDate(champ(trajet, 'scheduled_at', 'scheduledAt'))}
          />
        )}
        {/* Transfert aéroport : n° de vol suivi par l'équipe. */}
        {!!champ(trajet, 'flight_number', 'flightNumber') && (
          <LigneInfo
            label={t('trip_vol')}
            valeur={`✈️ ${champ(trajet, 'flight_number', 'flightNumber')}`}
          />
        )}
        {champ<boolean>(trajet, 'round_trip', 'roundTrip') === true && (
          <LigneInfo label={t('trip_aller_retour')} valeur={t('trip_aller_retour_valeur')} />
        )}
        {(champ<boolean>(trajet, 'baby_seat', 'babySeat') === true ||
          champ<boolean>(trajet, 'bulky_luggage', 'bulkyLuggage') === true) && (
          <LigneInfo
            label={t('trip_options')}
            valeur={[
              champ<boolean>(trajet, 'baby_seat', 'babySeat') === true
                ? t('reserver_siege_bebe')
                : null,
              champ<boolean>(trajet, 'bulky_luggage', 'bulkyLuggage') === true
                ? t('reserver_gros_bagages')
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        )}
        <View style={styles.blocPrix}>
          <Text style={styles.labelPrix}>{t('trip_prix_fige')}</Text>
          <Text style={styles.prix}>{formaterPrix(trajet)}</Text>
        </View>
      </Carte>

      {/* Votre taxi : visible dès l'assignation, essentiel une fois la
          course payée — le client reconnaît le véhicule au premier regard. */}
      {!annule && !!nomChauffeur && (
        <Carte>
          <View style={styles.enTeteTaxi}>
            <Ionicons name="car-sport" size={22} color={couleurs.primaire} />
            <Text style={styles.titreTaxi}>{t('trip_taxi_titre')}</Text>
          </View>
          <LigneInfo label={t('trip_taxi_chauffeur')} valeur={String(nomChauffeur)} />
          <LigneInfo label={t('trip_taxi_modele')} valeur={String(modeleTaxi ?? '—')} />
          <View style={styles.blocPlaque}>
            <Text style={styles.labelPlaque}>{t('trip_taxi_plaque')}</Text>
            <Text style={styles.plaque}>{String(plaqueTaxi ?? '—')}</Text>
          </View>
        </Carte>
      )}

      <Carte>
        <Text style={styles.titreSuivi}>{t('trip_suivi')}</Text>
        <TimelineStatut
          etapes={ETAPES_TRAJET.map((cle) => ({ cle, label: libelleStatutTrajet(cle, t) }))}
          statutCourant={statut}
          annule={annule}
        />
      </Carte>

      {statut === 'requested' && (
        <EncartInfo icone="time-outline" ton="attente">
          {t('trip_demande_envoyee')}
        </EncartInfo>
      )}
      {/* Hôtel avec crédit suffisant : paiement en un geste, sans circuit externe. */}
      {peutPayer &&
        hotelId &&
        soldeCredit !== null &&
        soldeCredit >= Number(champ(trajet, 'price') ?? Infinity) && (
          <Bouton
            titre={`${t('trip_payer_credit')} (${formaterMontant(soldeCredit, 'USD')})`}
            icone="wallet-outline"
            onPress={payerAvecCredit}
            charge={chargeCredit}
          />
        )}
      {peutPayer && (
        <Bouton
          titre={t('trip_payer')}
          icone="card-outline"
          onPress={payer}
          charge={chargePaiement}
        />
      )}
      {peutPayer && paiementId && (methodePaiement === 'paypal' || methodePaiement === 'pesapal') && (
        <Bouton
          titre={t('trip_verifier_paiement')}
          icone="shield-checkmark-outline"
          variante="secondaire"
          onPress={simulerConfirmation}
          charge={chargeConfirmation}
        />
      )}
      {__DEV__ && peutPayer && paiementId && methodePaiement !== 'paypal' && methodePaiement !== 'pesapal' && (
        <Bouton
          titre={t('trip_confirm_dev')}
          variante="secondaire"
          onPress={simulerConfirmation}
          charge={chargeConfirmation}
        />
      )}
      {peutAnnuler && (
        <Bouton
          titre={t('trip_annuler')}
          icone="close-circle-outline"
          variante="danger"
          onPress={annuler}
          charge={chargeAnnulation}
        />
      )}
      {statut === 'paid' && (
        <EncartInfo icone="checkmark-circle-outline">{t('trip_paiement_recu')}</EncartInfo>
      )}

      {!annule && (
        <Bouton
          titre={t('commun_contact_whatsapp')}
          icone="logo-whatsapp"
          variante="secondaire"
          onPress={() => Linking.openURL(lienWhatsapp)}
        />
      )}

      {statut === 'completed' && (
        <Carte>
          {noteEnvoyee || dejaNotee ? (
            <View style={styles.blocNote}>
              <Ionicons name="checkmark-circle" size={22} color={couleurs.succes} />
              <Text style={styles.merci}>{t('trip_note_merci')}</Text>
            </View>
          ) : peutNoter ? (
            <>
              <SousTitre>{t('trip_note_question')}</SousTitre>
              <View style={styles.etoilesCentrees}>
                <Etoiles note={note} onChange={setNote} taille={40} />
              </View>
              <Champ
                label={t('trip_note_commentaire')}
                value={commentaire}
                onChangeText={setCommentaire}
                placeholder={t('trip_note_placeholder')}
                multiline
              />
              <Bouton
                titre={t('trip_note_envoyer')}
                icone="star-outline"
                onPress={envoyerNote}
                charge={chargeNote}
              />
            </>
          ) : null}
        </Carte>
      )}

      <TexteErreur>{erreur}</TexteErreur>
      <Bouton
        titre={t('commun_actualiser_statut')}
        icone="refresh-outline"
        variante="secondaire"
        onPress={charger}
      />
      {/* Retour toujours possible depuis la fiche — course terminée
          comprise : le client repart faire une autre action. */}
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
  enTete: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  blocPrix: {
    marginTop: espaces.s,
    paddingTop: espaces.m,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelPrix: {
    fontSize: 14,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  prix: {
    fontSize: 24,
    fontWeight: '800',
    color: couleurs.primaire,
  },
  titreSuivi: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
    marginBottom: espaces.s,
  },
  enTeteTaxi: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    marginBottom: espaces.s,
  },
  titreTaxi: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
  },
  // La plaque en évidence, façon plaque d'immatriculation.
  blocPlaque: {
    marginTop: espaces.s,
    paddingTop: espaces.m,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
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
  blocNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
  },
  merci: {
    fontSize: 15,
    fontWeight: '600',
    color: couleurs.encre,
  },
  etoilesCentrees: {
    alignItems: 'center',
    paddingVertical: espaces.s,
  },
});
