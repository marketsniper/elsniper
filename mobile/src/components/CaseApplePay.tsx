// LA CASE APPLE PAY — visible, honnête (demande du client, 31/08/2026 :
// « mets-moi la case Apple Pay pour toute l'application »).
//
// Elle ne s'affiche QUE sur les appareils Apple (iPhone, iPad, Mac) : Apple
// Pay n'existe pas ailleurs, une case sur Android serait du bruit.
//
// Elle est marquée « bientôt » et INACTIVE, à dessein : un vrai bouton
// Apple Pay exige un prestataire de paiement compatible (Stripe, PayPal
// avancé) et l'enregistrement marchand auprès d'Apple — tant que ces clés
// ne sont pas branchées, un bouton « Apple Pay » qui ouvrirait en réalité
// autre chose tromperait le client. Le jour où le prestataire est là, cette
// case devient le vrai bouton, au même endroit.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, Text, View } from 'react-native';

import { Badge } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, stylesReactifs } from '@/lib/theme';

/** iPhone, iPad ou Mac — les seuls endroits où Apple Pay peut exister. */
export function surAppareilApple(): boolean {
  if (Platform.OS === 'ios') return true;
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  }
  return false;
}

export function CaseApplePay() {
  const { t } = useT();
  if (!surAppareilApple()) return null;
  return (
    <View style={styles.case}>
      <Ionicons name="logo-apple" size={24} color={couleurs.texteSecondaire} />
      <View style={styles.textes}>
        <View style={styles.ligneTitre}>
          <Text style={styles.titre}>Apple Pay</Text>
          <Badge texte={t('paiement_applepay_badge')} ton="attente" />
        </View>
        <Text style={styles.detail}>{t('paiement_applepay_bientot')}</Text>
      </View>
    </View>
  );
}

const styles = stylesReactifs(() => ({
  // Volontairement en retrait (opacité) : la case se voit, mais ne prétend
  // pas être appuyable — le badge dit pourquoi.
  case: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    paddingVertical: espaces.m,
    opacity: 0.65,
  },
  textes: { flex: 1, gap: 2 },
  ligneTitre: { flexDirection: 'row', alignItems: 'center', gap: espaces.s },
  titre: { fontSize: 15.5, fontWeight: '700', color: couleurs.encre },
  detail: { fontSize: 12.5, lineHeight: 17, color: couleurs.texteSecondaire },
}));
