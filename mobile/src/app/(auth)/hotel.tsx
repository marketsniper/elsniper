// Connexion des hôtels partenaires : e-mail + mot de passe (pas d'OTP).
// POST /auth/hotel-login {email, password} → {token, hotel} ; la session
// stocke {token, hotel} (user/driver restent null).
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
import { useT } from '@/lib/i18n';
import { champ, type Hotel } from '@/lib/types';
import { couleurs, espaces } from '@/lib/theme';

export default function EcranHotelConnexion() {
  const router = useRouter();
  const { connexion } = useAuth();
  const { t } = useT();

  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  const seConnecter = async () => {
    setErreur('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErreur(t('hotelcx_erreur_email'));
      return;
    }
    if (!motDePasse) {
      setErreur(t('hotelcx_erreur_mdp'));
      return;
    }
    setCharge(true);
    try {
      const reponse = await api.connexionHotel(email.trim().toLowerCase(), motDePasse);
      const hotel: Hotel = reponse.hotel;
      await connexion({
        token: reponse.token,
        phone: String(champ(hotel, 'phone') ?? ''),
        user: null,
        driver: null,
        hotel,
      });
      router.replace('/');
    } catch (e) {
      if (e instanceof ErreurApi && e.code === 'invalid_credentials') {
        setErreur(t('hotelcx_erreur_identifiants'));
      } else {
        setErreur(e instanceof ErreurApi ? e.message : t('hotelcx_erreur_connexion'));
      }
    } finally {
      setCharge(false);
    }
  };

  return (
    <Ecran fond="lagon">
      <View style={styles.entete}>
        <LogoZanziGo taille={40} />
        <Text style={styles.tagline}>{t('hotelcx_espace')}</Text>
      </View>
      <Carte>
        <Titre>{t('hotelcx_titre')}</Titre>
        <SousTitre>{t('hotelcx_intro')}</SousTitre>
        <Champ
          label={t('commun_email')}
          value={email}
          onChangeText={setEmail}
          placeholder="reception@oceanview.co.tz"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <Champ
          label={t('hotelcx_mdp')}
          value={motDePasse}
          onChangeText={setMotDePasse}
          placeholder={t('hotelcx_mdp_placeholder')}
          secureTextEntry
          autoCapitalize="none"
        />
        <TexteErreur>{erreur}</TexteErreur>
        <Bouton
          titre={t('hotelcx_bouton')}
          icone="log-in-outline"
          onPress={seConnecter}
          charge={charge}
        />
        <Pressable
          onPress={() => router.push('/(auth)/hotel-inscription')}
          style={styles.lienInscription}
          hitSlop={8}
        >
          <Ionicons name="add-circle-outline" size={18} color={couleurs.primaire} />
          <Text style={styles.texteLien}>{t('hotelcx_creer')}</Text>
        </Pressable>
      </Carte>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  entete: {
    alignItems: 'center',
    paddingVertical: espaces.xl,
    gap: espaces.s,
  },
  tagline: {
    fontSize: 15,
    color: couleurs.texteSecondaire,
  },
  lienInscription: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaces.s,
    paddingVertical: espaces.s,
  },
  texteLien: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.primaire,
  },
});
