// Page d'accueil de marque : coucher de soleil en fond, logotype sur dégradé,
// sélecteur de langue FR·EN·SW et choix du profil (visiteur, local, hôtel,
// chauffeur). Le choix est transmis au flux téléphone → OTP → formulaire.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Canopee } from '@/components/Canopee';
import { FondPlage } from '@/components/FondPlage';
import { LaCourse } from '@/components/LaCourse';
import { Colobe } from '@/components/marques/Colobe';
import { EtiquetteVersion } from '@/components/Version';
import { LogoZanziGo, SelecteurLangue, SelecteurPeau } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, ombres, rayons, stylesReactifs } from '@/lib/theme';
import { formaterMontant, TARIFS_TRAJET_USD } from '@/lib/types';

type ProfilAccueil = 'visitor' | 'local' | 'hotel' | 'driver';

function CarteProfil({
  icone,
  titre,
  sousTitre,
  mention,
  vedette = false,
  onPress,
}: {
  icone: React.ComponentProps<typeof Ionicons>['name'];
  titre: string;
  sousTitre: string;
  mention?: string;
  /** Carte en aplat plein : elle ne ressemble à aucune autre de la page. */
  vedette?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.carte,
        vedette && styles.carteVedette,
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={[styles.bulleIcone, vedette && styles.bulleIconeVedette]}>
        <Ionicons
          name={icone}
          size={26}
          color={vedette ? couleurs.chauffeurFond : couleurs.primaire}
        />
      </View>
      <View style={styles.textes}>
        <Text style={[styles.titreCarte, vedette && { color: couleurs.surChauffeur }]}>
          {titre}
        </Text>
        <Text style={[styles.sousTitreCarte, vedette && { color: couleurs.surChauffeurDoux }]}>
          {sousTitre}
        </Text>
        {!!mention && <Text style={styles.mention}>{mention}</Text>}
      </View>
      <Ionicons
        name="chevron-forward"
        size={22}
        color={vedette ? couleurs.surChauffeurDoux : couleurs.texteSecondaire}
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
      {/* LA CANOPÉE — elle pousse dans les marges que la colonne de lecture
          laisse libres. Sur un téléphone elle affleure les bords ; sur un
          écran large elle occupe tout le vide. */}
      <Canopee />
      <SafeAreaView style={styles.zone} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={styles.contenu}
          showsVerticalScrollIndicator={false}
        >
          <SelecteurLangue />
          <View style={styles.entete}>
            {/* LE NOM, ET RIEN D'AUTRE — comme Uber ou Bolt. Il n'y a plus
                d'image au-dessus : le logotype EST le logo. Il se peint avec
                la peau du moment, donc il ne peut pas se retrouver invisible
                sur un fond qu'on n'avait pas prévu — c'est exactement ce qui
                arrivait au logotype gravé dans un fichier. */}
            <LogoZanziGo taille={54} />
            <Text style={styles.tagline}>{t('app_tagline')}</Text>
          </View>

          {/* LA COURSE — un chauffeur, deux passagers, un madafu, et la
              route qui défile. C'est une entreprise de taxi : il fallait
              qu'une voiture roule quelque part. */}
          <LaCourse />

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
            vedette
            onPress={() => choisir('driver')}
          />

          <View style={styles.ligneConfiance}>
            <Ionicons name="shield-checkmark" size={18} color={couleurs.primaire} />
            <Text style={styles.texteConfiance}>{t('accueil_confiance')}</Text>
          </View>

          {/* L'EMBLÈME, ET SA CONTREPARTIE. Le colobe roux n'est pas là pour
              décorer : c'est l'animal que notre propre métier écrase, et ce
              bloc est ce qui l'autorise à figurer ici. La consigne qu'il
              annonce s'affiche vraiment au chauffeur, sur chaque course qui
              traverse Jozani. */}
          <View style={styles.blocEmbleme}>
            <Colobe taille={34} couleur={couleurs.primaire} />
            <View style={styles.textesEmbleme}>
              <Text style={styles.titreEmbleme}>{t('embleme_titre')}</Text>
              <Text style={styles.texteEmbleme}>{t('embleme_texte')}</Text>
            </View>
          </View>

          {/* LE DESIGN, AU CHOIX. Placé en bas : on vient d'abord réserver
              un taxi. Mais il est là avant même de se connecter — un client
              qui n'arrive pas à lire l'écran sous le soleil de midi ne
              devrait pas avoir à créer un compte pour y remédier. */}
          <View style={styles.blocPeau}>
            <Text style={styles.titrePeau}>{t('peau_titre')}</Text>
            <Text style={styles.introPeau}>{t('peau_intro')}</Text>
            <SelecteurPeau />
          </View>

          <Text style={styles.pied}>{t('accueil_pied')}</Text>

          <Pressable
            onPress={() => router.push('/equipe')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.lienEquipe, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="key-outline" size={13} color={couleurs.texteSecondaire} />
            <Text style={styles.texteLienEquipe}>{t('equipe_lien_accueil')}</Text>
          </Pressable>
          <EtiquetteVersion />
        </ScrollView>
      </SafeAreaView>
    </FondPlage>
  );
}

const styles = stylesReactifs(() => ({
  zone: {
    flex: 1,
  },
  blocEmbleme: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espaces.s,
    marginTop: espaces.l,
  },
  textesEmbleme: {
    flex: 1,
    gap: 3,
  },
  titreEmbleme: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
  },
  texteEmbleme: {
    fontSize: 13,
    lineHeight: 19,
    color: couleurs.texteSecondaire,
  },
  blocPeau: {
    marginTop: espaces.l,
    gap: espaces.s,
  },
  titrePeau: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
  },
  introPeau: {
    fontSize: 13,
    lineHeight: 18,
    color: couleurs.texteSecondaire,
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
  // Le logotype se pose SUR le sol de l'écran, sans tuile ni cadre : le
  // carré crème d'origine appartenait à l'ancienne direction artistique et
  // se détachait comme une vignette collée sur la pierre de l'estran.
  tagline: {
    fontSize: 16,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
    textAlign: 'center',
  },
  question: {
    fontSize: 20,
    fontWeight: '800',
    color: couleurs.encre,
    marginBottom: espaces.xs,
    letterSpacing: -0.3,
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
  // Un APLAT PLEIN — orange pastel — au milieu de trois panneaux
  // translucides. L'ancien « sombre » datait des peaux claires : sur le
  // lagon, son fond blanc à 20 % était à un cheveu des autres cartes, et la
  // case du chauffeur disparaissait dans la page.
  carteVedette: {
    backgroundColor: couleurs.chauffeurFond,
  },
  bulleIcone: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulleIconeVedette: {
    backgroundColor: couleurs.surChauffeur,
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
    color: couleurs.texteSecondaire,
    textAlign: 'center',
    lineHeight: 18,
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
    color: couleurs.texteSecondaire,
  },
  pied: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
    textAlign: 'center',
    marginTop: espaces.s,
    lineHeight: 18,
  },
}));
