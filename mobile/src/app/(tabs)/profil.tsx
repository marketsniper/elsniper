// Onglet « Profil » : informations du compte (touriste/résident/local/hôtel,
// devise), statut de vérification des documents, langue, déconnexion.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Badge,
  Bouton,
  Carte,
  Ecran,
  EncartInfo,
  LigneInfo,
  SelecteurLangue,
  SousTitre,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, tailles } from '@/lib/theme';
import { champ, type StatutVerification, type TypeCompte } from '@/lib/types';

/** Initiales (2 lettres max) d'un nom complet. */
function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return 'Z';
  const premiere = mots[0].charAt(0);
  const seconde = mots.length > 1 ? mots[mots.length - 1].charAt(0) : '';
  return (premiere + seconde).toUpperCase();
}

export default function EcranProfil() {
  const router = useRouter();
  const { session, deconnexion, majSession } = useAuth();
  const { t } = useT();
  const utilisateur = session?.user ?? null;
  const hotel = session?.hotel ?? null;
  const [chargeMaj, setChargeMaj] = useState(false);

  const typeCompte = champ<TypeCompte>(utilisateur, 'account_type', 'accountType');
  const estResident = typeCompte === 'resident';
  const estLocal = typeCompte === 'local';
  // Touriste : vérifié d'office. Résident/local : pending → verified/rejected
  // (validation manuelle des documents par l'équipe).
  const statutVerif =
    champ<StatutVerification>(utilisateur, 'verification_status', 'verificationStatus') ??
    'pending';
  const devise = champ<string>(utilisateur, 'currency');
  const nomAffiche = String(
    champ(utilisateur ?? hotel, 'full_name', 'fullName', 'name') ?? t('profil_compte_defaut')
  );

  // Badge selon le type de compte et l'état de vérification.
  const texteBadge = estResident
    ? statutVerif === 'verified'
      ? t('profil_badge_resident_ok')
      : statutVerif === 'rejected'
        ? t('profil_badge_refuse')
        : t('profil_badge_resident_attente')
    : estLocal
      ? statutVerif === 'verified'
        ? t('profil_badge_local_ok')
        : statutVerif === 'rejected'
          ? t('profil_badge_refuse')
          : t('profil_badge_local_attente')
      : t('profil_badge_verifie');
  const tonBadge =
    !estResident && !estLocal
      ? ('succes' as const)
      : statutVerif === 'verified'
        ? ('succes' as const)
        : statutVerif === 'rejected'
          ? ('danger' as const)
          : ('attente' as const);

  // Recharge le profil (utile pour voir la validation arriver).
  const actualiser = async () => {
    if (!utilisateur) return;
    setChargeMaj(true);
    try {
      const maj = await api.obtenirUtilisateur(utilisateur.id);
      await majSession({ user: maj });
    } catch {
      // silencieux : le profil affiché reste celui de la session
    } finally {
      setChargeMaj(false);
    }
  };

  const seDeconnecter = async () => {
    await deconnexion();
    router.replace('/');
  };

  return (
    <Ecran fond="lagon">
      <Carte style={styles.carteIdentite}>
        <View style={styles.avatar}>
          <Text style={styles.initiale}>{initiales(nomAffiche)}</Text>
        </View>
        <Text style={styles.nom}>{nomAffiche}</Text>
        <SousTitre>{session?.phone ?? ''}</SousTitre>
        {utilisateur && <Badge texte={texteBadge} ton={tonBadge} />}
        {hotel && <Badge texte={t('profil_badge_hotel')} ton="primaire" />}
      </Carte>

      {estResident && statutVerif === 'pending' && (
        <EncartInfo icone="hourglass-outline" ton="attente">
          {t('profil_info_resident_attente')}
        </EncartInfo>
      )}
      {estLocal && statutVerif === 'pending' && (
        <EncartInfo icone="hourglass-outline" ton="attente">
          {t('profil_info_local_attente')}
        </EncartInfo>
      )}
      {(estResident || estLocal) && statutVerif === 'rejected' && (
        <EncartInfo icone="alert-circle-outline" ton="attente">
          {t('profil_info_refuse')}
        </EncartInfo>
      )}

      <Carte>
        <LigneInfo label={t('commun_telephone')} valeur={session?.phone || '—'} />
        <LigneInfo
          label={t('commun_email')}
          valeur={String(champ(utilisateur ?? hotel, 'email') ?? '—')}
        />
        <LigneInfo
          label={t('profil_type_compte')}
          valeur={
            hotel
              ? t('profil_badge_hotel')
              : estResident
                ? t('client_type_resident')
                : estLocal
                  ? t('profil_type_local')
                  : t('client_type_touriste')
          }
        />
        {hotel && (
          <>
            <LigneInfo
              label={t('profil_contact')}
              valeur={String(champ(hotel, 'contact_name', 'contactName') ?? '—')}
            />
            <LigneInfo label={t('commun_zone')} valeur={String(champ(hotel, 'zone') ?? '—')} />
          </>
        )}
        <LigneInfo
          label={t('commun_devise')}
          valeur={devise ?? (hotel || estLocal ? 'TZS' : 'USD')}
        />
      </Carte>

      <Carte>
        <Text style={styles.labelLangue}>{t('commun_langue')}</Text>
        <SelecteurLangue compact />
      </Carte>

      {utilisateur && (
        <Bouton
          titre={t('profil_actualiser')}
          icone="refresh-outline"
          variante="secondaire"
          onPress={actualiser}
          charge={chargeMaj}
        />
      )}

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
