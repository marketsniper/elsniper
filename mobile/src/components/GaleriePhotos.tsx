// GALERIE DE PHOTOS — plusieurs photos par fiche (véhicule de location), à
// la différence d'un ChoixDocument qui n'en gère qu'une. Chaque vignette
// s'envoie et se supprime pour son propre compte, comme un document : pas de
// bouton « enregistrer » global, la fiche reste toujours à jour côté serveur.
//
// Réutilise ZoneFichier (ChoixDocument.tsx) pour le déclenchement du
// sélecteur — même mécanisme éprouvé (champ transparent + étiquette sur le
// web, ImagePicker natif sur l'app installée) — mais affiche N vignettes
// supprimables au lieu d'un seul aperçu, plus une tuile « ajouter » toujours
// prête pour la photo suivante (son champ se réinitialise après chaque envoi).
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';

import { ZoneFichier } from '@/components/ChoixDocument';
import { api, ErreurApi } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, rayons, stylesReactifs } from '@/lib/theme';

const COTE_TUILE = 84;

export function GaleriePhotos({
  photos,
  onAjouter,
  onSupprimer,
  max = 12,
}: {
  photos: { id: string; url: string }[];
  /** Photo déjà envoyée sur le serveur (adresse définitive) : au parent de l'enregistrer (POST .../photos). */
  onAjouter: (url: string) => Promise<void>;
  /** Au parent de la retirer côté serveur (DELETE .../photos/:id). */
  onSupprimer: (id: string) => Promise<void>;
  max?: number;
}) {
  const { t } = useT();
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [suppressionEnCours, setSuppressionEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');

  const complet = photos.length >= max;

  const recevoir = async (uri: string) => {
    setErreur('');
    setEnvoiEnCours(true);
    try {
      const { url } = await api.televerser(uri);
      await onAjouter(url);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('galerie_erreur_envoi'));
    } finally {
      setEnvoiEnCours(false);
    }
  };

  const retirer = async (id: string) => {
    setErreur('');
    setSuppressionEnCours(id);
    try {
      await onSupprimer(id);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('galerie_erreur_envoi'));
    } finally {
      setSuppressionEnCours(null);
    }
  };

  return (
    <View style={styles.bloc}>
      <View style={styles.grille}>
        {photos.map((photo) => (
          <View key={photo.id} style={styles.tuile}>
            <Image source={{ uri: photo.url }} style={styles.image} resizeMode="cover" />
            {suppressionEnCours === photo.id ? (
              <View style={styles.voile}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            ) : (
              <Pressable
                onPress={() => retirer(photo.id)}
                accessibilityRole="button"
                accessibilityLabel={t('galerie_retirer')}
                style={({ pressed }) => [styles.retirer, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            )}
          </View>
        ))}
        {!complet &&
          (envoiEnCours ? (
            <View style={[styles.tuile, styles.tuileAjouter]}>
              <ActivityIndicator size="small" color={couleurs.primaire} />
            </View>
          ) : (
            <ZoneFichier onFichier={recevoir} onErreur={setErreur} libelle={t('galerie_ajouter')} imagesSeules>
              <View style={[styles.tuile, styles.tuileAjouter]}>
                <Ionicons name="add" size={26} color={couleurs.primaire} />
              </View>
            </ZoneFichier>
          ))}
      </View>
      <Text style={styles.compteur}>{t('galerie_compteur', { n: photos.length, max })}</Text>
      {!!erreur && (
        <View style={styles.ligneErreur}>
          <Ionicons name="alert-circle" size={16} color={couleurs.danger} />
          <Text style={styles.texteErreur}>{erreur}</Text>
        </View>
      )}
    </View>
  );
}

const styles = stylesReactifs(() => ({
  bloc: { gap: espaces.xs },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: espaces.s },
  tuile: {
    width: COTE_TUILE,
    height: COTE_TUILE,
    borderRadius: rayons.bouton,
    overflow: 'hidden',
    backgroundColor: couleurs.surface,
  },
  image: { width: '100%', height: '100%' },
  tuileAjouter: {
    borderWidth: 2,
    borderColor: couleurs.bordure,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retirer: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voile: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compteur: {
    fontSize: 12.5,
    color: couleurs.texteSecondaire,
  },
  ligneErreur: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espaces.xs,
    backgroundColor: couleurs.dangerFond,
    borderRadius: rayons.bouton,
    padding: espaces.s,
  },
  texteErreur: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.danger,
    lineHeight: 18,
  },
}));
