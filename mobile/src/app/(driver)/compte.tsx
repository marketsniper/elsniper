// Mode chauffeur — profil, QR véhicule fixe (VEH-…) et déconnexion.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Badge, Carte, Ecran, LigneInfo, SousTitre } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { couleurs, espaces, ombres, rayons, tailles } from '@/lib/theme';
import { champ, type StatutVerification } from '@/lib/types';

/** Initiales (2 lettres max) d'un nom complet. */
function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return 'Z';
  const premiere = mots[0].charAt(0);
  const seconde = mots.length > 1 ? mots[mots.length - 1].charAt(0) : '';
  return (premiere + seconde).toUpperCase();
}

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
  const nomAffiche = String(champ(chauffeur, 'full_name', 'fullName') ?? 'Chauffeur zanziGo');

  const seDeconnecter = async () => {
    await deconnexion();
    router.replace('/');
  };

  return (
    <Ecran>
      <Carte style={styles.carteIdentite}>
        <View style={styles.avatar}>
          <Text style={styles.initiale}>{initiales(nomAffiche)}</Text>
        </View>
        <Text style={styles.nom}>{nomAffiche}</Text>
        <SousTitre>{session?.phone ?? ''}</SousTitre>
        <Badge
          texte={
            verifie
              ? 'Chauffeur vérifié ✓'
              : statutVerif === 'rejected'
                ? 'Candidature refusée'
                : 'En attente de validation'
          }
          ton={verifie ? 'succes' : statutVerif === 'rejected' ? 'danger' : 'attente'}
        />
        {moyenne !== null && nbNotes > 0 && (
          <Badge texte={`★ ${moyenne} (${nbNotes} avis)`} ton="primaire" />
        )}
      </Carte>

      {qrVehicule && (
        <Carte style={styles.carteQr}>
          <SousTitre centre>
            QR de votre véhicule — à afficher à bord. Il confirme le départ et l&apos;arrivée
            de chaque course.
          </SousTitre>
          <View style={styles.cadreQr}>
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

      <Pressable
        onPress={seDeconnecter}
        style={({ pressed }) => [styles.ligneDeconnexion, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
      >
        <Ionicons name="log-out-outline" size={20} color={couleurs.danger} />
        <Text style={styles.texteDeconnexion}>Se déconnecter</Text>
      </Pressable>
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
    width: tailles.avatar,
    height: tailles.avatar,
    borderRadius: tailles.avatar / 2,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initiale: {
    fontSize: 28,
    fontWeight: '800',
    color: couleurs.primaireFonce,
  },
  nom: {
    fontSize: 20,
    fontWeight: '700',
    color: couleurs.encre,
  },
  carteQr: {
    alignItems: 'center',
  },
  cadreQr: {
    alignItems: 'center',
    gap: espaces.s,
    padding: espaces.l,
    marginVertical: espaces.s,
    backgroundColor: couleurs.blanc,
    borderRadius: rayons.carte,
    ...ombres.douce,
  },
  codeTexte: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: couleurs.texteSecondaire,
  },
  ligneDeconnexion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaces.s,
    paddingVertical: espaces.l,
    marginTop: espaces.s,
  },
  texteDeconnexion: {
    fontSize: 15,
    fontWeight: '600',
    color: couleurs.danger,
  },
});
