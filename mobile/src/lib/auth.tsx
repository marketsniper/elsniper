// Contexte d'authentification : session JWT persistée localement
// (SecureStore sur téléphone, localStorage sur le web — voir lib/stockage).
import { useRouter } from 'expo-router';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  definirCleEquipe,
  definirJeton,
  ErreurApi,
  obtenirChauffeur,
  obtenirHotel,
  obtenirUtilisateur,
} from './api';
import { ecrireStockage, lireStockage, supprimerStockage } from './stockage';
import type { Chauffeur, Hotel, SessionAuth, Utilisateur } from './types';

const CLE_SESSION = 'zanzigo_session';
// La même clé que l'écran /equipe : c'est ELLE qu'on purge à la déconnexion.
const CLE_EQUIPE = 'zanzigo.cle_equipe';

/**
 * Confronte la session gardée sur l'appareil à la réalité du serveur.
 *
 * Sans ce contrôle, un compte supprimé côté serveur laissait l'application
 * dans un état fantôme : le téléphone continuait d'afficher « candidature
 * envoyée » ou l'espace client d'un compte qui n'existait plus, sans aucun
 * moyen de repartir — le chauffeur ne pouvait même plus déposer ses pièces.
 *
 * Renvoie la session rafraîchie (le statut de vérification est au passage
 * remis à jour), ou null si le compte a disparu. Une panne de réseau ne
 * déconnecte JAMAIS : seule une réponse claire du serveur (compte
 * introuvable ou jeton refusé) fait repartir de l'entrée.
 */
async function verifierSession(session: SessionAuth): Promise<SessionAuth | null> {
  const controles: [
    'driver' | 'user' | 'hotel',
    string | undefined,
    (id: string) => Promise<Chauffeur | Utilisateur | Hotel>,
  ][] = [
    ['driver', session.driver?.id, obtenirChauffeur],
    ['user', session.user?.id, obtenirUtilisateur],
    ['hotel', session.hotel?.id, obtenirHotel],
  ];
  let rafraichie = session;
  for (const [cle, id, recuperer] of controles) {
    if (!id) continue;
    try {
      const frais = await recuperer(id);
      rafraichie = { ...rafraichie, [cle]: frais };
    } catch (e) {
      if (e instanceof ErreurApi && (e.status === 404 || e.status === 401 || e.status === 403)) {
        return null; // le compte n'existe plus (ou le jeton n'est plus valable)
      }
      // Serveur endormi, réseau coupé : on garde la session telle quelle.
    }
  }
  return rafraichie;
}

interface ContexteAuth {
  /** Session courante, ou null si déconnecté. */
  session: SessionAuth | null;
  /** True pendant la lecture initiale du stockage local. */
  chargement: boolean;
  connexion: (session: SessionAuth) => Promise<void>;
  deconnexion: () => Promise<void>;
  /** Met à jour une partie de la session (ex. profil créé après l'OTP). */
  majSession: (maj: Partial<SessionAuth>) => Promise<void>;
}

const AuthContext = createContext<ContexteAuth | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionAuth | null>(null);
  const [chargement, setChargement] = useState(true);

  // Restauration de la session au démarrage.
  useEffect(() => {
    (async () => {
      try {
        const brut = await lireStockage(CLE_SESSION);
        if (brut) {
          const restauree = JSON.parse(brut) as SessionAuth;
          if (restauree?.token) {
            definirJeton(restauree.token);
            setSession(restauree);
            // Contrôle EN ARRIÈRE-PLAN : l'application s'ouvre sans attendre
            // (le serveur gratuit peut mettre une minute à se réveiller), et
            // la session se corrige toute seule dès la réponse.
            verifierSession(restauree)
              .then(async (verifiee) => {
                if (!verifiee) {
                  definirJeton(null);
                  setSession(null);
                  await supprimerStockage(CLE_SESSION).catch(() => {});
                } else if (JSON.stringify(verifiee) !== brut) {
                  setSession(verifiee);
                  await ecrireStockage(CLE_SESSION, JSON.stringify(verifiee)).catch(() => {});
                }
              })
              .catch(() => {});
          }
        }
      } catch {
        // Session illisible : on repart de zéro.
        await supprimerStockage(CLE_SESSION).catch(() => {});
      } finally {
        setChargement(false);
      }
    })();
  }, []);

  const connexion = useCallback(async (nouvelle: SessionAuth) => {
    definirJeton(nouvelle.token);
    setSession(nouvelle);
    await ecrireStockage(CLE_SESSION, JSON.stringify(nouvelle));
  }, []);

  const deconnexion = useCallback(async () => {
    definirJeton(null);
    // La CLÉ ÉQUIPE part avec la session : sans cette purge, un membre de
    // l'équipe qui se déconnectait laissait la clé dans le stockage — et le
    // prochain utilisateur du même appareil ouvrait /equipe, /verifications
    // ou /vehicules directement sur les paiements et les pièces d'identité,
    // sans que la clé lui soit jamais redemandée.
    definirCleEquipe(null);
    setSession(null);
    await supprimerStockage(CLE_SESSION).catch(() => {});
    await supprimerStockage(CLE_EQUIPE).catch(() => {});
  }, []);

  const majSession = useCallback(async (maj: Partial<SessionAuth>) => {
    let suivante: SessionAuth | null = null;
    setSession((precedente) => {
      if (!precedente) return precedente;
      suivante = { ...precedente, ...maj };
      return suivante;
    });
    if (suivante) {
      await ecrireStockage(CLE_SESSION, JSON.stringify(suivante));
    }
  }, []);

  const valeur = useMemo(
    () => ({ session, chargement, connexion, deconnexion, majSession }),
    [session, chargement, connexion, deconnexion, majSession]
  );

  return <AuthContext.Provider value={valeur}>{children}</AuthContext.Provider>;
}

/**
 * À poser sur tout écran réservé aux connectés : si la session disparaît
 * (compte supprimé côté serveur, déconnexion), on revient à l'entrée au lieu
 * de rester bloqué sur un écran qui ne correspond plus à rien.
 */
export function useRetourSiDeconnecte(): void {
  const { session, chargement } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!chargement && !session) router.replace('/(auth)/accueil');
  }, [session, chargement, router]);
}

export function useAuth(): ContexteAuth {
  const contexte = useContext(AuthContext);
  if (!contexte) {
    throw new Error("useAuth doit être utilisé à l'intérieur de <AuthProvider>.");
  }
  return contexte;
}
