// Saisie du code OTP à 6 chiffres (affiché à l'écran pendant la phase pilote).
// Après vérification, le profil choisi sur la page d'accueil (?profil=)
// oriente vers le bon formulaire si le compte n'a pas encore de profil.
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  Bouton,
  Carte,
  Ecran,
  SousTitre,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, rayons } from '@/lib/theme';
import type { ReponseVerifieOtp } from '@/lib/types';

const LONGUEUR_CODE = 6;

export default function EcranOtp() {
  const router = useRouter();
  const { connexion } = useAuth();
  const { t } = useT();
  const params = useLocalSearchParams<{ phone?: string; devCode?: string; profil?: string }>();
  const phone = typeof params.phone === 'string' ? params.phone : '';
  const devCode = typeof params.devCode === 'string' ? params.devCode : '';
  const profil = typeof params.profil === 'string' ? params.profil : '';

  const refSaisie = useRef<TextInput>(null);
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  // Oriente vers le bon écran selon le profil choisi et les profils existants.
  const orienter = (reponse: ReponseVerifieOtp) => {
    const dejaProfil = !!(reponse.user || reponse.driver || reponse.hotel);
    if (dejaProfil) {
      // L'index route selon les profils de la session (client, chauffeur, hôtel).
      router.replace('/');
      return;
    }
    if (profil === 'driver') {
      router.replace('/(auth)/pro');
    } else if (profil === 'local') {
      router.replace({ pathname: '/(auth)/client', params: { type: 'local' } });
    } else if (profil === 'visitor') {
      router.replace('/(auth)/client');
    } else if (profil === 'hotel') {
      router.replace('/(auth)/hotel');
    } else {
      router.replace('/');
    }
  };

  const verifier = async () => {
    setErreur('');
    if (!/^\d{6}$/.test(code)) {
      setErreur(t('otp_erreur_code'));
      return;
    }
    setCharge(true);
    try {
      const reponse = await api.verifierOtp(phone, code);
      await connexion({
        token: reponse.token,
        phone,
        user: reponse.user ?? null,
        driver: reponse.driver ?? null,
        hotel: reponse.hotel ?? null,
      });
      orienter(reponse);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('otp_erreur_invalide'));
    } finally {
      setCharge(false);
    }
  };

  return (
    <Ecran fond="vagues">
      <Carte>
        <Titre>{t('otp_titre')}</Titre>
        <SousTitre>{t('otp_intro', { phone })}</SousTitre>

        {!!devCode && (
          <Pressable
            onPress={() => setCode(devCode.slice(0, LONGUEUR_CODE))}
            style={styles.encartPilote}
          >
            <Text style={styles.textePilote}>{t('otp_pilote_titre')}</Text>
            <Text style={styles.codePilote}>{devCode}</Text>
            <Text style={styles.astucePilote}>{t('otp_pilote_astuce')}</Text>
          </Pressable>
        )}

        {/* Saisie masquée : les 6 cases ci-dessous en sont le reflet. */}
        <Pressable onPress={() => refSaisie.current?.focus()}>
          <View style={styles.rangeeCases}>
            {Array.from({ length: LONGUEUR_CODE }).map((_, index) => {
              const chiffre = code[index] ?? '';
              const active = index === Math.min(code.length, LONGUEUR_CODE - 1);
              return (
                <View
                  key={index}
                  style={[
                    styles.caseCode,
                    !!chiffre && styles.caseRemplie,
                    active && styles.caseActive,
                  ]}
                >
                  <Text style={styles.chiffre}>{chiffre}</Text>
                </View>
              );
            })}
          </View>
        </Pressable>
        <TextInput
          ref={refSaisie}
          value={code}
          onChangeText={(texte) => setCode(texte.replace(/[^\d]/g, '').slice(0, LONGUEUR_CODE))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={LONGUEUR_CODE}
          autoFocus
          caretHidden
          style={styles.saisieInvisible}
        />

        <TexteErreur>{erreur}</TexteErreur>
        <Bouton
          titre={t('otp_bouton')}
          icone="checkmark"
          onPress={verifier}
          charge={charge}
          desactive={code.length < LONGUEUR_CODE}
        />
        <Bouton
          titre={t('otp_changer_numero')}
          variante="secondaire"
          onPress={() => router.back()}
        />
      </Carte>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  encartPilote: {
    backgroundColor: couleurs.attenteFond,
    borderRadius: rayons.bouton,
    padding: espaces.m,
    alignItems: 'center',
    gap: espaces.xs,
  },
  textePilote: {
    fontSize: 13,
    color: couleurs.attente,
    fontWeight: '600',
    textAlign: 'center',
  },
  codePilote: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 6,
    color: couleurs.encre,
  },
  astucePilote: {
    fontSize: 12,
    color: couleurs.attente,
  },
  rangeeCases: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: espaces.s,
    paddingVertical: espaces.s,
  },
  caseCode: {
    width: 46,
    height: 56,
    borderRadius: rayons.bouton,
    borderWidth: 1.5,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.blanc,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caseRemplie: {
    borderColor: couleurs.primaire,
  },
  caseActive: {
    borderColor: couleurs.primaire,
    borderWidth: 2,
    backgroundColor: couleurs.primaireClair,
  },
  chiffre: {
    fontSize: 24,
    fontWeight: '700',
    color: couleurs.encre,
  },
  saisieInvisible: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
  },
});
