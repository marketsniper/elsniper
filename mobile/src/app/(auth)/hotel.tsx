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
import { champ, type Hotel } from '@/lib/types';
import { couleurs, espaces } from '@/lib/theme';

export default function EcranHotelConnexion() {
  const router = useRouter();
  const { connexion } = useAuth();

  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  const seConnecter = async () => {
    setErreur('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErreur('Indiquez une adresse e-mail valide.');
      return;
    }
    if (!motDePasse) {
      setErreur('Indiquez votre mot de passe.');
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
        setErreur('E-mail ou mot de passe incorrect.');
      } else {
        setErreur(e instanceof ErreurApi ? e.message : 'Connexion impossible. Réessayez.');
      }
    } finally {
      setCharge(false);
    }
  };

  return (
    <Ecran>
      <View style={styles.entete}>
        <LogoZanziGo taille={40} />
        <Text style={styles.tagline}>Espace hôtels partenaires</Text>
      </View>
      <Carte>
        <Titre>Connexion hôtel</Titre>
        <SousTitre>
          Réservez des taxis pour vos clients et suivez vos envois de colis.
        </SousTitre>
        <Champ
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          placeholder="reception@oceanview.co.tz"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <Champ
          label="Mot de passe"
          value={motDePasse}
          onChangeText={setMotDePasse}
          placeholder="Votre mot de passe"
          secureTextEntry
          autoCapitalize="none"
        />
        <TexteErreur>{erreur}</TexteErreur>
        <Bouton titre="Se connecter" icone="log-in-outline" onPress={seConnecter} charge={charge} />
        <Pressable
          onPress={() => router.push('/(auth)/hotel-inscription')}
          style={styles.lienInscription}
          hitSlop={8}
        >
          <Ionicons name="add-circle-outline" size={18} color={couleurs.primaire} />
          <Text style={styles.texteLien}>Créer un compte partenaire</Text>
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
