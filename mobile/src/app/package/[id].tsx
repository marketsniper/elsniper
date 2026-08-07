// Détail d'un colis : QR code (PKG-…) à présenter au chauffeur, suivi
// Créé → Payé → Ramassé → Livré, paiement quand le colis vient d'être créé.
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { TimelineStatut } from '@/components/TimelineStatut';
import {
  BadgeStatutColis,
  Bouton,
  Carte,
  ChargementCentre,
  Ecran,
  EncartInfo,
  LigneInfo,
  SousTitre,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
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
      <ChargementCentre message="Chargement de votre colis…" />
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

  return (
    <Ecran>
      <Carte style={styles.carteQr}>
        <View style={styles.enTeteQr}>
          <Titre>Votre colis</Titre>
          <BadgeStatutColis statut={statut} />
        </View>
        {codeQr ? (
          <View style={styles.cadreQr}>
            <QRCode
              value={codeQr}
              size={180}
              color={couleurs.encre}
              backgroundColor={couleurs.blanc}
            />
            <Text style={styles.codeTexte}>{codeQr}</Text>
          </View>
        ) : (
          <TexteErreur>QR code indisponible.</TexteErreur>
        )}
        <SousTitre centre>Présentez ce QR au chauffeur</SousTitre>
        <Text style={styles.consigne}>
          Il le scanne au ramassage puis à la livraison.
        </Text>
      </Carte>

      <Carte>
        <LigneInfo
          label="Collecte"
          valeur={String(champ(colis, 'pickup_location', 'pickupLocation') ?? '—')}
        />
        <LigneInfo
          label="Livraison"
          valeur={String(champ(colis, 'dropoff_location', 'dropoffLocation') ?? '—')}
        />
        <LigneInfo
          label="Destinataire"
          valeur={String(champ(colis, 'recipient_name', 'recipientName') ?? '—')}
        />
        <LigneInfo
          label="Téléphone"
          valeur={String(champ(colis, 'recipient_phone', 'recipientPhone') ?? '—')}
        />
        {!!champ(colis, 'description') && (
          <LigneInfo label="Description" valeur={String(champ(colis, 'description'))} />
        )}
        <LigneInfo label="Prix" valeur={formaterPrix(colis)} />
      </Carte>

      <Carte>
        <Text style={styles.titreSuivi}>Suivi du colis</Text>
        <TimelineStatut
          etapes={ETAPES_COLIS.map((cle) => ({ cle, label: LIBELLES_STATUT_COLIS[cle] }))}
          statutCourant={statut}
        />
      </Carte>

      {peutPayer && (
        <Bouton titre="Payer l'envoi" icone="card-outline" onPress={payer} charge={chargePaiement} />
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
          Paiement reçu — un chauffeur va ramasser votre colis.
        </EncartInfo>
      )}

      <Bouton
        titre="Contacter l'équipe WhatsApp"
        icone="logo-whatsapp"
        variante="secondaire"
        onPress={() => Linking.openURL(lienWhatsapp)}
      />

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
  carteQr: {
    alignItems: 'center',
  },
  enTeteQr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
  },
  cadreQr: {
    alignItems: 'center',
    gap: espaces.s,
    padding: espaces.l,
    marginVertical: espaces.s,
    backgroundColor: couleurs.blanc,
    borderRadius: rayons.carte,
    ...ombres.douce,
  },
  codeTexte: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: couleurs.texteSecondaire,
  },
  consigne: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
    textAlign: 'center',
  },
  titreSuivi: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
    marginBottom: espaces.s,
  },
});
