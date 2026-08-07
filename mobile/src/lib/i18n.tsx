// i18n maison de zanziGo — français / anglais / swahili, sans dépendance.
// - CHAINES : dictionnaire {cle: {fr, en, sw}} de TOUTES les chaînes visibles.
// - LangueProvider / useT() : langue active persistée dans SecureStore,
//   t(cle, params?) avec interpolation {nom}.
// - Les montants, devises et noms de lieux ne sont jamais traduits.
import * as SecureStore from 'expo-secure-store';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  formaterDate,
  type StatutColis,
  type StatutRide,
  type StatutTrajet,
  type TypeTrajet,
} from './types';

export type Langue = 'fr' | 'en' | 'sw';

export const LANGUES: { code: Langue; libelle: string }[] = [
  { code: 'fr', libelle: 'FR' },
  { code: 'en', libelle: 'EN' },
  { code: 'sw', libelle: 'SW' },
];

const CLE_LANGUE = 'zanzigo_langue';

type Traductions = { fr: string; en: string; sw: string };

const CHAINES = {
  // --- Marque / commun -----------------------------------------------------
  app_tagline: {
    fr: 'Vos trajets et vos colis à Zanzibar',
    en: 'Your rides and parcels in Zanzibar',
    sw: 'Safari zako na mizigo yako Zanzibar',
  },
  commun_reessayer: { fr: 'Réessayer', en: 'Try again', sw: 'Jaribu tena' },
  commun_annuler: { fr: 'Annuler', en: 'Cancel', sw: 'Ghairi' },
  commun_actualiser: { fr: 'Actualiser', en: 'Refresh', sw: 'Onyesha upya' },
  commun_actualiser_statut: {
    fr: 'Actualiser le statut',
    en: 'Refresh status',
    sw: 'Onyesha hali upya',
  },
  commun_contact_whatsapp: {
    fr: "Contacter l'équipe WhatsApp",
    en: 'Contact the team on WhatsApp',
    sw: 'Wasiliana na timu kwa WhatsApp',
  },
  commun_prix: { fr: 'Prix', en: 'Price', sw: 'Bei' },
  commun_telephone: { fr: 'Téléphone', en: 'Phone', sw: 'Simu' },
  commun_email: { fr: 'E-mail', en: 'Email', sw: 'Barua pepe' },
  commun_depart: { fr: 'Départ', en: 'Pickup', sw: 'Kuondoka' },
  commun_arrivee: { fr: 'Arrivée', en: 'Drop-off', sw: 'Kufika' },
  commun_zone: { fr: 'Zone', en: 'Zone', sw: 'Eneo' },
  commun_type: { fr: 'Type', en: 'Type', sw: 'Aina' },
  commun_client: { fr: 'Client', en: 'Guest', sw: 'Mteja' },
  commun_description: { fr: 'Description', en: 'Description', sw: 'Maelezo' },
  commun_devise: { fr: 'Devise', en: 'Currency', sw: 'Sarafu' },
  commun_se_deconnecter: { fr: 'Se déconnecter', en: 'Log out', sw: 'Toka' },
  commun_langue: { fr: 'Langue', en: 'Language', sw: 'Lugha' },
  commun_choisir: { fr: 'Choisir…', en: 'Choose…', sw: 'Chagua…' },
  timeline_annule: { fr: 'Annulé', en: 'Cancelled', sw: 'Imeghairiwa' },

  // --- Statuts de trajet ---------------------------------------------------
  statut_trajet_requested: { fr: 'Demandée', en: 'Requested', sw: 'Imeombwa' },
  statut_trajet_driver_confirmed: {
    fr: 'Chauffeur confirmé',
    en: 'Driver confirmed',
    sw: 'Dereva amethibitishwa',
  },
  statut_trajet_paid: { fr: 'Payée', en: 'Paid', sw: 'Imelipwa' },
  statut_trajet_in_progress: { fr: 'En cours', en: 'In progress', sw: 'Inaendelea' },
  statut_trajet_completed: { fr: 'Terminée', en: 'Completed', sw: 'Imekamilika' },
  statut_trajet_cancelled: { fr: 'Annulée', en: 'Cancelled', sw: 'Imeghairiwa' },

  // --- Statuts de colis ----------------------------------------------------
  statut_colis_created: { fr: 'Créé', en: 'Created', sw: 'Umetengenezwa' },
  statut_colis_paid: { fr: 'Payé', en: 'Paid', sw: 'Umelipwa' },
  statut_colis_picked_up: { fr: 'Ramassé', en: 'Picked up', sw: 'Umechukuliwa' },
  statut_colis_delivered: { fr: 'Livré', en: 'Delivered', sw: 'Umefikishwa' },

  // --- Statuts d'annonce (rides) -------------------------------------------
  statut_ride_open: { fr: 'Ouvert', en: 'Open', sw: 'Wazi' },
  statut_ride_closed: { fr: 'Clôturé', en: 'Closed', sw: 'Imefungwa' },
  statut_ride_cancelled: { fr: 'Annulé', en: 'Cancelled', sw: 'Imeghairiwa' },

  // --- Types de course -----------------------------------------------------
  type_trajet_private: { fr: 'Course privée', en: 'Private ride', sw: 'Safari binafsi' },
  type_trajet_shared_tourist: {
    fr: 'Navette partagée',
    en: 'Shared shuttle',
    sw: 'Safari ya pamoja',
  },
  type_trajet_shared_local: {
    fr: 'Navette locale',
    en: 'Local shuttle',
    sw: 'Safari ya wenyeji',
  },
  type_trajet_posted_return: {
    fr: 'Retour affiché',
    en: 'Posted return',
    sw: 'Safari ya kurudi',
  },

  // --- Onglets et titres d'écrans ------------------------------------------
  onglet_reserver: { fr: 'Réserver', en: 'Book', sw: 'Weka safari' },
  onglet_trajets: { fr: 'Mes trajets', en: 'My rides', sw: 'Safari zangu' },
  onglet_colis: { fr: 'Colis', en: 'Parcels', sw: 'Mizigo' },
  onglet_profil: { fr: 'Profil', en: 'Profile', sw: 'Wasifu' },
  onglet_courses: { fr: 'Mes courses', en: 'My rides', sw: 'Safari zangu' },
  onglet_annonces: { fr: 'Annonces', en: 'Listings', sw: 'Matangazo' },
  onglet_scanner: { fr: 'Scanner', en: 'Scan', sw: 'Skani' },
  titre_otp: { fr: 'Code de vérification', en: 'Verification code', sw: 'Msimbo wa uthibitisho' },
  titre_client: { fr: 'Profil client', en: 'Customer profile', sw: 'Wasifu wa mteja' },
  titre_hotel: { fr: 'Hôtel partenaire', en: 'Partner hotel', sw: 'Hoteli mshirika' },
  titre_hotel_inscription: {
    fr: 'Compte partenaire',
    en: 'Partner account',
    sw: 'Akaunti ya ushirika',
  },
  titre_pro: { fr: 'Devenir chauffeur', en: 'Become a driver', sw: 'Kuwa dereva' },
  titre_trajet: { fr: 'Trajet', en: 'Ride', sw: 'Safari' },
  titre_nouveau_colis: { fr: 'Nouveau colis', en: 'New parcel', sw: 'Mzigo mpya' },
  titre_colis: { fr: 'Colis', en: 'Parcel', sw: 'Mzigo' },
  titre_course: { fr: 'Course', en: 'Ride', sw: 'Safari' },

  // --- Accueil ---------------------------------------------------------------
  accueil_question: { fr: 'Qui êtes-vous ?', en: 'Who are you?', sw: 'Wewe ni nani?' },
  accueil_visiteur_titre: {
    fr: 'Visiteur · Touriste ou Résident',
    en: 'Visitor · Tourist or Resident',
    sw: 'Mgeni · Mtalii au Mkazi',
  },
  accueil_visiteur_soustitre: {
    fr: 'Prix en USD — Course privée {prix} · Résident vérifié −10 %',
    en: 'Prices in USD — Private ride {prix} · Verified resident −10%',
    sw: 'Bei kwa USD — Safari binafsi {prix} · Mkazi aliyethibitishwa −10%',
  },
  accueil_local_titre: {
    fr: 'Locaux · Carte tanzanienne',
    en: 'Locals · Tanzanian ID',
    sw: 'Wazawa · Kitambulisho cha NIDA',
  },
  accueil_local_soustitre: {
    fr: "Tous les trajets à {prix} — réservé aux détenteurs d'une carte d'identité tanzanienne",
    en: 'All rides at {prix} — for holders of a Tanzanian ID card',
    sw: 'Safari zote kwa {prix} — kwa wenye kitambulisho cha Taifa (NIDA)',
  },
  accueil_local_mention: {
    fr: 'Carte vérifiée par l’équipe avant la première réservation',
    en: 'ID checked by the team before your first booking',
    sw: 'Kitambulisho kitahakikiwa kabla ya safari ya kwanza',
  },
  accueil_hotel_titre: { fr: 'Hôtel partenaire', en: 'Partner hotel', sw: 'Hoteli mshirika' },
  accueil_hotel_soustitre: {
    fr: 'Réservez des taxis pour vos clients',
    en: 'Book taxis for your guests',
    sw: 'Weka teksi kwa ajili ya wageni wako',
  },
  accueil_chauffeur_titre: {
    fr: 'Chauffeur — Taxi Partner',
    en: 'Driver — Taxi Partner',
    sw: 'Dereva — Taxi Partner',
  },
  accueil_chauffeur_soustitre: {
    fr: 'Accédez à vos courses et scannez les QR',
    en: 'Access your rides and scan QR codes',
    sw: 'Fungua safari zako na skani QR',
  },
  accueil_pied: {
    fr: 'Déjà inscrit ? Choisissez votre profil : votre numéro de téléphone vous reconnaît.',
    en: 'Already registered? Pick your profile — your phone number signs you in.',
    sw: 'Umeshajisajili? Chagua wasifu wako — namba yako ya simu inakutambua.',
  },

  // --- Téléphone / OTP -------------------------------------------------------
  tel_bienvenue: { fr: 'Bienvenue', en: 'Welcome', sw: 'Karibu' },
  tel_profil_choisi: {
    fr: 'Profil choisi : {profil}',
    en: 'Selected profile: {profil}',
    sw: 'Wasifu uliochagua: {profil}',
  },
  tel_intro: {
    fr: 'Entrez votre numéro de téléphone pour recevoir votre code de connexion.',
    en: 'Enter your phone number to receive your sign-in code.',
    sw: 'Weka namba yako ya simu kupokea msimbo wa kuingia.',
  },
  tel_intro_chauffeur: {
    fr: 'Déjà Taxi Partner ? Entrez votre numéro : vous retrouvez directement votre compte. Nouveau ? Vous déposerez votre candidature juste après le code.',
    en: 'Already a Taxi Partner? Enter your number to get straight back to your account. New? You will submit your application right after the code.',
    sw: 'Tayari Taxi Partner? Weka namba yako urudi moja kwa moja kwenye akaunti yako. Mpya? Utawasilisha maombi yako mara baada ya msimbo.',
  },
  tel_indicatif: { fr: 'Indicatif', en: 'Country code', sw: 'Msimbo wa nchi' },
  tel_numero: { fr: 'Numéro de téléphone', en: 'Phone number', sw: 'Namba ya simu' },
  tel_bouton: { fr: 'Recevoir mon code', en: 'Get my code', sw: 'Pokea msimbo wangu' },
  tel_erreur_numero: {
    fr: 'Numéro invalide. Exemple : +255 712 345 678.',
    en: 'Invalid number. Example: +255 712 345 678.',
    sw: 'Namba si sahihi. Mfano: +255 712 345 678.',
  },
  tel_erreur_envoi: {
    fr: "Impossible d'envoyer le code. Réessayez.",
    en: "Couldn't send the code. Please try again.",
    sw: 'Imeshindikana kutuma msimbo. Jaribu tena.',
  },
  pilote_message: {
    fr: "Le code s'affiche à l'écran — phase de test sans SMS.",
    en: 'The code is shown on screen — test phase, no SMS.',
    sw: 'Msimbo unaonekana kwenye skrini — awamu ya majaribio bila SMS.',
  },
  otp_titre: { fr: 'Vérification', en: 'Verification', sw: 'Uthibitisho' },
  otp_intro: {
    fr: 'Saisissez le code à 6 chiffres pour le numéro {phone}.',
    en: 'Enter the 6-digit code for {phone}.',
    sw: 'Weka msimbo wa tarakimu 6 kwa namba {phone}.',
  },
  otp_pilote_titre: {
    fr: "Phase de test sans SMS — votre code s'affiche ici :",
    en: 'Test phase, no SMS — your code appears here:',
    sw: 'Awamu ya majaribio bila SMS — msimbo wako uko hapa:',
  },
  otp_pilote_astuce: {
    fr: 'Touchez pour le remplir automatiquement',
    en: 'Tap to fill it automatically',
    sw: 'Gusa ujaze moja kwa moja',
  },
  otp_bouton: { fr: 'Confirmer le code', en: 'Confirm code', sw: 'Thibitisha msimbo' },
  otp_changer_numero: { fr: 'Changer de numéro', en: 'Change number', sw: 'Badilisha namba' },
  otp_erreur_code: {
    fr: 'Le code comporte 6 chiffres.',
    en: 'The code has 6 digits.',
    sw: 'Msimbo una tarakimu 6.',
  },
  otp_erreur_invalide: {
    fr: 'Code invalide ou expiré. Réessayez.',
    en: 'Invalid or expired code. Try again.',
    sw: 'Msimbo si sahihi au umepitwa na muda. Jaribu tena.',
  },

  // --- Profil client (création) ----------------------------------------------
  client_titre: { fr: 'Votre profil client', en: 'Your customer profile', sw: 'Wasifu wako wa mteja' },
  client_numero_verifie: {
    fr: 'Numéro vérifié : {phone}',
    en: 'Verified number: {phone}',
    sw: 'Namba iliyothibitishwa: {phone}',
  },
  client_info_touriste: {
    fr: 'Compte touriste — prix en USD, actif immédiatement.',
    en: 'Tourist account — USD prices, active right away.',
    sw: 'Akaunti ya mtalii — bei kwa USD, inaanza mara moja.',
  },
  client_info_local: {
    fr: 'Compte local — tous les trajets à {prix} une fois votre carte tanzanienne validée.',
    en: 'Local account — all rides at {prix} once your Tanzanian ID is validated.',
    sw: 'Akaunti ya mzawa — safari zote kwa {prix} baada ya kitambulisho chako kuhakikiwa.',
  },
  client_nom: { fr: 'Nom complet', en: 'Full name', sw: 'Jina kamili' },
  client_email_opt: { fr: 'E-mail (optionnel)', en: 'Email (optional)', sw: 'Barua pepe (hiari)' },
  client_vous_etes: { fr: 'Vous êtes…', en: 'You are…', sw: 'Wewe ni…' },
  client_type_touriste: { fr: 'Touriste', en: 'Tourist', sw: 'Mtalii' },
  client_type_touriste_desc: {
    fr: 'Prix en USD plein tarif, compte actif immédiatement.',
    en: 'Full USD prices, account active right away.',
    sw: 'Bei kamili kwa USD, akaunti inaanza mara moja.',
  },
  client_type_resident: { fr: 'Résident', en: 'Resident', sw: 'Mkazi' },
  client_type_resident_desc: {
    fr: 'Prix en USD avec remise de 10 % après validation de vos documents de résidence (sous 48 h).',
    en: 'USD prices with a 10% discount once your residence documents are validated (within 48 h).',
    sw: 'Bei kwa USD na punguzo la 10% baada ya nyaraka zako za ukazi kuhakikiwa (ndani ya saa 48).',
  },
  client_doc_resident_titre: {
    fr: 'Documents de résidence (obligatoire)',
    en: 'Residence documents (required)',
    sw: 'Nyaraka za ukazi (lazima)',
  },
  client_doc_resident_desc: {
    fr: "Permis de résidence, visa long séjour… — photo lisible. L'équipe zanziGo valide vos documents avant d'activer la remise de 10 %.",
    en: 'Residence permit, long-stay visa… — clear photo. The zanziGo team validates your documents before activating the 10% discount.',
    sw: 'Kibali cha ukazi, viza ya muda mrefu… — picha inayosomeka. Timu ya zanziGo itahakiki nyaraka zako kabla ya kuwasha punguzo la 10%.',
  },
  client_doc_local_titre: {
    fr: "Carte d'identité tanzanienne (NIDA)",
    en: 'Tanzanian ID card (NIDA)',
    sw: 'Kitambulisho cha Taifa (NIDA)',
  },
  client_doc_local_desc: {
    fr: "Photo lisible de votre carte NIDA (obligatoire). L'équipe zanziGo la vérifie avant d'activer le tarif unique de {prix}.",
    en: 'Clear photo of your NIDA card (required). The zanziGo team checks it before activating the flat {prix} fare.',
    sw: 'Picha inayosomeka ya kitambulisho chako cha NIDA (lazima). Timu ya zanziGo itakihakiki kabla ya kuwasha bei moja ya {prix}.',
  },
  client_doc_ajoute: { fr: 'Document ajouté', en: 'Document added', sw: 'Nyaraka imeongezwa' },
  client_doc_changer: { fr: 'Changer', en: 'Change', sw: 'Badilisha' },
  client_doc_ajouter: { fr: 'Ajouter mon document', en: 'Add my document', sw: 'Ongeza nyaraka yangu' },
  client_bouton: { fr: 'Créer mon profil', en: 'Create my profile', sw: 'Tengeneza wasifu wangu' },
  client_erreur_nom: { fr: 'Indiquez votre nom complet.', en: 'Enter your full name.', sw: 'Weka jina lako kamili.' },
  client_erreur_doc_resident: {
    fr: 'Ajoutez vos documents de résidence : ils sont requis pour un compte résident.',
    en: 'Add your residence documents: they are required for a resident account.',
    sw: 'Ongeza nyaraka zako za ukazi: zinahitajika kwa akaunti ya mkazi.',
  },
  client_erreur_doc_local: {
    fr: "Ajoutez votre carte d'identité tanzanienne : elle est requise pour un compte local.",
    en: 'Add your Tanzanian ID card: it is required for a local account.',
    sw: 'Ongeza kitambulisho chako cha NIDA: kinahitajika kwa akaunti ya mzawa.',
  },
  client_erreur_photos: {
    fr: "Autorisez l'accès aux photos pour ajouter votre document.",
    en: 'Allow photo access to add your document.',
    sw: 'Ruhusu ufikiaji wa picha ili kuongeza nyaraka yako.',
  },
  client_erreur_creation: {
    fr: 'Impossible de créer le profil. Réessayez.',
    en: "Couldn't create the profile. Try again.",
    sw: 'Imeshindikana kutengeneza wasifu. Jaribu tena.',
  },

  // --- Hôtel : connexion et inscription --------------------------------------
  hotelcx_espace: { fr: 'Espace hôtels partenaires', en: 'Partner hotels area', sw: 'Eneo la hoteli washirika' },
  hotelcx_titre: { fr: 'Connexion hôtel', en: 'Hotel sign-in', sw: 'Kuingia kwa hoteli' },
  hotelcx_intro: {
    fr: 'Réservez des taxis pour vos clients et suivez vos envois de colis.',
    en: 'Book taxis for your guests and track your parcel deliveries.',
    sw: 'Weka teksi kwa wageni wako na fuatilia mizigo yako.',
  },
  hotelcx_mdp: { fr: 'Mot de passe', en: 'Password', sw: 'Nenosiri' },
  hotelcx_mdp_placeholder: { fr: 'Votre mot de passe', en: 'Your password', sw: 'Nenosiri lako' },
  hotelcx_bouton: { fr: 'Se connecter', en: 'Sign in', sw: 'Ingia' },
  hotelcx_creer: { fr: 'Créer un compte partenaire', en: 'Create a partner account', sw: 'Fungua akaunti ya ushirika' },
  hotelcx_erreur_email: { fr: 'Indiquez une adresse e-mail valide.', en: 'Enter a valid email address.', sw: 'Weka barua pepe sahihi.' },
  hotelcx_erreur_mdp: { fr: 'Indiquez votre mot de passe.', en: 'Enter your password.', sw: 'Weka nenosiri lako.' },
  hotelcx_erreur_identifiants: {
    fr: 'E-mail ou mot de passe incorrect.',
    en: 'Incorrect email or password.',
    sw: 'Barua pepe au nenosiri si sahihi.',
  },
  hotelcx_erreur_connexion: {
    fr: 'Connexion impossible. Réessayez.',
    en: "Couldn't sign in. Try again.",
    sw: 'Imeshindikana kuingia. Jaribu tena.',
  },
  hotelins_intro: {
    fr: 'Créez le compte de votre établissement pour réserver des taxis pour vos clients et envoyer leurs colis — tarifs en TZS.',
    en: 'Create your property account to book taxis for your guests and send their parcels — prices in TZS.',
    sw: 'Fungua akaunti ya hoteli yako kuweka teksi kwa wageni wako na kutuma mizigo yao — bei kwa TZS.',
  },
  hotelins_nom: { fr: "Nom de l'hôtel", en: 'Hotel name', sw: 'Jina la hoteli' },
  hotelins_contact: { fr: 'Personne de contact', en: 'Contact person', sw: 'Mtu wa mawasiliano' },
  hotelins_mdp: {
    fr: 'Mot de passe (8 caractères minimum)',
    en: 'Password (min. 8 characters)',
    sw: 'Nenosiri (angalau herufi 8)',
  },
  hotelins_mdp_placeholder: { fr: 'Choisissez un mot de passe', en: 'Choose a password', sw: 'Chagua nenosiri' },
  hotelins_whatsapp: {
    fr: "Téléphone WhatsApp de l'établissement",
    en: "Property's WhatsApp phone",
    sw: 'Namba ya WhatsApp ya hoteli',
  },
  hotelins_adresse: { fr: 'Adresse (optionnel)', en: 'Address (optional)', sw: 'Anwani (hiari)' },
  hotelins_note_whatsapp: {
    fr: "Le numéro WhatsApp sert à l'équipe zanziGo pour coordonner vos courses et vos colis.",
    en: 'The WhatsApp number lets the zanziGo team coordinate your rides and parcels.',
    sw: 'Namba ya WhatsApp inaisaidia timu ya zanziGo kuratibu safari na mizigo yako.',
  },
  hotelins_bouton: { fr: 'Créer le compte partenaire', en: 'Create partner account', sw: 'Fungua akaunti ya ushirika' },
  hotelins_erreur_nom: { fr: "Indiquez le nom de l'hôtel.", en: 'Enter the hotel name.', sw: 'Weka jina la hoteli.' },
  hotelins_erreur_contact: {
    fr: 'Indiquez le nom de la personne de contact.',
    en: 'Enter the contact person’s name.',
    sw: 'Weka jina la mtu wa mawasiliano.',
  },
  hotelins_erreur_mdp: {
    fr: 'Le mot de passe doit comporter au moins 8 caractères.',
    en: 'The password must be at least 8 characters.',
    sw: 'Nenosiri lazima liwe na angalau herufi 8.',
  },
  hotelins_erreur_tel: {
    fr: "Téléphone WhatsApp de l'établissement invalide (format +255…).",
    en: 'Invalid property WhatsApp phone (format +255…).',
    sw: 'Namba ya WhatsApp si sahihi (muundo +255…).',
  },
  hotelins_erreur_zone: {
    fr: "Indiquez la zone de l'hôtel (ex. : Nungwi, Paje, Stone Town).",
    en: 'Enter the hotel area (e.g. Nungwi, Paje, Stone Town).',
    sw: 'Weka eneo la hoteli (mf. Nungwi, Paje, Stone Town).',
  },
  hotelins_erreur_duplicate: {
    fr: 'Un compte partenaire existe déjà avec cet e-mail ou ce téléphone.',
    en: 'A partner account already exists with this email or phone.',
    sw: 'Akaunti ya ushirika tayari ipo kwa barua pepe au namba hii.',
  },
  hotelins_erreur_creation: {
    fr: 'La création du compte hôtel a échoué. Réessayez.',
    en: "Couldn't create the hotel account. Try again.",
    sw: 'Imeshindikana kufungua akaunti ya hoteli. Jaribu tena.',
  },

  // --- Candidature chauffeur ---------------------------------------------------
  pro_candidature_envoyee: { fr: 'Candidature envoyée', en: 'Application sent', sw: 'Maombi yametumwa' },
  pro_candidature_texte: {
    fr: "L'équipe zanziGo vérifie votre permis, votre véhicule et votre assurance, puis vous contactera sur WhatsApp. Une fois validé, reconnectez-vous simplement avec votre numéro de téléphone.",
    en: 'The zanziGo team checks your licence, vehicle and insurance, then contacts you on WhatsApp. Once validated, just sign back in with your phone number.',
    sw: 'Timu ya zanziGo itakagua leseni, gari na bima yako, kisha itawasiliana nawe kwa WhatsApp. Ukishathibitishwa, ingia tena kwa namba yako ya simu.',
  },
  pro_refusee: { fr: 'Candidature refusée', en: 'Application declined', sw: 'Maombi yamekataliwa' },
  pro_refusee_texte: {
    fr: "L'équipe zanziGo n'a pas pu valider votre candidature. Contactez-nous sur WhatsApp pour en savoir plus ou mettre vos documents à jour.",
    en: "The zanziGo team couldn't validate your application. Contact us on WhatsApp to learn more or update your documents.",
    sw: 'Timu ya zanziGo haikuweza kuthibitisha maombi yako. Wasiliana nasi kwa WhatsApp kupata maelezo au kusasisha nyaraka zako.',
  },
  pro_active: { fr: 'Compte chauffeur activé', en: 'Driver account active', sw: 'Akaunti ya dereva imewashwa' },
  pro_active_texte: {
    fr: 'Votre compte Taxi Partner est vérifié. Accédez à vos courses et scannez les QR.',
    en: 'Your Taxi Partner account is verified. Access your rides and scan QR codes.',
    sw: 'Akaunti yako ya Taxi Partner imethibitishwa. Fungua safari zako na skani QR.',
  },
  pro_acceder: { fr: 'Accéder à mes courses', en: 'Go to my rides', sw: 'Nenda kwenye safari zangu' },
  pro_contacter: {
    fr: "Contacter l'équipe sur WhatsApp",
    en: 'Contact the team on WhatsApp',
    sw: 'Wasiliana na timu kwa WhatsApp',
  },
  pro_changer_compte: { fr: 'Changer de compte', en: 'Switch account', sw: 'Badilisha akaunti' },
  pro_titre: { fr: 'Devenir chauffeur', en: 'Become a driver', sw: 'Kuwa dereva' },
  pro_intro: {
    fr: "Nouveau ? Déposez votre candidature Taxi Partner : l'équipe zanziGo vérifie vos documents et vous répond sous 48 h. (Déjà Taxi Partner ? Votre numéro vous connecte directement à votre compte.)",
    en: 'New? Submit your Taxi Partner application: the zanziGo team checks your documents and replies within 48 h. (Already a Taxi Partner? Your number signs you straight in.)',
    sw: 'Mpya? Wasilisha maombi yako ya Taxi Partner: timu ya zanziGo itakagua nyaraka zako na kukujibu ndani ya saa 48. (Tayari Taxi Partner? Namba yako inakuingiza moja kwa moja.)',
  },
  pro_permis: { fr: 'Numéro de permis de conduire', en: "Driver's licence number", sw: 'Namba ya leseni ya udereva' },
  pro_plaque: { fr: "Plaque d'immatriculation", en: 'Licence plate', sw: 'Namba ya usajili wa gari' },
  pro_modele: { fr: 'Modèle du véhicule (optionnel)', en: 'Vehicle model (optional)', sw: 'Aina ya gari (hiari)' },
  pro_zone: { fr: 'Zone de travail', en: 'Working area', sw: 'Eneo la kazi' },
  pro_doc_permis: {
    fr: 'Permis de conduire (photo lisible)',
    en: "Driver's licence (clear photo)",
    sw: 'Leseni ya udereva (picha inayosomeka)',
  },
  pro_doc_identite: {
    fr: "Pièce d'identité (photo lisible)",
    en: 'ID document (clear photo)',
    sw: 'Kitambulisho (picha inayosomeka)',
  },
  pro_doc_ajouter: { fr: 'Ajouter le document', en: 'Add document', sw: 'Ongeza nyaraka' },
  pro_note_docs: {
    fr: "Vos documents servent uniquement à la vérification par l'équipe zanziGo.",
    en: 'Your documents are used only for verification by the zanziGo team.',
    sw: 'Nyaraka zako zinatumika tu kwa uhakiki na timu ya zanziGo.',
  },
  pro_bouton: { fr: 'Envoyer ma candidature', en: 'Send my application', sw: 'Tuma maombi yangu' },
  pro_erreur_permis: {
    fr: 'Indiquez votre numéro de permis de conduire.',
    en: "Enter your driver's licence number.",
    sw: 'Weka namba ya leseni yako ya udereva.',
  },
  pro_erreur_plaque: {
    fr: "Indiquez la plaque d'immatriculation de votre véhicule.",
    en: 'Enter your vehicle licence plate.',
    sw: 'Weka namba ya usajili wa gari lako.',
  },
  pro_erreur_zone: {
    fr: 'Indiquez votre zone de travail (ex. : Stone Town, Nungwi).',
    en: 'Enter your working area (e.g. Stone Town, Nungwi).',
    sw: 'Weka eneo lako la kazi (mf. Stone Town, Nungwi).',
  },
  pro_erreur_docs: {
    fr: 'Ajoutez vos deux documents : permis de conduire et pièce d’identité.',
    en: 'Add both documents: driver’s licence and ID document.',
    sw: 'Ongeza nyaraka zote mbili: leseni ya udereva na kitambulisho.',
  },
  pro_erreur_envoi: {
    fr: "L'envoi de la candidature a échoué. Réessayez.",
    en: "Couldn't send the application. Try again.",
    sw: 'Imeshindikana kutuma maombi. Jaribu tena.',
  },

  // --- Réserver ---------------------------------------------------------------
  reserver_mode_hotel_info: {
    fr: 'Mode hôtel — réservez un taxi pour votre client, tarifs en TZS.',
    en: 'Hotel mode — book a taxi for your guest, prices in TZS.',
    sw: 'Hali ya hoteli — weka teksi kwa mteja wako, bei kwa TZS.',
  },
  reserver_itineraire: { fr: 'Itinéraire', en: 'Route', sw: 'Njia' },
  reserver_depart_placeholder: {
    fr: 'Ex. : aéroport de Zanzibar (ZNZ)',
    en: 'E.g. Zanzibar Airport (ZNZ)',
    sw: 'Mf. Uwanja wa ndege wa Zanzibar (ZNZ)',
  },
  reserver_arrivee_placeholder: {
    fr: 'Ex. : Nungwi, hôtel Ocean View',
    en: 'E.g. Nungwi, Ocean View hotel',
    sw: 'Mf. Nungwi, hoteli Ocean View',
  },
  reserver_mode_titre: { fr: 'Privé ou partagé ?', en: 'Private or shared?', sw: 'Binafsi au pamoja?' },
  reserver_prive: { fr: 'Privé', en: 'Private', sw: 'Binafsi' },
  reserver_prive_desc: {
    fr: 'Un véhicule rien que pour vous.',
    en: 'A vehicle just for you.',
    sw: 'Gari kwa ajili yako tu.',
  },
  reserver_partage: { fr: 'Partagé', en: 'Shared', sw: 'Pamoja' },
  reserver_partage_desc: {
    fr: 'Une place dans une navette.',
    en: 'A seat in a shuttle.',
    sw: 'Kiti kwenye safari ya pamoja.',
  },
  reserver_votre_client: { fr: 'Votre client', en: 'Your guest', sw: 'Mteja wako' },
  reserver_nom_client: { fr: 'Nom du client', en: 'Guest name', sw: 'Jina la mteja' },
  reserver_nom_client_placeholder: {
    fr: 'Ex. : M. et Mme Dupont, chambre 12',
    en: 'E.g. Mr & Mrs Smith, room 12',
    sw: 'Mf. Bw. na Bi. Juma, chumba 12',
  },
  reserver_tel_client: { fr: 'Téléphone du client', en: 'Guest phone', sw: 'Simu ya mteja' },
  reserver_programmer: {
    fr: 'Programmer (optionnel, AAAA-MM-JJ HH:MM)',
    en: 'Schedule (optional, YYYY-MM-DD HH:MM)',
    sw: 'Panga mapema (hiari, YYYY-MM-DD HH:MM)',
  },
  reserver_programmer_placeholder: {
    fr: 'Laisser vide pour partir dès que possible',
    en: 'Leave empty to leave as soon as possible',
    sw: 'Acha wazi ili kuondoka mapema iwezekanavyo',
  },
  reserver_prix_course: { fr: 'Prix de la course', en: 'Ride price', sw: 'Bei ya safari' },
  reserver_note_prix: {
    fr: 'Tarif plat selon la formule (grille zanziGo). Le prix est figé à la réservation — aucun supplément ensuite.',
    en: 'Flat fare by ride mode (zanziGo price list). The price is locked at booking — no extra charges later.',
    sw: 'Bei maalum kwa kila aina ya safari (orodha ya zanziGo). Bei inafungwa wakati wa kuweka safari — hakuna nyongeza baadaye.',
  },
  reserver_remise_activee: {
    fr: 'Remise résident de 10 % appliquée sur tous vos trajets.',
    en: 'Resident 10% discount applied to all your rides.',
    sw: 'Punguzo la 10% la mkazi limewekwa kwenye safari zako zote.',
  },
  reserver_remise_attente: {
    fr: 'Remise de 10 % activée après validation de vos documents.',
    en: '10% discount unlocked once your documents are validated.',
    sw: 'Punguzo la 10% litaanza baada ya nyaraka zako kuhakikiwa.',
  },
  reserver_local_attente_titre: {
    fr: 'Validation en cours',
    en: 'Validation in progress',
    sw: 'Uhakiki unaendelea',
  },
  reserver_local_attente_texte: {
    fr: "Votre carte d'identité tanzanienne est en cours de validation par l'équipe zanziGo. Vous pourrez réserver dès qu'elle est validée.",
    en: 'Your Tanzanian ID card is being validated by the zanziGo team. You will be able to book as soon as it is approved.',
    sw: 'Kitambulisho chako cha NIDA kinahakikiwa na timu ya zanziGo. Utaweza kuweka safari mara kitakapothibitishwa.',
  },
  reserver_bouton: { fr: 'Réserver cette course', en: 'Book this ride', sw: 'Weka safari hii' },
  reserver_bouton_hotel: { fr: 'Réserver pour ce client', en: 'Book for this guest', sw: 'Weka kwa mteja huyu' },
  reserver_erreur_profil: {
    fr: 'Créez votre profil client avant de réserver.',
    en: 'Create your customer profile before booking.',
    sw: 'Tengeneza wasifu wako wa mteja kabla ya kuweka safari.',
  },
  reserver_erreur_itineraire: {
    fr: 'Indiquez le lieu de départ et la destination.',
    en: 'Enter the pickup point and the destination.',
    sw: 'Weka mahali pa kuondoka na pa kufika.',
  },
  reserver_erreur_nom_client: {
    fr: 'Indiquez le nom du client pour cette course.',
    en: 'Enter the guest name for this ride.',
    sw: 'Weka jina la mteja kwa safari hii.',
  },
  reserver_erreur_tel_client: {
    fr: 'Téléphone du client invalide (format international +255…).',
    en: 'Invalid guest phone (international format +255…).',
    sw: 'Simu ya mteja si sahihi (muundo wa kimataifa +255…).',
  },
  reserver_erreur_date: {
    fr: 'Date programmée invalide. Format attendu : AAAA-MM-JJ HH:MM.',
    en: 'Invalid scheduled date. Expected format: YYYY-MM-DD HH:MM.',
    sw: 'Tarehe si sahihi. Muundo unaotakiwa: YYYY-MM-DD HH:MM.',
  },
  reserver_erreur_local_only: {
    fr: 'La navette locale est réservée aux locaux vérifiés (carte tanzanienne).',
    en: 'The local shuttle is reserved for verified locals (Tanzanian ID).',
    sw: 'Safari ya wenyeji ni kwa wazawa waliothibitishwa tu (kitambulisho cha NIDA).',
  },
  reserver_erreur_local_attente: {
    fr: 'Validation en cours — vous pourrez réserver une fois votre carte d’identité validée.',
    en: 'Validation in progress — you can book once your ID card is approved.',
    sw: 'Uhakiki unaendelea — utaweza kuweka safari baada ya kitambulisho chako kuthibitishwa.',
  },
  reserver_erreur: {
    fr: 'La réservation a échoué. Réessayez.',
    en: 'Booking failed. Try again.',
    sw: 'Imeshindikana kuweka safari. Jaribu tena.',
  },

  // --- Trajets partagés (section client) ---------------------------------------
  rides_titre: { fr: 'Trajets partagés à venir', en: 'Upcoming shared rides', sw: 'Safari za pamoja zijazo' },
  rides_soustitre: {
    fr: "Postés par nos chauffeurs — réservez votre place via l'équipe.",
    en: 'Posted by our drivers — book your seat via the team.',
    sw: 'Zimewekwa na madereva wetu — hifadhi kiti chako kupitia timu.',
  },
  rides_filtre: { fr: 'Filtrer par destination', en: 'Filter by destination', sw: 'Chuja kwa unakoenda' },
  rides_toutes: { fr: 'Toutes les destinations', en: 'All destinations', sw: 'Maeneo yote' },
  rides_vide: {
    fr: "Aucun trajet partagé pour l'instant — revenez plus tard.",
    en: 'No shared rides yet — check back later.',
    sw: 'Hakuna safari za pamoja kwa sasa — rudi baadaye.',
  },
  rides_vide_destination: {
    fr: "Aucun trajet partagé vers {destination} pour l'instant.",
    en: 'No shared rides to {destination} yet.',
    sw: 'Hakuna safari za pamoja kwenda {destination} kwa sasa.',
  },
  rides_place_restante: { fr: '{n} place restante', en: '{n} seat left', sw: 'Kiti {n} kimebaki' },
  rides_places_restantes: { fr: '{n} places restantes', en: '{n} seats left', sw: 'Viti {n} vimebaki' },
  rides_chauffeur_defaut: { fr: 'Chauffeur zanziGo', en: 'zanziGo driver', sw: 'Dereva wa zanziGo' },
  rides_par_place: { fr: '/ place', en: '/ seat', sw: '/ kiti' },
  rides_reserver: { fr: 'Réserver une place', en: 'Book a seat', sw: 'Hifadhi kiti' },

  // --- Mes trajets --------------------------------------------------------------
  trajets_vide_titre: { fr: "Aucun trajet pour l'instant", en: 'No rides yet', sw: 'Hakuna safari bado' },
  trajets_vide_texte: {
    fr: 'Votre première course vous attend !',
    en: 'Your first ride awaits!',
    sw: 'Safari yako ya kwanza inakusubiri!',
  },
  trajets_vide_texte_hotel: {
    fr: "Réservez un premier taxi pour l'un de vos clients !",
    en: 'Book a first taxi for one of your guests!',
    sw: 'Weka teksi ya kwanza kwa mmoja wa wageni wako!',
  },
  trajets_reserver_bouton: { fr: 'Réserver une course', en: 'Book a ride', sw: 'Weka safari' },
  trajets_payer: { fr: 'Payer maintenant', en: 'Pay now', sw: 'Lipa sasa' },
  trajets_noter: { fr: 'Touchez pour noter votre course', en: 'Tap to rate your ride', sw: 'Gusa kutoa alama ya safari' },
  trajets_erreur: {
    fr: 'Chargement impossible. Tirez pour réessayer.',
    en: "Couldn't load. Pull to retry.",
    sw: 'Imeshindikana kupakia. Vuta chini kujaribu tena.',
  },
  trajets_course_defaut: { fr: 'Course', en: 'Ride', sw: 'Safari' },

  // --- Détail trajet --------------------------------------------------------------
  trip_titre: { fr: 'Votre course', en: 'Your ride', sw: 'Safari yako' },
  trip_chargement: { fr: 'Chargement de votre course…', en: 'Loading your ride…', sw: 'Inapakia safari yako…' },
  trip_introuvable: { fr: 'Trajet introuvable.', en: 'Ride not found.', sw: 'Safari haipatikani.' },
  trip_programme_le: { fr: 'Programmé le', en: 'Scheduled for', sw: 'Imepangwa' },
  trip_prix_fige: { fr: 'Prix figé', en: 'Locked price', sw: 'Bei iliyofungwa' },
  trip_suivi: { fr: 'Suivi de la course', en: 'Ride status', sw: 'Mwenendo wa safari' },
  trip_demande_envoyee: {
    fr: "Demande envoyée — l'équipe zanziGo vous confirme un chauffeur, puis le paiement sera proposé ici.",
    en: 'Request sent — the zanziGo team confirms a driver, then payment will be offered here.',
    sw: 'Ombi limetumwa — timu ya zanziGo itathibitisha dereva, kisha malipo yataonekana hapa.',
  },
  trip_payer: { fr: 'Payer la course', en: 'Pay for the ride', sw: 'Lipia safari' },
  trip_paiement_recu: {
    fr: 'Paiement reçu — votre chauffeur scanne le QR de son véhicule au départ.',
    en: 'Payment received — your driver scans their vehicle QR at departure.',
    sw: 'Malipo yamepokelewa — dereva wako ataskani QR ya gari lake wakati wa kuondoka.',
  },
  trip_note_question: { fr: "Comment s'est passée votre course ?", en: 'How was your ride?', sw: 'Safari yako ilikuwaje?' },
  trip_note_commentaire: { fr: 'Commentaire (optionnel)', en: 'Comment (optional)', sw: 'Maoni (hiari)' },
  trip_note_placeholder: {
    fr: 'Chauffeur ponctuel, très bonne course…',
    en: 'Punctual driver, great ride…',
    sw: 'Dereva makini, safari nzuri…',
  },
  trip_note_envoyer: { fr: 'Envoyer ma note', en: 'Send my rating', sw: 'Tuma alama yangu' },
  trip_note_merci: { fr: 'Merci pour votre note !', en: 'Thanks for your rating!', sw: 'Asante kwa alama yako!' },
  trip_note_erreur: {
    fr: 'Choisissez une note de 1 à 5 étoiles.',
    en: 'Pick a rating from 1 to 5 stars.',
    sw: 'Chagua alama kati ya nyota 1 na 5.',
  },
  trip_note_envoi_erreur: {
    fr: "Impossible d'envoyer la note.",
    en: "Couldn't send the rating.",
    sw: 'Imeshindikana kutuma alama.',
  },
  trip_paiement_indisponible: {
    fr: 'Paiement indisponible pour le moment.',
    en: 'Payment unavailable right now.',
    sw: 'Malipo hayapatikani kwa sasa.',
  },
  trip_lien_indisponible: {
    fr: "Le lien de paiement n'est pas encore disponible.",
    en: 'The payment link is not available yet.',
    sw: 'Kiungo cha malipo bado hakipatikani.',
  },
  trip_confirm_dev: {
    fr: 'Simuler la confirmation (dev)',
    en: 'Simulate confirmation (dev)',
    sw: 'Iga uthibitisho (dev)',
  },
  trip_confirmation_impossible: {
    fr: 'Confirmation impossible.',
    en: 'Confirmation failed.',
    sw: 'Uthibitisho umeshindikana.',
  },

  // --- Colis (liste + création + détail) ---------------------------------------
  colis_envoyer: { fr: 'Envoyer un colis', en: 'Send a parcel', sw: 'Tuma mzigo' },
  colis_vide_titre: { fr: "Aucun colis pour l'instant", en: 'No parcels yet', sw: 'Hakuna mizigo bado' },
  colis_vide_texte: {
    fr: "Documents, cadeaux, courses… un chauffeur zanziGo livre votre premier colis partout sur l'île !",
    en: 'Documents, gifts, shopping… a zanziGo driver delivers your first parcel anywhere on the island!',
    sw: 'Nyaraka, zawadi, manunuzi… dereva wa zanziGo atafikisha mzigo wako wa kwanza popote kisiwani!',
  },
  colis_vide_texte_hotel: {
    fr: "Envoyez le premier colis d'un de vos clients : un chauffeur zanziGo le livre partout sur l'île.",
    en: 'Send a first parcel for one of your guests: a zanziGo driver delivers it anywhere on the island.',
    sw: 'Tuma mzigo wa kwanza wa mgeni wako: dereva wa zanziGo ataufikisha popote kisiwani.',
  },
  colis_defaut: { fr: 'Colis', en: 'Parcel', sw: 'Mzigo' },
  ncolis_intro: {
    fr: 'Un chauffeur zanziGo récupère votre colis et le livre contre scan du QR code.',
    en: 'A zanziGo driver picks up your parcel and delivers it against a QR code scan.',
    sw: 'Dereva wa zanziGo atachukua mzigo wako na kuufikisha kwa kuskani QR.',
  },
  ncolis_section_trajet: { fr: 'Trajet du colis', en: 'Parcel route', sw: 'Njia ya mzigo' },
  ncolis_collecte: { fr: 'Lieu de collecte', en: 'Pickup location', sw: 'Mahali pa kuchukua' },
  ncolis_collecte_placeholder: {
    fr: 'Ex. : Stone Town, Kenyatta Road',
    en: 'E.g. Stone Town, Kenyatta Road',
    sw: 'Mf. Stone Town, Kenyatta Road',
  },
  ncolis_livraison: { fr: 'Lieu de livraison', en: 'Delivery location', sw: 'Mahali pa kufikisha' },
  ncolis_livraison_placeholder: {
    fr: 'Ex. : Paje, guesthouse Baraka',
    en: 'E.g. Paje, Baraka guesthouse',
    sw: 'Mf. Paje, nyumba ya wageni Baraka',
  },
  ncolis_section_destinataire: { fr: 'Destinataire', en: 'Recipient', sw: 'Mpokeaji' },
  ncolis_nom_dest: { fr: 'Nom du destinataire', en: 'Recipient name', sw: 'Jina la mpokeaji' },
  ncolis_nom_dest_placeholder: { fr: 'Ex. : Juma Ali', en: 'E.g. Juma Ali', sw: 'Mf. Juma Ali' },
  ncolis_tel_dest: { fr: 'Téléphone du destinataire', en: 'Recipient phone', sw: 'Simu ya mpokeaji' },
  ncolis_description_opt: { fr: 'Description (optionnel)', en: 'Description (optional)', sw: 'Maelezo (hiari)' },
  ncolis_description_placeholder: {
    fr: 'Ex. : documents, fragile…',
    en: 'E.g. documents, fragile…',
    sw: 'Mf. nyaraka, dhaifu…',
  },
  ncolis_prix_envoi: { fr: "Prix de l'envoi", en: 'Delivery price', sw: 'Bei ya kutuma' },
  ncolis_note_prix: {
    fr: "Tarif plat zanziGo, quel que soit le trajet sur l'île. Le prix officiel est figé à la création de l'envoi.",
    en: 'Flat zanziGo fare, wherever it goes on the island. The official price is locked when the delivery is created.',
    sw: 'Bei moja ya zanziGo popote kisiwani. Bei rasmi inafungwa wakati wa kuanzisha utumaji.',
  },
  ncolis_bouton: { fr: "Créer l'envoi", en: 'Create delivery', sw: 'Anzisha utumaji' },
  ncolis_erreur_profil: {
    fr: "Créez votre profil avant d'envoyer un colis.",
    en: 'Create your profile before sending a parcel.',
    sw: 'Tengeneza wasifu wako kabla ya kutuma mzigo.',
  },
  ncolis_erreur_champs: {
    fr: 'Renseignez la collecte, la livraison et le nom du destinataire.',
    en: 'Fill in pickup, delivery and the recipient name.',
    sw: 'Jaza mahali pa kuchukua, pa kufikisha na jina la mpokeaji.',
  },
  ncolis_erreur_tel: {
    fr: 'Téléphone du destinataire invalide (format international +255…).',
    en: 'Invalid recipient phone (international format +255…).',
    sw: 'Simu ya mpokeaji si sahihi (muundo wa kimataifa +255…).',
  },
  ncolis_erreur_creation: {
    fr: 'La création du colis a échoué. Réessayez.',
    en: "Couldn't create the parcel. Try again.",
    sw: 'Imeshindikana kuanzisha mzigo. Jaribu tena.',
  },
  dcolis_titre: { fr: 'Votre colis', en: 'Your parcel', sw: 'Mzigo wako' },
  dcolis_chargement: { fr: 'Chargement de votre colis…', en: 'Loading your parcel…', sw: 'Inapakia mzigo wako…' },
  dcolis_introuvable: { fr: 'Colis introuvable.', en: 'Parcel not found.', sw: 'Mzigo haupatikani.' },
  dcolis_qr_indisponible: { fr: 'QR code indisponible.', en: 'QR code unavailable.', sw: 'QR haipatikani.' },
  dcolis_presenter: { fr: 'Présentez ce QR au chauffeur', en: 'Show this QR to the driver', sw: 'Onyesha QR hii kwa dereva' },
  dcolis_consigne: {
    fr: 'Il le scanne au ramassage puis à la livraison.',
    en: 'They scan it at pickup and again at delivery.',
    sw: 'Ataiskani wakati wa kuchukua na wa kufikisha.',
  },
  dcolis_collecte: { fr: 'Collecte', en: 'Pickup', sw: 'Kuchukua' },
  dcolis_livraison: { fr: 'Livraison', en: 'Delivery', sw: 'Kufikisha' },
  dcolis_destinataire: { fr: 'Destinataire', en: 'Recipient', sw: 'Mpokeaji' },
  dcolis_suivi: { fr: 'Suivi du colis', en: 'Parcel status', sw: 'Mwenendo wa mzigo' },
  dcolis_payer: { fr: "Payer l'envoi", en: 'Pay for delivery', sw: 'Lipia utumaji' },
  dcolis_paiement_recu: {
    fr: 'Paiement reçu — un chauffeur va ramasser votre colis.',
    en: 'Payment received — a driver will pick up your parcel.',
    sw: 'Malipo yamepokelewa — dereva atakuja kuchukua mzigo wako.',
  },

  // --- Profil -------------------------------------------------------------------
  profil_compte_defaut: { fr: 'Compte zanziGo', en: 'zanziGo account', sw: 'Akaunti ya zanziGo' },
  profil_badge_verifie: { fr: 'Compte vérifié ✓', en: 'Verified account ✓', sw: 'Akaunti imethibitishwa ✓' },
  profil_badge_resident_ok: {
    fr: 'Résident vérifié −10 % ✓',
    en: 'Verified resident −10% ✓',
    sw: 'Mkazi amethibitishwa −10% ✓',
  },
  profil_badge_resident_attente: {
    fr: 'Documents en cours de validation',
    en: 'Documents under review',
    sw: 'Nyaraka zinahakikiwa',
  },
  profil_badge_local_ok: {
    fr: 'Carte tanzanienne vérifiée ✓',
    en: 'Tanzanian ID verified ✓',
    sw: 'Kitambulisho kimethibitishwa ✓',
  },
  profil_badge_local_attente: { fr: 'Validation en cours', en: 'Validation in progress', sw: 'Uhakiki unaendelea' },
  profil_badge_refuse: { fr: 'Vérification refusée', en: 'Verification declined', sw: 'Uthibitisho umekataliwa' },
  profil_badge_hotel: { fr: 'Hôtel partenaire', en: 'Partner hotel', sw: 'Hoteli mshirika' },
  profil_info_resident_attente: {
    fr: "Compte résident en attente : l'équipe zanziGo vérifie vos documents de résidence. La remise de 10 % sera activée une fois le compte vérifié.",
    en: 'Resident account pending: the zanziGo team is checking your residence documents. The 10% discount will be activated once verified.',
    sw: 'Akaunti ya mkazi inasubiri: timu ya zanziGo inakagua nyaraka zako za ukazi. Punguzo la 10% litaanza baada ya kuthibitishwa.',
  },
  profil_info_local_attente: {
    fr: "Compte local en attente : l'équipe zanziGo vérifie votre carte d'identité tanzanienne. Vous pourrez réserver dès la validation.",
    en: 'Local account pending: the zanziGo team is checking your Tanzanian ID card. You can book as soon as it is validated.',
    sw: 'Akaunti ya mzawa inasubiri: timu ya zanziGo inakagua kitambulisho chako cha NIDA. Utaweza kuweka safari mara baada ya uthibitisho.',
  },
  profil_info_refuse: {
    fr: "Votre document a été refusé par l'équipe. Contactez-nous sur WhatsApp pour le mettre à jour.",
    en: 'Your document was declined by the team. Contact us on WhatsApp to update it.',
    sw: 'Nyaraka yako imekataliwa na timu. Wasiliana nasi kwa WhatsApp kuisasisha.',
  },
  profil_type_compte: { fr: 'Type de compte', en: 'Account type', sw: 'Aina ya akaunti' },
  profil_type_local: { fr: 'Local', en: 'Local', sw: 'Mzawa' },
  profil_contact: { fr: 'Contact', en: 'Contact', sw: 'Mawasiliano' },
  profil_actualiser: { fr: 'Actualiser mon profil', en: 'Refresh my profile', sw: 'Onyesha upya wasifu wangu' },

  // --- Mode chauffeur : courses ---------------------------------------------------
  courses_info: {
    fr: "L'équipe zanziGo vous envoie vos courses par WhatsApp — entrez la référence ci-dessous ou scannez.",
    en: 'The zanziGo team sends your rides on WhatsApp — enter the reference below or scan.',
    sw: 'Timu ya zanziGo inakutumia safari zako kwa WhatsApp — weka kumbukumbu hapa chini au skani.',
  },
  courses_ouvrir_titre: { fr: 'Ouvrir une course', en: 'Open a ride', sw: 'Fungua safari' },
  courses_reference: { fr: 'Référence de course', en: 'Ride reference', sw: 'Kumbukumbu ya safari' },
  courses_reference_placeholder: {
    fr: 'Collez la référence ou le lien reçu',
    en: 'Paste the reference or the link you received',
    sw: 'Bandika kumbukumbu au kiungo ulichopokea',
  },
  courses_ouvrir_bouton: { fr: 'Ouvrir la course', en: 'Open the ride', sw: 'Fungua safari' },
  courses_scanner_bouton: { fr: 'Ouvrir le scanner', en: 'Open the scanner', sw: 'Fungua skana' },
  courses_recentes: { fr: 'Courses récentes', en: 'Recent rides', sw: 'Safari za hivi karibuni' },
  courses_vide_titre: { fr: 'Aucune course récente', en: 'No recent rides', sw: 'Hakuna safari za hivi karibuni' },
  courses_vide_texte: {
    fr: 'Les courses ouvertes sur ce téléphone apparaîtront ici.',
    en: 'Rides opened on this phone will appear here.',
    sw: 'Safari zilizofunguliwa kwenye simu hii zitaonekana hapa.',
  },
  courses_erreur_reference: {
    fr: 'Référence de course invalide (collez la référence ou le lien WhatsApp reçu).',
    en: 'Invalid ride reference (paste the reference or the WhatsApp link you received).',
    sw: 'Kumbukumbu si sahihi (bandika kumbukumbu au kiungo cha WhatsApp ulichopokea).',
  },
  courses_erreur_introuvable: {
    fr: 'Course introuvable ou non assignée.',
    en: 'Ride not found or not assigned to you.',
    sw: 'Safari haipatikani au haujapangiwa.',
  },

  // --- Mode chauffeur : détail course ----------------------------------------------
  course_chargement: { fr: 'Chargement de la course…', en: 'Loading the ride…', sw: 'Inapakia safari…' },
  course_progression: { fr: 'Progression', en: 'Progress', sw: 'Maendeleo' },
  course_scanner_demarrer: {
    fr: 'Scanner le QR véhicule — démarrer',
    en: 'Scan vehicle QR — start',
    sw: 'Skani QR ya gari — anza',
  },
  course_scanner_terminer: {
    fr: 'Scanner le QR véhicule — terminer',
    en: 'Scan vehicle QR — finish',
    sw: 'Skani QR ya gari — maliza',
  },
  course_mon_qr: { fr: 'Utiliser mon QR véhicule', en: 'Use my vehicle QR', sw: 'Tumia QR ya gari langu' },
  course_demandee: {
    fr: "Course demandée — pas encore confirmée par l'équipe.",
    en: 'Ride requested — not confirmed by the team yet.',
    sw: 'Safari imeombwa — bado haijathibitishwa na timu.',
  },
  course_attente_paiement: {
    fr: 'En attente du paiement du client. Le départ pourra être scanné une fois la course payée.',
    en: 'Waiting for the customer’s payment. Departure can be scanned once the ride is paid.',
    sw: 'Inasubiri malipo ya mteja. Kuondoka kutaskaniwa baada ya safari kulipiwa.',
  },
  course_erreur_qr: {
    fr: 'Ce QR ne correspond pas au véhicule assigné à cette course.',
    en: 'This QR does not match the vehicle assigned to this ride.',
    sw: 'QR hii hailingani na gari lililopangwa kwa safari hii.',
  },
  course_erreur_action: {
    fr: 'Action refusée pour cette course.',
    en: 'Action refused for this ride.',
    sw: 'Kitendo kimekataliwa kwa safari hii.',
  },

  // --- Mode chauffeur : annonces (rides) ---------------------------------------------
  annonces_attente: {
    fr: "La publication de trajets partagés sera disponible une fois votre compte chauffeur validé par l'équipe.",
    en: 'Posting shared rides becomes available once your driver account is validated by the team.',
    sw: 'Kutangaza safari za pamoja kutapatikana baada ya akaunti yako ya dereva kuthibitishwa na timu.',
  },
  annonces_proposer: { fr: 'Proposer un trajet', en: 'Post a ride', sw: 'Tangaza safari' },
  annonces_intro: {
    fr: "Publiez un trajet partagé : les clients réservent leur place via l'équipe zanziGo.",
    en: 'Post a shared ride: customers book their seats via the zanziGo team.',
    sw: 'Tangaza safari ya pamoja: wateja watahifadhi viti kupitia timu ya zanziGo.',
  },
  annonces_origine: { fr: 'Origine (hub de départ)', en: 'Origin (departure hub)', sw: 'Kuanzia (kituo cha kuondoka)' },
  annonces_origine_placeholder: {
    fr: 'Choisir le hub de départ…',
    en: 'Choose the departure hub…',
    sw: 'Chagua kituo cha kuondoka…',
  },
  annonces_destination: { fr: 'Destination', en: 'Destination', sw: 'Unakoenda' },
  annonces_destination_placeholder: {
    fr: "Choisir la ville d'arrivée…",
    en: 'Choose the destination…',
    sw: 'Chagua mji wa kufika…',
  },
  annonces_depart_champ: {
    fr: 'Départ (AAAA-MM-JJ HH:MM)',
    en: 'Departure (YYYY-MM-DD HH:MM)',
    sw: 'Kuondoka (YYYY-MM-DD HH:MM)',
  },
  annonces_places: { fr: 'Places (1 à {max})', en: 'Seats (1 to {max})', sw: 'Viti (1 hadi {max})' },
  annonces_prix_place: { fr: 'Prix par place (TZS)', en: 'Price per seat (TZS)', sw: 'Bei kwa kiti (TZS)' },
  annonces_notes: { fr: 'Notes (optionnel)', en: 'Notes (optional)', sw: 'Maelezo (hiari)' },
  annonces_notes_placeholder: {
    fr: 'Ex. : départ devant le marché, bagages légers',
    en: 'E.g. departure by the market, light luggage',
    sw: 'Mf. kuondoka mbele ya soko, mizigo midogo',
  },
  annonces_publie: {
    fr: 'Trajet publié ! Les clients peuvent maintenant réserver une place.',
    en: 'Ride posted! Customers can now book a seat.',
    sw: 'Safari imetangazwa! Wateja sasa wanaweza kuhifadhi kiti.',
  },
  annonces_publier: { fr: 'Publier le trajet', en: 'Post the ride', sw: 'Tangaza safari' },
  annonces_mes_trajets: { fr: 'Mes trajets publiés', en: 'My posted rides', sw: 'Safari zangu zilizotangazwa' },
  annonces_vide_titre: { fr: 'Aucun trajet publié', en: 'No posted rides', sw: 'Hakuna safari zilizotangazwa' },
  annonces_vide_texte: {
    fr: 'Vos trajets partagés apparaîtront ici avec leurs places restantes.',
    en: 'Your shared rides will appear here with their remaining seats.',
    sw: 'Safari zako za pamoja zitaonekana hapa pamoja na viti vilivyobaki.',
  },
  annonces_cloturer: { fr: 'Clôturer', en: 'Close', sw: 'Funga' },
  annonces_erreur_lieux: {
    fr: 'Choisissez le hub de départ et la ville de destination.',
    en: 'Choose the departure hub and the destination town.',
    sw: 'Chagua kituo cha kuondoka na mji wa kufika.',
  },
  annonces_erreur_date: {
    fr: 'Date de départ invalide. Format attendu : AAAA-MM-JJ HH:MM.',
    en: 'Invalid departure date. Expected format: YYYY-MM-DD HH:MM.',
    sw: 'Tarehe ya kuondoka si sahihi. Muundo: YYYY-MM-DD HH:MM.',
  },
  annonces_erreur_futur: {
    fr: "L'heure de départ doit être dans le futur.",
    en: 'The departure time must be in the future.',
    sw: 'Muda wa kuondoka lazima uwe wa baadaye.',
  },
  annonces_erreur_places: {
    fr: 'Le nombre de places doit être compris entre 1 et {max}.',
    en: 'The number of seats must be between 1 and {max}.',
    sw: 'Idadi ya viti lazima iwe kati ya 1 na {max}.',
  },
  annonces_erreur_prix: {
    fr: 'Indiquez le prix par place en TZS (ex. : 8000).',
    en: 'Enter the price per seat in TZS (e.g. 8000).',
    sw: 'Weka bei kwa kiti kwa TZS (mf. 8000).',
  },
  annonces_erreur_non_verifie: {
    fr: "Votre compte chauffeur est en attente de validation par l'équipe.",
    en: 'Your driver account is awaiting validation by the team.',
    sw: 'Akaunti yako ya dereva inasubiri uthibitisho wa timu.',
  },
  annonces_erreur_publication: {
    fr: 'La publication du trajet a échoué.',
    en: "Couldn't post the ride.",
    sw: 'Imeshindikana kutangaza safari.',
  },
  annonces_erreur_chargement: {
    fr: 'Chargement des annonces impossible.',
    en: "Couldn't load your listings.",
    sw: 'Imeshindikana kupakia matangazo.',
  },
  annonces_erreur_places_maj: {
    fr: 'Ajustement des places impossible.',
    en: "Couldn't adjust the seats.",
    sw: 'Imeshindikana kubadilisha viti.',
  },
  annonces_erreur_statut: {
    fr: 'Mise à jour du trajet impossible.',
    en: "Couldn't update the ride.",
    sw: 'Imeshindikana kusasisha safari.',
  },

  // --- Scanner -------------------------------------------------------------------
  scanner_preparation: { fr: 'Préparation de la caméra…', en: 'Preparing the camera…', sw: 'Inaandaa kamera…' },
  scanner_camera_requise: { fr: 'Caméra requise', en: 'Camera required', sw: 'Kamera inahitajika' },
  scanner_camera_texte: {
    fr: "Le scan des QR codes (véhicule et colis) nécessite l'accès à la caméra.",
    en: 'Scanning QR codes (vehicle and parcels) requires camera access.',
    sw: 'Kuskani QR (gari na mizigo) kunahitaji ruhusa ya kamera.',
  },
  scanner_autoriser: { fr: 'Autoriser la caméra', en: 'Allow camera', sw: 'Ruhusu kamera' },
  scanner_demarrer: {
    fr: 'Scannez le QR du véhicule pour démarrer la course',
    en: 'Scan the vehicle QR to start the ride',
    sw: 'Skani QR ya gari kuanza safari',
  },
  scanner_terminer: {
    fr: 'Scannez le QR du véhicule pour terminer la course',
    en: 'Scan the vehicle QR to finish the ride',
    sw: 'Skani QR ya gari kumaliza safari',
  },
  scanner_colis_invite: { fr: 'Scannez un QR colis (PKG-…)', en: 'Scan a parcel QR (PKG-…)', sw: 'Skani QR ya mzigo (PKG-…)' },
  scanner_aide_vehicule: {
    fr: 'Le QR est affiché à bord du véhicule.',
    en: 'The QR is displayed inside the vehicle.',
    sw: 'QR imebandikwa ndani ya gari.',
  },
  scanner_aide_colis: {
    fr: 'Placez le QR du colis dans le cadre.',
    en: 'Place the parcel QR inside the frame.',
    sw: 'Weka QR ya mzigo ndani ya fremu.',
  },
  scanner_course_demarree: { fr: 'Course démarrée. Bonne route !', en: 'Ride started. Safe travels!', sw: 'Safari imeanza. Safari njema!' },
  scanner_course_terminee: { fr: 'Course terminée. Merci !', en: 'Ride completed. Thank you!', sw: 'Safari imekamilika. Asante!' },
  scanner_ramasser: {
    fr: 'Ramasser le colis (photo de preuve)',
    en: 'Pick up the parcel (proof photo)',
    sw: 'Chukua mzigo (picha ya uthibitisho)',
  },
  scanner_livrer: {
    fr: 'Livrer le colis (photo de preuve)',
    en: 'Deliver the parcel (proof photo)',
    sw: 'Fikisha mzigo (picha ya uthibitisho)',
  },
  scanner_colis_ramasse: {
    fr: 'Colis ramassé, photo enregistrée.',
    en: 'Parcel picked up, photo saved.',
    sw: 'Mzigo umechukuliwa, picha imehifadhiwa.',
  },
  scanner_colis_livre: {
    fr: 'Colis livré, photo enregistrée.',
    en: 'Parcel delivered, photo saved.',
    sw: 'Mzigo umefikishwa, picha imehifadhiwa.',
  },
  scanner_colis_non_paye: {
    fr: "Colis pas encore payé par l'expéditeur — le ramassage sera possible après paiement.",
    en: 'Parcel not paid by the sender yet — pickup becomes possible after payment.',
    sw: 'Mzigo bado haujalipiwa na mtumaji — utachukuliwa baada ya malipo.',
  },
  scanner_colis_livre_deja: {
    fr: 'Aucune action possible sur ce colis (déjà livré).',
    en: 'No action possible on this parcel (already delivered).',
    sw: 'Hakuna kitendo kinachowezekana (mzigo umeshafikishwa).',
  },
  scanner_autre: { fr: 'Scanner un autre QR', en: 'Scan another QR', sw: 'Skani QR nyingine' },
  scanner_qr_inconnu: {
    fr: 'QR non reconnu. Attendu : QR véhicule (depuis une course) ou QR colis PKG-…',
    en: 'QR not recognised. Expected: vehicle QR (from a ride) or parcel QR PKG-…',
    sw: 'QR haijatambuliwa. Inatakiwa: QR ya gari (kutoka safari) au QR ya mzigo PKG-…',
  },
  scanner_erreur_photo: {
    fr: "Autorisez l'appareil photo pour la photo de preuve.",
    en: 'Allow the camera for the proof photo.',
    sw: 'Ruhusu kamera kwa picha ya uthibitisho.',
  },
  scanner_erreur_colis: { fr: 'Colis introuvable pour ce QR.', en: 'No parcel found for this QR.', sw: 'Hakuna mzigo kwa QR hii.' },
  scanner_erreur_operation: {
    fr: "L'opération sur le colis a échoué.",
    en: 'The parcel operation failed.',
    sw: 'Kitendo kwenye mzigo kimeshindikana.',
  },

  // --- Compte chauffeur -------------------------------------------------------------
  compte_badge_verifie: { fr: 'Chauffeur vérifié ✓', en: 'Verified driver ✓', sw: 'Dereva amethibitishwa ✓' },
  compte_badge_attente: { fr: 'En attente de validation', en: 'Awaiting validation', sw: 'Inasubiri uthibitisho' },
  compte_badge_refuse: { fr: 'Candidature refusée', en: 'Application declined', sw: 'Maombi yamekataliwa' },
  compte_avis: { fr: '★ {note} ({n} avis)', en: '★ {note} ({n} reviews)', sw: '★ {note} (maoni {n})' },
  compte_qr_texte: {
    fr: "QR de votre véhicule — à afficher à bord. Il confirme le départ et l'arrivée de chaque course.",
    en: 'Your vehicle QR — display it on board. It confirms the start and end of every ride.',
    sw: 'QR ya gari lako — ibandike ndani ya gari. Inathibitisha mwanzo na mwisho wa kila safari.',
  },
  compte_vehicule: { fr: 'Véhicule', en: 'Vehicle', sw: 'Gari' },
  compte_plaque: { fr: 'Plaque', en: 'Plate', sw: 'Namba ya gari' },
  compte_permis: { fr: 'Permis', en: 'Licence', sw: 'Leseni' },

  // --- Dates relatives ---------------------------------------------------------------
  date_instant: { fr: "à l'instant", en: 'just now', sw: 'sasa hivi' },
  date_bientot: { fr: 'dans un instant', en: 'in a moment', sw: 'baada ya muda mfupi' },
  date_min_passe: { fr: 'il y a {n} min', en: '{n} min ago', sw: 'dakika {n} zilizopita' },
  date_min_futur: { fr: 'dans {n} min', en: 'in {n} min', sw: 'baada ya dakika {n}' },
  date_h_passe: { fr: 'il y a {n} h', en: '{n} h ago', sw: 'saa {n} zilizopita' },
  date_h_futur: { fr: 'dans {n} h', en: 'in {n} h', sw: 'baada ya saa {n}' },
  date_hier: { fr: 'hier', en: 'yesterday', sw: 'jana' },
  date_demain: { fr: 'demain', en: 'tomorrow', sw: 'kesho' },
  date_jours_passe: { fr: 'il y a {n} jours', en: '{n} days ago', sw: 'siku {n} zilizopita' },
  date_jours_futur: { fr: 'dans {n} jours', en: 'in {n} days', sw: 'baada ya siku {n}' },
} satisfies Record<string, Traductions>;

export type CleChaine = keyof typeof CHAINES;

/** Signature de la fonction de traduction t(cle, params?). */
export type FonctionT = (cle: CleChaine, params?: Record<string, string | number>) => string;

function traduire(
  cle: CleChaine,
  langue: Langue,
  params?: Record<string, string | number>
): string {
  const entree = CHAINES[cle] as Traductions | undefined;
  let texte = entree?.[langue] ?? entree?.fr ?? String(cle);
  if (params) {
    for (const [nom, valeur] of Object.entries(params)) {
      texte = texte.split(`{${nom}}`).join(String(valeur));
    }
  }
  return texte;
}

interface ContexteLangue {
  langue: Langue;
  changerLangue: (langue: Langue) => void;
  t: FonctionT;
}

const LangueContext = createContext<ContexteLangue | null>(null);

export function LangueProvider({ children }: { children: React.ReactNode }) {
  const [langue, setLangue] = useState<Langue>('fr');

  // Restauration de la langue choisie au démarrage (défaut : français).
  useEffect(() => {
    (async () => {
      try {
        const memorisee = await SecureStore.getItemAsync(CLE_LANGUE);
        if (memorisee === 'fr' || memorisee === 'en' || memorisee === 'sw') {
          setLangue(memorisee);
        }
      } catch {
        // silencieux : on reste en français
      }
    })();
  }, []);

  const changerLangue = useCallback((nouvelle: Langue) => {
    setLangue(nouvelle);
    SecureStore.setItemAsync(CLE_LANGUE, nouvelle).catch(() => {});
  }, []);

  const t = useCallback<FonctionT>(
    (cle, params) => traduire(cle, langue, params),
    [langue]
  );

  const valeur = useMemo(() => ({ langue, changerLangue, t }), [langue, changerLangue, t]);

  return <LangueContext.Provider value={valeur}>{children}</LangueContext.Provider>;
}

/** Hook principal : { t, langue, changerLangue }. */
export function useT(): ContexteLangue {
  const contexte = useContext(LangueContext);
  if (!contexte) {
    throw new Error("useT doit être utilisé à l'intérieur de <LangueProvider>.");
  }
  return contexte;
}

// ---------------------------------------------------------------------------
// Libellés traduits des statuts et types (remplacent les Records français).
// ---------------------------------------------------------------------------

export function libelleStatutTrajet(statut: StatutTrajet | undefined, t: FonctionT): string {
  if (!statut) return '—';
  return t(`statut_trajet_${statut}` as CleChaine);
}

export function libelleStatutColis(statut: StatutColis | undefined, t: FonctionT): string {
  if (!statut) return '—';
  return t(`statut_colis_${statut}` as CleChaine);
}

export function libelleStatutRide(statut: StatutRide | undefined, t: FonctionT): string {
  if (!statut) return '—';
  return t(`statut_ride_${statut}` as CleChaine);
}

export function libelleTypeTrajet(type: TypeTrajet | undefined, t: FonctionT): string {
  if (!type) return '';
  return t(`type_trajet_${type}` as CleChaine);
}

/**
 * Date relative traduite (« il y a 5 min », '5 min ago', 'dakika 5 zilizopita'),
 * date courte au-delà d'une semaine, '' si absente/invalide.
 */
export function formaterDateRelativeI18n(iso: unknown, t: FonctionT): string {
  if (typeof iso !== 'string' || !iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const ecartMs = Date.now() - date.getTime();
  const futur = ecartMs < 0;
  const minutes = Math.round(Math.abs(ecartMs) / 60000);
  const heures = Math.round(minutes / 60);
  const jours = Math.round(heures / 24);
  if (minutes < 1) return t(futur ? 'date_bientot' : 'date_instant');
  if (minutes < 60) return t(futur ? 'date_min_futur' : 'date_min_passe', { n: minutes });
  if (heures < 24) return t(futur ? 'date_h_futur' : 'date_h_passe', { n: heures });
  if (jours === 1) return t(futur ? 'date_demain' : 'date_hier');
  if (jours < 7) return t(futur ? 'date_jours_futur' : 'date_jours_passe', { n: jours });
  return formaterDate(iso);
}
