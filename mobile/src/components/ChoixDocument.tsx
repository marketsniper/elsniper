// Pièce jointe d'un document (carte NIDA d'un local, justificatif de
// résidence, permis / assurance / photo du véhicule d'un chauffeur).
//
// POURQUOI CE COMPOSANT EXISTE
// Sur la version web (celle qu'on ouvre depuis le QR code), le sélecteur
// d'images d'Expo fabrique un champ fichier caché et le déclenche avec un
// clic SIMULÉ. Les navigateurs des téléphones et tablettes (Samsung, iPhone)
// ignorent les clics qui ne viennent pas d'un vrai doigt : la fenêtre de
// choix ne s'ouvrait tout simplement jamais, et le client restait bloqué
// sans pouvoir joindre sa pièce.
// Ici, le champ fichier est un VRAI champ posé par-dessus le bouton, en
// transparent : le doigt du client tombe directement dessus. C'est le
// navigateur lui-même qui ouvre sa fenêtre — ça marche partout.
//
// Au passage, les photos sont redimensionnées et réenregistrées en JPEG :
// une photo d'appareil récent dépasse souvent la limite de 25 Mo, et les
// iPhone produisent du HEIC que le serveur ne sait pas lire.
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Bouton } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, rayons } from '@/lib/theme';

/** Côté maximum d'une photo envoyée (px). Au-delà, on redimensionne. */
const COTE_MAX_PX = 2000;
/** Limite acceptée par le serveur. */
const TAILLE_MAX_OCTETS = 25 * 1024 * 1024;

/** Charge l'image en mémoire, en respectant l'orientation de la photo. */
async function decoder(fichier: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(fichier, { imageOrientation: 'from-image' });
    } catch {
      // Format que le navigateur ne décode pas (HEIC sur Android, par ex.)
      // — on retombe sur la méthode classique juste en dessous.
    }
  }
  const adresse = URL.createObjectURL(fichier);
  try {
    return await new Promise<HTMLImageElement>((resoudre, rejeter) => {
      const image = new window.Image();
      image.onload = () => resoudre(image);
      image.onerror = () => rejeter(new Error('image illisible'));
      image.src = adresse;
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(adresse);
  }
}

/**
 * Prépare le fichier choisi dans un navigateur : PDF tel quel, photo
 * redimensionnée et réenregistrée en JPEG. Renvoie une adresse blob: que
 * `api.televerser` sait envoyer.
 */
async function preparerFichierWeb(fichier: File): Promise<{ uri: string; mime: string }> {
  if (fichier.type === 'application/pdf') {
    if (fichier.size > TAILLE_MAX_OCTETS) throw new Error('trop_lourd');
    return { uri: URL.createObjectURL(fichier), mime: fichier.type };
  }

  const source = await decoder(fichier);
  if (!source) {
    // Photo illisible par le navigateur : on tente quand même l'envoi tel
    // quel, le serveur dira si le format ne lui convient pas.
    if (fichier.size > TAILLE_MAX_OCTETS) throw new Error('trop_lourd');
    return { uri: URL.createObjectURL(fichier), mime: fichier.type || 'image/jpeg' };
  }

  const largeur = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const hauteur = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const facteur = Math.min(1, COTE_MAX_PX / Math.max(largeur, hauteur));
  const toile = document.createElement('canvas');
  toile.width = Math.max(1, Math.round(largeur * facteur));
  toile.height = Math.max(1, Math.round(hauteur * facteur));
  const contexte = toile.getContext('2d');
  if (!contexte) throw new Error('illisible');
  contexte.drawImage(source as CanvasImageSource, 0, 0, toile.width, toile.height);
  if ('close' in source) source.close();

  const blob = await new Promise<Blob | null>((resoudre) =>
    toile.toBlob(resoudre, 'image/jpeg', 0.85)
  );
  if (!blob) throw new Error('illisible');
  if (blob.size > TAILLE_MAX_OCTETS) throw new Error('trop_lourd');
  return { uri: URL.createObjectURL(blob), mime: 'image/jpeg' };
}

/**
 * Zone tactile qui ouvre le choix du document. Sur le web, un vrai champ
 * fichier transparent est posé par-dessus les enfants ; sur l'application
 * installée, c'est le sélecteur de photos du téléphone.
 */
function ZoneFichier({
  children,
  onFichier,
  onErreur,
  libelle,
}: {
  children: React.ReactNode;
  onFichier: (uri: string, mime: string) => void;
  onErreur: (message: string) => void;
  libelle: string;
}) {
  const { t } = useT();
  const conteneur = useRef<View | null>(null);
  // Les rappels changent à chaque rendu : on les garde dans des références
  // pour ne pas recréer le champ fichier (et perdre le doigt du client).
  const rappels = useRef({ onFichier, onErreur, t });
  rappels.current = { onFichier, onErreur, t };

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const hote = conteneur.current as unknown as HTMLElement | null;
    if (!hote || typeof hote.appendChild !== 'function') return;

    const champ = document.createElement('input');
    champ.type = 'file';
    champ.accept = 'image/*,application/pdf';
    champ.setAttribute('aria-label', libelle);
    Object.assign(champ.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      opacity: '0',
      cursor: 'pointer',
      zIndex: '3',
    });

    const surChoix = async () => {
      const fichier = champ.files?.[0];
      champ.value = ''; // pour pouvoir rechoisir la même photo ensuite
      if (!fichier) return;
      try {
        const prepare = await preparerFichierWeb(fichier);
        rappels.current.onErreur('');
        rappels.current.onFichier(prepare.uri, prepare.mime);
      } catch (e) {
        rappels.current.onErreur(
          e instanceof Error && e.message === 'trop_lourd'
            ? rappels.current.t('doc_erreur_lourd')
            : rappels.current.t('doc_erreur_lecture')
        );
      }
    };

    champ.addEventListener('change', surChoix);
    hote.appendChild(champ);
    return () => {
      champ.removeEventListener('change', surChoix);
      champ.remove();
    };
  }, [libelle]);

  // Application installée : sélecteur de photos du téléphone.
  const choisirSurTelephone = async () => {
    onErreur('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      onErreur(t('client_erreur_photos'));
      return;
    }
    const resultat = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!resultat.canceled && resultat.assets[0]) {
      onFichier(resultat.assets[0].uri, resultat.assets[0].mimeType ?? 'image/jpeg');
    }
  };

  if (Platform.OS === 'web') {
    return (
      <View ref={conteneur} collapsable={false}>
        {children}
      </View>
    );
  }
  return (
    <Pressable onPress={choisirSurTelephone} accessibilityRole="button" accessibilityLabel={libelle}>
      {children}
    </Pressable>
  );
}

/**
 * Bloc complet « joindre un document » : bouton tant que rien n'est joint,
 * puis aperçu du document avec la possibilité de le changer.
 */
export function ChoixDocument({
  uri,
  onFichier,
  onErreur,
  label,
  texteAjouter,
  texteAjoute,
  texteChanger,
}: {
  uri: string | null;
  onFichier: (uri: string) => void;
  onErreur: (message: string) => void;
  label?: string;
  texteAjouter: string;
  texteAjoute: string;
  texteChanger: string;
}) {
  const [typeMime, setTypeMime] = useState<string | null>(null);
  const recevoir = (adresse: string, mime: string) => {
    setTypeMime(mime);
    onFichier(adresse);
  };
  const estPdf = typeMime === 'application/pdf';
  return (
    <View style={styles.bloc}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      {uri ? (
        <View style={styles.ligneJointe}>
          {estPdf ? (
            <View style={styles.apercuPdf}>
              <Ionicons name="document-text-outline" size={26} color={couleurs.primaireFonce} />
            </View>
          ) : (
            // L'aperçu rassure : le client VOIT que sa pièce est bien jointe.
            <Image source={{ uri }} style={styles.apercu} resizeMode="cover" />
          )}
          <View style={styles.texteJointe}>
            <View style={styles.ligneOk}>
              <Ionicons name="checkmark-circle" size={18} color={couleurs.succes} />
              <Text style={styles.documentOk}>{texteAjoute}</Text>
            </View>
            <ZoneFichier onFichier={recevoir} onErreur={onErreur} libelle={texteChanger}>
              <Text style={styles.changer}>{texteChanger}</Text>
            </ZoneFichier>
          </View>
        </View>
      ) : (
        <ZoneFichier onFichier={recevoir} onErreur={onErreur} libelle={texteAjouter}>
          <Bouton
            titre={texteAjouter}
            icone="cloud-upload-outline"
            variante="secondaire"
            onPress={() => {}}
          />
        </ZoneFichier>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: {
    gap: espaces.s,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  ligneJointe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.bouton,
    padding: espaces.s,
    backgroundColor: couleurs.surface,
  },
  apercu: {
    width: 56,
    height: 56,
    borderRadius: rayons.bouton,
    backgroundColor: couleurs.primaireClair,
  },
  apercuPdf: {
    width: 56,
    height: 56,
    borderRadius: rayons.bouton,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texteJointe: {
    flex: 1,
    gap: 2,
  },
  ligneOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs,
  },
  documentOk: {
    fontSize: 14,
    fontWeight: '600',
    color: couleurs.encre,
  },
  changer: {
    fontSize: 14,
    fontWeight: '700',
    color: couleurs.primaire,
    paddingVertical: espaces.xs,
  },
});
