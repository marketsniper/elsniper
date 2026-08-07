// Détail / confirmation d'un trajet : récap prix figé, timeline de statut,
// paiement Pesapal (uniquement après confirmation du chauffeur), contact
// WhatsApp équipe et notation quand la course est terminée
// (POST /trips/:id/rating {rating, comment?}).
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

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
import { couleurs, espaces } from '@/lib/theme';
import {
  champ,
  ETAPES_TRAJET,
  formaterDate,
  formaterPrix,
  LIBELLES_STATUT_TRAJET,
  LIBELLES_TYPE_TRAJET,
  type StatutTrajet,
  type Trajet,
  type TypeTrajet,
} from '@/lib/types';

// Contact WhatsApp de l'équipe zanziGo (secours si whatsapp_link absent).
const WHATSAPP_EQUIPE = 'https://wa.me/255779000000';

export default function EcranTrajet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trajet, setTrajet] = useState<Trajet | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargePaiement, setChargePaiement] = useState(false);
  // Paiement créé sur cet écran (pour la simulation de confirmation en dev).
  const [paiementId, setPaiementId] = useState<string | null>(null);
  const [chargeConfirmation, setChargeConfirmation] = useState(false);
  const [note, setNote] = useState(0);
  const [commentaire, setCommentaire] = useState('');
  const [chargeNote, setChargeNote] = useState(false);
  const [noteEnvoyee, setNoteEnvoyee] = useState(false);

  const charger = useCallback(async () => {
    if (!id) return;
    try {
      setTrajet(await api.obtenirTrajet(id));
      setErreur('');
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : 'Trajet introuvable.');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (!trajet) {
    return erreur ? (
      <Ecran>
        <TexteErreur>{erreur}</TexteErreur>
      </Ecran>
    ) : (
      <ChargementCentre message="Chargement de votre course…" />
    );
  }

  const statut = champ<StatutTrajet>(trajet, 'status', 'statut');
  const typeTrajet = champ<TypeTrajet>(trajet, 'trip_type', 'tripType');
  const nomClient = champ<string>(trajet, 'client_name', 'clientName');
  const lienWhatsapp = champ<string>(trajet, 'whatsapp_link', 'whatsappLink') ?? WHATSAPP_EQUIPE;
  const annule = statut === 'cancelled';
  // Règle serveur : le paiement n'est possible qu'après confirmation d'un chauffeur.
  const peutPayer = statut === 'driver_confirmed';
  // Notation : course terminée, jamais notée (rating null côté serveur).
  const dejaNotee = champ<number>(trajet, 'rating') !== undefined;
  const peutNoter = statut === 'completed' && !dejaNotee && !noteEnvoyee;

  const payer = async () => {
    setChargePaiement(true);
    setErreur('');
    try {
      const paiement = await api.payerTrajet(trajet.id);
      setPaiementId(paiement.id ?? null);
      if (paiement.payment_link) {
        await Linking.openURL(paiement.payment_link);
      } else {
        setErreur("Le lien de paiement n'est pas encore disponible.");
      }
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : 'Paiement indisponible pour le moment.');
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
      setErreur(e instanceof ErreurApi ? e.message : 'Confirmation impossible.');
    } finally {
      setChargeConfirmation(false);
    }
  };

  const envoyerNote = async () => {
    if (note < 1) {
      setErreur('Choisissez une note de 1 à 5 étoiles.');
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
        setErreur(e instanceof ErreurApi ? e.message : "Impossible d'envoyer la note.");
      }
    } finally {
      setChargeNote(false);
    }
  };

  return (
    <Ecran>
      <Carte>
        <View style={styles.enTete}>
          <Titre>Votre course</Titre>
          <BadgeStatutTrajet statut={statut} />
        </View>
        {typeTrajet && (
          <LigneInfo label="Type" valeur={LIBELLES_TYPE_TRAJET[typeTrajet] ?? typeTrajet} />
        )}
        {!!nomClient && <LigneInfo label="Client" valeur={String(nomClient)} />}
        <LigneInfo
          label="Départ"
          valeur={String(champ(trajet, 'pickup_location', 'pickupLocation') ?? '—')}
        />
        <LigneInfo
          label="Arrivée"
          valeur={String(champ(trajet, 'dropoff_location', 'dropoffLocation') ?? '—')}
        />
        {!!champ(trajet, 'scheduled_at', 'scheduledAt') && (
          <LigneInfo
            label="Programmé le"
            valeur={formaterDate(champ(trajet, 'scheduled_at', 'scheduledAt'))}
          />
        )}
        <View style={styles.blocPrix}>
          <Text style={styles.labelPrix}>Prix figé</Text>
          <Text style={styles.prix}>{formaterPrix(trajet)}</Text>
        </View>
      </Carte>

      <Carte>
        <Text style={styles.titreSuivi}>Suivi de la course</Text>
        <TimelineStatut
          etapes={ETAPES_TRAJET.map((cle) => ({ cle, label: LIBELLES_STATUT_TRAJET[cle] }))}
          statutCourant={statut}
          annule={annule}
        />
      </Carte>

      {statut === 'requested' && (
        <EncartInfo icone="time-outline" ton="attente">
          Demande envoyée — l&apos;équipe zanziGo vous confirme un chauffeur, puis le paiement
          sera proposé ici.
        </EncartInfo>
      )}
      {peutPayer && (
        <Bouton titre="Payer la course" icone="card-outline" onPress={payer} charge={chargePaiement} />
      )}
      {__DEV__ && peutPayer && paiementId && (
        <Bouton
          titre="Simuler la confirmation (dev)"
          variante="secondaire"
          onPress={simulerConfirmation}
          charge={chargeConfirmation}
        />
      )}
      {statut === 'paid' && (
        <EncartInfo icone="checkmark-circle-outline">
          Paiement reçu — votre chauffeur scanne le QR de son véhicule au départ.
        </EncartInfo>
      )}

      {!annule && (
        <Bouton
          titre="Contacter l'équipe WhatsApp"
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
              <Text style={styles.merci}>Merci pour votre note !</Text>
            </View>
          ) : peutNoter ? (
            <>
              <SousTitre>Comment s&apos;est passée votre course ?</SousTitre>
              <View style={styles.etoilesCentrees}>
                <Etoiles note={note} onChange={setNote} taille={40} />
              </View>
              <Champ
                label="Commentaire (optionnel)"
                value={commentaire}
                onChangeText={setCommentaire}
                placeholder="Chauffeur ponctuel, très bonne course…"
                multiline
              />
              <Bouton
                titre="Envoyer ma note"
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
        titre="Actualiser le statut"
        icone="refresh-outline"
        variante="secondaire"
        onPress={charger}
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
