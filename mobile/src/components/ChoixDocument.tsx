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
import { ActivityIndicator, Image, Platform, Pressable, Text, View } from 'react-native';

import { Bouton } from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, rayons, stylesReactifs } from '@/lib/theme';

/**
 * Prévient la page qu'un envoi est en cours : la mise à jour automatique de
 * la version web (backend/pwa/mise-a-jour.js) attend qu'il soit fini avant de
 * recharger quoi que ce soit.
 */
function marquerEnvoi(actif: boolean): void {
  if (Platform.OS !== 'web') return;
  (globalThis as unknown as { zanzigoEnvoiEnCours?: boolean }).zanzigoEnvoiEnCours = actif;
}

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
 *
 * Exportée : GaleriePhotos.tsx la réutilise telle quelle pour sa tuile
 * « ajouter » — même mécanisme éprouvé, sans le dupliquer.
 */
export function ZoneFichier({
  children,
  onFichier,
  onErreur,
  libelle,
  camera = false,
  imagesSeules = false,
}: {
  children: React.ReactNode;
  onFichier: (uri: string, mime: string) => void;
  onErreur: (message: string) => void;
  libelle: string;
  /** Preuve de livraison : on veut une photo prise sur le moment. */
  camera?: boolean;
  /** Portrait : une image, mais choisie librement (galerie comprise). */
  imagesSeules?: boolean;
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
    champ.accept = camera || imagesSeules ? 'image/*' : 'image/*,application/pdf';
    // « capture » ouvre directement l'appareil photo ARRIÈRE et retire le
    // choix « dans mes photos » : une preuve de livraison doit être prise sur
    // place. Un PORTRAIT, non — il se choisit, et pas avec l'objectif arrière.
    if (camera) champ.setAttribute('capture', 'environment');
    champ.setAttribute('aria-label', libelle);
    Object.assign(champ.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      opacity: '0',
      cursor: 'pointer',
    });

    // ÉTIQUETTE (<label>) posée par-dessus le bouton, le champ à l'intérieur.
    // C'est LE mécanisme que tous les navigateurs, Safari compris, savent
    // traiter : appuyer sur une étiquette active le champ qu'elle contient,
    // nativement, sans passer par le moindre code. Un champ transparent seul
    // suffit sur Android mais reste capricieux sur iPhone ; l'étiquette, non.
    const etiquette = document.createElement('label');
    etiquette.appendChild(champ);
    Object.assign(etiquette.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      display: 'block',
      cursor: 'pointer',
      zIndex: '3',
      // Safari iOS ignore les appuis sur un élément sans fond : une couleur
      // totalement transparente suffit à lui donner une surface tactile.
      backgroundColor: 'rgba(0,0,0,0)',
      WebkitTapHighlightColor: 'transparent',
    });

    // Dernier filet : si jamais l'activation native n'aboutit pas, on ouvre
    // le sélecteur nous-mêmes — depuis un VRAI appui, donc autorisé partout.
    const surAppui = (evenement: Event) => {
      if (evenement.target === champ) return; // déjà pris en charge
      evenement.preventDefault();
      champ.click();
    };
    etiquette.addEventListener('click', surAppui);

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
    hote.appendChild(etiquette);
    return () => {
      champ.removeEventListener('change', surChoix);
      etiquette.removeEventListener('click', surAppui);
      etiquette.remove();
    };
  }, [libelle, camera, imagesSeules]);

  // Application installée : appareil photo (preuve) ou galerie du téléphone.
  //
  // ATTENTION : on NE demande PAS l'autorisation « accès aux photos » avant
  // d'ouvrir la galerie. Le sélecteur système n'en a pas besoin (il ne rend
  // que le fichier choisi), et la demander enfermait le client : un seul
  // « Ne pas autoriser » et le bouton refusait de fonctionner à jamais.
  // L'appareil photo, lui, exige bien une autorisation.
  const choisirSurTelephone = async () => {
    onErreur('');
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          onErreur(t('doc_erreur_camera'));
          return;
        }
      }
      const resultat = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (!resultat.canceled && resultat.assets[0]) {
        onFichier(resultat.assets[0].uri, resultat.assets[0].mimeType ?? 'image/jpeg');
      }
    } catch {
      onErreur(t('doc_erreur_lecture'));
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
 * Champ fichier NATIF, visible tel que le navigateur le dessine.
 *
 * Le bouton principal est dessiné par l'application ; s'il ne réagissait pas
 * sur un navigateur particulier, le client se retrouvait sans issue. Ce
 * champ-ci n'est stylé par personne : c'est le contrôle du navigateur
 * lui-même, celui qui marche partout, y compris sur les vieux Safari.
 */
function SecoursNatif({
  onFichier,
  onErreur,
  camera,
  imagesSeules,
}: {
  onFichier: (uri: string, mime: string) => void;
  onErreur: (message: string) => void;
  camera: boolean;
  imagesSeules: boolean;
}) {
  const hote = useRef<View | null>(null);
  const rappels = useRef({ onFichier, onErreur });
  rappels.current = { onFichier, onErreur };

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const noeud = hote.current as unknown as HTMLElement | null;
    if (!noeud || typeof noeud.appendChild !== 'function') return;
    const champ = document.createElement('input');
    champ.type = 'file';
    champ.accept = camera || imagesSeules ? 'image/*' : 'image/*,application/pdf';
    if (camera) champ.setAttribute('capture', 'environment');
    Object.assign(champ.style, { fontSize: '15px', maxWidth: '100%' });
    const surChoix = async () => {
      const fichier = champ.files?.[0];
      champ.value = '';
      if (!fichier) return;
      try {
        const prepare = await preparerFichierWeb(fichier);
        rappels.current.onFichier(prepare.uri, prepare.mime);
      } catch (e) {
        rappels.current.onErreur(
          e instanceof Error && e.message === 'trop_lourd' ? 'trop_lourd' : 'illisible'
        );
      }
    };
    champ.addEventListener('change', surChoix);
    noeud.appendChild(champ);
    return () => {
      champ.removeEventListener('change', surChoix);
      champ.remove();
    };
  }, [camera, imagesSeules]);

  if (Platform.OS !== 'web') return null;
  return <View ref={hote} collapsable={false} style={styles.secours} />;
}

/**
 * Bloc complet « joindre un document » : bouton tant que rien n'est joint,
 * puis aperçu du document avec la possibilité de le changer.
 *
 * LA PIÈCE PART TOUT DE SUITE, dès que le client l'a choisie — plus au moment
 * d'envoyer le formulaire. Avant, trois photos partaient d'un coup à la fin :
 * sur un réseau mobile faible, l'envoi était coupé, tout le formulaire
 * échouait d'un bloc, et le client concluait qu'il « ne pouvait pas joindre
 * ses pièces ». Maintenant chaque pièce s'envoie seule, son sort s'affiche à
 * l'endroit exact où le doigt vient d'appuyer, et un envoi raté se refait
 * d'une touche sans rien ressaisir. `onFichier` reçoit l'adresse DÉFINITIVE
 * du document sur le serveur.
 */
export function ChoixDocument({
  uri,
  onFichier,
  onErreur,
  label,
  texteAjouter,
  texteAjoute,
  texteChanger,
  camera = false,
  imagesSeules = false,
  equipe = false,
}: {
  uri: string | null;
  onFichier: (uri: string) => void;
  onErreur: (message: string) => void;
  label?: string;
  texteAjouter: string;
  texteAjoute: string;
  texteChanger: string;
  /** Preuve de livraison : photo prise sur le moment. */
  camera?: boolean;
  /** Portrait : une image, mais choisie librement (galerie comprise). */
  imagesSeules?: boolean;
  /** Écran ÉQUIPE : l'envoi part avec la clé équipe — le téléphone de
   *  l'équipe n'a pas forcément de session client ouverte. */
  equipe?: boolean;
}) {
  const { t } = useT();
  const [typeMime, setTypeMime] = useState<string | null>(null);
  // Le message d'erreur s'affiche ICI, sous le bouton. Placé en bas du
  // formulaire, il tombait hors de l'écran : le client appuyait, ne voyait
  // rien, et croyait le bouton mort.
  const [erreurLocale, setErreurLocale] = useState('');
  // Aperçu local (blob:) : il s'affiche pendant l'envoi, avant même que le
  // serveur ait répondu — le client voit tout de suite SA photo.
  const [apercu, setApercu] = useState<string | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  // Dernière pièce choisie, gardée pour le bouton « Réessayer » : le client
  // ne doit pas avoir à retrouver sa photo une seconde fois.
  const aRenvoyer = useRef<{ uri: string; mime: string } | null>(null);

  // Le message est affiché ICI. On efface seulement celui du formulaire,
  // pour ne pas le montrer deux fois.
  const signaler = (message: string) => {
    setErreurLocale(message);
    onErreur('');
  };

  const envoyer = async (adresse: string, mime: string) => {
    aRenvoyer.current = { uri: adresse, mime };
    setTypeMime(mime);
    setApercu(adresse);
    setErreurLocale('');
    onErreur('');
    setEnvoiEnCours(true);
    // La mise à jour automatique de la version web recharge la page : pendant
    // un envoi, ce serait perdre la pièce. Ce drapeau la fait patienter.
    marquerEnvoi(true);
    try {
      const { url } = await api.televerser(adresse, equipe);
      onFichier(url);
    } catch (e) {
      signaler(e instanceof ErreurApi ? e.message : t('doc_erreur_envoi'));
    } finally {
      setEnvoiEnCours(false);
      marquerEnvoi(false);
    }
  };

  const reessayer = () => {
    const precedent = aRenvoyer.current;
    if (precedent) envoyer(precedent.uri, precedent.mime);
  };

  const recevoir = (adresse: string, mime: string) => {
    envoyer(adresse, mime);
  };
  const estPdf = typeMime === 'application/pdf';

  // Envoi en cours : la photo choisie, et l'indication que ça travaille.
  if (envoiEnCours) {
    return (
      <View style={styles.bloc}>
        {!!label && <Text style={styles.label}>{label}</Text>}
        <View style={styles.ligneJointe}>
          {estPdf || !apercu ? (
            <View style={styles.apercuPdf}>
              <Ionicons name="document-text-outline" size={26} color={couleurs.primaireFonce} />
            </View>
          ) : (
            <Image source={{ uri: apercu }} style={styles.apercu} resizeMode="cover" />
          )}
          <View style={styles.texteJointe}>
            <View style={styles.ligneOk}>
              <ActivityIndicator size="small" color={couleurs.primaire} />
              <Text style={styles.documentOk}>{t('doc_envoi')}</Text>
            </View>
            <Text style={styles.secoursTexte}>{t('doc_envoi_patience')}</Text>
          </View>
        </View>
      </View>
    );
  }

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
            <Image source={{ uri: apercu ?? uri }} style={styles.apercu} resizeMode="cover" />
          )}
          <View style={styles.texteJointe}>
            <View style={styles.ligneOk}>
              <Ionicons name="checkmark-circle" size={18} color={couleurs.succes} />
              <Text style={styles.documentOk}>{texteAjoute}</Text>
            </View>
            <ZoneFichier onFichier={recevoir} onErreur={signaler} libelle={texteChanger} camera={camera} imagesSeules={imagesSeules}>
              <Text style={styles.changer}>{texteChanger}</Text>
            </ZoneFichier>
          </View>
        </View>
      ) : (
        <ZoneFichier onFichier={recevoir} onErreur={signaler} libelle={texteAjouter} camera={camera} imagesSeules={imagesSeules}>
          <Bouton
            titre={texteAjouter}
            icone="cloud-upload-outline"
            variante="secondaire"
            onPress={() => {}}
          />
        </ZoneFichier>
      )}
      {!uri && Platform.OS === 'web' && (
        <>
          <Text style={styles.secoursTexte}>{t('doc_secours')}</Text>
          <SecoursNatif
            onFichier={recevoir}
            onErreur={(code) =>
              signaler(code === 'trop_lourd' ? t('doc_erreur_lourd') : t('doc_erreur_lecture'))
            }
            camera={camera}
            imagesSeules={imagesSeules}
          />
        </>
      )}
      {!!erreurLocale && (
        <View style={styles.ligneErreur}>
          <Ionicons name="alert-circle" size={18} color={couleurs.danger} />
          <Text style={styles.texteErreur}>{erreurLocale}</Text>
        </View>
      )}
      {/* Envoi raté : on renvoie LA MÊME photo d'une seule touche. */}
      {!!erreurLocale && !!aRenvoyer.current && !uri && (
        <Bouton
          titre={t('doc_reessayer')}
          icone="refresh-outline"
          variante="secondaire"
          onPress={reessayer}
        />
      )}
    </View>
  );
}

const styles = stylesReactifs(() => ({
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
  secours: {
    paddingVertical: espaces.xs,
  },
  secoursTexte: {
    fontSize: 12.5,
    color: couleurs.texteSecondaire,
    fontStyle: 'italic',
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
    fontSize: 13.5,
    fontWeight: '600',
    color: couleurs.danger,
    lineHeight: 19,
  },
}));
