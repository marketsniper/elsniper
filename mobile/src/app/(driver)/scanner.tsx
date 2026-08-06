// Mode chauffeur — scanner de QR codes.
// Deux usages :
//  1. Arrivée depuis une course avec ?tripId=&action=start|complete :
//     le QR scanné est celui du VÉHICULE, envoyé à PATCH /trips/:id/start|complete.
//     Le serveur vérifie qu'il correspond au véhicule du chauffeur assigné
//     (403 qr_mismatch sinon). Le bouton « Utiliser mon QR » envoie
//     directement driver.vehicle_qr_code sans scanner.
//  2. Scan libre d'un QR colis (PKG-…) : GET /packages/by-qr/:qrCode → fiche,
//     puis ramassage/livraison avec photo de preuve OBLIGATOIRE
//     (appareil photo → POST /uploads → photoUrl).
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Badge,
  Bouton,
  Carte,
  Ecran,
  LigneInfo,
  SousTitre,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, ErreurApi, prochaineActionColis } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { couleurs, espaces, rayons } from '@/lib/theme';
import {
  champ,
  LIBELLES_STATUT_COLIS,
  type Colis,
  type StatutColis,
} from '@/lib/types';

/** Vrai si la chaîne scannée ressemble à un QR de colis zanziGo (PKG-…). */
function estQrColis(data: string): boolean {
  return data.startsWith('PKG-');
}

export default function EcranScanner() {
  const router = useRouter();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ tripId?: string; action?: string }>();
  const tripId = typeof params.tripId === 'string' && params.tripId ? params.tripId : null;
  const actionCourse = params.action === 'start' || params.action === 'complete' ? params.action : null;

  const [permission, demanderPermission] = useCameraPermissions();
  const scanEnCours = useRef(false);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [colis, setColis] = useState<Colis | null>(null);
  const [qrColis, setQrColis] = useState('');

  const reprendreScan = () => {
    scanEnCours.current = false;
    setColis(null);
    setQrColis('');
    setErreur('');
    setMessage('');
  };

  const surScan = useCallback(
    async ({ data }: { data: string }) => {
      if (scanEnCours.current || charge) return;
      scanEnCours.current = true;
      setErreur('');
      setMessage('');

      // Cas 1 : scan du QR véhicule pour démarrer/terminer une course.
      if (tripId && actionCourse) {
        setCharge(true);
        try {
          if (actionCourse === 'start') {
            await api.demarrerCourse(tripId, data);
            setMessage('Course démarrée. Bonne route !');
          } else {
            await api.terminerCourse(tripId, data);
            setMessage('Course terminée. Merci !');
          }
          setTimeout(() => router.replace(`/course/${tripId}`), 1200);
        } catch (e) {
          setErreur(e instanceof ErreurApi ? e.message : 'Action refusée pour cette course.');
          scanEnCours.current = false;
        } finally {
          setCharge(false);
        }
        return;
      }

      // Cas 2 : scan d'un QR colis (PKG-…).
      if (estQrColis(data)) {
        setCharge(true);
        try {
          const fiche = await api.colisParQr(data);
          setColis(fiche);
          setQrColis(data);
        } catch (e) {
          setErreur(e instanceof ErreurApi ? e.message : 'Colis introuvable pour ce QR.');
          scanEnCours.current = false;
        } finally {
          setCharge(false);
        }
        return;
      }

      setErreur('QR non reconnu. Attendu : QR véhicule (depuis une course) ou QR colis PKG-…');
      scanEnCours.current = false;
    },
    [tripId, actionCourse, charge, router]
  );

  // QR véhicule fixe du chauffeur connecté (VEH-…), pour agir sans scanner.
  const monQrVehicule = champ<string>(session?.driver, 'vehicle_qr_code', 'vehicleQrCode') ?? null;

  // Collecte ou livraison du colis scanné, avec photo de preuve.
  const traiterColis = async (action: 'pickup' | 'deliver') => {
    if (!colis || !qrColis) return;
    setErreur('');
    const permissionPhoto = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionPhoto.granted) {
      setErreur("Autorisez l'appareil photo pour la photo de preuve.");
      return;
    }
    const photo = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (photo.canceled || !photo.assets[0]) return;

    setCharge(true);
    try {
      const televersement = await api.televerser(photo.assets[0].uri);
      const maj =
        action === 'pickup'
          ? await api.recupererColis(colis.id, {
              qrCode: qrColis,
              photoUrl: televersement.url,
            })
          : await api.livrerColis(colis.id, {
              qrCode: qrColis,
              photoUrl: televersement.url,
            });
      setColis(maj);
      setMessage(
        action === 'pickup' ? 'Colis ramassé, photo enregistrée.' : 'Colis livré, photo enregistrée.'
      );
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : "L'opération sur le colis a échoué.");
    } finally {
      setCharge(false);
    }
  };

  // Permission caméra.
  if (!permission) {
    return (
      <Ecran defiler={false}>
        <SousTitre>Préparation de la caméra…</SousTitre>
      </Ecran>
    );
  }
  if (!permission.granted) {
    return (
      <Ecran>
        <Carte>
          <Titre>Caméra requise</Titre>
          <SousTitre>
            Le scan des QR codes (véhicule et colis) nécessite l&apos;accès à la caméra.
          </SousTitre>
          <Bouton titre="Autoriser la caméra" onPress={() => demanderPermission()} />
        </Carte>
      </Ecran>
    );
  }

  // Fiche colis après scan d'un QR PKG-.
  if (colis) {
    const statut = champ<StatutColis>(colis, 'status', 'statut');
    const action = prochaineActionColis(statut);
    return (
      <Ecran>
        <Carte>
          <Titre>Colis {qrColis}</Titre>
          <Badge
            texte={statut ? LIBELLES_STATUT_COLIS[statut] ?? statut : '—'}
            ton={statut === 'delivered' ? 'succes' : 'primaire'}
          />
          <LigneInfo label="Collecte" valeur={String(champ(colis, 'pickup_location', 'pickupLocation') ?? '—')} />
          <LigneInfo label="Livraison" valeur={String(champ(colis, 'dropoff_location', 'dropoffLocation') ?? '—')} />
          <LigneInfo label="Destinataire" valeur={String(champ(colis, 'recipient_name', 'recipientName') ?? '—')} />
          <LigneInfo label="Téléphone" valeur={String(champ(colis, 'recipient_phone', 'recipientPhone') ?? '—')} />
          {!!champ(colis, 'description') && (
            <LigneInfo label="Description" valeur={String(champ(colis, 'description'))} />
          )}
        </Carte>

        {!!message && <SousTitre>{message}</SousTitre>}
        <TexteErreur>{erreur}</TexteErreur>

        {action === 'pickup' && (
          <Bouton
            titre="Ramasser le colis (photo de preuve)"
            onPress={() => traiterColis('pickup')}
            charge={charge}
          />
        )}
        {action === 'deliver' && (
          <Bouton
            titre="Livrer le colis (photo de preuve)"
            onPress={() => traiterColis('deliver')}
            charge={charge}
          />
        )}
        {action === null && (
          <SousTitre>
            {statut === 'created'
              ? "Colis pas encore payé par l'expéditeur — le ramassage sera possible après paiement."
              : 'Aucune action possible sur ce colis (déjà livré).'}
          </SousTitre>
        )}

        <Bouton titre="Scanner un autre QR" variante="secondaire" onPress={reprendreScan} />
      </Ecran>
    );
  }

  // Vue caméra plein écran.
  return (
    <View style={styles.conteneur}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={surScan}
      />
      <SafeAreaView style={styles.calque} edges={['top', 'bottom']}>
        <View style={styles.bandeau}>
          <Text style={styles.titreBandeau}>
            {tripId && actionCourse
              ? actionCourse === 'start'
                ? 'Scannez le QR du véhicule pour démarrer'
                : 'Scannez le QR du véhicule pour terminer'
              : 'Scannez un QR colis PKG-… (ou un QR véhicule depuis une course)'}
          </Text>
        </View>
        <View style={styles.viseur} />
        <View style={styles.bandeauBas}>
          {!!message && <Text style={styles.messageOk}>{message}</Text>}
          {!!erreur && (
            <>
              <Text style={styles.messageErreur}>{erreur}</Text>
              <Bouton titre="Réessayer" variante="secondaire" onPress={reprendreScan} />
            </>
          )}
          {tripId && actionCourse && monQrVehicule && (
            <Bouton
              titre="Utiliser mon QR véhicule"
              onPress={() => surScan({ data: monQrVehicule })}
              charge={charge}
            />
          )}
          {tripId && actionCourse && (
            <Bouton titre="Annuler" variante="secondaire" onPress={() => router.back()} />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: {
    flex: 1,
    backgroundColor: '#000',
  },
  calque: {
    flex: 1,
    justifyContent: 'space-between',
    padding: espaces.l,
  },
  bandeau: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: rayons.carte,
    padding: espaces.l,
  },
  titreBandeau: {
    color: couleurs.blanc,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  viseur: {
    alignSelf: 'center',
    width: 220,
    height: 220,
    borderWidth: 3,
    borderColor: couleurs.primaire,
    borderRadius: rayons.carte,
  },
  bandeauBas: {
    gap: espaces.m,
  },
  messageOk: {
    color: '#6EE7B7',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  messageErreur: {
    color: '#FCA5A5',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: rayons.bouton,
    padding: espaces.m,
  },
});
