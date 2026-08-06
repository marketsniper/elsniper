// Saisie du code OTP à 6 chiffres reçu par SMS (devCode affiché en dev).
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Bouton, Carte, Champ, Ecran, SousTitre, TexteErreur, Titre } from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { couleurs } from '@/lib/theme';

export default function EcranOtp() {
  const router = useRouter();
  const { connexion } = useAuth();
  const params = useLocalSearchParams<{ phone?: string; devCode?: string }>();
  const phone = typeof params.phone === 'string' ? params.phone : '';
  const devCode = typeof params.devCode === 'string' ? params.devCode : '';

  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  const verifier = async () => {
    setErreur('');
    if (!/^\d{6}$/.test(code)) {
      setErreur('Le code comporte 6 chiffres.');
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
      // L'index redirige selon le profil (client, chauffeur, ou création de profil).
      router.replace('/');
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : 'Code invalide ou expiré.');
    } finally {
      setCharge(false);
    }
  };

  return (
    <Ecran>
      <Carte>
        <Titre>Vérification</Titre>
        <SousTitre>Code envoyé au {phone}. Saisissez les 6 chiffres reçus.</SousTitre>
        {!!devCode && (
          <Text style={styles.devCode}>Mode dev — code : {devCode}</Text>
        )}
        <Champ
          label="Code à 6 chiffres"
          value={code}
          onChangeText={(texte) => setCode(texte.replace(/[^\d]/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="123456"
          autoFocus
          style={styles.champCode}
        />
        <TexteErreur>{erreur}</TexteErreur>
        <Bouton titre="Valider" onPress={verifier} charge={charge} />
        <Bouton
          titre="Changer de numéro"
          variante="secondaire"
          onPress={() => router.back()}
        />
      </Carte>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  devCode: {
    color: couleurs.attente,
    fontWeight: '700',
    fontSize: 14,
  },
  champCode: {
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
  },
});
