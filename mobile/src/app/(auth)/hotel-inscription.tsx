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
import { champ, type Hotel } from '@/lib/types';

export default function EcranHotelInscription() {
  const router = useRouter();
  const { connexion } = useAuth();

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
      setErreur("Indiquez le nom de l'hôtel.");
      return;
    }
    if (contact.trim().length < 2) {
      setErreur('Indiquez le nom de la personne de contact.');
      return;
    }
    const emailNormalise = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(emailNormalise)) {
      setErreur('Indiquez une adresse e-mail valide.');
      return;
    }
    if (motDePasse.length < 8) {
      setErreur('Le mot de passe doit comporter au moins 8 caractères.');
      return;
    }
    const telephoneNormalise = telephone.replace(/[\s-]/g, '');
    if (!/^\+[1-9]\d{6,14}$/.test(telephoneNormalise)) {
      setErreur("Téléphone WhatsApp de l'établissement invalide (format +255…).");
      return;
    }
    if (zone.trim().length < 2) {
      setErreur("Indiquez la zone de l'hôtel (ex. : Nungwi, Paje, Stone Town).");
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
        setErreur('Un compte partenaire existe déjà avec cet e-mail ou ce téléphone.');
      } else {
        setErreur(
          e instanceof ErreurApi ? e.message : "La création du compte hôtel a échoué. Réessayez."
        );
      }
    } finally {
      setCharge(false);
    }
  };

  return (
    <Ecran>
      <Carte>
        <Titre>Compte partenaire</Titre>
        <SousTitre>
          Créez le compte de votre établissement pour réserver des taxis pour vos clients et
          envoyer leurs colis — tarifs en TZS.
        </SousTitre>
        <Champ
          label="Nom de l'hôtel"
          value={nomHotel}
          onChangeText={setNomHotel}
          placeholder="Ex. : Ocean View Hotel"
        />
        <Champ
          label="Personne de contact"
          value={contact}
          onChangeText={setContact}
          placeholder="Ex. : Fatma Said"
        />
        <Champ
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          placeholder="reception@oceanview.co.tz"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <Champ
          label="Mot de passe (8 caractères minimum)"
          value={motDePasse}
          onChangeText={setMotDePasse}
          placeholder="Choisissez un mot de passe"
          secureTextEntry
          autoCapitalize="none"
        />
        <Champ
          label="Téléphone WhatsApp de l'établissement"
          value={telephone}
          onChangeText={setTelephone}
          keyboardType="phone-pad"
          placeholder="+255 712 345 678"
        />
        <Champ
          label="Zone"
          value={zone}
          onChangeText={setZone}
          placeholder="Ex. : Nungwi, Paje, Stone Town…"
        />
        <Champ
          label="Adresse (optionnel)"
          value={adresse}
          onChangeText={setAdresse}
          placeholder="Ex. : Plage de Nungwi, route principale"
        />
        <EncartInfo icone="logo-whatsapp">
          Le numéro WhatsApp sert à l&apos;équipe zanziGo pour coordonner vos courses et vos
          colis.
        </EncartInfo>
        <TexteErreur>{erreur}</TexteErreur>
        <Bouton
          titre="Créer le compte partenaire"
          icone="business-outline"
          onPress={valider}
          charge={charge}
        />
      </Carte>
    </Ecran>
  );
}
