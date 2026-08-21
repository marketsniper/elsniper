// Visionneuse de document intégrée à l'application (permis, assurance,
// photo du véhicule, carte NIDA).
//
// Pourquoi dans l'app plutôt qu'un lien externe : ouvrir le document dans
// le navigateur faisait SORTIR de zanziGo — au retour l'application
// redémarrait sur l'écran d'accueil, et un lien mort (documents des toutes
// premières candidatures) ne donnait aucune explication. Ici, l'image
// s'affiche par-dessus le tableau de bord, et si elle ne peut pas être
// chargée on le dit clairement.
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Bouton } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, rayons, stylesReactifs } from '@/lib/theme';

export function VisionneuseDocument({
  url,
  titre,
  onFermer,
}: {
  url: string | null;
  titre: string;
  onFermer: () => void;
}) {
  const { t } = useT();
  const [chargement, setChargement] = useState(true);
  const [echec, setEchec] = useState(false);

  // Chaque nouveau document repart d'un état propre.
  useEffect(() => {
    setChargement(true);
    setEchec(false);
  }, [url]);

  // Document d'une candidature envoyée avant la correction du stockage :
  // le fichier n'existe plus, inutile de faire patienter.
  const perdu = !!url && /localhost|127\.0\.0\.1/.test(url);

  return (
    <Modal visible={!!url} transparent animationType="fade" onRequestClose={onFermer}>
      <View style={styles.fond}>
        <View style={styles.entete}>
          <Text style={styles.titre} numberOfLines={1}>
            {titre}
          </Text>
          <Pressable onPress={onFermer} accessibilityRole="button" hitSlop={12}>
            <Ionicons name="close-circle" size={34} color={couleurs.surPrimaire} />
          </Pressable>
        </View>

        {perdu || echec ? (
          <View style={styles.messageCentre}>
            <Ionicons name="alert-circle-outline" size={44} color={couleurs.surPrimaire} />
            <Text style={styles.texteMessage}>
              {perdu ? t('doc_perdu_texte') : t('doc_echec_texte')}
            </Text>
            {!perdu && !!url && (
              <Bouton
                titre={t('doc_ouvrir_navigateur')}
                icone="open-outline"
                variante="secondaire"
                onPress={() => Linking.openURL(url)}
              />
            )}
          </View>
        ) : (
          // Le document est zoomable : on pince pour lire un permis.
          <ScrollView
            style={styles.zone}
            contentContainerStyle={styles.contenuZone}
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
          >
            {!!url && (
              <Image
                source={{ uri: url }}
                style={styles.image}
                resizeMode="contain"
                onLoadEnd={() => setChargement(false)}
                onError={() => {
                  setChargement(false);
                  setEchec(true);
                }}
              />
            )}
            {chargement && (
              <View style={styles.chargement}>
                <ActivityIndicator color={couleurs.surPrimaire} size="large" />
              </View>
            )}
          </ScrollView>
        )}

        <View style={styles.piedPage}>
          <Bouton titre={t('commun_fermer')} icone="close-outline" onPress={onFermer} />
        </View>
      </View>
    </Modal>
  );
}

const styles = stylesReactifs(() => ({
  fond: {
    flex: 1,
    backgroundColor: 'rgba(20, 12, 16, 0.94)',
    paddingTop: 48,
    paddingBottom: espaces.l,
    paddingHorizontal: espaces.l,
    gap: espaces.m,
  },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaces.m,
  },
  titre: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: couleurs.surPrimaire,
  },
  zone: {
    flex: 1,
    borderRadius: rayons.carte,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  contenuZone: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
    minHeight: 380,
  },
  chargement: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageCentre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaces.m,
    paddingHorizontal: espaces.l,
  },
  texteMessage: {
    fontSize: 15,
    lineHeight: 22,
    color: couleurs.surPrimaire,
    textAlign: 'center',
  },
  piedPage: {
    gap: espaces.s,
  },
}));
