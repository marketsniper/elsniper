// Le fond d'écran de zanziGo.
//
// Il a longtemps porté une photo de plage sous un voile de lisibilité. La
// direction « Bento Zanzibar » a tranché : plus de photo. Un aplat crème,
// des blocs cernés d'encre posés dessus — tout se lit à bout de bras, en
// plein soleil, et rien ne concurrence le contenu. En peau « Nuit d'épices »
// (les hôtels), le même aplat devient noir violacé.
//
// Le composant garde son nom et ses props : trente écrans les passent, et
// le jour où une photo revient sur un écran précis, elle se rebranche ici.
import React from 'react';
import { View } from 'react-native';

import { couleurs, stylesReactifs } from '@/lib/theme';

export type NomFond = 'coucherSoleil' | 'palmiers' | 'lagon' | 'vagues';

export function FondPlage({
  voile = 'clair',
  children,
}: {
  /** Conservé pour la compatibilité : sans effet depuis le passage en aplat. */
  fond?: NomFond;
  voile?: 'clair' | 'sombre';
  children: React.ReactNode;
}) {
  return <View style={voile === 'sombre' ? styles.fondAccent : styles.fond}>{children}</View>;
}

const styles = stylesReactifs(() => ({
  fond: {
    flex: 1,
    backgroundColor: couleurs.sable,
  },
  // La variante « sombre » servait à assombrir une photo. Sans photo, elle
  // n'a plus lieu d'être : le crème est le même partout, c'est le sol de la
  // direction.
  fondAccent: {
    flex: 1,
    backgroundColor: couleurs.sable,
  },
}));
