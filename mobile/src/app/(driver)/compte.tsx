// Mode chauffeur — profil, QR véhicule fixe (VEH-…) et déconnexion.
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Badge, Bouton, Carte, Ecran, LigneInfo, SousTitre } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { couleurs, espaces } from '@/lib/theme';
import { champ, type StatutVerification } from '@/lib/types';

export default function EcranCompteChauffeur() {
  const router = useRouter();
  const { session, deconnexion } = useAuth();
  const chauffeur = session?.driver ?? null;

  const statutVerif =
    champ<StatutVerification>(chauffeur, 'verification_status', 'verificationStatus') ?? 'pending';
  const verifie = statutVerif === 'verified';
  const qrVehicule = champ<string>(chauffeur, 'vehicle_qr_code', 'vehicleQrCode');
  const moyenneBrute = champ<number | string>(chauffeur, 'rating_avg', 'ratingAvg');
  const nbNotes = Number(champ<number | string>(chauffeur, 'rating_count', 'ratingCount') ?? 0);
  const moyenne =
    moyenneBrute !== undefined && Number.isFinite(Number(moyenneBrute))
      ? Number(moyenneBrute).toFixed(1)
      : null;

  const seDeconnecter = async () => {
    await deconnexion();
    router.replace('/');
  };

  return (
    <Ecran>
      <Carte style={styles.carteIdentite}>
        <View style={styles.avatar}>
          <Text style={styles.initiale}>
            {String(champ(chauffeur, 'full_name', 'fullName') ?? 'z')
              .charAt(0)
              .toUpperCase()}
          </Text>
        </View>
        <Text style={styles.nom}>
          {String(champ(chauffeur, 'full_name', 'fullName') ?? 'Chauffeur zanziGo')}
        </Text>
        <SousTitre>{session?.phone ?? ''}</SousTitre>
        <Badge
          texte={
            verifie
              ? 'Chauffeur vérifié'
              : statutVerif === 'rejected'
                ? 'Candidature refusée'
                : 'Vérification en attente'
          }
          ton={verifie ? 'succes' : statutVerif === 'rejected' ? 'danger' : 'attente'}
        />
        {moyenne !== null && nbNotes > 0 && (
          <Badge texte={`★ ${moyenne} (${nbNotes} avis)`} ton="primaire" />
        )}
      </Carte>

      {qrVehicule && (
        <Carte style={styles.carteQr}>
          <SousTitre>
            QR de votre véhicule — à afficher à bord. Il sert à confirmer le départ et
            l&apos;arrivée de chaque course.
          </SousTitre>
          <View style={styles.blocQr}>
            <QRCode
              value={qrVehicule}
              size={160}
              color={couleurs.encre}
              backgroundColor={couleurs.blanc}
            />
            <Text style={styles.codeTexte}>{qrVehicule}</Text>
          </View>
        </Carte>
      )}

      <Carte>
        <LigneInfo label="Téléphone" valeur={session?.phone ?? '—'} />
        <LigneInfo
          label="Véhicule"
          valeur={String(champ(chauffeur, 'vehicle_model', 'vehicleModel') ?? '—')}
        />
        <LigneInfo
          label="Plaque"
          valeur={String(champ(chauffeur, 'vehicle_plate', 'vehiclePlate') ?? '—')}
        />
        <LigneInfo
          label="Permis"
          valeur={String(champ(chauffeur, 'license_number', 'licenseNumber') ?? '—')}
        />
        <LigneInfo label="Zone" valeur={String(champ(chauffeur, 'zone') ?? '—')} />
      </Carte>

      <Bouton titre="Se déconnecter" variante="danger" onPress={seDeconnecter} />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  carteIdentite: {
    alignItems: 'center',
    gap: espaces.s,
    paddingVertical: espaces.xl,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: couleurs.primaire,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initiale: {
    fontSize: 30,
    fontWeight: '800',
    color: couleurs.blanc,
  },
  nom: {
    fontSize: 20,
    fontWeight: '700',
    color: couleurs.encre,
  },
  carteQr: {
    alignItems: 'center',
  },
  blocQr: {
    alignItems: 'center',
    gap: espaces.s,
    paddingVertical: espaces.m,
  },
  codeTexte: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: couleurs.texteSecondaire,
  },
});
