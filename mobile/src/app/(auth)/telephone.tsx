// Écran de connexion : saisie du numéro de téléphone (+255 par défaut).
// Le profil choisi sur la page d'accueil (?profil=) est transmis jusqu'à
// l'OTP pour orienter la création de profil.
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Bouton,
  Carte,
  Champ,
  Ecran,
  EncartInfo,
  LogoZanziGo,
  SousTitre,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useT, type CleChaine } from '@/lib/i18n';
import { couleurs, espaces } from '@/lib/theme';

/** Clé i18n du libellé de chaque profil proposé sur la page d'accueil. */
const CLES_PROFIL: Record<string, CleChaine> = {
  visitor: 'accueil_visiteur_titre',
  local: 'accueil_local_titre',
  driver: 'accueil_chauffeur_titre',
};

/** Normalise le numéro saisi en format international (+255...). */
function normaliserTelephone(indicatif: string, numero: string): string {
  const chiffres = numero.replace(/[^\d]/g, '').replace(/^0+/, '');
  return `${indicatif}${chiffres}`;
}

export default function EcranTelephone() {
  const router = useRouter();
  const { t } = useT();
  const params = useLocalSearchParams<{ profil?: string }>();
  const profil = typeof params.profil === 'string' ? params.profil : '';

  const [indicatif, setIndicatif] = useState('+255');
  const [numero, setNumero] = useState('');
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);
  // Touristes à l'étranger : les SMS n'arrivent pas toujours en itinérance —
  // le code peut alors être reçu par E-MAIL (le Wi-Fi marche toujours, lui).
  const [parEmail, setParEmail] = useState(false);
  const [email, setEmail] = useState('');

  const envoyer = async () => {
    setErreur('');
    const telephone = normaliserTelephone(indicatif, numero);
    if (!/^\+\d{9,15}$/.test(telephone)) {
      setErreur(t('tel_erreur_numero'));
      return;
    }
    if (parEmail && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErreur(t('tel_erreur_email'));
      return;
    }
    setCharge(true);
    try {
      const resultat = await api.demanderOtp(
        telephone,
        parEmail ? { channel: 'email', email: email.trim() } : undefined
      );
      router.push({
        pathname: '/(auth)/otp',
        params: {
          phone: telephone,
          devCode: resultat.devCode ?? '',
          profil,
          canal: resultat.channel ?? 'sms',
          emailMasque: resultat.emailMasked ?? '',
        },
      });
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('tel_erreur_envoi'));
    } finally {
      setCharge(false);
    }
  };

  return (
    <Ecran fond="vagues">
      <View style={styles.entete}>
        <LogoZanziGo taille={44} />
        <Text style={styles.tagline}>{t('app_tagline')}</Text>
      </View>

      <Carte>
        <Titre>{t('tel_bienvenue')}</Titre>
        {!!profil && CLES_PROFIL[profil] && (
          <Text style={styles.profilChoisi}>
            {t('tel_profil_choisi', { profil: t(CLES_PROFIL[profil]) })}
          </Text>
        )}
        <SousTitre>
          {profil === 'driver' ? t('tel_intro_chauffeur') : t('tel_intro')}
        </SousTitre>
        <View style={styles.rangeeTelephone}>
          <Champ
            label={t('tel_indicatif')}
            value={indicatif}
            onChangeText={setIndicatif}
            keyboardType="phone-pad"
            style={styles.champIndicatif}
          />
          <View style={styles.champNumero}>
            <Champ
              label={t('tel_numero')}
              value={numero}
              onChangeText={setNumero}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              placeholder="712 345 678"
              autoFocus
            />
          </View>
        </View>
        {parEmail && (
          <Champ
            label={t('tel_email_label')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="vous@exemple.com"
          />
        )}
        <TexteErreur>{erreur}</TexteErreur>
        <Bouton
          titre={parEmail ? t('tel_bouton_email') : t('tel_bouton')}
          icone={parEmail ? 'mail-outline' : 'arrow-forward'}
          onPress={envoyer}
          charge={charge}
        />
        {/* Bascule SMS ↔ e-mail : le remède aux SMS bloqués en itinérance. */}
        <Pressable
          onPress={() => setParEmail((v) => !v)}
          accessibilityRole="button"
          style={({ pressed }) => pressed && { opacity: 0.7 }}
        >
          <Text style={styles.lienEmail}>
            {parEmail ? t('tel_email_retour_sms') : t('tel_email_lien')}
          </Text>
        </Pressable>
      </Carte>

      <EncartInfo icone="flask-outline" ton="attente">
        {t('pilote_message')}
      </EncartInfo>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  entete: {
    alignItems: 'center',
    paddingVertical: espaces.xxl,
    gap: espaces.s,
  },
  tagline: {
    fontSize: 16,
    color: couleurs.texteSecondaire,
    textAlign: 'center',
  },
  profilChoisi: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.primaireFonce,
  },
  rangeeTelephone: {
    flexDirection: 'row',
    gap: espaces.m,
  },
  champIndicatif: {
    width: 84,
  },
  champNumero: {
    flex: 1,
  },
  lienEmail: {
    fontSize: 13.5,
    fontWeight: '600',
    color: couleurs.primaireFonce,
    textAlign: 'center',
    paddingVertical: espaces.s,
  },
});
