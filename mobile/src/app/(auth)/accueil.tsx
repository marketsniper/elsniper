// Page d'accueil de marque : coucher de soleil en fond, logotype sur dégradé,
// sélecteur de langue FR·EN·SW et choix du profil (visiteur, local, hôtel,
// chauffeur). Le choix est transmis au flux téléphone → OTP → formulaire.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FondPlage } from '@/components/FondPlage';
import { LogoZanziGo, SelecteurLangue } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import { formaterMontant, TARIF_LOCAL_TZS, TARIFS_TRAJET_USD } from '@/lib/types';

type ProfilAccueil = 'visitor' | 'local' | 'hotel' | 'driver';

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
        pressed && { opacity: 0.8 },
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
        <Text style={[styles.sousTitreCarte, sombre && { color: couleurs.texteSecondaire }]}>
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
  const { t } = useT();

  // Visiteurs (touriste/résident) et locaux : flux téléphone → OTP.
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
    else if (profil === 'local') {
      router.push({ pathname: '/(auth)/client', params: { type: 'local' } });
    } else {
      router.push('/(auth)/client');
    }
  };

  return (
    <FondPlage fond="coucherSoleil" voile="sombre">
      <SafeAreaView style={styles.zone} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={styles.contenu}
          showsVerticalScrollIndicator={false}
        >
          <SelecteurLangue />
          <View style={styles.entete}>
            <Image
              source={require('../../../assets/images/logo-app.png')}
              style={styles.logoImage}
              accessibilityLabel="zanziGo"
            />
            <LogoZanziGo taille={48} surFonce />
            <Text style={styles.tagline}>{t('app_tagline')}</Text>
          </View>

          <Text style={styles.question}>{t('accueil_question')}</Text>

          <CarteProfil
            icone="airplane-outline"
            titre={t('accueil_visiteur_titre')}
            sousTitre={t('accueil_visiteur_soustitre')}
            onPress={() => choisir('visitor')}
          />
          <CarteProfil
            icone="id-card-outline"
            titre={t('accueil_local_titre')}
            sousTitre={t('accueil_local_soustitre')}
            mention={t('accueil_local_mention')}
            onPress={() => choisir('local')}
          />
          <CarteProfil
            icone="business-outline"
            titre={t('accueil_hotel_titre')}
            sousTitre={t('accueil_hotel_soustitre')}
            onPress={() => choisir('hotel')}
          />

          <CarteProfil
            icone="car-sport-outline"
            titre={t('accueil_chauffeur_titre')}
            sousTitre={t('accueil_chauffeur_soustitre')}
            sombre
            onPress={() => choisir('driver')}
          />

          <View style={styles.ligneConfiance}>
            <Ionicons name="shield-checkmark" size={18} color={couleurs.primaireClair} />
            <Text style={styles.texteConfiance}>{t('accueil_confiance')}</Text>
          </View>

          <Text style={styles.pied}>{t('accueil_pied')}</Text>

          <Pressable
            onPress={() => router.push('/equipe')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.lienEquipe, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="key-outline" size={13} color="rgba(255,255,255,0.75)" />
            <Text style={styles.texteLienEquipe}>{t('equipe_lien_accueil')}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </FondPlage>
  );
}

const styles = StyleSheet.create({
  zone: {
    flex: 1,
  },
  contenu: {
    padding: espaces.l,
    paddingBottom: espaces.xl * 2,
    gap: espaces.m,
  },
  entete: {
    alignItems: 'center',
    paddingTop: espaces.xl,
    paddingBottom: espaces.xl,
    gap: espaces.s,
  },
  logoImage: {
    width: 92,
    height: 92,
    borderRadius: 24,
    marginBottom: espaces.xs,
    ...ombres.carte,
  },
  tagline: {
    fontSize: 16,
    fontWeight: '600',
    color: couleurs.blanc,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  question: {
    fontSize: 18,
    fontWeight: '700',
    color: couleurs.blanc,
    marginBottom: espaces.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  carte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.carte,
    padding: espaces.l,
    minHeight: 88,
    ...ombres.carte,
  },
  carteSombre: {
    backgroundColor: couleurs.nuit,
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
  ligneConfiance: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaces.s,
    marginTop: espaces.s,
    paddingHorizontal: espaces.l,
  },
  texteConfiance: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.blanc,
    textAlign: 'center',
    lineHeight: 18,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  lienEquipe: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaces.xs,
    marginTop: espaces.l,
    paddingVertical: espaces.s,
  },
  texteLienEquipe: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
  },
  pied: {
    fontSize: 13,
    color: couleurs.blanc,
    textAlign: 'center',
    marginTop: espaces.s,
    lineHeight: 18,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
