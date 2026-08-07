// Mode chauffeur — profil, QR véhicule fixe (VEH-…), langue et déconnexion.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import {
  Badge,
  Carte,
  Ecran,
  LigneInfo,
  SelecteurLangue,
  SousTitre,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, ombres, rayons, tailles } from '@/lib/theme';
import { champ, type StatutVerification } from '@/lib/types';

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

  const statutVerif =
    champ<StatutVerification>(chauffeur, 'verification_status', 'verificationStatus') ?? 'pending';
  const verifie = statutVerif === 'verified';
  const qrVehicule = champ<string>(chauffeur, 'vehicle_qr_code', 'vehicleQrCode');
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

      {qrVehicule && (
        <Carte style={styles.carteQr}>
          <SousTitre centre>{t('compte_qr_texte')}</SousTitre>
          <View style={styles.cadreQr}>
            <QRCode
              value={qrVehicule}
              size={160}
              color={couleurs.encre}
              backgroundColor={couleurs.blanc}
            />
            <Text style={styles.codeTexte}>{qrVehicule}</Text>
          </View>
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
  carteQr: {
    alignItems: 'center',
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
