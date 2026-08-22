// LA CONSIGNE DE JOZANI — la seule chose que l'emblème produit.
//
// Elle n'apparaît QUE sur les courses dont l'itinéraire traverse la forêt,
// et QUE pour celui qui conduit. Une consigne de vitesse affichée à un
// passager n'est pas une consigne, c'est une brochure.
//
// Les faits qu'elle porte sont vérifiés : avant la pose des ralentisseurs sur
// la route de Jozani, un colobe était écrasé toutes les deux à trois
// semaines ; les collisions ont été divisées par deux depuis. Aucune vitesse
// chiffrée n'est inventée ici — la règle est celle qui existe sur la route :
// ralentir et respecter les ralentisseurs.
import React from 'react';
import { Text, View } from 'react-native';

import { Colobe } from '@/components/marques/Colobe';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, rayons, stylesReactifs } from '@/lib/theme';

export function ConsigneJozani() {
  const { t } = useT();
  return (
    <View style={styles.bandeau}>
      <Colobe taille={30} couleur={couleurs.surChauffeur} />
      <View style={styles.textes}>
        <Text style={styles.titre}>{t('jozani_titre')}</Text>
        <Text style={styles.texte}>{t('jozani_texte')}</Text>
      </View>
    </View>
  );
}

const styles = stylesReactifs(() => ({
  bandeau: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espaces.s,
    padding: espaces.m,
    borderRadius: rayons.carte,
    backgroundColor: couleurs.chauffeurFond,
  },
  textes: {
    flex: 1,
    gap: 2,
  },
  titre: {
    fontSize: 15,
    fontWeight: '800',
    color: couleurs.surChauffeur,
  },
  texte: {
    fontSize: 13.5,
    lineHeight: 19,
    color: couleurs.surChauffeurDoux,
  },
}));
