// Page d'accueil de marque : premier écran d'un visiteur non connecté.
// Choix du profil (touriste, résident, hôtel, chauffeur) — le choix est
// transmis à travers le flux téléphone → OTP → formulaire adapté.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Ecran, LogoZanziGo } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import { formaterMontant, tarifTrajet } from '@/lib/types';

type ProfilAccueil = 'tourist' | 'resident' | 'hotel' | 'driver';

function CarteProfil({
  icone,
  titre,
  sousTitre,
  mention,
  sombre = false,
  onPress,
}: {
  icone: React.ComponentProps<typeof Ionicons>['name'];
  titre: string;
  sousTitre: string;
  mention?: string;
  sombre?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.carte,
        sombre && styles.carteSombre,
        pressed && { opacity: 0.75 },
      ]}
    >
      <View style={[styles.bulleIcone, sombre && styles.bulleIconeSombre]}>
        <Ionicons
          name={icone}
          size={26}
          color={sombre ? couleurs.primaireClair : couleurs.primaire}
        />
      </View>
      <View style={styles.textes}>
        <Text style={[styles.titreCarte, sombre && { color: couleurs.blanc }]}>{titre}</Text>
        <Text style={[styles.sousTitreCarte, sombre && { color: couleurs.bordure }]}>
          {sousTitre}
        </Text>
        {!!mention && <Text style={styles.mention}>{mention}</Text>}
      </View>
      <Ionicons
        name="chevron-forward"
        size={22}
        color={sombre ? couleurs.bordure : couleurs.texteSecondaire}
      />
    </Pressable>
  );
}

export default function EcranAccueil() {
  const router = useRouter();
  const { session } = useAuth();

  const prixPrive = tarifTrajet('private', 'USD');
  const prixLocal = tarifTrajet('shared_local', 'TZS');

  // Touriste / résident / chauffeur : flux téléphone → OTP.
  // Hôtel : connexion e-mail + mot de passe (pas d'OTP).
  // Connecté sans profil : on va directement au bon formulaire.
  const choisir = (profil: ProfilAccueil) => {
    if (profil === 'hotel') {
      if (session?.hotel) router.replace('/');
      else router.push('/(auth)/hotel');
      return;
    }
    if (!session) {
      router.push({ pathname: '/(auth)/telephone', params: { profil } });
      return;
    }
    if (profil === 'driver') {
      if (session.driver) router.replace('/');
      else router.push('/(auth)/pro');
      return;
    }
    if (session.user) router.replace('/');
    else router.push({ pathname: '/(auth)/client', params: { type: profil } });
  };

  return (
    <Ecran>
      <View style={styles.entete}>
        <LogoZanziGo taille={46} />
        <Text style={styles.tagline}>Vos trajets et vos colis à Zanzibar</Text>
      </View>

      <Text style={styles.question}>Qui êtes-vous ?</Text>

      <CarteProfil
        icone="airplane-outline"
        titre="Visiteur · Touriste"
        sousTitre={`Courses privées et navettes — prix en USD${
          prixPrive !== null ? ` (Course privée ${formaterMontant(prixPrive, 'USD')})` : ''
        }`}
        onPress={() => choisir('tourist')}
      />
      <CarteProfil
        icone="home-outline"
        titre="Résident · Local"
        sousTitre={`Tarif local en shillings${
          prixLocal !== null ? ` — Navette locale ${formaterMontant(prixLocal, 'TZS')}` : ''
        }`}
        mention="Vérification du document d'identité requise"
        onPress={() => choisir('resident')}
      />
      <CarteProfil
        icone="business-outline"
        titre="Hôtel partenaire"
        sousTitre="Réservez des taxis pour vos clients"
        onPress={() => choisir('hotel')}
      />

      <View style={styles.separateur} />

      <CarteProfil
        icone="car-sport-outline"
        titre="Chauffeur — Taxi Partner"
        sousTitre="Accédez à vos courses et scannez les QR"
        sombre
        onPress={() => choisir('driver')}
      />

      <Text style={styles.pied}>
        Déjà inscrit ? Choisissez votre profil : votre numéro de téléphone vous reconnaît.
      </Text>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  entete: {
    alignItems: 'center',
    paddingTop: espaces.xxl,
    paddingBottom: espaces.xl,
    gap: espaces.s,
  },
  tagline: {
    fontSize: 16,
    color: couleurs.texteSecondaire,
    textAlign: 'center',
  },
  question: {
    fontSize: 18,
    fontWeight: '700',
    color: couleurs.encre,
    marginBottom: espaces.xs,
  },
  carte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    backgroundColor: couleurs.blanc,
    borderRadius: rayons.carte,
    padding: espaces.l,
    minHeight: 88,
    ...ombres.carte,
  },
  carteSombre: {
    backgroundColor: couleurs.encre,
  },
  bulleIcone: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulleIconeSombre: {
    backgroundColor: couleurs.primaireFonce,
  },
  textes: {
    flex: 1,
    gap: 3,
  },
  titreCarte: {
    fontSize: 16,
    fontWeight: '700',
    color: couleurs.encre,
  },
  sousTitreCarte: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
    lineHeight: 18,
  },
  mention: {
    fontSize: 12,
    color: couleurs.attente,
    fontWeight: '600',
  },
  separateur: {
    height: 1,
    backgroundColor: couleurs.bordure,
    marginVertical: espaces.s,
  },
  pied: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
    textAlign: 'center',
    marginTop: espaces.s,
    lineHeight: 18,
  },
});
