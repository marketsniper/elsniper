// Fiche d'un colis de la bourse (mode chauffeur) : toutes les infos utiles
// pour décider — expéditeur, enlèvement, livraison, taille, description,
// prix payé et gain net — SANS le QR ni les coordonnées du destinataire
// (anti-fraude : elles n'apparaissent qu'après le scan du colis).
// Premier arrivé, premier servi : le scan du QR sur le colis assigne la
// livraison au chauffeur.
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  Bouton,
  Carte,
  ChargementCentre,
  Ecran,
  EncartInfo,
  EtatVide,
  LigneInfo,
  Titre,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { masquerColis } from '@/lib/colisLocal';
import { formaterDateRelativeI18n, libelleTailleColis, useT } from '@/lib/i18n';
import { couleurs, espaces } from '@/lib/theme';
import { champ, formaterMontant, type Colis, type TailleColis } from '@/lib/types';

export default function EcranColisDispo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { t } = useT();
  const chauffeurId = session?.driver?.id ?? null;
  const [colis, setColis] = useState<Colis | null>(null);
  const [charge, setCharge] = useState(true);

  // La bourse est la source (elle n'expose que les champs sans risque) :
  // si le colis n'y est plus, il a été pris par un autre chauffeur ou a expiré.
  const chargerColis = useCallback(async () => {
    try {
      const liste = await api.listerColisARamasser();
      setColis(liste.find((c) => c.id === id) ?? null);
    } catch {
      setColis(null);
    } finally {
      setCharge(false);
    }
  }, [id]);

  useEffect(() => {
    chargerColis();
  }, [chargerColis]);

  if (charge) {
    return <ChargementCentre message={t('course_chargement')} />;
  }

  if (!colis) {
    return (
      <Ecran fond="lagon">
        <EtatVide
          icone="cube-outline"
          titre={t('colis_dispo_introuvable_titre')}
          message={t('colis_dispo_introuvable_texte')}
        />
      </Ecran>
    );
  }

  const nomHotel = champ<string>(colis, 'sender_hotel_name');
  const nomClient = champ<string>(colis, 'sender_user_name');
  const description = champ<string>(colis, 'description');
  const prix = Number(champ(colis, 'price') ?? NaN);
  const commission = Number(champ(colis, 'commission') ?? NaN);
  const devise = String(champ(colis, 'currency') ?? '');
  const net =
    Number.isFinite(prix) && Number.isFinite(commission)
      ? Math.round((prix - commission) * 100) / 100
      : null;

  const pasInteresse = () => {
    if (!chauffeurId) return;
    Alert.alert(t('colis_masquer_titre'), t('colis_masquer_texte'), [
      { text: t('commun_annuler'), style: 'cancel' },
      {
        text: t('colis_masquer_confirmer'),
        onPress: async () => {
          await masquerColis(chauffeurId, colis.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <Ecran fond="lagon">
      <EncartInfo icone="qr-code-outline">{t('colis_dispo_intro')}</EncartInfo>

      <Carte>
        <Titre>{nomHotel ? `🏨 ${nomHotel}` : nomClient ?? t('courses_colis_client')}</Titre>
        <LigneInfo
          label={t('colis_dispo_enlevement')}
          valeur={String(champ(colis, 'pickup_location', 'pickupLocation') ?? '—')}
        />
        <LigneInfo
          label={t('colis_dispo_livraison')}
          valeur={String(champ(colis, 'dropoff_location', 'dropoffLocation') ?? '—')}
        />
        <LigneInfo
          label={t('colis_dispo_taille')}
          valeur={libelleTailleColis(champ<TailleColis>(colis, 'size', 'taille'), t) || '—'}
        />
        {!!description && (
          <LigneInfo label={t('colis_dispo_description')} valeur={description} />
        )}
        <LigneInfo
          label={t('colis_dispo_publie')}
          valeur={formaterDateRelativeI18n(champ(colis, 'created_at', 'createdAt'), t)}
        />
      </Carte>

      <Carte>
        <LigneInfo
          label={t('colis_dispo_prix')}
          valeur={Number.isFinite(prix) ? formaterMontant(prix, devise) : '—'}
        />
        <LigneInfo
          label={t('gain_commission')}
          valeur={Number.isFinite(commission) ? `− ${formaterMontant(commission, devise)}` : '—'}
        />
        {net !== null && (
          <View style={styles.ligneNet}>
            <Text style={styles.labelNet}>{t('gain_net')}</Text>
            <Text style={styles.valeurNet}>{formaterMontant(net, devise)}</Text>
          </View>
        )}
      </Carte>

      <Bouton
        titre={t('courses_colis_scanner')}
        icone="qr-code-outline"
        onPress={() => router.push('/(driver)/scanner')}
      />
      <Bouton
        titre={t('colis_masquer')}
        icone="eye-off-outline"
        variante="secondaire"
        onPress={pasInteresse}
      />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  ligneNet: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    paddingTop: espaces.s,
    marginTop: espaces.xs,
  },
  labelNet: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
  },
  valeurNet: {
    fontSize: 20,
    fontWeight: '800',
    color: couleurs.primaire,
  },
});
