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
import { useAuth } from '@/lib/auth';
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
  const { connexion } = useAuth();
  const { t } = useT();
  const params = useLocalSearchParams<{ profil?: string }>();
  const profil = typeof params.profil === 'string' ? params.profil : '';

  // VISITEURS (touristes) : identification par E-MAIL uniquement — à
  // l'étranger, les SMS n'arrivent pas, l'e-mail marche partout. Les locaux
  // et chauffeurs gardent l'identification par téléphone (SIM tanzanienne).
  const estVisiteur = profil === 'visitor';
  const [modeTelephone, setModeTelephone] = useState(!estVisiteur);

  const [indicatif, setIndicatif] = useState('+255');
  const [numero, setNumero] = useState('');
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);
  const [email, setEmail] = useState('');

  const envoyer = async () => {
    setErreur('');
    // ----- Identité E-MAIL (visiteurs) -----
    if (!modeTelephone) {
      const adresse = email.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(adresse)) {
        setErreur(t('tel_erreur_email'));
        return;
      }
      setCharge(true);
      try {
        const resultat = await api.demanderOtpParEmail(adresse);
        router.push({
          pathname: '/(auth)/otp',
          params: {
            emailIdentite: adresse,
            devCode: resultat.devCode ?? '',
            profil,
            canal: 'email',
            emailMasque: resultat.emailMasked ?? adresse,
          },
        });
      } catch (e) {
        setErreur(e instanceof ErreurApi ? e.message : t('tel_erreur_envoi'));
      } finally {
        setCharge(false);
      }
      return;
    }

    // ----- Identité TÉLÉPHONE -----
    const telephone = normaliserTelephone(indicatif, numero);
    if (!/^\+\d{9,15}$/.test(telephone)) {
      setErreur(t('tel_erreur_numero'));
      return;
    }
    setCharge(true);
    try {
      // LOCAUX : pas de code du tout — le numéro suffit, entrée directe.
      // (Compte existant → réservation ; nouveau numéro → création de
      // profil local. Les chauffeurs gardent le code SMS.)
      if (profil === 'local') {
        const reponse = await api.connexionLocale(telephone);
        await connexion({
          token: reponse.token,
          phone: telephone,
          user: reponse.user ?? null,
          driver: null,
          hotel: null,
        });
        router.replace(
          reponse.user
            ? '/(tabs)/reserver'
            : { pathname: '/(auth)/client', params: { type: 'local' } }
        );
        return;
      }

      const resultat = await api.demanderOtp(telephone);
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
          {!modeTelephone
            ? t('tel_intro_visiteur')
            : profil === 'driver'
              ? t('tel_intro_chauffeur')
              : profil === 'local'
                ? t('tel_intro_local')
                : t('tel_intro')}
        </SousTitre>
        {!modeTelephone ? (
          // ----- VISITEURS : e-mail uniquement -----
          <Champ
            label={t('tel_email_label')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="vous@exemple.com"
            autoFocus
          />
        ) : (
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
        )}
        <TexteErreur>{erreur}</TexteErreur>
        <Bouton
          titre={!modeTelephone ? t('tel_bouton_email') : t('tel_bouton')}
          icone={!modeTelephone ? 'mail-outline' : 'arrow-forward'}
          onPress={envoyer}
          charge={charge}
        />
        {/* Visiteurs : bascule possible vers l'ancien accès par téléphone
            (comptes créés avant l'identification par e-mail). */}
        {estVisiteur && (
          <Pressable
            onPress={() => setModeTelephone((v) => !v)}
            accessibilityRole="button"
            style={({ pressed }) => pressed && { opacity: 0.7 }}
          >
            <Text style={styles.lienEmail}>
              {modeTelephone ? t('tel_retour_email') : t('tel_lien_telephone')}
            </Text>
          </Pressable>
        )}
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
