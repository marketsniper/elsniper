// Formulaire de création de profil client (POST /users).
// Le backend attend {fullName, phone, email?, accountType, idDocumentUrl?} —
// le téléphone doit être celui vérifié par OTP (celui du jeton).
// Segmentation : touriste (aucun document, USD plein tarif) ; résident
// (documents de résidence requis, −10 % une fois validé, USD) ; local
// (carte d'identité tanzanienne NIDA requise, 16 000 TZS partout une fois
// validé). Le flux « visiteur » de l'accueil laisse le choix touriste ou
// résident ; le flux « local » préremplit accountType='local'.
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

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
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, rayons, stylesReactifs } from '@/lib/theme';
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

  // Identité E-MAIL (visiteurs) : l'e-mail du compte est celui vérifié par
  // le code — le téléphone devient un contact WhatsApp optionnel.
  const identiteEmail = !!session?.email && !session?.phone;
  // Identité par IDENTIFIANT (parcours actuel) : pas de numéro vérifié —
  // le téléphone n'est qu'un contact WhatsApp facultatif, comme l'e-mail.
  const identiteIdentifiant = !session?.phone && !session?.email;
  const sansNumeroVerifie = identiteEmail || identiteIdentifiant;

  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [telWhatsapp, setTelWhatsapp] = useState('');
  const [typeCompte, setTypeCompte] = useState<TypeCompte>(typePredefini ?? 'tourist');
  // URI locale du document requis (résident : documents de résidence ;
  // local : carte d'identité tanzanienne NIDA).
  const [documentUri, setDocumentUri] = useState<string | null>(null);
  // Parrainage : code ZG-XXXXXX d'un ami déjà client (optionnel).
  const [codeParrain, setCodeParrain] = useState('');
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  const estLocal = typeCompte === 'local';
  const documentRequis = typeCompte === 'resident' || estLocal;
  const prixLocal = formaterMontant(TARIF_LOCAL_TZS, 'TZS');

  const TYPES_COMPTE: { cle: TypeCompte; titre: string; description: string }[] = [
    { cle: 'tourist', titre: t('client_type_touriste'), description: t('client_type_touriste_desc') },
    { cle: 'resident', titre: t('client_type_resident'), description: t('client_type_resident_desc') },
  ];

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
      // Le document est déjà sur le serveur : il est parti dès que le client
      // l'a choisi, et `documentUri` porte son adresse définitive.
      const idDocumentUrl = documentRequis && documentUri ? documentUri : undefined;
      const utilisateur = await api.creerUtilisateur({
        fullName: nom.trim(),
        // Identité e-mail : WhatsApp optionnel (contact chauffeur) ;
        // identité téléphone : le numéro vérifié par OTP (jeton).
        phone: sansNumeroVerifie ? telWhatsapp.trim() || undefined : session.phone,
        email: identiteEmail ? undefined : email.trim() || undefined,
        accountType: typeCompte,
        idDocumentUrl,
        referralCode: codeParrain.trim() || undefined,
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
        <SousTitre>
          {identiteIdentifiant
            ? t('client_compte_cree')
            : identiteEmail
              ? t('client_email_verifie', { email: session?.email ?? '' })
              : t('client_numero_verifie', { phone: session?.phone ?? '' })}
        </SousTitre>
        {/* Erreur de saisie : on se déconnecte et on repart de l'entrée,
            dans la même rubrique. */}
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
        {/* Identité par identifiant : on demande l'e-mail ET le WhatsApp,
            tous deux facultatifs (le chauffeur doit pouvoir joindre le
            client le jour de la course). */}
        {identiteIdentifiant && (
          <Champ
            label={t('client_email_opt')}
            value={email}
            onChangeText={setEmail}
            placeholder="amina@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        )}
        {sansNumeroVerifie ? (
          // Pas de numéro vérifié (identifiant ou e-mail) : on demande un
          // numéro WhatsApp — facultatif mais vivement recommandé, c'est
          // par là que le chauffeur joint le client le jour de la course.
          <Champ
            label={t('client_whatsapp_opt')}
            value={telWhatsapp}
            onChangeText={setTelWhatsapp}
            placeholder="+33 6 12 34 56 78"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
          />
        ) : (
          <Champ
            label={t('client_email_opt')}
            value={email}
            onChangeText={setEmail}
            placeholder="amina@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        )}

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

        {/* Parrainage : un ami déjà client a partagé son code ZG- ? */}
        <Champ
          label={t('client_code_parrain')}
          value={codeParrain}
          onChangeText={setCodeParrain}
          autoCapitalize="characters"
          placeholder="ZG-A1B2C3"
        />

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
            <ChoixDocument
              uri={documentUri}
              onFichier={setDocumentUri}
              onErreur={setErreur}
              texteAjouter={t('client_doc_ajouter')}
              texteAjoute={t('client_doc_ajoute')}
              texteChanger={t('client_doc_changer')}
            />
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
  changer: {
    fontSize: 14,
    fontWeight: '700',
    color: couleurs.primaire,
  },
}));
