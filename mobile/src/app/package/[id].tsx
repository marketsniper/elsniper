// Détail d'un colis : QR code (PKG-…) à présenter au chauffeur, suivi
// Créé → Payé → Ramassé → Livré, paiement quand le colis vient d'être créé.
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Share, StyleSheet, Text, View } from 'react-native';
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
import { libelleStatutColis, libelleTailleColis, useT } from '@/lib/i18n';

import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import {
  champ,
  ETAPES_COLIS,
  formaterPrix,
  type Colis,
  type StatutColis,
  type TailleColis,
} from '@/lib/types';

// Contact WhatsApp de l'équipe zanziGo (secours si whatsapp_link absent).
const WHATSAPP_EQUIPE = 'https://wa.me/255666241749';

export default function EcranDetailColis() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();
  const [colis, setColis] = useState<Colis | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargePaiement, setChargePaiement] = useState(false);
  // Paiement créé sur cet écran (pour la simulation de confirmation en dev).
  const [paiementId, setPaiementId] = useState<string | null>(null);
  const [chargeConfirmation, setChargeConfirmation] = useState(false);
  const [chargeAnnulation, setChargeAnnulation] = useState(false);

  const charger = useCallback(async () => {
    if (!id) return;
    try {
      setColis(await api.obtenirColis(id));
      setErreur('');
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('dcolis_introuvable'));
    }
  }, [id, t]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (!colis) {
    return erreur ? (
      <Ecran fond="lagon">
        <TexteErreur>{erreur}</TexteErreur>
      </Ecran>
    ) : (
      <ChargementCentre message={t('dcolis_chargement')} />
    );
  }

  const statut = champ<StatutColis>(colis, 'status', 'statut');
  const codeQr = champ<string>(colis, 'qr_code', 'qrCode');
  const lienWhatsapp = champ<string>(colis, 'whatsapp_link', 'whatsappLink') ?? WHATSAPP_EQUIPE;
  // Règle serveur : le paiement n'est possible que sur un colis nouvellement créé.
  const peutPayer = statut === 'created';
  // Annulation par l'expéditeur : uniquement avant paiement.
  const peutAnnuler = statut === 'created';

  const payer = async () => {
    setChargePaiement(true);
    setErreur('');
    try {
      const paiement = await api.payerColis(colis.id);
      setPaiementId(paiement.id ?? null);
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

  // Annulation avec confirmation (dialogue natif) — irréversible.
  const annuler = () => {
    Alert.alert(t('dcolis_annuler'), t('dcolis_annuler_confirm'), [
      { text: t('commun_confirmer_non'), style: 'cancel' },
      {
        text: t('commun_confirmer_oui'),
        style: 'destructive',
        onPress: async () => {
          setChargeAnnulation(true);
          setErreur('');
          try {
            await api.annulerColis(colis.id);
            await charger();
          } catch (e) {
            setErreur(e instanceof ErreurApi ? e.message : t('commun_annulation_impossible'));
          } finally {
            setChargeAnnulation(false);
          }
        },
      },
    ]);
  };

  // Partage du suivi (feuille de partage native → WhatsApp, SMS…), pour que
  // l'expéditeur transmette le code au destinataire.
  const partager = async () => {
    const trajet = `${champ(colis, 'pickup_location', 'pickupLocation') ?? '?'} → ${
      champ(colis, 'dropoff_location', 'dropoffLocation') ?? '?'
    }`;
    try {
      await Share.share({
        message: t('dcolis_partage_message', {
          trajet,
          qr: codeQr ?? '—',
          statut: libelleStatutColis(statut, t),
        }),
      });
    } catch {
      // Partage annulé par l'utilisateur : rien à faire.
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

  return (
    <Ecran fond="lagon" onRefresh={charger}>
      <Carte style={styles.carteQr}>
        <View style={styles.enTeteQr}>
          <Titre>{t('dcolis_titre')}</Titre>
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
          <TexteErreur>{t('dcolis_qr_indisponible')}</TexteErreur>
        )}
        <SousTitre centre>{t('dcolis_presenter')}</SousTitre>
        <Text style={styles.consigne}>{t('dcolis_consigne')}</Text>
      </Carte>

      <Carte>
        {!!champ<TailleColis>(colis, 'size', 'taille') && (
          <LigneInfo
            label={t('dcolis_taille')}
            valeur={libelleTailleColis(champ<TailleColis>(colis, 'size', 'taille'), t)}
          />
        )}
        <LigneInfo
          label={t('dcolis_collecte')}
          valeur={String(champ(colis, 'pickup_location', 'pickupLocation') ?? '—')}
        />
        <LigneInfo
          label={t('dcolis_livraison')}
          valeur={String(champ(colis, 'dropoff_location', 'dropoffLocation') ?? '—')}
        />
        <LigneInfo
          label={t('dcolis_destinataire')}
          valeur={String(champ(colis, 'recipient_name', 'recipientName') ?? '—')}
        />
        <LigneInfo
          label={t('commun_telephone')}
          valeur={String(champ(colis, 'recipient_phone', 'recipientPhone') ?? '—')}
        />
        {!!champ(colis, 'description') && (
          <LigneInfo label={t('commun_description')} valeur={String(champ(colis, 'description'))} />
        )}
        <LigneInfo label={t('commun_prix')} valeur={formaterPrix(colis)} />
      </Carte>

      <Carte>
        <Text style={styles.titreSuivi}>{t('dcolis_suivi')}</Text>
        <TimelineStatut
          etapes={ETAPES_COLIS.map((cle) => ({ cle, label: libelleStatutColis(cle, t) }))}
          statutCourant={statut}
          annule={statut === 'cancelled'}
        />
      </Carte>

      {peutPayer && (
        <>
          <EncartInfo icone="logo-whatsapp">{t('dcolis_whatsapp_aide')}</EncartInfo>
          <Bouton
            titre={t('dcolis_payer_whatsapp')}
            icone="logo-whatsapp"
            onPress={payer}
            charge={chargePaiement}
          />
        </>
      )}
      {__DEV__ && peutPayer && paiementId && (
        <Bouton
          titre={t('trip_confirm_dev')}
          variante="secondaire"
          onPress={simulerConfirmation}
          charge={chargeConfirmation}
        />
      )}
      {statut === 'paid' && (
        <EncartInfo icone="checkmark-circle-outline">{t('dcolis_paiement_recu')}</EncartInfo>
      )}
      {peutAnnuler && (
        <Bouton
          titre={t('dcolis_annuler')}
          icone="close-circle-outline"
          variante="danger"
          onPress={annuler}
          charge={chargeAnnulation}
        />
      )}

      {!!codeQr && statut !== 'cancelled' && (
        <Bouton
          titre={t('dcolis_partager')}
          icone="share-social-outline"
          variante="secondaire"
          onPress={partager}
        />
      )}
      <Bouton
        titre={t('commun_contact_whatsapp')}
        icone="logo-whatsapp"
        variante="secondaire"
        onPress={() => Linking.openURL(lienWhatsapp)}
      />

      <TexteErreur>{erreur}</TexteErreur>
      <Bouton
        titre={t('commun_actualiser_statut')}
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
