// Création d'un compte hôtel partenaire (public, sans OTP).
// POST /hotels {name, contactName, email, password (min 8), phone (WhatsApp
// de l'établissement, +255…), zone, address?} → 201 {hotel}, puis
// hotel-login automatique pour obtenir le jeton de session.
// 409 duplicate si l'e-mail ou le téléphone est déjà utilisé.
import { useRouter } from 'expo-router';
import React, { useState } from 'react';

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
import { champ, type Hotel } from '@/lib/types';

export default function EcranHotelInscription() {
  const router = useRouter();
  const { connexion } = useAuth();
  const { t } = useT();

  const [nomHotel, setNomHotel] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [telephone, setTelephone] = useState('+255');
  const [zone, setZone] = useState('');
  const [adresse, setAdresse] = useState('');
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  const valider = async () => {
    setErreur('');
    if (nomHotel.trim().length < 2) {
      setErreur(t('hotelins_erreur_nom'));
      return;
    }
    if (contact.trim().length < 2) {
      setErreur(t('hotelins_erreur_contact'));
      return;
    }
    const emailNormalise = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(emailNormalise)) {
      setErreur(t('hotelcx_erreur_email'));
      return;
    }
    if (motDePasse.length < 8) {
      setErreur(t('hotelins_erreur_mdp'));
      return;
    }
    const telephoneNormalise = telephone.replace(/[\s-]/g, '');
    if (!/^\+[1-9]\d{6,14}$/.test(telephoneNormalise)) {
      setErreur(t('hotelins_erreur_tel'));
      return;
    }
    if (zone.trim().length < 2) {
      setErreur(t('hotelins_erreur_zone'));
      return;
    }
    setCharge(true);
    try {
      await api.creerHotel({
        name: nomHotel.trim(),
        contactName: contact.trim(),
        email: emailNormalise,
        password: motDePasse,
        phone: telephoneNormalise,
        zone: zone.trim(),
        address: adresse.trim() || undefined,
      });
      // Connexion automatique après l'inscription pour obtenir le jeton.
      const reponse = await api.connexionHotel(emailNormalise, motDePasse);
      const hotel: Hotel = reponse.hotel;
      await connexion({
        token: reponse.token,
        phone: String(champ(hotel, 'phone') ?? telephoneNormalise),
        user: null,
        driver: null,
        hotel,
      });
      router.replace('/');
    } catch (e) {
      if (e instanceof ErreurApi && e.code === 'duplicate') {
        setErreur(t('hotelins_erreur_duplicate'));
      } else {
        setErreur(e instanceof ErreurApi ? e.message : t('hotelins_erreur_creation'));
      }
    } finally {
      setCharge(false);
    }
  };

  return (
    <Ecran fond="lagon">
      <Carte>
        <Titre>{t('titre_hotel_inscription')}</Titre>
        <SousTitre>{t('hotelins_intro')}</SousTitre>
        <Champ
          label={t('hotelins_nom')}
          value={nomHotel}
          onChangeText={setNomHotel}
          placeholder="Ocean View Hotel"
        />
        <Champ
          label={t('hotelins_contact')}
          value={contact}
          onChangeText={setContact}
          placeholder="Fatma Said"
        />
        <Champ
          label={t('commun_email')}
          value={email}
          onChangeText={setEmail}
          placeholder="reception@oceanview.co.tz"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <Champ
          label={t('hotelins_mdp')}
          value={motDePasse}
          onChangeText={setMotDePasse}
          placeholder={t('hotelins_mdp_placeholder')}
          secureTextEntry
          autoCapitalize="none"
        />
        <Champ
          label={t('hotelins_whatsapp')}
          value={telephone}
          onChangeText={setTelephone}
          keyboardType="phone-pad"
          placeholder="+255 712 345 678"
        />
        <Champ
          label={t('commun_zone')}
          value={zone}
          onChangeText={setZone}
          placeholder="Nungwi, Paje, Stone Town…"
        />
        <Champ
          label={t('hotelins_adresse')}
          value={adresse}
          onChangeText={setAdresse}
          placeholder="—"
        />
        <EncartInfo icone="logo-whatsapp">{t('hotelins_note_whatsapp')}</EncartInfo>
        <TexteErreur>{erreur}</TexteErreur>
        <Bouton
          titre={t('hotelins_bouton')}
          icone="business-outline"
          onPress={valider}
          charge={charge}
        />
      </Carte>
    </Ecran>
  );
}
