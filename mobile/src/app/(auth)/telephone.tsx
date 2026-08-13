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
import { champ, type ReponseVerifieOtp, type StatutVerification } from '@/lib/types';
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

  // TOUS les profils téléphone (visiteurs, locaux, chauffeurs) : numéro +
  // MOT DE PASSE choisi par le client — aucun code SMS ni e-mail à
  // recevoir, ça marche partout dans le monde.
  const estVisiteur = profil === 'visitor';
  const estLocalRubrique = profil === 'local';
  const estChauffeur = profil === 'driver';
  const avecMotDePasse = estVisiteur || estLocalRubrique || estChauffeur;

  const [indicatif, setIndicatif] = useState('+255');
  const [numero, setNumero] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  // Connexion OU création de compte (numéro + mot de passe), selon la
  // rubrique choisie sur l'accueil.
  const actionCompte = async (creation: boolean) => {
    setErreur('');
    const telephone = normaliserTelephone(indicatif, numero);
    if (!/^\+\d{9,15}$/.test(telephone)) {
      setErreur(t('tel_erreur_numero'));
      return;
    }
    if (motDePasse.length < 8) {
      setErreur(t('tel_erreur_mdp'));
      return;
    }
    setCharge(true);
    // « Créer mon compte » sur un numéro DÉJÀ inscrit : on tente la
    // connexion avec le mot de passe saisi — la touche aboutit toujours.
    // Si le mot de passe ne correspond pas, message clair.
    const inscrireOuConnecter = async (
      inscrire: () => Promise<ReponseVerifieOtp>,
      connecter: () => Promise<ReponseVerifieOtp>
    ): Promise<ReponseVerifieOtp | null> => {
      try {
        return await inscrire();
      } catch (e) {
        if (!(e instanceof ErreurApi) || e.code !== 'account_exists') throw e;
        try {
          return await connecter();
        } catch {
          setErreur(t('tel_compte_existant'));
          return null;
        }
      }
    };
    try {
      // ----- CHAUFFEURS -----
      if (estChauffeur) {
        const reponse = creation
          ? await inscrireOuConnecter(
              () => api.inscriptionChauffeur(telephone, motDePasse),
              () => api.connexionChauffeur(telephone, motDePasse)
            )
          : await api.connexionChauffeur(telephone, motDePasse);
        if (!reponse) return;
        await connexion({
          token: reponse.token,
          phone: telephone,
          user: reponse.user ?? null,
          driver: reponse.driver ?? null,
          hotel: null,
        });
        if (!reponse.driver) {
          // Inscription : place à la candidature (documents).
          router.replace('/(auth)/pro');
          return;
        }
        const verifie =
          champ<StatutVerification>(reponse.driver, 'verification_status', 'verificationStatus') ===
          'verified';
        router.replace(verifie ? '/(driver)/courses' : '/(auth)/pro');
        return;
      }

      // ----- CLIENTS (visiteurs ET locaux) -----
      const reponse = creation
        ? await inscrireOuConnecter(
            () => api.inscriptionVisiteur(telephone, motDePasse),
            () => api.connexionVisiteur(telephone, motDePasse)
          )
        : await api.connexionVisiteur(telephone, motDePasse);
      if (!reponse) return;
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
          : estLocalRubrique
            ? { pathname: '/(auth)/client', params: { type: 'local' } }
            : '/(auth)/client'
      );
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('tel_erreur_envoi'));
    } finally {
      setCharge(false);
    }
  };

  // Repli : rubrique inconnue (lien direct) — ancien parcours par code.
  const envoyer = async () => {
    setErreur('');
    const telephone = normaliserTelephone(indicatif, numero);
    if (!/^\+\d{9,15}$/.test(telephone)) {
      setErreur(t('tel_erreur_numero'));
      return;
    }
    setCharge(true);
    try {
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
          {estVisiteur
            ? t('tel_intro_visiteur')
            : profil === 'driver'
              ? t('tel_intro_chauffeur')
              : profil === 'local'
                ? t('tel_intro_local')
                : t('tel_intro')}
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
        {/* Mot de passe choisi par le client — pas de code. */}
        {avecMotDePasse && (
          <Champ
            label={t('tel_mdp_label')}
            value={motDePasse}
            onChangeText={setMotDePasse}
            secureTextEntry
            autoCapitalize="none"
            placeholder="••••••••"
          />
        )}
        <TexteErreur>{erreur}</TexteErreur>
        {avecMotDePasse ? (
          <>
            <Bouton
              titre={t('tel_bouton_connexion')}
              icone="log-in-outline"
              onPress={() => actionCompte(false)}
              charge={charge}
            />
            <Bouton
              titre={t('tel_bouton_creer_compte')}
              icone="person-add-outline"
              variante="secondaire"
              onPress={() => actionCompte(true)}
              charge={charge}
            />
            <Text style={styles.lienEmail}>{t('tel_mdp_oublie')}</Text>
          </>
        ) : (
          <Bouton titre={t('tel_bouton')} icone="arrow-forward" onPress={envoyer} charge={charge} />
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
