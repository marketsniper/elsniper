// Formulaire de création de profil client (POST /users).
// Le backend attend {fullName, phone, email?, accountType, idDocumentUrl?} —
// le téléphone doit être celui vérifié par OTP (celui du jeton).
// Segmentation : touriste (aucun document, USD plein tarif) ; résident
// (documents de résidence requis, −10 % une fois validé, USD) ; local
// (carte d'identité tanzanienne NIDA requise, 15 000 TZS partout une fois
// validé). Le flux « visiteur » de l'accueil laisse le choix touriste ou
// résident ; le flux « local » préremplit accountType='local'.
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
import { useT } from '@/lib/i18n';
import { couleurs, espaces, rayons } from '@/lib/theme';
import { formaterMontant, TARIF_LOCAL_TZS, type TypeCompte } from '@/lib/types';

export default function EcranClient() {
  const router = useRouter();
  const { session, majSession, deconnexion } = useAuth();
  const { t } = useT();
  const params = useLocalSearchParams<{ type?: string }>();
  // Type imposé par le flux d'accueil ('local'), ou préréglé (legacy).
  const typePredefini: TypeCompte | null =
    params.type === 'tourist' || params.type === 'resident' || params.type === 'local'
      ? params.type
      : null;

  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [typeCompte, setTypeCompte] = useState<TypeCompte>(typePredefini ?? 'tourist');
  // URI locale du document requis (résident : documents de résidence ;
  // local : carte d'identité tanzanienne NIDA).
  const [documentUri, setDocumentUri] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  const estLocal = typeCompte === 'local';
  const documentRequis = typeCompte === 'resident' || estLocal;
  const prixLocal = formaterMontant(TARIF_LOCAL_TZS, 'TZS');

  const TYPES_COMPTE: { cle: TypeCompte; titre: string; description: string }[] = [
    { cle: 'tourist', titre: t('client_type_touriste'), description: t('client_type_touriste_desc') },
    { cle: 'resident', titre: t('client_type_resident'), description: t('client_type_resident_desc') },
  ];

  // Sélection du document dans la galerie (ou l'appareil photo du téléphone
  // via la galerie système).
  const choisirDocument = async () => {
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
      setErreur(t('client_erreur_nom'));
      return;
    }
    if (documentRequis && !documentUri) {
      setErreur(estLocal ? t('client_erreur_doc_local') : t('client_erreur_doc_resident'));
      return;
    }
    setCharge(true);
    try {
      // Résident / local : téléverser d'abord le document pour obtenir son URL.
      let idDocumentUrl: string | undefined;
      if (documentRequis && documentUri) {
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
      setErreur(e instanceof ErreurApi ? e.message : t('client_erreur_creation'));
    } finally {
      setCharge(false);
    }
  };

  return (
    <Ecran fond="vagues">
      <Carte>
        <Titre>{t('client_titre')}</Titre>
        <SousTitre>{t('client_numero_verifie', { phone: session?.phone ?? '' })}</SousTitre>
        {/* Numéro tapé par erreur : on se déconnecte et on repart de la
            saisie du téléphone, dans la même rubrique. */}
        <Pressable
          onPress={async () => {
            await deconnexion();
            router.replace({
              pathname: '/(auth)/telephone',
              params: { profil: typePredefini === 'local' ? 'local' : 'visitor' },
            });
          }}
          hitSlop={8}
          accessibilityRole="button"
          style={({ pressed }) => [styles.lienMauvaisNumero, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="arrow-undo-outline" size={14} color={couleurs.primaireFonce} />
          <Text style={styles.texteMauvaisNumero}>{t('commun_mauvais_numero')}</Text>
        </Pressable>

        {typePredefini === 'tourist' && (
          <EncartInfo icone="airplane-outline">{t('client_info_touriste')}</EncartInfo>
        )}
        {typePredefini === 'local' && (
          <EncartInfo icone="id-card-outline">
            {t('client_info_local', { prix: prixLocal })}
          </EncartInfo>
        )}

        <Champ label={t('client_nom')} value={nom} onChangeText={setNom} placeholder="Amina Hassan" />
        <Champ
          label={t('client_email_opt')}
          value={email}
          onChangeText={setEmail}
          placeholder="amina@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        {!typePredefini && (
          <>
            <Text style={styles.labelType}>{t('client_vous_etes')}</Text>
            {TYPES_COMPTE.map((typeOption) => {
              const actif = typeCompte === typeOption.cle;
              return (
                <Pressable
                  key={typeOption.cle}
                  onPress={() => setTypeCompte(typeOption.cle)}
                  style={[styles.optionType, actif && styles.optionActive]}
                >
                  <View style={styles.enTeteOption}>
                    <Text style={[styles.titreOption, actif && styles.titreActif]}>
                      {typeOption.titre}
                    </Text>
                    {actif && (
                      <Ionicons name="checkmark-circle" size={20} color={couleurs.primaire} />
                    )}
                  </View>
                  <Text style={styles.descriptionOption}>{typeOption.description}</Text>
                </Pressable>
              );
            })}
          </>
        )}

        {documentRequis && (
          <View style={styles.blocDocument}>
            <Text style={styles.labelType}>
              {estLocal ? t('client_doc_local_titre') : t('client_doc_resident_titre')}
            </Text>
            <SousTitre>
              {estLocal
                ? t('client_doc_local_desc', { prix: prixLocal })
                : t('client_doc_resident_desc')}
            </SousTitre>
            {documentUri ? (
              <View style={styles.ligneDocument}>
                <Ionicons name="checkmark-circle" size={22} color={couleurs.succes} />
                <Text style={styles.documentOk}>{t('client_doc_ajoute')}</Text>
                <Pressable onPress={choisirDocument} hitSlop={8}>
                  <Text style={styles.changer}>{t('client_doc_changer')}</Text>
                </Pressable>
              </View>
            ) : (
              <Bouton
                titre={t('client_doc_ajouter')}
                icone="cloud-upload-outline"
                variante="secondaire"
                onPress={choisirDocument}
              />
            )}
          </View>
        )}

        <TexteErreur>{erreur}</TexteErreur>
        <Bouton
          titre={t('client_bouton')}
          icone="person-add-outline"
          onPress={valider}
          charge={charge}
        />
      </Carte>
    </Ecran>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: couleurs.surface,
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
