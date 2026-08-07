// Écran de connexion : saisie du numéro de téléphone (+255 par défaut).
// Le profil choisi sur la page d'accueil (?profil=) est transmis jusqu'à
// l'OTP pour orienter la création de profil.
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
import { couleurs, espaces } from '@/lib/theme';

/** Libellé doux du profil choisi sur la page d'accueil. */
const LIBELLES_PROFIL: Record<string, string> = {
  tourist: 'Visiteur · Touriste',
  resident: 'Résident · Local',
  hotel: 'Hôtel partenaire',
  driver: 'Chauffeur — Taxi Partner',
};

/** Normalise le numéro saisi en format international (+255...). */
function normaliserTelephone(indicatif: string, numero: string): string {
  const chiffres = numero.replace(/[^\d]/g, '').replace(/^0+/, '');
  return `${indicatif}${chiffres}`;
}

export default function EcranTelephone() {
  const router = useRouter();
  const params = useLocalSearchParams<{ profil?: string }>();
  const profil = typeof params.profil === 'string' ? params.profil : '';

  const [indicatif, setIndicatif] = useState('+255');
  const [numero, setNumero] = useState('');
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  const envoyer = async () => {
    setErreur('');
    const telephone = normaliserTelephone(indicatif, numero);
    if (!/^\+\d{9,15}$/.test(telephone)) {
      setErreur('Numéro invalide. Exemple : +255 712 345 678.');
      return;
    }
    setCharge(true);
    try {
      const { devCode } = await api.demanderOtp(telephone);
      router.push({
        pathname: '/(auth)/otp',
        params: { phone: telephone, devCode: devCode ?? '', profil },
      });
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : "Impossible d'envoyer le code. Réessayez.");
    } finally {
      setCharge(false);
    }
  };

  return (
    <Ecran>
      <View style={styles.entete}>
        <LogoZanziGo taille={44} />
        <Text style={styles.tagline}>Vos trajets et vos colis à Zanzibar</Text>
      </View>

      <Carte>
        <Titre>Bienvenue</Titre>
        {!!profil && LIBELLES_PROFIL[profil] && (
          <Text style={styles.profilChoisi}>Profil choisi : {LIBELLES_PROFIL[profil]}</Text>
        )}
        <SousTitre>
          {profil === 'driver'
            ? 'Déjà Taxi Partner ? Entrez votre numéro : vous retrouvez directement votre compte. Nouveau ? Vous déposerez votre candidature juste après le code.'
            : 'Entrez votre numéro de téléphone pour recevoir votre code de connexion.'}
        </SousTitre>
        <View style={styles.rangeeTelephone}>
          <Champ
            label="Indicatif"
            value={indicatif}
            onChangeText={setIndicatif}
            keyboardType="phone-pad"
            style={styles.champIndicatif}
          />
          <View style={styles.champNumero}>
            <Champ
              label="Numéro de téléphone"
              value={numero}
              onChangeText={setNumero}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              placeholder="712 345 678"
              autoFocus
            />
          </View>
        </View>
        <TexteErreur>{erreur}</TexteErreur>
        <Bouton titre="Recevoir mon code" icone="arrow-forward" onPress={envoyer} charge={charge} />
      </Carte>

      <EncartInfo icone="flask-outline" ton="attente">
        Le code s&apos;affiche à l&apos;écran — phase de test sans SMS.
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
});
