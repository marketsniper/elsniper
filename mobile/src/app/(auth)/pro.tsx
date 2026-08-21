// Candidature chauffeur « Taxi Partner » (POST /drivers).
// Payload backend : {fullName, phone (celui du jeton), licenseNumber,
// vehiclePlate, vehicleModel?, zone, licenseDocumentUrl, idDocumentUrl} —
// les deux documents sont téléversés d'abord sur POST /uploads.
// Le compte reste 'pending' jusqu'à validation manuelle par l'équipe : un
// chauffeur en attente qui se reconnecte retrouve cet écran d'attente.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { ChoixDocument } from '@/components/ChoixDocument';
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
import { useAuth, useRetourSiDeconnecte } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, stylesReactifs } from '@/lib/theme';
import { champ, type StatutVerification } from '@/lib/types';

// Numéro WhatsApp de l'équipe zanziGo (placeholder MVP).
const WHATSAPP_EQUIPE = 'https://wa.me/255666241749';

export default function EcranPro() {
  useRetourSiDeconnecte();
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
      // Les trois documents sont DÉJÀ sur le serveur : chacun est parti au
      // moment où le chauffeur l'a choisi. Envoyer trois photos d'un coup en
      // fin de formulaire, sur un réseau faible, faisait échouer toute la
      // candidature — et le chauffeur croyait ne pas pouvoir joindre ses
      // pièces.
      const profil = await api.creerChauffeur({
        fullName: nom.trim(),
        phone: session.phone, // doit correspondre au téléphone du jeton
        licenseNumber: permis.trim(),
        vehiclePlate: plaque.trim(),
        vehicleModel: modele.trim() || undefined,
        zone: zone.trim(),
        licenseDocumentUrl: permisUri,
        insuranceDocumentUrl: assuranceUri,
        vehiclePhotoUrl: vehiculeUri,
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
        <SousTitre>{t('client_numero_verifie', { phone: session?.phone ?? '' })}</SousTitre>
        {/* Numéro tapé par erreur : on se déconnecte et on repart de la
            saisie du téléphone, toujours en rubrique chauffeur. */}
        <Pressable
          onPress={async () => {
            await deconnexion();
            router.replace({ pathname: '/(auth)/telephone', params: { profil: 'driver' } });
          }}
          hitSlop={8}
          accessibilityRole="button"
          style={({ pressed }) => [styles.lienMauvaisNumero, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="arrow-undo-outline" size={14} color={couleurs.primaireFonce} />
          <Text style={styles.texteMauvaisNumero}>{t('commun_mauvais_numero')}</Text>
        </Pressable>
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
        <ChoixDocument
          label={t('pro_doc_permis')}
          uri={permisUri}
          onFichier={setPermisUri}
          onErreur={setErreur}
          texteAjoute={t('client_doc_ajoute')}
          texteChanger={t('client_doc_changer')}
          texteAjouter={t('pro_doc_ajouter')}
        />
        <ChoixDocument
          label={t('pro_doc_assurance')}
          uri={assuranceUri}
          onFichier={setAssuranceUri}
          onErreur={setErreur}
          texteAjoute={t('client_doc_ajoute')}
          texteChanger={t('client_doc_changer')}
          texteAjouter={t('pro_doc_ajouter')}
        />
        <ChoixDocument
          label={t('pro_doc_vehicule')}
          uri={vehiculeUri}
          onFichier={setVehiculeUri}
          onErreur={setErreur}
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

const styles = stylesReactifs(() => ({
  lienMauvaisNumero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs,
  },
  texteMauvaisNumero: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.primaireFonce,
  },
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
  changer: {
    fontSize: 14,
    fontWeight: '700',
    color: couleurs.primaire,
  },
}));
