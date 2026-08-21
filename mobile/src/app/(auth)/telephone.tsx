// Écran d'entrée des CLIENTS (visiteurs, locaux) et des CHAUFFEURS.
//
// Parcours volontairement en DEUX TEMPS, pour ne plus mélanger connexion
// et inscription (c'était la principale source de confusion) :
//   1. « Vous êtes nouveau ? » → un grand bouton CRÉER MON COMPTE ;
//   2. « Vous avez déjà un compte ? » → identifiant + mot de passe.
//
// Clients : un IDENTIFIANT choisi (ex. « amina2026 ») remplace l'indicatif
// et le numéro de téléphone — plus simple à retenir, identique partout
// dans le monde. Les comptes créés avant se connectent toujours avec leur
// numéro : le champ accepte les deux.
// Chauffeurs : numéro + mot de passe (leur numéro EST leur identité pro).
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  Bouton,
  Carte,
  Champ,
  Ecran,
  LogoZanziGo,
  SousTitre,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT, type CleChaine } from '@/lib/i18n';
import { champ, type StatutVerification } from '@/lib/types';
import { couleurs, espaces, rayons, stylesReactifs } from '@/lib/theme';

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

type Mode = 'choix' | 'creation' | 'connexion';

export default function EcranTelephone() {
  const router = useRouter();
  const { connexion } = useAuth();
  const { t } = useT();
  const params = useLocalSearchParams<{ profil?: string }>();
  const profil = typeof params.profil === 'string' ? params.profil : '';

  const estLocalRubrique = profil === 'local';
  const estChauffeur = profil === 'driver';

  // Écran d'aiguillage d'abord : nouveau client ou compte existant ?
  const [mode, setMode] = useState<Mode>('choix');
  // Clients : identifiant choisi. Chauffeurs : numéro de téléphone.
  const [identifiant, setIdentifiant] = useState('');
  const [indicatif, setIndicatif] = useState('+255');
  const [numero, setNumero] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  const changerMode = (suivant: Mode) => {
    setErreur('');
    setMode(suivant);
  };

  // ----- Chauffeurs : numéro + mot de passe -----
  const actionChauffeur = async (creation: boolean) => {
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
    try {
      const reponse = creation
        ? await api.inscriptionChauffeur(telephone, motDePasse)
        : await api.connexionChauffeur(telephone, motDePasse);
      await connexion({
        token: reponse.token,
        phone: telephone,
        user: reponse.user ?? null,
        driver: reponse.driver ?? null,
        hotel: null,
      });
      if (!reponse.driver) {
        router.replace('/(auth)/pro'); // candidature (documents) à déposer
        return;
      }
      const verifie =
        champ<StatutVerification>(reponse.driver, 'verification_status', 'verificationStatus') ===
        'verified';
      router.replace(verifie ? '/(driver)/courses' : '/(auth)/pro');
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('tel_erreur_envoi'));
    } finally {
      setCharge(false);
    }
  };

  // ----- Clients : identifiant + mot de passe -----
  const actionClient = async (creation: boolean) => {
    const nom = identifiant.trim();
    if (creation && !/^[a-zA-Z0-9._-]{3,20}$/.test(nom)) {
      setErreur(t('ident_erreur_format'));
      return;
    }
    if (!nom) {
      setErreur(t('ident_erreur_vide'));
      return;
    }
    if (motDePasse.length < 8) {
      setErreur(t('tel_erreur_mdp'));
      return;
    }
    setCharge(true);
    try {
      const reponse = creation
        ? await api.creerCompteClient(nom, motDePasse)
        : await api.connexionClient(nom, motDePasse);
      await connexion({
        token: reponse.token,
        phone: champ<string>(reponse.user, 'phone') ?? '',
        user: reponse.user ?? null,
        driver: null,
        hotel: null,
      });
      // Compte tout neuf : on enchaîne sur le profil (nom, documents pour
      // un local). Compte existant : direct à la réservation.
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

  const valider = (creation: boolean) => {
    setErreur('');
    return estChauffeur ? actionChauffeur(creation) : actionClient(creation);
  };

  // Champs d'identité : numéro pour les chauffeurs, identifiant sinon.
  const champsIdentite = estChauffeur ? (
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
  ) : (
    <Champ
      label={mode === 'creation' ? t('ident_choisir_label') : t('ident_label')}
      value={identifiant}
      onChangeText={setIdentifiant}
      autoCapitalize="none"
      autoCorrect={false}
      placeholder={mode === 'creation' ? t('ident_placeholder') : t('ident_placeholder_connexion')}
      autoFocus
    />
  );

  const champMotDePasse = (
    <Champ
      label={mode === 'creation' ? t('ident_mdp_choisir') : t('tel_mdp_label')}
      value={motDePasse}
      onChangeText={setMotDePasse}
      secureTextEntry
      autoCapitalize="none"
      placeholder="••••••••"
    />
  );

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

        {/* ---------- 1. AIGUILLAGE : nouveau ou déjà client ? ---------- */}
        {mode === 'choix' && (
          <>
            <SousTitre>
              {estChauffeur ? t('tel_intro_chauffeur') : t('ident_intro')}
            </SousTitre>

            {/* Le nouveau client voit ÇA en premier, bien en évidence. */}
            <View style={styles.blocNouveau}>
              <Text style={styles.titreNouveau}>{t('ident_nouveau_titre')}</Text>
              <Text style={styles.texteNouveau}>{t('ident_nouveau_texte')}</Text>
              <Bouton
                titre={t('ident_creer_bouton')}
                icone="person-add-outline"
                onPress={() => changerMode('creation')}
              />
            </View>

            <View style={styles.separateur}>
              <View style={styles.filet} />
              <Text style={styles.texteSeparateur}>{t('ident_ou')}</Text>
              <View style={styles.filet} />
            </View>

            <Text style={styles.titreDeja}>{t('ident_deja_titre')}</Text>
            <Bouton
              titre={t('ident_connexion_bouton')}
              icone="log-in-outline"
              variante="secondaire"
              onPress={() => changerMode('connexion')}
            />
          </>
        )}

        {/* ---------- 2a. CRÉATION DE COMPTE ---------- */}
        {mode === 'creation' && (
          <>
            <SousTitre>
              {estChauffeur ? t('ident_creation_intro_chauffeur') : t('ident_creation_intro')}
            </SousTitre>
            {champsIdentite}
            {champMotDePasse}
            <TexteErreur>{erreur}</TexteErreur>
            <Bouton
              titre={t('ident_creer_bouton')}
              icone="person-add-outline"
              onPress={() => valider(true)}
              charge={charge}
            />
            <Pressable onPress={() => changerMode('choix')} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.lienRetour}>{t('commun_retour')}</Text>
            </Pressable>
          </>
        )}

        {/* ---------- 2b. CONNEXION ---------- */}
        {mode === 'connexion' && (
          <>
            <SousTitre>
              {estChauffeur ? t('ident_connexion_intro_chauffeur') : t('ident_connexion_intro')}
            </SousTitre>
            {champsIdentite}
            {champMotDePasse}
            <TexteErreur>{erreur}</TexteErreur>
            <Bouton
              titre={t('ident_connexion_bouton')}
              icone="log-in-outline"
              onPress={() => valider(false)}
              charge={charge}
            />
            <Text style={styles.lienEmail}>{t('tel_mdp_oublie')}</Text>
            <Pressable onPress={() => changerMode('choix')} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.lienRetour}>{t('commun_retour')}</Text>
            </Pressable>
          </>
        )}
      </Carte>
    </Ecran>
  );
}

const styles = stylesReactifs(() => ({
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
  // Bloc « nouveau client » : c'est le chemin le plus fréquent, il doit
  // sauter aux yeux avant tout formulaire.
  blocNouveau: {
    backgroundColor: couleurs.primaireClair,
    borderRadius: rayons.carte,
    borderWidth: 2,
    borderColor: couleurs.primaire,
    padding: espaces.l,
    gap: espaces.s,
  },
  titreNouveau: {
    fontSize: 17,
    fontWeight: '800',
    color: couleurs.primaireFonce,
  },
  texteNouveau: {
    fontSize: 14,
    lineHeight: 20,
    color: couleurs.encre,
  },
  separateur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    paddingVertical: espaces.xs,
  },
  filet: {
    flex: 1,
    height: 1,
    backgroundColor: couleurs.bordure,
  },
  texteSeparateur: {
    fontSize: 12.5,
    fontWeight: '700',
    color: couleurs.texteSecondaire,
  },
  titreDeja: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
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
  lienRetour: {
    fontSize: 13.5,
    fontWeight: '700',
    color: couleurs.texteSecondaire,
    textAlign: 'center',
    paddingVertical: espaces.s,
  },
}));
