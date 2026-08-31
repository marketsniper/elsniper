// Mode chauffeur — scanner de QR colis (PKG-…) : GET /packages/by-qr/:qrCode
// → fiche, puis ramassage/livraison avec photo de preuve OBLIGATOIRE
// (appareil photo → POST /uploads → photoUrl).
// (Le départ/arrivée d'une course se fait par simple touche dans
// course/[id].tsx, sans scan — voir demarrerCourse/terminerCourse.)
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BadgeStatutColis,
  Bouton,
  Carte,
  Ecran,
  EncartInfo,
  LigneInfo,
  SousTitre,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { ChoixDocument } from '@/components/ChoixDocument';
import { api, ErreurApi, prochaineActionColis } from '@/lib/api';
import { libelleTailleColis, useT } from '@/lib/i18n';
import { couleurs, espaces, rayons, stylesReactifs } from '@/lib/theme';
import { champ, type Colis, type StatutColis, type TailleColis } from '@/lib/types';

/** Vrai si la chaîne scannée ressemble à un QR de colis zanziGo (PKG-…). */
function estQrColis(data: string): boolean {
  return data.startsWith('PKG-');
}

const TAILLE_FENETRE = 240;
const TAILLE_COIN = 36;

/** Fenêtre de visée : quatre coins turquoise sur fond transparent. */
function FenetreScan() {
  return (
    <View style={styles.fenetre}>
      <View style={[styles.coin, styles.coinHautGauche]} />
      <View style={[styles.coin, styles.coinHautDroit]} />
      <View style={[styles.coin, styles.coinBasGauche]} />
      <View style={[styles.coin, styles.coinBasDroit]} />
    </View>
  );
}

export default function EcranScanner() {
  const { t } = useT();

  const [permission, demanderPermission] = useCameraPermissions();
  const scanEnCours = useRef(false);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');
  // Photo de preuve choisie par le chauffeur, avant de valider l'opération.
  const [photoPreuve, setPhotoPreuve] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [colis, setColis] = useState<Colis | null>(null);
  const [qrColis, setQrColis] = useState('');

  const reprendreScan = () => {
    scanEnCours.current = false;
    setColis(null);
    setQrColis('');
    // La photo aussi : sans cette ligne, « Scanner un autre colis » gardait
    // la preuve du colis PRÉCÉDENT — le bouton « Ramasser » du suivant était
    // déjà actif, avec la photo d'un autre paquet comme preuve.
    setPhotoPreuve(null);
    setErreur('');
    setMessage('');
  };

  const surScan = useCallback(
    async ({ data }: { data: string }) => {
      if (scanEnCours.current || charge) return;
      scanEnCours.current = true;
      setErreur('');
      setMessage('');

      // Scan d'un QR colis (PKG-…) — seul usage restant de cet écran.
      if (estQrColis(data)) {
        setCharge(true);
        try {
          const fiche = await api.colisParQr(data);
          setColis(fiche);
          setQrColis(data);
        } catch (e) {
          setErreur(e instanceof ErreurApi ? e.message : t('scanner_erreur_colis'));
          scanEnCours.current = false;
        } finally {
          setCharge(false);
        }
        return;
      }

      setErreur(t('scanner_qr_inconnu'));
      scanEnCours.current = false;
    },
    [charge, t]
  );

  // Collecte ou livraison du colis scanné, avec photo de preuve.
  // La photo est prise AVANT (bloc ChoixDocument ci-dessous) : sur le web,
  // l'appareil photo ne peut s'ouvrir que sur un vrai geste du chauffeur,
  // jamais depuis du code lancé après coup.
  const traiterColis = async (action: 'pickup' | 'deliver') => {
    if (!colis || !qrColis) return;
    setErreur('');
    if (!photoPreuve) {
      setErreur(t('scanner_erreur_photo'));
      return;
    }

    setCharge(true);
    try {
      // La photo de preuve est déjà sur le serveur : elle part au moment où
      // le chauffeur la prend, pas au moment de valider.
      const maj =
        action === 'pickup'
          ? await api.recupererColis(colis.id, { qrCode: qrColis, photoUrl: photoPreuve })
          : await api.livrerColis(colis.id, { qrCode: qrColis, photoUrl: photoPreuve });
      setColis(maj);
      setPhotoPreuve(null);
      setMessage(action === 'pickup' ? t('scanner_colis_ramasse') : t('scanner_colis_livre'));
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('scanner_erreur_operation'));
    } finally {
      setCharge(false);
    }
  };

  // Permission caméra.
  if (!permission) {
    return (
      <Ecran fond="vagues" defiler={false}>
        <SousTitre>{t('scanner_preparation')}</SousTitre>
      </Ecran>
    );
  }
  if (!permission.granted) {
    return (
      <Ecran fond="vagues">
        <Carte>
          <Titre>{t('scanner_camera_requise')}</Titre>
          <SousTitre>{t('scanner_camera_texte')}</SousTitre>
          <Bouton
            titre={t('scanner_autoriser')}
            icone="camera-outline"
            onPress={() => demanderPermission()}
          />
        </Carte>
      </Ecran>
    );
  }

  // Fiche colis après scan d'un QR PKG-.
  if (colis) {
    const statut = champ<StatutColis>(colis, 'status', 'statut');
    const action = prochaineActionColis(statut);
    return (
      <Ecran fond="vagues">
        <Carte>
          <View style={styles.enTeteColis}>
            <Titre>{t('titre_colis')}</Titre>
            <BadgeStatutColis statut={statut} />
          </View>
          <Text style={styles.codeColis}>{qrColis}</Text>
          {!!champ<TailleColis>(colis, 'size', 'taille') && (
            <LigneInfo
              label={t('dcolis_taille')}
              valeur={libelleTailleColis(champ<TailleColis>(colis, 'size', 'taille'), t)}
            />
          )}
          <LigneInfo
            label={t('dcolis_collecte')}
            valeur={String(champ(colis, 'pickup_location', 'pickupLocation') ?? '—')}
          />
          <LigneInfo
            label={t('dcolis_livraison')}
            valeur={String(champ(colis, 'dropoff_location', 'dropoffLocation') ?? '—')}
          />
          <LigneInfo
            label={t('dcolis_destinataire')}
            valeur={String(champ(colis, 'recipient_name', 'recipientName') ?? '—')}
          />
          <LigneInfo
            label={t('commun_telephone')}
            valeur={String(champ(colis, 'recipient_phone', 'recipientPhone') ?? '—')}
          />
          {!!champ(colis, 'description') && (
            <LigneInfo
              label={t('commun_description')}
              valeur={String(champ(colis, 'description'))}
            />
          )}
        </Carte>

        {!!message && (
          <EncartInfo icone="checkmark-circle-outline" ton="succes">
            {message}
          </EncartInfo>
        )}
        <TexteErreur>{erreur}</TexteErreur>

        {action !== null && (
          <ChoixDocument
            camera
            label={t('scanner_photo_titre')}
            uri={photoPreuve}
            onFichier={setPhotoPreuve}
            onErreur={setErreur}
            texteAjouter={t('scanner_photo_prendre')}
            texteAjoute={t('scanner_photo_prise')}
            texteChanger={t('scanner_photo_refaire')}
          />
        )}
        {action === 'pickup' && (
          <Bouton
            titre={t('scanner_ramasser')}
            icone="checkmark-circle-outline"
            onPress={() => traiterColis('pickup')}
            charge={charge}
            desactive={!photoPreuve}
          />
        )}
        {action === 'deliver' && (
          <Bouton
            titre={t('scanner_livrer')}
            icone="checkmark-circle-outline"
            onPress={() => traiterColis('deliver')}
            charge={charge}
            desactive={!photoPreuve}
          />
        )}
        {action === null && (
          <EncartInfo icone="information-circle-outline" ton="attente">
            {statut === 'created' ? t('scanner_colis_non_paye') : t('scanner_colis_livre_deja')}
          </EncartInfo>
        )}

        <Bouton
          titre={t('scanner_autre')}
          icone="qr-code-outline"
          variante="secondaire"
          onPress={reprendreScan}
        />
      </Ecran>
    );
  }

  // Vue caméra plein écran : voile sombre autour d'une fenêtre à coins turquoise.
  return (
    <View style={styles.conteneur}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={surScan}
      />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.voile} />
        <View style={styles.rangeeFenetre}>
          <View style={styles.voileCote} />
          <FenetreScan />
          <View style={styles.voileCote} />
        </View>
        <View style={styles.voile} />
      </View>
      <SafeAreaView style={styles.calque} edges={['top', 'bottom']}>
        <View style={styles.bandeau}>
          <Text style={styles.titreBandeau}>{t('scanner_colis_invite')}</Text>
          <Text style={styles.aideBandeau}>{t('scanner_aide_colis')}</Text>
        </View>
        <View style={styles.bandeauBas}>
          {!!message && <Text style={styles.messageOk}>{message}</Text>}
          {!!erreur && (
            <>
              <Text style={styles.messageErreur}>{erreur}</Text>
              <Bouton
                titre={t('commun_reessayer')}
                variante="secondaire"
                onPress={reprendreScan}
              />
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = stylesReactifs(() => ({
  conteneur: {
    flex: 1,
    backgroundColor: couleurs.encre,
  },
  enTeteColis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  codeColis: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: couleurs.texteSecondaire,
  },
  voile: {
    flex: 1,
    backgroundColor: couleurs.voile,
  },
  rangeeFenetre: {
    flexDirection: 'row',
    height: TAILLE_FENETRE,
  },
  voileCote: {
    flex: 1,
    backgroundColor: couleurs.voile,
  },
  fenetre: {
    width: TAILLE_FENETRE,
    height: TAILLE_FENETRE,
  },
  coin: {
    position: 'absolute',
    width: TAILLE_COIN,
    height: TAILLE_COIN,
    borderColor: couleurs.primaire,
  },
  coinHautGauche: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: rayons.bouton,
  },
  coinHautDroit: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: rayons.bouton,
  },
  coinBasGauche: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: rayons.bouton,
  },
  coinBasDroit: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: rayons.bouton,
  },
  calque: {
    flex: 1,
    justifyContent: 'space-between',
    padding: espaces.l,
  },
  bandeau: {
    backgroundColor: couleurs.voile,
    borderRadius: rayons.carte,
    padding: espaces.l,
    gap: espaces.xs,
  },
  titreBandeau: {
    color: couleurs.surVoile,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  aideBandeau: {
    color: couleurs.bordure,
    fontSize: 13,
    textAlign: 'center',
  },
  bandeauBas: {
    gap: espaces.m,
  },
  messageOk: {
    color: couleurs.succesClair,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  messageErreur: {
    color: couleurs.dangerClair,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: couleurs.voile,
    borderRadius: rayons.bouton,
    padding: espaces.m,
  },
}));
