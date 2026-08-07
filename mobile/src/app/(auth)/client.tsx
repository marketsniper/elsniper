// Formulaire de création de profil client (POST /users).
// Le backend attend {fullName, phone, email?, accountType, idDocumentUrl?} —
// le téléphone doit être celui vérifié par OTP (celui du jeton).
// Touriste : devise USD, compte vérifié d'office. Résident : devise TZS et
// tarif local, mais document d'identité OBLIGATOIRE (téléversé sur
// POST /uploads), puis validation manuelle par l'équipe (statut 'pending'
// → 'verified'/'rejected').
// Le choix fait sur la page d'accueil (?type=tourist|resident) préremplit le
// type de compte et masque le sélecteur.
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
import { couleurs, espaces, rayons } from '@/lib/theme';
import type { TypeCompte } from '@/lib/types';

const TYPES_COMPTE: { cle: TypeCompte; titre: string; description: string }[] = [
  {
    cle: 'tourist',
    titre: 'Touriste',
    description: 'Prix en USD, compte actif immédiatement.',
  },
  {
    cle: 'resident',
    titre: 'Résident',
    description:
      "Prix en TZS et tarif local. Document d'identité requis, validé par l'équipe sous 48 h.",
  },
];

export default function EcranClient() {
  const router = useRouter();
  const { session, majSession } = useAuth();
  const params = useLocalSearchParams<{ type?: string }>();
  // Type choisi sur la page d'accueil : prérempli et non modifiable ici.
  const typePredefini: TypeCompte | null =
    params.type === 'tourist' || params.type === 'resident' ? params.type : null;

  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [typeCompte, setTypeCompte] = useState<TypeCompte>(typePredefini ?? 'tourist');
  // URI locale du document d'identité choisi (résident uniquement).
  const [documentUri, setDocumentUri] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  // Sélection du document d'identité dans la galerie (ou l'appareil photo du
  // téléphone via la galerie système).
  const choisirDocument = async () => {
    setErreur('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErreur("Autorisez l'accès aux photos pour ajouter votre document d'identité.");
      return;
    }
    const resultat = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!resultat.canceled && resultat.assets[0]) {
      setDocumentUri(resultat.assets[0].uri);
    }
  };

  const valider = async () => {
    setErreur('');
    if (!session) {
      router.replace('/');
      return;
    }
    if (nom.trim().length < 2) {
      setErreur('Indiquez votre nom complet.');
      return;
    }
    if (typeCompte === 'resident' && !documentUri) {
      setErreur("Ajoutez votre document d'identité : il est requis pour un compte résident.");
      return;
    }
    setCharge(true);
    try {
      // Résident : téléverser d'abord le document pour obtenir son URL.
      let idDocumentUrl: string | undefined;
      if (typeCompte === 'resident' && documentUri) {
        const televersement = await api.televerser(documentUri);
        idDocumentUrl = televersement.url;
      }
      const utilisateur = await api.creerUtilisateur({
        fullName: nom.trim(),
        phone: session.phone, // doit correspondre au téléphone du jeton
        email: email.trim() || undefined,
        accountType: typeCompte,
        idDocumentUrl,
      });
      await majSession({ user: utilisateur });
      router.replace('/');
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : 'Impossible de créer le profil. Réessayez.');
    } finally {
      setCharge(false);
    }
  };

  return (
    <Ecran>
      <Carte>
        <Titre>Votre profil client</Titre>
        <SousTitre>Numéro vérifié : {session?.phone ?? ''}</SousTitre>

        {typePredefini === 'tourist' && (
          <EncartInfo icone="airplane-outline">
            Compte touriste — prix en USD, actif immédiatement.
          </EncartInfo>
        )}
        {typePredefini === 'resident' && (
          <EncartInfo icone="home-outline">
            Compte résident — tarif local en TZS. Votre document d&apos;identité est vérifié
            par l&apos;équipe sous 48 h.
          </EncartInfo>
        )}

        <Champ label="Nom complet" value={nom} onChangeText={setNom} placeholder="Amina Hassan" />
        <Champ
          label="E-mail (optionnel)"
          value={email}
          onChangeText={setEmail}
          placeholder="amina@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        {!typePredefini && (
          <>
            <Text style={styles.labelType}>Vous êtes…</Text>
            {TYPES_COMPTE.map((t) => {
              const actif = typeCompte === t.cle;
              return (
                <Pressable
                  key={t.cle}
                  onPress={() => setTypeCompte(t.cle)}
                  style={[styles.optionType, actif && styles.optionActive]}
                >
                  <View style={styles.enTeteOption}>
                    <Text style={[styles.titreOption, actif && styles.titreActif]}>{t.titre}</Text>
                    {actif && (
                      <Ionicons name="checkmark-circle" size={20} color={couleurs.primaire} />
                    )}
                  </View>
                  <Text style={styles.descriptionOption}>{t.description}</Text>
                </Pressable>
              );
            })}
          </>
        )}

        {typeCompte === 'resident' && (
          <View style={styles.blocDocument}>
            <Text style={styles.labelType}>Document d&apos;identité (obligatoire)</Text>
            <SousTitre>
              Carte d&apos;identité, passeport ou permis de résidence — photo lisible.
              L&apos;équipe zanziGo le vérifie avant d&apos;activer le tarif local.
            </SousTitre>
            {documentUri ? (
              <View style={styles.ligneDocument}>
                <Ionicons name="checkmark-circle" size={22} color={couleurs.succes} />
                <Text style={styles.documentOk}>Document ajouté</Text>
                <Pressable onPress={choisirDocument} hitSlop={8}>
                  <Text style={styles.changer}>Changer</Text>
                </Pressable>
              </View>
            ) : (
              <Bouton
                titre="Ajouter mon document"
                icone="cloud-upload-outline"
                variante="secondaire"
                onPress={choisirDocument}
              />
            )}
          </View>
        )}

        <TexteErreur>{erreur}</TexteErreur>
        <Bouton titre="Créer mon profil" icone="person-add-outline" onPress={valider} charge={charge} />
      </Carte>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  labelType: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  optionType: {
    borderWidth: 2,
    borderColor: couleurs.bordure,
    borderRadius: rayons.bouton,
    padding: espaces.m,
    gap: 2,
    backgroundColor: couleurs.blanc,
  },
  optionActive: {
    borderColor: couleurs.primaire,
    backgroundColor: couleurs.primaireClair,
  },
  enTeteOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.s,
  },
  titreOption: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
  },
  titreActif: {
    color: couleurs.primaireFonce,
  },
  descriptionOption: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
    lineHeight: 18,
  },
  blocDocument: {
    gap: espaces.s,
    marginTop: espaces.xs,
  },
  ligneDocument: {
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
