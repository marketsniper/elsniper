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
import { useT } from '@/lib/i18n';
import { couleurs, espaces } from '@/lib/theme';
import { champ, type StatutVerification } from '@/lib/types';

// Numéro WhatsApp de l'équipe zanziGo (placeholder MVP).
const WHATSAPP_EQUIPE = 'https://wa.me/255779000000';

/** Ligne de sélection d'un document (permis, pièce d'identité). */
function LigneDocument({
  label,
  uri,
  onChoisir,
  texteAjoute,
  texteChanger,
  texteAjouter,
}: {
  label: string;
  uri: string | null;
  onChoisir: () => void;
  texteAjoute: string;
  texteChanger: string;
  texteAjouter: string;
}) {
  return (
    <View style={styles.blocDocument}>
      <Text style={styles.labelDocument}>{label}</Text>
      {uri ? (
        <View style={styles.ligneDocumentOk}>
          <Ionicons name="checkmark-circle" size={22} color={couleurs.succes} />
          <Text style={styles.documentOk}>{texteAjoute}</Text>
          <Pressable onPress={onChoisir} hitSlop={8}>
            <Text style={styles.changer}>{texteChanger}</Text>
          </Pressable>
        </View>
      ) : (
        <Bouton
          titre={texteAjouter}
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
  const { t } = useT();
  const chauffeur = session?.driver ?? null;
  const statutVerif =
    champ<StatutVerification>(chauffeur, 'verification_status', 'verificationStatus') ?? 'pending';

  const [nom, setNom] = useState('');
  const [permis, setPermis] = useState('');
  const [plaque, setPlaque] = useState('');
  const [modele, setModele] = useState('');
  const [zone, setZone] = useState('');
  // Trois documents obligatoires : permis, assurance, photo du véhicule.
  const [permisUri, setPermisUri] = useState<string | null>(null);
  const [assuranceUri, setAssuranceUri] = useState<string | null>(null);
  const [vehiculeUri, setVehiculeUri] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  const choisirImage = async (definir: (uri: string) => void) => {
    setErreur('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErreur(t('client_erreur_photos'));
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
      setErreur(t('client_erreur_nom'));
      return;
    }
    if (permis.trim().length < 3) {
      setErreur(t('pro_erreur_permis'));
      return;
    }
    if (plaque.trim().length < 3) {
      setErreur(t('pro_erreur_plaque'));
      return;
    }
    if (zone.trim().length < 2) {
      setErreur(t('pro_erreur_zone'));
      return;
    }
    if (!permisUri || !assuranceUri || !vehiculeUri) {
      setErreur(t('pro_erreur_docs'));
      return;
    }
    setCharge(true);
    try {
      // Téléverser les trois documents pour obtenir leurs URLs.
      const [docPermis, docAssurance, photoVehicule] = await Promise.all([
        api.televerser(permisUri),
        api.televerser(assuranceUri),
        api.televerser(vehiculeUri),
      ]);
      const profil = await api.creerChauffeur({
        fullName: nom.trim(),
        phone: session.phone, // doit correspondre au téléphone du jeton
        licenseNumber: permis.trim(),
        vehiclePlate: plaque.trim(),
        vehicleModel: modele.trim() || undefined,
        zone: zone.trim(),
        licenseDocumentUrl: docPermis.url,
        insuranceDocumentUrl: docAssurance.url,
        vehiclePhotoUrl: photoVehicule.url,
      });
      // La session porte désormais le profil chauffeur (pending) : cet écran
      // bascule sur l'état « candidature envoyée ».
      await majSession({ driver: profil });
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('pro_erreur_envoi'));
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
        <Ecran fond="vagues">
          <Carte style={styles.carteEtat}>
            <View style={styles.bulleEtat}>
              <Ionicons name="checkmark-circle" size={40} color={couleurs.succes} />
            </View>
            <Titre>{t('pro_active')}</Titre>
            <SousTitre centre>{t('pro_active_texte')}</SousTitre>
            <Bouton
              titre={t('pro_acceder')}
              icone="car-outline"
              onPress={() => router.replace('/')}
            />
          </Carte>
        </Ecran>
      );
    }
    if (statutVerif === 'rejected') {
      return (
        <Ecran fond="vagues">
          <Carte style={styles.carteEtat}>
            <View style={[styles.bulleEtat, { backgroundColor: couleurs.dangerFond }]}>
              <Ionicons name="close-circle" size={40} color={couleurs.danger} />
            </View>
            <Titre>{t('pro_refusee')}</Titre>
            <SousTitre centre>{t('pro_refusee_texte')}</SousTitre>
            <Bouton
              titre={t('pro_contacter')}
              icone="logo-whatsapp"
              onPress={() => Linking.openURL(WHATSAPP_EQUIPE)}
            />
            <Bouton
              titre={t('pro_changer_compte')}
              variante="secondaire"
              onPress={changerDeCompte}
            />
          </Carte>
        </Ecran>
      );
    }
    // pending
    return (
      <Ecran fond="vagues">
        <Carte style={styles.carteEtat}>
          <View style={[styles.bulleEtat, { backgroundColor: couleurs.attenteFond }]}>
            <Ionicons name="hourglass-outline" size={40} color={couleurs.attente} />
          </View>
          <Titre>{t('pro_candidature_envoyee')}</Titre>
          <SousTitre centre>{t('pro_candidature_texte')}</SousTitre>
          <Bouton
            titre={t('pro_contacter')}
            icone="logo-whatsapp"
            onPress={() => Linking.openURL(WHATSAPP_EQUIPE)}
          />
          <Bouton
            titre={t('pro_changer_compte')}
            variante="secondaire"
            onPress={changerDeCompte}
          />
        </Carte>
      </Ecran>
    );
  }

  // --- Pas encore de profil chauffeur : formulaire de candidature. ---
  return (
    <Ecran fond="vagues">
      <Carte>
        <Titre>{t('pro_titre')}</Titre>
        <SousTitre>{t('pro_intro')}</SousTitre>
        <Champ label={t('client_nom')} value={nom} onChangeText={setNom} placeholder="Juma Ali" />
        <Champ
          label={t('pro_permis')}
          value={permis}
          onChangeText={setPermis}
          placeholder="Z123456"
          autoCapitalize="characters"
        />
        <Champ
          label={t('pro_plaque')}
          value={plaque}
          onChangeText={setPlaque}
          placeholder="Z 123 ABC"
          autoCapitalize="characters"
        />
        <Champ
          label={t('pro_modele')}
          value={modele}
          onChangeText={setModele}
          placeholder="Toyota Noah"
        />
        <Champ
          label={t('pro_zone')}
          value={zone}
          onChangeText={setZone}
          placeholder="Stone Town, Nungwi…"
        />

        <LigneDocument
          label={t('pro_doc_permis')}
          uri={permisUri}
          onChoisir={() => choisirImage(setPermisUri)}
          texteAjoute={t('client_doc_ajoute')}
          texteChanger={t('client_doc_changer')}
          texteAjouter={t('pro_doc_ajouter')}
        />
        <LigneDocument
          label={t('pro_doc_assurance')}
          uri={assuranceUri}
          onChoisir={() => choisirImage(setAssuranceUri)}
          texteAjoute={t('client_doc_ajoute')}
          texteChanger={t('client_doc_changer')}
          texteAjouter={t('pro_doc_ajouter')}
        />
        <LigneDocument
          label={t('pro_doc_vehicule')}
          uri={vehiculeUri}
          onChoisir={() => choisirImage(setVehiculeUri)}
          texteAjoute={t('client_doc_ajoute')}
          texteChanger={t('client_doc_changer')}
          texteAjouter={t('pro_doc_ajouter')}
        />

        <EncartInfo icone="shield-checkmark-outline">{t('pro_note_docs')}</EncartInfo>

        <TexteErreur>{erreur}</TexteErreur>
        <Bouton
          titre={t('pro_bouton')}
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
