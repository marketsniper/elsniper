// Frise verticale de statut (trajets et colis) : étapes franchies cochées,
// étape courante mise en avant, étapes à venir estompées.
import { Ionicons } from '@expo/vector-icons';
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
    <View>
      {etapes.map((etape, index) => {
        const atteinte = indexCourant >= 0 && index <= indexCourant && !annule;
        const courante = index === indexCourant && !annule;
        const derniere = index === etapes.length - 1;
        return (
          <View key={etape.cle} style={styles.ligne}>
            <View style={styles.colonnePoints}>
              <View
                style={[
                  styles.point,
                  atteinte ? styles.pointAtteint : styles.pointInactif,
                  courante && styles.pointCourant,
                ]}
              >
                {atteinte && (
                  <Ionicons name="checkmark" size={12} color={couleurs.blanc} />
                )}
              </View>
              {!derniere && (
                <View
                  style={[
                    styles.trait,
                    indexCourant > index && !annule ? styles.traitAtteint : styles.traitInactif,
                  ]}
                />
              )}
            </View>
            <Text
              style={[
                styles.label,
                atteinte && styles.labelAtteint,
                courante && styles.labelCourant,
              ]}
            >
              {etape.label}
            </Text>
          </View>
        );
      })}
      {annule && (
        <View style={styles.ligne}>
          <View style={styles.colonnePoints}>
            <View style={[styles.point, styles.pointAnnule]}>
              <Ionicons name="close" size={12} color={couleurs.blanc} />
            </View>
          </View>
          <Text style={[styles.label, styles.labelAnnule]}>Annulé</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espaces.m,
  },
  colonnePoints: {
    alignItems: 'center',
    width: 22,
  },
  point: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointAtteint: {
    backgroundColor: couleurs.primaire,
  },
  pointCourant: {
    borderWidth: 3,
    borderColor: couleurs.primaireClair,
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  pointInactif: {
    backgroundColor: couleurs.bordure,
  },
  pointAnnule: {
    backgroundColor: couleurs.danger,
  },
  trait: {
    width: 2,
    height: 20,
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
    paddingBottom: espaces.l,
    paddingTop: 2,
    flex: 1,
  },
  labelAtteint: {
    color: couleurs.encre,
    fontWeight: '600',
  },
  labelCourant: {
    color: couleurs.primaireFonce,
    fontWeight: '700',
  },
  labelAnnule: {
    color: couleurs.danger,
    fontWeight: '700',
  },
});
