// Détail d'un colis : QR code (PKG-…) à présenter au chauffeur, suivi
// Créé → Payé → Ramassé → Livré, paiement quand le colis vient d'être créé.
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { TimelineStatut } from '@/components/TimelineStatut';
import {
  Badge,
  Bouton,
  Carte,
  ChargementCentre,
  Ecran,
  LigneInfo,
  SousTitre,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { couleurs, espaces } from '@/lib/theme';
import {
  champ,
  ETAPES_COLIS,
  formaterPrix,
  LIBELLES_STATUT_COLIS,
  type Colis,
  type StatutColis,
} from '@/lib/types';

// Contact WhatsApp de l'équipe zanziGo (secours si whatsapp_link absent).
const WHATSAPP_EQUIPE = 'https://wa.me/255779000000';

export default function EcranDetailColis() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [colis, setColis] = useState<Colis | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargePaiement, setChargePaiement] = useState(false);
  // Paiement créé sur cet écran (pour la simulation de confirmation en dev).
  const [paiementId, setPaiementId] = useState<string | null>(null);
  const [chargeConfirmation, setChargeConfirmation] = useState(false);

  const charger = useCallback(async () => {
    if (!id) return;
    try {
      setColis(await api.obtenirColis(id));
      setErreur('');
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : 'Colis introuvable.');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (!colis) {
    return erreur ? (
      <Ecran>
        <TexteErreur>{erreur}</TexteErreur>
      </Ecran>
    ) : (
      <ChargementCentre />
    );
  }

  const statut = champ<StatutColis>(colis, 'status', 'statut');
  const codeQr = champ<string>(colis, 'qr_code', 'qrCode');
  const lienWhatsapp = champ<string>(colis, 'whatsapp_link', 'whatsappLink') ?? WHATSAPP_EQUIPE;
  // Règle serveur : le paiement n'est possible que sur un colis nouvellement créé.
  const peutPayer = statut === 'created';

  const payer = async () => {
    setChargePaiement(true);
    setErreur('');
    try {
      const paiement = await api.payerColis(colis.id);
      setPaiementId(paiement.id ?? null);
      if (paiement.payment_link) {
        await Linking.openURL(paiement.payment_link);
      } else {
        setErreur("Le lien de paiement n'est pas encore disponible.");
      }
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : 'Paiement indisponible.');
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

  return (
    <Ecran>
      <Carte style={styles.carteQr}>
        <Titre>Votre colis</Titre>
        <SousTitre>
          Présentez ce QR code au chauffeur : il le scanne au ramassage puis à la livraison.
        </SousTitre>
        {codeQr ? (
          <View style={styles.blocQr}>
            <QRCode value={codeQr} size={180} color={couleurs.encre} backgroundColor={couleurs.blanc} />
            <Text style={styles.codeTexte}>{codeQr}</Text>
          </View>
        ) : (
          <TexteErreur>QR code indisponible.</TexteErreur>
        )}
        <Badge
          texte={statut ? LIBELLES_STATUT_COLIS[statut] ?? statut : '—'}
          ton={statut === 'delivered' ? 'succes' : statut === 'created' ? 'attente' : 'primaire'}
        />
      </Carte>

      <Carte>
        <LigneInfo label="Collecte" valeur={String(champ(colis, 'pickup_location', 'pickupLocation') ?? '—')} />
        <LigneInfo label="Livraison" valeur={String(champ(colis, 'dropoff_location', 'dropoffLocation') ?? '—')} />
        <LigneInfo label="Destinataire" valeur={String(champ(colis, 'recipient_name', 'recipientName') ?? '—')} />
        <LigneInfo label="Téléphone" valeur={String(champ(colis, 'recipient_phone', 'recipientPhone') ?? '—')} />
        {!!champ(colis, 'description') && (
          <LigneInfo label="Description" valeur={String(champ(colis, 'description'))} />
        )}
        <LigneInfo label="Prix" valeur={formaterPrix(colis)} />
      </Carte>

      <Carte>
        <SousTitre>Suivi du colis</SousTitre>
        <TimelineStatut
          etapes={ETAPES_COLIS.map((cle) => ({ cle, label: LIBELLES_STATUT_COLIS[cle] }))}
          statutCourant={statut}
        />
      </Carte>

      {peutPayer && (
        <Bouton titre="Payer l'envoi (Pesapal)" onPress={payer} charge={chargePaiement} />
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
        <SousTitre>Paiement reçu — un chauffeur va ramasser votre colis.</SousTitre>
      )}

      <Bouton
        titre="Contacter l'équipe WhatsApp"
        variante="secondaire"
        onPress={() => Linking.openURL(lienWhatsapp)}
      />

      <TexteErreur>{erreur}</TexteErreur>
      <Bouton titre="Actualiser le statut" variante="secondaire" onPress={charger} />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  carteQr: {
    alignItems: 'center',
  },
  blocQr: {
    alignItems: 'center',
    gap: espaces.s,
    paddingVertical: espaces.m,
  },
  codeTexte: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: couleurs.texteSecondaire,
  },
});
