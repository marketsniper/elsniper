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
  commun_mauvais_numero: {
    fr: 'Mauvais numéro ? Recommencer avec un autre',
    en: 'Wrong number? Start over with another',
    sw: 'Namba si sahihi? Anza upya na nyingine',
  },
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
  // Sélecteurs de date / heure (aucun date-picker natif).
  sel_date: { fr: 'Date', en: 'Date', sw: 'Tarehe' },
  sel_heure: { fr: 'Heure', en: 'Time', sw: 'Saa' },
  sel_aujourdhui: { fr: "Aujourd'hui", en: 'Today', sw: 'Leo' },
  sel_demain: { fr: 'Demain', en: 'Tomorrow', sw: 'Kesho' },
  sel_maintenant: {
    fr: 'Maintenant — pas de programmation',
    en: 'Now — no scheduling',
    sw: 'Sasa — bila kupanga',
  },
  sel_erreur_datetime: {
    fr: "Choisissez la date et l'heure de départ.",
    en: 'Choose the departure date and time.',
    sw: 'Chagua tarehe na saa ya kuondoka.',
  },

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
  statut_colis_cancelled: { fr: 'Annulé', en: 'Cancelled', sw: 'Umeghairiwa' },

  // --- Statuts d'annonce (rides) -------------------------------------------
  statut_ride_open: { fr: 'Ouvert', en: 'Open', sw: 'Wazi' },
  statut_ride_closed: { fr: 'Clôturé', en: 'Closed', sw: 'Imefungwa' },
  statut_ride_cancelled: { fr: 'Annulé', en: 'Cancelled', sw: 'Imeghairiwa' },

  // --- Types de course -----------------------------------------------------
  type_trajet_private: { fr: 'Course privée', en: 'Private ride', sw: 'Safari binafsi' },
  type_trajet_shared_tourist: {
    fr: 'Taxi partagé',
    en: 'Shared taxi',
    sw: 'Teksi ya pamoja',
  },
  type_trajet_shared_local: {
    fr: 'Taxi partagé local',
    en: 'Local shared taxi',
    sw: 'Teksi ya pamoja ya wenyeji',
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
  titre_equipe: { fr: 'Équipe zanziGo', en: 'zanziGo team', sw: 'Timu ya zanziGo' },
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
  courses_colis_titre: {
    fr: 'Colis à ramasser',
    en: 'Parcels to pick up',
    sw: 'Mizigo ya kuchukua',
  },
  courses_colis_vide: {
    fr: 'Aucun colis en attente de ramassage pour le moment — les envois payés des hôtels et des clients apparaîtront ici.',
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
    fr: 'Aucun compte hôtel en attente de vérification.',
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
  equipe_abonnes_titre: { fr: 'Nos abonnés', en: 'Our subscribers', sw: 'Wanachama wetu' },
  equipe_abonnes_clients: { fr: 'Clients', en: 'Clients', sw: 'Wateja' },
  equipe_abonnes_locaux: { fr: 'Locaux', en: 'Locals', sw: 'Wazawa' },
  equipe_abonnes_hotels: { fr: 'Hôtels', en: 'Hotels', sw: 'Hoteli' },
  equipe_ca_titre: { fr: "Chiffre d'affaires", en: 'Revenue', sw: 'Mapato' },
  equipe_ca_net: { fr: 'Net zanziGo', en: 'zanziGo net', sw: 'Halisi zanziGo' },
  equipe_ca_ouvrir: { fr: '7 j · 30 j ›', en: '7 d · 30 d ›', sw: 'Siku 7 · 30 ›' },
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
  colis_masquer: { fr: 'Pas intéressé', en: 'Not interested', sw: 'Sivutiwi' },
  colis_masquer_titre: { fr: 'Masquer ce colis ?', en: 'Hide this parcel?', sw: 'Kuficha mzigo huu?' },
  colis_masquer_texte: {
    fr: "Il ne s'affichera plus dans votre liste, mais restera proposé aux autres chauffeurs.",
    en: 'It will no longer appear in your list, but stays available to other drivers.',
    sw: 'Hautaonekana tena kwenye orodha yako, lakini utabaki kwa madereva wengine.',
  },
  colis_masquer_confirmer: { fr: 'Masquer', en: 'Hide', sw: 'Ficha' },
  colis_reafficher: {
    fr: 'Réafficher les colis masqués ({n})',
    en: 'Show hidden parcels again ({n})',
    sw: 'Onyesha tena mizigo iliyofichwa ({n})',
  },
  titre_colis_dispo: { fr: 'Colis à ramasser', en: 'Parcel to pick up', sw: 'Mzigo wa kuchukua' },
  colis_dispo_intro: {
    fr: 'Premier arrivé, premier servi : touchez « Je prends la livraison » pour la réserver, puis scannez le code QR collé sur le colis au ramassage. Les coordonnées du destinataire apparaissent après le scan.',
    en: 'First come, first served: tap “I’ll take this delivery” to reserve it, then scan the QR code on the parcel at pickup. Recipient details appear after the scan.',
    sw: 'Wa kwanza kufika, wa kwanza kuhudumiwa: gusa « Nachukua usafirishaji » kuihifadhi, kisha skani QR iliyo kwenye mzigo unapochukua. Maelezo ya mpokeaji yanaonekana baada ya skani.',
  },
  colis_prendre: { fr: '✅ Je prends la livraison', en: '✅ I’ll take this delivery', sw: '✅ Nachukua usafirishaji' },
  colis_prendre_court: { fr: 'Je prends', en: 'Take it', sw: 'Nachukua' },
  colis_prendre_confirmer: { fr: 'Je prends', en: 'Take it', sw: 'Nachukua' },
  colis_prendre_titre: { fr: 'Prendre cette livraison ?', en: 'Take this delivery?', sw: 'Kuchukua usafirishaji huu?' },
  colis_prendre_texte: {
    fr: 'Elle vous sera réservée — les autres chauffeurs ne la verront plus. Au ramassage, scannez le code QR collé sur le colis.',
    en: 'It will be reserved for you — other drivers will no longer see it. At pickup, scan the QR code on the parcel.',
    sw: 'Utahifadhiwa kwako — madereva wengine hawataiona tena. Unapochukua, skani QR iliyo kwenye mzigo.',
  },
  colis_prendre_ok: {
    fr: 'Livraison réservée ! Retrouvez-la dans « Mes colis à livrer ».',
    en: 'Delivery reserved! Find it under “My parcels to deliver”.',
    sw: 'Usafirishaji umehifadhiwa! Uone kwenye « Mizigo yangu ya kupeleka ».',
  },
  colis_pris_trop_tard: {
    fr: 'Trop tard — un autre chauffeur a déjà pris cette livraison.',
    en: 'Too late — another driver already took this delivery.',
    sw: 'Umechelewa — dereva mwingine tayari amechukua usafirishaji huu.',
  },
  courses_mes_colis: { fr: 'Mes colis à livrer', en: 'My parcels to deliver', sw: 'Mizigo yangu ya kupeleka' },
  colis_dispo_enlevement: { fr: 'Enlèvement', en: 'Pickup', sw: 'Kuchukua' },
  colis_dispo_livraison: { fr: 'Livraison', en: 'Delivery', sw: 'Uwasilishaji' },
  colis_dispo_taille: { fr: 'Taille', en: 'Size', sw: 'Ukubwa' },
  colis_dispo_description: { fr: 'Description', en: 'Description', sw: 'Maelezo' },
  colis_dispo_publie: { fr: 'Publié', en: 'Posted', sw: 'Imetangazwa' },
  colis_dispo_prix: { fr: 'Prix payé par le client', en: 'Price paid by the client', sw: 'Bei aliyolipa mteja' },
  colis_dispo_introuvable_titre: {
    fr: 'Colis plus disponible',
    en: 'Parcel no longer available',
    sw: 'Mzigo haupatikani tena',
  },
  colis_dispo_introuvable_texte: {
    fr: "Il a déjà été pris par un autre chauffeur, ou la demande a expiré (48 h).",
    en: 'It was already taken by another driver, or the request expired (48 h).',
    sw: 'Tayari umechukuliwa na dereva mwingine, au ombi limeisha muda (saa 48).',
  },
  annonces_historique: { fr: 'Historique', en: 'History', sw: 'Historia' },
  annonces_ouvertes: { fr: 'Annonces en ligne', en: 'Live listings', sw: 'Matangazo hewani' },
  annonces_regle_retard: {
    fr: 'Heure de départ dépassée de plus de 10 minutes = annonce automatiquement annulée. Pensez à clôturer votre annonce quand vous partez.',
    en: 'Departure time passed by more than 10 minutes = listing automatically cancelled. Remember to close your listing when you leave.',
    sw: 'Muda wa kuondoka ukipita kwa zaidi ya dakika 10 = tangazo linaghairiwa kiotomatiki. Kumbuka kufunga tangazo lako unapoondoka.',
  },
  rides_regle_retard: {
    fr: 'Paiement sous 5 minutes : au-delà, la réservation s\'annule automatiquement et les places sont remises en vente. Ponctualité : plus de 10 minutes de retard au départ = place considérée comme annulée et due en intégralité au chauffeur — par respect pour les autres voyageurs.',
    en: 'Pay within 5 minutes: after that, the booking cancels automatically and the seats go back on sale. Punctuality: more than 10 minutes late at departure = seat considered cancelled and owed in full to the driver — out of respect for the other travellers.',
    sw: 'Lipa ndani ya dakika 5: baada ya hapo, uhifadhi unaghairiwa kiotomatiki na viti vinarudishwa sokoni. Uwakati: kuchelewa zaidi ya dakika 10 wakati wa kuondoka = kiti kinahesabiwa kimeghairiwa na kinadaiwa kikamilifu kwa dereva — kwa heshima ya wasafiri wengine.',
  },

  // --- Fidélité + crédit prépayé (hôtels) -----------------------------------------
  fidelite_titre: { fr: 'Carte de fidélité', en: 'Loyalty card', sw: 'Kadi ya uaminifu' },
  fidelite_bons_dispo: {
    fr: '{n} bon(s) colis offert(s)',
    en: '{n} free parcel voucher(s)',
    sw: 'Vocha {n} za mzigo bure',
  },
  fidelite_progression: {
    fr: '{n} / {total} courses vers le prochain bon',
    en: '{n} / {total} rides towards the next voucher',
    sw: 'Safari {n} / {total} kuelekea vocha ijayo',
  },
  fidelite_regle: {
    fr: 'Toutes les 20 courses terminées avec zanziGo, vous gagnez un bon — à dépenser AU CHOIX : un envoi de colis OFFERT (au moment de créer le colis) ou 10 $ versés sur votre crédit zanziGo.',
    en: 'Every 20 completed rides with zanziGo, you earn a voucher — spend it YOUR way: a FREE parcel delivery (when creating the parcel) or $10 added to your zanziGo credit.',
    sw: 'Kila safari 20 zilizokamilika na zanziGo, unapata vocha — itumie UPENDAVYO: usafirishaji wa mzigo BURE (unapotengeneza mzigo) au $10 kwenye salio lako la zanziGo.',
  },
  fidelite_convertir: {
    fr: '💵 Convertir un bon en {montant} $ de crédit',
    en: '💵 Convert a voucher into ${montant} credit',
    sw: '💵 Badilisha vocha kuwa salio la ${montant}',
  },
  fidelite_convertir_titre: {
    fr: 'Convertir un bon',
    en: 'Convert a voucher',
    sw: 'Badilisha vocha',
  },
  fidelite_convertir_confirm: {
    fr: 'Transformer un bon fidélité en {montant} $ de crédit zanziGo ? Le bon ne pourra plus servir pour un colis offert.',
    en: 'Turn one loyalty voucher into ${montant} of zanziGo credit? The voucher can no longer be used for a free parcel.',
    sw: 'Badilisha vocha moja kuwa salio la ${montant} la zanziGo? Vocha haitaweza kutumika tena kwa mzigo bure.',
  },
  credit_titre: { fr: 'Mon crédit zanziGo', en: 'My zanziGo credit', sw: 'Salio langu la zanziGo' },
  credit_solde: { fr: 'Solde disponible', en: 'Available balance', sw: 'Salio lililopo' },
  credit_explication: {
    fr: 'Rechargez votre compte auprès de l\'équipe (mobile money, espèces, virement) et payez ensuite chaque course ou colis en un seul geste, sans sortir le téléphone du client.',
    en: 'Top up your account with the team (mobile money, cash, transfer) and then pay every ride or parcel in one tap.',
    sw: 'Jaza akaunti yako kupitia timu (mobile money, taslimu, uhamisho) kisha ulipe kila safari au mzigo kwa mguso mmoja.',
  },
  credit_recharger: { fr: 'Recharger mon crédit', en: 'Top up my credit', sw: 'Jaza salio langu' },
  trip_payer_credit: {
    fr: '💳 Payer avec mon crédit',
    en: '💳 Pay with my credit',
    sw: '💳 Lipa kwa salio langu',
  },
  ncolis_bon_proposer: {
    fr: '🎁 Utiliser un bon colis offert ({n} disponible(s)) — envoi gratuit',
    en: '🎁 Use a free parcel voucher ({n} available) — free delivery',
    sw: '🎁 Tumia vocha ya mzigo bure ({n} zipo) — usafirishaji bure',
  },
  ncolis_bon_actif: {
    fr: '🎁 Bon appliqué : cet envoi est OFFERT. Touchez pour retirer.',
    en: '🎁 Voucher applied: this delivery is FREE. Tap to remove.',
    sw: '🎁 Vocha imetumika: usafirishaji huu ni BURE. Gusa kuondoa.',
  },
  ncolis_offert: { fr: 'OFFERT', en: 'FREE', sw: 'BURE' },
  equipe_credit_titre: {
    fr: 'Crédit des hôtels partenaires',
    en: 'Partner hotel credit',
    sw: 'Salio la hoteli washirika',
  },
  equipe_credit_conseil: {
    fr: 'Créditez un hôtel APRÈS avoir reçu son argent (mobile money, espèces). Un montant négatif corrige une erreur.',
    en: 'Credit a hotel AFTER receiving its money (mobile money, cash). A negative amount fixes a mistake.',
    sw: 'Ongeza salio la hoteli BAADA ya kupokea pesa yake (mobile money, taslimu). Kiasi hasi hurekebisha kosa.',
  },
  equipe_credit_montant: { fr: 'Montant (USD)', en: 'Amount (USD)', sw: 'Kiasi (USD)' },
  equipe_crediter: { fr: 'Créditer', en: 'Credit', sw: 'Ongeza salio' },
  equipe_action_erreur: {
    fr: "L'action a échoué — réessayez.",
    en: 'The action failed — try again.',
    sw: 'Hatua imeshindikana — jaribu tena.',
  },
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
    fr: 'Prix en USD',
    en: 'Prices in USD',
    sw: 'Bei kwa USD',
  },
  accueil_local_titre: {
    fr: 'Locaux · Carte tanzanienne',
    en: 'Locals · Tanzanian ID',
    sw: 'Wazawa · Kitambulisho cha NIDA',
  },
  accueil_local_soustitre: {
    fr: 'Prix en TZS',
    en: 'Prices in TZS',
    sw: 'Bei kwa TZS',
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
  accueil_confiance: {
    fr: 'Tous nos chauffeurs sont vérifiés et disposent de tous les papiers en règle',
    en: 'All our drivers are verified and fully licensed',
    sw: 'Madereva wetu wote wamethibitishwa na wana nyaraka zote halali',
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
    fr: 'Créez le compte de votre établissement pour réserver des taxis pour vos clients et envoyer leurs colis — tarif touriste avec −5 % partenaire.',
    en: 'Create your property account to book taxis for your guests and send their parcels — tourist rates with a 5% partner discount.',
    sw: 'Fungua akaunti ya hoteli yako kuweka teksi kwa wageni wako na kutuma mizigo yao — bei ya watalii ukiwa na punguzo la 5%.',
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
    fr: 'Mode hôtel — réservez un taxi pour votre client : tarif touriste avec −5 % partenaire.',
    en: 'Hotel mode — book a taxi for your guest: tourist rate with a 5% partner discount.',
    sw: 'Hali ya hoteli — weka teksi kwa mteja wako: bei ya watalii ukiwa na punguzo la 5%.',
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
    fr: 'Une place dans un taxi partagé.',
    en: 'A seat in a shared taxi.',
    sw: 'Kiti kwenye teksi ya pamoja.',
  },
  reserver_precision: {
    fr: 'Précision (hôtel, adresse…) — optionnel',
    en: 'Details (hotel, address…) — optional',
    sw: 'Maelezo (hoteli, anwani…) — hiari',
  },
  reserver_precision_placeholder: {
    fr: 'Ex. : hôtel Ocean View, chambre 12',
    en: 'E.g. Ocean View hotel, room 12',
    sw: 'Mf. hoteli Ocean View, chumba 12',
  },
  reserver_special_info: {
    fr: 'Tarif spécial {depart} ↔ {arrivee} appliqué. Indiquez le lieu exact au chauffeur via WhatsApp.',
    en: 'Special {depart} ↔ {arrivee} fare applied. Share the exact spot with the driver on WhatsApp.',
    sw: 'Bei maalum ya {depart} ↔ {arrivee} imetumika. Mweleze dereva mahali kamili kupitia WhatsApp.',
  },
  reserver_partage_info: {
    fr: 'En mode Partagé, réservez votre place sur un trajet posté par un chauffeur — choisissez ci-dessous.',
    en: 'In Shared mode, book a seat on a driver-posted ride — pick one below.',
    sw: 'Katika hali ya Pamoja, hifadhi kiti kwenye safari iliyotangazwa na dereva — chagua hapa chini.',
  },
  reserver_clim: {
    fr: 'Climatisation incluse',
    en: 'Air conditioning included',
    sw: 'Kiyoyozi kimejumuishwa',
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
    fr: 'Programmer le départ (optionnel)',
    en: 'Schedule departure (optional)',
    sw: 'Panga kuondoka (hiari)',
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
  reserver_erreur_local_only: {
    fr: 'Le taxi partagé local est réservé aux locaux vérifiés (carte tanzanienne).',
    en: 'The local shared taxi is reserved for verified locals (Tanzanian ID).',
    sw: 'Teksi ya pamoja ya wenyeji ni kwa wazawa waliothibitishwa tu (kitambulisho cha NIDA).',
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
  rides_complet: { fr: 'Complet', en: 'Full', sw: 'Imejaa' },
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
  rides_reserver: { fr: 'Réserver', en: 'Book', sw: 'Hifadhi' },
  rides_reservation_ok: {
    fr: 'Réservation confirmée ({n} place·s) — envoyez le message WhatsApp qui s\'ouvre pour prévenir l\'équipe. 🎉',
    en: 'Booking confirmed ({n} seat·s) — send the WhatsApp message that opens to notify the team. 🎉',
    sw: 'Uhifadhi umethibitishwa (viti {n}) — tuma ujumbe wa WhatsApp unaofunguka kuijulisha timu. 🎉',
  },
  rides_erreur_places: {
    fr: 'Plus assez de places disponibles sur ce trajet.',
    en: 'Not enough seats left on this ride.',
    sw: 'Viti havitoshi tena kwenye safari hii.',
  },
  rides_erreur_ferme: {
    fr: 'Ce trajet n\'est plus ouvert à la réservation.',
    en: 'This ride is no longer open for booking.',
    sw: 'Safari hii haipokei uhifadhi tena.',
  },
  rides_erreur_reservation: {
    fr: 'Réservation impossible pour le moment — réessayez.',
    en: 'Booking failed for now — try again.',
    sw: 'Uhifadhi umeshindikana kwa sasa — jaribu tena.',
  },

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
  trip_verifier_paiement: {
    fr: "J'ai payé — vérifier le paiement",
    en: "I've paid — verify payment",
    sw: 'Nimelipa — hakiki malipo',
  },
  trip_annuler: { fr: 'Annuler la course', en: 'Cancel the ride', sw: 'Ghairi safari' },
  trip_annuler_confirm: {
    fr: 'Annuler cette course ?',
    en: 'Cancel this ride?',
    sw: 'Ughairi safari hii?',
  },
  commun_confirmer_oui: { fr: 'Oui, annuler', en: 'Yes, cancel', sw: 'Ndiyo, ghairi' },
  commun_confirmer_non: { fr: 'Non, garder', en: 'No, keep it', sw: 'Hapana, baki nayo' },
  commun_annulation_impossible: {
    fr: "Annulation impossible pour le moment.",
    en: 'Cancellation is not possible right now.',
    sw: 'Kughairi hakuwezekani kwa sasa.',
  },
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
    fr: 'Ex. : Stone Town, Kenyatta Road, en face de la pharmacie',
    en: 'E.g. Stone Town, Kenyatta Road, opposite the pharmacy',
    sw: 'Mf. Stone Town, Kenyatta Road, mkabala na duka la dawa',
  },
  ncolis_livraison: { fr: 'Lieu de livraison', en: 'Delivery location', sw: 'Mahali pa kufikisha' },
  ncolis_livraison_placeholder: {
    fr: 'Ex. : Paje, guesthouse Baraka, à la réception',
    en: 'E.g. Paje, Baraka guesthouse, at the reception',
    sw: 'Mf. Paje, nyumba ya wageni Baraka, mapokezi',
  },
  ncolis_section_destinataire: { fr: 'Destinataire', en: 'Recipient', sw: 'Mpokeaji' },
  ncolis_nom_dest: { fr: 'Nom du destinataire', en: 'Recipient name', sw: 'Jina la mpokeaji' },
  ncolis_nom_dest_placeholder: { fr: 'Ex. : Juma Ali', en: 'E.g. Juma Ali', sw: 'Mf. Juma Ali' },
  ncolis_tel_dest: { fr: 'Téléphone du destinataire', en: 'Recipient phone', sw: 'Simu ya mpokeaji' },
  ncolis_description_opt: {
    fr: 'Contenu / instructions (optionnel)',
    en: 'Contents / instructions (optional)',
    sw: 'Yaliyomo / maelekezo (hiari)',
  },
  ncolis_description_placeholder: {
    fr: 'Ex. : documents, fragile, appeler en arrivant…',
    en: 'E.g. documents, fragile, call on arrival…',
    sw: 'Mf. nyaraka, dhaifu, piga simu ukifika…',
  },
  ncolis_tel_expediteur: {
    fr: 'Votre numéro (pour la ramasse)',
    en: 'Your phone (for pickup)',
    sw: 'Namba yako (kwa kuchukua)',
  },
  ncolis_erreur_tel_expediteur: {
    fr: 'Votre numéro doit être au format international (+255…).',
    en: 'Your number must be in international format (+255…).',
    sw: 'Namba yako iwe katika muundo wa kimataifa (+255…).',
  },
  colis_appeler_expediteur: { fr: "📞 Appeler l'expéditeur", en: '📞 Call the sender', sw: '📞 Mpigie mtumaji' },
  colis_appeler_destinataire: { fr: '📞 Appeler le destinataire', en: '📞 Call the recipient', sw: '📞 Mpigie mpokeaji' },
  ncolis_quand: { fr: 'Quand ramasser le colis ?', en: 'When to pick up the parcel?', sw: 'Lini kuchukua mzigo?' },
  ncolis_asap: { fr: 'Dès que possible', en: 'As soon as possible', sw: 'Haraka iwezekanavyo' },
  colis_dispo_ramassage: { fr: 'À ramasser', en: 'Pick up', sw: 'Kuchukuliwa' },
  ncolis_taille_titre: { fr: 'Taille du colis', en: 'Parcel size', sw: 'Ukubwa wa mzigo' },
  ncolis_taille_petit: { fr: 'Petit', en: 'Small', sw: 'Ndogo' },
  ncolis_taille_petit_ex: {
    fr: 'Enveloppe, clés, passeport, documents, médicaments',
    en: 'Envelope, keys, passport, documents, medicine',
    sw: 'Bahasha, funguo, pasipoti, nyaraka, dawa',
  },
  ncolis_taille_moyen: { fr: 'Moyen', en: 'Medium', sw: 'Wastani' },
  ncolis_taille_moyen_ex: {
    fr: 'Sac à dos, petit carton, bouteilles, épices',
    en: 'Backpack, small box, bottles, spices',
    sw: 'Begi la mgongoni, kasha dogo, chupa, viungo',
  },
  ncolis_taille_grand: { fr: 'Grand', en: 'Large', sw: 'Kubwa' },
  ncolis_taille_grand_ex: {
    fr: 'Grosse valise, caisse de ravitaillement',
    en: 'Large suitcase, supply crate',
    sw: 'Sanduku kubwa, kreti la vifaa',
  },
  ncolis_erreur_taille: {
    fr: 'Choisissez la taille du colis.',
    en: 'Choose the parcel size.',
    sw: 'Chagua ukubwa wa mzigo.',
  },
  ncolis_paye_expediteur: {
    fr: "Payé en ligne à 100 % par l'expéditeur",
    en: 'Paid 100% online by the sender',
    sw: 'Hulipwa mtandaoni 100% na mtumaji',
  },
  dcolis_taille: { fr: 'Taille', en: 'Size', sw: 'Ukubwa' },
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
  dcolis_annuler: { fr: "Annuler l'envoi", en: 'Cancel this delivery', sw: 'Ghairi utumaji' },
  dcolis_annuler_confirm: {
    fr: 'Annuler cet envoi de colis ?',
    en: 'Cancel this parcel delivery?',
    sw: 'Ughairi utumaji huu wa mzigo?',
  },
  dcolis_partager: { fr: 'Partager le suivi', en: 'Share tracking', sw: 'Shiriki ufuatiliaji' },
  dcolis_position_bouton: {
    fr: 'Voir la position du chauffeur 📍',
    en: 'See driver location 📍',
    sw: 'Ona mahali dereva alipo 📍',
  },
  dcolis_position_maj: {
    fr: 'Position du chauffeur : {quand} — elle s\'ouvre dans votre app de cartes.',
    en: 'Driver location: {quand} — it opens in your maps app.',
    sw: 'Mahali pa dereva: {quand} — inafunguka kwenye programu yako ya ramani.',
  },
  dcolis_position_indispo: {
    fr: "Le chauffeur n'a pas encore partagé sa position — réessayez dans une minute.",
    en: "The driver hasn't shared their location yet — try again in a minute.",
    sw: 'Dereva bado hajashiriki mahali alipo — jaribu tena baada ya dakika.',
  },
  dcolis_partage_message: {
    fr: 'Suivi de votre colis zanziGo 📦\nTrajet : {trajet}\nCode : {qr}\nStatut : {statut}\nPrésentez ce code au chauffeur à la livraison.',
    en: 'Your zanziGo parcel tracking 📦\nRoute: {trajet}\nCode: {qr}\nStatus: {statut}\nShow this code to the driver on delivery.',
    sw: 'Ufuatiliaji wa mzigo wako wa zanziGo 📦\nNjia: {trajet}\nMsimbo: {qr}\nHali: {statut}\nOnyesha msimbo huu kwa dereva wakati wa kufikisha.',
  },
  dcolis_payer_whatsapp: { fr: 'Payer via WhatsApp', en: 'Pay via WhatsApp', sw: 'Lipa kupitia WhatsApp' },
  dcolis_whatsapp_aide: {
    fr: "L'équipe vous enverra le lien de paiement sur WhatsApp.",
    en: 'The team will send you the payment link on WhatsApp.',
    sw: 'Timu itakutumia kiungo cha malipo kwenye WhatsApp.',
  },
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
  hotel_attente_verif: {
    fr: "Compte hôtel en attente de vérification : l'équipe zanziGo va contacter votre établissement (téléphone ou WhatsApp) pour confirmer l'inscription. Les réservations seront débloquées juste après.",
    en: 'Hotel account awaiting verification: the zanziGo team will contact your property (phone or WhatsApp) to confirm the signup. Bookings unlock right after.',
    sw: 'Akaunti ya hoteli inasubiri uthibitisho: timu ya zanziGo itawasiliana na hoteli yako (simu au WhatsApp) kuthibitisha usajili. Uhifadhi utafunguliwa mara baada ya hapo.',
  },
  hotel_refuse_verif: {
    fr: "Ce compte hôtel a été bloqué par l'équipe zanziGo. Contactez-nous sur WhatsApp si c'est une erreur.",
    en: 'This hotel account was blocked by the zanziGo team. Contact us on WhatsApp if this is a mistake.',
    sw: 'Akaunti hii ya hoteli imezuiwa na timu ya zanziGo. Wasiliana nasi kwa WhatsApp ikiwa ni kosa.',
  },
  hotel_ajouter_bouton: {
    fr: 'Inscrire un autre hôtel',
    en: 'Register another hotel',
    sw: 'Sajili hoteli nyingine',
  },

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
  courses_recentes: { fr: 'Mes courses', en: 'My rides', sw: 'Safari zangu' },
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
  titre_annonce: { fr: 'Mon trajet publié', en: 'My posted ride', sw: 'Safari yangu' },
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
  gain_commission: { fr: 'Commission zanziGo', en: 'zanziGo commission', sw: 'Kamisheni ya zanziGo' },
  gain_net: { fr: 'Votre gain net', en: 'Your net earnings', sw: 'Mapato yako halisi' },
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
  gain_net_par_place: { fr: 'net', en: 'net', sw: 'halisi' },
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
  resa_payee: { fr: 'payée', en: 'paid', sw: 'imelipwa' },
  resa_impayee: { fr: 'à encaisser', en: 'to collect', sw: 'inasubiri malipo' },
  equipe_paiement_place: {
    fr: '🚌 Taxi partagé · {n} place(s)',
    en: '🚌 Shared taxi · {n} seat(s)',
    sw: '🚌 Teksi ya pamoja · kiti {n}',
  },
  resa_type_tourist: { fr: 'touriste', en: 'tourist', sw: 'mtalii' },
  resa_type_resident: { fr: 'résident', en: 'resident', sw: 'mkazi' },
  resa_type_local: { fr: 'local', en: 'local', sw: 'mzawa' },
  resa_type_hotel: { fr: 'hôtel', en: 'hotel', sw: 'hoteli' },
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
  compte_badge_verifie: { fr: 'Chauffeur vérifié ✓', en: 'Verified driver ✓', sw: 'Dereva amethibitishwa ✓' },
  compte_badge_attente: { fr: 'En attente de validation', en: 'Awaiting validation', sw: 'Inasubiri uthibitisho' },
  compte_badge_refuse: { fr: 'Candidature refusée', en: 'Application declined', sw: 'Maombi yamekataliwa' },
  compte_avis: { fr: '★ {note} ({n} avis)', en: '★ {note} ({n} reviews)', sw: '★ {note} (maoni {n})' },
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
        const memorisee = await lireStockage(CLE_LANGUE);
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

// ---------------------------------------------------------------------------
// Sélecteurs de date / heure de départ (menus déroulants, aucun date-picker
// natif) : dates = aujourd'hui + 7 jours, heures = 05:00 → 22:00 par 30 min.
// ---------------------------------------------------------------------------

const LOCALES_INTL: Record<Langue, string> = { fr: 'fr-FR', en: 'en-GB', sw: 'sw-TZ' };

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
 * Libellés des dates proposées, dans la langue active : Aujourd'hui, Demain,
 * puis les 6 jours suivants formatés (ex. « ven. 14 août »). L'index dans la
 * liste correspond au décalage en jours par rapport à aujourd'hui.
 */
export function libellesDates(t: FonctionT, langue: Langue): string[] {
  const libelles = [t('sel_aujourdhui'), t('sel_demain')];
  for (let i = 2; i <= 7; i += 1) {
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
 * Combine un libellé de date (issu de libellesDates) et une heure « HH:MM »
 * en ISO 8601 (heure locale de l'appareil), ou null si la sélection est
 * incomplète ou inconnue.
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
