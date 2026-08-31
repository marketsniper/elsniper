// i18n maison de zanziGo — français / anglais / swahili, sans dépendance.
// - CHAINES : dictionnaire {cle: {fr, en, sw}} de TOUTES les chaînes visibles.
// - LangueProvider / useT() : langue active persistée localement,
//   t(cle, params?) avec interpolation {nom}.
// - Les montants, devises et noms de lieux ne sont jamais traduits.
import { ecrireStockage, lireStockage } from './stockage';
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
  type TailleColis,
  type TypeTrajet,
} from './types';

export type Langue = 'fr' | 'en' | 'sw' | 'it' | 'de';

export const LANGUES: { code: Langue; libelle: string }[] = [
  { code: 'fr', libelle: 'FR' },
  { code: 'en', libelle: 'EN' },
  { code: 'it', libelle: 'IT' },
  { code: 'de', libelle: 'DE' },
  { code: 'sw', libelle: 'SW' },
];

const CLE_LANGUE = 'zanzigo_langue';

// L'italien et l'allemand sont les deux grosses clientèles européennes de
// Zanzibar après les francophones et les anglophones. Ils sont optionnels au
// niveau du type : une chaîne non encore traduite retombe sur l'anglais
// (voir traduire()), jamais sur une clé brute à l'écran.
type Traductions = {
  fr: string;
  en: string;
  sw: string;
  it?: string;
  de?: string;
};

const CHAINES = {
  // --- Marque / commun -----------------------------------------------------
  app_tagline: {
    fr: 'Vos trajets et vos colis à Zanzibar',
    en: 'Your rides and parcels in Zanzibar',
    sw: 'Safari zako na mizigo yako Zanzibar',
    it: 'I tuoi trasferimenti e i tuoi pacchi a Zanzibar',
    de: 'Ihre Fahrten und Pakete auf Sansibar',
  },
  commun_reessayer: { fr: 'Réessayer', en: 'Try again', sw: 'Jaribu tena' , it: 'Riprova', de: 'Erneut versuchen' },
  commun_annuler: { fr: 'Annuler', en: 'Cancel', sw: 'Ghairi' , it: 'Annulla', de: 'Abbrechen' },
  commun_mauvais_numero: {
    fr: 'Mauvais numéro ? Recommencer avec un autre',
    en: 'Wrong number? Start over with another',
    sw: 'Namba si sahihi? Anza upya na nyingine',
    it: 'Numero sbagliato? Ricomincia con un altro',
    de: 'Falsche Nummer? Mit einer anderen neu beginnen',
  },
  commun_actualiser: { fr: 'Actualiser', en: 'Refresh', sw: 'Onyesha upya' , it: 'Aggiorna', de: 'Aktualisieren' },
  commun_actualiser_statut: {
    fr: 'Actualiser le statut',
    en: 'Refresh status',
    sw: 'Onyesha hali upya',
    it: 'Aggiorna lo stato',
    de: 'Status aktualisieren',
  },
  commun_contact_whatsapp: {
    fr: "Contacter l'équipe WhatsApp",
    en: 'Contact the team on WhatsApp',
    sw: 'Wasiliana na timu kwa WhatsApp',
    it: 'Contatta il team su WhatsApp',
    de: 'Team über WhatsApp kontaktieren',
  },
  commun_prix: { fr: 'Prix', en: 'Price', sw: 'Bei' , it: 'Prezzo', de: 'Preis' },
  commun_telephone: { fr: 'Téléphone', en: 'Phone', sw: 'Simu' , it: 'Telefono', de: 'Telefon' },
  commun_email: { fr: 'E-mail', en: 'Email', sw: 'Barua pepe' , it: 'E-mail', de: 'E-Mail' },
  commun_depart: { fr: 'Départ', en: 'Pickup', sw: 'Kuondoka' , it: 'Partenza', de: 'Abholung' },
  // « Ma position » en tête de la liste de départ : le GPS trouve la ville,
  // le client n'a rien à chercher. La position exacte suit jusqu'au chauffeur.
  position_option: {
    fr: '📍 Ma position actuelle',
    en: '📍 My current location',
    sw: '📍 Nilipo sasa',
    it: '📍 La mia posizione',
    de: '📍 Mein Standort',
  },
  position_recherche: {
    fr: 'Recherche de votre position…',
    en: 'Finding your location…',
    sw: 'Tunatafuta ulipo…',
    it: 'Ricerca della posizione…',
    de: 'Standort wird gesucht…',
  },
  position_trouvee: {
    fr: 'Vous êtes près de {ville} — le chauffeur viendra à votre point exact.',
    en: "You're near {ville} — your driver will come to your exact spot.",
    sw: 'Uko karibu na {ville} — dereva atakuja mahali ulipo hasa.',
    it: 'Sei vicino a {ville} — l\'autista verrà nel punto esatto.',
    de: 'Du bist in der Nähe von {ville} — der Fahrer kommt genau dorthin.',
  },
  position_hors_zone: {
    fr: "Vous semblez hors de Zanzibar : choisissez votre lieu de départ dans la liste.",
    en: 'You seem to be outside Zanzibar: please pick your pickup point from the list.',
    sw: 'Inaonekana uko nje ya Zanzibar: chagua mahali pa kuondoka kwenye orodha.',
    it: 'Sembri fuori da Zanzibar: scegli il punto di partenza dalla lista.',
    de: 'Du scheinst außerhalb Sansibars zu sein: bitte wähle den Abholort aus der Liste.',
  },
  commun_arrivee: { fr: 'Arrivée', en: 'Drop-off', sw: 'Kufika' , it: 'Arrivo', de: 'Ziel' },
  commun_zone: { fr: 'Zone', en: 'Zone', sw: 'Eneo' , it: 'Zona', de: 'Zone' },
  commun_type: { fr: 'Type', en: 'Type', sw: 'Aina' , it: 'Tipo', de: 'Art' },
  commun_client: { fr: 'Client', en: 'Guest', sw: 'Mteja' , it: 'Cliente', de: 'Gast' },
  commun_description: { fr: 'Description', en: 'Description', sw: 'Maelezo' , it: 'Descrizione', de: 'Beschreibung' },
  commun_devise: { fr: 'Devise', en: 'Currency', sw: 'Sarafu' , it: 'Valuta', de: 'Währung' },
  commun_se_deconnecter: { fr: 'Se déconnecter', en: 'Log out', sw: 'Toka' , it: 'Esci', de: 'Abmelden' },
  commun_langue: { fr: 'Langue', en: 'Language', sw: 'Lugha' , it: 'Lingua', de: 'Sprache' },
  commun_choisir: { fr: 'Choisir…', en: 'Choose…', sw: 'Chagua…' , it: 'Scegli…', de: 'Auswählen …' },
  timeline_annule: { fr: 'Annulé', en: 'Cancelled', sw: 'Imeghairiwa' , it: 'Annullato', de: 'Storniert' },
  // Sélecteurs de date / heure (aucun date-picker natif).
  sel_date: { fr: 'Date', en: 'Date', sw: 'Tarehe' , it: 'Data', de: 'Datum' },
  sel_heure: { fr: 'Heure', en: 'Time', sw: 'Saa' , it: 'Ora', de: 'Uhrzeit' },
  sel_aujourdhui: { fr: "Aujourd'hui", en: 'Today', sw: 'Leo' , it: 'Oggi', de: 'Heute' },
  sel_demain: { fr: 'Demain', en: 'Tomorrow', sw: 'Kesho' , it: 'Domani', de: 'Morgen' },
  sel_maintenant: {
    fr: 'Maintenant — pas de programmation',
    en: 'Now — no scheduling',
    sw: 'Sasa — bila kupanga',
    it: 'Adesso — senza programmazione',
    de: 'Jetzt — ohne Terminplanung',
  },
  sel_erreur_datetime: {
    fr: "Choisissez la date et l'heure de départ.",
    en: 'Choose the departure date and time.',
    sw: 'Chagua tarehe na saa ya kuondoka.',
    it: 'Scegli la data e l\'ora di partenza.',
    de: 'Wählen Sie Datum und Uhrzeit der Abfahrt.',
  },

  // --- Statuts de trajet ---------------------------------------------------
  statut_trajet_requested: { fr: 'Demandée', en: 'Requested', sw: 'Imeombwa' , it: 'Richiesta', de: 'Angefragt' },
  statut_trajet_driver_confirmed: {
    fr: 'Chauffeur confirmé',
    en: 'Driver confirmed',
    sw: 'Dereva amethibitishwa',
    it: 'Autista confermato',
    de: 'Fahrer bestätigt',
  },
  statut_trajet_paid: { fr: 'Payée', en: 'Paid', sw: 'Imelipwa' , it: 'Pagata', de: 'Bezahlt' },
  statut_trajet_in_progress: { fr: 'En cours', en: 'In progress', sw: 'Inaendelea' , it: 'In corso', de: 'Unterwegs' },
  statut_trajet_completed: { fr: 'Terminée', en: 'Completed', sw: 'Imekamilika' , it: 'Completata', de: 'Abgeschlossen' },
  statut_trajet_cancelled: { fr: 'Annulée', en: 'Cancelled', sw: 'Imeghairiwa' , it: 'Annullata', de: 'Storniert' },

  // --- Statuts de colis ----------------------------------------------------
  statut_colis_created: { fr: 'Créé', en: 'Created', sw: 'Umetengenezwa' , it: 'Creato', de: 'Erstellt' },
  statut_colis_paid: { fr: 'Payé', en: 'Paid', sw: 'Umelipwa' , it: 'Pagato', de: 'Bezahlt' },
  statut_colis_picked_up: { fr: 'Ramassé', en: 'Picked up', sw: 'Umechukuliwa' , it: 'Ritirato', de: 'Abgeholt' },
  statut_colis_delivered: { fr: 'Livré', en: 'Delivered', sw: 'Umefikishwa' , it: 'Consegnato', de: 'Zugestellt' },
  statut_colis_cancelled: { fr: 'Annulé', en: 'Cancelled', sw: 'Umeghairiwa' , it: 'Annullato', de: 'Storniert' },

  // --- Statuts d'annonce (rides) -------------------------------------------
  statut_ride_open: { fr: 'Ouvert', en: 'Open', sw: 'Wazi' , it: 'Aperta', de: 'Offen' },
  statut_ride_closed: { fr: 'Clôturé', en: 'Closed', sw: 'Imefungwa' , it: 'Chiusa', de: 'Geschlossen' },
  statut_ride_cancelled: { fr: 'Annulé', en: 'Cancelled', sw: 'Imeghairiwa' , it: 'Annullata', de: 'Storniert' },

  // --- Types de course -----------------------------------------------------
  type_trajet_private: { fr: 'Course privée', en: 'Private ride', sw: 'Safari binafsi' , it: 'Corsa privata', de: 'Privatfahrt' },
  type_trajet_shared_tourist: {
    fr: 'Taxi partagé',
    en: 'Shared taxi',
    sw: 'Teksi ya pamoja',
    it: 'Taxi condiviso',
    de: 'Sammeltaxi',
  },
  type_trajet_shared_local: {
    fr: 'Taxi partagé local',
    en: 'Local shared taxi',
    sw: 'Teksi ya pamoja ya wenyeji',
    it: 'Taxi condiviso locale',
    de: 'Lokales Sammeltaxi',
  },
  type_trajet_posted_return: {
    fr: 'Retour affiché',
    en: 'Posted return',
    sw: 'Safari ya kurudi',
    it: 'Ritorno pubblicato',
    de: 'Angebotene Rückfahrt',
  },

  // --- Onglets et titres d'écrans ------------------------------------------
  onglet_reserver: { fr: 'Réserver', en: 'Book', sw: 'Weka safari' , it: 'Prenota', de: 'Buchen' },
  onglet_trajets: { fr: 'Mes trajets', en: 'My rides', sw: 'Safari zangu' , it: 'Le mie corse', de: 'Meine Fahrten' },
  onglet_colis: { fr: 'Colis', en: 'Parcels', sw: 'Mizigo' , it: 'Pacchi', de: 'Pakete' },
  onglet_profil: { fr: 'Profil', en: 'Profile', sw: 'Wasifu' , it: 'Profilo', de: 'Profil' },
  onglet_courses: { fr: 'Mes courses', en: 'My rides', sw: 'Safari zangu' , it: 'Le mie corse', de: 'Meine Fahrten' },
  onglet_annonces: { fr: 'Annonces', en: 'Listings', sw: 'Matangazo' , it: 'Annunci', de: 'Angebote' },
  onglet_scanner: { fr: 'Scanner', en: 'Scan', sw: 'Skani' , it: 'Scansiona', de: 'Scannen' },
  titre_otp: { fr: 'Code de vérification', en: 'Verification code', sw: 'Msimbo wa uthibitisho' , it: 'Codice di verifica', de: 'Bestätigungscode' },
  titre_client: { fr: 'Profil client', en: 'Customer profile', sw: 'Wasifu wa mteja' , it: 'Profilo cliente', de: 'Kundenprofil' },
  titre_hotel: { fr: 'Espace partenaire', en: 'Partner area', sw: 'Eneo la mshirika' , it: 'Area partner', de: 'Partnerbereich' },
  titre_hotel_inscription: {
    fr: 'Compte partenaire',
    en: 'Partner account',
    sw: 'Akaunti ya ushirika',
    it: 'Account partner',
    de: 'Partnerkonto',
  },
  titre_pro: { fr: 'Devenir chauffeur', en: 'Become a driver', sw: 'Kuwa dereva' , it: 'Diventa autista', de: 'Fahrer werden' },
  titre_trajet: { fr: 'Trajet', en: 'Ride', sw: 'Safari' , it: 'Corsa', de: 'Fahrt' },
  titre_equipe: { fr: 'Équipe zanziGo', en: 'zanziGo team', sw: 'Timu ya zanziGo' , it: 'Team zanziGo', de: 'zanziGo-Team' },
  gains_titre: { fr: 'Mes gains', en: 'My earnings', sw: 'Mapato yangu' },
  gains_aujourdhui: { fr: "Aujourd'hui", en: 'Today', sw: 'Leo' },
  gains_7j: { fr: '7 derniers jours', en: 'Last 7 days', sw: 'Siku 7 zilizopita' },
  gains_30j: { fr: '30 derniers jours', en: 'Last 30 days', sw: 'Siku 30 zilizopita' },
  gains_detail_compte: {
    fr: '{courses} course·s · {colis} colis · {places} place·s payée·s',
    en: '{courses} ride·s · {colis} parcel·s · {places} paid seat·s',
    sw: 'safari {courses} · mizigo {colis} · viti {places} vilivyolipwa',
  },
  gains_note_paiement: {
    fr: 'Gains nets, commission zanziGo déjà déduite — vous êtes payé après chaque course.',
    en: 'Net earnings, zanziGo commission already deducted — you are paid after each ride.',
    sw: 'Mapato halisi, kamisheni ya zanziGo imeshatolewa — unalipwa baada ya kila safari.',
  },
  gains_hero_label: {
    fr: "Aujourd'hui, net — en shillings",
    en: 'Today, net — in shillings',
    sw: 'Leo, halisi — kwa shilingi',
  },
  gains_note_conversion: {
    fr: 'Les gains en dollars (touristes et établissements partenaires) sont convertis en shillings au taux zanziGo : 1 USD = 2 600 TZS.',
    en: 'Dollar earnings (tourist and hotel clients) are converted to shillings at the zanziGo rate: 1 USD = 2,600 TZS.',
    sw: 'Mapato ya dola (watalii na hoteli) yanabadilishwa kuwa shilingi kwa kiwango cha zanziGo: 1 USD = TZS 2,600.',
  },
  courses_colis_titre: {
    fr: 'Colis à ramasser',
    en: 'Parcels to pick up',
    sw: 'Mizigo ya kuchukua',
  },
  courses_colis_vide: {
    fr: 'Aucun colis en attente de ramassage pour le moment — les envois payés des partenaires et des clients apparaîtront ici.',
    en: 'No parcels awaiting pickup right now — paid deliveries from hotels and customers will appear here.',
    sw: 'Hakuna mizigo inayosubiri kuchukuliwa kwa sasa — mizigo iliyolipiwa ya hoteli na wateja itaonekana hapa.',
  },
  courses_colis_client: { fr: 'Client', en: 'Customer', sw: 'Mteja' },
  courses_colis_scanner: {
    fr: 'Scanner le colis au ramassage',
    en: 'Scan the parcel at pickup',
    sw: 'Skani mzigo wakati wa kuchukua',
  },
  courses_position_active: {
    fr: 'Position partagée pendant vos livraisons — gardez l\'app ouverte en roulant.',
    en: 'Location shared during your deliveries — keep the app open while driving.',
    sw: 'Mahali pako panashirikiwa wakati wa usafirishaji — acha programu wazi unapoendesha.',
  },

  // --- Tableau de bord équipe ----------------------------------------------
  equipe_lien_accueil: {
    fr: 'Équipe zanziGo · Tableau de bord',
    en: 'zanziGo team · Dashboard',
    sw: 'Timu ya zanziGo · Dashibodi',
  },
  equipe_intro: {
    fr: "Espace réservé à l'équipe : entrez la clé secrète pour gérer les demandes.",
    en: 'Team-only area: enter the secret key to manage requests.',
    sw: 'Eneo la timu pekee: weka ufunguo wa siri kudhibiti maombi.',
  },
  equipe_cle: { fr: 'Clé équipe', en: 'Team key', sw: 'Ufunguo wa timu' },
  equipe_activer: { fr: 'Entrer', en: 'Enter', sw: 'Ingia' },
  equipe_cle_invalide: {
    fr: 'Clé invalide — vérifiez et réessayez.',
    en: 'Invalid key — check it and try again.',
    sw: 'Ufunguo si sahihi — kagua kisha ujaribu tena.',
  },
  equipe_quitter: { fr: "Quitter le mode équipe", en: 'Leave team mode', sw: 'Toka hali ya timu' },
  equipe_courses: { fr: 'Courses à traiter', en: 'Rides to handle', sw: 'Safari za kushughulikia' },
  equipe_courses_vide: {
    fr: 'Aucune course en attente. 🎉',
    en: 'No pending rides. 🎉',
    sw: 'Hakuna safari zinazosubiri. 🎉',
  },
  equipe_choisir_chauffeur: { fr: 'Chauffeur', en: 'Driver', sw: 'Dereva' },
  equipe_confirmer_chauffeur: {
    fr: 'Confirmer ce chauffeur',
    en: 'Confirm this driver',
    sw: 'Thibitisha dereva huyu',
  },
  equipe_erreur_chauffeur: {
    fr: "Choisissez d'abord un chauffeur dans la liste.",
    en: 'Choose a driver from the list first.',
    sw: 'Chagua dereva kwenye orodha kwanza.',
  },
  equipe_aucun_chauffeur: {
    fr: 'Aucun chauffeur vérifié disponible — validez une candidature plus bas.',
    en: 'No verified driver available — approve an application below.',
    sw: 'Hakuna dereva aliyethibitishwa — kubali ombi hapa chini.',
  },
  equipe_paiements: { fr: 'Paiements en attente', en: 'Pending payments', sw: 'Malipo yanayosubiri' },
  equipe_paiements_vide: {
    fr: 'Aucun paiement en attente.',
    en: 'No pending payments.',
    sw: 'Hakuna malipo yanayosubiri.',
  },
  equipe_marquer_paye: { fr: 'Marquer payé ✓', en: 'Mark as paid ✓', sw: 'Weka imelipwa ✓' },
  equipe_paiement_course: { fr: 'Course', en: 'Ride', sw: 'Safari' },
  equipe_paiement_colis: { fr: 'Colis', en: 'Parcel', sw: 'Mzigo' },
  equipe_candidatures: {
    fr: 'Candidatures chauffeurs',
    en: 'Driver applications',
    sw: 'Maombi ya madereva',
  },
  equipe_candidatures_vide: {
    fr: 'Aucune candidature en attente.',
    en: 'No pending applications.',
    sw: 'Hakuna maombi yanayosubiri.',
  },
  equipe_comptes: { fr: 'Comptes à valider', en: 'Accounts to review', sw: 'Akaunti za kukagua' },
  equipe_comptes_vide: {
    fr: 'Aucun document en attente de validation.',
    en: 'No documents awaiting review.',
    sw: 'Hakuna nyaraka zinazosubiri ukaguzi.',
  },
  equipe_document: { fr: 'Voir le document', en: 'View document', sw: 'Ona hati' },
  equipe_doc_permis: { fr: 'Permis', en: 'Licence', sw: 'Leseni' },
  equipe_doc_assurance: { fr: 'Assurance', en: 'Insurance', sw: 'Bima' },
  equipe_doc_vehicule: { fr: 'Véhicule', en: 'Vehicle', sw: 'Gari' },
  equipe_valider: { fr: 'Valider ✓', en: 'Approve ✓', sw: 'Kubali ✓' },
  equipe_refuser: { fr: 'Refuser', en: 'Reject', sw: 'Kataa' },
  equipe_hotels: { fr: 'Hôtels à vérifier', en: 'Hotels to verify', sw: 'Hoteli za kuthibitisha' },
  equipe_hotels_vide: {
    fr: 'Aucun compte partenaire en attente de vérification.',
    en: 'No hotel accounts awaiting verification.',
    sw: 'Hakuna akaunti za hoteli zinazosubiri uthibitisho.',
  },
  equipe_hotels_conseil: {
    fr: "Appelez l'établissement à son numéro officiel (ou WhatsApp) pour confirmer que l'inscription vient bien de lui avant de valider.",
    en: 'Call the property on its official number (or WhatsApp) to confirm the signup really comes from them before approving.',
    sw: 'Piga simu hoteli kwa namba yake rasmi (au WhatsApp) kuthibitisha usajili unatoka kwao kabla ya kukubali.',
  },
  equipe_taxis: { fr: 'Mes taxis', en: 'My taxis', sw: 'Teksi zangu' },
  equipe_taxis_vide: {
    fr: 'Aucun chauffeur vérifié pour le moment.',
    en: 'No verified drivers yet.',
    sw: 'Hakuna dereva aliyethibitishwa bado.',
  },
  equipe_position: { fr: 'Voir la position 📍', en: 'View location 📍', sw: 'Ona mahali 📍' },
  equipe_position_inconnue: {
    fr: 'Position inconnue (app chauffeur fermée)',
    en: 'Location unknown (driver app closed)',
    sw: 'Mahali hapajulikani (programu ya dereva imefungwa)',
  },
  equipe_radier: { fr: 'Radier ce chauffeur', en: 'Remove this driver', sw: 'Mwondoe dereva huyu' },
  equipe_radier_titre: { fr: 'Radier le chauffeur ?', en: 'Remove this driver?', sw: 'Kumwondoa dereva?' },
  equipe_radier_texte: {
    fr: '{nom} ne recevra plus de courses zanziGo et ses annonces ouvertes seront fermées.',
    en: '{nom} will no longer receive zanziGo rides and their open trips will be closed.',
    sw: '{nom} hatapokea tena safari za zanziGo na matangazo yake yaliyo wazi yatafungwa.',
  },
  equipe_radier_confirmer: { fr: 'Radier', en: 'Remove', sw: 'Ondoa' },
  equipe_resume_titre: { fr: "Vue d'ensemble", en: 'Overview', sw: 'Muhtasari' },
  // LES QUATRE FAMILLES du tableau de bord : les rubriques qui parlent de la
  // même chose vivent dans la même carte.
  equipe_famille_courses: { fr: 'Les courses', en: 'Rides', sw: 'Safari', it: 'Le corse', de: 'Fahrten' },
  equipe_famille_argent: { fr: "L'argent", en: 'Money', sw: 'Pesa', it: 'I soldi', de: 'Geld' },
  equipe_famille_chauffeurs: { fr: 'Les chauffeurs', en: 'Drivers', sw: 'Madereva', it: 'Gli autisti', de: 'Fahrer' },
  equipe_famille_monde: {
    fr: 'Clients & partenaires',
    en: 'Clients & partners',
    sw: 'Wateja na washirika',
    it: 'Clienti e partner',
    de: 'Kunden & Partner',
  },
  equipe_famille_a_traiter: {
    fr: '{n} à traiter',
    en: '{n} to handle',
    sw: '{n} kushughulikia',
    it: '{n} da gestire',
    de: '{n} zu erledigen',
  },
  equipe_abonnes_titre: { fr: 'Nos abonnés', en: 'Our subscribers', sw: 'Wanachama wetu' },
  equipe_abonnes_clients: { fr: 'Clients', en: 'Clients', sw: 'Wateja' },
  equipe_abonnes_locaux: { fr: 'Locaux', en: 'Locals', sw: 'Wazawa' },
  equipe_abonnes_hotels: { fr: 'Hôtels', en: 'Hotels', sw: 'Hoteli' },
  equipe_ca_titre: { fr: "Chiffre d'affaires", en: 'Revenue', sw: 'Mapato' },
  equipe_ca_net: { fr: 'Net zanziGo', en: 'zanziGo net', sw: 'Halisi zanziGo' },
  equipe_ca_ouvrir: { fr: '7 j · 30 j ›', en: '7 d · 30 d ›', sw: 'Siku 7 · 30 ›' },
  equipe_ca_hero: {
    fr: 'Gain net aujourd\'hui (USD convertis)',
    en: 'Net gain today (USD converted)',
    sw: 'Faida halisi leo (USD zimebadilishwa)',
  },
  equipe_ca_encaisse: { fr: 'Encaissé', en: 'Collected', sw: 'Zilizokusanywa' },
  equipe_ca_par_jour: {
    fr: '≈ {montant} / jour',
    en: '≈ {montant} / day',
    sw: '≈ {montant} / siku',
  },
  equipe_remboursements: {
    fr: 'Remboursements à verser',
    en: 'Refunds to pay out',
    sw: 'Marejesho ya kulipa',
  },
  equipe_rembourser_montant: {
    fr: '↩️ À rembourser : {montant} ({taux} % — annulation client)',
    en: '↩️ To refund: {montant} ({taux}% — client cancellation)',
    sw: '↩️ Ya kurejesha: {montant} ({taux}% — mteja ameghairi)',
  },
  equipe_rembourse_bouton: {
    fr: 'Remboursement versé ✓',
    en: 'Refund paid ✓',
    sw: 'Marejesho yamelipwa ✓',
  },
  equipe_paiements_recus: {
    fr: 'Derniers paiements reçus',
    en: 'Latest payments received',
    sw: 'Malipo ya hivi karibuni',
  },
  equipe_paiement_credit: {
    fr: 'Payé par crédit partenaire',
    en: 'Paid with hotel credit',
    sw: 'Imelipwa kwa salio la hoteli',
  },
  equipe_paiement_valide_main: {
    fr: 'marqué payé à la main',
    en: 'marked paid by hand',
    sw: 'imewekwa imelipwa kwa mkono',
  },
  equipe_stat_clients: { fr: 'Clients · Visiteurs', en: 'Clients · Visitors', sw: 'Wateja · Wageni' },
  equipe_stat_locaux: { fr: 'Locaux', en: 'Locals', sw: 'Wazawa' },
  equipe_recherche_label: {
    fr: 'Nom ou téléphone',
    en: 'Name or phone',
    sw: 'Jina au simu',
  },
  equipe_recherche_bouton: { fr: 'Rechercher', en: 'Search', sw: 'Tafuta' },
  equipe_recherche_vide: {
    fr: 'Aucun profil trouvé — vérifiez l\'orthographe ou cherchez par téléphone.',
    en: 'No profile found — check the spelling or search by phone.',
    sw: 'Hakuna wasifu uliopatikana — angalia tahajia au tafuta kwa simu.',
  },
  equipe_recherche_intro: {
    fr: 'Cherchez un profil par nom ou téléphone pour le radier (ou le réintégrer).',
    en: 'Search a profile by name or phone to remove it (or reinstate it).',
    sw: 'Tafuta wasifu kwa jina au simu ili kumwondoa (au kumrejesha).',
  },
  equipe_profil_bloque: { fr: 'Bloqué', en: 'Blocked', sw: 'Amezuiwa' },
  equipe_radier_client: { fr: 'Radier ce client', en: 'Remove this client', sw: 'Mwondoe mteja huyu' },
  equipe_radier_client_titre: { fr: 'Radier le client ?', en: 'Remove this client?', sw: 'Kumwondoa mteja?' },
  equipe_radier_client_texte: {
    fr: '{nom} ne pourra plus rien réserver avec zanziGo. Vous pourrez le réintégrer plus tard.',
    en: '{nom} will no longer be able to book anything with zanziGo. You can reinstate them later.',
    sw: '{nom} hataweza tena kuhifadhi chochote na zanziGo. Unaweza kumrejesha baadaye.',
  },
  equipe_reintegrer: { fr: 'Réintégrer ✓', en: 'Reinstate ✓', sw: 'Mrejeshe ✓' },
  equipe_stat_courses: { fr: 'Courses à traiter', en: 'Rides to handle', sw: 'Safari za kushughulikia' },
  equipe_stat_paiements: { fr: 'Paiements', en: 'Payments', sw: 'Malipo' },
  equipe_stat_candidatures: { fr: 'Candidatures', en: 'Applications', sw: 'Maombi' },
  equipe_stat_comptes: { fr: 'Comptes clients', en: 'Client accounts', sw: 'Akaunti za wateja' },
  equipe_stat_hotels: { fr: 'Hôtels à vérifier', en: 'Hotels to verify', sw: 'Hoteli za kuthibitisha' },
  equipe_stat_taxis: { fr: 'Taxis actifs', en: 'Active taxis', sw: 'Teksi hai' },
  equipe_retour_menu: { fr: '‹ Retour au menu', en: '‹ Back to menu', sw: '‹ Rudi kwenye menyu' },
  equipe_menu_intro: {
    fr: 'Touchez une case pour ouvrir la rubrique.',
    en: 'Tap a tile to open the section.',
    sw: 'Gusa kisanduku kufungua sehemu.',
  },
  menage_bouton: { fr: '🧹 Effacer les anciennes courses', en: '🧹 Clear old rides', sw: '🧹 Futa safari za zamani' },
  menage_bouton_colis: { fr: '🧹 Effacer les anciens colis', en: '🧹 Clear old parcels', sw: '🧹 Futa mizigo ya zamani' },
  menage_titre: { fr: 'Faire le ménage ?', en: 'Clean up?', sw: 'Kufanya usafi?' },
  menage_texte: {
    fr: 'Les éléments terminés, annulés ou expirés seront masqués de cette liste, sur ce téléphone uniquement. Ils restent enregistrés chez zanziGo (historique et gains).',
    en: 'Finished, cancelled or expired items will be hidden from this list, on this phone only. They stay recorded at zanziGo (history and earnings).',
    sw: 'Vitu vilivyokamilika, kughairiwa au kuisha muda vitafichwa kwenye orodha hii, kwenye simu hii tu. Vinabaki kumbukumbu kwa zanziGo (historia na mapato).',
  },
  menage_confirmer: { fr: 'Effacer', en: 'Clear', sw: 'Futa' },
  colis_masquer: { fr: 'Pas intéressé', en: 'Not interested', sw: 'Sivutiwi' , it: 'Non mi interessa', de: 'Kein Interesse' },
  colis_masquer_titre: { fr: 'Masquer ce colis ?', en: 'Hide this parcel?', sw: 'Kuficha mzigo huu?' , it: 'Nascondere questo pacco?', de: 'Dieses Paket ausblenden?' },
  colis_masquer_texte: {
    fr: "Il ne s'affichera plus dans votre liste, mais restera proposé aux autres chauffeurs.",
    en: 'It will no longer appear in your list, but stays available to other drivers.',
    sw: 'Hautaonekana tena kwenye orodha yako, lakini utabaki kwa madereva wengine.',
  },
  colis_masquer_confirmer: { fr: 'Masquer', en: 'Hide', sw: 'Ficha' , it: 'Nascondi', de: 'Ausblenden' },
  colis_reafficher: {
    fr: 'Réafficher les colis masqués ({n})',
    en: 'Show hidden parcels again ({n})',
    sw: 'Onyesha tena mizigo iliyofichwa ({n})',
    it: 'Mostra di nuovo i pacchi nascosti ({n})',
    de: 'Ausgeblendete Pakete wieder anzeigen ({n})',
  },
  titre_colis_dispo: { fr: 'Colis à ramasser', en: 'Parcel to pick up', sw: 'Mzigo wa kuchukua' , it: 'Pacco da ritirare', de: 'Abzuholendes Paket' },
  colis_dispo_intro: {
    fr: 'Premier arrivé, premier servi : touchez « Je prends la livraison » pour la réserver, puis scannez le code QR collé sur le colis au ramassage. Les coordonnées du destinataire apparaissent après le scan.',
    en: 'First come, first served: tap “I’ll take this delivery” to reserve it, then scan the QR code on the parcel at pickup. Recipient details appear after the scan.',
    sw: 'Wa kwanza kufika, wa kwanza kuhudumiwa: gusa « Nachukua usafirishaji » kuihifadhi, kisha skani QR iliyo kwenye mzigo unapochukua. Maelezo ya mpokeaji yanaonekana baada ya skani.',
    it: 'Chi prima arriva: tocca «Prendo questa consegna» per riservarla, poi scansiona il codice QR sul pacco al ritiro. I dati del destinatario appaiono dopo la scansione.',
    de: 'Wer zuerst kommt: Tippen Sie auf „Ich übernehme diese Lieferung“, um sie zu reservieren, und scannen Sie beim Abholen den QR-Code auf dem Paket. Die Empfängerdaten erscheinen nach dem Scan.',
  },
  colis_prendre: { fr: '✅ Je prends la livraison', en: '✅ I’ll take this delivery', sw: '✅ Nachukua usafirishaji' , it: '✅ Prendo questa consegna', de: '✅ Ich übernehme diese Lieferung' },
  colis_prendre_court: { fr: 'Je prends', en: 'Take it', sw: 'Nachukua' , it: 'Lo prendo', de: 'Übernehmen' },
  colis_prendre_confirmer: { fr: 'Je prends', en: 'Take it', sw: 'Nachukua' , it: 'Lo prendo', de: 'Übernehmen' },
  colis_prendre_titre: { fr: 'Prendre cette livraison ?', en: 'Take this delivery?', sw: 'Kuchukua usafirishaji huu?' , it: 'Prendere questa consegna?', de: 'Diese Lieferung übernehmen?' },
  colis_prendre_texte: {
    fr: 'Elle vous sera réservée — les autres chauffeurs ne la verront plus. Au ramassage, scannez le code QR collé sur le colis.',
    en: 'It will be reserved for you — other drivers will no longer see it. At pickup, scan the QR code on the parcel.',
    sw: 'Utahifadhiwa kwako — madereva wengine hawataiona tena. Unapochukua, skani QR iliyo kwenye mzigo.',
    it: 'Sarà riservata a te — gli altri autisti non la vedranno più. Al ritiro, scansiona il codice QR sul pacco.',
    de: 'Sie wird für Sie reserviert — andere Fahrer sehen sie nicht mehr. Scannen Sie beim Abholen den QR-Code auf dem Paket.',
  },
  colis_prendre_ok: {
    fr: 'Livraison réservée ! Retrouvez-la dans « Mes colis à livrer ».',
    en: 'Delivery reserved! Find it under “My parcels to deliver”.',
    sw: 'Usafirishaji umehifadhiwa! Uone kwenye « Mizigo yangu ya kupeleka ».',
    it: 'Consegna riservata! La trovi in «I miei pacchi da consegnare».',
    de: 'Lieferung reserviert! Sie finden sie unter „Meine zu liefernden Pakete“.',
  },
  colis_pris_trop_tard: {
    fr: 'Trop tard — un autre chauffeur a déjà pris cette livraison.',
    en: 'Too late — another driver already took this delivery.',
    sw: 'Umechelewa — dereva mwingine tayari amechukua usafirishaji huu.',
    it: 'Troppo tardi — un altro autista ha già preso questa consegna.',
    de: 'Zu spät — ein anderer Fahrer hat diese Lieferung bereits übernommen.',
  },
  courses_mes_colis: { fr: 'Mes colis à livrer', en: 'My parcels to deliver', sw: 'Mizigo yangu ya kupeleka' },
  colis_dispo_enlevement: { fr: 'Enlèvement', en: 'Pickup', sw: 'Kuchukua' , it: 'Ritiro', de: 'Abholung' },
  colis_dispo_livraison: { fr: 'Livraison', en: 'Delivery', sw: 'Uwasilishaji' , it: 'Consegna', de: 'Lieferung' },
  colis_dispo_taille: { fr: 'Taille', en: 'Size', sw: 'Ukubwa' , it: 'Dimensione', de: 'Größe' },
  colis_dispo_description: { fr: 'Description', en: 'Description', sw: 'Maelezo' , it: 'Descrizione', de: 'Beschreibung' },
  colis_dispo_publie: { fr: 'Publié', en: 'Posted', sw: 'Imetangazwa' , it: 'Pubblicato', de: 'Veröffentlicht' },
  colis_dispo_prix: { fr: 'Prix payé par le client', en: 'Price paid by the client', sw: 'Bei aliyolipa mteja' , it: 'Prezzo pagato dal cliente', de: 'Vom Kunden gezahlter Preis' },
  colis_dispo_introuvable_titre: {
    fr: 'Colis plus disponible',
    en: 'Parcel no longer available',
    sw: 'Mzigo haupatikani tena',
    it: 'Pacco non più disponibile',
    de: 'Paket nicht mehr verfügbar',
  },
  colis_dispo_introuvable_texte: {
    fr: "Il a déjà été pris par un autre chauffeur, ou la demande a expiré (48 h).",
    en: 'It was already taken by another driver, or the request expired (48 h).',
    sw: 'Tayari umechukuliwa na dereva mwingine, au ombi limeisha muda (saa 48).',
    it: 'È già stato preso da un altro autista, oppure la richiesta è scaduta (48 h).',
    de: 'Es wurde bereits von einem anderen Fahrer übernommen oder die Anfrage ist abgelaufen (48 Std.).',
  },
  annonces_historique: { fr: 'Historique', en: 'History', sw: 'Historia' },
  annonces_ouvertes: { fr: 'Annonces en ligne', en: 'Live listings', sw: 'Matangazo hewani' },
  annonces_regle_retard: {
    fr: 'Un passager en retard de plus de 10 minutes au départ perd sa place — elle vous reste due en intégralité. Après le départ, votre annonce se clôture automatiquement et vos places payées restent acquises.',
    en: 'A passenger more than 10 minutes late at departure loses their seat — it is still owed to you in full. After departure, your listing closes automatically and your paid seats remain yours.',
    sw: 'Abiria anayechelewa zaidi ya dakika 10 wakati wa kuondoka anapoteza kiti chake — bado kinakudai kikamilifu. Baada ya kuondoka, tangazo lako linafungwa kiotomatiki na viti vilivyolipwa vinabaki vyako.',
  },
  rides_regle_retard: {
    fr: 'Paiement sous 5 minutes : au-delà, la réservation s\'annule automatiquement et les places sont remises en vente. Ponctualité : plus de 10 minutes de retard au départ = place considérée comme annulée et due en intégralité au chauffeur — par respect pour les autres voyageurs.',
    en: 'Pay within 5 minutes: after that, the booking cancels automatically and the seats go back on sale. Punctuality: more than 10 minutes late at departure = seat considered cancelled and owed in full to the driver — out of respect for the other travellers.',
    sw: 'Lipa ndani ya dakika 5: baada ya hapo, uhifadhi unaghairiwa kiotomatiki na viti vinarudishwa sokoni. Uwakati: kuchelewa zaidi ya dakika 10 wakati wa kuondoka = kiti kinahesabiwa kimeghairiwa na kinadaiwa kikamilifu kwa dereva — kwa heshima ya wasafiri wengine.',
    it: 'Paga entro 5 minuti: dopo, la prenotazione si annulla automaticamente e i posti tornano in vendita. Puntualità: più di 10 minuti di ritardo alla partenza = posto considerato annullato e dovuto per intero all\'autista — per rispetto degli altri viaggiatori.',
    de: 'Zahlen Sie innerhalb von 5 Minuten: Danach wird die Buchung automatisch storniert und die Plätze kommen zurück in den Verkauf. Pünktlichkeit: mehr als 10 Minuten Verspätung bei der Abfahrt = Platz gilt als storniert und ist dem Fahrer voll geschuldet — aus Rücksicht auf die Mitreisenden.',
  },
  resa_regle_annulation: {
    fr: 'Annulation : remboursement 100 % jusqu\'à 48 h avant le départ, 50 % entre 48 h et 24 h. À moins de 24 h du départ, la place reste due.',
    en: 'Cancellation: 100% refund up to 48 h before departure, 50% between 48 h and 24 h. Less than 24 h before departure, the seat remains due.',
    sw: 'Kughairi: marejesho 100% hadi saa 48 kabla ya kuondoka, 50% kati ya saa 48 na 24. Chini ya saa 24 kabla ya kuondoka, kiti kinabaki kinadaiwa.',
    it: 'Cancellazione: rimborso del 100% fino a 48 h prima della partenza, 50% tra 48 h e 24 h. Meno di 24 h prima della partenza, il posto resta dovuto.',
    de: 'Stornierung: 100 % Rückerstattung bis 48 Std. vor Abfahrt, 50 % zwischen 48 und 24 Std. Weniger als 24 Std. vor Abfahrt bleibt der Platz geschuldet.',
  },

  // --- Mes places de taxi partagé (annulation client) -----------------------------
  places_titre: {
    fr: 'Mes places de taxi partagé',
    en: 'My shared taxi seats',
    sw: 'Viti vyangu vya teksi ya pamoja',
    it: 'I miei posti in taxi condiviso',
    de: 'Meine Sammeltaxi-Plätze',
  },
  places_detail: {
    fr: '{n} place·s réservée·s',
    en: '{n} seat·s booked',
    sw: 'viti {n} vimehifadhiwa',
    it: '{n} posto/i prenotato/i',
    de: '{n} Platz/Plätze gebucht',
  },
  places_payee: { fr: 'payée', en: 'paid', sw: 'imelipwa' , it: 'pagato', de: 'bezahlt' },
  places_a_payer: { fr: 'à payer', en: 'to pay', sw: 'kulipwa' , it: 'da pagare', de: 'zu zahlen' },
  place_annuler: { fr: 'Annuler ma place', en: 'Cancel my seat', sw: 'Ghairi kiti changu' , it: 'Annulla il mio posto', de: 'Meinen Platz stornieren' },
  place_annuler_confirm: {
    fr: 'Annuler cette réservation ? Les places retournent au chauffeur.',
    en: 'Cancel this booking? The seats go back to the driver.',
    sw: 'Ughairi uhifadhi huu? Viti vinarudi kwa dereva.',
    it: 'Annullare questa prenotazione? I posti tornano all\'autista.',
    de: 'Diese Buchung stornieren? Die Plätze gehen an den Fahrer zurück.',
  },
  place_annuler_confirm_rembours: {
    fr: 'Annuler cette place ? Vous serez remboursé de {montant} ({taux} %).',
    en: 'Cancel this seat? You will be refunded {montant} ({taux}%).',
    sw: 'Ughairi kiti hiki? Utarejeshewa {montant} ({taux}%).',
    it: 'Annullare questo posto? Ti verranno rimborsati {montant} ({taux}%).',
    de: 'Diesen Platz stornieren? Sie erhalten {montant} ({taux} %) zurück.',
  },
  place_annulee_rembours: {
    fr: 'Place annulée. Remboursement de {montant} : l\'équipe vous le verse — le message WhatsApp qui s\'ouvre la prévient, appuyez sur Envoyer.',
    en: 'Seat cancelled. {montant} refund: the team will pay you — the WhatsApp message that opens notifies them, just press Send.',
    sw: 'Kiti kimeghairiwa. Marejesho ya {montant}: timu itakulipa — ujumbe wa WhatsApp unaofunguka unawajulisha, bonyeza Tuma.',
    it: 'Posto annullato. Rimborso di {montant}: il team te lo verserà — il messaggio WhatsApp che si apre li avvisa, basta premere Invia.',
    de: 'Platz storniert. Rückerstattung von {montant}: Das Team zahlt sie aus — die sich öffnende WhatsApp-Nachricht benachrichtigt es, einfach auf Senden drücken.',
  },
  places_contact: {
    fr: 'Un souci avec une place ? Contactez l\'équipe sur WhatsApp',
    en: 'A problem with a seat? Contact the team on WhatsApp',
    sw: 'Tatizo na kiti? Wasiliana na timu kwa WhatsApp',
    it: 'Un problema con un posto? Contatta il team su WhatsApp',
    de: 'Ein Problem mit einem Platz? Kontaktieren Sie das Team über WhatsApp',
  },
  place_trop_tard: {
    fr: 'À moins de 24 h du départ, la place ne peut plus être annulée et reste due.',
    en: 'Less than 24 h before departure, the seat can no longer be cancelled and remains due.',
    sw: 'Chini ya saa 24 kabla ya kuondoka, kiti hakiwezi kughairiwa tena na kinabaki kinadaiwa.',
    it: 'Meno di 24 h prima della partenza, il posto non può più essere annullato e resta dovuto.',
    de: 'Weniger als 24 Std. vor Abfahrt kann der Platz nicht mehr storniert werden und bleibt geschuldet.',
  },

  // --- Fidélité + crédit prépayé (hôtels) -----------------------------------------
  fidelite_titre: { fr: 'Carte de fidélité', en: 'Loyalty card', sw: 'Kadi ya uaminifu' , it: 'Carta fedeltà', de: 'Treuekarte' },
  fidelite_bons_dispo: {
    fr: '{n} bon(s) colis offert(s)',
    en: '{n} free parcel voucher(s)',
    sw: 'Vocha {n} za mzigo bure',
    it: '{n} buono/i pacco gratuito',
    de: '{n} Gratis-Paketgutschein(e)',
  },
  fidelite_progression: {
    fr: '{n} / {total} courses vers le prochain bon',
    en: '{n} / {total} rides towards the next voucher',
    sw: 'Safari {n} / {total} kuelekea vocha ijayo',
    it: '{n} / {total} corse verso il prossimo buono',
    de: '{n} / {total} Fahrten bis zum nächsten Gutschein',
  },
  fidelite_regle: {
    fr: 'Toutes les 20 courses terminées avec zanziGo, vous gagnez un bon — à dépenser AU CHOIX : un envoi de colis OFFERT (au moment de créer le colis) ou 10 $ versés sur votre crédit zanziGo.',
    en: 'Every 20 completed rides with zanziGo, you earn a voucher — spend it YOUR way: a FREE parcel delivery (when creating the parcel) or $10 added to your zanziGo credit.',
    sw: 'Kila safari 20 zilizokamilika na zanziGo, unapata vocha — itumie UPENDAVYO: usafirishaji wa mzigo BURE (unapotengeneza mzigo) au $10 kwenye salio lako la zanziGo.',
    it: 'Ogni 20 corse completate con zanziGo ricevi un buono — usalo come preferisci: una consegna di pacco GRATUITA (al momento della creazione) oppure 10 $ aggiunti al tuo credito zanziGo.',
    de: 'Alle 20 abgeschlossenen Fahrten mit zanziGo erhalten Sie einen Gutschein — nutzen Sie ihn nach Wunsch: eine KOSTENLOSE Paketlieferung (bei der Erstellung) oder 10 $ Guthaben auf Ihrem zanziGo-Konto.',
  },
  fidelite_convertir: {
    fr: '💵 Convertir un bon en {montant} $ de crédit',
    en: '💵 Convert a voucher into ${montant} credit',
    sw: '💵 Badilisha vocha kuwa salio la ${montant}',
    it: '💵 Converti un buono in {montant} $ di credito',
    de: '💵 Gutschein in {montant} $ Guthaben umwandeln',
  },
  fidelite_convertir_titre: {
    fr: 'Convertir un bon',
    en: 'Convert a voucher',
    sw: 'Badilisha vocha',
    it: 'Converti un buono',
    de: 'Gutschein umwandeln',
  },
  fidelite_convertir_confirm: {
    fr: 'Transformer un bon fidélité en {montant} $ de crédit zanziGo ? Le bon ne pourra plus servir pour un colis offert.',
    en: 'Turn one loyalty voucher into ${montant} of zanziGo credit? The voucher can no longer be used for a free parcel.',
    sw: 'Badilisha vocha moja kuwa salio la ${montant} la zanziGo? Vocha haitaweza kutumika tena kwa mzigo bure.',
    it: 'Trasformare un buono fedeltà in {montant} $ di credito zanziGo? Il buono non potrà più essere usato per un pacco gratuito.',
    de: 'Einen Treuegutschein in {montant} $ zanziGo-Guthaben umwandeln? Der Gutschein kann dann nicht mehr für ein kostenloses Paket verwendet werden.',
  },
  credit_titre: { fr: 'Mon crédit zanziGo', en: 'My zanziGo credit', sw: 'Salio langu la zanziGo' },
  credit_solde: { fr: 'Solde disponible', en: 'Available balance', sw: 'Salio lililopo' },
  credit_explication: {
    fr: 'Rechargez votre compte auprès de l\'équipe (carte bancaire, portefeuille mobile, virement) et payez ensuite chaque course ou colis en un seul geste, sans sortir le téléphone du client.',
    en: 'Top up your account with the team (credit card, mobile wallet, transfer) and then pay every ride or parcel in one tap.',
    sw: 'Jaza akaunti yako kupitia timu (kadi ya benki, pochi ya simu, uhamisho) kisha ulipe kila safari au mzigo kwa mguso mmoja.',
  },
  credit_recharger: { fr: 'Recharger mon crédit', en: 'Top up my credit', sw: 'Jaza salio langu' },
  // ── LA DEMANDE DE RECHARGE (partenaire) ──
  recharge_montant: {
    fr: 'Montant à recharger (USD)',
    en: 'Amount to top up (USD)',
    it: 'Importo da ricaricare (USD)',
    de: 'Aufladebetrag (USD)',
    sw: 'Kiasi cha kujaza (USD)',
  },
  recharge_moyen: {
    fr: 'Comment vous payez',
    en: 'How you are paying',
    it: 'Come paghi',
    de: 'Wie Sie bezahlen',
    sw: 'Unalipaje',
  },
  recharge_moyen_mobile: {
    fr: 'Portefeuille mobile',
    en: 'Mobile wallet',
    it: 'Portafoglio mobile',
    de: 'Mobiles Wallet',
    sw: 'Pochi ya simu',
  },
  recharge_moyen_especes: {
    fr: 'Espèces',
    en: 'Cash',
    it: 'Contanti',
    de: 'Bargeld',
    sw: 'Fedha taslimu',
  },
  recharge_moyen_virement: {
    fr: 'Virement',
    en: 'Bank transfer',
    it: 'Bonifico',
    de: 'Überweisung',
    sw: 'Uhamisho wa benki',
  },
  recharge_moyen_carte: {
    fr: 'Carte bancaire',
    en: 'Bank card',
    it: 'Carta di credito',
    de: 'Bankkarte',
    sw: 'Kadi ya benki',
  },
  recharge_explication: {
    fr: "Votre demande part immédiatement à l'équipe zanziGo, qui crédite votre compte dès réception de l'argent. Vous suivez son état ici.",
    en: 'Your request goes straight to the zanziGo team, who credit your account as soon as the money arrives. You can follow it here.',
    it: 'La richiesta arriva subito al team zanziGo, che accredita il conto appena riceve il denaro. Puoi seguirla qui.',
    de: 'Ihre Anfrage geht sofort an das zanziGo-Team, das Ihr Konto gutschreibt, sobald das Geld eingeht. Den Stand sehen Sie hier.',
    sw: 'Ombi lako huenda moja kwa moja kwa timu ya zanziGo, ambayo hujaza akaunti yako mara fedha zinapofika. Unaweza kufuatilia hapa.',
  },
  recharge_en_attente: {
    fr: 'Demande de {montant} en attente — l’équipe la traite dès réception de l’argent.',
    en: 'Request for {montant} pending — the team will process it once the money arrives.',
    it: 'Richiesta di {montant} in attesa — il team la elabora appena riceve il denaro.',
    de: 'Anfrage über {montant} offen — das Team bearbeitet sie, sobald das Geld eingeht.',
    sw: 'Ombi la {montant} linasubiri — timu itashughulikia fedha zikifika.',
  },
  recharge_envoyer_preuve: {
    fr: 'Envoyer la preuve de paiement',
    en: 'Send payment proof',
    it: 'Invia la prova di pagamento',
    de: 'Zahlungsnachweis senden',
    sw: 'Tuma uthibitisho wa malipo',
  },
  recharge_creditee: {
    fr: 'Dernière recharge créditée : {montant}.',
    en: 'Last top-up credited: {montant}.',
    it: 'Ultima ricarica accreditata: {montant}.',
    de: 'Letzte Aufladung gutgeschrieben: {montant}.',
    sw: 'Malipo ya mwisho yamewekwa: {montant}.',
  },
  recharge_refusee: {
    fr: 'Votre dernière demande n’a pas pu être créditée. Contactez l’équipe.',
    en: 'Your last request could not be credited. Please contact the team.',
    it: 'L’ultima richiesta non è stata accreditata. Contatta il team.',
    de: 'Ihre letzte Anfrage konnte nicht gutgeschrieben werden. Bitte kontaktieren Sie das Team.',
    sw: 'Ombi lako la mwisho halikuwekwa. Wasiliana na timu.',
  },
  recharge_erreur_montant: {
    fr: 'Indiquez un montant en dollars, par exemple 100.',
    en: 'Enter an amount in dollars, for example 100.',
    it: 'Inserisci un importo in dollari, ad esempio 100.',
    de: 'Geben Sie einen Betrag in Dollar an, zum Beispiel 100.',
    sw: 'Weka kiasi kwa dola, kwa mfano 100.',
  },
  recharge_erreur_deja: {
    fr: 'Une demande est déjà en attente — l’équipe la traite.',
    en: 'A request is already pending — the team is on it.',
    it: 'Una richiesta è già in attesa — il team se ne occupa.',
    de: 'Eine Anfrage ist bereits offen — das Team kümmert sich darum.',
    sw: 'Ombi lipo tayari linasubiri — timu inalishughulikia.',
  },
  recharge_erreur_envoi: {
    fr: 'Demande non envoyée. Réessayez dans un instant.',
    en: 'Request not sent. Please try again in a moment.',
    it: 'Richiesta non inviata. Riprova tra poco.',
    de: 'Anfrage nicht gesendet. Bitte gleich erneut versuchen.',
    sw: 'Ombi halikutumwa. Jaribu tena baadaye kidogo.',
  },
  // ── LA PHOTO DU CHAUFFEUR ──
  photo_titre: {
    fr: 'Ma photo',
    en: 'My photo',
    it: 'La mia foto',
    de: 'Mein Foto',
    sw: 'Picha yangu',
  },
  photo_explication: {
    fr: 'C’est le visage que verra votre client avant de monter. Une photo nette, de face, en pleine lumière — comme une photo d’identité, mais souriante.',
    en: 'This is the face your passenger sees before getting in. A sharp, front-facing photo in good light — like an ID photo, but smiling.',
    it: 'È il volto che il passeggero vede prima di salire. Una foto nitida, frontale, con buona luce — come una foto tessera, ma sorridente.',
    de: 'Das ist das Gesicht, das Ihr Fahrgast vor dem Einsteigen sieht. Ein scharfes Foto von vorn, bei gutem Licht — wie ein Passbild, aber lächelnd.',
    sw: 'Hii ndiyo sura atakayoiona abiria kabla ya kupanda. Picha safi, ya mbele, kwenye mwanga mzuri — kama picha ya kitambulisho, lakini ukitabasamu.',
  },
  photo_deja: {
    fr: 'Vos clients voient cette photo.',
    en: 'Your passengers see this photo.',
    it: 'I tuoi passeggeri vedono questa foto.',
    de: 'Ihre Fahrgäste sehen dieses Foto.',
    sw: 'Abiria wako wanaona picha hii.',
  },
  photo_ajouter: {
    fr: 'Prendre ma photo',
    en: 'Take my photo',
    it: 'Scatta la mia foto',
    de: 'Foto aufnehmen',
    sw: 'Piga picha yangu',
  },
  photo_ajoutee: {
    fr: 'Photo enregistrée',
    en: 'Photo saved',
    it: 'Foto salvata',
    de: 'Foto gespeichert',
    sw: 'Picha imehifadhiwa',
  },
  photo_changer: {
    fr: 'Changer ma photo',
    en: 'Change my photo',
    it: 'Cambia la mia foto',
    de: 'Foto ändern',
    sw: 'Badilisha picha yangu',
  },
  photo_erreur: {
    fr: 'Photo non enregistrée. Réessayez dans un instant.',
    en: 'Photo not saved. Please try again in a moment.',
    it: 'Foto non salvata. Riprova tra poco.',
    de: 'Foto nicht gespeichert. Bitte gleich erneut versuchen.',
    sw: 'Picha haikuhifadhiwa. Jaribu tena baadaye kidogo.',
  },
  equipe_photo_retirer: {
    fr: 'Retirer la photo',
    en: 'Remove photo',
    it: 'Rimuovi la foto',
    de: 'Foto entfernen',
    sw: 'Ondoa picha',
  },
  // ── LA FILE DE L'ÉQUIPE ──
  equipe_recharges: {
    fr: 'Recharges de crédit',
    en: 'Credit top-ups',
    it: 'Ricariche di credito',
    de: 'Guthaben-Aufladungen',
    sw: 'Kujaza salio',
  },
  equipe_recharges_vide: {
    fr: 'Aucune demande de recharge en attente.',
    en: 'No pending top-up requests.',
    it: 'Nessuna richiesta di ricarica in attesa.',
    de: 'Keine offenen Aufladeanfragen.',
    sw: 'Hakuna maombi ya kujaza salio yanayosubiri.',
  },
  equipe_recharge_moyen: {
    fr: 'Moyen annoncé',
    en: 'Stated method',
    it: 'Metodo dichiarato',
    de: 'Angegebener Weg',
    sw: 'Njia iliyotajwa',
  },
  equipe_recharge_solde: {
    fr: 'Solde actuel',
    en: 'Current balance',
    it: 'Saldo attuale',
    de: 'Aktuelles Guthaben',
    sw: 'Salio la sasa',
  },
  equipe_recharge_crediter: {
    fr: 'Créditer {montant}',
    en: 'Credit {montant}',
    it: 'Accredita {montant}',
    de: '{montant} gutschreiben',
    sw: 'Weka {montant}',
  },
  equipe_recharge_refuser: {
    fr: 'Refuser',
    en: 'Reject',
    it: 'Rifiuta',
    de: 'Ablehnen',
    sw: 'Kataa',
  },
  equipe_recharge_verifier: {
    fr: 'Vérifiez que l’argent est bien arrivé avant de créditer.',
    en: 'Check the money has actually arrived before crediting.',
    it: 'Verifica che il denaro sia arrivato prima di accreditare.',
    de: 'Prüfen Sie, ob das Geld eingegangen ist, bevor Sie gutschreiben.',
    sw: 'Hakikisha fedha zimefika kabla ya kuweka salio.',
  },
  trip_payer_credit: {
    fr: '💳 Payer avec mon crédit',
    en: '💳 Pay with my credit',
    sw: '💳 Lipa kwa salio langu',
    it: '💳 Paga con il mio credito',
    de: '💳 Mit meinem Guthaben bezahlen',
  },
  ncolis_bon_proposer: {
    fr: '🎁 Utiliser un bon colis offert ({n} disponible(s)) — envoi gratuit',
    en: '🎁 Use a free parcel voucher ({n} available) — free delivery',
    sw: '🎁 Tumia vocha ya mzigo bure ({n} zipo) — usafirishaji bure',
    it: '🎁 Usa un buono pacco gratuito ({n} disponibili) — consegna gratis',
    de: '🎁 Gratis-Paketgutschein einlösen ({n} verfügbar) — kostenlose Lieferung',
  },
  ncolis_bon_actif: {
    fr: '🎁 Bon appliqué : cet envoi est OFFERT. Touchez pour retirer.',
    en: '🎁 Voucher applied: this delivery is FREE. Tap to remove.',
    sw: '🎁 Vocha imetumika: usafirishaji huu ni BURE. Gusa kuondoa.',
    it: '🎁 Buono applicato: questa consegna è GRATUITA. Tocca per rimuoverlo.',
    de: '🎁 Gutschein aktiviert: Diese Lieferung ist KOSTENLOS. Zum Entfernen tippen.',
  },
  ncolis_offert: { fr: 'OFFERT', en: 'FREE', sw: 'BURE' , it: 'GRATIS', de: 'GRATIS' },
  equipe_credit_titre: {
    fr: 'Hôtels partenaires',
    en: 'Partner hotels',
    sw: 'Hoteli washirika',
  },
  equipe_hotels_conseil_fiche: {
    fr: 'Touchez un établissement pour ouvrir sa fiche : coordonnées, solde, historique et ajout de crédit.',
    en: 'Tap an establishment to open its file: details, balance, history and credit top-up.',
    sw: 'Gusa hoteli kufungua faili lake: mawasiliano, salio, historia na kuongeza salio.',
  },
  equipe_credit_conseil: {
    fr: 'Créditez un partenaire APRÈS avoir reçu son argent (carte bancaire, portefeuille mobile, virement). Un montant négatif corrige une erreur.',
    en: 'Credit a hotel AFTER receiving its money (credit card, mobile wallet, transfer). A negative amount fixes a mistake.',
    sw: 'Ongeza salio la hoteli BAADA ya kupokea pesa yake (kadi ya benki, pochi ya simu, uhamisho). Kiasi hasi hurekebisha kosa.',
  },
  equipe_credit_montant: { fr: 'Montant (USD)', en: 'Amount (USD)', sw: 'Kiasi (USD)' },
  equipe_crediter: { fr: 'Créditer', en: 'Credit', sw: 'Ongeza salio' },
  equipe_action_erreur: {
    fr: "L'action a échoué — réessayez.",
    en: 'The action failed — try again.',
    sw: 'Hatua imeshindikana — jaribu tena.',
  },
  titre_nouveau_colis: { fr: 'Nouveau colis', en: 'New parcel', sw: 'Mzigo mpya' , it: 'Nuovo pacco', de: 'Neues Paket' },
  titre_colis: { fr: 'Colis', en: 'Parcel', sw: 'Mzigo' , it: 'Pacco', de: 'Paket' },
  titre_course: { fr: 'Course', en: 'Ride', sw: 'Safari' , it: 'Corsa', de: 'Fahrt' },

  // --- Accueil ---------------------------------------------------------------
  accueil_question: { fr: 'Qui êtes-vous ?', en: 'Who are you?', sw: 'Wewe ni nani?' , it: 'Chi sei?', de: 'Wer sind Sie?' },
  accueil_visiteur_titre: {
    fr: 'Visiteur · Touriste ou Résident',
    en: 'Visitor · Tourist or Resident',
    sw: 'Mgeni · Mtalii au Mkazi',
    it: 'Visitatore · Turista o Residente',
    de: 'Besucher · Tourist oder Ansässiger',
  },
  accueil_visiteur_soustitre: {
    fr: 'Prix en USD',
    en: 'Prices in USD',
    sw: 'Bei kwa USD',
    it: 'Prezzi in USD',
    de: 'Preise in USD',
  },
  accueil_local_titre: {
    fr: 'Locaux · Carte tanzanienne',
    en: 'Locals · Tanzanian ID',
    sw: 'Wazawa · Kitambulisho cha NIDA',
    it: 'Residenti · Documento tanzaniano',
    de: 'Einheimische · Tansanischer Ausweis',
  },
  accueil_local_soustitre: {
    fr: 'Prix en TZS',
    en: 'Prices in TZS',
    sw: 'Bei kwa TZS',
    it: 'Prezzi in TZS',
    de: 'Preise in TZS',
  },
  accueil_local_mention: {
    fr: 'Carte vérifiée par l’équipe avant la première réservation',
    en: 'ID checked by the team before your first booking',
    sw: 'Kitambulisho kitahakikiwa kabla ya safari ya kwanza',
    it: 'Documento verificato dal team prima della prima prenotazione',
    de: 'Ausweis wird vom Team vor der ersten Buchung geprüft',
  },
  accueil_hotel_titre: {
    fr: 'Hôtel ou restaurant',
    en: 'Hotel or restaurant',
    sw: 'Hoteli au mgahawa',
    it: 'Hotel o ristorante',
    de: 'Hotel oder Restaurant',
  },
  accueil_hotel_soustitre: {
    fr: 'Taxis pour vos clients, colis entre les villes',
    en: 'Taxis for your customers, parcels between towns',
    sw: 'Teksi kwa wateja wako, mizigo kati ya miji',
    it: 'Taxi per i vostri clienti, pacchi tra le città',
    de: 'Taxis für Ihre Gäste, Pakete zwischen den Orten',
  },
  accueil_chauffeur_titre: {
    fr: 'Chauffeur — Taxi Partner',
    en: 'Driver — Taxi Partner',
    sw: 'Dereva — Taxi Partner',
    it: 'Autista — Taxi Partner',
    de: 'Fahrer — Taxi Partner',
  },
  accueil_chauffeur_soustitre: {
    fr: 'Accédez à vos courses et scannez les QR',
    en: 'Access your rides and scan QR codes',
    sw: 'Fungua safari zako na skani QR',
    it: 'Accedi alle tue corse e scansiona i QR',
    de: 'Zu Ihren Fahrten und QR-Codes scannen',
  },
  accueil_pied: {
    fr: 'Déjà inscrit ? Choisissez votre profil : votre numéro de téléphone vous reconnaît.',
    en: 'Already registered? Pick your profile — your phone number signs you in.',
    sw: 'Umeshajisajili? Chagua wasifu wako — namba yako ya simu inakutambua.',
    it: 'Già registrato? Scegli il tuo profilo — il tuo numero di telefono ti riconosce.',
    de: 'Schon registriert? Wählen Sie Ihr Profil — Ihre Telefonnummer erkennt Sie.',
  },
  accueil_confiance: {
    fr: 'Tous nos chauffeurs sont vérifiés et disposent de tous les papiers en règle',
    en: 'All our drivers are verified and fully licensed',
    sw: 'Madereva wetu wote wamethibitishwa na wana nyaraka zote halali',
    it: 'Tutti i nostri autisti sono verificati e in regola con i documenti',
    de: 'Alle unsere Fahrer sind geprüft und vollständig zugelassen',
  },
  version_maj_recues: {
    fr: 'Cette application reçoit bien les mises à jour.',
    en: 'This app is receiving updates.',
    sw: 'Programu hii inapokea masasisho.',
    it: 'Questa app riceve gli aggiornamenti.',
    de: 'Diese App erhält Updates.',
  },
  version_maj_absentes: {
    fr: 'Cette application NE REÇOIT PLUS les mises à jour — réinstallez-la depuis le lien de l’équipe.',
    en: 'This app is NO LONGER receiving updates — reinstall it from the team’s link.',
    sw: 'Programu hii HAIPOKEI tena masasisho — isakinishe upya kwa kiungo cha timu.',
    it: 'Questa app NON riceve più aggiornamenti — reinstallala dal link del team.',
    de: 'Diese App erhält KEINE Updates mehr — installieren Sie sie über den Team-Link neu.',
  },
  version_socle: {
    fr: 'Socle {socle} · canal {canal}',
    en: 'Base {socle} · channel {canal}',
    sw: 'Msingi {socle} · njia {canal}',
    it: 'Base {socle} · canale {canal}',
    de: 'Basis {socle} · Kanal {canal}',
  },
  embleme_titre: {
    fr: 'Notre emblème, et ce qu’il engage',
    en: 'Our emblem, and what it commits us to',
    sw: 'Alama yetu, na ahadi yake',
    it: 'Il nostro emblema, e ciò che impegna',
    de: 'Unser Wappentier — und was es verpflichtet',
  },
  embleme_texte: {
    fr: 'Le colobe roux ne vit que sur cette île. Ce sont les voitures qui le tuent. Nos chauffeurs ralentissent dans la traversée de Jozani, et l’application le leur rappelle sur chaque course qui y passe.',
    en: 'The red colobus lives on this island and nowhere else. Cars are what kill it. Our drivers slow down through Jozani, and the app reminds them on every ride that crosses it.',
    sw: 'Kima punju anaishi kisiwa hiki tu. Magari ndiyo yanayomuua. Madereva wetu hupunguza mwendo wanapopita Jozani, na programu huwakumbusha kila safari inayopita hapo.',
    it: 'Il colobo rosso vive solo su quest’isola. Sono le auto a ucciderlo. I nostri autisti rallentano attraversando Jozani, e l’app glielo ricorda a ogni corsa che ci passa.',
    de: 'Der Rote Stummelaffe lebt nur auf dieser Insel. Autos sind es, die ihn töten. Unsere Fahrer verlangsamen durch Jozani, und die App erinnert sie bei jeder Fahrt daran.',
  },
  jozani_titre: {
    fr: 'Traversée de Jozani — ralentissez',
    en: 'Crossing Jozani — slow down',
    sw: 'Unapita Jozani — punguza mwendo',
    it: 'Attraversamento di Jozani — rallenta',
    de: 'Durchfahrt Jozani — langsam fahren',
  },
  jozani_texte: {
    fr: 'Les colobes roux traversent la route. Les voitures sont leur première cause de mortalité : avant les ralentisseurs, un singe était tué toutes les deux à trois semaines. Depuis, les collisions ont été divisées par deux. Respectez les ralentisseurs.',
    en: 'Red colobus cross this road. Cars are their leading cause of death: before the speed bumps, one monkey was killed every two to three weeks. Collisions have halved since. Respect the speed bumps.',
    sw: 'Kima punju huvuka barabara hii. Magari ndiyo sababu kuu ya vifo vyao: kabla ya matuta, kima mmoja aliuawa kila wiki mbili au tatu. Tangu wakati huo ajali zimepungua kwa nusu. Heshimu matuta.',
    it: 'I colobi rossi attraversano questa strada. Le auto sono la loro prima causa di morte: prima dei dossi, una scimmia veniva uccisa ogni due o tre settimane. Da allora le collisioni si sono dimezzate. Rispetta i dossi.',
    de: 'Rote Stummelaffen überqueren diese Straße. Autos sind ihre häufigste Todesursache: vor den Bodenschwellen wurde alle zwei bis drei Wochen ein Affe getötet. Seither haben sich die Kollisionen halbiert. Beachten Sie die Bodenschwellen.',
  },
  // LE SLOGAN de l'accueil (demande du client : « déplacez-vous easy sur
  // ZANZIBAR ») — il coiffe le bandeau de l'île, premier regard de l'écran
  // Réserver. « easy » voyage tel quel dans les langues qui l'adoptent.
  accueil_slogan: {
    fr: 'Déplacez-vous easy sur Zanzibar',
    en: 'Move around Zanzibar, easy',
    sw: 'Zunguka Zanzibar kwa urahisi',
    it: 'Muoviti easy per Zanzibar',
    de: 'Easy unterwegs auf Sansibar',
  },
  ile_legende: {
    fr: '{villes} villes desservies, du nord de Nungwi à la pointe de Kizimkazi.',
    en: '{villes} towns served, from Nungwi in the north to the tip of Kizimkazi.',
    sw: 'Miji {villes} inahudumiwa, kutoka Nungwi kaskazini hadi ncha ya Kizimkazi.',
    it: '{villes} località servite, da Nungwi a nord fino alla punta di Kizimkazi.',
    de: '{villes} Orte bedient, von Nungwi im Norden bis zur Spitze von Kizimkazi.',
  },
  ile_alt: {
    fr: 'Unguja en relief : les villes desservies et les routes de zanziGo',
    en: 'Unguja in relief: the towns served and zanziGo’s roads',
    sw: 'Unguja katika mwinuko: miji inayohudumiwa na barabara za zanziGo',
    it: 'Unguja in rilievo: le località servite e le strade di zanziGo',
    de: 'Unguja als Relief: die bedienten Orte und die Straßen von zanziGo',
  },

  // --- Téléphone / OTP -------------------------------------------------------
  tel_bienvenue: { fr: 'Bienvenue', en: 'Welcome', sw: 'Karibu' , it: 'Benvenuto', de: 'Willkommen' },
  tel_profil_choisi: {
    fr: 'Profil choisi : {profil}',
    en: 'Selected profile: {profil}',
    sw: 'Wasifu uliochagua: {profil}',
    it: 'Profilo selezionato: {profil}',
    de: 'Gewähltes Profil: {profil}',
  },
  tel_intro: {
    fr: 'Entrez votre numéro de téléphone pour recevoir votre code de connexion.',
    en: 'Enter your phone number to receive your sign-in code.',
    sw: 'Weka namba yako ya simu kupokea msimbo wa kuingia.',
    it: 'Inserisci il tuo numero di telefono per ricevere il codice di accesso.',
    de: 'Geben Sie Ihre Telefonnummer ein, um Ihren Anmeldecode zu erhalten.',
  },
  tel_intro_chauffeur: {
    fr: 'Déjà Taxi Partner ? Numéro + mot de passe : vous retrouvez directement votre compte. Nouveau ? Créez votre compte puis déposez votre candidature.',
    en: 'Already a Taxi Partner? Number + password gets you straight back to your account. New? Create your account, then submit your application.',
    sw: 'Tayari Taxi Partner? Namba + nenosiri: unarudi moja kwa moja kwenye akaunti yako. Mpya? Fungua akaunti kisha uwasilishe maombi yako.',
    it: 'Già Taxi Partner? Numero + password e torni subito nel tuo account. Nuovo? Crea il tuo account, poi invia la candidatura.',
    de: 'Schon Taxi Partner? Nummer + Passwort bringen Sie direkt zurück in Ihr Konto. Neu? Konto erstellen und dann Bewerbung einreichen.',
  },
  tel_indicatif: { fr: 'Indicatif', en: 'Country code', sw: 'Msimbo wa nchi' , it: 'Prefisso internazionale', de: 'Ländervorwahl' },
  tel_numero: { fr: 'Numéro de téléphone', en: 'Phone number', sw: 'Namba ya simu' , it: 'Numero di telefono', de: 'Telefonnummer' },
  tel_bouton: { fr: 'Recevoir mon code', en: 'Get my code', sw: 'Pokea msimbo wangu' , it: 'Ricevi il mio codice', de: 'Meinen Code erhalten' },
  tel_erreur_numero: {
    fr: 'Numéro invalide. Exemple : +255 712 345 678.',
    en: 'Invalid number. Example: +255 712 345 678.',
    sw: 'Namba si sahihi. Mfano: +255 712 345 678.',
    it: 'Numero non valido. Esempio: +255 712 345 678.',
    de: 'Ungültige Nummer. Beispiel: +255 712 345 678.',
  },
  tel_erreur_envoi: {
    fr: "Impossible d'envoyer le code. Réessayez.",
    en: "Couldn't send the code. Please try again.",
    sw: 'Imeshindikana kutuma msimbo. Jaribu tena.',
    it: 'Impossibile inviare il codice. Riprova.',
    de: 'Code konnte nicht gesendet werden. Bitte erneut versuchen.',
  },
  pilote_message: {
    fr: "Le code s'affiche à l'écran — phase de test sans SMS.",
    en: 'The code is shown on screen — test phase, no SMS.',
    sw: 'Msimbo unaonekana kwenye skrini — awamu ya majaribio bila SMS.',
  },
  otp_titre: { fr: 'Vérification', en: 'Verification', sw: 'Uthibitisho' , it: 'Verifica', de: 'Bestätigung' },
  otp_intro: {
    fr: 'Saisissez le code à 6 chiffres pour le numéro {phone}.',
    en: 'Enter the 6-digit code for {phone}.',
    sw: 'Weka msimbo wa tarakimu 6 kwa namba {phone}.',
    it: 'Inserisci il codice a 6 cifre per {phone}.',
    de: 'Geben Sie den 6-stelligen Code für {phone} ein.',
  },
  otp_pilote_titre: {
    fr: "Phase de test sans SMS — votre code s'affiche ici :",
    en: 'Test phase, no SMS — your code appears here:',
    sw: 'Awamu ya majaribio bila SMS — msimbo wako uko hapa:',
    it: 'Fase di test, nessun SMS — il tuo codice appare qui:',
    de: 'Testphase, keine SMS — Ihr Code erscheint hier:',
  },
  otp_pilote_astuce: {
    fr: 'Touchez pour le remplir automatiquement',
    en: 'Tap to fill it automatically',
    sw: 'Gusa ujaze moja kwa moja',
    it: 'Tocca per inserirlo automaticamente',
    de: 'Zum automatischen Ausfüllen tippen',
  },
  otp_bouton: { fr: 'Confirmer le code', en: 'Confirm code', sw: 'Thibitisha msimbo' , it: 'Conferma il codice', de: 'Code bestätigen' },
  otp_changer_numero: { fr: 'Changer de numéro', en: 'Change number', sw: 'Badilisha namba' , it: 'Cambia numero', de: 'Nummer ändern' },
  otp_erreur_code: {
    fr: 'Le code comporte 6 chiffres.',
    en: 'The code has 6 digits.',
    sw: 'Msimbo una tarakimu 6.',
    it: 'Il codice è composto da 6 cifre.',
    de: 'Der Code besteht aus 6 Ziffern.',
  },
  otp_erreur_invalide: {
    fr: 'Code invalide ou expiré. Réessayez.',
    en: 'Invalid or expired code. Try again.',
    sw: 'Msimbo si sahihi au umepitwa na muda. Jaribu tena.',
    it: 'Codice non valido o scaduto. Riprova.',
    de: 'Ungültiger oder abgelaufener Code. Bitte erneut versuchen.',
  },

  // --- Profil client (création) ----------------------------------------------
  client_titre: { fr: 'Votre profil client', en: 'Your customer profile', sw: 'Wasifu wako wa mteja' , it: 'Il tuo profilo cliente', de: 'Ihr Kundenprofil' },
  client_numero_verifie: {
    fr: 'Numéro vérifié : {phone}',
    en: 'Verified number: {phone}',
    sw: 'Namba iliyothibitishwa: {phone}',
    it: 'Numero verificato: {phone}',
    de: 'Bestätigte Nummer: {phone}',
  },
  client_info_touriste: {
    fr: 'Compte touriste — prix en USD, actif immédiatement.',
    en: 'Tourist account — USD prices, active right away.',
    sw: 'Akaunti ya mtalii — bei kwa USD, inaanza mara moja.',
    it: 'Account turista — prezzi in USD, attivo subito.',
    de: 'Touristenkonto — Preise in USD, sofort aktiv.',
  },
  client_info_local: {
    fr: 'Compte local — tarif local à partir de {prix}, une fois votre carte tanzanienne validée.',
    en: 'Local account — local fares from {prix}, once your Tanzanian ID is validated.',
    sw: 'Akaunti ya mzawa — bei ya wenyeji kuanzia {prix}, baada ya kitambulisho chako kuhakikiwa.',
    it: 'Account residente — tariffa locale a partire da {prix}, una volta convalidato il tuo documento tanzaniano.',
    de: 'Konto für Einheimische — Einheimischentarif ab {prix}, sobald Ihr tansanischer Ausweis bestätigt ist.',
  },
  client_nom: { fr: 'Nom complet', en: 'Full name', sw: 'Jina kamili' , it: 'Nome e cognome', de: 'Vollständiger Name' },
  client_email_opt: { fr: 'E-mail (optionnel)', en: 'Email (optional)', sw: 'Barua pepe (hiari)' , it: 'E-mail (facoltativa)', de: 'E-Mail (optional)' },
  client_vous_etes: { fr: 'Vous êtes…', en: 'You are…', sw: 'Wewe ni…' , it: 'Sei…', de: 'Sie sind …' },
  client_type_touriste: { fr: 'Touriste', en: 'Tourist', sw: 'Mtalii' , it: 'Turista', de: 'Tourist' },
  client_type_touriste_desc: {
    fr: 'Prix en USD plein tarif, compte actif immédiatement.',
    en: 'Full USD prices, account active right away.',
    sw: 'Bei kamili kwa USD, akaunti inaanza mara moja.',
    it: 'Prezzi pieni in USD, account attivo subito.',
    de: 'Volle Preise in USD, Konto sofort aktiv.',
  },
  client_type_resident: { fr: 'Résident', en: 'Resident', sw: 'Mkazi' , it: 'Residente', de: 'Ansässig' },
  client_type_local: { fr: 'Local', en: 'Local', sw: 'Mwenyeji' , it: 'Residente', de: 'Einheimisch' },
  // --- Fiche course côté équipe : heure, détails dépliables, point exact ---
  equipe_course_demandee: { fr: 'Demandée', en: 'Requested', sw: 'Iliombwa' },
  equipe_course_details_voir: { fr: 'Voir les détails', en: 'View details', sw: 'Ona maelezo' },
  equipe_course_details_masquer: { fr: 'Masquer les détails', en: 'Hide details', sw: 'Ficha maelezo' },
  equipe_course_point_exact: {
    fr: 'Point de rendez-vous exact',
    en: 'Exact pickup point',
    sw: 'Mahali hasa pa kuchukua',
  },
  equipe_course_point_non_partage: {
    fr: 'Position exacte non partagée par le client',
    en: 'Client has not shared an exact location',
    sw: 'Mteja hajashiriki mahali hasa',
  },
  equipe_course_commission: { fr: 'Commission zanziGo', en: 'zanziGo commission', sw: 'Kamisheni ya zanziGo' },
  equipe_course_net_chauffeur: { fr: 'Le chauffeur reçoit', en: 'Driver receives', sw: 'Dereva anapokea' },
  client_type_resident_desc: {
    fr: 'Prix en USD avec remise de 5 % après validation de vos documents de résidence (sous 48 h).',
    en: 'USD prices with a 5% discount once your residence documents are validated (within 48 h).',
    sw: 'Bei kwa USD na punguzo la 5% baada ya nyaraka zako za ukazi kuhakikiwa (ndani ya saa 48).',
    it: 'Prezzi in USD con uno sconto del 5% una volta convalidati i documenti di residenza (entro 48 h).',
    de: 'Preise in USD mit 5 % Rabatt, sobald Ihr Aufenthaltsnachweis bestätigt ist (innerhalb von 48 Std.).',
  },
  client_doc_resident_titre: {
    fr: 'Documents de résidence (obligatoire)',
    en: 'Residence documents (required)',
    sw: 'Nyaraka za ukazi (lazima)',
    it: 'Documenti di residenza (obbligatori)',
    de: 'Aufenthaltsnachweis (erforderlich)',
  },
  client_doc_resident_desc: {
    fr: "Permis de résidence, visa long séjour… — photo lisible. L'équipe zanziGo valide vos documents avant d'activer la remise de 5 %.",
    en: 'Residence permit, long-stay visa… — clear photo. The zanziGo team validates your documents before activating the 5% discount.',
    sw: 'Kibali cha ukazi, viza ya muda mrefu… — picha inayosomeka. Timu ya zanziGo itahakiki nyaraka zako kabla ya kuwasha punguzo la 5%.',
    it: 'Permesso di soggiorno, visto di lunga durata… — foto nitida. Il team zanziGo convalida i documenti prima di attivare lo sconto del 5%.',
    de: 'Aufenthaltserlaubnis, Langzeitvisum … — scharfes Foto. Das zanziGo-Team prüft Ihre Unterlagen, bevor der Rabatt von 5 % aktiviert wird.',
  },
  client_doc_local_titre: {
    fr: "Carte d'identité tanzanienne (NIDA)",
    en: 'Tanzanian ID card (NIDA)',
    sw: 'Kitambulisho cha Taifa (NIDA)',
    it: 'Carta d\'identità tanzaniana (NIDA)',
    de: 'Tansanischer Personalausweis (NIDA)',
  },
  client_doc_local_desc: {
    fr: "Photo lisible de votre carte NIDA (obligatoire). L'équipe zanziGo la vérifie avant d'activer le tarif local, à partir de {prix}.",
    en: 'Clear photo of your NIDA card (required). The zanziGo team checks it before activating local fares, from {prix}.',
    sw: 'Picha inayosomeka ya kitambulisho chako cha NIDA (lazima). Timu ya zanziGo itakihakiki kabla ya kuwasha bei ya wenyeji, kuanzia {prix}.',
    it: 'Foto nitida della tua carta NIDA (obbligatoria). Il team zanziGo la verifica prima di attivare la tariffa locale, a partire da {prix}.',
    de: 'Scharfes Foto Ihrer NIDA-Karte (erforderlich). Das zanziGo-Team prüft sie, bevor der Einheimischentarif ab {prix} aktiviert wird.',
  },
  client_doc_ajoute: { fr: 'Document ajouté', en: 'Document added', sw: 'Nyaraka imeongezwa' , it: 'Documento aggiunto', de: 'Dokument hinzugefügt' },
  client_doc_changer: { fr: 'Changer', en: 'Change', sw: 'Badilisha' , it: 'Cambia', de: 'Ändern' },
  client_doc_ajouter: { fr: 'Ajouter mon document', en: 'Add my document', sw: 'Ongeza nyaraka yangu' , it: 'Aggiungi il mio documento', de: 'Mein Dokument hinzufügen' },
  client_bouton: { fr: 'Créer mon profil', en: 'Create my profile', sw: 'Tengeneza wasifu wangu' , it: 'Crea il mio profilo', de: 'Mein Profil erstellen' },
  client_erreur_nom: { fr: 'Indiquez votre nom complet.', en: 'Enter your full name.', sw: 'Weka jina lako kamili.' , it: 'Inserisci il tuo nome e cognome.', de: 'Geben Sie Ihren vollständigen Namen ein.' },
  client_erreur_doc_resident: {
    fr: 'Ajoutez vos documents de résidence : ils sont requis pour un compte résident.',
    en: 'Add your residence documents: they are required for a resident account.',
    sw: 'Ongeza nyaraka zako za ukazi: zinahitajika kwa akaunti ya mkazi.',
    it: 'Aggiungi i tuoi documenti di residenza: sono obbligatori per un account residente.',
    de: 'Fügen Sie Ihren Aufenthaltsnachweis hinzu: Er ist für ein Konto für Ansässige erforderlich.',
  },
  client_erreur_doc_local: {
    fr: "Ajoutez votre carte d'identité tanzanienne : elle est requise pour un compte local.",
    en: 'Add your Tanzanian ID card: it is required for a local account.',
    sw: 'Ongeza kitambulisho chako cha NIDA: kinahitajika kwa akaunti ya mzawa.',
    it: 'Aggiungi la tua carta d\'identità tanzaniana: è obbligatoria per un account residente.',
    de: 'Fügen Sie Ihren tansanischen Personalausweis hinzu: Er ist für ein Konto für Einheimische erforderlich.',
  },
  client_erreur_photos: {
    fr: "Autorisez l'accès aux photos pour ajouter votre document.",
    en: 'Allow photo access to add your document.',
    sw: 'Ruhusu ufikiaji wa picha ili kuongeza nyaraka yako.',
    it: 'Consenti l\'accesso alle foto per aggiungere il tuo documento.',
    de: 'Erlauben Sie den Fotozugriff, um Ihr Dokument hinzuzufügen.',
  },
  // --- Alertes instantanées sur le téléphone de l'équipe ---
  alertes_titre: {
    fr: '🔔 Alertes instantanées',
    en: '🔔 Instant alerts',
    sw: '🔔 Arifa za papo hapo',
  },
  alertes_intro: {
    fr: "Faites sonner CE téléphone dès qu'une réservation arrive : une à trois secondes, au lieu d'une trentaine de secondes par WhatsApp. Le message WhatsApp continue d'arriver, il garde la trace écrite.",
    en: 'Make THIS phone ring as soon as a booking arrives: one to three seconds instead of about thirty by WhatsApp. The WhatsApp message still arrives as a written record.',
    sw: 'Fanya SIMU HII iite mara tu uhifadhi unapoingia: sekunde moja hadi tatu badala ya thelathini kwa WhatsApp. Ujumbe wa WhatsApp bado unafika kama kumbukumbu.',
  },
  alertes_activer: {
    fr: 'Recevoir les alertes sur ce téléphone',
    en: 'Get alerts on this phone',
    sw: 'Pokea arifa kwenye simu hii',
  },
  alertes_actives: {
    fr: 'Ce téléphone reçoit les alertes instantanées.',
    en: 'This phone receives instant alerts.',
    sw: 'Simu hii inapokea arifa za papo hapo.',
  },
  alertes_couper: {
    fr: 'Ne plus recevoir les alertes ici',
    en: 'Stop alerts on this phone',
    sw: 'Acha kupokea arifa hapa',
  },
  alertes_tester: {
    fr: 'Envoyer une alerte d\'essai',
    en: 'Send a test alert',
    sw: 'Tuma arifa ya majaribio',
  },
  bourse_alertes_titre: {
    fr: '🔔 Activez les alertes pour être prévenu des nouvelles courses à prendre',
    en: '🔔 Turn on alerts to hear about new rides to grab',
    sw: '🔔 Washa arifa upate habari za safari mpya za kuchukua',
  },
  bourse_alertes_bouton: {
    fr: 'Activer maintenant',
    en: 'Turn on now',
    sw: 'Washa sasa',
  },
  alertes_ok: {
    fr: '✓ Alertes activées. Faites un essai pour vérifier que le téléphone sonne.',
    en: '✓ Alerts on. Send a test to check the phone rings.',
    sw: '✓ Arifa zimewashwa. Jaribu ili kuthibitisha simu inaita.',
  },
  alertes_coupees: {
    fr: 'Alertes coupées sur ce téléphone.',
    en: 'Alerts stopped on this phone.',
    sw: 'Arifa zimezimwa kwenye simu hii.',
  },
  alertes_test_envoye: {
    fr: "Alerte d'essai envoyée à {n} téléphone(s) — elle doit arriver tout de suite.",
    en: 'Test alert sent to {n} phone(s) — it should arrive right away.',
    sw: 'Arifa ya majaribio imetumwa kwa simu {n} — inapaswa kufika mara moja.',
  },
  // Deuxième ligne d'un lieu dans la liste : distance et temps de route.
  lieu_distance: {
    fr: '{km} km · environ {min} min de route',
    en: '{km} km · about {min} min drive',
    sw: 'km {km} · dakika {min} hivi barabarani',
    it: '{km} km · circa {min} min di strada',
    de: '{km} km · etwa {min} Min. Fahrt',
  },
  // Rappel de la distance sur le récapitulatif de prix.
  course_distance: {
    fr: '{km} km · environ {min} min',
    en: '{km} km · about {min} min',
    sw: 'km {km} · dakika {min} hivi',
    it: '{km} km · circa {min} min',
    de: '{km} km · etwa {min} Min.',
  },
  reserver_options_titre: {
    fr: 'Options du trajet',
    en: 'Trip options',
    sw: 'Chaguo za safari',
    it: 'Opzioni del viaggio',
    de: 'Optionen der Fahrt',
  },
  reserver_aller_retour_court: {
    fr: 'Aller-retour', en: 'Round trip', sw: 'Kwenda na kurudi', it: 'Andata e ritorno', de: 'Hin und zurück',
  },
  reserver_bagages_court: {
    fr: 'Gros bagages', en: 'Large luggage', sw: 'Mizigo mikubwa', it: 'Bagagli voluminosi', de: 'Großes Gepäck',
  },
  alertes_test_vide: {
    fr: "Aucun téléphone n'est encore abonné aux alertes.",
    en: 'No phone is subscribed to alerts yet.',
    sw: 'Hakuna simu iliyojisajili kwa arifa bado.',
  },
  alertes_iphone: {
    fr:
      "Cet écran est ouvert dans Safari — voyez la barre d'adresse en bas. C'est elle qui bloque les alertes : Apple ne les autorise que depuis l'écran d'accueil de l'iPhone.\n\n" +
      "1) Touchez Partager, le carré avec la flèche, en bas de Safari.\n" +
      "2) Faites défiler la liste et choisissez « Sur l'écran d'accueil ». Attention : « Ajouter aux favoris » ou « Ajouter à la liste de lecture » ne servent à rien ici.\n" +
      "3) Quittez Safari. Sur l'écran d'accueil de l'iPhone, touchez la nouvelle icône zanziGo.\n" +
      "4) Vous saurez que c'est la bonne : il n'y a plus aucune barre d'adresse en bas. Reconnectez-vous, ressaisissez la clé équipe (cette icône a sa propre mémoire), et le bouton d'activation apparaîtra ici.",
    en:
      'This screen is open in Safari — see the address bar at the bottom. That is what blocks alerts: Apple only allows them from the iPhone home screen.\n\n' +
      '1) Tap Share, the square with the arrow, at the bottom of Safari.\n' +
      '2) Scroll the list and choose "Add to Home Screen". Careful: "Add to Favourites" or "Add to Reading List" do nothing here.\n' +
      '3) Leave Safari. On the iPhone home screen, tap the new zanziGo icon.\n' +
      '4) You will know it is the right one: there is no address bar at all. Log in, re-enter the team key (that icon has its own memory), and the activation button will appear here.',
    sw:
      'Skrini hii imefunguliwa katika Safari — angalia upau wa anwani chini. Ndio unaozuia arifa: Apple huruhusu tu kutoka skrini ya kwanza ya iPhone.\n\n' +
      '1) Gusa Share, mraba wenye mshale, chini ya Safari.\n' +
      '2) Sogeza orodha na uchague "Add to Home Screen". Tahadhari: "Add to Favourites" haisaidii hapa.\n' +
      '3) Toka Safari. Kwenye skrini ya kwanza, gusa aikoni mpya ya zanziGo.\n' +
      '4) Utajua ni sahihi: hakuna upau wa anwani kabisa. Ingia tena, weka ufunguo wa timu (aikoni hiyo ina kumbukumbu yake), kisha kitufe cha kuwasha kitaonekana hapa.',
  },
  alertes_indisponible: {
    fr: "Ce navigateur ne sait pas recevoir d'alertes. Les messages WhatsApp continuent d'arriver normalement.",
    en: "This browser can't receive alerts. WhatsApp messages keep arriving as usual.",
    sw: 'Kivinjari hiki hakiwezi kupokea arifa. Ujumbe wa WhatsApp unaendelea kufika.',
  },
  carte_y_aller: {
    fr: '🧭 Y aller — lancer le GPS',
    en: '🧭 Go there — start GPS',
    sw: '🧭 Nenda — washa GPS',
    it: '🧭 Vai — avvia il GPS',
    de: '🧭 Hinfahren — GPS starten',
  },
  course_client_position: {
    fr: 'Où attend votre client',
    en: 'Where your client is waiting',
    sw: 'Mahali mteja wako anasubiri',
  },
  course_client_titre: {
    fr: 'Votre client',
    en: 'Your client',
    sw: 'Mteja wako',
    it: 'Il tuo cliente',
    de: 'Ihr Fahrgast',
  },
  // Le chauffeur doit comprendre qu'il ne manque rien : c'est l'argent qui
  // n'est pas encore validé, pas l'information qui a disparu.
  course_client_verrouille: {
    fr: "Le nom, le numéro et le point de rendez-vous exact de votre client s'afficheront ici dès que l'équipe aura validé le paiement. Départ prévu : {lieu}.",
    en: 'Your client’s name, phone number and exact meeting point will appear here as soon as the team has confirmed the payment. Pick-up: {lieu}.',
    sw: 'Jina, namba ya simu na mahali kamili pa kukutana na mteja vitaonekana hapa mara tu timu itakapothibitisha malipo. Mahali pa kuchukua: {lieu}.',
    it: 'Nome, numero di telefono e punto d’incontro esatto del cliente compariranno qui non appena il team avrà confermato il pagamento. Partenza: {lieu}.',
    de: 'Name, Telefonnummer und genauer Treffpunkt Ihres Fahrgasts erscheinen hier, sobald das Team die Zahlung bestätigt hat. Abfahrt: {lieu}.',
  },
  course_feu_vert: {
    fr: 'PAYÉE — vous pouvez y aller. Le nom, le numéro et le point de rendez-vous de votre client sont ci-dessus.',
    en: 'PAID — you can go. Your client’s name, phone and meeting point are above.',
    sw: 'IMELIPWA — unaweza kwenda. Jina, namba na mahali pa kukutana na mteja vipo hapo juu.',
    it: 'PAGATA — puoi partire. Nome, telefono e punto d’incontro del cliente sono qui sopra.',
    de: 'BEZAHLT — Sie können losfahren. Name, Telefon und Treffpunkt Ihres Fahrgasts stehen oben.',
  },
  courses_dispo_deja_payee: {
    fr: 'DÉJÀ PAYÉE — gain assuré',
    en: 'ALREADY PAID — guaranteed',
    sw: 'IMESHALIPWA — pesa uhakika',
    it: 'GIÀ PAGATA — guadagno certo',
    de: 'BEREITS BEZAHLT — sicherer Verdienst',
  },
  course_rendre_bouton: {
    fr: 'Je ne peux plus faire cette course',
    en: 'I can no longer do this ride',
    sw: 'Siwezi tena kufanya safari hii',
    it: 'Non posso più fare questa corsa',
    de: 'Ich kann diese Fahrt nicht mehr übernehmen',
  },
  course_rendre_titre: {
    fr: 'Rendre la course',
    en: 'Give the ride back',
    sw: 'Rudisha safari',
    it: 'Restituire la corsa',
    de: 'Fahrt zurückgeben',
  },
  course_rendre_confirm: {
    fr: "La course repartira tout de suite vers les autres chauffeurs, et l'équipe sera prévenue. Mieux vaut le dire maintenant que de ne pas venir.",
    en: 'The ride goes straight back to the other drivers and the team is told. Better to say so now than not to show up.',
    sw: 'Safari itarudi mara moja kwa madereva wengine na timu itajulishwa. Ni afadhali kusema sasa kuliko kutokufika.',
    it: 'La corsa torna subito agli altri autisti e il team viene avvisato. Meglio dirlo ora che non presentarsi.',
    de: 'Die Fahrt geht sofort an die anderen Fahrer zurück und das Team wird informiert. Besser jetzt Bescheid sagen als nicht zu erscheinen.',
  },
  course_rendre_oui: {
    fr: 'Oui, je la rends',
    en: 'Yes, give it back',
    sw: 'Ndiyo, nairudisha',
    it: 'Sì, la restituisco',
    de: 'Ja, zurückgeben',
  },
  course_rendue_ok: {
    fr: "C'est fait. Merci de l'avoir dit — un autre chauffeur va la prendre.",
    en: 'Done. Thank you for telling us — another driver will take it.',
    sw: 'Imekamilika. Asante kwa kutujulisha — dereva mwingine ataichukua.',
    it: 'Fatto. Grazie per averlo detto — un altro autista la prenderà.',
    de: 'Erledigt. Danke für die Nachricht — ein anderer Fahrer übernimmt sie.',
  },
  courses_contact_verrouille: {
    fr: 'Coordonnées du client dès que l’équipe valide le paiement',
    en: 'Client details as soon as the team confirms the payment',
    sw: 'Mawasiliano ya mteja mara timu itakapothibitisha malipo',
    it: 'Contatti del cliente non appena il team conferma il pagamento',
    de: 'Fahrgastdaten, sobald das Team die Zahlung bestätigt',
  },
  course_client_appeler: {
    fr: 'Appeler le client',
    en: 'Call the client',
    sw: 'Piga simu kwa mteja',
    it: 'Chiama il cliente',
    de: 'Fahrgast anrufen',
  },
  course_client_position_absente: {
    fr: "Votre client n'a pas encore partagé son point exact. Le lieu de départ indiqué reste : {lieu}.",
    en: "Your client hasn't shared an exact point yet. The pick-up given is: {lieu}.",
    sw: 'Mteja wako bado hajatuma eneo kamili. Mahali pa kuchukua palipotajwa ni: {lieu}.',
  },
  trip_point_rendez_vous: {
    fr: 'Où vous attendez',
    en: 'Where you are waiting',
    sw: 'Mahali unaposubiri',
    it: 'Dove stai aspettando',
    de: 'Wo Sie warten',
  },
  trip_partager_position: {
    fr: '📍 Partager ma position exacte au chauffeur',
    en: '📍 Share my exact position with the driver',
    sw: '📍 Tuma eneo langu kamili kwa dereva',
    it: '📍 Condividi la mia posizione esatta con l\'autista',
    de: '📍 Meinen genauen Standort mit dem Fahrer teilen',
  },
  trip_position_invite: {
    fr: 'Votre chauffeur ne voit que le nom du quartier. Un appui, et il sait exactement où venir vous prendre.',
    en: 'Your driver only sees the area name. One tap, and they know exactly where to pick you up.',
    sw: 'Dereva wako anaona jina la eneo pekee. Bonyeza mara moja, naye atajua hasa mahali pa kukuchukua.',
    it: 'Il tuo autista vede solo il nome della zona. Un tocco, e saprà esattamente dove venirti a prendere.',
    de: 'Ihr Fahrer sieht nur den Namen des Gebiets. Ein Tippen, und er weiß genau, wo er Sie abholen soll.',
  },
  trip_position_partagee: {
    fr: '✓ Position envoyée — votre chauffeur vous trouvera sans chercher.',
    en: '✓ Position sent — your driver will find you without searching.',
    sw: '✓ Eneo limetumwa — dereva wako atakupata bila kutafuta.',
    it: '✓ Posizione inviata — il tuo autista ti troverà senza cercarti.',
    de: '✓ Standort gesendet — Ihr Fahrer findet Sie ohne Suchen.',
  },
  trip_position_maj: {
    fr: '📍 J’ai bougé — renvoyer ma position',
    en: '📍 I moved — send my position again',
    sw: '📍 Nimehama — tuma eneo langu tena',
    it: '📍 Mi sono spostato — invia di nuovo la mia posizione',
    de: '📍 Ich habe mich bewegt — Standort erneut senden',
  },
  trip_suivre_taxi: {
    fr: '🚕 Voir où est mon taxi',
    en: '🚕 See where my taxi is',
    sw: '🚕 Ona teksi yangu ilipo',
    it: '🚕 Vedi dov\'è il mio taxi',
    de: '🚕 Sehen, wo mein Taxi ist',
  },
  trip_masquer_taxi: {
    fr: 'Masquer la carte',
    en: 'Hide the map',
    sw: 'Ficha ramani',
    it: 'Nascondi la mappa',
    de: 'Karte ausblenden',
  },
  trip_taxi_en_route: {
    fr: 'Votre taxi vient vers vous',
    en: 'Your taxi is on its way',
    sw: 'Teksi yako inakuja',
    it: 'Il tuo taxi sta arrivando',
    de: 'Ihr Taxi ist unterwegs',
  },
  trip_taxi_position_datee: {
    fr: 'Position relevée {quand}',
    en: 'Position taken {quand}',
    sw: 'Eneo lilipochukuliwa {quand}',
    it: 'Posizione rilevata {quand}',
    de: 'Standort erfasst {quand}',
  },
  trip_taxi_pas_repere: {
    fr: "Votre chauffeur n'a pas encore allumé son repérage. Rappuyez dans un instant, ou appelez l'équipe si vous l'attendez depuis longtemps.",
    en: "Your driver hasn't switched on location sharing yet. Try again in a moment, or call the team if you have been waiting a while.",
    sw: 'Dereva wako bado hajawasha utumaji wa eneo. Jaribu tena baadaye kidogo, au piga simu kwa timu ikiwa umesubiri muda mrefu.',
    it: 'Il tuo autista non ha ancora attivato la condivisione della posizione. Riprova tra poco, oppure chiama il team se stai aspettando da un po\'.',
    de: 'Ihr Fahrer hat die Standortfreigabe noch nicht aktiviert. Versuchen Sie es gleich erneut oder rufen Sie das Team an, wenn Sie schon länger warten.',
  },
  carte_itineraire: {
    fr: 'Ouvrir dans Google Maps (itinéraire)',
    en: 'Open in Google Maps (directions)',
    sw: 'Fungua katika Google Maps (njia)',
    it: 'Apri in Google Maps (indicazioni)',
    de: 'In Google Maps öffnen (Route)',
  },
  // La carte interactive de l'écran Réserver (web) : l'aide dit toujours le
  // PROCHAIN toucher utile — poser le départ, poser l'arrivée, recommencer.
  carte_aide_depart: {
    fr: 'Touchez une ville sur la carte : c\'est votre départ',
    en: 'Tap a town on the map: that\'s your pickup',
    sw: 'Gusa mji kwenye ramani: hapo ndipo unapoanzia',
    it: 'Tocca una località sulla mappa: è la tua partenza',
    de: 'Tippen Sie auf einen Ort auf der Karte: Ihr Startpunkt',
  },
  carte_aide_arrivee: {
    fr: 'Et maintenant, touchez votre arrivée',
    en: 'Now tap your destination',
    sw: 'Sasa gusa unakoenda',
    it: 'Ora tocca la tua destinazione',
    de: 'Tippen Sie jetzt auf Ihr Ziel',
  },
  carte_aide_recommencer: {
    fr: 'Trajet posé — touchez une autre ville pour recommencer',
    en: 'Route set — tap another town to start over',
    sw: 'Safari imewekwa — gusa mji mwingine kuanza upya',
    it: 'Percorso impostato — tocca un\'altra località per ricominciare',
    de: 'Strecke gesetzt — tippen Sie auf einen anderen Ort für neu',
  },
  equipe_annonce_groupe: {
    fr: 'Annoncer au groupe des chauffeurs',
    en: 'Post to the drivers group',
    sw: 'Tangaza kwenye kikundi cha madereva',
  },
  alertes_chauffeur_titre: {
    fr: '🔔 Alertes de courses',
    en: '🔔 Ride alerts',
    sw: '🔔 Arifa za safari',
  },
  alertes_chauffeur_intro: {
    fr: "Soyez prévenu en une seconde dès qu'une course vous est attribuée, payée ou annulée — même application fermée. Vous ne recevez que VOS courses : rien des autres chauffeurs, rien de l'équipe.",
    en: 'Be alerted within a second when a ride is assigned to you, paid or cancelled — even with the app closed. You only receive YOUR rides: nothing about other drivers, nothing from the team.',
    sw: 'Pata taarifa ndani ya sekunde moja safari inapokabidhiwa kwako, kulipwa au kufutwa — hata programu ikiwa imefungwa. Unapokea safari ZAKO pekee: hakuna za madereva wengine, hakuna za timu.',
  },
  alertes_chauffeur_appareil: {
    fr: 'Téléphone du chauffeur',
    en: 'Driver phone',
    sw: 'Simu ya dereva',
  },
  alertes_nom_appareil: {
    fr: "Téléphone de l'équipe",
    en: 'Team phone',
    sw: 'Simu ya timu',
  },
  version_etiquette: {
    fr: 'Version {version} — appuyez ici si l\'application semble bloquée',
    en: 'Version {version} — tap here if the app seems stuck',
    sw: 'Toleo {version} — gusa hapa ikiwa programu imekwama',
    it: 'Versione {version} — tocca qui se l\'app sembra bloccata',
    de: 'Version {version} — hier tippen, wenn die App hängt',
  },
  version_carte_titre: {
    fr: 'Version de l\'application',
    en: 'App version',
    sw: 'Toleo la programu',
    it: 'Versione dell\'app',
    de: 'App-Version',
  },
  version_carte_texte: {
    fr: 'Vous utilisez la version {version}. L\'application se met à jour toute seule ; si un écran semble figé ou périmé, ce bouton réinstalle la dernière version. Vous restez connecté, rien n\'est perdu.',
    en: 'You are running version {version}. The app updates itself; if a screen looks frozen or out of date, this button reinstalls the latest version. You stay logged in, nothing is lost.',
    sw: 'Unatumia toleo {version}. Programu hujisasisha yenyewe; skrini ikionekana imeganda au ni ya zamani, kitufe hiki husakinisha toleo jipya. Unabaki umeingia, hakuna kinachopotea.',
    it: 'Stai usando la versione {version}. L\'app si aggiorna da sola; se una schermata sembra bloccata o obsoleta, questo pulsante reinstalla l\'ultima versione. Resti connesso, non perdi nulla.',
    de: 'Sie verwenden Version {version}. Die App aktualisiert sich selbst; wirkt ein Bildschirm eingefroren oder veraltet, installiert diese Schaltfläche die neueste Version. Sie bleiben angemeldet, nichts geht verloren.',
  },
  version_bouton: {
    fr: 'Installer la dernière version',
    en: 'Install the latest version',
    sw: 'Sakinisha toleo jipya',
    it: 'Installa l\'ultima versione',
    de: 'Neueste Version installieren',
  },
  version_forcer: {
    fr: '⟳ Appuyez encore pour installer la dernière version',
    en: '⟳ Tap again to install the latest version',
    sw: '⟳ Gusa tena kusakinisha toleo jipya',
    it: '⟳ Tocca di nuovo per installare l\'ultima versione',
    de: '⟳ Erneut tippen, um die neueste Version zu installieren',
  },
  doc_envoi: {
    fr: 'Envoi de votre document…',
    en: 'Sending your document…',
    sw: 'Inatuma nyaraka yako…',
  },
  doc_envoi_patience: {
    fr: 'Quelques secondes selon votre réseau — restez sur cet écran.',
    en: 'A few seconds depending on your network — stay on this screen.',
    sw: 'Sekunde chache kulingana na mtandao wako — baki kwenye skrini hii.',
  },
  doc_erreur_envoi: {
    fr: "L'envoi n'a pas abouti. Vérifiez votre connexion et réessayez.",
    en: "The upload didn't go through. Check your connection and try again.",
    sw: 'Kutuma hakukufanikiwa. Angalia mtandao wako kisha ujaribu tena.',
  },
  doc_reessayer: {
    fr: 'Réessayer l\'envoi',
    en: 'Try sending again',
    sw: 'Jaribu kutuma tena',
  },
  doc_secours: {
    fr: 'Le bouton ci-dessus ne réagit pas ? Utilisez celui-ci :',
    en: "Button above not responding? Use this one:",
    sw: 'Kitufe cha juu hakifanyi kazi? Tumia hiki:',
  },
  doc_erreur_camera: {
    fr: "Autorisez l'appareil photo pour prendre la preuve de livraison.",
    en: 'Allow camera access to take the delivery proof.',
    sw: 'Ruhusu kamera ili kupiga picha ya uthibitisho wa utoaji.',
  },
  scanner_photo_titre: {
    fr: 'Photo de preuve',
    en: 'Proof photo',
    sw: 'Picha ya uthibitisho',
  },
  scanner_photo_prendre: {
    fr: 'Prendre la photo',
    en: 'Take the photo',
    sw: 'Piga picha',
  },
  scanner_photo_prise: {
    fr: 'Photo prise',
    en: 'Photo taken',
    sw: 'Picha imepigwa',
  },
  scanner_photo_refaire: {
    fr: 'Refaire',
    en: 'Retake',
    sw: 'Piga tena',
  },
  doc_erreur_lourd: {
    fr: 'Document trop lourd (25 Mo maximum). Reprenez la photo en qualité normale.',
    en: 'Document too heavy (25 MB max). Take the photo again in normal quality.',
    sw: 'Nyaraka ni nzito mno (MB 25 kiwango cha juu). Piga picha tena kwa ubora wa kawaida.',
  },
  doc_erreur_lecture: {
    fr: "Ce document n'a pas pu être lu. Prenez une photo de votre pièce et réessayez.",
    en: "This document couldn't be read. Take a photo of your ID and try again.",
    sw: 'Nyaraka hii haikusomeka. Piga picha ya kitambulisho chako na ujaribu tena.',
  },
  client_erreur_creation: {
    fr: 'Impossible de créer le profil. Réessayez.',
    en: "Couldn't create the profile. Try again.",
    sw: 'Imeshindikana kutengeneza wasifu. Jaribu tena.',
    it: 'Impossibile creare il profilo. Riprova.',
    de: 'Profil konnte nicht erstellt werden. Bitte erneut versuchen.',
  },

  // --- Hôtel : connexion et inscription --------------------------------------
  hotelcx_espace: {
    fr: 'Espace hôtels et restaurants partenaires',
    en: 'Partner hotels & restaurants area',
    sw: 'Eneo la hoteli na migahawa washirika',
  },
  hotelcx_titre: { fr: 'Connexion partenaire', en: 'Partner sign-in', sw: 'Kuingia kwa mshirika' },
  hotelcx_intro: {
    fr: 'Réservez des taxis pour vos clients et suivez vos livraisons.',
    en: 'Book taxis for your customers and track your deliveries.',
    sw: 'Weka teksi kwa wateja wako na fuatilia usafirishaji wako.',
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
    fr: 'Créez le compte de votre établissement pour réserver des taxis pour vos clients et envoyer vos colis entre les villes — tarif touriste avec −5 % partenaire sur les courses privées.',
    en: 'Create your business account to book taxis for your customers and send parcels between towns — tourist rates with a 5% partner discount on private rides.',
    it: 'Crea l\'account della tua struttura per prenotare taxi per i tuoi clienti e spedire pacchi tra le città — tariffa turistica con sconto partner del 5% sulle corse private.',
    de: 'Erstellen Sie das Konto Ihres Betriebs, um Taxis für Ihre Gäste zu buchen und Pakete zwischen den Städten zu versenden — Touristentarif mit 5 % Partnerrabatt auf Privatfahrten.',
    sw: 'Fungua akaunti ya biashara yako kuweka teksi kwa wateja wako na kutuma mizigo kati ya miji — bei ya watalii ukiwa na punguzo la 5% kwa safari binafsi.',
  },
  // Nature de l'établissement : le compte, le crédit et la fidélité sont les
  // mêmes ; c'est le nom à l'écran qui change.
  hotelins_type: {
    fr: 'Votre établissement',
    en: 'Your business',
    sw: 'Biashara yako',
  },
  hotelins_type_hotel: { fr: '🏨 Hôtel', en: '🏨 Hotel', sw: '🏨 Hoteli' },
  hotelins_type_restaurant: { fr: '🍽️ Restaurant', en: '🍽️ Restaurant', sw: '🍽️ Mgahawa' },
  hotelins_nom: { fr: "Nom de l'établissement", en: 'Business name', sw: 'Jina la biashara' },
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
  hotelins_erreur_nom: {
    fr: "Indiquez le nom de l'établissement.",
    en: 'Enter the business name.',
    sw: 'Weka jina la biashara.',
  },
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
    fr: "Indiquez la zone de l'établissement (ex. : Nungwi, Paje, Stone Town).",
    en: 'Enter the hotel area (e.g. Nungwi, Paje, Stone Town).',
    sw: 'Weka eneo la hoteli (mf. Nungwi, Paje, Stone Town).',
  },
  hotelins_erreur_duplicate: {
    fr: 'Un compte partenaire existe déjà avec cet e-mail ou ce téléphone.',
    en: 'A partner account already exists with this email or phone.',
    sw: 'Akaunti ya ushirika tayari ipo kwa barua pepe au namba hii.',
  },
  hotelins_erreur_creation: {
    fr: 'La création du compte partenaire a échoué. Réessayez.',
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
  pro_doc_assurance: {
    fr: 'Assurance du véhicule (photo lisible)',
    en: 'Vehicle insurance (clear photo)',
    sw: 'Bima ya gari (picha inayosomeka)',
  },
  pro_doc_vehicule: {
    fr: 'Photo du véhicule',
    en: 'Vehicle photo',
    sw: 'Picha ya gari',
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
    fr: 'Ajoutez vos trois documents : permis de conduire, assurance et photo du véhicule.',
    en: 'Add all three documents: driver’s licence, insurance and vehicle photo.',
    sw: 'Ongeza nyaraka zote tatu: leseni ya udereva, bima na picha ya gari.',
  },
  pro_erreur_envoi: {
    fr: "L'envoi de la candidature a échoué. Réessayez.",
    en: "Couldn't send the application. Try again.",
    sw: 'Imeshindikana kutuma maombi. Jaribu tena.',
  },

  // --- Réserver ---------------------------------------------------------------
  reserver_mode_hotel_info: {
    fr: 'Mode partenaire — réservez un taxi pour votre client : tarif touriste avec −5 % partenaire sur les courses privées.',
    en: 'Partner mode — book a taxi for your customer: tourist rate with a 5% partner discount on private rides.',
    sw: 'Hali ya ushirika — weka teksi kwa mteja wako: bei ya watalii ukiwa na punguzo la 5% kwa safari binafsi.',
    it: 'Modalità partner — prenota un taxi per il tuo cliente: tariffa turistica con sconto partner del 5% sulle corse private.',
    de: 'Partnermodus — buchen Sie ein Taxi für Ihren Gast: Touristentarif mit 5 % Partnerrabatt auf Privatfahrten.',
  },
  reserver_itineraire: { fr: 'Itinéraire', en: 'Route', sw: 'Njia' , it: 'Percorso', de: 'Strecke' },
  reserver_depart_placeholder: {
    fr: 'Ex. : aéroport de Zanzibar (ZNZ)',
    en: 'E.g. Zanzibar Airport (ZNZ)',
    sw: 'Mf. Uwanja wa ndege wa Zanzibar (ZNZ)',
    it: 'Es. Aeroporto di Zanzibar (ZNZ)',
    de: 'z. B. Flughafen Sansibar (ZNZ)',
  },
  reserver_arrivee_placeholder: {
    fr: 'Ex. : Nungwi, Ocean View',
    en: 'E.g. Nungwi, Ocean View',
    sw: 'Mf. Nungwi, Ocean View',
    it: 'Es. Nungwi, Ocean View',
    de: 'z. B. Nungwi, Ocean View',
  },
  reserver_mode_titre: { fr: 'Privé ou partagé ?', en: 'Private or shared?', sw: 'Binafsi au pamoja?' , it: 'Privato o condiviso?', de: 'Privat oder geteilt?' },
  reserver_prive: { fr: 'Taxi privé', en: 'Private taxi', sw: 'Teksi binafsi' , it: 'Taxi privato', de: 'Privattaxi' },
  reserver_prive_desc: {
    fr: 'Un véhicule rien que pour vous.',
    en: 'A vehicle just for you.',
    sw: 'Gari kwa ajili yako tu.',
    it: 'Un veicolo solo per te.',
    de: 'Ein Fahrzeug nur für Sie.',
  },
  reserver_partage: { fr: 'Taxi partagé', en: 'Shared taxi', sw: 'Teksi ya pamoja', it: 'Taxi condiviso', de: 'Sammeltaxi' },
  reserver_partage_desc: {
    fr: 'Une place dans un taxi partagé.',
    en: 'A seat in a shared taxi.',
    sw: 'Kiti kwenye teksi ya pamoja.',
    it: 'Un posto in un taxi condiviso.',
    de: 'Ein Platz in einem Sammeltaxi.',
  },
  reserver_precision: {
    fr: 'Précision (adresse, repère…) — optionnel',
    en: 'Details (address, landmark…) — optional',
    sw: 'Maelezo (anwani, alama…) — hiari',
    it: 'Dettagli (indirizzo, punto di riferimento…) — facoltativo',
    de: 'Details (Adresse, Orientierungspunkt …) — optional',
  },
  reserver_precision_placeholder: {
    fr: 'Ex. : Ocean View, chambre 12 — ou Lukmaan, terrasse',
    en: 'E.g. Ocean View, room 12 — or Lukmaan, terrace',
    sw: 'Mf. Ocean View, chumba 12 — au Lukmaan, baraza',
    it: 'Es. Ocean View, camera 12 — oppure Lukmaan, terrazza',
    de: 'z. B. Ocean View, Zimmer 12 — oder Lukmaan, Terrasse',
  },
  reserver_special_info: {
    fr: 'Tarif spécial {depart} ↔ {arrivee} appliqué. Indiquez le lieu exact au chauffeur via WhatsApp.',
    en: 'Special {depart} ↔ {arrivee} fare applied. Share the exact spot with the driver on WhatsApp.',
    sw: 'Bei maalum ya {depart} ↔ {arrivee} imetumika. Mweleze dereva mahali kamili kupitia WhatsApp.',
    it: 'Tariffa speciale {depart} ↔ {arrivee} applicata. Comunica il punto esatto all\'autista su WhatsApp.',
    de: 'Sondertarif {depart} ↔ {arrivee} angewendet. Teilen Sie dem Fahrer den genauen Treffpunkt über WhatsApp mit.',
  },
  reserver_partage_info: {
    fr: 'En mode Partagé, réservez votre place sur un trajet posté par un chauffeur — choisissez ci-dessous.',
    en: 'In Shared mode, book a seat on a driver-posted ride — pick one below.',
    sw: 'Katika hali ya Pamoja, hifadhi kiti kwenye safari iliyotangazwa na dereva — chagua hapa chini.',
    it: 'In modalità Condivisa, prenoti un posto su una corsa pubblicata da un autista — scegline una qui sotto.',
    de: 'Im Modus „Geteilt“ buchen Sie einen Platz auf einer von einem Fahrer angebotenen Fahrt — wählen Sie unten eine aus.',
  },
  reserver_clim: {
    fr: 'Climatisation incluse',
    en: 'Air conditioning included',
    sw: 'Kiyoyozi kimejumuishwa',
    it: 'Aria condizionata inclusa',
    de: 'Klimaanlage inklusive',
  },
  reserver_votre_client: { fr: 'Votre client', en: 'Your guest', sw: 'Mteja wako' , it: 'Il vostro cliente', de: 'Ihr Gast' },
  reserver_nom_client: { fr: 'Nom du client', en: 'Guest name', sw: 'Jina la mteja' , it: 'Nome del cliente', de: 'Name des Gastes' },
  reserver_nom_client_placeholder: {
    fr: 'Ex. : M. et Mme Dupont — table 6 ou chambre 12',
    en: 'E.g. Mr & Mrs Smith — table 6 or room 12',
    sw: 'Mf. Bw. na Bi. Juma — meza 6 au chumba 12',
    it: 'Es. Sig. e Sig.ra Rossi — tavolo 6 o camera 12',
    de: 'z. B. Herr und Frau Müller — Tisch 6 oder Zimmer 12',
  },
  reserver_tel_client: { fr: 'Téléphone du client', en: 'Guest phone', sw: 'Simu ya mteja' , it: 'Telefono del cliente', de: 'Telefon des Gastes' },
  reserver_programmer: {
    fr: 'Programmer le départ (optionnel)',
    en: 'Schedule departure (optional)',
    sw: 'Panga kuondoka (hiari)',
    it: 'Programma la partenza (facoltativo)',
    de: 'Abfahrt planen (optional)',
  },
  reserver_prix_course: { fr: 'Prix de la course', en: 'Ride price', sw: 'Bei ya safari' , it: 'Prezzo della corsa', de: 'Fahrpreis' },
  reserver_prix_selon_trajet: {
    fr: 'Prix affiché après le choix du trajet',
    en: 'Price shown once you pick your route',
    sw: 'Bei itaonyeshwa baada ya kuchagua safari',
    it: 'Prezzo mostrato dopo aver scelto il percorso',
    de: 'Preis wird nach Wahl der Strecke angezeigt',
  },
  reserver_pas_partage: {
    fr: 'Trajet court : course privée uniquement — pas de taxi partagé sur ce trajet.',
    en: 'Short trip: private ride only — no shared taxi on this route.',
    sw: 'Safari fupi: safari binafsi tu — hakuna teksi ya kushirikiana kwenye njia hii.',
    it: 'Tragitto breve: solo corsa privata — nessun taxi condiviso su questo percorso.',
    de: 'Kurze Strecke: nur Privatfahrt — auf dieser Route kein Sammeltaxi.',
  },
  reserver_num_vol: {
    fr: 'Numéro de vol (recommandé)',
    en: 'Flight number (recommended)',
    sw: 'Namba ya ndege (inapendekezwa)',
    it: 'Numero del volo (consigliato)',
    de: 'Flugnummer (empfohlen)',
  },
  reserver_num_vol_info: {
    fr: 'Avec votre numéro de vol, nous suivons l\'heure réelle d\'atterrissage : votre taxi vous attend même si le vol est en retard.',
    en: 'With your flight number we track the real landing time: your taxi waits for you even if the flight is late.',
    sw: 'Kwa namba yako ya ndege tunafuatilia muda halisi wa kutua: teksi yako inakusubiri hata ndege ikichelewa.',
    it: 'Con il numero del volo seguiamo l\'orario reale di atterraggio: il tuo taxi ti aspetta anche se il volo è in ritardo.',
    de: 'Mit Ihrer Flugnummer verfolgen wir die tatsächliche Landezeit: Ihr Taxi wartet auch bei Verspätung.',
  },
  reserver_aller_retour: {
    fr: 'Aller-retour avec attente (prix ×1,8)',
    en: 'Round trip with waiting (price ×1.8)',
    sw: 'Kwenda na kurudi na kusubiri (bei ×1.8)',
    it: 'Andata e ritorno con attesa (prezzo ×1,8)',
    de: 'Hin- und Rückfahrt mit Wartezeit (Preis ×1,8)',
  },
  reserver_siege_bebe: { fr: 'Siège bébé', en: 'Baby seat', sw: 'Kiti cha mtoto' , it: 'Seggiolino per bambini', de: 'Kindersitz' },
  reserver_gros_bagages: { fr: 'Gros bagages', en: 'Bulky luggage', sw: 'Mizigo mikubwa' , it: 'Bagagli ingombranti', de: 'Sperriges Gepäck' },
  reserver_prix_aller_retour: {
    fr: 'Prix aller-retour',
    en: 'Round-trip price',
    sw: 'Bei ya kwenda na kurudi',
    it: 'Prezzo andata e ritorno',
    de: 'Preis für Hin- und Rückfahrt',
  },
  reserver_attente_bouton: {
    fr: 'Aucun taxi à votre heure ? Prévenez-moi ({depart} → {arrivee})',
    en: 'No taxi at your time? Notify me ({depart} → {arrivee})',
    sw: 'Hakuna teksi kwa saa yako? Nijulishe ({depart} → {arrivee})',
    it: 'Nessun taxi al tuo orario? Avvisami ({depart} → {arrivee})',
    de: 'Kein Taxi zu Ihrer Zeit? Benachrichtigen Sie mich ({depart} → {arrivee})',
  },
  reserver_attente_ok: {
    fr: 'Demande enregistrée ! L\'équipe vous recontacte dès qu\'un taxi partagé se présente sur ce trajet.',
    en: 'Request saved! The team will contact you as soon as a shared taxi appears on this route.',
    sw: 'Ombi limehifadhiwa! Timu itawasiliana nawe mara teksi ya kushirikiana itakapopatikana.',
    it: 'Richiesta registrata! Il team ti contatterà appena comparirà un taxi condiviso su questo percorso.',
    de: 'Anfrage gespeichert! Das Team meldet sich, sobald ein Sammeltaxi auf dieser Strecke verfügbar ist.',
  },
  trip_vol: { fr: 'Vol', en: 'Flight', sw: 'Ndege' , it: 'Volo', de: 'Flug' },
  trip_aller_retour: { fr: 'Formule', en: 'Trip type', sw: 'Aina ya safari' , it: 'Tipo di corsa', de: 'Fahrtart' },
  trip_aller_retour_valeur: {
    fr: 'Aller-retour (attente incluse)',
    en: 'Round trip (waiting included)',
    sw: 'Kwenda na kurudi (kusubiri kumejumuishwa)',
    it: 'Andata e ritorno (attesa inclusa)',
    de: 'Hin- und Rückfahrt (Wartezeit inklusive)',
  },
  trip_options: { fr: 'Options', en: 'Options', sw: 'Chaguo' , it: 'Opzioni', de: 'Optionen' },
  client_code_parrain: {
    fr: 'Code parrain (optionnel)',
    en: 'Referral code (optional)',
    sw: 'Msimbo wa mdhamini (hiari)',
    it: 'Codice di invito (facoltativo)',
    de: 'Empfehlungscode (optional)',
  },
  parrainage_titre: { fr: 'Parrainez vos amis', en: 'Refer your friends', sw: 'Karibisha marafiki' },
  parrainage_texte: {
    fr: 'Partagez votre code : dès que votre ami a fait 2 courses avec zanziGo, vous gagnez tous les deux 5 $ de réduction.',
    en: 'Share your code: once your friend completes 2 rides with zanziGo, you both earn a 5 $ discount.',
    sw: 'Shiriki msimbo wako: rafiki yako akikamilisha safari 2 na zanziGo, nyote wawili mnapata punguzo la $5.',
  },
  parrainage_partager: {
    fr: 'Partager mon code sur WhatsApp',
    en: 'Share my code on WhatsApp',
    sw: 'Shiriki msimbo wangu WhatsApp',
  },
  parrainage_message: {
    fr: 'Rejoins-moi sur zanziGo (taxi & colis à Zanzibar) ! Inscris-toi avec mon code parrain {code} et on gagne chacun une réduction 🚕🌴 https://zanzigo-api.onrender.com/web',
    en: 'Join me on zanziGo (taxi & parcels in Zanzibar)! Sign up with my referral code {code} and we both get a discount 🚕🌴 https://zanzigo-api.onrender.com/web',
    sw: 'Jiunge nami zanziGo (teksi na mizigo Zanzibar)! Jisajili kwa msimbo wangu {code} tupate punguzo sote 🚕🌴 https://zanzigo-api.onrender.com/web',
  },
  equipe_stat_attentes: { fr: 'Liste d\'attente', en: 'Waitlist', sw: 'Orodha ya kusubiri' },
  equipe_paiement_demande: { fr: 'Demandé le', en: 'Requested on', sw: 'Iliombwa' },
  equipe_paiement_depart: { fr: 'Départ prévu', en: 'Departure', sw: 'Kuondoka' },
  // --- Fiche complète d'un chauffeur (équipe) ---
  taxi_fiche_titre: { fr: 'Fiche taxi', en: 'Taxi file', sw: 'Faili la teksi' },
  taxi_fiche_introuvable: {
    fr: 'Chauffeur introuvable.',
    en: 'Driver not found.',
    sw: 'Dereva hajapatikana.',
  },
  taxi_fiche_ouvrir: {
    fr: 'Ouvrir la fiche complète',
    en: 'Open full file',
    sw: 'Fungua faili kamili',
  },
  taxi_fiche_statut_radie: { fr: 'Radié', en: 'Removed', sw: 'Ameondolewa' },
  taxi_fiche_note: { fr: 'Note des clients', en: 'Customer rating', sw: 'Kiwango cha wateja' },
  taxi_fiche_vehicule: { fr: 'Son véhicule', en: 'Their vehicle', sw: 'Gari lake' },
  taxi_fiche_plaque: { fr: 'Plaque', en: 'Plate', sw: 'Namba ya gari' },
  taxi_fiche_modele: { fr: 'Modèle', en: 'Model', sw: 'Aina' },
  taxi_fiche_permis_numero: {
    fr: 'N° de permis',
    en: 'License number',
    sw: 'Namba ya leseni',
  },
  taxi_fiche_qr: { fr: 'QR du véhicule', en: 'Vehicle QR', sw: 'QR ya gari' },
  taxi_fiche_pieces: {
    fr: 'Pièces jointes en mémoire',
    en: 'Documents on file',
    sw: 'Nyaraka zilizohifadhiwa',
  },
  taxi_fiche_piece_identite: {
    fr: "Pièce d'identité",
    en: 'ID document',
    sw: 'Kitambulisho',
  },
  taxi_fiche_aucune_piece: {
    fr: 'Aucune pièce jointe enregistrée.',
    en: 'No document on file.',
    sw: 'Hakuna nyaraka iliyohifadhiwa.',
  },
  taxi_fiche_expirations: {
    fr: 'Dates de fin de validité',
    en: 'Expiry dates',
    sw: 'Tarehe za mwisho',
  },
  taxi_fiche_dates_ok: {
    fr: 'Dates enregistrées.',
    en: 'Dates saved.',
    sw: 'Tarehe zimehifadhiwa.',
  },
  taxi_fiche_mdp_titre: { fr: 'Mot de passe', en: 'Password', sw: 'Nenosiri' },
  taxi_fiche_mdp_explication: {
    fr: "Ce chauffeur a un mot de passe. Il est chiffré : personne ne peut le relire, pas même vous. S'il l'a oublié, donnez-lui-en un nouveau ici, puis communiquez-le-lui.",
    en: "This driver has a password. It is encrypted: nobody can read it back, not even you. If they forgot it, set a new one here and tell them.",
    sw: 'Dereva huyu ana nenosiri. Limefichwa: hakuna anayeweza kulisoma, hata wewe. Akilisahau, weka jipya hapa kisha mwambie.',
  },
  taxi_fiche_mdp_absent: {
    fr: "Ce chauffeur n'a pas encore de mot de passe. Vous pouvez lui en poser un ici.",
    en: "This driver has no password yet. You can set one here.",
    sw: 'Dereva huyu bado hana nenosiri. Unaweza kuweka moja hapa.',
  },
  taxi_fiche_mdp_nouveau: {
    fr: 'Nouveau mot de passe (8 caractères minimum)',
    en: 'New password (8 characters minimum)',
    sw: 'Nenosiri jipya (angalau herufi 8)',
  },
  taxi_fiche_mdp_bouton: {
    fr: 'Définir ce mot de passe',
    en: 'Set this password',
    sw: 'Weka nenosiri hili',
  },
  taxi_fiche_mdp_ok: {
    fr: 'Nouveau mot de passe posé : {mdp} — communiquez-le au chauffeur, il ne sera plus affiché.',
    en: 'New password set: {mdp} — pass it on to the driver, it will not be shown again.',
    sw: 'Nenosiri jipya limewekwa: {mdp} — mpe dereva, halitaonyeshwa tena.',
  },
  taxi_fiche_gains: { fr: 'Ses gains', en: 'Their earnings', sw: 'Mapato yake' },
  taxi_fiche_gains_jour: { fr: "Aujourd'hui", en: 'Today', sw: 'Leo' },
  taxi_fiche_gains_semaine: { fr: '7 derniers jours', en: 'Last 7 days', sw: 'Siku 7 zilizopita' },
  taxi_fiche_gains_mois: { fr: '30 derniers jours', en: 'Last 30 days', sw: 'Siku 30 zilizopita' },
  taxi_fiche_courses: { fr: 'Ses courses', en: 'Their rides', sw: 'Safari zake' },
  taxi_fiche_aucune_course: {
    fr: "Aucune course ne lui a encore été confiée.",
    en: 'No ride assigned yet.',
    sw: 'Bado hajapewa safari.',
  },
  taxi_fiche_radiation_titre: {
    fr: 'Radiation définitive',
    en: 'Permanent removal',
    sw: 'Kuondolewa kabisa',
  },
  taxi_fiche_radiation_explication: {
    fr: "La fiche est close : le chauffeur disparaît de toutes les listes, ses annonces se ferment et il ne peut plus se connecter. Ses courses passées restent dans vos comptes. Son numéro redevient libre : s'il revient un jour, il redépose une candidature complète que vous examinerez.",
    en: 'The file is closed: the driver disappears from all lists, their listings close and they can no longer log in. Their past rides stay in your accounts. Their number becomes free again: if they come back one day, they submit a full new application for you to review.',
    sw: 'Faili linafungwa: dereva anatoweka kwenye orodha zote, matangazo yake yanafungwa na hawezi kuingia tena. Safari zake za nyuma zinabaki kwenye hesabu zako. Namba yake inakuwa huru tena: akirudi, atatuma maombi mapya kamili.',
  },
  taxi_fiche_radiation_bouton: {
    fr: 'Radier définitivement',
    en: 'Remove permanently',
    sw: 'Ondoa kabisa',
  },
  taxi_fiche_radiation_confirme: {
    fr: 'Radier {nom} définitivement ? Cette fiche sera close.',
    en: 'Permanently remove {nom}? This file will be closed.',
    sw: 'Kumwondoa {nom} kabisa? Faili hili litafungwa.',
  },
  taxi_fiche_radiation_oui: {
    fr: 'Oui, radier ce chauffeur',
    en: 'Yes, remove this driver',
    sw: 'Ndiyo, mwondoe dereva huyu',
  },
  taxi_fiche_radie_explication: {
    fr: "Ce chauffeur est radié. Son numéro est de nouveau libre : il peut redéposer une candidature, qui apparaîtra dans « Candidatures ».",
    en: 'This driver has been removed. Their number is free again: they can submit a new application, which will appear under "Applications".',
    sw: 'Dereva huyu ameondolewa. Namba yake iko huru tena: anaweza kutuma maombi mapya, yatakayoonekana kwenye "Maombi".',
  },

  // --- Fiche complète d'un hôtel partenaire (équipe) ---
  hotel_fiche_titre: { fr: 'Fiche partenaire', en: 'Partner file', sw: 'Faili la mshirika' },
  hotel_fiche_introuvable: {
    fr: 'Partenaire introuvable.',
    en: 'Partner not found.',
    sw: 'Mshirika hajapatikana.',
  },
  hotel_fiche_ouvrir: {
    fr: 'Ouvrir la fiche complète',
    en: 'Open full file',
    sw: 'Fungua faili kamili',
  },
  hotel_fiche_statut_verifie: { fr: 'Vérifié ✓', en: 'Verified ✓', sw: 'Imethibitishwa ✓' },
  hotel_fiche_statut_attente: { fr: 'À vérifier', en: 'To verify', sw: 'Ya kuthibitisha' },
  hotel_fiche_statut_refuse: { fr: 'Refusé', en: 'Rejected', sw: 'Imekataliwa' },
  hotel_fiche_contact: { fr: 'Contact', en: 'Contact', sw: 'Mawasiliano' },
  hotel_fiche_zone: { fr: 'Zone', en: 'Zone', sw: 'Eneo' },
  hotel_fiche_adresse: { fr: 'Adresse', en: 'Address', sw: 'Anwani' },
  hotel_fiche_email: { fr: 'E-mail', en: 'Email', sw: 'Barua pepe' },
  hotel_fiche_telephone: { fr: 'Téléphone', en: 'Phone', sw: 'Simu' },
  hotel_fiche_inscrit_le: { fr: 'Inscrit le', en: 'Registered on', sw: 'Alijisajili' },
  hotel_fiche_solde: { fr: 'Crédit prépayé', en: 'Prepaid credit', sw: 'Salio la malipo ya awali' },
  hotel_fiche_ajouter_credit: {
    fr: 'Ajouter du crédit',
    en: 'Add credit',
    sw: 'Ongeza salio',
  },
  hotel_fiche_note: { fr: 'Note (facultatif)', en: 'Note (optional)', sw: 'Maelezo (hiari)' },
  hotel_fiche_note_exemple: {
    fr: 'Reçu par carte le 14/08',
    en: 'Card payment received on 14/08',
    sw: 'Malipo ya kadi 14/08',
  },
  hotel_fiche_credit_ok: {
    fr: 'Crédit enregistré — nouveau solde : {solde}',
    en: 'Credit recorded — new balance: {solde}',
    sw: 'Salio limehifadhiwa — salio jipya: {solde}',
  },
  hotel_fiche_erreur_montant: {
    fr: 'Indiquez un montant, par exemple 50 (un montant négatif corrige une erreur).',
    en: 'Enter an amount, e.g. 50 (a negative amount corrects a mistake).',
    sw: 'Weka kiasi, mfano 50 (kiasi hasi kinarekebisha kosa).',
  },
  hotel_fiche_erreur_credit: {
    fr: "L'opération n'a pas abouti. Réessayez.",
    en: "The operation didn't go through. Please try again.",
    sw: 'Operesheni haikufanikiwa. Jaribu tena.',
  },
  hotel_fiche_mouvements: {
    fr: 'Derniers mouvements',
    en: 'Recent movements',
    sw: 'Miamala ya hivi karibuni',
  },
  hotel_fiche_aucun_mouvement: {
    fr: 'Aucun mouvement pour le moment.',
    en: 'No movement yet.',
    sw: 'Hakuna muamala bado.',
  },
  hotel_fiche_recharge: { fr: 'Recharge', en: 'Top-up', sw: 'Kuongeza salio' },
  hotel_fiche_correction: { fr: 'Correction', en: 'Adjustment', sw: 'Marekebisho' },
  hotel_fiche_fidelite: { fr: 'Fidélité', en: 'Loyalty', sw: 'Uaminifu' },
  hotel_fiche_courses_terminees: {
    fr: 'Courses terminées',
    en: 'Completed rides',
    sw: 'Safari zilizokamilika',
  },
  hotel_fiche_bons_dispo: {
    fr: 'Bons disponibles',
    en: 'Vouchers available',
    sw: 'Vocha zilizopo',
  },
  hotel_fiche_progression: {
    fr: 'Encore {restant} course(s) sur {total} pour le prochain bon de {bon}.',
    en: '{restant} more ride(s) out of {total} for the next {bon} voucher.',
    sw: 'Safari {restant} zaidi kati ya {total} kwa vocha ijayo ya {bon}.',
  },
  hotel_fiche_courses: { fr: 'Réservations', en: 'Bookings', sw: 'Nafasi zilizohifadhiwa' },
  hotel_fiche_aucune_course: {
    fr: "Ce partenaire n'a encore rien réservé.",
    en: "This hotel hasn't booked anything yet.",
    sw: 'Hoteli hii bado haijahifadhi chochote.',
  },
  hotel_fiche_colis: { fr: 'Colis expédiés', en: 'Packages sent', sw: 'Vifurushi vilivyotumwa' },
  hotel_fiche_aucun_colis: {
    fr: 'Aucun colis expédié.',
    en: 'No package sent.',
    sw: 'Hakuna kifurushi kilichotumwa.',
  },
  hotel_fiche_et_plus: {
    fr: '… et {n} de plus.',
    en: '… and {n} more.',
    sw: '… na {n} zaidi.',
  },
  equipe_ouvrir_fiche: {
    fr: '👉 Ouvrir la fiche complète',
    en: '👉 Open the full record',
    sw: '👉 Fungua taarifa kamili',
  },
  trip_paiement_apres_chauffeur: {
    fr: 'Rien à payer pour l\'instant : nous vous attribuons un taxi (quelques minutes en général). Dès qu\'il est confirmé, le bouton pour régler vos {montant} apparaît ici.',
    en: 'Nothing to pay yet: we are assigning your taxi (usually a few minutes). As soon as it is confirmed, the button to pay your {montant} appears here.',
    sw: 'Hakuna cha kulipa bado: tunakupangia teksi (kawaida dakika chache). Itakapothibitishwa, kitufe cha kulipa {montant} kitaonekana hapa.',
    it: 'Ancora niente da pagare: stiamo assegnando il tuo taxi (di solito pochi minuti). Appena è confermato, qui comparirà il pulsante per pagare i tuoi {montant}.',
    de: 'Noch nichts zu zahlen: Wir vermitteln Ihr Taxi (meist wenige Minuten). Sobald es bestätigt ist, erscheint hier die Schaltfläche zur Zahlung von {montant}.',
  },
  trip_paiement_instructions: {
    fr: 'Votre taxi est confirmé — il reste {montant} à régler. Choisissez votre moyen de paiement ci-dessous : votre message part tout prêt à l\'équipe. Dès qu\'elle encaisse, « Course payée » s\'affiche ici.',
    en: 'Your taxi is confirmed — {montant} left to pay. Choose your payment method below: your message goes ready-made to the team. Once received, "Ride paid" appears here.',
    sw: 'Teksi yako imethibitishwa — imebaki {montant} kulipa. Chagua njia yako ya malipo hapa chini: ujumbe wako unakwenda tayari kwa timu. Ikipokelewa, "Safari imelipwa" itaonekana hapa.',
    it: 'Il tuo taxi è confermato — restano {montant} da pagare. Scegli il metodo di pagamento qui sotto: il messaggio parte già pronto al team. Una volta ricevuto, qui apparirà «Corsa pagata».',
    de: 'Ihr Taxi ist bestätigt — {montant} sind noch zu zahlen. Wählen Sie unten Ihre Zahlungsart: Ihre Nachricht geht fertig formuliert an das Team. Nach Eingang erscheint hier „Fahrt bezahlt“.',
  },
  place_fiche_titre: { fr: 'Ma place', en: 'My seat', sw: 'Kiti changu' , it: 'Il mio posto', de: 'Mein Platz' },
  place_depart: { fr: 'Départ', en: 'Departure', sw: 'Kuondoka' , it: 'Partenza', de: 'Abfahrt' },
  place_montant: { fr: 'Montant à régler', en: 'Amount to pay', sw: 'Kiasi cha kulipa' , it: 'Importo da pagare', de: 'Zu zahlender Betrag' },
  place_etape_reservee: { fr: 'Place réservée', en: 'Seat booked', sw: 'Kiti kimehifadhiwa' , it: 'Posto prenotato', de: 'Platz gebucht' },
  place_etape_payee: { fr: 'Paiement validé', en: 'Payment confirmed', sw: 'Malipo yamethibitishwa' , it: 'Pagamento confermato', de: 'Zahlung bestätigt' },
  place_etape_depart: { fr: 'En route', en: 'On the way', sw: 'Njiani' , it: 'In viaggio', de: 'Unterwegs' },
  place_etape_terminee: { fr: 'Trajet terminé', en: 'Trip completed', sw: 'Safari imekamilika' , it: 'Viaggio completato', de: 'Fahrt abgeschlossen' },
  place_paiement_instructions: {
    fr: 'Il reste {montant} à régler. Payez l\'équipe zanziGo par le moyen de votre choix ci-dessous : votre message part tout prêt. Dès que l\'équipe encaisse, « Paiement validé » s\'affiche ici.',
    en: '{montant} left to pay. Pay the zanziGo team with the method of your choice below: tap it, your message is ready to send. As soon as the team receives it, "Payment confirmed" appears here.',
    sw: 'Imebaki {montant} kulipa. Lipa timu ya zanziGo kwa njia unayochagua hapa chini: bonyeza, ujumbe wako uko tayari. Timu ikipokea, "Malipo yamethibitishwa" itaonekana hapa.',
  },
  place_payer_bouton: {
    fr: 'Régler ma place ({montant})',
    en: 'Pay for my seat ({montant})',
    sw: 'Lipa kiti changu ({montant})',
    it: 'Paga il mio posto ({montant})',
    de: 'Meinen Platz bezahlen ({montant})',
  },
  place_paiement_valide: {
    fr: 'Paiement validé — votre place est garantie. Présentez-vous au point de rendez-vous à l\'heure du départ.',
    en: 'Payment confirmed — your seat is guaranteed. Be at the meeting point at departure time.',
    sw: 'Malipo yamethibitishwa — kiti chako kimehakikishwa. Fika mahali pa kukutana kwa wakati.',
    it: 'Pagamento confermato — il tuo posto è garantito. Presentati al punto d\'incontro all\'orario di partenza.',
    de: 'Zahlung bestätigt — Ihr Platz ist gesichert. Seien Sie zur Abfahrtszeit am Treffpunkt.',
  },
  place_voir_fiche: {
    fr: '👉 Toucher pour régler et suivre ma place',
    en: '👉 Tap to pay and follow my seat',
    sw: '👉 Gusa kulipa na kufuatilia kiti changu',
    it: '👉 Tocca per pagare e seguire il mio posto',
    de: '👉 Tippen, um zu bezahlen und meinen Platz zu verfolgen',
  },
  places_annulee: { fr: 'Annulée', en: 'Cancelled', sw: 'Imeghairiwa' , it: 'Annullato', de: 'Storniert' },
  commun_fermer: { fr: 'Fermer', en: 'Close', sw: 'Funga' , it: 'Chiudi', de: 'Schließen' },
  // ----- Identification simplifiée des clients (identifiant + mot de passe)
  ident_intro: {
    fr: 'Un identifiant et un mot de passe, c\'est tout : aucun code à recevoir, ça marche partout dans le monde.',
    en: 'A username and a password, that\'s all: no code to receive, works anywhere in the world.',
    sw: 'Jina la mtumiaji na nenosiri, ndio yote: hakuna msimbo wa kupokea, inafanya kazi popote duniani.',
    it: 'Un nome utente e una password, tutto qui: nessun codice da ricevere, funziona in tutto il mondo.',
    de: 'Ein Benutzername und ein Passwort, mehr nicht: kein Code nötig, funktioniert weltweit.',
  },
  ident_nouveau_titre: {
    fr: '👋 Vous êtes nouveau ?',
    en: '👋 New here?',
    sw: '👋 Wewe ni mpya?',
    it: '👋 Sei nuovo?',
    de: '👋 Neu hier?',
  },
  ident_nouveau_texte: {
    fr: 'Créez votre compte en 30 secondes : choisissez un identifiant et un mot de passe. Vos informations viendront juste après.',
    en: 'Create your account in 30 seconds: choose a username and a password. Your details come right after.',
    sw: 'Fungua akaunti kwa sekunde 30: chagua jina la mtumiaji na nenosiri. Taarifa zako zitafuata.',
    it: 'Crea il tuo account in 30 secondi: scegli un nome utente e una password. I tuoi dati vengono subito dopo.',
    de: 'Erstellen Sie Ihr Konto in 30 Sekunden: Benutzername und Passwort wählen. Ihre Daten folgen direkt danach.',
  },
  ident_creer_bouton: {
    fr: 'Créer mon compte',
    en: 'Create my account',
    sw: 'Fungua akaunti yangu',
    it: 'Crea il mio account',
    de: 'Mein Konto erstellen',
  },
  ident_ou: { fr: 'OU', en: 'OR', sw: 'AU' , it: 'OPPURE', de: 'ODER' },
  ident_deja_titre: {
    fr: 'Vous avez déjà un compte ?',
    en: 'Already have an account?',
    sw: 'Tayari una akaunti?',
    it: 'Hai già un account?',
    de: 'Sie haben bereits ein Konto?',
  },
  ident_connexion_bouton: { fr: 'Se connecter', en: 'Sign in', sw: 'Ingia' , it: 'Accedi', de: 'Anmelden' },
  ident_creation_intro: {
    fr: 'Choisissez un identifiant facile à retenir (par exemple amina2026) et un mot de passe.',
    en: 'Choose a username that is easy to remember (for example amina2026) and a password.',
    sw: 'Chagua jina la mtumiaji rahisi kukumbuka (mfano amina2026) na nenosiri.',
    it: 'Scegli un nome utente facile da ricordare (per esempio amina2026) e una password.',
    de: 'Wählen Sie einen leicht zu merkenden Benutzernamen (zum Beispiel amina2026) und ein Passwort.',
  },
  ident_creation_intro_chauffeur: {
    fr: 'Votre numéro de téléphone est votre identifiant Taxi Partner. Choisissez un mot de passe, puis déposez votre candidature.',
    en: 'Your phone number is your Taxi Partner ID. Choose a password, then submit your application.',
    sw: 'Namba yako ya simu ndio kitambulisho chako cha Taxi Partner. Chagua nenosiri, kisha wasilisha maombi.',
    it: 'Il tuo numero di telefono è il tuo identificativo Taxi Partner. Scegli una password, poi invia la candidatura.',
    de: 'Ihre Telefonnummer ist Ihre Taxi-Partner-Kennung. Wählen Sie ein Passwort und reichen Sie dann Ihre Bewerbung ein.',
  },
  ident_connexion_intro: {
    fr: 'Entrez votre identifiant (ou votre numéro de téléphone si vous vous êtes inscrit avant) et votre mot de passe.',
    en: 'Enter your username (or your phone number if you signed up earlier) and your password.',
    sw: 'Weka jina lako la mtumiaji (au namba ya simu ikiwa ulijisajili awali) na nenosiri lako.',
    it: 'Inserisci il tuo nome utente (o il numero di telefono se ti sei registrato prima) e la tua password.',
    de: 'Geben Sie Ihren Benutzernamen (oder Ihre Telefonnummer bei früherer Registrierung) und Ihr Passwort ein.',
  },
  ident_connexion_intro_chauffeur: {
    fr: 'Entrez votre numéro de téléphone et votre mot de passe.',
    en: 'Enter your phone number and your password.',
    sw: 'Weka namba yako ya simu na nenosiri lako.',
    it: 'Inserisci il tuo numero di telefono e la tua password.',
    de: 'Geben Sie Ihre Telefonnummer und Ihr Passwort ein.',
  },
  ident_choisir_label: {
    fr: 'Choisissez votre identifiant',
    en: 'Choose your username',
    sw: 'Chagua jina lako la mtumiaji',
    it: 'Scegli il tuo nome utente',
    de: 'Wählen Sie Ihren Benutzernamen',
  },
  ident_label: {
    fr: 'Identifiant (ou numéro de téléphone)',
    en: 'Username (or phone number)',
    sw: 'Jina la mtumiaji (au namba ya simu)',
    it: 'Nome utente (o numero di telefono)',
    de: 'Benutzername (oder Telefonnummer)',
  },
  ident_placeholder: { fr: 'amina2026', en: 'amina2026', sw: 'amina2026' , it: 'amina2026', de: 'amina2026' },
  ident_placeholder_connexion: {
    fr: 'amina2026 ou +255712345678',
    en: 'amina2026 or +255712345678',
    sw: 'amina2026 au +255712345678',
    it: 'amina2026 oppure +255712345678',
    de: 'amina2026 oder +255712345678',
  },
  ident_mdp_choisir: {
    fr: 'Choisissez un mot de passe (8 caractères minimum)',
    en: 'Choose a password (8 characters minimum)',
    sw: 'Chagua nenosiri (angalau herufi 8)',
    it: 'Scegli una password (minimo 8 caratteri)',
    de: 'Passwort wählen (mindestens 8 Zeichen)',
  },
  ident_erreur_format: {
    fr: 'Identifiant : 3 à 20 caractères, lettres et chiffres (sans espace ni accent).',
    en: 'Username: 3 to 20 characters, letters and digits (no space or accent).',
    sw: 'Jina la mtumiaji: herufi 3 hadi 20, herufi na tarakimu (bila nafasi wala lafudhi).',
    it: 'Nome utente: da 3 a 20 caratteri, lettere e cifre (senza spazi né accenti).',
    de: 'Benutzername: 3 bis 20 Zeichen, Buchstaben und Ziffern (keine Leer- oder Sonderzeichen).',
  },
  client_compte_cree: {
    fr: 'Compte créé ✓ — dites-nous simplement qui vous êtes.',
    en: 'Account created ✓ — just tell us who you are.',
    sw: 'Akaunti imefunguliwa ✓ — tuambie tu wewe ni nani.',
    it: 'Account creato ✓ — dicci solo chi sei.',
    de: 'Konto erstellt ✓ — sagen Sie uns nur noch, wer Sie sind.',
  },
  ident_erreur_vide: {
    fr: 'Entrez votre identifiant.',
    en: 'Enter your username.',
    sw: 'Weka jina lako la mtumiaji.',
    it: 'Inserisci il tuo nome utente.',
    de: 'Geben Sie Ihren Benutzernamen ein.',
  },
  doc_perdu_texte: {
    fr: 'Ce document a été envoyé avant la correction du stockage : il n\'a pas été conservé. Demandez au chauffeur (ou au client) de refaire sa candidature — les nouveaux documents s\'affichent ici normalement.',
    en: 'This document was sent before the storage fix and was not kept. Ask the driver (or client) to submit again — new documents display here normally.',
    sw: 'Hati hii ilitumwa kabla ya marekebisho ya hifadhi na haikuhifadhiwa. Mwombe dereva (au mteja) awasilishe tena — hati mpya zinaonekana hapa kawaida.',
  },
  doc_echec_texte: {
    fr: 'Impossible d\'afficher ce document ici (format non reconnu ou connexion interrompue).',
    en: 'This document cannot be displayed here (unrecognised format or connection lost).',
    sw: 'Haiwezekani kuonyesha hati hii hapa (muundo haujulikani au muunganisho umekatika).',
  },
  doc_ouvrir_navigateur: {
    fr: 'Ouvrir dans le navigateur',
    en: 'Open in the browser',
    sw: 'Fungua kwenye kivinjari',
  },
  equipe_doc_indisponible: {
    fr: 'document indisponible',
    en: 'document unavailable',
    sw: 'hati haipatikani',
  },
  equipe_doc_perdu_texte: {
    fr: 'Ce document a été envoyé avant la correction du stockage : il n\'a pas été conservé. Demandez au chauffeur de le renvoyer depuis son espace (il peut refaire sa candidature), les nouveaux documents s\'ouvrent normalement.',
    en: 'This document was sent before the storage fix and was not kept. Ask the driver to send it again from their space — new documents open normally.',
    sw: 'Hati hii ilitumwa kabla ya marekebisho ya hifadhi na haikuhifadhiwa. Mwombe dereva aitume tena — hati mpya zinafunguka kawaida.',
  },
  equipe_courses_passees: {
    fr: 'Courses passées',
    en: 'Past rides',
    sw: 'Safari zilizopita',
  },
  equipe_hier: { fr: 'Hier', en: 'Yesterday', sw: 'Jana' },
  equipe_demain: { fr: 'Demain', en: 'Tomorrow', sw: 'Kesho' },
  // Section « À venir » du tableau de bord : les départs déjà programmés.
  equipe_courses_a_venir: {
    fr: 'Courses à venir',
    en: 'Upcoming rides',
    sw: 'Safari zijazo',
  },
  // Rubrique « Courses en cours » : ce qui roule à l'instant même.
  equipe_courses_en_cours: {
    fr: 'Courses en cours',
    en: 'Rides underway',
    sw: 'Safari zinazoendelea',
  },
  equipe_en_cours_intro: {
    fr: 'Les taxis qui ont chargé leurs passagers et roulent en ce moment. Celui qui roule depuis le plus longtemps est en tête.',
    en: 'Taxis that have picked up their passengers and are on the road right now. The one running longest is at the top.',
    sw: 'Teksi zilizowachukua abiria na sasa ziko njiani. Iliyoanza zamani zaidi iko juu.',
  },
  equipe_en_cours_vide: {
    fr: 'Aucune course sur la route en ce moment.',
    en: 'No ride on the road right now.',
    sw: 'Hakuna safari njiani kwa sasa.',
  },
  equipe_en_cours_depuis: {
    fr: 'Sur la route depuis {duree}',
    en: 'On the road for {duree}',
    sw: 'Njiani kwa {duree}',
  },
  equipe_en_cours_attendu: {
    fr: 'trajet estimé {duree}',
    en: 'estimated {duree}',
    sw: 'inakadiriwa {duree}',
  },
  equipe_en_cours_min: { fr: '{min} min', en: '{min} min', sw: 'dakika {min}' },
  equipe_en_cours_heures: { fr: '{h} h {min}', en: '{h}h{min}', sw: 'saa {h}:{min}' },
  equipe_en_cours_depart_inconnu: {
    fr: 'Heure de départ inconnue',
    en: 'Departure time unknown',
    sw: 'Saa ya kuondoka haijulikani',
  },
  equipe_en_cours_appeler_client: {
    fr: 'Appeler le client',
    en: 'Call the client',
    sw: 'Mpigie mteja',
  },
  equipe_sans_chauffeur: {
    fr: 'Sans chauffeur',
    en: 'No driver',
    sw: 'Hakuna dereva',
  },
  // Rubrique « Taxis partagés » : la tour de contrôle du remplissage.
  equipe_partages: { fr: 'Taxis partagés', en: 'Shared taxis', sw: 'Teksi za pamoja' },
  equipe_partages_intro: {
    fr: 'Les voitures partagées annoncées par les chauffeurs. Une place vide au départ ne se rattrape jamais : appelez le chauffeur ou relancez les clients en attente.',
    en: 'Shared cars posted by drivers. An empty seat at departure is lost for good: call the driver or chase the waiting clients.',
    sw: 'Magari ya pamoja yaliyotangazwa na madereva. Kiti kitupu wakati wa kuondoka hakirudi: mpigie dereva au wafuate wateja wanaosubiri.',
  },
  equipe_partages_vide: {
    fr: 'Aucune voiture partagée annoncée ces jours-ci.',
    en: 'No shared car posted these days.',
    sw: 'Hakuna gari la pamoja lililotangazwa siku hizi.',
  },
  equipe_partages_la_place: { fr: 'la place', en: 'per seat', sw: 'kiti' },
  // Court exprès : la pastille doit se lire d'un coup d'œil, jamais tronquée.
  equipe_partages_restantes: {
    fr: '{n} à vendre',
    en: '{n} left',
    sw: '{n} wazi',
  },
  equipe_partages_complet: { fr: 'Voiture pleine', en: 'Car full', sw: 'Gari limejaa' },
  equipe_partages_close: { fr: 'Annonce close', en: 'Closed', sw: 'Imefungwa' },
  equipe_partages_bilan: {
    fr: '{payees} payée·s · {libres} libre·s',
    en: '{payees} paid · {libres} free',
    sw: '{payees} zimelipwa · {libres} wazi',
  },
  equipe_partages_reservees: {
    fr: '{n} à encaisser',
    en: '{n} to collect',
    sw: '{n} kusubiri malipo',
  },
  equipe_partages_terminees: {
    fr: 'Annonces terminées',
    en: 'Finished rides',
    sw: 'Safari zilizokwisha',
  },
  equipe_partages_vendues: {
    fr: '{n}/{total} vendue·s',
    en: '{n}/{total} sold',
    sw: '{n}/{total} zimeuzwa',
  },
  equipe_partages_annulee: { fr: 'annulée', en: 'cancelled', sw: 'imefutwa' },
  equipe_partages_commission: { fr: 'zanziGo {montant} $', en: 'zanziGo ${montant}', sw: 'zanziGo {montant} $' },
  equipe_partages_sieges: { fr: '{n} place·s', en: '{n} seat·s', sw: 'viti {n}' },
  equipe_partages_impayee: { fr: 'pas encore payée', en: 'not paid yet', sw: 'bado hajalipa' },
  equipe_partages_anonyme: {
    fr: 'Client (nom à la confirmation du paiement)',
    en: 'Client (name shown once paid)',
    sw: 'Mteja (jina litaonekana baada ya malipo)',
  },
  equipe_a_venir_vide: {
    fr: 'Aucun départ programmé pour les prochains jours.',
    en: 'No departures scheduled for the coming days.',
    sw: 'Hakuna safari iliyopangwa kwa siku zijazo.',
  },
  equipe_jour_compte: {
    fr: '{n} course·s',
    en: '{n} ride·s',
    sw: 'safari {n}',
  },
  equipe_attentes_intro: {
    fr: 'Clients qui cherchent un taxi partagé sans annonce disponible : recontactez-les dès qu\'un chauffeur poste le trajet (vous êtes aussi prévenu automatiquement).',
    en: 'Clients looking for a shared taxi with no posted ride: contact them as soon as a driver posts the route (you are also notified automatically).',
    sw: 'Wateja wanaotafuta teksi ya kushirikiana bila tangazo: wasiliane nao mara dereva atakapotangaza safari (pia unajulishwa kiotomatiki).',
  },
  equipe_attentes_vide: {
    fr: 'Aucune demande en attente — tout le monde a trouvé sa place.',
    en: 'No waiting requests — everyone found a seat.',
    sw: 'Hakuna maombi yanayosubiri — kila mtu amepata kiti.',
  },
  equipe_attente_trouvee: { fr: 'Annonce trouvée', en: 'Ride found', sw: 'Tangazo limepatikana' },
  equipe_attente_ouverte: { fr: 'En attente', en: 'Waiting', sw: 'Inasubiri' },
  equipe_attente_contacter: {
    fr: 'Contacter sur WhatsApp',
    en: 'Contact on WhatsApp',
    sw: 'Wasiliana WhatsApp',
  },
  equipe_parraine_par: {
    fr: 'Parrainé par {nom}',
    en: 'Referred by {nom}',
    sw: 'Amedhaminiwa na {nom}',
  },
  equipe_parrainage_acquis: {
    fr: '🎁 récompense acquise (5 $ chacun)',
    en: '🎁 reward earned ($5 each)',
    sw: '🎁 zawadi imepatikana ($5 kila mmoja)',
  },
  equipe_parrainage_progres: {
    fr: '{n}/2 courses avant la récompense',
    en: '{n}/2 rides before the reward',
    sw: 'safari {n}/2 kabla ya zawadi',
  },
  equipe_docs_alerte: { fr: 'Docs à renouveler', en: 'Docs expiring', sw: 'Nyaraka zinaisha' },
  equipe_docs_permis: { fr: 'Permis expire', en: 'License expires', sw: 'Leseni inaisha' },
  equipe_docs_assurance: { fr: 'Assurance expire', en: 'Insurance expires', sw: 'Bima inaisha' },
  equipe_docs_enregistrer: {
    fr: 'Enregistrer les dates',
    en: 'Save the dates',
    sw: 'Hifadhi tarehe',
  },
  equipe_docs_format: {
    fr: 'Format de date : AAAA-MM-JJ (ex. 2026-12-31).',
    en: 'Date format: YYYY-MM-DD (e.g. 2026-12-31).',
    sw: 'Muundo wa tarehe: MWAKA-MM-SS (mf. 2026-12-31).',
  },
  equipe_sauvegarde_bouton: {
    fr: '💾 Sauvegarde de la base (télécharger)',
    en: '💾 Database backup (download)',
    sw: '💾 Hifadhi nakala ya data (pakua)',
  },
  equipe_sauvegarde_titre: { fr: 'Sauvegarde', en: 'Backup', sw: 'Hifadhi nakala' },
  equipe_sauvegarde_web: {
    fr: 'Le téléchargement de la sauvegarde se fait depuis la version web (ordinateur) : ouvrez le tableau équipe sur zanzigo-api.onrender.com/web.',
    en: 'The backup download works from the web version (computer): open the team dashboard at zanzigo-api.onrender.com/web.',
    sw: 'Upakuaji wa hifadhi nakala unafanyika kwenye toleo la wavuti (kompyuta): fungua dashibodi ya timu kwenye zanzigo-api.onrender.com/web.',
  },
  reserver_note_prix: {
    fr: 'Tarif plat selon la formule (grille zanziGo). Le prix est figé à la réservation — aucun supplément ensuite.',
    en: 'Flat fare by ride mode (zanziGo price list). The price is locked at booking — no extra charges later.',
    sw: 'Bei maalum kwa kila aina ya safari (orodha ya zanziGo). Bei inafungwa wakati wa kuweka safari — hakuna nyongeza baadaye.',
    it: 'Tariffa fissa secondo il tipo di corsa (listino zanziGo). Il prezzo è bloccato al momento della prenotazione — nessun supplemento in seguito.',
    de: 'Pauschaltarif je nach Fahrtart (zanziGo-Preisliste). Der Preis wird bei der Buchung festgeschrieben — keine Zuschläge danach.',
  },
  reserver_remise_activee: {
    fr: 'Remise résident de 5 % appliquée sur tous vos trajets.',
    en: 'Resident 5% discount applied to all your rides.',
    sw: 'Punguzo la 5% la mkazi limewekwa kwenye safari zako zote.',
    it: 'Sconto residenti del 5% applicato a tutte le tue corse.',
    de: '5 % Rabatt für Ansässige auf alle Ihre Fahrten angewendet.',
  },
  reserver_remise_attente: {
    fr: 'Remise de 5 % activée après validation de vos documents.',
    en: '5% discount unlocked once your documents are validated.',
    sw: 'Punguzo la 5% litaanza baada ya nyaraka zako kuhakikiwa.',
    it: 'Sconto del 5% attivo una volta convalidati i tuoi documenti.',
    de: '5 % Rabatt freigeschaltet, sobald Ihre Unterlagen bestätigt sind.',
  },
  reserver_local_attente_titre: {
    fr: 'Validation en cours',
    en: 'Validation in progress',
    sw: 'Uhakiki unaendelea',
    it: 'Convalida in corso',
    de: 'Prüfung läuft',
  },
  reserver_local_attente_texte: {
    fr: "Votre carte d'identité tanzanienne est en cours de validation par l'équipe zanziGo. Vous pourrez réserver dès qu'elle est validée.",
    en: 'Your Tanzanian ID card is being validated by the zanziGo team. You will be able to book as soon as it is approved.',
    sw: 'Kitambulisho chako cha NIDA kinahakikiwa na timu ya zanziGo. Utaweza kuweka safari mara kitakapothibitishwa.',
    it: 'La tua carta d\'identità tanzaniana è in fase di convalida da parte del team zanziGo. Potrai prenotare non appena sarà approvata.',
    de: 'Ihr tansanischer Personalausweis wird derzeit vom zanziGo-Team geprüft. Sie können buchen, sobald er freigegeben ist.',
  },
  reserver_bouton: { fr: 'Réserver cette course', en: 'Book this ride', sw: 'Weka safari hii' , it: 'Prenota questa corsa', de: 'Diese Fahrt buchen' },
  reserver_bouton_hotel: { fr: 'Réserver pour ce client', en: 'Book for this guest', sw: 'Weka kwa mteja huyu' , it: 'Prenota per questo cliente', de: 'Für diesen Gast buchen' },
  reserver_erreur_profil: {
    fr: 'Créez votre profil client avant de réserver.',
    en: 'Create your customer profile before booking.',
    sw: 'Tengeneza wasifu wako wa mteja kabla ya kuweka safari.',
    it: 'Crea il tuo profilo cliente prima di prenotare.',
    de: 'Erstellen Sie Ihr Kundenprofil, bevor Sie buchen.',
  },
  reserver_erreur_itineraire: {
    fr: 'Indiquez le lieu de départ et la destination.',
    en: 'Enter the pickup point and the destination.',
    sw: 'Weka mahali pa kuondoka na pa kufika.',
    it: 'Indica il punto di partenza e la destinazione.',
    de: 'Geben Sie Abholort und Ziel an.',
  },
  reserver_erreur_nom_client: {
    fr: 'Indiquez le nom du client pour cette course.',
    en: 'Enter the guest name for this ride.',
    sw: 'Weka jina la mteja kwa safari hii.',
    it: 'Indica il nome del cliente per questa corsa.',
    de: 'Geben Sie den Namen des Gastes für diese Fahrt an.',
  },
  reserver_erreur_tel_client: {
    fr: 'Téléphone du client invalide (format international +255…).',
    en: 'Invalid guest phone (international format +255…).',
    sw: 'Simu ya mteja si sahihi (muundo wa kimataifa +255…).',
    it: 'Telefono del cliente non valido (formato internazionale +255…).',
    de: 'Ungültige Telefonnummer des Gastes (internationales Format +255 …).',
  },
  reserver_erreur_local_only: {
    fr: 'Le taxi partagé local est réservé aux locaux vérifiés (carte tanzanienne).',
    en: 'The local shared taxi is reserved for verified locals (Tanzanian ID).',
    sw: 'Teksi ya pamoja ya wenyeji ni kwa wazawa waliothibitishwa tu (kitambulisho cha NIDA).',
    it: 'Il taxi condiviso locale è riservato ai residenti verificati (documento tanzaniano).',
    de: 'Das lokale Sammeltaxi ist geprüften Einheimischen vorbehalten (tansanischer Ausweis).',
  },
  reserver_erreur_local_attente: {
    fr: 'Validation en cours — vous pourrez réserver une fois votre carte d’identité validée.',
    en: 'Validation in progress — you can book once your ID card is approved.',
    sw: 'Uhakiki unaendelea — utaweza kuweka safari baada ya kitambulisho chako kuthibitishwa.',
    it: 'Convalida in corso — potrai prenotare una volta approvata la tua carta d\'identità.',
    de: 'Prüfung läuft — Sie können buchen, sobald Ihr Ausweis freigegeben ist.',
  },
  reserver_erreur: {
    fr: 'La réservation a échoué. Réessayez.',
    en: 'Booking failed. Try again.',
    sw: 'Imeshindikana kuweka safari. Jaribu tena.',
    it: 'Prenotazione non riuscita. Riprova.',
    de: 'Buchung fehlgeschlagen. Bitte erneut versuchen.',
  },

  // --- Trajets partagés (section client) ---------------------------------------
  rides_titre: { fr: 'Trajets partagés à venir', en: 'Upcoming shared rides', sw: 'Safari za pamoja zijazo' , it: 'Prossime corse condivise', de: 'Kommende Sammelfahrten' },
  rides_soustitre: {
    fr: "Postés par nos chauffeurs — réservez votre place via l'équipe.",
    en: 'Posted by our drivers — book your seat via the team.',
    sw: 'Zimewekwa na madereva wetu — hifadhi kiti chako kupitia timu.',
  },
  rides_filtre: { fr: 'Filtrer par destination', en: 'Filter by destination', sw: 'Chuja kwa unakoenda' , it: 'Filtra per destinazione', de: 'Nach Ziel filtern' },
  rides_toutes: { fr: 'Toutes les destinations', en: 'All destinations', sw: 'Maeneo yote' , it: 'Tutte le destinazioni', de: 'Alle Ziele' },
  rides_complet: { fr: 'Complet', en: 'Full', sw: 'Imejaa' , it: 'Al completo', de: 'Ausgebucht' },
  rides_vide: {
    fr: "Aucun trajet partagé pour l'instant — revenez plus tard.",
    en: 'No shared rides yet — check back later.',
    sw: 'Hakuna safari za pamoja kwa sasa — rudi baadaye.',
  },
  rides_vide_destination: {
    fr: "Aucun trajet partagé vers {destination} pour l'instant.",
    en: 'No shared rides to {destination} yet.',
    sw: 'Hakuna safari za pamoja kwenda {destination} kwa sasa.',
    it: 'Nessuna corsa condivisa verso {destination} per ora.',
    de: 'Noch keine Sammelfahrten nach {destination}.',
  },
  rides_place_restante: { fr: '{n} place restante', en: '{n} seat left', sw: 'Kiti {n} kimebaki' , it: '{n} posto rimasto', de: '{n} Platz frei' },
  rides_places_restantes: { fr: '{n} places restantes', en: '{n} seats left', sw: 'Viti {n} vimebaki' , it: '{n} posti rimasti', de: '{n} Plätze frei' },
  rides_chauffeur_defaut: { fr: 'Chauffeur zanziGo', en: 'zanziGo driver', sw: 'Dereva wa zanziGo' , it: 'Autista zanziGo', de: 'zanziGo-Fahrer' },
  rides_par_place: { fr: '/ place', en: '/ seat', sw: '/ kiti' , it: '/ posto', de: '/ Platz' },
  rides_reserver: { fr: 'Réserver', en: 'Book', sw: 'Hifadhi' , it: 'Prenota', de: 'Buchen' },
  rides_reservation_ok: {
    fr: 'Réservation confirmée ({n} place·s) — envoyez le message WhatsApp qui s\'ouvre pour prévenir l\'équipe. 🎉',
    en: 'Booking confirmed ({n} seat·s) — send the WhatsApp message that opens to notify the team. 🎉',
    sw: 'Uhifadhi umethibitishwa (viti {n}) — tuma ujumbe wa WhatsApp unaofunguka kuijulisha timu. 🎉',
    it: 'Prenotazione confermata ({n} posto/i) — invia il messaggio WhatsApp che si apre per avvisare il team. 🎉',
    de: 'Buchung bestätigt ({n} Platz/Plätze) — senden Sie die sich öffnende WhatsApp-Nachricht, um das Team zu informieren. 🎉',
  },
  rides_erreur_places: {
    fr: 'Plus assez de places disponibles sur ce trajet.',
    en: 'Not enough seats left on this ride.',
    sw: 'Viti havitoshi tena kwenye safari hii.',
    it: 'Non ci sono abbastanza posti su questa corsa.',
    de: 'Auf dieser Fahrt sind nicht genügend Plätze frei.',
  },
  rides_erreur_ferme: {
    fr: 'Ce trajet n\'est plus ouvert à la réservation.',
    en: 'This ride is no longer open for booking.',
    sw: 'Safari hii haipokei uhifadhi tena.',
    it: 'Questa corsa non è più prenotabile.',
    de: 'Diese Fahrt ist nicht mehr buchbar.',
  },
  rides_erreur_reservation: {
    fr: 'Réservation impossible pour le moment — réessayez.',
    en: 'Booking failed for now — try again.',
    sw: 'Uhifadhi umeshindikana kwa sasa — jaribu tena.',
    it: 'Prenotazione non riuscita per ora — riprova.',
    de: 'Buchung derzeit fehlgeschlagen — bitte erneut versuchen.',
  },

  // --- Mes trajets --------------------------------------------------------------
  trajets_vide_titre: { fr: "Aucun trajet pour l'instant", en: 'No rides yet', sw: 'Hakuna safari bado' , it: 'Nessuna corsa per ora', de: 'Noch keine Fahrten' },
  trajets_vide_texte: {
    fr: 'Votre première course vous attend !',
    en: 'Your first ride awaits!',
    sw: 'Safari yako ya kwanza inakusubiri!',
    it: 'La tua prima corsa ti aspetta!',
    de: 'Ihre erste Fahrt wartet!',
  },
  trajets_vide_texte_hotel: {
    fr: "Réservez un premier taxi pour l'un de vos clients !",
    en: 'Book a first taxi for one of your guests!',
    sw: 'Weka teksi ya kwanza kwa mmoja wa wageni wako!',
    it: 'Prenota un primo taxi per uno dei vostri clienti!',
    de: 'Buchen Sie ein erstes Taxi für einen Ihrer Gäste!',
  },
  trajets_reserver_bouton: { fr: 'Réserver une course', en: 'Book a ride', sw: 'Weka safari' , it: 'Prenota una corsa', de: 'Eine Fahrt buchen' },
  trajets_payer: { fr: 'Payer maintenant', en: 'Pay now', sw: 'Lipa sasa' , it: 'Paga ora', de: 'Jetzt bezahlen' },
  trajets_noter: { fr: 'Touchez pour noter votre course', en: 'Tap to rate your ride', sw: 'Gusa kutoa alama ya safari' , it: 'Tocca per valutare la tua corsa', de: 'Tippen, um Ihre Fahrt zu bewerten' },
  trajets_erreur: {
    fr: 'Chargement impossible. Tirez pour réessayer.',
    en: "Couldn't load. Pull to retry.",
    sw: 'Imeshindikana kupakia. Vuta chini kujaribu tena.',
  },
  trajets_course_defaut: { fr: 'Course', en: 'Ride', sw: 'Safari' , it: 'Corsa', de: 'Fahrt' },

  // --- Détail trajet --------------------------------------------------------------
  trip_titre: { fr: 'Votre course', en: 'Your ride', sw: 'Safari yako' , it: 'La tua corsa', de: 'Ihre Fahrt' },
  trip_chargement: { fr: 'Chargement de votre course…', en: 'Loading your ride…', sw: 'Inapakia safari yako…' , it: 'Caricamento della tua corsa…', de: 'Ihre Fahrt wird geladen …' },
  trip_introuvable: { fr: 'Trajet introuvable.', en: 'Ride not found.', sw: 'Safari haipatikani.' , it: 'Corsa non trovata.', de: 'Fahrt nicht gefunden.' },
  trip_programme_le: { fr: 'Programmé le', en: 'Scheduled for', sw: 'Imepangwa' , it: 'Programmata per', de: 'Geplant für' },
  trip_prix_fige: { fr: 'Prix figé', en: 'Locked price', sw: 'Bei iliyofungwa' , it: 'Prezzo bloccato', de: 'Festpreis' },
  trip_suivi: { fr: 'Suivi de la course', en: 'Ride status', sw: 'Mwenendo wa safari' , it: 'Stato della corsa', de: 'Status der Fahrt' },
  trip_demande_envoyee: {
    fr: "Demande envoyée — l'équipe zanziGo vous confirme un chauffeur, puis le paiement sera proposé ici.",
    en: 'Request sent — the zanziGo team confirms a driver, then payment will be offered here.',
    sw: 'Ombi limetumwa — timu ya zanziGo itathibitisha dereva, kisha malipo yataonekana hapa.',
  },
  // ----- File de vérification des dossiers (équipe).
  verif_titre: {
    fr: 'Dossiers à vérifier', en: 'Files to review', sw: 'Faili za kukagua',
    it: 'Pratiche da verificare', de: 'Zu prüfende Unterlagen',
  },
  verif_chargement: {
    fr: 'Chargement des dossiers…', en: 'Loading files…', sw: 'Inapakia faili…',
    it: 'Caricamento pratiche…', de: 'Unterlagen werden geladen…',
  },
  verif_reste: {
    fr: '{n} en attente', en: '{n} pending', sw: '{n} zinasubiri',
    it: '{n} in attesa', de: '{n} offen',
  },
  verif_rien: {
    fr: 'Aucun dossier en attente. Tout est à jour.',
    en: 'No files pending. Everything is up to date.',
    sw: 'Hakuna faili linalosubiri. Kila kitu kiko sawa.',
    it: 'Nessuna pratica in attesa. Tutto aggiornato.',
    de: 'Keine offenen Unterlagen. Alles erledigt.',
  },
  verif_termine: {
    fr: '{n} dossier(s) traité(s). La file est vide — beau travail.',
    en: '{n} file(s) handled. The queue is empty — nice work.',
    sw: 'Faili {n} zimeshughulikiwa. Foleni ni tupu — kazi nzuri.',
    it: '{n} pratica/e gestita/e. La coda è vuota — ottimo lavoro.',
    de: '{n} Unterlage(n) bearbeitet. Die Liste ist leer — gute Arbeit.',
  },
  verif_type_chauffeur: {
    fr: 'Chauffeur', en: 'Driver', sw: 'Dereva', it: 'Autista', de: 'Fahrer',
  },
  verif_type_client: {
    fr: 'Client', en: 'Customer', sw: 'Mteja', it: 'Cliente', de: 'Kunde',
  },
  verif_type_hotel: {
    fr: 'Hôtel', en: 'Hotel', sw: 'Hoteli', it: 'Hotel', de: 'Hotel',
  },
  verif_attente_minutes: {
    fr: 'déposé il y a moins d\'une heure', en: 'submitted less than an hour ago',
    sw: 'imewasilishwa chini ya saa moja iliyopita',
    it: 'inviato meno di un\'ora fa', de: 'vor weniger als einer Stunde eingereicht',
  },
  verif_attente_heures: {
    fr: 'attend depuis {n} h', en: 'waiting for {n} h', sw: 'inasubiri kwa saa {n}',
    it: 'in attesa da {n} h', de: 'wartet seit {n} Std.',
  },
  verif_attente_jours: {
    fr: 'attend depuis {n} jour(s)', en: 'waiting for {n} day(s)',
    sw: 'inasubiri kwa siku {n}', it: 'in attesa da {n} giorno/i',
    de: 'wartet seit {n} Tag(en)',
  },
  verif_agrandir: {
    fr: 'Appuyez sur l\'image pour l\'agrandir',
    en: 'Tap the image to enlarge it',
    sw: 'Gusa picha ili kuikuza',
    it: 'Tocca l\'immagine per ingrandirla',
    de: 'Zum Vergrößern auf das Bild tippen',
  },
  verif_hotel_telephone: {
    fr: 'Un hôtel ne dépose aucune pièce : appelez le numéro officiel de l\'établissement pour confirmer que l\'inscription vient bien de lui.',
    en: 'A hotel submits no documents: call the property\'s official number to confirm the sign-up really comes from them.',
    sw: 'Hoteli haiwasilishi hati: piga simu kwa nambari rasmi ya hoteli ili kuthibitisha usajili ni wao.',
    it: 'Un hotel non invia documenti: chiama il numero ufficiale della struttura per confermare che l\'iscrizione venga davvero da loro.',
    de: 'Ein Hotel reicht keine Dokumente ein: Rufen Sie die offizielle Nummer des Hauses an, um die Anmeldung zu bestätigen.',
  },
  verif_valider: {
    fr: '✅ Valider le dossier', en: '✅ Approve', sw: '✅ Idhinisha',
    it: '✅ Approva', de: '✅ Freigeben',
  },
  verif_refuser: {
    fr: '❌ Refuser', en: '❌ Reject', sw: '❌ Kataa', it: '❌ Rifiuta', de: '❌ Ablehnen',
  },
  verif_plus_tard: {
    fr: '⏭ Plus tard — passer au suivant', en: '⏭ Later — next file',
    sw: '⏭ Baadaye — faili linalofuata', it: '⏭ Più tardi — prossima pratica',
    de: '⏭ Später — nächste Unterlage',
  },
  verif_erreur: {
    fr: 'Impossible de charger les dossiers. Réessayez.',
    en: 'Could not load the files. Try again.',
    sw: 'Imeshindwa kupakia faili. Jaribu tena.',
    it: 'Impossibile caricare le pratiche. Riprova.',
    de: 'Unterlagen konnten nicht geladen werden. Bitte erneut versuchen.',
  },
  equipe_stat_verifications: {
    fr: 'À vérifier', en: 'To review', sw: 'Za kukagua',
    it: 'Da verificare', de: 'Zu prüfen',
  },
  parrainage_credit_titre: {
    fr: '🎁 Crédit parrainage',
    en: '🎁 Referral credit',
    sw: '🎁 Salio la mwaliko',
    it: '🎁 Credito invito',
    de: '🎁 Empfehlungsguthaben',
  },
  parrainage_credit_texte: {
    fr: '{montant} vous attendent — déduits automatiquement de votre prochaine course, rien à faire.',
    en: '{montant} is waiting for you — automatically deducted from your next ride, nothing to do.',
    sw: '{montant} inakusubiri — itapunguzwa kiotomatiki kwenye safari yako ijayo, hakuna cha kufanya.',
    it: '{montant} ti aspettano — detratti automaticamente dalla prossima corsa, niente da fare.',
    de: '{montant} warten auf Sie — automatisch bei der nächsten Fahrt abgezogen, nichts zu tun.',
  },
  // ----- Remise de parrainage automatique.
  parrainage_remise_info: {
    fr: '🎁 Parrainage : {montant} seront déduits automatiquement de votre paiement.',
    en: '🎁 Referral reward: {montant} will be deducted from your payment automatically.',
    sw: '🎁 Zawadi ya mwaliko: {montant} itapunguzwa kiotomatiki kwenye malipo yako.',
    it: '🎁 Premio invito: {montant} saranno detratti automaticamente dal pagamento.',
    de: '🎁 Empfehlungsprämie: {montant} werden automatisch vom Betrag abgezogen.',
  },
  // ----- Choix du moyen de paiement (carte bancaire / portefeuille mobile).
  paiement_choix_titre: {
    fr: 'Comment souhaitez-vous payer ?',
    en: 'How would you like to pay?',
    sw: 'Ungependa kulipa vipi?',
    it: 'Come desidera pagare?',
    de: 'Wie möchten Sie bezahlen?',
  },
  paiement_carte: {
    fr: '💳 Carte bancaire — {montant}',
    en: '💳 Credit card — {montant}',
    sw: '💳 Kadi ya benki — {montant}',
    it: '💳 Carta di credito — {montant}',
    de: '💳 Kreditkarte — {montant}',
  },
  paiement_carte_detail: {
    fr: 'Prix {prix} + {frais} de frais bancaires (4 %), à la charge du payeur.',
    en: 'Price {prix} + {frais} card fees (4%), paid by the cardholder.',
    sw: 'Bei {prix} + {frais} ada ya kadi (4%), inalipwa na mlipaji.',
    it: 'Prezzo {prix} + {frais} di commissioni bancarie (4%), a carico di chi paga.',
    de: 'Preis {prix} + {frais} Kartengebühren (4 %), zulasten des Zahlenden.',
  },
  paiement_mobile: {
    fr: '📱 Portefeuille mobile — {montant}',
    en: '📱 Mobile wallet — {montant}',
    sw: '📱 Pochi ya simu — {montant}',
    it: '📱 Portafoglio mobile — {montant}',
    de: '📱 Mobile Wallet — {montant}',
  },
  paiement_mobile_detail: {
    fr: 'Tigo Pesa, M-Pesa ou Airtel Money — aucun frais ajouté.',
    en: 'Tigo Pesa, M-Pesa or Airtel Money — no fees added.',
    sw: 'Tigo Pesa, M-Pesa au Airtel Money — hakuna ada ya ziada.',
    it: 'Tigo Pesa, M-Pesa o Airtel Money — nessuna commissione aggiuntiva.',
    de: 'Tigo Pesa, M-Pesa oder Airtel Money — ohne Zusatzgebühren.',
  },
  paiement_moyen_carte_court: {
    fr: 'Carte bancaire',
    en: 'Credit card',
    sw: 'Kadi ya benki',
    it: 'Carta di credito',
    de: 'Kreditkarte',
  },
  paiement_moyen_mobile_court: {
    fr: 'Portefeuille mobile',
    en: 'Mobile wallet',
    sw: 'Pochi ya simu',
    it: 'Portafoglio mobile',
    de: 'Mobile Wallet',
  },
  trip_payer: { fr: 'Payer la course', en: 'Pay for the ride', sw: 'Lipia safari' , it: 'Paga la corsa', de: 'Fahrt bezahlen' },
  trip_verifier_paiement: {
    fr: "J'ai payé — vérifier le paiement",
    en: "I've paid — verify payment",
    sw: 'Nimelipa — hakiki malipo',
  },
  trip_annuler: { fr: 'Annuler la course', en: 'Cancel the ride', sw: 'Ghairi safari' , it: 'Annulla la corsa', de: 'Fahrt stornieren' },
  trip_annuler_confirm: {
    fr: 'Annuler cette course ?',
    en: 'Cancel this ride?',
    sw: 'Ughairi safari hii?',
    it: 'Annullare questa corsa?',
    de: 'Diese Fahrt stornieren?',
  },
  trip_annuler_confirm_rembours: {
    fr: 'Annuler cette course payée ? Vous serez remboursé de {montant} ({taux} % — barème : 100 % à plus de 48 h du départ, 50 % entre 48 h et 24 h).',
    en: 'Cancel this paid ride? You will be refunded {montant} ({taux}% — scale: 100% more than 48 h before departure, 50% between 48 h and 24 h).',
    sw: 'Ughairi safari hii iliyolipwa? Utarejeshewa {montant} ({taux}% — kiwango: 100% zaidi ya saa 48 kabla ya kuondoka, 50% kati ya saa 48 na 24).',
    it: 'Annullare questa corsa pagata? Ti verranno rimborsati {montant} ({taux}% — scala: 100% oltre 48 h prima della partenza, 50% tra 48 h e 24 h).',
    de: 'Diese bezahlte Fahrt stornieren? Sie erhalten {montant} ({taux} %) zurück — Staffel: 100 % bei mehr als 48 Std. vor Abfahrt, 50 % zwischen 48 und 24 Std.',
  },
  trip_annulee_titre: { fr: 'Voyage annulé', en: 'Trip cancelled', sw: 'Safari imeghairiwa' , it: 'Corsa annullata', de: 'Fahrt storniert' },
  trip_annulee_rembours: {
    fr: 'Course annulée. Remboursement de {montant} : l\'équipe vous le verse — le message WhatsApp qui s\'ouvre la prévient, appuyez sur Envoyer.',
    en: 'Ride cancelled. {montant} refund: the team will pay you — the WhatsApp message that opens notifies them, just press Send.',
    sw: 'Safari imeghairiwa. Marejesho ya {montant}: timu itakulipa — ujumbe wa WhatsApp unaofunguka unawajulisha, bonyeza Tuma.',
    it: 'Corsa annullata. Rimborso di {montant}: il team te lo verserà — il messaggio WhatsApp che si apre li avvisa, basta premere Invia.',
    de: 'Fahrt storniert. Rückerstattung von {montant}: Das Team zahlt sie aus — die sich öffnende WhatsApp-Nachricht benachrichtigt es, einfach auf Senden drücken.',
  },
  commun_retour: { fr: 'Retour', en: 'Back', sw: 'Rudi' , it: 'Indietro', de: 'Zurück' },
  tel_intro_local: {
    fr: 'Votre numéro + un mot de passe de votre choix — pas de code à attendre.',
    en: 'Your number + a password of your choice — no code to wait for.',
    sw: 'Namba yako + nenosiri unalochagua — hakuna msimbo wa kusubiri.',
    it: 'Il tuo numero + una password a tua scelta — nessun codice da attendere.',
    de: 'Ihre Nummer + ein Passwort Ihrer Wahl — kein Code zum Abwarten.',
  },
  tel_intro_visiteur: {
    fr: 'Votre numéro + un mot de passe de votre choix — aucun code SMS à recevoir, ça marche partout dans le monde.',
    en: 'Your number + a password of your choice — no SMS code to receive, works anywhere in the world.',
    sw: 'Namba yako + nenosiri unalochagua — hakuna msimbo wa SMS, inafanya kazi popote duniani.',
    it: 'Il tuo numero + una password a tua scelta — nessun codice SMS da ricevere, funziona in tutto il mondo.',
    de: 'Ihre Nummer + ein Passwort Ihrer Wahl — kein SMS-Code nötig, funktioniert weltweit.',
  },
  tel_compte_existant: {
    fr: 'Un compte existe déjà avec ce numéro, mais ce mot de passe ne correspond pas. Utilisez « Se connecter » — mot de passe oublié ? Écrivez-nous sur WhatsApp.',
    en: 'An account already exists with this number, but this password does not match. Use "Sign in" — forgot your password? Message us on WhatsApp.',
    sw: 'Akaunti tayari ipo kwa namba hii, lakini nenosiri hili halilingani. Tumia « Ingia » — umesahau nenosiri? Tuandikie WhatsApp.',
    it: 'Esiste già un account con questo numero, ma la password non corrisponde. Usa «Accedi» — password dimenticata? Scrivici su WhatsApp.',
    de: 'Mit dieser Nummer existiert bereits ein Konto, aber das Passwort stimmt nicht. Nutzen Sie „Anmelden“ — Passwort vergessen? Schreiben Sie uns über WhatsApp.',
  },
  tel_mdp_label: {
    fr: 'Mot de passe (8 caractères minimum)',
    en: 'Password (8 characters minimum)',
    sw: 'Nenosiri (angalau herufi 8)',
    it: 'Password (minimo 8 caratteri)',
    de: 'Passwort (mindestens 8 Zeichen)',
  },
  tel_bouton_connexion: { fr: 'Se connecter', en: 'Log in', sw: 'Ingia' , it: 'Accedi', de: 'Einloggen' },
  tel_bouton_creer_compte: {
    fr: 'Nouveau ? Créer mon compte',
    en: 'New here? Create my account',
    sw: 'Mgeni? Fungua akaunti yangu',
    it: 'Sei nuovo? Crea il mio account',
    de: 'Neu hier? Mein Konto erstellen',
  },
  tel_erreur_mdp: {
    fr: 'Mot de passe : 8 caractères minimum',
    en: 'Password: 8 characters minimum',
    sw: 'Nenosiri: angalau herufi 8',
    it: 'Password: minimo 8 caratteri',
    de: 'Passwort: mindestens 8 Zeichen',
  },
  tel_mdp_oublie: {
    fr: 'Mot de passe oublié ? Écrivez à l\'équipe sur WhatsApp : +255 666 241 749',
    en: 'Forgot your password? Message the team on WhatsApp: +255 666 241 749',
    sw: 'Umesahau nenosiri? Andikia timu WhatsApp: +255 666 241 749',
    it: 'Password dimenticata? Scrivi al team su WhatsApp: +255 666 241 749',
    de: 'Passwort vergessen? Schreiben Sie dem Team über WhatsApp: +255 666 241 749',
  },
  tel_lien_telephone: {
    fr: '📱 J\'ai un compte créé par téléphone — me connecter par SMS',
    en: '📱 I have an account created by phone — log in by SMS',
    sw: '📱 Nina akaunti ya simu — ingia kwa SMS',
    it: '📱 Ho un account creato per telefono — accedi via SMS',
    de: '📱 Ich habe ein per Telefon erstelltes Konto — per SMS anmelden',
  },
  tel_retour_email: {
    fr: '📧 Revenir à la connexion par e-mail',
    en: '📧 Back to e-mail login',
    sw: '📧 Rudi kuingia kwa barua pepe',
    it: '📧 Torna all\'accesso via e-mail',
    de: '📧 Zurück zur E-Mail-Anmeldung',
  },
  client_email_verifie: {
    fr: 'E-mail vérifié : {email}',
    en: 'Verified e-mail: {email}',
    sw: 'Barua pepe imethibitishwa: {email}',
    it: 'E-mail verificata: {email}',
    de: 'Bestätigte E-Mail: {email}',
  },
  client_whatsapp_opt: {
    fr: 'WhatsApp (recommandé — pour que le chauffeur vous joigne)',
    en: 'WhatsApp (recommended — so the driver can reach you)',
    sw: 'WhatsApp (inapendekezwa — dereva aweze kukupata)',
    it: 'WhatsApp (consigliato — così l\'autista può contattarti)',
    de: 'WhatsApp (empfohlen — damit der Fahrer Sie erreichen kann)',
  },
  tel_email_lien: {
    fr: '🌍 À l\'étranger ou pas de réception SMS ? Recevez le code par e-mail',
    en: '🌍 Abroad or no SMS reception? Get the code by e-mail',
    sw: '🌍 Uko nje ya nchi au huwezi kupokea SMS? Pokea msimbo kwa barua pepe',
    it: '🌍 All\'estero o senza copertura SMS? Ricevi il codice per e-mail',
    de: '🌍 Im Ausland oder kein SMS-Empfang? Code per E-Mail erhalten',
  },
  tel_email_retour_sms: {
    fr: '← Revenir au code par SMS',
    en: '← Back to SMS code',
    sw: '← Rudi kwa msimbo wa SMS',
    it: '← Torna al codice via SMS',
    de: '← Zurück zum SMS-Code',
  },
  tel_email_label: { fr: 'Votre adresse e-mail', en: 'Your e-mail address', sw: 'Barua pepe yako' , it: 'Il tuo indirizzo e-mail', de: 'Ihre E-Mail-Adresse' },
  tel_bouton_email: {
    fr: 'Recevoir le code par e-mail',
    en: 'Get the code by e-mail',
    sw: 'Pokea msimbo kwa barua pepe',
    it: 'Ricevi il codice per e-mail',
    de: 'Code per E-Mail erhalten',
  },
  tel_erreur_email: {
    fr: 'Adresse e-mail invalide',
    en: 'Invalid e-mail address',
    sw: 'Barua pepe si sahihi',
    it: 'Indirizzo e-mail non valido',
    de: 'Ungültige E-Mail-Adresse',
  },
  otp_intro_email: {
    fr: 'Code envoyé par e-mail à {email} — pensez aux spams.',
    en: 'Code sent by e-mail to {email} — check your spam folder.',
    sw: 'Msimbo umetumwa kwa barua pepe {email} — angalia pia spam.',
    it: 'Codice inviato per e-mail a {email} — controlla anche la posta indesiderata.',
    de: 'Code per E-Mail an {email} gesendet — prüfen Sie auch den Spam-Ordner.',
  },
  commun_pas_encore: { fr: 'Pas encore', en: 'Not yet', sw: 'Bado' , it: 'Non ancora', de: 'Noch nicht' },
  course_demarrer_oui: { fr: 'Oui, démarrer 🚕', en: 'Yes, start 🚕', sw: 'Ndiyo, anza 🚕' },
  course_terminer_oui: { fr: 'Oui, terminer ✅', en: 'Yes, finish ✅', sw: 'Ndiyo, maliza ✅' },
  fidelite_convertir_oui: { fr: 'Oui, convertir', en: 'Yes, convert', sw: 'Ndiyo, badilisha' , it: 'Sì, converti', de: 'Ja, umwandeln' },
  annonce_cloturer_oui: { fr: 'Oui, clôturer', en: 'Yes, close', sw: 'Ndiyo, funga' },
  commun_retour_accueil: {
    fr: 'Retour à l\'accueil',
    en: 'Back to home',
    sw: 'Rudi mwanzo',
    it: 'Torna alla home',
    de: 'Zurück zur Startseite',
  },
  commun_confirmer_oui: { fr: 'Oui, annuler', en: 'Yes, cancel', sw: 'Ndiyo, ghairi' , it: 'Sì, annulla', de: 'Ja, stornieren' },
  commun_confirmer_non: { fr: 'Non, garder', en: 'No, keep it', sw: 'Hapana, baki nayo' , it: 'No, mantieni', de: 'Nein, behalten' },
  commun_annulation_impossible: {
    fr: "Annulation impossible pour le moment.",
    en: 'Cancellation is not possible right now.',
    sw: 'Kughairi hakuwezekani kwa sasa.',
    it: 'L\'annullamento non è possibile al momento.',
    de: 'Eine Stornierung ist derzeit nicht möglich.',
  },
  trip_paiement_recu: {
    fr: 'Course payée — tout est réglé. Votre taxi est indiqué ci-dessus : repérez la plaque au point de rendez-vous.',
    en: 'Ride paid — all set. Your taxi is shown above: look for the plate at the meeting point.',
    sw: 'Safari imelipwa — kila kitu tayari. Teksi yako imeonyeshwa hapo juu: tafuta namba ya gari mahali pa kukutana.',
    it: 'Corsa pagata — tutto in regola. Il tuo taxi è indicato qui sopra: cerca la targa al punto d\'incontro.',
    de: 'Fahrt bezahlt — alles erledigt. Ihr Taxi steht oben: Achten Sie am Treffpunkt auf das Kennzeichen.',
  },
  // LE BANDEAU D'ÉTAT — ce que le client lit en premier, en gros, à la
  // place d'une étiquette de statut. Une phrase par étape du parcours.
  trip_etat_recherche: { fr: 'Nous cherchons votre chauffeur', en: 'Finding your driver', sw: 'Tunatafuta dereva wako', it: 'Stiamo cercando il tuo autista', de: 'Wir suchen Ihren Fahrer' },
  trip_etat_recherche_sous: {
    fr: "L'équipe vous attribue un taxi. Vous serez prévenu dès qu'il est confirmé.",
    en: 'Our team is assigning a taxi. You will be notified as soon as it is confirmed.',
    sw: 'Timu inakupangia teksi. Utaarifiwa mara tu itakapothibitishwa.',
    it: 'Il team ti sta assegnando un taxi. Sarai avvisato appena è confermato.',
    de: 'Das Team weist Ihnen ein Taxi zu. Sie werden benachrichtigt, sobald es bestätigt ist.',
  },
  trip_etat_confirme: { fr: 'Votre chauffeur est confirmé', en: 'Your driver is confirmed', sw: 'Dereva wako amethibitishwa', it: 'Il tuo autista è confermato', de: 'Ihr Fahrer ist bestätigt' },
  trip_etat_confirme_sous: {
    fr: 'Il ne manque que le règlement pour que la course soit réservée.',
    en: 'Only the payment is left for the ride to be booked.',
    sw: 'Kinachobaki ni malipo ili safari ithibitishwe.',
    it: 'Manca solo il pagamento perché la corsa sia prenotata.',
    de: 'Nur noch die Zahlung fehlt, damit die Fahrt gebucht ist.',
  },
  trip_etat_arrive: { fr: 'Votre taxi arrive', en: 'Your taxi is on its way', sw: 'Teksi yako inakuja', it: 'Il tuo taxi sta arrivando', de: 'Ihr Taxi kommt' },
  trip_etat_programme: { fr: 'Votre taxi est réservé', en: 'Your taxi is booked', sw: 'Teksi yako imehifadhiwa', it: 'Il tuo taxi è prenotato', de: 'Ihr Taxi ist gebucht' },
  trip_etat_en_route: { fr: 'Course en cours', en: 'Ride in progress', sw: 'Safari inaendelea', it: 'Corsa in corso', de: 'Fahrt läuft' },
  trip_etat_en_route_sous: {
    fr: 'Bon voyage. Nous restons joignables à tout moment.',
    en: 'Enjoy the ride. We stay reachable at any time.',
    sw: 'Safari njema. Tupo tayari kukusaidia wakati wowote.',
    it: 'Buon viaggio. Restiamo raggiungibili in qualsiasi momento.',
    de: 'Gute Fahrt. Wir sind jederzeit erreichbar.',
  },
  trip_etat_terminee: { fr: 'Course terminée', en: 'Ride completed', sw: 'Safari imekamilika', it: 'Corsa completata', de: 'Fahrt abgeschlossen' },
  trip_etat_terminee_sous: {
    fr: 'Merci d\'avoir voyagé avec zanziGo.',
    en: 'Thank you for travelling with zanziGo.',
    sw: 'Asante kwa kusafiri na zanziGo.',
    it: 'Grazie per aver viaggiato con zanziGo.',
    de: 'Danke, dass Sie mit zanziGo gefahren sind.',
  },
  trip_etat_annulee: { fr: 'Course annulée', en: 'Ride cancelled', sw: 'Safari imeghairiwa', it: 'Corsa annullata', de: 'Fahrt storniert' },
  trip_etat_annulee_sous: {
    fr: 'Cette course ne sera pas effectuée. Vous pouvez en réserver une autre quand vous voulez.',
    en: 'This ride will not take place. You can book another one whenever you like.',
    sw: 'Safari hii haitafanyika. Unaweza kuhifadhi nyingine wakati wowote.',
    it: 'Questa corsa non avrà luogo. Puoi prenotarne un\'altra quando vuoi.',
    de: 'Diese Fahrt findet nicht statt. Sie können jederzeit eine neue buchen.',
  },
  // Les minutes du taxi qui approche, calculées depuis sa position réelle.
  trip_minutes: { fr: 'min', en: 'min', sw: 'dak', it: 'min', de: 'Min' },
  trip_minutes_sous: {
    fr: '{chauffeur} est à {km} km de vous · relevé {quand}',
    en: '{chauffeur} is {km} km away · updated {quand}',
    sw: '{chauffeur} yuko km {km} kutoka kwako · imesasishwa {quand}',
    it: '{chauffeur} è a {km} km da te · aggiornato {quand}',
    de: '{chauffeur} ist {km} km entfernt · aktualisiert {quand}',
  },
  trip_position_attente: {
    fr: 'Votre chauffeur n\'a pas encore allumé son suivi. Il est prévenu et arrive.',
    en: 'Your driver has not switched on tracking yet. He has been notified and is on his way.',
    sw: 'Dereva wako bado hajawasha ufuatiliaji. Amearifiwa na yuko njiani.',
    it: 'Il tuo autista non ha ancora attivato il tracciamento. È stato avvisato ed è in arrivo.',
    de: 'Ihr Fahrer hat die Ortung noch nicht aktiviert. Er ist informiert und unterwegs.',
  },
  // La fiche taxi et l'appel direct.
  trip_appeler_chauffeur: { fr: 'Appeler le chauffeur', en: 'Call the driver', sw: 'Piga simu kwa dereva', it: 'Chiama l\'autista', de: 'Fahrer anrufen' },
  trip_regle: { fr: 'Course réglée', en: 'Ride paid', sw: 'Safari imelipwa', it: 'Corsa pagata', de: 'Fahrt bezahlt' },
  trip_a_regler: { fr: 'À régler', en: 'To pay', sw: 'Kulipa', it: 'Da pagare', de: 'Zu zahlen' },
  // LE CHOIX DU DESIGN. Le sous-titre dit QUAND choisir l'un ou l'autre :
  // c'est la lumière autour du client qui décide, pas son goût.
  peau_titre: {
    fr: 'Apparence',
    en: 'Appearance',
    sw: 'Muonekano',
    it: 'Aspetto',
    de: 'Erscheinungsbild',
  },
  peau_intro: {
    fr: 'Cinq designs, un par lumière. Le girofle porte les couleurs de la marque, le crème se lit en plein soleil de midi. Vous changez d\'avis quand vous voulez.',
    en: 'Five designs, one per kind of light. Clove carries the brand colours, the cream reads in the midday sun. Change your mind whenever you like.',
    sw: 'Miundo mitano, kila mmoja kwa mwanga wake. Karafuu ina rangi za chapa, krimu inasomeka juani kali. Badilisha wakati wowote.',
    it: 'Cinque design, uno per ogni luce. Il chiodo di garofano porta i colori del marchio, il crema si legge in pieno sole. Cambia idea quando vuoi.',
    de: 'Fünf Designs, eines für jedes Licht. Nelke trägt die Markenfarben, das Cremefarbene liest sich in der Mittagssonne. Ändern Sie es jederzeit.',
  },
  // « Girofle », direction « Écume » (31/08/2026) : le blanc de l'écume et le
  // vert du logotype — les deux couleurs de la marque, à la lettre.
  peau_girofle: {
    fr: 'Écume',
    en: 'Sea foam',
    sw: 'Povu la bahari',
    it: 'Schiuma',
    de: 'Gischt',
  },
  peau_girofle_quand: {
    fr: 'Le blanc d\'écume, le vert zanziGo',
    en: 'Foam white, zanziGo green',
    sw: 'Nyeupe ya povu, kijani ya zanziGo',
    it: 'Bianco schiuma, verde zanziGo',
    de: 'Gischtweiß, zanziGo-Grün',
  },
  peau_lagon: { fr: 'Lagon', en: 'Lagoon', sw: 'Bahari', it: 'Laguna', de: 'Lagune' },
  peau_lagon_quand: {
    fr: 'À l\'ombre, le soir, dans la voiture',
    en: 'In the shade, at night, in the car',
    sw: 'Kivulini, usiku, ndani ya gari',
    it: 'All\'ombra, la sera, in auto',
    de: 'Im Schatten, abends, im Auto',
  },
  peau_bento: { fr: 'Bento', en: 'Bento', sw: 'Bento', it: 'Bento', de: 'Bento' },
  peau_estran: { fr: 'Estran', en: 'Tideline', sw: 'Ufuo', it: 'Battigia', de: 'Watt' },
  peau_estran_quand: {
    fr: 'Partout, de jour comme de nuit',
    en: 'Everywhere, day and night',
    sw: 'Kila mahali, mchana na usiku',
    it: 'Ovunque, giorno e notte',
    de: 'Überall, Tag und Nacht',
  },
  peau_nuit: { fr: 'Nuit d\'épices', en: 'Spice night', sw: 'Usiku wa viungo', it: 'Notte di spezie', de: 'Gewürznacht' },
  peau_nuit_quand: {
    fr: 'La nuit, au calme',
    en: 'At night, in the quiet',
    sw: 'Usiku, kwa utulivu',
    it: 'La notte, in tranquillità',
    de: 'Nachts, in Ruhe',
  },
  peau_bento_quand: {
    fr: 'En plein soleil, sur la plage',
    en: 'In full sun, on the beach',
    sw: 'Juani kali, ufukweni',
    it: 'In pieno sole, in spiaggia',
    de: 'In der prallen Sonne, am Strand',
  },
  trip_distance: { fr: 'Distance', en: 'Distance', sw: 'Umbali', it: 'Distanza', de: 'Entfernung' },
  trip_details_titre: { fr: 'Détails du trajet', en: 'Ride details', sw: 'Maelezo ya safari', it: 'Dettagli della corsa', de: 'Fahrtdetails' },
  trip_autres_actions: { fr: 'Autres actions', en: 'Other actions', sw: 'Vitendo vingine', it: 'Altre azioni', de: 'Weitere Aktionen' },
  trip_taxi_titre: { fr: 'Votre taxi', en: 'Your taxi', sw: 'Teksi yako' , it: 'Il tuo taxi', de: 'Ihr Taxi' },
  trip_taxi_chauffeur: { fr: 'Chauffeur', en: 'Driver', sw: 'Dereva' , it: 'Autista', de: 'Fahrer' },
  trip_taxi_modele: { fr: 'Véhicule', en: 'Vehicle', sw: 'Gari' , it: 'Veicolo', de: 'Fahrzeug' },
  trip_taxi_plaque: { fr: 'Plaque', en: 'Plate', sw: 'Namba ya gari' , it: 'Targa', de: 'Kennzeichen' },
  trip_note_question: { fr: "Comment s'est passée votre course ?", en: 'How was your ride?', sw: 'Safari yako ilikuwaje?' , it: 'Com\'è andata la corsa?', de: 'Wie war Ihre Fahrt?' },
  trip_note_commentaire: { fr: 'Commentaire (optionnel)', en: 'Comment (optional)', sw: 'Maoni (hiari)' , it: 'Commento (facoltativo)', de: 'Kommentar (optional)' },
  trip_note_placeholder: {
    fr: 'Chauffeur ponctuel, très bonne course…',
    en: 'Punctual driver, great ride…',
    sw: 'Dereva makini, safari nzuri…',
    it: 'Autista puntuale, corsa perfetta…',
    de: 'Pünktlicher Fahrer, angenehme Fahrt …',
  },
  trip_note_envoyer: { fr: 'Envoyer ma note', en: 'Send my rating', sw: 'Tuma alama yangu' , it: 'Invia la mia valutazione', de: 'Meine Bewertung senden' },
  trip_note_merci: { fr: 'Merci pour votre note !', en: 'Thanks for your rating!', sw: 'Asante kwa alama yako!' , it: 'Grazie per la tua valutazione!', de: 'Danke für Ihre Bewertung!' },
  trip_note_erreur: {
    fr: 'Choisissez une note de 1 à 5 étoiles.',
    en: 'Pick a rating from 1 to 5 stars.',
    sw: 'Chagua alama kati ya nyota 1 na 5.',
    it: 'Scegli una valutazione da 1 a 5 stelle.',
    de: 'Wählen Sie eine Bewertung von 1 bis 5 Sternen.',
  },
  trip_note_envoi_erreur: {
    fr: "Impossible d'envoyer la note.",
    en: "Couldn't send the rating.",
    sw: 'Imeshindikana kutuma alama.',
    it: 'Impossibile inviare la valutazione.',
    de: 'Bewertung konnte nicht gesendet werden.',
  },
  trip_paiement_indisponible: {
    fr: 'Paiement indisponible pour le moment.',
    en: 'Payment unavailable right now.',
    sw: 'Malipo hayapatikani kwa sasa.',
    it: 'Pagamento non disponibile al momento.',
    de: 'Zahlung derzeit nicht verfügbar.',
  },
  trip_lien_indisponible: {
    fr: "Le lien de paiement n'est pas encore disponible.",
    en: 'The payment link is not available yet.',
    sw: 'Kiungo cha malipo bado hakipatikani.',
    it: 'Il link di pagamento non è ancora disponibile.',
    de: 'Der Zahlungslink ist noch nicht verfügbar.',
  },
  trip_confirm_dev: {
    fr: 'Simuler la confirmation (dev)',
    en: 'Simulate confirmation (dev)',
    sw: 'Iga uthibitisho (dev)',
    it: 'Simula la conferma (dev)',
    de: 'Bestätigung simulieren (dev)',
  },
  trip_confirmation_impossible: {
    fr: 'Confirmation impossible.',
    en: 'Confirmation failed.',
    sw: 'Uthibitisho umeshindikana.',
    it: 'Conferma non riuscita.',
    de: 'Bestätigung fehlgeschlagen.',
  },

  // --- Colis (liste + création + détail) ---------------------------------------
  colis_envoyer: { fr: 'Envoyer un colis', en: 'Send a parcel', sw: 'Tuma mzigo' , it: 'Spedisci un pacco', de: 'Paket senden' },
  colis_vide_titre: { fr: "Aucun colis pour l'instant", en: 'No parcels yet', sw: 'Hakuna mizigo bado' , it: 'Nessun pacco per ora', de: 'Noch keine Pakete' },
  colis_vide_texte: {
    fr: "Documents, cadeaux, courses… un chauffeur zanziGo livre votre premier colis partout sur l'île !",
    en: 'Documents, gifts, shopping… a zanziGo driver delivers your first parcel anywhere on the island!',
    sw: 'Nyaraka, zawadi, manunuzi… dereva wa zanziGo atafikisha mzigo wako wa kwanza popote kisiwani!',
  },
  colis_vide_texte_hotel: {
    fr: "Envoyez le premier colis d'un de vos clients : un chauffeur zanziGo le livre partout sur l'île.",
    en: 'Send a first parcel for one of your guests: a zanziGo driver delivers it anywhere on the island.',
    sw: 'Tuma mzigo wa kwanza wa mgeni wako: dereva wa zanziGo ataufikisha popote kisiwani.',
    it: 'Spedite un primo pacco per uno dei vostri clienti: un autista zanziGo lo consegna ovunque sull\'isola.',
    de: 'Senden Sie ein erstes Paket für einen Ihrer Gäste: Ein zanziGo-Fahrer liefert es überall auf der Insel.',
  },
  colis_defaut: { fr: 'Colis', en: 'Parcel', sw: 'Mzigo' , it: 'Pacco', de: 'Paket' },
  ncolis_intro: {
    fr: 'Un chauffeur zanziGo récupère votre colis et le livre contre scan du QR code.',
    en: 'A zanziGo driver picks up your parcel and delivers it against a QR code scan.',
    sw: 'Dereva wa zanziGo atachukua mzigo wako na kuufikisha kwa kuskani QR.',
    it: 'Un autista zanziGo ritira il tuo pacco e lo consegna con la scansione di un codice QR.',
    de: 'Ein zanziGo-Fahrer holt Ihr Paket ab und liefert es gegen das Scannen eines QR-Codes aus.',
  },
  ncolis_section_trajet: { fr: 'Trajet du colis', en: 'Parcel route', sw: 'Njia ya mzigo' , it: 'Percorso del pacco', de: 'Paketstrecke' },
  ncolis_collecte: { fr: 'Lieu de collecte', en: 'Pickup location', sw: 'Mahali pa kuchukua' , it: 'Luogo di ritiro', de: 'Abholort' },
  ncolis_collecte_placeholder: {
    fr: 'Ex. : Stone Town, Kenyatta Road, en face de la pharmacie',
    en: 'E.g. Stone Town, Kenyatta Road, opposite the pharmacy',
    sw: 'Mf. Stone Town, Kenyatta Road, mkabala na duka la dawa',
    it: 'Es. Stone Town, Kenyatta Road, di fronte alla farmacia',
    de: 'z. B. Stone Town, Kenyatta Road, gegenüber der Apotheke',
  },
  ncolis_livraison: { fr: 'Lieu de livraison', en: 'Delivery location', sw: 'Mahali pa kufikisha' , it: 'Luogo di consegna', de: 'Lieferort' },
  ncolis_livraison_placeholder: {
    fr: 'Ex. : Paje, guesthouse Baraka, à la réception',
    en: 'E.g. Paje, Baraka guesthouse, at the reception',
    sw: 'Mf. Paje, nyumba ya wageni Baraka, mapokezi',
    it: 'Es. Paje, guesthouse Baraka, alla reception',
    de: 'z. B. Paje, Gästehaus Baraka, an der Rezeption',
  },
  ncolis_section_destinataire: { fr: 'Destinataire', en: 'Recipient', sw: 'Mpokeaji' , it: 'Destinatario', de: 'Empfänger' },
  ncolis_nom_dest: { fr: 'Nom du destinataire', en: 'Recipient name', sw: 'Jina la mpokeaji' , it: 'Nome del destinatario', de: 'Name des Empfängers' },
  ncolis_nom_dest_placeholder: { fr: 'Ex. : Juma Ali', en: 'E.g. Juma Ali', sw: 'Mf. Juma Ali' , it: 'Es. Juma Ali', de: 'z. B. Juma Ali' },
  ncolis_tel_dest: { fr: 'Téléphone du destinataire', en: 'Recipient phone', sw: 'Simu ya mpokeaji' , it: 'Telefono del destinatario', de: 'Telefon des Empfängers' },
  ncolis_description_opt: {
    fr: 'Contenu / instructions (optionnel)',
    en: 'Contents / instructions (optional)',
    sw: 'Yaliyomo / maelekezo (hiari)',
    it: 'Contenuto / istruzioni (facoltativo)',
    de: 'Inhalt / Hinweise (optional)',
  },
  ncolis_description_placeholder: {
    fr: 'Ex. : documents, fragile, appeler en arrivant…',
    en: 'E.g. documents, fragile, call on arrival…',
    sw: 'Mf. nyaraka, dhaifu, piga simu ukifika…',
    it: 'Es. documenti, fragile, chiamare all\'arrivo…',
    de: 'z. B. Dokumente, zerbrechlich, bei Ankunft anrufen …',
  },
  ncolis_tel_expediteur: {
    fr: 'Votre numéro (pour la ramasse)',
    en: 'Your phone (for pickup)',
    sw: 'Namba yako (kwa kuchukua)',
    it: 'Il tuo telefono (per il ritiro)',
    de: 'Ihr Telefon (für die Abholung)',
  },
  ncolis_erreur_tel_expediteur: {
    fr: 'Votre numéro doit être au format international (+255…).',
    en: 'Your number must be in international format (+255…).',
    sw: 'Namba yako iwe katika muundo wa kimataifa (+255…).',
    it: 'Il tuo numero deve essere in formato internazionale (+255…).',
    de: 'Ihre Nummer muss im internationalen Format sein (+255 …).',
  },
  colis_appeler_expediteur: { fr: "📞 Appeler l'expéditeur", en: '📞 Call the sender', sw: '📞 Mpigie mtumaji' , it: '📞 Chiama il mittente', de: '📞 Absender anrufen' },
  colis_appeler_destinataire: { fr: '📞 Appeler le destinataire', en: '📞 Call the recipient', sw: '📞 Mpigie mpokeaji' , it: '📞 Chiama il destinatario', de: '📞 Empfänger anrufen' },
  ncolis_quand: { fr: 'Quand ramasser le colis ?', en: 'When to pick up the parcel?', sw: 'Lini kuchukua mzigo?' , it: 'Quando ritirare il pacco?', de: 'Wann soll das Paket abgeholt werden?' },
  ncolis_asap: { fr: 'Dès que possible', en: 'As soon as possible', sw: 'Haraka iwezekanavyo' , it: 'Il prima possibile', de: 'So bald wie möglich' },
  colis_dispo_ramassage: { fr: 'À ramasser', en: 'Pick up', sw: 'Kuchukuliwa' , it: 'Ritira', de: 'Abholen' },
  ncolis_taille_titre: { fr: 'Taille du colis', en: 'Parcel size', sw: 'Ukubwa wa mzigo' , it: 'Dimensione del pacco', de: 'Paketgröße' },
  ncolis_taille_petit: { fr: 'Petit', en: 'Small', sw: 'Ndogo' , it: 'Piccolo', de: 'Klein' },
  ncolis_taille_petit_ex: {
    fr: 'Enveloppe, clés, passeport, documents, médicaments',
    en: 'Envelope, keys, passport, documents, medicine',
    sw: 'Bahasha, funguo, pasipoti, nyaraka, dawa',
    it: 'Busta, chiavi, passaporto, documenti, medicinali',
    de: 'Umschlag, Schlüssel, Reisepass, Dokumente, Medikamente',
  },
  ncolis_taille_moyen: { fr: 'Moyen', en: 'Medium', sw: 'Wastani' , it: 'Medio', de: 'Mittel' },
  ncolis_taille_moyen_ex: {
    fr: 'Sac à dos, petit carton, bouteilles, épices',
    en: 'Backpack, small box, bottles, spices',
    sw: 'Begi la mgongoni, kasha dogo, chupa, viungo',
    it: 'Zaino, scatola piccola, bottiglie, spezie',
    de: 'Rucksack, kleiner Karton, Flaschen, Gewürze',
  },
  ncolis_taille_grand: { fr: 'Grand', en: 'Large', sw: 'Kubwa' , it: 'Grande', de: 'Groß' },
  ncolis_taille_grand_ex: {
    fr: 'Grosse valise, caisse de ravitaillement',
    en: 'Large suitcase, supply crate',
    sw: 'Sanduku kubwa, kreti la vifaa',
    it: 'Valigia grande, cassa di rifornimenti',
    de: 'Großer Koffer, Versorgungskiste',
  },
  ncolis_erreur_taille: {
    fr: 'Choisissez la taille du colis.',
    en: 'Choose the parcel size.',
    sw: 'Chagua ukubwa wa mzigo.',
    it: 'Scegli la dimensione del pacco.',
    de: 'Wählen Sie die Paketgröße.',
  },
  ncolis_paye_expediteur: {
    fr: "Payé en ligne à 100 % par l'expéditeur",
    en: 'Paid 100% online by the sender',
    sw: 'Hulipwa mtandaoni 100% na mtumaji',
    it: 'Pagato al 100% online dal mittente',
    de: 'Zu 100 % online vom Absender bezahlt',
  },
  dcolis_taille: { fr: 'Taille', en: 'Size', sw: 'Ukubwa' , it: 'Dimensione', de: 'Größe' },
  ncolis_prix_envoi: { fr: "Prix de l'envoi", en: 'Delivery price', sw: 'Bei ya kutuma' , it: 'Prezzo della consegna', de: 'Lieferpreis' },
  ncolis_note_prix: {
    fr: "Tarif plat zanziGo, quel que soit le trajet sur l'île. Le prix officiel est figé à la création de l'envoi.",
    en: 'Flat zanziGo fare, wherever it goes on the island. The official price is locked when the delivery is created.',
    sw: 'Bei moja ya zanziGo popote kisiwani. Bei rasmi inafungwa wakati wa kuanzisha utumaji.',
  },
  ncolis_bouton: { fr: "Créer l'envoi", en: 'Create delivery', sw: 'Anzisha utumaji' , it: 'Crea la consegna', de: 'Lieferung erstellen' },
  ncolis_erreur_profil: {
    fr: "Créez votre profil avant d'envoyer un colis.",
    en: 'Create your profile before sending a parcel.',
    sw: 'Tengeneza wasifu wako kabla ya kutuma mzigo.',
  },
  ncolis_erreur_champs: {
    fr: 'Renseignez la collecte, la livraison et le nom du destinataire.',
    en: 'Fill in pickup, delivery and the recipient name.',
    sw: 'Jaza mahali pa kuchukua, pa kufikisha na jina la mpokeaji.',
    it: 'Compila il ritiro, la consegna e il nome del destinatario.',
    de: 'Füllen Sie Abholung, Lieferung und Empfängernamen aus.',
  },
  ncolis_erreur_tel: {
    fr: 'Téléphone du destinataire invalide (format international +255…).',
    en: 'Invalid recipient phone (international format +255…).',
    sw: 'Simu ya mpokeaji si sahihi (muundo wa kimataifa +255…).',
    it: 'Telefono del destinatario non valido (formato internazionale +255…).',
    de: 'Ungültige Telefonnummer des Empfängers (internationales Format +255 …).',
  },
  ncolis_erreur_creation: {
    fr: 'La création du colis a échoué. Réessayez.',
    en: "Couldn't create the parcel. Try again.",
    sw: 'Imeshindikana kuanzisha mzigo. Jaribu tena.',
    it: 'Impossibile creare il pacco. Riprova.',
    de: 'Paket konnte nicht erstellt werden. Bitte erneut versuchen.',
  },
  dcolis_titre: { fr: 'Votre colis', en: 'Your parcel', sw: 'Mzigo wako' , it: 'Il tuo pacco', de: 'Ihr Paket' },
  dcolis_chargement: { fr: 'Chargement de votre colis…', en: 'Loading your parcel…', sw: 'Inapakia mzigo wako…' , it: 'Caricamento del tuo pacco…', de: 'Ihr Paket wird geladen …' },
  dcolis_introuvable: { fr: 'Colis introuvable.', en: 'Parcel not found.', sw: 'Mzigo haupatikani.' , it: 'Pacco non trovato.', de: 'Paket nicht gefunden.' },
  dcolis_qr_indisponible: { fr: 'QR code indisponible.', en: 'QR code unavailable.', sw: 'QR haipatikani.' , it: 'Codice QR non disponibile.', de: 'QR-Code nicht verfügbar.' },
  dcolis_presenter: { fr: 'Présentez ce QR au chauffeur', en: 'Show this QR to the driver', sw: 'Onyesha QR hii kwa dereva' , it: 'Mostra questo QR all\'autista', de: 'Zeigen Sie diesen QR-Code dem Fahrer' },
  dcolis_consigne: {
    fr: 'Il le scanne au ramassage puis à la livraison.',
    en: 'They scan it at pickup and again at delivery.',
    sw: 'Ataiskani wakati wa kuchukua na wa kufikisha.',
    it: 'Lo scansionano al ritiro e di nuovo alla consegna.',
    de: 'Er wird bei der Abholung und erneut bei der Zustellung gescannt.',
  },
  dcolis_collecte: { fr: 'Collecte', en: 'Pickup', sw: 'Kuchukua' , it: 'Ritiro', de: 'Abholung' },
  dcolis_livraison: { fr: 'Livraison', en: 'Delivery', sw: 'Kufikisha' , it: 'Consegna', de: 'Lieferung' },
  dcolis_destinataire: { fr: 'Destinataire', en: 'Recipient', sw: 'Mpokeaji' , it: 'Destinatario', de: 'Empfänger' },
  dcolis_suivi: { fr: 'Suivi du colis', en: 'Parcel status', sw: 'Mwenendo wa mzigo' , it: 'Stato del pacco', de: 'Status des Pakets' },
  dcolis_payer: { fr: "Payer l'envoi", en: 'Pay for delivery', sw: 'Lipia utumaji' , it: 'Paga la consegna', de: 'Lieferung bezahlen' },
  dcolis_annuler: { fr: "Annuler l'envoi", en: 'Cancel this delivery', sw: 'Ghairi utumaji' , it: 'Annulla questa consegna', de: 'Diese Lieferung stornieren' },
  dcolis_annuler_confirm: {
    fr: 'Annuler cet envoi de colis ?',
    en: 'Cancel this parcel delivery?',
    sw: 'Ughairi utumaji huu wa mzigo?',
    it: 'Annullare questa consegna del pacco?',
    de: 'Diese Paketlieferung stornieren?',
  },
  dcolis_partager: { fr: 'Partager le suivi', en: 'Share tracking', sw: 'Shiriki ufuatiliaji' , it: 'Condividi il tracciamento', de: 'Sendungsverfolgung teilen' },
  dcolis_position_bouton: {
    fr: 'Voir la position du chauffeur 📍',
    en: 'See driver location 📍',
    sw: 'Ona mahali dereva alipo 📍',
    it: 'Vedi la posizione dell\'autista 📍',
    de: 'Standort des Fahrers ansehen 📍',
  },
  dcolis_position_maj: {
    fr: 'Position du chauffeur : {quand} — elle s\'ouvre dans votre app de cartes.',
    en: 'Driver location: {quand} — it opens in your maps app.',
    sw: 'Mahali pa dereva: {quand} — inafunguka kwenye programu yako ya ramani.',
    it: 'Posizione dell\'autista: {quand} — si apre nella tua app di mappe.',
    de: 'Standort des Fahrers: {quand} — öffnet sich in Ihrer Karten-App.',
  },
  dcolis_position_indispo: {
    fr: "Le chauffeur n'a pas encore partagé sa position — réessayez dans une minute.",
    en: "The driver hasn't shared their location yet — try again in a minute.",
    sw: 'Dereva bado hajashiriki mahali alipo — jaribu tena baada ya dakika.',
    it: 'L\'autista non ha ancora condiviso la sua posizione — riprova tra un minuto.',
    de: 'Der Fahrer hat seinen Standort noch nicht geteilt — versuchen Sie es in einer Minute erneut.',
  },
  dcolis_partage_message: {
    fr: 'Suivi de votre colis zanziGo 📦\nTrajet : {trajet}\nCode : {qr}\nStatut : {statut}\nPrésentez ce code au chauffeur à la livraison.',
    en: 'Your zanziGo parcel tracking 📦\nRoute: {trajet}\nCode: {qr}\nStatus: {statut}\nShow this code to the driver on delivery.',
    sw: 'Ufuatiliaji wa mzigo wako wa zanziGo 📦\nNjia: {trajet}\nMsimbo: {qr}\nHali: {statut}\nOnyesha msimbo huu kwa dereva wakati wa kufikisha.',
    it: 'Il tracciamento del tuo pacco zanziGo 📦\\nPercorso: {trajet}\\nCodice: {qr}\\nStato: {statut}\\nMostra questo codice all\'autista alla consegna.',
    de: 'Ihre zanziGo-Paketverfolgung 📦\\nStrecke: {trajet}\\nCode: {qr}\\nStatus: {statut}\\nZeigen Sie diesen Code dem Fahrer bei der Übergabe.',
  },
  dcolis_payer_whatsapp: { fr: 'Payer via WhatsApp', en: 'Pay via WhatsApp', sw: 'Lipa kupitia WhatsApp' , it: 'Paga via WhatsApp', de: 'Per WhatsApp bezahlen' },
  dcolis_whatsapp_aide: {
    fr: "L'équipe vous enverra le lien de paiement sur WhatsApp.",
    en: 'The team will send you the payment link on WhatsApp.',
    sw: 'Timu itakutumia kiungo cha malipo kwenye WhatsApp.',
  },
  dcolis_paiement_recu: {
    fr: 'Paiement reçu — un chauffeur va ramasser votre colis.',
    en: 'Payment received — a driver will pick up your parcel.',
    sw: 'Malipo yamepokelewa — dereva atakuja kuchukua mzigo wako.',
    it: 'Pagamento ricevuto — un autista ritirerà il tuo pacco.',
    de: 'Zahlung erhalten — ein Fahrer holt Ihr Paket ab.',
  },

  // --- Profil -------------------------------------------------------------------
  profil_compte_defaut: { fr: 'Compte zanziGo', en: 'zanziGo account', sw: 'Akaunti ya zanziGo' , it: 'Account zanziGo', de: 'zanziGo-Konto' },
  profil_badge_verifie: { fr: 'Compte vérifié ✓', en: 'Verified account ✓', sw: 'Akaunti imethibitishwa ✓' , it: 'Account verificato ✓', de: 'Konto geprüft ✓' },
  profil_badge_resident_ok: {
    fr: 'Résident vérifié −5 % ✓',
    en: 'Verified resident −5% ✓',
    sw: 'Mkazi amethibitishwa −5% ✓',
    it: 'Residente verificato −5% ✓',
    de: 'Ansässiger geprüft −5 % ✓',
  },
  profil_badge_resident_attente: {
    fr: 'Documents en cours de validation',
    en: 'Documents under review',
    sw: 'Nyaraka zinahakikiwa',
    it: 'Documenti in verifica',
    de: 'Unterlagen in Prüfung',
  },
  profil_badge_local_ok: {
    fr: 'Carte tanzanienne vérifiée ✓',
    en: 'Tanzanian ID verified ✓',
    sw: 'Kitambulisho kimethibitishwa ✓',
    it: 'Documento tanzaniano verificato ✓',
    de: 'Tansanischer Ausweis geprüft ✓',
  },
  profil_badge_local_attente: { fr: 'Validation en cours', en: 'Validation in progress', sw: 'Uhakiki unaendelea' , it: 'Convalida in corso', de: 'Prüfung läuft' },
  profil_badge_refuse: { fr: 'Vérification refusée', en: 'Verification declined', sw: 'Uthibitisho umekataliwa' , it: 'Verifica rifiutata', de: 'Prüfung abgelehnt' },
  profil_badge_hotel: { fr: 'Hôtel partenaire', en: 'Partner hotel', sw: 'Hoteli mshirika' , it: 'Hotel partner', de: 'Partnerhotel' },
  profil_badge_restaurant: {
    fr: 'Restaurant partenaire',
    en: 'Partner restaurant',
    sw: 'Mgahawa mshirika',
    it: 'Ristorante partner',
    de: 'Partnerrestaurant',
  },
  profil_info_resident_attente: {
    fr: "Compte résident en attente : l'équipe zanziGo vérifie vos documents de résidence. La remise de 5 % sera activée une fois le compte vérifié.",
    en: 'Resident account pending: the zanziGo team is checking your residence documents. The 5% discount will be activated once verified.',
    sw: 'Akaunti ya mkazi inasubiri: timu ya zanziGo inakagua nyaraka zako za ukazi. Punguzo la 5% litaanza baada ya kuthibitishwa.',
    it: 'Account residente in attesa: il team zanziGo sta verificando i tuoi documenti di residenza. Lo sconto del 5% sarà attivato una volta verificati.',
    de: 'Konto für Ansässige in Prüfung: Das zanziGo-Team prüft Ihren Aufenthaltsnachweis. Der Rabatt von 5 % wird nach der Prüfung aktiviert.',
  },
  profil_info_local_attente: {
    fr: "Compte local en attente : l'équipe zanziGo vérifie votre carte d'identité tanzanienne. Vous pourrez réserver dès la validation.",
    en: 'Local account pending: the zanziGo team is checking your Tanzanian ID card. You can book as soon as it is validated.',
    sw: 'Akaunti ya mzawa inasubiri: timu ya zanziGo inakagua kitambulisho chako cha NIDA. Utaweza kuweka safari mara baada ya uthibitisho.',
    it: 'Account residente in attesa: il team zanziGo sta verificando la tua carta d\'identità tanzaniana. Potrai prenotare non appena sarà convalidata.',
    de: 'Konto für Einheimische in Prüfung: Das zanziGo-Team prüft Ihren tansanischen Personalausweis. Sie können buchen, sobald er bestätigt ist.',
  },
  profil_info_refuse: {
    fr: "Votre document a été refusé par l'équipe. Contactez-nous sur WhatsApp pour le mettre à jour.",
    en: 'Your document was declined by the team. Contact us on WhatsApp to update it.',
    sw: 'Nyaraka yako imekataliwa na timu. Wasiliana nasi kwa WhatsApp kuisasisha.',
    it: 'Il tuo documento è stato rifiutato dal team. Contattaci su WhatsApp per aggiornarlo.',
    de: 'Ihr Dokument wurde vom Team abgelehnt. Kontaktieren Sie uns über WhatsApp, um es zu aktualisieren.',
  },
  profil_type_compte: { fr: 'Type de compte', en: 'Account type', sw: 'Aina ya akaunti' , it: 'Tipo di account', de: 'Kontotyp' },
  profil_type_local: { fr: 'Local', en: 'Local', sw: 'Mzawa' , it: 'Residente', de: 'Einheimisch' },
  profil_contact: { fr: 'Contact', en: 'Contact', sw: 'Mawasiliano' , it: 'Contatto', de: 'Kontakt' },
  profil_actualiser: { fr: 'Actualiser mon profil', en: 'Refresh my profile', sw: 'Onyesha upya wasifu wangu' , it: 'Aggiorna il mio profilo', de: 'Mein Profil aktualisieren' },
  hotel_attente_verif: {
    fr: "Compte partenaire en attente de vérification : l'équipe zanziGo va contacter votre établissement (téléphone ou WhatsApp) pour confirmer l'inscription. Les réservations seront débloquées juste après.",
    en: 'Partner account awaiting verification: the zanziGo team will contact your business (phone or WhatsApp) to confirm the signup. Bookings unlock right after.',
    sw: 'Akaunti ya ushirika inasubiri uthibitisho: timu ya zanziGo itawasiliana na biashara yako (simu au WhatsApp) kuthibitisha usajili. Uhifadhi utafunguliwa mara baada ya hapo.',
  },
  hotel_refuse_verif: {
    fr: "Ce compte partenaire a été bloqué par l'équipe zanziGo. Contactez-nous sur WhatsApp si c'est une erreur.",
    en: 'This partner account was blocked by the zanziGo team. Contact us on WhatsApp if this is a mistake.',
    sw: 'Akaunti hii ya ushirika imezuiwa na timu ya zanziGo. Wasiliana nasi kwa WhatsApp ikiwa ni kosa.',
  },
  hotel_ajouter_bouton: {
    fr: 'Inscrire un autre établissement',
    en: 'Register another business',
    sw: 'Sajili biashara nyingine',
  },
  // Nature du partenaire, affichée sur sa fiche et dans le tableau équipe.
  partenaire_type_hotel: { fr: 'Hôtel', en: 'Hotel', sw: 'Hoteli' },
  partenaire_type_restaurant: { fr: 'Restaurant', en: 'Restaurant', sw: 'Mgahawa' },

  // --- Mode chauffeur : courses ---------------------------------------------------
  courses_info: {
    fr: "Vos courses assignées par l'équipe zanziGo apparaissent automatiquement ci-dessous. Vous pouvez aussi ouvrir une course avec la référence reçue sur WhatsApp.",
    en: 'Rides assigned to you by the zanziGo team appear below automatically. You can also open a ride with the reference received on WhatsApp.',
    sw: 'Safari ulizopangiwa na timu ya zanziGo zinaonekana hapa chini kiotomatiki. Unaweza pia kufungua safari kwa kumbukumbu uliyopokea WhatsApp.',
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
  courses_recentes: { fr: 'Mes courses', en: 'My rides', sw: 'Safari zangu', it: 'Le mie corse', de: 'Meine Fahrten' },
  // --- Bourse aux courses : le chauffeur se sert lui-même ------------------
  courses_dispo_titre: {
    fr: 'Courses disponibles',
    en: 'Available rides',
    sw: 'Safari zilizopo',
    it: 'Corse disponibili',
    de: 'Verfügbare Fahrten',
  },
  courses_dispo_vide: {
    fr: 'Aucune course libre pour le moment. Restez disponible : dès qu’un client réserve, la course apparaît ici.',
    en: 'No free rides right now. Stay available: as soon as a client books, the ride shows up here.',
    sw: 'Hakuna safari iliyo wazi kwa sasa. Endelea kuwa tayari: mteja akiweka oda, safari itaonekana hapa.',
    it: 'Nessuna corsa libera al momento. Resta disponibile: appena un cliente prenota, la corsa appare qui.',
    de: 'Momentan keine freien Fahrten. Bleiben Sie verfügbar: Sobald ein Kunde bucht, erscheint die Fahrt hier.',
  },
  courses_dispo_prendre: {
    fr: 'Je prends cette course',
    en: 'I’ll take this ride',
    sw: 'Nachukua safari hii',
    it: 'Prendo questa corsa',
    de: 'Ich nehme diese Fahrt',
  },
  courses_dispo_gain: {
    fr: 'Vous recevez',
    en: 'You receive',
    sw: 'Unapokea',
    it: 'Ricevi',
    de: 'Sie erhalten',
  },
  courses_dispo_prise: {
    fr: 'Course prise — le client vous est attribué. Ses coordonnées sont dans « Mes courses ».',
    en: 'Ride taken — the client is yours. Their details are in “My rides”.',
    sw: 'Safari imechukuliwa — mteja ni wako. Maelezo yake yako kwenye "Safari zangu".',
    it: 'Corsa presa — il cliente è tuo. I suoi contatti sono in «Le mie corse».',
    de: 'Fahrt übernommen — der Kunde gehört Ihnen. Die Kontaktdaten stehen unter „Meine Fahrten“.',
  },
  courses_dispo_trop_tard: {
    fr: 'Trop tard — un autre chauffeur vient de prendre cette course.',
    en: 'Too late — another driver just took this ride.',
    sw: 'Umechelewa — dereva mwingine amechukua safari hii.',
    it: 'Troppo tardi — un altro autista ha appena preso questa corsa.',
    de: 'Zu spät — ein anderer Fahrer hat diese Fahrt gerade übernommen.',
  },
  // --- Tableau de bord chauffeur : simple, deux questions seulement --------
  courses_bandeau_titre: {
    fr: "AUJOURD'HUI",
    en: 'TODAY',
    sw: 'LEO',
    it: 'OGGI',
    de: 'HEUTE',
  },
  courses_bandeau_gagne: {
    fr: 'Vous avez gagné',
    en: 'You earned',
    sw: 'Umepata',
    it: 'Hai guadagnato',
    de: 'Sie haben verdient',
  },
  courses_bandeau_detail: {
    fr: '{courses} course(s) · {colis} colis',
    en: '{courses} ride(s) · {colis} parcel(s)',
    sw: 'safari {courses} · mizigo {colis}',
    it: '{courses} corsa/e · {colis} pacco/hi',
    de: '{courses} Fahrt(en) · {colis} Paket(e)',
  },
  // Les QUATRE cases du menu chauffeur — une action par case, rien de plus.
  courses_case_encours: {
    fr: 'Course en cours',
    en: 'Ride in progress',
    sw: 'Safari inayoendelea',
    it: 'Corsa in corso',
    de: 'Laufende Fahrt',
  },
  courses_case_aprendre: {
    fr: 'Course à prendre',
    en: 'Rides to take',
    sw: 'Safari za kuchukua',
    it: 'Corse da prendere',
    de: 'Fahrten annehmen',
  },
  courses_case_colis: {
    fr: 'Colis',
    en: 'Parcels',
    sw: 'Mizigo',
    it: 'Pacchi',
    de: 'Pakete',
  },
  courses_case_poster: {
    fr: 'Poster un trajet',
    en: 'Post a trip',
    sw: 'Tangaza safari',
    it: 'Pubblica un viaggio',
    de: 'Fahrt anbieten',
  },
  annonces_liste_deplacee: {
    fr: 'Vos trajets déjà publiés sont rangés dans « Mes trajets postés », sur l’écran Mes courses.',
    en: 'The trips you have already posted are kept under “My posted trips”, on the My rides screen.',
    sw: 'Safari ulizokwisha tangaza zipo kwenye « Safari zangu », kwenye skrini ya Safari zangu.',
    it: 'I viaggi già pubblicati si trovano in « I miei viaggi », nella schermata Le mie corse.',
    de: 'Ihre bereits angebotenen Fahrten finden Sie unter „Meine Fahrten“ im Bildschirm Meine Fahrten.',
  },
  courses_case_mes_trajets: {
    fr: 'Mes trajets postés',
    en: 'My posted trips',
    sw: 'Safari zangu',
    it: 'I miei viaggi',
    de: 'Meine Fahrten',
  },
  courses_mes_trajets_vide: {
    fr: "Vous n'avez encore posté aucun trajet. Touchez « Poster un trajet » pour en publier un.",
    en: 'You have not posted any trip yet. Tap “Post a trip” to publish one.',
    sw: 'Bado hujatangaza safari yoyote. Gusa « Tangaza safari » kuweka moja.',
    it: 'Non hai ancora pubblicato nessun viaggio. Tocca « Pubblica un viaggio » per crearne uno.',
    de: 'Sie haben noch keine Fahrt angeboten. Tippen Sie auf „Fahrt anbieten“.',
  },
  courses_mes_trajets_places: {
    fr: '{vendues}/{total} places prises',
    en: '{vendues}/{total} seats taken',
    sw: 'Viti {vendues}/{total} vimechukuliwa',
    it: '{vendues}/{total} posti occupati',
    de: '{vendues}/{total} Plätze belegt',
  },
  courses_menu_intro: {
    fr: 'Touchez une case.',
    en: 'Tap a box.',
    sw: 'Gusa kisanduku.',
    it: 'Tocca una casella.',
    de: 'Tippen Sie auf ein Feld.',
  },
  courses_retour_menu: {
    fr: '‹ Retour au menu',
    en: '‹ Back to menu',
    sw: '‹ Rudi kwenye menyu',
    it: '‹ Torna al menu',
    de: '‹ Zurück zum Menü',
  },
  courses_colis_a_prendre: {
    fr: 'Colis à prendre',
    en: 'Parcels to take',
    sw: 'Mizigo ya kuchukua',
    it: 'Pacchi da prendere',
    de: 'Pakete zum Mitnehmen',
  },
  courses_a_faire: {
    fr: 'À FAIRE MAINTENANT',
    en: 'TO DO NOW',
    sw: 'YA KUFANYA SASA',
    it: 'DA FARE ADESSO',
    de: 'JETZT ZU TUN',
  },
  courses_a_faire_vide: {
    fr: 'Rien en cours. Prenez un travail ci-dessous 👇',
    en: 'Nothing in progress. Take a job below 👇',
    sw: 'Hakuna kazi inayoendelea. Chukua kazi hapa chini 👇',
    it: 'Niente in corso. Prendi un lavoro qui sotto 👇',
    de: 'Nichts in Arbeit. Nehmen Sie unten einen Auftrag an 👇',
  },
  courses_a_prendre: {
    fr: 'À PRENDRE',
    en: 'AVAILABLE',
    sw: 'ZA KUCHUKUA',
    it: 'DA PRENDERE',
    de: 'VERFÜGBAR',
  },
  courses_a_prendre_vide: {
    fr: 'Rien de libre pour le moment. Restez disponible : ça arrive vite 🌴',
    en: 'Nothing available right now. Stay available — it comes fast 🌴',
    sw: 'Hakuna kazi kwa sasa. Endelea kuwa tayari — zinakuja haraka 🌴',
    it: 'Niente di libero al momento. Resta disponibile: arriva presto 🌴',
    de: 'Momentan nichts frei. Bleiben Sie verfügbar — es kommt schnell 🌴',
  },
  courses_etiquette_course: {
    fr: '🚕 Course',
    en: '🚕 Ride',
    sw: '🚕 Safari',
    it: '🚕 Corsa',
    de: '🚕 Fahrt',
  },
  courses_etiquette_colis: {
    fr: '📦 Colis',
    en: '📦 Parcel',
    sw: '📦 Mzigo',
    it: '📦 Pacco',
    de: '📦 Paket',
  },
  courses_ouvrir_court: {
    fr: 'Ouvrir',
    en: 'Open',
    sw: 'Fungua',
    it: 'Apri',
    de: 'Öffnen',
  },
  courses_historique_voir: {
    fr: 'Voir mes courses passées ({n})',
    en: 'See my past rides ({n})',
    sw: 'Angalia safari zangu zilizopita ({n})',
    it: 'Vedi le mie corse passate ({n})',
    de: 'Meine vergangenen Fahrten ansehen ({n})',
  },
  courses_historique_masquer: {
    fr: 'Masquer les courses passées',
    en: 'Hide past rides',
    sw: 'Ficha safari zilizopita',
    it: 'Nascondi le corse passate',
    de: 'Vergangene Fahrten ausblenden',
  },
  // --- Quand part la course : le chauffeur doit le voir d'un coup d'œil ---
  courses_depart_immediat: {
    fr: 'Départ immédiat — le client attend',
    en: 'Leaving now — the client is waiting',
    sw: 'Kuondoka sasa hivi — mteja anasubiri',
    it: 'Partenza immediata — il cliente sta aspettando',
    de: 'Sofortige Abfahrt — der Kunde wartet',
  },
  courses_depart_maintenant: {
    fr: 'Départ maintenant',
    en: 'Leaving now',
    sw: 'Kuondoka sasa',
    it: 'Partenza adesso',
    de: 'Abfahrt jetzt',
  },
  courses_depart_dans_min: {
    fr: 'Départ dans {n} min ({heure})',
    en: 'Leaving in {n} min ({heure})',
    sw: 'Kuondoka baada ya dakika {n} ({heure})',
    it: 'Partenza tra {n} min ({heure})',
    de: 'Abfahrt in {n} Min. ({heure})',
  },
  courses_depart_aujourdhui: {
    fr: "Aujourd'hui à {heure}",
    en: 'Today at {heure}',
    sw: 'Leo saa {heure}',
    it: 'Oggi alle {heure}',
    de: 'Heute um {heure}',
  },
  courses_depart_demain: {
    fr: 'Demain à {heure}',
    en: 'Tomorrow at {heure}',
    sw: 'Kesho saa {heure}',
    it: 'Domani alle {heure}',
    de: 'Morgen um {heure}',
  },
  courses_depart_date: {
    fr: '{date} à {heure}',
    en: '{date} at {heure}',
    sw: '{date} saa {heure}',
    it: '{date} alle {heure}',
    de: '{date} um {heure}',
  },
  courses_dispo_urgent: {
    fr: 'URGENT',
    en: 'URGENT',
    sw: 'HARAKA',
    it: 'URGENTE',
    de: 'DRINGEND',
  },
  courses_dispo_programmee: {
    fr: 'Programmée',
    en: 'Scheduled',
    sw: 'Imepangwa',
    it: 'Programmata',
    de: 'Geplant',
  },
  courses_dispo_demandee_depuis: {
    fr: 'Demandée {quand}',
    en: 'Requested {quand}',
    sw: 'Iliombwa {quand}',
    it: 'Richiesta {quand}',
    de: 'Angefragt {quand}',
  },
  courses_dispo_indisponible: {
    fr: 'Vous êtes en « indisponible » — repassez disponible pour prendre une course.',
    en: 'You are set to “unavailable” — switch back to available to take a ride.',
    sw: 'Uko "hupatikani" — rudi kuwa unapatikana ili kuchukua safari.',
    it: 'Sei impostato su «non disponibile» — torna disponibile per prendere una corsa.',
    de: 'Sie sind auf „nicht verfügbar“ — schalten Sie auf verfügbar, um eine Fahrt anzunehmen.',
  },
  courses_vide_titre: { fr: 'Aucune course pour le moment', en: 'No rides yet', sw: 'Hakuna safari bado' },
  courses_vide_texte: {
    fr: "Dès que l'équipe zanziGo vous assigne une course, elle apparaît ici automatiquement — tirez l'écran vers le bas pour actualiser.",
    en: 'As soon as the zanziGo team assigns you a ride, it appears here automatically — pull down to refresh.',
    sw: 'Mara timu ya zanziGo ikikupangia safari, itaonekana hapa kiotomatiki — vuta chini kuonyesha upya.',
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
  course_demarrer_bouton: { fr: '🚕 Démarrer la course', en: '🚕 Start the ride', sw: '🚕 Anza safari' },
  course_terminer_bouton: { fr: '🏁 Terminer la course', en: '🏁 Finish the ride', sw: '🏁 Maliza safari' },
  course_demarrer_titre: { fr: 'Démarrer la course', en: 'Start the ride', sw: 'Anza safari' },
  course_demarrer_confirm: {
    fr: 'Confirmez-vous le départ ? Le client sera prévenu que la course a commencé.',
    en: 'Confirm departure? The customer will be notified the ride has started.',
    sw: 'Unathibitisha kuondoka? Mteja atajulishwa kuwa safari imeanza.',
  },
  course_terminer_titre: { fr: 'Terminer la course', en: 'Finish the ride', sw: 'Maliza safari' },
  course_terminer_confirm: {
    fr: 'Confirmez-vous l’arrivée ? Cela clôture la course et débloque votre paiement.',
    en: 'Confirm arrival? This closes the ride and unlocks your payment.',
    sw: 'Unathibitisha kufika? Hii inafunga safari na kufungua malipo yako.',
  },
  course_demandee: {
    fr: "Course demandée — pas encore confirmée par l'équipe.",
    en: 'Ride requested — not confirmed by the team yet.',
    sw: 'Safari imeombwa — bado haijathibitishwa na timu.',
  },
  course_attente_paiement: {
    fr: 'En attente du paiement du client. Vous pourrez démarrer la course une fois la course payée.',
    en: 'Waiting for the customer’s payment. You can start the ride once it is paid.',
    sw: 'Inasubiri malipo ya mteja. Utaweza kuanza safari baada ya kulipiwa.',
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
  annonces_places: { fr: 'Places (1 à {max})', en: 'Seats (1 to {max})', sw: 'Viti (1 hadi {max})' },
  annonces_resa_titre: { fr: 'Places réservées', en: 'Booked seats', sw: 'Viti vilivyohifadhiwa' },
  annonces_nb_resa: {
    fr: '{n} réservation·s',
    en: '{n} booking·s',
    sw: 'uhifadhi {n}',
  },
  annonces_aucune_resa: {
    fr: 'Aucune réservation pour le moment',
    en: 'No bookings yet',
    sw: 'Hakuna uhifadhi bado',
  },
  annonces_ouvrir_detail: {
    fr: 'touchez pour gérer',
    en: 'tap to manage',
    sw: 'gusa kudhibiti',
  },
  titre_annonce: { fr: 'Mon trajet publié', en: 'My posted ride', sw: 'Safari yangu' , it: 'La mia corsa pubblicata', de: 'Meine veröffentlichte Fahrt' },
  annonce_introuvable: { fr: 'Trajet introuvable.', en: 'Ride not found.', sw: 'Safari haipatikani.' },
  annonce_resa_vide: {
    fr: 'Personne n\'a encore réservé — les réservations de l\'app apparaîtront ici automatiquement.',
    en: 'No one has booked yet — in-app bookings will appear here automatically.',
    sw: 'Hakuna aliyehifadhi bado — uhifadhi wa ndani ya programu utaonekana hapa wenyewe.',
  },
  annonce_places_titre: { fr: 'Places disponibles', en: 'Available seats', sw: 'Viti vilivyopo' },
  annonce_ajuster_note: {
    fr: 'Le décompte se fait tout seul quand un client réserve dans l\'app. Ajustez à la main uniquement pour une réservation prise en direct (téléphone, WhatsApp) ou une place libérée.',
    en: 'Seats are deducted automatically when a customer books in the app. Adjust manually only for a booking taken directly (phone, WhatsApp) or a freed seat.',
    sw: 'Viti vinapungua vyenyewe mteja anapohifadhi kwenye programu. Rekebisha kwa mkono tu kwa uhifadhi wa moja kwa moja (simu, WhatsApp) au kiti kilichoachwa.',
  },
  annonce_cloturer_confirm: {
    fr: 'Clôturer ce trajet ? Les clients ne pourront plus réserver.',
    en: 'Close this ride? Customers will no longer be able to book.',
    sw: 'Ufunge safari hii? Wateja hawataweza kuhifadhi tena.',
  },
  annonce_annuler_confirm: {
    fr: 'Annuler ce trajet publié ?',
    en: 'Cancel this posted ride?',
    sw: 'Ughairi safari hii iliyotangazwa?',
  },
  annonce_retour: { fr: 'Retour à mes trajets', en: 'Back to my rides', sw: 'Rudi kwenye safari zangu' },
  gain_commission: { fr: 'Commission zanziGo', en: 'zanziGo commission', sw: 'Kamisheni ya zanziGo' , it: 'Commissione zanziGo', de: 'zanziGo-Provision' },
  gain_net: { fr: 'Votre gain net', en: 'Your net earnings', sw: 'Mapato yako halisi' , it: 'Il tuo guadagno netto', de: 'Ihr Nettoverdienst' },
  // La part zanziGo, en POURCENTAGE — le portail chauffeur n'affiche jamais
  // la commission en argent, ni le prix payé par le client.
  gain_part_zanzigo: {
    fr: 'zanziGo {pct} %',
    en: 'zanziGo {pct}%',
    sw: 'zanziGo {pct}%',
    it: 'zanziGo {pct}%',
    de: 'zanziGo {pct} %',
  },
  gain_part_zanzigo_ligne: {
    fr: 'Part zanziGo',
    en: 'zanziGo share',
    sw: 'Sehemu ya zanziGo',
    it: 'Quota zanziGo',
    de: 'zanziGo-Anteil',
  },
  // Aéroport ↔ Stone Town : la part zanziGo y est un forfait, pas un
  // pourcentage — « 31 % » à l'écran serait vrai et pourtant trompeur. On
  // écrit « Special trip » à la place, dans toutes les langues : c'est un nom
  // de produit, pas une phrase.
  gain_part_special: {
    fr: 'Special trip',
    en: 'Special trip',
    sw: 'Special trip',
    it: 'Special trip',
    de: 'Special trip',
  },
  // L'annonce d'un chauffeur : ce qu'une place lui RAPPORTE, pas ce que le
  // passager paie.
  annonce_net_place: {
    fr: 'Vous touchez par place',
    en: 'You earn per seat',
    sw: 'Unapata kwa kiti',
    it: 'Guadagni per posto',
    de: 'Sie verdienen pro Platz',
  },
  annonce_gain_total: {
    fr: 'Gain net (places payées)',
    en: 'Net earnings (paid seats)',
    sw: 'Mapato halisi (viti vilivyolipwa)',
  },
  annonces_places_attente: {
    fr: '⏳ {n} place(s) bloquée(s) en attente de paiement (5 min max)',
    en: '⏳ {n} seat(s) held awaiting payment (5 min max)',
    sw: '⏳ Kiti {n} kimeshikiliwa kikisubiri malipo (dakika 5)',
  },
  gain_net_par_place: { fr: 'net', en: 'net', sw: 'halisi' , it: 'netto', de: 'netto' },
  annonces_gain_cumule: {
    fr: 'Gain net',
    en: 'Net earnings',
    sw: 'Mapato halisi',
  },
  annonce_prix_label: { fr: 'Prix par place', en: 'Price per seat', sw: 'Bei kwa kiti' },
  annonces_prix_deux: {
    fr: '{tzs} (locaux) · {usd} (touristes)',
    en: '{tzs} (locals) · {usd} (tourists)',
    sw: '{tzs} (wazawa) · {usd} (watalii)',
  },
  annonce_prix_info: {
    fr: 'Chaque client paie dans SA devise : les locaux en shillings (vous touchez 90 %), les touristes et résidents en dollars (vous touchez 80 %). Voir un prix en dollars pour un touriste est donc normal.',
    en: 'Each client pays in THEIR currency: locals in shillings (you receive 90%), tourists and residents in dollars (you receive 80%). Seeing a dollar price for a tourist is therefore normal.',
    sw: 'Kila mteja hulipa kwa sarafu YAKE: wazawa kwa shilingi (unapokea 90%), watalii na wakazi kwa dola (unapokea 80%). Kuona bei ya dola kwa mtalii ni jambo la kawaida.',
  },
  resa_payee: { fr: 'payée', en: 'paid', sw: 'imelipwa' , it: 'pagata', de: 'bezahlt' },
  resa_impayee: { fr: 'à encaisser', en: 'to collect', sw: 'inasubiri malipo' , it: 'da incassare', de: 'einzuziehen' },
  equipe_paiement_place: {
    fr: '🚌 Taxi partagé · {n} place(s)',
    en: '🚌 Shared taxi · {n} seat(s)',
    sw: '🚌 Teksi ya pamoja · kiti {n}',
  },
  resa_type_tourist: { fr: 'touriste', en: 'tourist', sw: 'mtalii' , it: 'turista', de: 'Tourist' },
  resa_type_resident: { fr: 'résident', en: 'resident', sw: 'mkazi' , it: 'residente', de: 'ansässig' },
  resa_type_local: { fr: 'local', en: 'local', sw: 'mzawa' , it: 'locale', de: 'einheimisch' },
  resa_type_hotel: { fr: 'hôtel', en: 'hotel', sw: 'hoteli' , it: 'hotel', de: 'Hotel' },
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
    fr: "Le scan des QR colis nécessite l'accès à la caméra.",
    en: 'Scanning parcel QR codes requires camera access.',
    sw: 'Kuskani QR ya mzigo kunahitaji ruhusa ya kamera.',
  },
  scanner_autoriser: { fr: 'Autoriser la caméra', en: 'Allow camera', sw: 'Ruhusu kamera' },
  scanner_colis_invite: { fr: 'Scannez un QR colis (PKG-…)', en: 'Scan a parcel QR (PKG-…)', sw: 'Skani QR ya mzigo (PKG-…)' },
  scanner_aide_colis: {
    fr: 'Placez le QR du colis dans le cadre.',
    en: 'Place the parcel QR inside the frame.',
    sw: 'Weka QR ya mzigo ndani ya fremu.',
  },
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
  compte_badge_verifie: { fr: 'Chauffeur vérifié ✓', en: 'Verified driver ✓', sw: 'Dereva amethibitishwa ✓' , it: 'Autista verificato ✓', de: 'Geprüfter Fahrer ✓' },
  compte_badge_attente: { fr: 'En attente de validation', en: 'Awaiting validation', sw: 'Inasubiri uthibitisho' , it: 'In attesa di convalida', de: 'Warten auf Freigabe' },
  compte_badge_refuse: { fr: 'Candidature refusée', en: 'Application declined', sw: 'Maombi yamekataliwa' , it: 'Candidatura rifiutata', de: 'Bewerbung abgelehnt' },
  compte_avis: { fr: '★ {note} ({n} avis)', en: '★ {note} ({n} reviews)', sw: '★ {note} (maoni {n})' , it: '★ {note} ({n} recensioni)', de: '★ {note} ({n} Bewertungen)' },
  compte_vehicule: { fr: 'Véhicule', en: 'Vehicle', sw: 'Gari' , it: 'Veicolo', de: 'Fahrzeug' },
  compte_plaque: { fr: 'Plaque', en: 'Plate', sw: 'Namba ya gari' , it: 'Targa', de: 'Kennzeichen' },
  compte_permis: { fr: 'Permis', en: 'Licence', sw: 'Leseni' , it: 'Patente', de: 'Führerschein' },

  // --- Dates relatives ---------------------------------------------------------------
  date_instant: { fr: "à l'instant", en: 'just now', sw: 'sasa hivi' , it: 'adesso', de: 'gerade eben' },
  date_bientot: { fr: 'dans un instant', en: 'in a moment', sw: 'baada ya muda mfupi' , it: 'tra poco', de: 'gleich' },
  date_min_passe: { fr: 'il y a {n} min', en: '{n} min ago', sw: 'dakika {n} zilizopita' , it: '{n} min fa', de: 'vor {n} Min.' },
  date_min_futur: { fr: 'dans {n} min', en: 'in {n} min', sw: 'baada ya dakika {n}' , it: 'tra {n} min', de: 'in {n} Min.' },
  date_h_passe: { fr: 'il y a {n} h', en: '{n} h ago', sw: 'saa {n} zilizopita' , it: '{n} h fa', de: 'vor {n} Std.' },
  date_h_futur: { fr: 'dans {n} h', en: 'in {n} h', sw: 'baada ya saa {n}' , it: 'tra {n} h', de: 'in {n} Std.' },
  date_hier: { fr: 'hier', en: 'yesterday', sw: 'jana' , it: 'ieri', de: 'gestern' },
  date_demain: { fr: 'demain', en: 'tomorrow', sw: 'kesho' , it: 'domani', de: 'morgen' },
  date_jours_passe: { fr: 'il y a {n} jours', en: '{n} days ago', sw: 'siku {n} zilizopita' , it: '{n} giorni fa', de: 'vor {n} Tagen' },
  date_jours_futur: { fr: 'dans {n} jours', en: 'in {n} days', sw: 'baada ya siku {n}' , it: 'tra {n} giorni', de: 'in {n} Tagen' },

  // --- Location de véhicules ---------------------------------------------------------
  onglet_location: { fr: 'Location', en: 'Rentals', sw: 'Kukodisha', it: 'Noleggio', de: 'Vermietung' },
  verif_type_vehicule: { fr: 'Véhicule', en: 'Vehicle', sw: 'Gari', it: 'Veicolo', de: 'Fahrzeug' },

  // Galerie de photos (GaleriePhotos.tsx) — réutilisée équipe (fiche véhicule).
  galerie_ajouter: { fr: 'Ajouter une photo', en: 'Add a photo', sw: 'Ongeza picha', it: 'Aggiungi una foto', de: 'Foto hinzufügen' },
  galerie_retirer: { fr: 'Retirer cette photo', en: 'Remove this photo', sw: 'Ondoa picha hii', it: 'Rimuovi questa foto', de: 'Foto entfernen' },
  galerie_compteur: { fr: '{n}/{max} photos', en: '{n}/{max} photos', sw: 'picha {n}/{max}', it: '{n}/{max} foto', de: '{n}/{max} Fotos' },
  galerie_erreur_envoi: { fr: "Échec de l'envoi — réessayez", en: 'Upload failed — try again', sw: 'Kutuma kumeshindikana — jaribu tena', it: "Invio non riuscito — riprova", de: 'Upload fehlgeschlagen — erneut versuchen' },

  // Menu équipe.
  equipe_famille_location: { fr: 'Location de véhicules', en: 'Vehicle rentals', sw: 'Kukodisha magari', it: 'Noleggio veicoli', de: 'Fahrzeugvermietung' },
  equipe_stat_vehicules: { fr: 'Véhicules', en: 'Vehicles', sw: 'Magari', it: 'Veicoli', de: 'Fahrzeuge' },

  // Catégories figées (migration 043) : le client choisit la sienne au
  // catalogue, l'équipe la choisit à la création — jamais de texte libre.
  vehicule_categorie_tourisme: { fr: 'Voiture de tourisme', en: 'Standard car', sw: 'Gari la kawaida', it: 'Auto turistica', de: 'Standard-Pkw' },
  vehicule_categorie_4x4: { fr: '4x4', en: '4x4', sw: '4x4', it: '4x4', de: '4x4' },
  vehicule_categorie_luxe: { fr: 'Véhicule de luxe', en: 'Luxury vehicle', sw: 'Gari la kifahari', it: 'Veicolo di lusso', de: 'Luxusfahrzeug' },
  vehicule_categorie_scooter: { fr: 'Scooter', en: 'Scooter', sw: 'Skuta', it: 'Scooter', de: 'Roller' },
  vehicule_categorie_moto: { fr: 'Moto', en: 'Motorcycle', sw: 'Pikipiki', it: 'Moto', de: 'Motorrad' },
  vehicule_categorie_enduro: { fr: 'Enduro', en: 'Enduro', sw: 'Enduro', it: 'Enduro', de: 'Enduro' },
  location_categorie_toutes: { fr: 'Toutes', en: 'All', sw: 'Zote', it: 'Tutte', de: 'Alle' },

  // Statuts d'un véhicule (badges).
  vehicule_statut_pending: { fr: 'À vérifier', en: 'To verify', sw: 'Kuthibitishwa', it: 'Da verificare', de: 'Zu prüfen' },
  vehicule_statut_verified: { fr: 'Publié', en: 'Published', sw: 'Imechapishwa', it: 'Pubblicato', de: 'Veröffentlicht' },
  vehicule_statut_rejected: { fr: 'Refusé', en: 'Rejected', sw: 'Imekataliwa', it: 'Rifiutato', de: 'Abgelehnt' },
  vehicule_statut_archive: { fr: 'Archivé', en: 'Archived', sw: 'Imehifadhiwa', it: 'Archiviato', de: 'Archiviert' },
  vehicule_disponible: { fr: 'Disponible', en: 'Available', sw: 'Inapatikana', it: 'Disponibile', de: 'Verfügbar' },
  vehicule_indisponible: { fr: 'Indisponible', en: 'Unavailable', sw: 'Haipatikani', it: 'Non disponibile', de: 'Nicht verfügbar' },

  // Écran équipe : liste des véhicules (vehicules.tsx).
  vehicules_titre: { fr: 'Véhicules en location', en: 'Rental vehicles', sw: 'Magari ya kukodisha', it: 'Veicoli a noleggio', de: 'Mietfahrzeuge' },
  vehicules_ajouter: { fr: 'Ajouter un véhicule', en: 'Add a vehicle', sw: 'Ongeza gari', it: 'Aggiungi un veicolo', de: 'Fahrzeug hinzufügen' },
  vehicules_vide_titre: { fr: 'Aucun véhicule', en: 'No vehicles', sw: 'Hakuna magari', it: 'Nessun veicolo', de: 'Keine Fahrzeuge' },
  vehicules_vide_message: {
    fr: 'Ajoutez le premier véhicule du catalogue de location.',
    en: 'Add the first vehicle to the rental catalogue.',
    sw: 'Ongeza gari la kwanza kwenye orodha ya kukodisha.',
    it: 'Aggiungi il primo veicolo al catalogo noleggio.',
    de: 'Fügen Sie das erste Fahrzeug zum Mietkatalog hinzu.',
  },
  vehicules_erreur: { fr: 'Impossible de charger les véhicules.', en: 'Could not load vehicles.', sw: 'Imeshindikana kupakia magari.', it: 'Impossibile caricare i veicoli.', de: 'Fahrzeuge konnten nicht geladen werden.' },

  // Formulaire véhicule (nouveau.tsx / [id].tsx, équipe).
  vehicule_champ_categorie: { fr: 'Catégorie', en: 'Category', sw: 'Aina', it: 'Categoria', de: 'Kategorie' },
  vehicule_champ_marque: { fr: 'Marque', en: 'Make', sw: 'Chapa', it: 'Marca', de: 'Marke' },
  vehicule_champ_modele: { fr: 'Modèle', en: 'Model', sw: 'Modeli', it: 'Modello', de: 'Modell' },
  vehicule_champ_annee: { fr: 'Année', en: 'Year', sw: 'Mwaka', it: 'Anno', de: 'Baujahr' },
  vehicule_champ_plaque: { fr: "Plaque d'immatriculation", en: 'Licence plate', sw: 'Namba ya usajili', it: 'Targa', de: 'Kennzeichen' },
  vehicule_champ_places: { fr: 'Nombre de places', en: 'Number of seats', sw: 'Idadi ya viti', it: 'Numero di posti', de: 'Anzahl der Sitze' },
  vehicule_champ_transmission: { fr: 'Transmission', en: 'Transmission', sw: 'Gia', it: 'Cambio', de: 'Getriebe' },
  vehicule_champ_description: { fr: 'Description', en: 'Description', sw: 'Maelezo', it: 'Descrizione', de: 'Beschreibung' },
  vehicule_champ_lieu_retrait: { fr: 'Lieu de retrait', en: 'Pickup location', sw: 'Mahali pa kuchukua', it: 'Luogo di ritiro', de: 'Abholort' },
  vehicule_champ_loueur_nom: { fr: 'Nom du loueur', en: "Owner's name", sw: 'Jina la mmiliki', it: 'Nome del noleggiatore', de: 'Name des Vermieters' },
  vehicule_champ_loueur_telephone: { fr: 'Téléphone du loueur', en: "Owner's phone", sw: 'Simu ya mmiliki', it: 'Telefono del noleggiatore', de: 'Telefon des Vermieters' },
  vehicule_champ_prix_jour: { fr: 'Prix par jour', en: 'Price per day', sw: 'Bei kwa siku', it: 'Prezzo al giorno', de: 'Preis pro Tag' },
  vehicule_champ_commission_jour: { fr: 'Commission zanziGo par jour', en: 'zanziGo commission per day', sw: 'Kamisheni ya zanziGo kwa siku', it: 'Commissione zanziGo al giorno', de: 'zanziGo-Provision pro Tag' },
  vehicule_champ_devise: { fr: 'Devise', en: 'Currency', sw: 'Sarafu', it: 'Valuta', de: 'Währung' },
  vehicule_champ_assurance_expiration: { fr: "Assurance valable jusqu'au", en: 'Insurance valid until', sw: 'Bima inaisha tarehe', it: "Assicurazione valida fino al", de: 'Versicherung gültig bis' },
  vehicule_champ_road_licence_expiration: { fr: "Road licence valable jusqu'au", en: 'Road licence valid until', sw: 'Leseni ya barabara inaisha tarehe', it: 'Road licence valida fino al', de: 'Fahrzeugschein gültig bis' },

  vehicule_doc_assurance: { fr: 'Assurance', en: 'Insurance', sw: 'Bima', it: 'Assicurazione', de: 'Versicherung' },
  vehicule_doc_assurance_ajouter: { fr: "Ajouter l'assurance", en: 'Add insurance', sw: 'Ongeza bima', it: "Aggiungi l'assicurazione", de: 'Versicherung hinzufügen' },
  vehicule_doc_assurance_ajoute: { fr: 'Assurance jointe', en: 'Insurance added', sw: 'Bima imeongezwa', it: 'Assicurazione allegata', de: 'Versicherung hinzugefügt' },
  vehicule_doc_road_licence: { fr: 'Road licence', en: 'Road licence', sw: 'Leseni ya barabara', it: 'Road licence', de: 'Fahrzeugschein' },
  vehicule_doc_road_licence_ajouter: { fr: 'Ajouter la road licence', en: 'Add the road licence', sw: 'Ongeza leseni ya barabara', it: 'Aggiungi la road licence', de: 'Fahrzeugschein hinzufügen' },
  vehicule_doc_road_licence_ajoute: { fr: 'Road licence jointe', en: 'Road licence added', sw: 'Leseni ya barabara imeongezwa', it: 'Road licence allegata', de: 'Fahrzeugschein hinzugefügt' },
  vehicule_doc_changer: { fr: 'Changer', en: 'Change', sw: 'Badilisha', it: 'Cambia', de: 'Ändern' },
  vehicule_photos_titre: { fr: 'Photos du véhicule', en: 'Vehicle photos', sw: 'Picha za gari', it: 'Foto del veicolo', de: 'Fahrzeugfotos' },

  vehicule_creer: { fr: 'Créer le véhicule', en: 'Create the vehicle', sw: 'Tengeneza gari', it: 'Crea il veicolo', de: 'Fahrzeug anlegen' },
  vehicule_enregistrer: { fr: 'Enregistrer', en: 'Save', sw: 'Hifadhi', it: 'Salva', de: 'Speichern' },
  vehicule_erreur: { fr: "Une erreur s'est produite.", en: 'Something went wrong.', sw: 'Hitilafu imetokea.', it: 'Si è verificato un errore.', de: 'Es ist ein Fehler aufgetreten.' },
  vehicule_champs_requis: {
    fr: 'Complétez au moins la catégorie, la marque, le modèle, la plaque, le lieu de retrait, le loueur et les deux documents.',
    en: 'Fill in at least the category, make, model, plate, pickup location, owner and both documents.',
    sw: 'Jaza angalau aina, chapa, modeli, namba, mahali pa kuchukua, mmiliki na nyaraka mbili.',
    it: 'Compila almeno categoria, marca, modello, targa, luogo di ritiro, noleggiatore e i due documenti.',
    de: 'Füllen Sie mindestens Kategorie, Marke, Modell, Kennzeichen, Abholort, Vermieter und beide Dokumente aus.',
  },
  vehicule_cree_confirmation: {
    fr: 'Véhicule créé — vérifiez-le pour le publier au catalogue.',
    en: 'Vehicle created — verify it to publish it to the catalogue.',
    sw: 'Gari limetengenezwa — lithibitishe ili lichapishwe kwenye orodha.',
    it: 'Veicolo creato — verificalo per pubblicarlo nel catalogo.',
    de: 'Fahrzeug angelegt — prüfen Sie es, um es im Katalog zu veröffentlichen.',
  },

  vehicule_verifier_titre: { fr: 'Vérification du véhicule', en: 'Vehicle verification', sw: 'Uthibitisho wa gari', it: 'Verifica del veicolo', de: 'Fahrzeugprüfung' },
  vehicule_valider: { fr: 'Valider — publier au catalogue', en: 'Approve — publish to catalogue', sw: 'Idhinisha — chapisha kwenye orodha', it: 'Approva — pubblica nel catalogo', de: 'Freigeben — im Katalog veröffentlichen' },
  vehicule_refuser: { fr: 'Refuser', en: 'Reject', sw: 'Kataa', it: 'Rifiuta', de: 'Ablehnen' },
  vehicule_archiver: { fr: 'Archiver définitivement', en: 'Archive permanently', sw: 'Hifadhi kabisa', it: 'Archivia definitivamente', de: 'Endgültig archivieren' },
  vehicule_archiver_confirmation: {
    fr: 'Ce véhicule sera retiré du catalogue définitivement. Continuer ?',
    en: 'This vehicle will be permanently removed from the catalogue. Continue?',
    sw: 'Gari hili litaondolewa kabisa kwenye orodha. Endelea?',
    it: 'Questo veicolo sarà rimosso definitivamente dal catalogo. Continuare?',
    de: 'Dieses Fahrzeug wird dauerhaft aus dem Katalog entfernt. Fortfahren?',
  },

  // Mise en avant de la location sur l'écran Réserver (demande du client :
  // « une phrase sympa — déplacez-vous librement avec zanziGo »).
  accueil_location_titre: {
    fr: 'Déplacez-vous librement avec zanziGo',
    en: 'Move freely with zanziGo',
    sw: 'Tembea kwa uhuru na zanziGo',
    it: 'Muoviti liberamente con zanziGo',
    de: 'Bewegen Sie sich frei mit zanziGo',
  },
  accueil_location_texte: {
    fr: 'Taxi à la course, colis livrés… et maintenant la location à la journée : voiture, 4x4, luxe, scooter, moto, enduro.',
    en: 'Taxi rides, parcels delivered… and now daily rentals: car, 4x4, luxury, scooter, motorbike, enduro.',
    sw: 'Safari za teksi, mizigo… na sasa kukodisha kwa siku: gari, 4x4, kifahari, skuta, pikipiki, enduro.',
    it: 'Corse in taxi, pacchi consegnati… e ora il noleggio a giornata: auto, 4x4, lusso, scooter, moto, enduro.',
    de: 'Taxifahrten, Pakete geliefert… und jetzt Tagesmiete: Auto, 4x4, Luxus, Roller, Motorrad, Enduro.',
  },
  accueil_location_bouton: {
    fr: 'Découvrir la location',
    en: 'Discover rentals',
    sw: 'Gundua kukodisha',
    it: 'Scopri il noleggio',
    de: 'Vermietung entdecken',
  },

  // Écran client : catalogue + mes locations (tabs/location.tsx).
  location_titre: { fr: 'Location de véhicules', en: 'Vehicle rentals', sw: 'Kukodisha magari', it: 'Noleggio veicoli', de: 'Fahrzeugvermietung' },
  location_sous_titre: {
    fr: "zanziGo est votre intermédiaire de confiance : véhicule vérifié, assurance et road licence contrôlées par notre équipe.",
    en: 'zanziGo is your trusted go-between: vehicle verified, insurance and road licence checked by our team.',
    sw: 'zanziGo ni mpatanishi wako wa kuaminika: gari limethibitishwa, bima na leseni ya barabara zimekaguliwa na timu yetu.',
    it: 'zanziGo è il tuo intermediario di fiducia: veicolo verificato, assicurazione e road licence controllate dal nostro team.',
    de: 'zanziGo ist Ihr vertrauenswürdiger Vermittler: Fahrzeug geprüft, Versicherung und Fahrzeugschein von unserem Team kontrolliert.',
  },
  location_onglet_catalogue: { fr: 'Catalogue', en: 'Catalogue', sw: 'Orodha', it: 'Catalogo', de: 'Katalog' },
  location_onglet_mes_locations: { fr: 'Mes locations', en: 'My rentals', sw: 'Kodi zangu', it: 'I miei noleggi', de: 'Meine Mietungen' },
  location_vide_titre: { fr: 'Aucun véhicule disponible', en: 'No vehicles available', sw: 'Hakuna gari linalopatikana', it: 'Nessun veicolo disponibile', de: 'Keine Fahrzeuge verfügbar' },
  location_vide_message: {
    fr: 'Revenez bientôt — de nouveaux véhicules arrivent régulièrement.',
    en: 'Check back soon — new vehicles are added regularly.',
    sw: 'Rudi hivi karibuni — magari mapya yanaongezwa mara kwa mara.',
    it: 'Torna presto — nuovi veicoli arrivano regolarmente.',
    de: 'Schauen Sie bald wieder vorbei — regelmäßig kommen neue Fahrzeuge hinzu.',
  },
  location_erreur: { fr: 'Impossible de charger le catalogue.', en: 'Could not load the catalogue.', sw: 'Imeshindikana kupakia orodha.', it: 'Impossibile caricare il catalogo.', de: 'Katalog konnte nicht geladen werden.' },
  location_par_jour: { fr: '/ jour', en: '/ day', sw: '/ siku', it: '/ giorno', de: '/ Tag' },
  location_verifie: { fr: 'Documents vérifiés', en: 'Documents verified', sw: 'Nyaraka zimethibitishwa', it: 'Documenti verificati', de: 'Dokumente geprüft' },
  location_places: { fr: '{n} places', en: '{n} seats', sw: 'viti {n}', it: '{n} posti', de: '{n} Sitze' },

  mes_locations_vide_titre: { fr: 'Aucune location', en: 'No rentals', sw: 'Hakuna kukodisha', it: 'Nessun noleggio', de: 'Keine Mietungen' },
  mes_locations_vide_message: {
    fr: 'Vos réservations de véhicule apparaîtront ici.',
    en: 'Your vehicle bookings will appear here.',
    sw: 'Kodi zako za magari zitaonekana hapa.',
    it: 'Le tue prenotazioni di veicoli appariranno qui.',
    de: 'Ihre Fahrzeugbuchungen erscheinen hier.',
  },
  mes_locations_statut_payee: { fr: 'Payée', en: 'Paid', sw: 'Imelipwa', it: 'Pagato', de: 'Bezahlt' },
  mes_locations_statut_attente: { fr: 'Paiement en attente', en: 'Payment pending', sw: 'Malipo yanasubiriwa', it: 'Pagamento in attesa', de: 'Zahlung ausstehend' },
  mes_locations_statut_annulee: { fr: 'Annulée', en: 'Cancelled', sw: 'Imeghairiwa', it: 'Annullato', de: 'Storniert' },

  // Fiche véhicule + réservation (location-vehicule/[id].tsx, client).
  vehicule_fiche_erreur: { fr: 'Impossible de charger ce véhicule.', en: 'Could not load this vehicle.', sw: 'Imeshindikana kupakia gari hili.', it: 'Impossibile caricare questo veicolo.', de: 'Fahrzeug konnte nicht geladen werden.' },
  vehicule_reserver_titre: { fr: 'Réserver ce véhicule', en: 'Book this vehicle', sw: 'Kodisha gari hili', it: 'Prenota questo veicolo', de: 'Dieses Fahrzeug buchen' },
  vehicule_date_depart: { fr: 'Date de départ', en: 'Start date', sw: 'Tarehe ya kuanza', it: 'Data di inizio', de: 'Abholdatum' },
  vehicule_date_retour: { fr: 'Date de retour', en: 'Return date', sw: 'Tarehe ya kurudisha', it: 'Data di ritorno', de: 'Rückgabedatum' },
  vehicule_jours: { fr: '{n} jour(s)', en: '{n} day(s)', sw: 'siku {n}', it: '{n} giorno/i', de: '{n} Tag(e)' },
  vehicule_prix_total: { fr: 'Prix total', en: 'Total price', sw: 'Bei jumla', it: 'Prezzo totale', de: 'Gesamtpreis' },
  vehicule_reserver_bouton: { fr: 'Réserver et payer', en: 'Book and pay', sw: 'Kodisha na ulipe', it: 'Prenota e paga', de: 'Buchen und bezahlen' },
  vehicule_erreur_dates: { fr: 'Choisissez vos dates de départ et de retour.', en: 'Choose your start and return dates.', sw: 'Chagua tarehe ya kuanza na ya kurudisha.', it: 'Scegli le date di inizio e ritorno.', de: 'Wählen Sie Abhol- und Rückgabedatum.' },
  vehicule_reservation_confirmee: {
    fr: 'Réservation créée — finalisez le paiement pour confirmer.',
    en: 'Booking created — complete payment to confirm.',
    sw: 'Kodi imetengenezwa — kamilisha malipo kuthibitisha.',
    it: 'Prenotazione creata — completa il pagamento per confermare.',
    de: 'Buchung erstellt — Zahlung abschließen, um zu bestätigen.',
  },
  vehicule_annuler: { fr: 'Annuler cette location', en: 'Cancel this rental', sw: 'Ghairi kukodisha huku', it: 'Annulla questo noleggio', de: 'Diese Miete stornieren' },
  vehicule_remboursement: { fr: 'Remboursement : {montant} {devise} ({pct} %)', en: 'Refund: {montant} {devise} ({pct}%)', sw: 'Marejesho: {montant} {devise} ({pct}%)', it: 'Rimborso: {montant} {devise} ({pct}%)', de: 'Rückerstattung: {montant} {devise} ({pct} %)' },
  vehicule_pas_remboursement: { fr: 'Aucun remboursement pour cette annulation.', en: 'No refund for this cancellation.', sw: 'Hakuna marejesho kwa kughairi huku.', it: 'Nessun rimborso per questa cancellazione.', de: 'Keine Rückerstattung für diese Stornierung.' },
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
  // Repli : la langue demandée, sinon l'ANGLAIS (compris de la quasi-totalité
  // des visiteurs), sinon le français, sinon la clé — jamais d'écran vide.
  let texte = entree?.[langue] ?? entree?.en ?? entree?.fr ?? String(cle);
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
        // La langue mémorisée est acceptée si elle fait partie des langues
        // proposées — sinon un visiteur italien ou allemand retrouverait le
        // français à chaque ouverture.
        const memorisee = await lireStockage(CLE_LANGUE);
        if (memorisee && LANGUES.some((l) => l.code === memorisee)) {
          setLangue(memorisee as Langue);
        }
      } catch {
        // silencieux : on reste en français
      }
    })();
  }, []);

  const changerLangue = useCallback((nouvelle: Langue) => {
    setLangue(nouvelle);
    ecrireStockage(CLE_LANGUE, nouvelle).catch(() => {});
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

/** Libellé traduit d'une taille de colis (small/medium/large). */
export function libelleTailleColis(taille: TailleColis | undefined, t: FonctionT): string {
  if (taille === 'small') return t('ncolis_taille_petit');
  if (taille === 'medium') return t('ncolis_taille_moyen');
  if (taille === 'large') return t('ncolis_taille_grand');
  return '';
}

/** Les six catégories figées de location de véhicule (migration 043). */
export const CATEGORIES_VEHICULE = ['tourisme', '4x4', 'luxe', 'scooter', 'moto', 'enduro'] as const;
export type CategorieVehicule = (typeof CATEGORIES_VEHICULE)[number];

/** Libellé traduit d'une catégorie de véhicule ; la valeur brute en secours. */
export function libelleCategorieVehicule(categorie: string | undefined, t: FonctionT): string {
  if (!categorie) return '';
  if ((CATEGORIES_VEHICULE as readonly string[]).includes(categorie)) {
    return t(`vehicule_categorie_${categorie}` as CleChaine);
  }
  return categorie;
}

/**
 * Date relative traduite (« il y a 5 min », '5 min ago', 'dakika 5 zilizopita'),
 * date courte au-delà d'une semaine, '' si absente/invalide.
 */
/**
 * QUAND PART CETTE COURSE — libellé pensé pour le chauffeur qui décide s'il la
 * prend. « il y a 5 min » disait quand la course avait été DEMANDÉE, pas quand
 * il fallait partir : ambigu, et invisible pour les départs immédiats.
 *
 * Renvoie le texte à afficher et un niveau d'urgence :
 *  - 'immediat' : aucun horaire choisi par le client → il attend maintenant ;
 *  - 'urgent'   : départ dans moins d'une heure (ou déjà dû) ;
 *  - 'planifie' : plus tard — on annonce clairement le jour ET l'heure.
 */
export function departCourse(
  scheduledAt: unknown,
  t: FonctionT,
  langue: Langue
): { texte: string; urgence: 'immediat' | 'urgent' | 'planifie' } {
  const locale = LOCALES_INTL[langue];
  if (typeof scheduledAt !== 'string' || !scheduledAt) {
    return { texte: t('courses_depart_immediat'), urgence: 'immediat' };
  }
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) {
    return { texte: t('courses_depart_immediat'), urgence: 'immediat' };
  }
  const heure = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const minutes = Math.round((date.getTime() - Date.now()) / 60000);

  // Départ dû, ou dans l'heure : c'est urgent, on compte en minutes.
  if (minutes <= 0) return { texte: t('courses_depart_maintenant'), urgence: 'urgent' };
  if (minutes < 60) {
    return { texte: t('courses_depart_dans_min', { n: minutes, heure }), urgence: 'urgent' };
  }

  // Aujourd'hui / demain / date complète — toujours avec le jour, jamais une
  // heure seule (un chauffeur ne doit pas avoir à deviner le jour).
  const jour = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const maintenant = new Date();
  const auj = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate()).getTime();
  const UN_JOUR = 86400000;
  if (jour === auj) return { texte: t('courses_depart_aujourdhui', { heure }), urgence: 'planifie' };
  if (jour === auj + UN_JOUR) {
    return { texte: t('courses_depart_demain', { heure }), urgence: 'planifie' };
  }
  const libelleJour = date.toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return { texte: t('courses_depart_date', { date: libelleJour, heure }), urgence: 'planifie' };
}

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

// ---------------------------------------------------------------------------
// Sélecteurs de date / heure de départ (menus déroulants, aucun date-picker
// natif) : dates = aujourd'hui + 7 jours, heures = 05:00 → 22:00 par 30 min.
// ---------------------------------------------------------------------------

const LOCALES_INTL: Record<Langue, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  sw: 'sw-TZ',
  it: 'it-IT',
  de: 'de-DE',
};

/** Choix d'heure proposés : « 05:00 », « 05:30 », …, « 22:00 ». */
export const HEURES_CHOIX: string[] = (() => {
  const heures: string[] = [];
  for (let h = 5; h <= 22; h += 1) {
    heures.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 22) heures.push(`${String(h).padStart(2, '0')}:30`);
  }
  return heures;
})();

/**
 * Nombre de jours à l'avance qu'on peut réserver (au-delà d'aujourd'hui) :
 * trois mois. Un client qui prépare son voyage peut réserver son transfert
 * bien à l'avance — au moins deux mois, avec de la marge.
 */
export const JOURS_RESERVATION_AVANCE = 90;

/**
 * Combine une date « yyyy-mm-dd » (choisie au calendrier) et une heure
 * « HH:MM » en ISO 8601, en heure LOCALE de l'appareil. null si l'une des deux
 * est absente ou mal formée.
 */
export function isoDepuisDateHeure(dateYmd: string, heure: string): string | null {
  const [y, mo, d] = (dateYmd || '').split('-').map(Number);
  const [h, mi] = (heure || '').split(':').map(Number);
  if (![y, mo, d, h, mi].every(Number.isInteger)) return null;
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * Libellé lisible d'une date « yyyy-mm-dd » dans la langue active, ex.
 * « vendredi 14 août » — pour le récap affiché sous le calendrier.
 */
export function formaterDateChoisie(dateYmd: string, langue: Langue): string {
  if (!dateYmd) return '';
  const [y, mo, d] = dateYmd.split('-').map(Number);
  const date = new Date(y, mo - 1, d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(LOCALES_INTL[langue], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

// Menu déroulant de dates encore utilisé par les écrans « proposer un trajet »
// (chauffeur) et « envoyer un colis » : une échéance proche suffit (une
// semaine). L'écran de réservation client, lui, utilise le calendrier
// (CalendrierDate) qui va jusqu'à trois mois.
const JOURS_MENU_DATES = 7;

/**
 * Libellés des dates proposées : Aujourd'hui, Demain, puis les jours suivants
 * formatés (ex. « ven. 14 août »). L'index dans la liste correspond au
 * décalage en jours par rapport à aujourd'hui.
 */
export function libellesDates(_t: FonctionT, langue: Langue): string[] {
  const libelles = [_t('sel_aujourdhui'), _t('sel_demain')];
  for (let i = 2; i <= JOURS_MENU_DATES; i += 1) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    libelles.push(
      date.toLocaleDateString(LOCALES_INTL[langue], {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    );
  }
  return libelles;
}

/**
 * Combine un libellé de date (issu de libellesDates) et une heure « HH:MM » en
 * ISO 8601 (heure locale), ou null si la sélection est incomplète/inconnue.
 */
export function isoDepuisChoix(
  libelles: string[],
  libelleDate: string,
  heure: string
): string | null {
  const index = libelles.indexOf(libelleDate);
  const [h, m] = heure.split(':').map(Number);
  if (index < 0 || !Number.isInteger(h) || !Number.isInteger(m)) return null;
  const date = new Date();
  date.setDate(date.getDate() + index);
  date.setHours(h, m, 0, 0);
  return date.toISOString();
}
