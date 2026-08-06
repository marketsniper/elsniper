// Création d'un envoi de colis (POST /packages).
// Payload backend : {senderType, senderUserId | senderHotelId, pickupLocation,
// dropoffLocation, recipientName, recipientPhone, description?}. Tarif plat
// figé côté serveur : 10 USD ou 25 000 TZS selon la devise de l'expéditeur
// (TZS pour un hôtel partenaire).
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Bouton, Carte, Champ, Ecran, SousTitre, TexteErreur, Titre } from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ajouterColisLocal } from '@/lib/colisLocal';
import { couleurs } from '@/lib/theme';
import { deviseUtilisateur, formaterMontant, tarifColis, type Devise } from '@/lib/types';

export default function EcranNouveauColis() {
  const router = useRouter();
  const { session } = useAuth();

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
      setErreur('Créez votre profil avant d’envoyer un colis.');
      return;
    }
    if (!depart.trim() || !arrivee.trim() || !destinataire.trim()) {
      setErreur('Renseignez la collecte, la livraison et le nom du destinataire.');
      return;
    }
    const telephoneNormalise = telephone.replace(/[\s-]/g, '');
    if (!/^\+[1-9]\d{6,14}$/.test(telephoneNormalise)) {
      setErreur('Téléphone du destinataire invalide (format international +255…).');
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
      setErreur(e instanceof ErreurApi ? e.message : 'La création du colis a échoué.');
    } finally {
      setCharge(false);
    }
  };

  return (
    <Ecran>
      <Carte>
        <Titre>Envoyer un colis</Titre>
        <SousTitre>
          Un chauffeur zanziGo récupère votre colis et le livre contre scan du QR code.
        </SousTitre>
        <Champ
          label="Lieu de collecte"
          value={depart}
          onChangeText={setDepart}
          placeholder="Ex. : Stone Town, Kenyatta Road"
        />
        <Champ
          label="Lieu de livraison"
          value={arrivee}
          onChangeText={setArrivee}
          placeholder="Ex. : Paje, guesthouse Baraka"
        />
        <Champ
          label="Nom du destinataire"
          value={destinataire}
          onChangeText={setDestinataire}
          placeholder="Ex. : Juma Ali"
        />
        <Champ
          label="Téléphone du destinataire"
          value={telephone}
          onChangeText={setTelephone}
          keyboardType="phone-pad"
          placeholder="+255 712 345 678"
        />
        <Champ
          label="Description (optionnel)"
          value={description}
          onChangeText={setDescription}
          placeholder="Ex. : documents, fragile…"
          multiline
        />

        <View style={styles.lignePrix}>
          <Text style={styles.labelPrix}>Prix de l&apos;envoi</Text>
          <Text style={styles.valeurPrix}>{formaterMontant(prix, devise)}</Text>
        </View>
        <Text style={styles.note}>
          Tarif plat zanziGo, quel que soit le trajet sur l&apos;île. Le prix officiel est figé
          par le serveur à la création de l&apos;envoi.
        </Text>

        <TexteErreur>{erreur}</TexteErreur>
        <Bouton titre="Créer l'envoi" onPress={envoyer} charge={charge} />
      </Carte>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  lignePrix: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelPrix: {
    fontSize: 14,
    color: couleurs.texteSecondaire,
  },
  valeurPrix: {
    fontSize: 20,
    fontWeight: '800',
    color: couleurs.primaire,
  },
  note: {
    fontSize: 12,
    color: couleurs.texteSecondaire,
    lineHeight: 17,
  },
});
