// Mise en page racine : fournit la langue, le contexte d'auth et la pile de
// navigation (titres traduits).
import { Ionicons } from '@expo/vector-icons';
import { Stack, usePathname, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Pressable, Text } from 'react-native';

import { FournisseurDialogues } from '@/components/BoiteDialogue';
import { reparerAlertesWeb } from '@/lib/alerteWeb';
import { reveillerServeur } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { LangueProvider, useT } from '@/lib/i18n';
import { couleurs, FournisseurPeau } from '@/lib/theme';

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
        headerStyle: { backgroundColor: couleurs.sable },
        headerTintColor: couleurs.primaireFonce,
        headerTitleStyle: { color: couleurs.encre, fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: couleurs.sable },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(driver)" options={{ headerShown: false }} />
      <Stack.Screen name="trip/[id]" options={{ title: t('titre_trajet'), headerLeft: retourClient }} />
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

/**
 * Choisit la peau de l'application.
 *
 * Un HÔTEL ne voit pas la même zanziGo qu'un voyageur : il travaille dans
 * « Nuit d'épices » — noir et or, l'ambiance d'une réception le soir. Tout le
 * reste (clients, chauffeurs, équipe) vit dans « Bento Zanzibar », crème et
 * corail, lisible en plein soleil.
 *
 * On bascule aussi sur les DEUX écrans d'entrée hôtel, avant même la
 * connexion : un partenaire doit reconnaître son univers dès la porte.
 */
function PeauSelonProfil({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const chemin = usePathname();
  const hotel =
    Boolean(session?.hotel) || chemin === '/hotel' || chemin === '/hotel-inscription';
  const peau = hotel ? 'nuit' : 'bento';
  return (
    <FournisseurPeau nom={peau}>
      <StatusBar style={hotel ? 'light' : 'dark'} />
      {/* La clé remonte toute la navigation au changement de peau. Sans elle,
          la barre d'onglets gardait les couleurs de la peau précédente : elle
          est dessinée par le navigateur, qui ne se redessine pas juste parce
          qu'un parent a changé. Cela n'arrive qu'à la connexion et à la
          déconnexion — deux moments où la navigation repart de zéro. */}
      <React.Fragment key={peau}>{children}</React.Fragment>
    </FournisseurPeau>
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
  return (
    <LangueProvider>
      <AuthProvider>
        <PeauSelonProfil>
          {/* Les fenêtres de confirmation s'affichent par-dessus tout écran. */}
          <FournisseurDialogues>
            <PilesNavigation />
          </FournisseurDialogues>
        </PeauSelonProfil>
      </AuthProvider>
    </LangueProvider>
  );
}
