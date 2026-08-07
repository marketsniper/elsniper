// Création d'un envoi de colis (POST /packages).
// Payload backend : {senderType, senderUserId | senderHotelId, pickupLocation,
// dropoffLocation, recipientName, recipientPhone, description?}. Tarif plat
// figé côté serveur : 10 USD ou 25 000 TZS selon la devise de l'expéditeur
// (TZS pour un hôtel partenaire ou un compte local).
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  Bouton,
  Carte,
  Champ,
  Ecran,
  SousTitre,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ajouterColisLocal } from '@/lib/colisLocal';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, rayons } from '@/lib/theme';
import { deviseUtilisateur, formaterMontant, tarifColis, type Devise } from '@/lib/types';

export default function EcranNouveauColis() {
  const router = useRouter();
  const { session } = useAuth();
  const { t } = useT();

  const [depart, setDepart] = useState('');
  const [arrivee, setArrivee] = useState('');
  const [destinataire, setDestinataire] = useState('');
  const [telephone, setTelephone] = useState('+255');
  const [description, setDescription] = useState('');
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  const expediteurUser = session?.user ?? null;
  const expediteurHotel = session?.hotel ?? null;
  // Devise de l'expéditeur : celle du compte client, TZS pour un hôtel.
  const devise: Devise = expediteurHotel ? 'TZS' : deviseUtilisateur(expediteurUser);
  const prix = tarifColis(devise);

  const envoyer = async () => {
    setErreur('');
    if (!expediteurUser && !expediteurHotel) {
      setErreur(t('ncolis_erreur_profil'));
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
            <Text style={styles.valeurPrix}>{formaterMontant(prix, devise)}</Text>
          </View>
          <Text style={styles.note}>{t('ncolis_note_prix')}</Text>
        </View>

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
