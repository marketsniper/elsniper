// Candidature chauffeur « Taxi Partner » (POST /drivers).
// Payload backend : {fullName, phone (celui du jeton), licenseNumber,
// vehiclePlate, vehicleModel?, zone, licenseDocumentUrl, idDocumentUrl} —
// les deux documents sont téléversés d'abord sur POST /uploads.
// Le compte reste 'pending' jusqu'à validation manuelle par l'équipe : un
// chauffeur en attente qui se reconnecte retrouve cet écran d'attente.
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Bouton,
  Carte,
  Champ,
  Ecran,
  EncartInfo,
  SousTitre,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { couleurs, espaces } from '@/lib/theme';
import { champ, type StatutVerification } from '@/lib/types';

// Numéro WhatsApp de l'équipe zanziGo (placeholder MVP).
const WHATSAPP_EQUIPE = 'https://wa.me/255779000000';

/** Ligne de sélection d'un document (permis, pièce d'identité). */
function LigneDocument({
  label,
  uri,
  onChoisir,
}: {
  label: string;
  uri: string | null;
  onChoisir: () => void;
}) {
  return (
    <View style={styles.blocDocument}>
      <Text style={styles.labelDocument}>{label}</Text>
      {uri ? (
        <View style={styles.ligneDocumentOk}>
          <Ionicons name="checkmark-circle" size={22} color={couleurs.succes} />
          <Text style={styles.documentOk}>Document ajouté</Text>
          <Pressable onPress={onChoisir} hitSlop={8}>
            <Text style={styles.changer}>Changer</Text>
          </Pressable>
        </View>
      ) : (
        <Bouton
          titre="Ajouter le document"
          icone="cloud-upload-outline"
          variante="secondaire"
          onPress={onChoisir}
        />
      )}
    </View>
  );
}

export default function EcranPro() {
  const router = useRouter();
  const { session, majSession, deconnexion } = useAuth();
  const chauffeur = session?.driver ?? null;
  const statutVerif =
    champ<StatutVerification>(chauffeur, 'verification_status', 'verificationStatus') ?? 'pending';

  const [nom, setNom] = useState('');
  const [permis, setPermis] = useState('');
  const [plaque, setPlaque] = useState('');
  const [modele, setModele] = useState('');
  const [zone, setZone] = useState('');
  const [permisUri, setPermisUri] = useState<string | null>(null);
  const [identiteUri, setIdentiteUri] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  const choisirImage = async (definir: (uri: string) => void) => {
    setErreur('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErreur("Autorisez l'accès aux photos pour ajouter vos documents.");
      return;
    }
    const resultat = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!resultat.canceled && resultat.assets[0]) {
      definir(resultat.assets[0].uri);
    }
  };

  const envoyerCandidature = async () => {
    setErreur('');
    if (!session) {
      router.replace('/');
      return;
    }
    if (nom.trim().length < 2) {
      setErreur('Indiquez votre nom complet.');
      return;
    }
    if (permis.trim().length < 3) {
      setErreur('Indiquez votre numéro de permis de conduire.');
      return;
    }
    if (plaque.trim().length < 3) {
      setErreur("Indiquez la plaque d'immatriculation de votre véhicule.");
      return;
    }
    if (zone.trim().length < 2) {
      setErreur('Indiquez votre zone de travail (ex. : Stone Town, Nungwi).');
      return;
    }
    if (!permisUri || !identiteUri) {
      setErreur('Ajoutez vos deux documents : permis de conduire et pièce d’identité.');
      return;
    }
    setCharge(true);
    try {
      // Téléverser les deux documents pour obtenir leurs URLs.
      const [docPermis, docIdentite] = await Promise.all([
        api.televerser(permisUri),
        api.televerser(identiteUri),
      ]);
      const profil = await api.creerChauffeur({
        fullName: nom.trim(),
        phone: session.phone, // doit correspondre au téléphone du jeton
        licenseNumber: permis.trim(),
        vehiclePlate: plaque.trim(),
        vehicleModel: modele.trim() || undefined,
        zone: zone.trim(),
        licenseDocumentUrl: docPermis.url,
        idDocumentUrl: docIdentite.url,
      });
      // La session porte désormais le profil chauffeur (pending) : cet écran
      // bascule sur l'état « candidature envoyée ».
      await majSession({ driver: profil });
    } catch (e) {
      setErreur(
        e instanceof ErreurApi ? e.message : "L'envoi de la candidature a échoué. Réessayez."
      );
    } finally {
      setCharge(false);
    }
  };

  const changerDeCompte = async () => {
    await deconnexion();
    router.replace('/');
  };

  // --- Profil chauffeur déjà existant : états de suivi de candidature. ---
  if (chauffeur) {
    if (statutVerif === 'verified') {
      return (
        <Ecran>
          <Carte style={styles.carteEtat}>
            <View style={styles.bulleEtat}>
              <Ionicons name="checkmark-circle" size={40} color={couleurs.succes} />
            </View>
            <Titre>Compte chauffeur activé</Titre>
            <SousTitre centre>
              Votre compte Taxi Partner est vérifié. Accédez à vos courses et scannez les QR.
            </SousTitre>
            <Bouton
              titre="Accéder à mes courses"
              icone="car-outline"
              onPress={() => router.replace('/')}
            />
          </Carte>
        </Ecran>
      );
    }
    if (statutVerif === 'rejected') {
      return (
        <Ecran>
          <Carte style={styles.carteEtat}>
            <View style={[styles.bulleEtat, { backgroundColor: couleurs.dangerFond }]}>
              <Ionicons name="close-circle" size={40} color={couleurs.danger} />
            </View>
            <Titre>Candidature refusée</Titre>
            <SousTitre centre>
              L&apos;équipe zanziGo n&apos;a pas pu valider votre candidature. Contactez-nous sur
              WhatsApp pour en savoir plus ou mettre vos documents à jour.
            </SousTitre>
            <Bouton
              titre="Contacter l'équipe sur WhatsApp"
              icone="logo-whatsapp"
              onPress={() => Linking.openURL(WHATSAPP_EQUIPE)}
            />
            <Bouton titre="Changer de compte" variante="secondaire" onPress={changerDeCompte} />
          </Carte>
        </Ecran>
      );
    }
    // pending
    return (
      <Ecran>
        <Carte style={styles.carteEtat}>
          <View style={[styles.bulleEtat, { backgroundColor: couleurs.attenteFond }]}>
            <Ionicons name="hourglass-outline" size={40} color={couleurs.attente} />
          </View>
          <Titre>Candidature envoyée</Titre>
          <SousTitre centre>
            L&apos;équipe zanziGo vérifie votre permis, votre véhicule et votre assurance, puis
            vous contactera sur WhatsApp. Une fois validé, reconnectez-vous simplement avec
            votre numéro de téléphone.
          </SousTitre>
          <Bouton
            titre="Contacter l'équipe sur WhatsApp"
            icone="logo-whatsapp"
            onPress={() => Linking.openURL(WHATSAPP_EQUIPE)}
          />
          <Bouton titre="Changer de compte" variante="secondaire" onPress={changerDeCompte} />
        </Carte>
      </Ecran>
    );
  }

  // --- Pas encore de profil chauffeur : formulaire de candidature. ---
  return (
    <Ecran>
      <Carte>
        <Titre>Devenir chauffeur</Titre>
        <SousTitre>
          Nouveau ? Déposez votre candidature Taxi Partner : l&apos;équipe zanziGo vérifie vos
          documents et vous répond sous 48 h. (Déjà Taxi Partner ? Votre numéro vous connecte
          directement à votre compte.)
        </SousTitre>
        <Champ label="Nom complet" value={nom} onChangeText={setNom} placeholder="Juma Ali" />
        <Champ
          label="Numéro de permis de conduire"
          value={permis}
          onChangeText={setPermis}
          placeholder="Ex. : Z123456"
          autoCapitalize="characters"
        />
        <Champ
          label="Plaque d'immatriculation"
          value={plaque}
          onChangeText={setPlaque}
          placeholder="Ex. : Z 123 ABC"
          autoCapitalize="characters"
        />
        <Champ
          label="Modèle du véhicule (optionnel)"
          value={modele}
          onChangeText={setModele}
          placeholder="Ex. : Toyota Noah"
        />
        <Champ
          label="Zone de travail"
          value={zone}
          onChangeText={setZone}
          placeholder="Ex. : Stone Town, Nungwi…"
        />

        <LigneDocument
          label="Permis de conduire (photo lisible)"
          uri={permisUri}
          onChoisir={() => choisirImage(setPermisUri)}
        />
        <LigneDocument
          label="Pièce d'identité (photo lisible)"
          uri={identiteUri}
          onChoisir={() => choisirImage(setIdentiteUri)}
        />

        <EncartInfo icone="shield-checkmark-outline">
          Vos documents servent uniquement à la vérification par l&apos;équipe zanziGo.
        </EncartInfo>

        <TexteErreur>{erreur}</TexteErreur>
        <Bouton
          titre="Envoyer ma candidature"
          icone="send-outline"
          onPress={envoyerCandidature}
          charge={charge}
        />
      </Carte>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  carteEtat: {
    alignItems: 'center',
    gap: espaces.m,
    paddingVertical: espaces.xl,
  },
  bulleEtat: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: couleurs.succesFond,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blocDocument: {
    gap: espaces.s,
    marginTop: espaces.xs,
  },
  labelDocument: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  ligneDocumentOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
  },
  documentOk: {
    fontSize: 14,
    fontWeight: '600',
    color: couleurs.encre,
    flex: 1,
  },
  changer: {
    fontSize: 14,
    fontWeight: '700',
    color: couleurs.primaire,
  },
});
