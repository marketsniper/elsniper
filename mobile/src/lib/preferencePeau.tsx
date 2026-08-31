// LE DESIGN CHOISI PAR LE CLIENT.
//
// Zanzibar, midi, sur la plage : un écran sombre devient un miroir. Le même
// écran, sous une paillote au coucher du soleil, est le plus reposant qui
// soit. Aucun des deux n'a raison tout le temps — c'est au client de
// trancher, et il change d'avis dix fois dans la journée.
//
// Cinq peaux lui sont proposées :
//  · « Girofle » (Écume) — le blanc d'écume et le vert du logotype. Les
//    couleurs de la marque, et le design par défaut.
//  · « Lagon » — bleu profond, panneaux de verre.
//  · « Estran » — pierre claire, jade et terre cuite. Les ombres y suivent le
//    vrai soleil de Zanzibar.
//  · « Bento » — crème et encre noire, traits épais. Le plus lisible bras
//    tendu en plein soleil de midi.
//  · « Nuit d'épices » — presque noir, filets d'or. La nuit de Stone Town.
//
// Le choix est gardé sur l'appareil : on ne le redemande jamais. Il vaut pour
// TOUTE l'application, chauffeurs et équipe compris — l'homme qui conduit
// toute la journée est celui qui en a le plus besoin.
import React from 'react';

import { ecrireStockage, lireStockage } from './stockage';
import { FournisseurPeau, PEAU_PAR_DEFAUT, type NomPeau } from './theme';

const CLE = 'zanzigo.peau';

/** Les peaux proposées au client, dans l'ordre où elles s'affichent. */
export const PEAUX_AU_CHOIX = [
  'girofle',
  'verre',
  'estran',
  'bento',
  'nuit',
] as const satisfies readonly NomPeau[];

function peauValide(valeur: string | null): NomPeau | null {
  return (PEAUX_AU_CHOIX as readonly string[]).includes(valeur ?? '')
    ? (valeur as NomPeau)
    : null;
}

interface ContextePreference {
  peau: NomPeau;
  choisir: (nom: NomPeau) => void;
}

const Contexte = React.createContext<ContextePreference>({
  peau: PEAU_PAR_DEFAUT,
  choisir: () => {},
});

/** La peau choisie et de quoi en changer. */
export function usePreferencePeau(): ContextePreference {
  return React.useContext(Contexte);
}

export function FournisseurPreferencePeau({ children }: { children: React.ReactNode }) {
  const [peau, setPeau] = React.useState<NomPeau>(PEAU_PAR_DEFAUT);
  // On ne dessine rien tant qu'on n'a pas relu le choix : sans cette
  // attente, l'application s'ouvrirait une fraction de seconde en Lagon
  // avant de basculer en Bento sous les yeux du client.
  const [lue, setLue] = React.useState(false);

  React.useEffect(() => {
    let vivant = true;
    lireStockage(CLE)
      .then((valeur) => {
        const choix = peauValide(valeur);
        if (vivant && choix) setPeau(choix);
      })
      .catch(() => {})
      .finally(() => {
        if (vivant) setLue(true);
      });
    return () => {
      vivant = false;
    };
  }, []);

  const choisir = React.useCallback((nom: NomPeau) => {
    setPeau(nom);
    // L'écriture ne bloque pas la bascule : le design change tout de suite,
    // et si le stockage échoue on aura juste perdu la mémoire du choix.
    ecrireStockage(CLE, nom).catch(() => {});
  }, []);

  const valeur = React.useMemo(() => ({ peau, choisir }), [peau, choisir]);

  if (!lue) return null;

  return (
    <Contexte.Provider value={valeur}>
      <FournisseurPeau nom={peau}>{children}</FournisseurPeau>
    </Contexte.Provider>
  );
}
