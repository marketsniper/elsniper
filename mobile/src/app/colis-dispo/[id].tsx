// Fiche d'un colis de la bourse (mode chauffeur) : toutes les infos utiles
// pour décider — expéditeur, enlèvement, livraison, taille, description,
// prix payé et gain net — SANS le QR ni les coordonnées du destinataire
// (anti-fraude : elles n'apparaissent qu'après le scan du colis).
// Premier arrivé, premier servi : le scan du QR sur le colis assigne la
// livraison au chauffeur.
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';

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
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { masquerColis } from '@/lib/colisLocal';
import { formaterDateRelativeI18n, libelleTailleColis, useT } from '@/lib/i18n';
import { couleurs, espaces, stylesReactifs } from '@/lib/theme';
import {
  champ,
  formaterDate,
  formaterMontant,
  gainNetChauffeur,
  partZanziGoPct,
  totalEnTzs,
  type Colis,
  type TailleColis,
} from '@/lib/types';

export default function EcranColisDispo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { t } = useT();
  const chauffeurId = session?.driver?.id ?? null;
  const [colis, setColis] = useState<Colis | null>(null);
  const [charge, setCharge] = useState(true);
  const [prisEnCours, setPrisEnCours] = useState(false);
  const [erreur, setErreur] = useState('');

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
  // L'argent d'un colis, côté chauffeur : son gain et le pourcentage zanziGo.
  // Le prix payé par l'expéditeur ne lui parvient plus (vueChauffeur.js).
  const gain = gainNetChauffeur(colis);
  const pct = partZanziGoPct(colis);

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

  // « Je prends la livraison » : réservation atomique côté serveur, puis
  // notification WhatsApp pré-remplie vers l'équipe et retour aux courses.
  const prendre = () => {
    Alert.alert(t('colis_prendre_titre'), t('colis_prendre_texte'), [
      { text: t('commun_annuler'), style: 'cancel' },
      {
        text: t('colis_prendre_confirmer'),
        onPress: async () => {
          setErreur('');
          setPrisEnCours(true);
          try {
            const reponse = await api.prendreColis(colis.id);
            const lien = champ<string>(reponse, 'whatsapp_link', 'whatsappLink');
            Alert.alert('✅', t('colis_prendre_ok'));
            if (lien) await Linking.openURL(lien);
            router.replace('/(driver)/courses');
          } catch (e) {
            if (e instanceof ErreurApi && e.code === 'package_already_taken') {
              setErreur(t('colis_pris_trop_tard'));
              await chargerColis();
            } else {
              setErreur(e instanceof ErreurApi ? e.message : t('equipe_action_erreur'));
            }
          } finally {
            setPrisEnCours(false);
          }
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
          label={t('colis_dispo_ramassage')}
          valeur={
            champ(colis, 'pickup_at', 'pickupAt')
              ? formaterDate(champ(colis, 'pickup_at', 'pickupAt'))
              : t('ncolis_asap')
          }
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
        {gain && (
          <View style={styles.ligneNet}>
            <Text style={styles.labelNet}>{t('gain_net')}</Text>
            <Text style={styles.valeurNet}>
              {formaterMontant(totalEnTzs({ [gain.devise]: gain.montant }), 'TZS')}
            </Text>
          </View>
        )}
        {pct !== null && (
          <LigneInfo label={t('gain_part_zanzigo_ligne')} valeur={`${pct} %`} />
        )}
      </Carte>

      {!!erreur && (
        <EncartInfo icone="alert-circle-outline" ton="attente">
          {erreur}
        </EncartInfo>
      )}
      <Bouton
        titre={t('colis_prendre')}
        icone="checkmark-circle-outline"
        onPress={prendre}
        charge={prisEnCours}
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

const styles = stylesReactifs(() => ({
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
}));
