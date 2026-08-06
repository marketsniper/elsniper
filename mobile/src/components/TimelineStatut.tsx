// Frise verticale de statut (trajets et colis).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { couleurs, espaces } from '@/lib/theme';

export interface EtapeTimeline {
  cle: string;
  label: string;
}

export function TimelineStatut({
  etapes,
  statutCourant,
  annule = false,
}: {
  etapes: EtapeTimeline[];
  statutCourant: string | undefined;
  annule?: boolean;
}) {
  const indexCourant = etapes.findIndex((e) => e.cle === statutCourant);

  return (
    <View style={styles.conteneur}>
      {etapes.map((etape, index) => {
        const atteinte = indexCourant >= 0 && index <= indexCourant && !annule;
        const derniere = index === etapes.length - 1;
        return (
          <View key={etape.cle} style={styles.ligne}>
            <View style={styles.colonnePoints}>
              <View
                style={[
                  styles.point,
                  atteinte ? styles.pointAtteint : styles.pointInactif,
                ]}
              />
              {!derniere && (
                <View
                  style={[
                    styles.trait,
                    indexCourant > index && !annule ? styles.traitAtteint : styles.traitInactif,
                  ]}
                />
              )}
            </View>
            <Text style={[styles.label, atteinte && styles.labelAtteint]}>{etape.label}</Text>
          </View>
        );
      })}
      {annule && (
        <View style={styles.ligne}>
          <View style={styles.colonnePoints}>
            <View style={[styles.point, styles.pointAnnule]} />
          </View>
          <Text style={[styles.label, styles.labelAnnule]}>Annulé</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: {
    gap: 0,
  },
  ligne: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espaces.m,
  },
  colonnePoints: {
    alignItems: 'center',
    width: 16,
  },
  point: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 3,
  },
  pointAtteint: {
    backgroundColor: couleurs.primaire,
  },
  pointInactif: {
    backgroundColor: couleurs.bordure,
  },
  pointAnnule: {
    backgroundColor: couleurs.danger,
  },
  trait: {
    width: 2,
    height: 22,
    marginVertical: 2,
  },
  traitAtteint: {
    backgroundColor: couleurs.primaire,
  },
  traitInactif: {
    backgroundColor: couleurs.bordure,
  },
  label: {
    fontSize: 14,
    color: couleurs.texteSecondaire,
    paddingBottom: espaces.m,
  },
  labelAtteint: {
    color: couleurs.encre,
    fontWeight: '600',
  },
  labelAnnule: {
    color: couleurs.danger,
    fontWeight: '700',
  },
});
