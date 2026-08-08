// Création d'un envoi de colis (POST /packages).
// Payload backend : {senderType, senderUserId | senderHotelId, size (REQUIS :
// small | medium | large — détermine le prix), pickupLocation,
// dropoffLocation, recipientName, recipientPhone, description?}.
// Prix par taille figé côté serveur : 5/10/18 USD (touristes/résidents ;
// hôtel partenaire −5 %) ou 13 000/26 000/47 000 TZS (locaux).
// Payé en ligne à 100 % par l'expéditeur.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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
import { ajouterColisLocal } from '@/lib/colisLocal';
import { useT, type CleChaine } from '@/lib/i18n';
import { couleurs, espaces, rayons } from '@/lib/theme';
import {
  deviseUtilisateur,
  formaterMontant,
  TAILLES_COLIS,
  REMISE_HOTEL,
  tarifColisTaille,
  type Devise,
  type TailleColis,
} from '@/lib/types';

// Icône + clés i18n de chaque taille.
const PRESENTATION_TAILLES: Record<
  TailleColis,
  { icone: React.ComponentProps<typeof Ionicons>['name']; titre: CleChaine; exemples: CleChaine }
> = {
  small: { icone: 'mail-outline', titre: 'ncolis_taille_petit', exemples: 'ncolis_taille_petit_ex' },
  medium: {
    icone: 'bag-handle-outline',
    titre: 'ncolis_taille_moyen',
    exemples: 'ncolis_taille_moyen_ex',
  },
  large: { icone: 'cube-outline', titre: 'ncolis_taille_grand', exemples: 'ncolis_taille_grand_ex' },
};

export default function EcranNouveauColis() {
  const router = useRouter();
  const { session } = useAuth();
  const { t } = useT();

  const [taille, setTaille] = useState<TailleColis | null>(null);
  const [depart, setDepart] = useState('');
  const [arrivee, setArrivee] = useState('');
  const [destinataire, setDestinataire] = useState('');
  const [telephone, setTelephone] = useState('+255');
  const [description, setDescription] = useState('');
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  const expediteurUser = session?.user ?? null;
  const expediteurHotel = session?.hotel ?? null;
  // Devise de l'expéditeur : USD touriste/résident/hôtel, TZS local.
  // Hôtel partenaire : même grille USD que les touristes avec −5 %.
  const devise: Devise = expediteurHotel ? 'USD' : deviseUtilisateur(expediteurUser);
  const tarifAffiche = (laTaille: TailleColis): number => {
    const brut = tarifColisTaille(laTaille, devise);
    return expediteurHotel ? Math.round(brut * (1 - REMISE_HOTEL) * 100) / 100 : brut;
  };
  const prix = taille ? tarifAffiche(taille) : null;

  const envoyer = async () => {
    setErreur('');
    if (!expediteurUser && !expediteurHotel) {
      setErreur(t('ncolis_erreur_profil'));
      return;
    }
    if (!taille) {
      setErreur(t('ncolis_erreur_taille'));
      return;
    }
    if (!depart.trim() || !arrivee.trim() || !destinataire.trim()) {
      setErreur(t('ncolis_erreur_champs'));
      return;
    }
    const telephoneNormalise = telephone.replace(/[\s-]/g, '');
    if (!/^\+[1-9]\d{6,14}$/.test(telephoneNormalise)) {
      setErreur(t('ncolis_erreur_tel'));
      return;
    }
    setCharge(true);
    try {
      const colis = await api.creerColis({
        senderType: expediteurHotel ? 'hotel' : 'user',
        senderUserId: expediteurHotel ? undefined : expediteurUser!.id,
        senderHotelId: expediteurHotel ? expediteurHotel.id : undefined,
        size: taille,
        pickupLocation: depart.trim(),
        dropoffLocation: arrivee.trim(),
        recipientName: destinataire.trim(),
        recipientPhone: telephoneNormalise,
        description: description.trim() || undefined,
      });
      const proprietaireId = (expediteurHotel ?? expediteurUser)!.id;
      await ajouterColisLocal(proprietaireId, colis.id);
      router.replace(`/package/${colis.id}`);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('ncolis_erreur_creation'));
    } finally {
      setCharge(false);
    }
  };

  return (
    <Ecran fond="lagon">
      <Carte>
        <Titre>{t('colis_envoyer')}</Titre>
        <SousTitre>{t('ncolis_intro')}</SousTitre>

        <Text style={styles.titreSection}>{t('ncolis_taille_titre')}</Text>
        {TAILLES_COLIS.map((cle) => {
          const presentation = PRESENTATION_TAILLES[cle];
          const active = taille === cle;
          return (
            <Pressable
              key={cle}
              onPress={() => setTaille(cle)}
              accessibilityRole="button"
              style={[styles.carteTaille, active && styles.carteTailleActive]}
            >
              <View style={[styles.bulleTaille, active && styles.bulleTailleActive]}>
                <Ionicons
                  name={presentation.icone}
                  size={22}
                  color={active ? couleurs.blanc : couleurs.primaire}
                />
              </View>
              <View style={styles.textesTaille}>
                <View style={styles.enTeteTaille}>
                  <Text style={[styles.titreTaille, active && { color: couleurs.primaireFonce }]}>
                    {t(presentation.titre)}
                  </Text>
                  <Text style={styles.prixTaille}>
                    {formaterMontant(tarifAffiche(cle), devise)}
                  </Text>
                </View>
                <Text style={styles.exemplesTaille}>{t(presentation.exemples)}</Text>
              </View>
              {active && (
                <Ionicons name="checkmark-circle" size={22} color={couleurs.primaire} />
              )}
            </Pressable>
          );
        })}

        <Text style={styles.titreSection}>{t('ncolis_section_trajet')}</Text>
        <Champ
          label={t('ncolis_collecte')}
          value={depart}
          onChangeText={setDepart}
          placeholder={t('ncolis_collecte_placeholder')}
        />
        <Champ
          label={t('ncolis_livraison')}
          value={arrivee}
          onChangeText={setArrivee}
          placeholder={t('ncolis_livraison_placeholder')}
        />

        <Text style={styles.titreSection}>{t('ncolis_section_destinataire')}</Text>
        <Champ
          label={t('ncolis_nom_dest')}
          value={destinataire}
          onChangeText={setDestinataire}
          placeholder={t('ncolis_nom_dest_placeholder')}
        />
        <Champ
          label={t('ncolis_tel_dest')}
          value={telephone}
          onChangeText={setTelephone}
          keyboardType="phone-pad"
          placeholder="+255 712 345 678"
        />
        <Champ
          label={t('ncolis_description_opt')}
          value={description}
          onChangeText={setDescription}
          placeholder={t('ncolis_description_placeholder')}
          multiline
        />

        <View style={styles.blocPrix}>
          <View style={styles.lignePrix}>
            <Text style={styles.labelPrix}>{t('ncolis_prix_envoi')}</Text>
            <Text style={styles.valeurPrix}>
              {prix !== null ? formaterMontant(prix, devise) : '—'}
            </Text>
          </View>
          <Text style={styles.note}>{t('ncolis_note_prix')}</Text>
        </View>

        <EncartInfo icone="card-outline">{t('ncolis_paye_expediteur')}</EncartInfo>

        <TexteErreur>{erreur}</TexteErreur>
        <Bouton titre={t('ncolis_bouton')} icone="cube-outline" onPress={envoyer} charge={charge} />
      </Carte>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  titreSection: {
    fontSize: 14,
    fontWeight: '700',
    color: couleurs.encre,
    marginTop: espaces.s,
  },
  carteTaille: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    backgroundColor: couleurs.blanc,
    borderRadius: rayons.carte,
    padding: espaces.m,
    borderWidth: 2,
    borderColor: couleurs.bordure,
  },
  carteTailleActive: {
    borderColor: couleurs.primaire,
    backgroundColor: couleurs.primaireClair,
  },
  bulleTaille: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulleTailleActive: {
    backgroundColor: couleurs.primaire,
  },
  textesTaille: {
    flex: 1,
    gap: 2,
  },
  enTeteTaille: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.s,
  },
  titreTaille: {
    fontSize: 15,
    fontWeight: '800',
    color: couleurs.encre,
  },
  prixTaille: {
    fontSize: 14,
    fontWeight: '800',
    color: couleurs.primaire,
  },
  exemplesTaille: {
    fontSize: 12,
    color: couleurs.texteSecondaire,
    lineHeight: 16,
  },
  blocPrix: {
    backgroundColor: couleurs.primaireClair,
    borderRadius: rayons.bouton,
    padding: espaces.m,
    gap: espaces.xs,
    marginTop: espaces.s,
  },
  lignePrix: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelPrix: {
    fontSize: 14,
    fontWeight: '600',
    color: couleurs.primaireFonce,
  },
  valeurPrix: {
    fontSize: 22,
    fontWeight: '800',
    color: couleurs.primaireFonce,
  },
  note: {
    fontSize: 12,
    color: couleurs.primaireFonce,
    lineHeight: 17,
    opacity: 0.8,
  },
});
