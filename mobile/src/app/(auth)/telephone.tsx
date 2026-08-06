// Écran d'accueil : saisie du numéro de téléphone (+255 par défaut).
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Bouton, Carte, Champ, Ecran, SousTitre, TexteErreur, Titre } from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { couleurs, espaces } from '@/lib/theme';

/** Normalise le numéro saisi en format international (+255...). */
function normaliserTelephone(indicatif: string, numero: string): string {
  const chiffres = numero.replace(/[^\d]/g, '').replace(/^0+/, '');
  return `${indicatif}${chiffres}`;
}

export default function EcranTelephone() {
  const router = useRouter();
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
        params: { phone: telephone, devCode: devCode ?? '' },
      });
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : "Échec de l'envoi du code.");
    } finally {
      setCharge(false);
    }
  };

  return (
    <Ecran>
      <View style={styles.entete}>
        <Text style={styles.logo}>zanziGo</Text>
        <SousTitre>Courses et livraison de colis à Zanzibar</SousTitre>
      </View>
      <Carte>
        <Titre>Bienvenue</Titre>
        <SousTitre>
          Entrez votre numéro de téléphone, nous vous envoyons un code de vérification par SMS.
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
              placeholder="712 345 678"
              autoFocus
            />
          </View>
        </View>
        <TexteErreur>{erreur}</TexteErreur>
        <Bouton titre="Recevoir le code" onPress={envoyer} charge={charge} />
      </Carte>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  entete: {
    alignItems: 'center',
    paddingVertical: espaces.xl * 2,
    gap: espaces.s,
  },
  logo: {
    fontSize: 40,
    fontWeight: '800',
    color: couleurs.primaire,
  },
  rangeeTelephone: {
    flexDirection: 'row',
    gap: espaces.m,
  },
  champIndicatif: {
    width: 80,
  },
  champNumero: {
    flex: 1,
  },
});
