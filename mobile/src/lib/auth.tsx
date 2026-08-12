// Contexte d'authentification : session JWT persistée localement
// (SecureStore sur téléphone, localStorage sur le web — voir lib/stockage).
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { definirJeton } from './api';
import { ecrireStockage, lireStockage, supprimerStockage } from './stockage';
import type { SessionAuth } from './types';

const CLE_SESSION = 'zanzigo_session';

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
    setSession(null);
    await supprimerStockage(CLE_SESSION).catch(() => {});
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

export function useAuth(): ContexteAuth {
  const contexte = useContext(AuthContext);
  if (!contexte) {
    throw new Error("useAuth doit être utilisé à l'intérieur de <AuthProvider>.");
  }
  return contexte;
}
