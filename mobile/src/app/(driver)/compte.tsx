// Mode chauffeur — profil, langue et déconnexion.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Badge,
  Carte,
  Ecran,
  LigneInfo,
  SelecteurLangue,
  SousTitre,
} from '@/components/ui';
import { api, type StatsChauffeur } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, rayons, tailles } from '@/lib/theme';
import { champ, formaterMontant, type StatutVerification } from '@/lib/types';

/** Initiales (2 lettres max) d'un nom complet. */
function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return 'Z';
  const premiere = mots[0].charAt(0);
  const seconde = mots.length > 1 ? mots[mots.length - 1].charAt(0) : '';
  return (premiere + seconde).toUpperCase();
}

export default function EcranCompteChauffeur() {
  const router = useRouter();
  const { session, deconnexion } = useAuth();
  const { t } = useT();
  const chauffeur = session?.driver ?? null;

  // Compteur de gains (courses terminées + colis livrés, nets de commission).
  const [stats, setStats] = useState<StatsChauffeur | null>(null);
  const chargerStats = useCallback(async () => {
    if (!chauffeur?.id) return;
    try {
      setStats(await api.statsChauffeur(chauffeur.id));
    } catch {
      // silencieux : la carte gains reste vide
    }
  }, [chauffeur?.id]);
  useFocusEffect(
    useCallback(() => {
      chargerStats();
    }, [chargerStats])
  );

  const statutVerif =
    champ<StatutVerification>(chauffeur, 'verification_status', 'verificationStatus') ?? 'pending';
  const verifie = statutVerif === 'verified';
  const moyenneBrute = champ<number | string>(chauffeur, 'rating_avg', 'ratingAvg');
  const nbNotes = Number(champ<number | string>(chauffeur, 'rating_count', 'ratingCount') ?? 0);
  const moyenne =
    moyenneBrute !== undefined && Number.isFinite(Number(moyenneBrute))
      ? Number(moyenneBrute).toFixed(1)
      : null;
  const nomAffiche = String(
    champ(chauffeur, 'full_name', 'fullName') ?? t('rides_chauffeur_defaut')
  );

  const seDeconnecter = async () => {
    await deconnexion();
    router.replace('/');
  };

  return (
    <Ecran fond="vagues">
      <Carte style={styles.carteIdentite}>
        <View style={styles.avatar}>
          <Text style={styles.initiale}>{initiales(nomAffiche)}</Text>
        </View>
        <Text style={styles.nom}>{nomAffiche}</Text>
        <SousTitre>{session?.phone ?? ''}</SousTitre>
        <Badge
          texte={
            verifie
              ? t('compte_badge_verifie')
              : statutVerif === 'rejected'
                ? t('compte_badge_refuse')
                : t('compte_badge_attente')
          }
          ton={verifie ? 'succes' : statutVerif === 'rejected' ? 'danger' : 'attente'}
        />
        {moyenne !== null && nbNotes > 0 && (
          <Badge texte={t('compte_avis', { note: moyenne, n: nbNotes })} ton="primaire" />
        )}
      </Carte>

      {/* Compteur de gains : aujourd'hui / 7 jours / 30 jours. */}
      {verifie && stats && (
        <Carte>
          <Text style={styles.titreGains}>{t('gains_titre')}</Text>
          {(
            [
              ['gains_aujourdhui', stats.today],
              ['gains_7j', stats.week],
              ['gains_30j', stats.month],
            ] as const
          ).map(([cle, fenetre]) => (
            <View key={cle} style={styles.ligneGains}>
              <View style={styles.colonneGains}>
                <Text style={styles.labelGains}>{t(cle)}</Text>
                <Text style={styles.detailGains}>
                  {t('gains_detail_compte', { courses: fenetre.courses, colis: fenetre.colis })}
                </Text>
              </View>
              <Text style={styles.montantGains}>
                {Object.keys(fenetre.gains).length > 0
                  ? Object.entries(fenetre.gains)
                      .map(([devise, montant]) => formaterMontant(montant, devise))
                      .join(' + ')
                  : '—'}
              </Text>
            </View>
          ))}
          <Text style={styles.noteGains}>{t('gains_note_paiement')}</Text>
        </Carte>
      )}

      <Carte>
        <LigneInfo label={t('commun_telephone')} valeur={session?.phone ?? '—'} />
        <LigneInfo
          label={t('compte_vehicule')}
          valeur={String(champ(chauffeur, 'vehicle_model', 'vehicleModel') ?? '—')}
        />
        <LigneInfo
          label={t('compte_plaque')}
          valeur={String(champ(chauffeur, 'vehicle_plate', 'vehiclePlate') ?? '—')}
        />
        <LigneInfo
          label={t('compte_permis')}
          valeur={String(champ(chauffeur, 'license_number', 'licenseNumber') ?? '—')}
        />
        <LigneInfo label={t('commun_zone')} valeur={String(champ(chauffeur, 'zone') ?? '—')} />
      </Carte>

      <Carte>
        <Text style={styles.labelLangue}>{t('commun_langue')}</Text>
        <SelecteurLangue compact />
      </Carte>

      <Pressable
        onPress={seDeconnecter}
        style={({ pressed }) => [styles.ligneDeconnexion, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
      >
        <Ionicons name="log-out-outline" size={20} color={couleurs.danger} />
        <Text style={styles.texteDeconnexion}>{t('commun_se_deconnecter')}</Text>
      </Pressable>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  titreGains: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
  },
  ligneGains: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
    paddingVertical: espaces.xs,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
  },
  colonneGains: {
    flex: 1,
    gap: 2,
  },
  labelGains: {
    fontSize: 14,
    fontWeight: '600',
    color: couleurs.encre,
  },
  detailGains: {
    fontSize: 12.5,
    color: couleurs.texteSecondaire,
  },
  montantGains: {
    fontSize: 15,
    fontWeight: '800',
    color: couleurs.primaire,
    textAlign: 'right',
    flexShrink: 1,
  },
  noteGains: {
    fontSize: 12.5,
    color: couleurs.texteSecondaire,
    lineHeight: 18,
  },
  carteIdentite: {
    alignItems: 'center',
    gap: espaces.s,
    paddingVertical: espaces.xl,
  },
  avatar: {
    width: tailles.avatar,
    height: tailles.avatar,
    borderRadius: tailles.avatar / 2,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initiale: {
    fontSize: 28,
    fontWeight: '800',
    color: couleurs.primaireFonce,
  },
  nom: {
    fontSize: 20,
    fontWeight: '700',
    color: couleurs.encre,
  },
  labelLangue: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  ligneDeconnexion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaces.s,
    paddingVertical: espaces.l,
    marginTop: espaces.s,
  },
  texteDeconnexion: {
    fontSize: 15,
    fontWeight: '600',
    color: couleurs.danger,
  },
});
