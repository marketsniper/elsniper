// Mise en page racine : fournit la langue, le contexte d'auth et la pile de
// navigation (titres traduits).
import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, type Href } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

import { FournisseurDialogues } from '@/components/BoiteDialogue';
import { LagonDeVerre } from '@/components/FondPlage';
import { reparerAlertesWeb } from '@/lib/alerteWeb';
import { reveillerServeur } from '@/lib/api';
import { AuthProvider } from '@/lib/auth';
import { LangueProvider, useT } from '@/lib/i18n';
import { FournisseurPreferencePeau } from '@/lib/preferencePeau';
import { couleurs, FICHIERS_POLICES, usePeau } from '@/lib/theme';

// Flèche de retour GARANTIE sur chaque fiche : le retour natif disparaît
// quand l'historique est vide (page web rechargée, PWA relancée…) et son
// libellé automatique était illisible (« (auth) »). Ici : toujours visible,
// toujours un mot clair, et un repli vers l'accueil si rien derrière.
function RetourEntete({ accueil }: { accueil: Href }) {
  const router = useRouter();
  const { t } = useT();
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace(accueil))}
      accessibilityRole="button"
      hitSlop={12}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', paddingRight: 12 },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Ionicons name="chevron-back" size={26} color={couleurs.primaireFonce} />
      <Text style={{ color: couleurs.primaireFonce, fontSize: 16, fontWeight: '600' }}>
        {t('commun_retour')}
      </Text>
    </Pressable>
  );
}

function PilesNavigation() {
  const { t } = useT();
  // Accueil de repli : onglets client pour les fiches client, mode chauffeur
  // pour les fiches chauffeur.
  const retourClient = () => <RetourEntete accueil="/(tabs)/trajets" />;
  const retourColis = () => <RetourEntete accueil="/(tabs)/colis" />;
  const retourChauffeur = () => <RetourEntete accueil="/(driver)/courses" />;
  const retourProfil = () => <RetourEntete accueil="/(tabs)/profil" />;
  // Fiches ouvertes depuis le tableau de bord : on revient au tableau.
  const retourEquipe = () => <RetourEntete accueil="/equipe" />;
  return (
    <Stack
      screenOptions={{
        // Transparents : le lagon est posé une fois derrière toute la
        // navigation (voir LayoutRacine). Un fond opaque ici rendrait une
        // barre pleine en haut de chaque écran.
        headerStyle: { backgroundColor: 'transparent' },
        // L'en-tête flotte sur l'écran : chaque écran est opaque et peint son
        // lagon depuis y=0, le titre se pose dessus. C'est aussi ce qui rend
        // les écrans pleins — donc les onglets inactifs invisibles.
        headerTransparent: true,
        headerTintColor: couleurs.primaireFonce,
        headerTitleStyle: { color: couleurs.encre, fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: 'transparent' },
        // La signature du « Lagon de verre » : l'écran entrant se rassemble
        // sur place, et ses cartes remontent ensuite en décalé (voir Carte).
        // Un glissé latéral aurait fait bouger le lagon, qui doit rester
        // immobile sous les panneaux.
        animation: 'fade',
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(driver)" options={{ headerShown: false }} />
      {/* Pas de titre : l'écran s'ouvre sur « Votre taxi arrive », en gros.
          Répéter « Trajet » au-dessus n'apprendrait rien à personne. */}
      <Stack.Screen name="trip/[id]" options={{ title: '', headerLeft: retourClient }} />
      <Stack.Screen name="place/[id]" options={{ title: t('place_fiche_titre'), headerLeft: retourClient }} />
      <Stack.Screen name="package/nouveau" options={{ title: t('titre_nouveau_colis'), headerLeft: retourColis }} />
      <Stack.Screen name="package/[id]" options={{ title: t('titre_colis'), headerLeft: retourColis }} />
      <Stack.Screen name="course/[id]" options={{ title: t('titre_course'), headerLeft: retourChauffeur }} />
      <Stack.Screen name="equipe" options={{ title: t('titre_equipe'), headerLeft: retourProfil }} />
      <Stack.Screen name="verifications" options={{ title: t('verif_titre'), headerLeft: retourEquipe }} />
      <Stack.Screen name="hotel/[id]" options={{ title: t('hotel_fiche_titre'), headerLeft: retourEquipe }} />
      <Stack.Screen name="taxi/[id]" options={{ title: t('taxi_fiche_titre'), headerLeft: retourEquipe }} />
      <Stack.Screen name="annonce/[id]" options={{ title: t('titre_annonce'), headerLeft: retourChauffeur }} />
      <Stack.Screen name="colis-dispo/[id]" options={{ title: t('titre_colis_dispo'), headerLeft: retourChauffeur }} />
    </Stack>
  );
}

// Le thème de navigation peint SON fond derrière chaque navigateur — blanc
// par défaut, il recouvrait le lagon sur tous les écrans à onglets.
// Transparent, il le laisse passer. Deux variantes : les valeurs par défaut
// de React Navigation (bordures, curseur de saisie) n'ont pas la même
// lisibilité sur crème que sur bleu profond.
const THEME_SOMBRE = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: 'transparent', card: 'transparent' },
};
const THEME_CLAIR = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: 'transparent', card: 'transparent' },
};

/**
 * Le cadre de l'application — SOUS le fournisseur de peau.
 *
 * Il y vit pour une raison précise : les styles écrits directement dans le
 * JSX (le fond, ici) sont évalués au moment où le composant se rend. Placés
 * dans la racine, ils prenaient les couleurs de la peau PRÉCÉDENTE, et
 * l'application s'ouvrait sur un fond crème sous un dégradé de lagon.
 */
function CadreApplication() {
  const peau = usePeau();
  return (
    <>
      {/* Heure et batterie du téléphone : claires sur le lagon, sombres sur
          le crème de Bento — sinon elles disparaissent. */}
      <StatusBar style={peau === 'bento' ? 'dark' : 'light'} />
      {/* La `key` remonte toute la navigation à chaque changement de peau.
          C'est volontaire : les feuilles de style sont lues À LA VOLÉE par
          les écrans, et un écran déjà rendu ne se redessine pas parce qu'un
          contexte a changé plus haut — il gardait donc les couleurs de
          l'ancienne peau, texte blanc sur crème compris. */}
      <View key={peau} style={{ flex: 1, backgroundColor: couleurs.sable }}>
        {peau === 'verre' && <LagonDeVerre />}
        <ThemeProvider value={peau === 'bento' ? THEME_CLAIR : THEME_SOMBRE}>
          {/* Les fenêtres de confirmation s'affichent par-dessus tout écran. */}
          <FournisseurDialogues>
            <PilesNavigation />
          </FournisseurDialogues>
        </ThemeProvider>
      </View>
    </>
  );
}

// Sur le web, les boîtes de dialogue de React Native sont des fonctions
// vides : on les rebranche AVANT le premier rendu, sinon des boutons comme
// « Démarrer la course » resteraient sans effet.
reparerAlertesWeb();

export default function LayoutRacine() {
  // Le serveur gratuit s'endort après 15 min sans visite : on le réveille dès
  // l'ouverture de l'app, pour que le premier geste (inscription, connexion,
  // réservation) parte sur un serveur debout.
  useEffect(() => {
    reveillerServeur();
  }, []);

  // Instrument Sans : on attend qu'elle soit là avant de dessiner. Sinon le
  // premier rendu sort dans la police du système, puis tout se recompose sous
  // les yeux du client — un sursaut visible à chaque ouverture. En cas
  // d'échec de chargement, on dessine quand même : une police de repli vaut
  // mieux qu'un écran blanc.
  const [policesPretes, erreurPolices] = useFonts(FICHIERS_POLICES);
  if (!policesPretes && !erreurPolices) return null;

  return (
    <LangueProvider>
      <AuthProvider>
        {/* Le design choisi par le client — Lagon ou Bento — s'applique à
            toute l'application, écrans chauffeur et équipe compris. */}
        <FournisseurPreferencePeau>
          <CadreApplication />
        </FournisseurPreferencePeau>
      </AuthProvider>
    </LangueProvider>
  );
}
