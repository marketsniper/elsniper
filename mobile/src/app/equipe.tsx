// Tableau de bord équipe : protégé par la clé secrète (X-Admin-Key), sans
// compte client. Six sections d'action :
//  1. Courses « Demandées » → choisir un chauffeur vérifié et le confirmer ;
//  2. Paiements en attente → « Marquer payé » après réception de l'argent
//     (lien manuel WhatsApp/PayPal) ;
//  3. Candidatures chauffeurs → documents + Valider / Refuser (le QR véhicule
//     est généré à la validation) ;
//  4. Comptes résidents/locaux → document + Valider / Refuser ;
//  5. Hôtels à vérifier → appeler l'établissement puis Valider / Refuser ;
//  6. Mes taxis → tous les chauffeurs vérifiés, dernière position GPS
//     (lien Google Maps) et radiation avec confirmation.
// La clé est persistée localement et vérifiée par un premier appel.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  activerAlertes,
  desactiverAlertes,
  ecouterAlertes,
  etatAlertes,
  surIphoneSansInstallation,
  type EtatAlertes,
} from '@/lib/alertesPush';
import { ecrireStockage, lireStockage, supprimerStockage } from '@/lib/stockage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, Text, View } from 'react-native';

import { Selecteur } from '@/components/Selecteur';
import { VisionneuseDocument } from '@/components/VisionneuseDocument';
import {
  Badge,
  BadgeStatutTrajet,
  Bouton,
  Carte,
  Champ,
  ChargementCentre,
  Ecran,
  EncartInfo,
  LigneInfo,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { CartePosition } from '@/components/CartePosition';
import {
  api,
  definirCleEquipe,
  ErreurApi,
  type AnnoncePartageEquipe,
  type AttentePartage,
  type DemandeRecharge,
  type StatsAbonnes,
} from '@/lib/api';
import { formaterDateRelativeI18n, libelleTypeTrajet, useT, type CleChaine } from '@/lib/i18n';
import { FamilleMenu, LigneMenu } from '@/components/CaseMenu';
import { useRafraichissementAuto } from '@/lib/rafraichissementAuto';
import { couleurs, espaces, ombres, rayons, stylesReactifs } from '@/lib/theme';
import {
  champ,
  dureeRouteMinutes,
  formaterDate,
  formaterMontant,
  formaterPrix,
  kmEntreVilles,
  totalEnTzs,
  trajetExpire,
  type Chauffeur,
  type Hotel,
  type PaiementEquipe,
  type StatutTrajet,
  type Trajet,
  type TypeTrajet,
  type Utilisateur,
} from '@/lib/types';

const CLE_STOCKAGE = 'zanzigo.cle_equipe';

// Rubriques du tableau de bord — le menu est une grille de cases (comme un
// écran d'accueil de téléphone), chaque case ouvre sa rubrique.
type SectionEquipe =
  | 'courses'
  | 'encours'
  | 'avenir'
  | 'partages'
  | 'paiements'
  | 'recharges'
  | 'candidatures'
  | 'comptes'
  | 'hotels'
  | 'taxis'
  | 'clients'
  | 'locaux'
  | 'attentes';

// Ce que le partenaire a annoncé comme moyen de paiement — c'est ce que
// l'équipe va aller vérifier avant de créditer.
const MOYEN_RECHARGE: Record<string, CleChaine> = {
  mobile_money: 'recharge_moyen_mobile',
  cash: 'recharge_moyen_especes',
  bank: 'recharge_moyen_virement',
  card: 'recharge_moyen_carte',
};

// Libellé d'un chauffeur dans le sélecteur d'assignation.
function libelleChauffeur(chauffeur: Chauffeur): string {
  const nom = champ<string>(chauffeur, 'full_name', 'fullName') ?? '?';
  const plaque = champ<string>(chauffeur, 'vehicle_plate', 'vehiclePlate');
  return plaque ? `${nom} · ${plaque}` : nom;
}

export default function EcranEquipe() {
  const { t, langue } = useT();
  const router = useRouter();
  // null = lecture du stockage en cours ; '' = pas de clé enregistrée.
  const [cle, setCle] = useState<string | null>(null);
  const [saisie, setSaisie] = useState('');
  const [chargeActivation, setChargeActivation] = useState(false);
  const [erreur, setErreur] = useState('');

  const [courses, setCourses] = useState<Trajet[]>([]);
  const [paiements, setPaiements] = useState<PaiementEquipe[]>([]);
  // Remboursements à verser (annulations clients, barème 24/48 h) et
  // derniers paiements REÇUS (dont ceux payés par crédit hôtel).
  const [remboursements, setRemboursements] = useState<PaiementEquipe[]>([]);
  const [paiementsRecus, setPaiementsRecus] = useState<PaiementEquipe[]>([]);
  // Les demandes de recharge de crédit des partenaires, en attente d'argent
  // reçu. Elles n'existaient pas : « Recharger mon crédit » n'ouvrait qu'un
  // WhatsApp, et une demande pouvait ne jamais parvenir à l'équipe.
  const [recharges, setRecharges] = useState<DemandeRecharge[]>([]);
  const [candidats, setCandidats] = useState<Chauffeur[]>([]);
  const [clients, setClients] = useState<Utilisateur[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  // Compteurs d'abonnés (clients / locaux / hôtels) affichés en tête de menu.
  const [abonnes, setAbonnes] = useState<StatsAbonnes | null>(null);
  // Nombre de dossiers en attente de contrôle humain (file de vérification).
  const [verifsEnAttente, setVerifsEnAttente] = useState(0);
  // Véhicules de location pas encore vérifiés (même logique que verifsEnAttente).
  const [vehiculesPendants, setVehiculesPendants] = useState(0);
  // Rubrique ouverte (null = menu en grille de cases).
  const [section, setSection] = useState<SectionEquipe | null>(null);
  // Case chiffre d'affaires : repliée (jour seul) ou dépliée (7 j / 30 j).
  const [caOuvert, setCaOuvert] = useState(false);
  // Recherche de profils (rubriques Clients / Locaux) : radiation ciblée.
  const [recherche, setRecherche] = useState('');
  const [resultats, setResultats] = useState<Utilisateur[]>([]);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);
  const [rechercheFaite, setRechercheFaite] = useState(false);
  // Chauffeur choisi par course (libellé du sélecteur), avant confirmation.
  const [choixChauffeur, setChoixChauffeur] = useState<Record<string, string>>({});
  // Id de l'élément dont l'action est en cours (bouton en chargement).
  const [actionEnCours, setActionEnCours] = useState<string | null>(null);
  // Crédit prépayé : hôtels partenaires actifs + montant saisi par hôtel.
  const [hotelsVerifies, setHotelsVerifies] = useState<Hotel[]>([]);
  // Liste d'attente du taxi partagé : demandes clients à recontacter.
  const [attentes, setAttentes] = useState<AttentePartage[]>([]);
  const [partages, setPartages] = useState<AnnoncePartageEquipe[]>([]);
  // Dates d'expiration saisies par chauffeur (permis / assurance).
  // Sauvegarde de la base : téléchargement en cours.
  const [sauvegardeEnCours, setSauvegardeEnCours] = useState(false);
  // Courses passées : jours dépliés dans l'historique (repliés par défaut).
  const [joursOuverts, setJoursOuverts] = useState<Record<string, boolean>>({});
  // Courses à valider : fiche détaillée dépliée au clic (repliée par défaut).
  const [detailsCourse, setDetailsCourse] = useState<Record<string, boolean>>({});
  // Document affiché en plein écran (permis, assurance, carte NIDA…).
  const [documentOuvert, setDocumentOuvert] = useState<{ url: string; titre: string } | null>(null);
  // Alertes instantanées sur CE téléphone.
  const [etatPush, setEtatPush] = useState<EtatAlertes>('inactif');
  const [messageAlertes, setMessageAlertes] = useState('');
  // Référence vers le rechargement, utilisable avant sa définition.
  const chargerRef = useRef<(() => void) | null>(null);

  // État des alertes de ce téléphone, relu à chaque ouverture du tableau.
  useEffect(() => {
    etatAlertes().then(setEtatPush).catch(() => {});
  }, []);

  // Une alerte arrive alors que le tableau est ouvert : on recharge tout de
  // suite, sans attendre le rafraîchissement automatique.
  useEffect(() => ecouterAlertes(() => { chargerRef.current?.(); }), []);

  // try/finally sur les DEUX : Notification.requestPermission peut lever
  // (Safari ancien, contexte non sécurisé) et serviceWorker.ready ne résout
  // jamais sans service worker — sans le finally, le bouton restait en
  // chargement pour toujours, et « couper » acceptait les appuis en rafale.
  const allumerAlertes = async () => {
    setMessageAlertes('');
    setActionEnCours('alerte-on');
    try {
      const souci = await activerAlertes(t('alertes_nom_appareil'));
      setMessageAlertes(souci ?? t('alertes_ok'));
      setEtatPush(await etatAlertes());
    } catch {
      setMessageAlertes(t('alertes_indisponible'));
    } finally {
      setActionEnCours(null);
    }
  };

  const couperAlertes = async () => {
    setMessageAlertes('');
    setActionEnCours('alerte-off');
    try {
      await desactiverAlertes();
      setMessageAlertes(t('alertes_coupees'));
      setEtatPush(await etatAlertes());
    } catch {
      setMessageAlertes(t('alertes_indisponible'));
    } finally {
      setActionEnCours(null);
    }
  };

  const essayerAlerte = async () => {
    setMessageAlertes('');
    setActionEnCours('alerte-test');
    try {
      const resultat = await api.testerAlertes();
      setMessageAlertes(
        resultat.envoyes > 0 ? t('alertes_test_envoye', { n: String(resultat.envoyes) }) : t('alertes_test_vide')
      );
    } catch (e) {
      setMessageAlertes(e instanceof ErreurApi ? e.message : t('equipe_action_erreur'));
    } finally {
      setActionEnCours(null);
    }
  };

  const charger = useCallback(async () => {
    setErreur('');
    try {
      const [lesCourses, lesPaiements, lesCandidats, lesClients, lesHotels, lesChauffeurs, lesAbonnes, lesVerifies, lesRemboursements, lesRecus, lesAttentes, lesPartages, lesRecharges] =
        await Promise.all([
          api.listerCoursesEquipe(),
          api.listerPaiementsEquipe(),
          api.listerCandidaturesChauffeurs(),
          api.listerClientsEnAttente(),
          api.listerHotelsEnAttente(),
          api.listerChauffeursVerifies(),
          api.statsAbonnes().catch(() => null),
          api.listerHotelsVerifies().catch(() => []),
          api.listerRemboursementsEquipe().catch(() => []),
          api.listerPaiementsRecus().catch(() => []),
          api.listerAttentesPartage(true).catch(() => []),
          api.listerAnnoncesPartageEquipe().catch(() => []),
          api.fileRechargesCredit().catch(() => []),
        ]);
      // Compteur de la case « À vérifier » : silencieux s'il échoue, la case
      // affichera 0 plutôt que de faire tomber tout le tableau de bord.
      api
        .fileVerification()
        .then((file) => setVerifsEnAttente(file.total))
        .catch(() => setVerifsEnAttente(0));
      // Compteur de la case « Véhicules » : véhicules encore 'pending', même
      // logique silencieuse — la case affiche 0 plutôt que de tout bloquer.
      api
        .listerVehicules(true, 'pending')
        .then((vehicules) => setVehiculesPendants(vehicules.length))
        .catch(() => setVehiculesPendants(0));
      setCourses(lesCourses);
      setPaiements(lesPaiements);
      setCandidats(lesCandidats);
      setClients(lesClients);
      setHotels(lesHotels);
      setChauffeurs(lesChauffeurs);
      setAbonnes(lesAbonnes);
      setHotelsVerifies(lesVerifies);
      setRemboursements(lesRemboursements);
      setPaiementsRecus(lesRecus);
      setAttentes(lesAttentes);
      setPartages(lesPartages);
      setRecharges(lesRecharges);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('equipe_action_erreur'));
    }
  }, [t]);
  chargerRef.current = charger;

  // Pose les dates d'expiration permis/assurance d'un chauffeur (AAAA-MM-JJ).

  // Sauvegarde de la base : téléchargement JSON sur la version web ; sur
  // téléphone, on invite à passer par la version web (fichier volumineux).
  const telechargerLaSauvegarde = async () => {
    if (Platform.OS !== 'web') {
      Alert.alert(t('equipe_sauvegarde_titre'), t('equipe_sauvegarde_web'));
      return;
    }
    setSauvegardeEnCours(true);
    setErreur('');
    try {
      const donnees = await api.telechargerSauvegarde();
      const blob = new Blob([JSON.stringify(donnees, null, 1)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = `zanzigo-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
      lien.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('equipe_action_erreur'));
    } finally {
      setSauvegardeEnCours(false);
    }
  };

  // Lecture de la clé enregistrée au montage ; si présente, mode actif direct.
  useEffect(() => {
    (async () => {
      const enregistree = (await lireStockage(CLE_STOCKAGE)) ?? '';
      if (enregistree) definirCleEquipe(enregistree);
      setCle(enregistree);
    })();
  }, []);

  useEffect(() => {
    if (cle) charger();
  }, [cle, charger]);

  // Tableau vivant : compteurs, paiements et POSITIONS GPS des chauffeurs se
  // rafraîchissent tout seuls (les chauffeurs envoient leur position toutes
  // les 45 s — l'équipe les suit donc en quasi temps réel).
  useRafraichissementAuto(() => {
    if (cle) charger();
  }, 30000);

  const activer = async () => {
    const candidate = saisie.trim();
    if (!candidate) return;
    setChargeActivation(true);
    setErreur('');
    definirCleEquipe(candidate);
    try {
      await api.listerCoursesEquipe('requested');
      await ecrireStockage(CLE_STOCKAGE, candidate);
      setCle(candidate);
      setSaisie('');
    } catch (e) {
      definirCleEquipe(null);
      const nonAutorise =
        e instanceof ErreurApi && (e.status === 401 || e.status === 403);
      setErreur(nonAutorise ? t('equipe_cle_invalide') : e instanceof ErreurApi ? e.message : t('equipe_action_erreur'));
    } finally {
      setChargeActivation(false);
    }
  };

  const quitter = async () => {
    await supprimerStockage(CLE_STOCKAGE);
    definirCleEquipe(null);
    setCle('');
    // TOUT l'état du tableau se vide — pas seulement six listes : sinon la
    // personne suivante qui saisit une clé voit, le temps du rechargement,
    // le CA, les remboursements et la dernière recherche de profils du
    // passage précédent — et une pièce d'identité restée ouverte flottait
    // même par-dessus l'écran de saisie de la clé.
    setCourses([]);
    setPaiements([]);
    setRemboursements([]);
    setPaiementsRecus([]);
    setRecharges([]);
    setCandidats([]);
    setClients([]);
    setHotels([]);
    setChauffeurs([]);
    setAbonnes(null);
    setVerifsEnAttente(0);
    setVehiculesPendants(0);
    setSection(null);
    setCaOuvert(false);
    setRecherche('');
    setResultats([]);
    setRechercheFaite(false);
    setHotelsVerifies([]);
    setAttentes([]);
    setPartages([]);
    setJoursOuverts({});
    setDetailsCourse({});
    setDocumentOuvert(null);
  };

  // Enveloppe commune des actions : verrouille le bouton, recharge après.
  const agir = async (id: string, action: () => Promise<unknown>) => {
    setActionEnCours(id);
    setErreur('');
    try {
      await action();
      await charger();
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('equipe_action_erreur'));
    } finally {
      setActionEnCours(null);
    }
  };

  const confirmerChauffeur = (course: Trajet) => {
    const libelle = choixChauffeur[course.id];
    const chauffeur = chauffeurs.find((c) => libelleChauffeur(c) === libelle);
    if (!chauffeur) {
      setErreur(t('equipe_erreur_chauffeur'));
      return;
    }
    agir(course.id, () => api.assignerChauffeur(course.id, chauffeur.id));
  };

  // « 45 USD + 15 000 TZS » à partir d'un total par devise.
  const joindreMontants = (montants: Record<string, number>) =>
    Object.entries(montants)
      .map(([devise, montant]) => formaterMontant(montant, devise))
      .join(' + ');

  // Total d'un panier de gains EN SHILLINGS : les montants USD sont
  // convertis au taux zanziGo (même taux que la grille tarifaire).
  const gainEnTzs = totalEnTzs;

  // Ouverture d'une rubrique depuis le menu : remet la recherche à zéro.
  const ouvrirSection = (cle: SectionEquipe) => {
    setSection(cle);
    setRecherche('');
    setResultats([]);
    setRechercheFaite(false);
  };

  // Recherche de profils clients (nom ou téléphone) dans la rubrique active.
  const lancerRecherche = async (sectionActive: SectionEquipe | null = section) => {
    setRechercheEnCours(true);
    setErreur('');
    try {
      const types = sectionActive === 'locaux' ? 'local' : 'tourist,resident';
      setResultats(await api.rechercherProfils(recherche, types));
      setRechercheFaite(true);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('equipe_action_erreur'));
    } finally {
      setRechercheEnCours(false);
    }
  };

  // Radiation / réintégration d'un profil client (banned_at côté serveur).
  const basculerBlocageClient = async (profil: Utilisateur, bloquer: boolean) => {
    setActionEnCours(profil.id);
    setErreur('');
    try {
      await api.bannirClient(profil.id, bloquer);
      await lancerRecherche();
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('equipe_action_erreur'));
    } finally {
      setActionEnCours(null);
    }
  };

  const radierClient = (profil: Utilisateur) => {
    const nom = String(champ(profil, 'full_name', 'fullName') ?? '?');
    Alert.alert(t('equipe_radier_client_titre'), t('equipe_radier_client_texte', { nom }), [
      { text: t('commun_annuler'), style: 'cancel' },
      {
        text: t('equipe_radier_confirmer'),
        style: 'destructive',
        onPress: () => basculerBlocageClient(profil, true),
      },
    ]);
  };

  // Radiation d'un chauffeur qui ne respecte plus les normes zanziGo :
  // confirmation obligatoire (action forte — il disparaît des assignations
  // et ses annonces ouvertes sont fermées).

  if (cle === null) {
    return <ChargementCentre message="…" />;
  }

  // ----- Écran de saisie de la clé -----------------------------------------
  if (!cle) {
    return (
      <Ecran fond="vagues">
        <Carte>
          <Titre>{t('titre_equipe')}</Titre>
          <Text style={styles.explication}>{t('equipe_intro')}</Text>
          <Champ
            label={t('equipe_cle')}
            value={saisie}
            onChangeText={setSaisie}
            secureTextEntry
            autoCapitalize="none"
          />
          <TexteErreur>{erreur}</TexteErreur>
          <Bouton
            titre={t('equipe_activer')}
            icone="key-outline"
            onPress={activer}
            charge={chargeActivation}
          />
        </Carte>
      </Ecran>
    );
  }

  // Taxis classés par ville (zone) : tri alphabétique puis regroupement.
  const groupesTaxis: { ville: string; liste: Chauffeur[] }[] = [];
  for (const chauffeur of [...chauffeurs].sort((a, b) =>
    String(champ(a, 'zone') ?? '').localeCompare(String(champ(b, 'zone') ?? ''), 'fr')
  )) {
    const ville = String(champ(chauffeur, 'zone') ?? '—');
    const dernier = groupesTaxis[groupesTaxis.length - 1];
    if (dernier && dernier.ville === ville) dernier.liste.push(chauffeur);
    else groupesTaxis.push({ ville, liste: [chauffeur] });
  }

  // Courses : les demandes fraîches « à traiter » sont séparées des courses
  // PASSÉES (terminées, annulées, payées, demandes expirées), rangées par
  // jour — l'écran reste léger, l'historique se déplie à la demande.
  const dateCourse = (c: Trajet) =>
    String(champ(c, 'scheduled_at', 'scheduledAt', 'created_at', 'createdAt') ?? '');
  // L'heure à laquelle le chauffeur a appuyé sur « Démarrer la course ».
  // À défaut (vieille course, horodatage manquant) on retombe sur l'heure
  // prévue : mieux vaut une estimation qu'une ligne sans repère.
  const heureDepart = (c: Trajet) =>
    String(champ(c, 'started_at', 'startedAt') ?? dateCourse(c));
  const coursesATraiter = courses.filter(
    (c) => champ<StatutTrajet>(c, 'status', 'statut') === 'requested' && !trajetExpire(c)
  );
  // COURSES À VENIR : un départ programmé dans le futur n'est pas de
  // l'historique. Sans cette séparation, une course confirmée pour jeudi se
  // rangeait avec les courses terminées — invisible au moment où elle compte,
  // c'est-à-dire AVANT le départ. Les demandes encore sans chauffeur restent
  // en haut (« à traiter ») : elles appellent une action tout de suite.
  const maintenant = Date.now();
  const departFutur = (c: Trajet) => {
    const prevu = champ<string>(c, 'scheduled_at', 'scheduledAt');
    return !!prevu && new Date(prevu).getTime() > maintenant;
  };
  // Le planning est COMPLET : une demande programmée jeudi sans chauffeur y
  // figure aussi, avec son badge « en attente ». Elle reste par ailleurs en
  // haut dans « à traiter » — l'une est la liste de tâches, l'autre l'agenda,
  // et un agenda qui cache un rendez-vous ne sert à rien.
  const coursesAVenir = [...courses]
    .filter(
      (c) =>
        departFutur(c) &&
        !['completed', 'cancelled'].includes(champ<StatutTrajet>(c, 'status', 'statut') ?? '')
    )
    // Chronologique CROISSANT : le prochain départ en tête, c'est celui qui
    // arrive le premier sur la route.
    .sort((a, b) => dateCourse(a).localeCompare(dateCourse(b)));
  // « 181 min » ne se lit pas : au-delà de l'heure, on écrit « 3 h 01 ».
  const dureeLisible = (min: number) =>
    min < 60
      ? t('equipe_en_cours_min', { min: String(min) })
      : t('equipe_en_cours_heures', {
          h: String(Math.floor(min / 60)),
          min: String(min % 60).padStart(2, '0'),
        });

  // MINUTES ÉCOULÉES depuis que le chauffeur a démarré la course.
  const minutesDepuisDepart = (c: Trajet) => {
    const depart = new Date(heureDepart(c)).getTime();
    if (!Number.isFinite(depart)) return null;
    return Math.max(0, Math.round((maintenant - depart) / 60000));
  };
  // DURÉE ATTENDUE de la route, quand les deux villes sont dans la grille.
  const dureeAttendue = (c: Trajet) => {
    const km = kmEntreVilles(
      String(champ(c, 'pickup_location', 'pickupLocation') ?? ''),
      String(champ(c, 'dropoff_location', 'dropoffLocation') ?? '')
    );
    return km === null ? null : dureeRouteMinutes(km);
  };
  // COURSE QUI TRAÎNE : une demi-heure de plus que la route ne demande. Sur
  // l'île, trente minutes absorbent un arrêt d'eau, un troupeau de chèvres et
  // un client en retard ; au-delà, ça vaut un coup de fil au chauffeur.
  // Itinéraire hors grille : on retient une heure et demie par défaut.
  const courseEnRetard = (c: Trajet) => {
    const ecoule = minutesDepuisDepart(c);
    if (ecoule === null) return false;
    return ecoule > (dureeAttendue(c) ?? 90) + 30;
  };

  // COURSES EN COURS : le taxi a chargé les passagers, ils sont sur la route
  // en ce moment même. Elles tombaient jusqu'ici dans l'historique — une
  // course qui se fait rangée avec celles qui sont finies, invisible au seul
  // moment où l'équipe peut encore agir dessus.
  //
  // Tri par heure de départ CROISSANTE : celle qui roule depuis le plus
  // longtemps en tête. C'est celle-là qui peut avoir un problème.
  const coursesEnCours = [...courses]
    .filter((c) => champ<StatutTrajet>(c, 'status', 'statut') === 'in_progress')
    .sort((a, b) => heureDepart(a).localeCompare(heureDepart(b)));
  const coursesPassees = [...courses]
    .filter(
      (c) =>
        !coursesATraiter.includes(c) && !coursesAVenir.includes(c) && !coursesEnCours.includes(c)
    )
    .sort((a, b) => dateCourse(b).localeCompare(dateCourse(a)));
  const localeDate = langue === 'fr' ? 'fr-FR' : langue === 'sw' ? 'sw-TZ' : 'en-GB';
  // Clé stable AAAA-MM-JJ du jour (heure de Zanzibar).
  const cleJour = (c: Trajet) =>
    new Date(dateCourse(c)).toLocaleDateString('fr-CA', { timeZone: 'Africa/Dar_es_Salaam' });
  const libelleJour = (jour: string) => {
    const aujourdHui = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Dar_es_Salaam' });
    const hier = new Date(Date.now() - 86400000).toLocaleDateString('fr-CA', {
      timeZone: 'Africa/Dar_es_Salaam',
    });
    const demain = new Date(Date.now() + 86400000).toLocaleDateString('fr-CA', {
      timeZone: 'Africa/Dar_es_Salaam',
    });
    if (jour === aujourdHui) return t('sel_aujourdhui');
    if (jour === hier) return t('equipe_hier');
    if (jour === demain) return t('equipe_demain');
    return new Date(`${jour}T12:00:00`).toLocaleDateString(localeDate, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };
  const groupesAVenir: { jour: string; liste: Trajet[] }[] = [];
  for (const course of coursesAVenir) {
    const jour = cleJour(course);
    const dernier = groupesAVenir[groupesAVenir.length - 1];
    if (dernier && dernier.jour === jour) dernier.liste.push(course);
    else groupesAVenir.push({ jour, liste: [course] });
  }

  const groupesPasses: { jour: string; liste: Trajet[] }[] = [];
  for (const course of coursesPassees) {
    const jour = cleJour(course);
    const dernier = groupesPasses[groupesPasses.length - 1];
    if (dernier && dernier.jour === jour) dernier.liste.push(course);
    else groupesPasses.push({ jour, liste: [course] });
  }

  // TAXIS PARTAGÉS : les annonces OUVERTES d'abord, du départ le plus proche
  // au plus lointain — c'est là qu'on peut encore agir. Les annonces closes ou
  // annulées passent en bas, en lignes compactes : on les consulte, on n'y
  // peut plus rien.
  const partagesOuverts = [...partages]
    .filter((a) => a.status === 'open')
    .sort((a, b) => a.departure_at.localeCompare(b.departure_at));
  const partagesTermines = [...partages]
    .filter((a) => a.status !== 'open')
    .sort((a, b) => b.departure_at.localeCompare(a.departure_at));
  // Le nom complet de l'aéroport noie les cartes : « Aéroport » suffit ici.
  const lieuCourt = (lieu: string) => (/^a[ée]roport/i.test(lieu) ? 'Aéroport' : lieu);

  // LE MENU EN QUATRE FAMILLES (25/08/2026). Quatorze cases à plat, c'était
  // sept rangées à faire défiler : les paiements côtoyaient les hôtels, les
  // candidatures les courses. Les rubriques qui parlent de la même chose
  // vivent désormais dans la même carte, et chaque carte annonce en tête ce
  // qu'elle contient d'urgent — l'équipe sait où aller avant d'avoir lu une
  // ligne. Une rubrique `action` compte dans ce badge dès que son compteur
  // n'est pas à zéro (paiements pas encore encaissés compris).
  type Rubrique = {
    cle: SectionEquipe | 'verifications' | 'vehicules';
    label: string;
    icone: React.ComponentProps<typeof Ionicons>['name'];
    n: number;
    action: boolean;
    /** Rubrique qui ouvre un ÉCRAN à part au lieu d'une section du tableau. */
    ecran?: string;
  };
  const familles: { cle: string; emoji: string; titre: string; rubriques: Rubrique[] }[] = [
    {
      cle: 'courses',
      emoji: '🚕',
      titre: t('equipe_famille_courses'),
      rubriques: [
        { cle: 'courses', label: t('equipe_stat_courses'), icone: 'car-outline', n: coursesATraiter.length, action: true },
        // Le compteur passe en ALERTE dès qu'une course roule depuis trop
        // longtemps : le reste du temps c'est une veille, pas une tâche.
        { cle: 'encours', label: t('equipe_courses_en_cours'), icone: 'navigate-outline', n: coursesEnCours.length, action: coursesEnCours.some(courseEnRetard) },
        { cle: 'avenir', label: t('equipe_courses_a_venir'), icone: 'calendar-outline', n: coursesAVenir.length, action: false },
        { cle: 'partages', label: t('equipe_partages'), icone: 'people-circle-outline', n: partagesOuverts.length, action: false },
        // Le compteur dit ce que la rubrique AFFICHE (toutes les demandes,
        // trouvées comprises) ; le voyant, lui, ne s'allume que s'il reste
        // des demandes ouvertes à recontacter.
        { cle: 'attentes', label: t('equipe_stat_attentes'), icone: 'notifications-outline', n: attentes.length, action: attentes.some((a) => !a.matched_at) },
      ],
    },
    {
      cle: 'argent',
      emoji: '💰',
      titre: t('equipe_famille_argent'),
      rubriques: [
        { cle: 'paiements', label: t('equipe_stat_paiements'), icone: 'cash-outline', n: paiements.length + remboursements.length, action: true },
        { cle: 'recharges', label: t('equipe_recharges'), icone: 'wallet-outline', n: recharges.length, action: recharges.length > 0 },
      ],
    },
    {
      cle: 'chauffeurs',
      emoji: '🧑‍✈️',
      titre: t('equipe_famille_chauffeurs'),
      rubriques: [
        {
          cle: 'verifications',
          label: t('equipe_stat_verifications'),
          icone: 'shield-checkmark-outline',
          n: verifsEnAttente,
          action: true,
          ecran: '/verifications',
        },
        { cle: 'candidatures', label: t('equipe_stat_candidatures'), icone: 'document-text-outline', n: candidats.length, action: true },
        { cle: 'taxis', label: t('equipe_stat_taxis'), icone: 'location-outline', n: chauffeurs.length, action: false },
      ],
    },
    {
      cle: 'monde',
      emoji: '🤝',
      titre: t('equipe_famille_monde'),
      rubriques: [
        { cle: 'comptes', label: t('equipe_stat_comptes'), icone: 'id-card-outline', n: clients.length, action: true },
        { cle: 'hotels', label: t('equipe_stat_hotels'), icone: 'business-outline', n: hotels.length, action: true },
        { cle: 'clients', label: t('equipe_stat_clients'), icone: 'people-outline', n: abonnes?.clients ?? 0, action: false },
        { cle: 'locaux', label: t('equipe_stat_locaux'), icone: 'card-outline', n: abonnes?.locals ?? 0, action: false },
      ],
    },
    {
      cle: 'location',
      emoji: '🚗',
      titre: t('equipe_famille_location'),
      rubriques: [
        {
          cle: 'vehicules',
          label: t('equipe_stat_vehicules'),
          icone: 'car-sport-outline',
          n: vehiculesPendants,
          action: vehiculesPendants > 0,
          ecran: '/vehicules',
        },
      ],
    },
  ];

  // ----- Tableau de bord ----------------------------------------------------
  return (
    <Ecran fond="vagues" onRefresh={charger}>
      {/* Document affiché PAR-DESSUS le tableau de bord : on ne quitte
          jamais l'application pour vérifier un permis. */}
      <VisionneuseDocument
        url={documentOuvert?.url ?? null}
        titre={documentOuvert?.titre ?? ''}
        onFermer={() => setDocumentOuvert(null)}
      />
      <TexteErreur>{erreur}</TexteErreur>

      {/* Menu principal : grille de cases, chaque case ouvre sa rubrique. */}
      {section === null && (
        <>
          {/* Nos abonnés : clients (touristes + résidents), locaux, hôtels. */}
          {abonnes && (
            <View style={styles.bandeauAbonnes}>
              <Text style={styles.titreAbonnes}>{t('equipe_abonnes_titre')}</Text>
              <View style={styles.rangeeAbonnes}>
                <View style={styles.colAbonnes}>
                  <Text style={styles.nbAbonnes}>{abonnes.clients}</Text>
                  <Text style={styles.labelAbonnes}>{t('equipe_abonnes_clients')}</Text>
                </View>
                <View style={styles.filetAbonnes} />
                <View style={styles.colAbonnes}>
                  <Text style={styles.nbAbonnes}>{abonnes.locals}</Text>
                  <Text style={styles.labelAbonnes}>{t('equipe_abonnes_locaux')}</Text>
                </View>
                <View style={styles.filetAbonnes} />
                <View style={styles.colAbonnes}>
                  <Text style={styles.nbAbonnes}>{abonnes.hotels}</Text>
                  <Text style={styles.labelAbonnes}>{t('equipe_abonnes_hotels')}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Chiffre d'affaires : le GAIN NET DU JOUR en grand et en
              shillings (les gains USD sont convertis au taux zanziGo), avec
              le détail courses/colis/places. Toucher pour déplier 7 j / 30 j
              avec la moyenne PAR JOUR en shillings. */}
          {abonnes?.revenue && (
            <Pressable
              onPress={() => setCaOuvert((v) => !v)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.bandeauCa, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.enTeteCa}>
                {/* Le titre se replie ; le raccourci « 7 j · 30 j » reste sur
                    UNE ligne (il s'écrasait en colonne de lettres). */}
                <Text style={[styles.titreAbonnes, { flexShrink: 1 }]}>
                  💰 {t('equipe_ca_titre')}
                </Text>
                <View style={styles.droiteEnTeteCa}>
                  {!caOuvert && (
                    <Text style={styles.astuceCa} numberOfLines={1}>
                      {t('equipe_ca_ouvrir')}
                    </Text>
                  )}
                  <Ionicons
                    name={caOuvert ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={couleurs.texteSecondaire}
                  />
                </View>
              </View>
              <View style={styles.heroCa}>
                <Text style={styles.heroMontantCa}>
                  {formaterMontant(gainEnTzs(abonnes.revenue.today.gains), 'TZS')}
                </Text>
                <Text style={styles.heroLabelCa}>{t('equipe_ca_hero')}</Text>
                <Text style={styles.heroDetailCa}>
                  {t('gains_detail_compte', {
                    courses: abonnes.revenue.today.courses,
                    colis: abonnes.revenue.today.colis,
                    places: abonnes.revenue.today.places ?? 0,
                  })}
                </Text>
                {(abonnes.revenue.today.gains.USD ?? 0) > 0 && (
                  <Text style={styles.heroSousCa}>
                    {joindreMontants(abonnes.revenue.today.gains)}
                  </Text>
                )}
              </View>
              {caOuvert &&
                (
                  [
                    ['gains_7j', abonnes.revenue.week, 7],
                    ['gains_30j', abonnes.revenue.month, 30],
                  ] as const
                ).map(([cle, fenetre, jours]) => (
                  <View key={cle} style={styles.ligneCa}>
                    <View style={styles.gaucheCa}>
                      <Text style={styles.labelCa}>{t(cle)}</Text>
                      <Text style={styles.detailCa}>
                        {t('gains_detail_compte', {
                          courses: fenetre.courses,
                          colis: fenetre.colis,
                          places: fenetre.places ?? 0,
                        })}
                      </Text>
                      <Text style={styles.detailCa}>
                        {t('equipe_ca_encaisse')} : {joindreMontants(fenetre.ca) || '—'}
                      </Text>
                    </View>
                    <View style={styles.droiteCa}>
                      <Text style={styles.montantCa}>
                        {formaterMontant(gainEnTzs(fenetre.gains), 'TZS')}
                      </Text>
                      <Text style={styles.netCa}>
                        {t('equipe_ca_par_jour', {
                          montant: formaterMontant(
                            Math.round(gainEnTzs(fenetre.gains) / jours),
                            'TZS'
                          ),
                        })}
                      </Text>
                    </View>
                  </View>
                ))}
            </Pressable>
          )}

          <Text style={styles.titreSection}>{t('equipe_resume_titre')}</Text>
          {familles.map((famille, rangF) => {
            const actions = famille.rubriques.reduce(
              (somme, r) => somme + (r.action ? r.n : 0),
              0
            );
            return (
              <FamilleMenu
                key={famille.cle}
                index={rangF}
                emoji={famille.emoji}
                titre={famille.titre}
                actions={actions}
                aTraiter={t('equipe_famille_a_traiter', { n: String(actions) })}
              >
                {famille.rubriques.map((rubrique) => (
                  <LigneMenu
                    key={rubrique.cle}
                    icone={rubrique.icone}
                    label={rubrique.label}
                    n={rubrique.n}
                    action={rubrique.action}
                    onPress={() =>
                      rubrique.ecran
                        ? router.push(rubrique.ecran)
                        : ouvrirSection(rubrique.cle as SectionEquipe)
                    }
                  />
                ))}
              </FamilleMenu>
            );
          })}
        </>
      )}

      {/* Dans une rubrique : bouton de retour vers le menu. */}
      {section !== null && (
        <Pressable
          onPress={() => setSection(null)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.retourMenu, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="chevron-back" size={18} color={couleurs.primaireFonce} />
          <Text style={styles.texteRetourMenu}>{t('equipe_retour_menu')}</Text>
        </Pressable>
      )}

      {/* 1. Courses à traiter */}
      {section === 'courses' && (
        <>
      <Text style={styles.titreSection}>
        {t('equipe_courses')} ({coursesATraiter.length})
      </Text>
      {coursesATraiter.length === 0 && (
        <EncartInfo icone="checkmark-circle-outline" ton="succes">
          {t('equipe_courses_vide')}
        </EncartInfo>
      )}
      {coursesATraiter.map((course) => {
        const type = champ<TypeTrajet>(course, 'trip_type', 'tripType');
        // Nom & téléphone : ceux saisis par un hôtel partenaire, sinon ceux du
        // compte client qui a réservé (booker_*, joints côté serveur).
        const nomClient =
          champ<string>(course, 'client_name', 'clientName') ??
          champ<string>(course, 'booker_name', 'bookerName');
        const telClient =
          champ<string>(course, 'client_phone', 'clientPhone') ??
          champ<string>(course, 'booker_phone', 'bookerPhone');
        const partenaire = champ<string>(course, 'hotel_name', 'hotelName');
        // Type de client (touriste / résident / local) — langue et tarif.
        const typeCompte = champ<string>(course, 'booker_account_type', 'bookerAccountType');
        const libelleCompte =
          typeCompte === 'local'
            ? t('client_type_local')
            : typeCompte === 'resident'
              ? t('client_type_resident')
              : typeCompte === 'tourist'
                ? t('client_type_touriste')
                : null;
        // Heure : prévue si le client en a choisi une, sinon depuis quand la
        // demande attend (created_at) — toujours quelque chose à l'écran.
        const heurePrevue = champ(course, 'scheduled_at', 'scheduledAt');
        const heureDemande = champ(course, 'created_at', 'createdAt');
        // Fiche détaillée dépliée au clic.
        const ouvert = !!detailsCourse[course.id];
        const pickupLat = Number(champ(course, 'pickup_lat', 'pickupLat') ?? NaN);
        const pickupLng = Number(champ(course, 'pickup_lng', 'pickupLng') ?? NaN);
        const pointExact = Number.isFinite(pickupLat) && Number.isFinite(pickupLng);
        const statutCourse = champ<StatutTrajet>(course, 'status', 'statut');
        const commission = champ<number | string>(course, 'commission');
        return (
          <Carte key={course.id}>
            {/* Toucher l'itinéraire ouvre / referme la fiche détaillée. */}
            <Pressable
              onPress={() =>
                setDetailsCourse((prev) => ({ ...prev, [course.id]: !prev[course.id] }))
              }
              accessibilityRole="button"
              style={({ pressed }) => [
                { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text style={[styles.itineraire, { flex: 1 }]}>
                {String(champ(course, 'pickup_location', 'pickupLocation') ?? '?')}{'  '}
                <Text style={styles.fleche}>→</Text>{'  '}
                {String(champ(course, 'dropoff_location', 'dropoffLocation') ?? '?')}
              </Text>
              <Ionicons
                name={ouvert ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={couleurs.texteSecondaire}
                style={{ marginTop: 2 }}
              />
            </Pressable>
            <View style={styles.ligneDetails}>
              <Badge texte={type ? libelleTypeTrajet(type, t) : '—'} ton="primaire" />
              <Text style={styles.prix}>{formaterPrix(course)}</Text>
            </View>
            {!!nomClient && (
              <View style={styles.ligneDetail}>
                <Ionicons name="person-outline" size={14} color={couleurs.texteSecondaire} />
                <Text style={styles.detail}>{String(nomClient)}</Text>
              </View>
            )}
            {/* Réservé par un hôtel / restaurant partenaire : à facturer à
                l'établissement, pas au client. */}
            {!!partenaire && (
              <View style={styles.ligneDetail}>
                <Ionicons name="business-outline" size={14} color={couleurs.texteSecondaire} />
                <Text style={styles.detail}>{String(partenaire)}</Text>
              </View>
            )}
            {/* QUAND — toujours affiché : heure prévue si le client en a choisi
                une, sinon depuis combien de temps la demande attend. L'info clé
                pour valider et choisir le bon chauffeur (gras, corail). */}
            <View style={styles.ligneDetail}>
              <Ionicons name="time-outline" size={14} color={couleurs.primaireFonce} />
              <Text style={[styles.detail, { color: couleurs.primaireFonce, fontWeight: '700' }]}>
                {heurePrevue
                  ? `${t('equipe_paiement_depart')} : ${formaterDate(heurePrevue)}`
                  : `${t('equipe_course_demandee')} ${formaterDateRelativeI18n(heureDemande, t)}`}
              </Text>
            </View>
            {/* Type de client : touriste, résident ou local (langue, tarif). */}
            {!!libelleCompte && (
              <View style={styles.ligneDetail}>
                <Ionicons name="pricetag-outline" size={14} color={couleurs.texteSecondaire} />
                <Text style={styles.detail}>{libelleCompte}</Text>
              </View>
            )}
            {/* Téléphone du client : un appui = appel direct (le dispatch peut
                le joindre sans quitter l'écran). */}
            {!!telClient && (
              <Pressable
                onPress={() => Linking.openURL(`tel:${String(telClient).replace(/\s/g, '')}`)}
                accessibilityRole="button"
                style={styles.ligneDetail}
              >
                <Ionicons name="call-outline" size={14} color={couleurs.primaire} />
                <Text style={[styles.detail, { color: couleurs.primaire, fontWeight: '600' }]}>
                  {String(telClient)}
                </Text>
              </Pressable>
            )}
            {/* Numéro de vol : indispensable pour un transfert aéroport. */}
            {!!champ(course, 'flight_number', 'flightNumber') && (
              <View style={styles.ligneDetail}>
                <Ionicons name="airplane-outline" size={14} color={couleurs.texteSecondaire} />
                <Text style={styles.detail}>
                  {t('trip_vol')} : {String(champ(course, 'flight_number', 'flightNumber'))}
                </Text>
              </View>
            )}
            {/* Options demandées : aller-retour, siège bébé, gros bagages —
                le chauffeur doit les connaître avant de partir. */}
            {(() => {
              const opts: string[] = [];
              if (champ<boolean>(course, 'round_trip', 'roundTrip') === true)
                opts.push(t('trip_aller_retour_valeur'));
              if (champ<boolean>(course, 'baby_seat', 'babySeat') === true)
                opts.push(t('reserver_siege_bebe'));
              if (champ<boolean>(course, 'bulky_luggage', 'bulkyLuggage') === true)
                opts.push(t('reserver_gros_bagages'));
              return opts.length ? (
                <View style={styles.ligneDetail}>
                  <Ionicons name="options-outline" size={14} color={couleurs.texteSecondaire} />
                  <Text style={styles.detail}>{opts.join('  ·  ')}</Text>
                </View>
              ) : null;
            })()}
            {/* FICHE DÉTAILLÉE au clic : point de rendez-vous exact (carte),
                heure de la demande, e-mail, statut, répartition du prix. */}
            {ouvert && (
              <View style={styles.detailsCourse}>
                {pointExact ? (
                  <>
                    <Text style={styles.detailsTitre}>{t('equipe_course_point_exact')}</Text>
                    <CartePosition
                      lat={pickupLat}
                      lng={pickupLng}
                      titre={String(champ(course, 'pickup_location', 'pickupLocation') ?? '')}
                      marqueur="client"
                    />
                  </>
                ) : (
                  <View style={styles.ligneDetail}>
                    <Ionicons name="location-outline" size={14} color={couleurs.texteSecondaire} />
                    <Text style={styles.detail}>{t('equipe_course_point_non_partage')}</Text>
                  </View>
                )}
                <View style={styles.ligneDetail}>
                  <Ionicons name="calendar-outline" size={14} color={couleurs.texteSecondaire} />
                  <Text style={styles.detail}>
                    {t('equipe_paiement_demande')} {formaterDate(heureDemande)}
                  </Text>
                </View>
                {!!champ(course, 'booker_email', 'bookerEmail') && (
                  <View style={styles.ligneDetail}>
                    <Ionicons name="mail-outline" size={14} color={couleurs.texteSecondaire} />
                    <Text style={styles.detail}>
                      {String(champ(course, 'booker_email', 'bookerEmail'))}
                    </Text>
                  </View>
                )}
                {!!statutCourse && (
                  <View style={[styles.ligneDetail, { marginTop: 2 }]}>
                    <BadgeStatutTrajet statut={statutCourse} />
                  </View>
                )}
                {commission !== undefined &&
                  (() => {
                    const devise = champ<string>(course, 'currency', 'devise') ?? '';
                    const prix = Number(champ(course, 'price', 'prix') ?? 0);
                    const com = Number(commission);
                    return (
                      <View style={styles.ligneDetail}>
                        <Ionicons name="cash-outline" size={14} color={couleurs.texteSecondaire} />
                        <Text style={styles.detail}>
                          {t('equipe_course_commission')} :{' '}
                          {formaterPrix({ price: com, currency: devise })} ·{' '}
                          {t('equipe_course_net_chauffeur')} :{' '}
                          {formaterPrix({ price: prix - com, currency: devise })}
                        </Text>
                      </View>
                    );
                  })()}
              </View>
            )}
            {/* Course privée : l'annonce toute prête (anglais + swahili) pour
                le groupe WhatsApp des chauffeurs. Un appui, on choisit le
                groupe, c'est envoyé — sans nom ni numéro du client. */}
            {!!champ(course, 'lien_groupe_chauffeurs') && (
              <Bouton
                titre={t('equipe_annonce_groupe')}
                icone="logo-whatsapp"
                variante="secondaire"
                onPress={() =>
                  Linking.openURL(String(champ(course, 'lien_groupe_chauffeurs')))
                }
              />
            )}
            {chauffeurs.length === 0 ? (
              <EncartInfo icone="alert-circle-outline" ton="attente">
                {t('equipe_aucun_chauffeur')}
              </EncartInfo>
            ) : (
              <>
                <Selecteur
                  label={t('equipe_choisir_chauffeur')}
                  valeur={choixChauffeur[course.id] ?? ''}
                  options={chauffeurs.map(libelleChauffeur)}
                  onChange={(libelle) =>
                    setChoixChauffeur((prev) => ({ ...prev, [course.id]: libelle }))
                  }
                />
                {/* AVANT de confirmer : où est ce chauffeur, là maintenant ?
                    Zone déclarée + dernière position GPS sur la carte — pour
                    vérifier qu'il est vraiment dans le secteur. */}
                {(() => {
                  const choisi = chauffeurs.find(
                    (c) => libelleChauffeur(c) === choixChauffeur[course.id]
                  );
                  if (!choisi) return null;
                  const lat = Number(champ(choisi, 'last_lat') ?? NaN);
                  const lng = Number(champ(choisi, 'last_lng') ?? NaN);
                  const positionConnue = Number.isFinite(lat) && Number.isFinite(lng);
                  const majPosition = champ(choisi, 'position_updated_at');
                  return positionConnue ? (
                    <CartePosition
                      lat={lat}
                      lng={lng}
                      titre={`${String(champ(choisi, 'zone') ?? '—')} · ${formaterDateRelativeI18n(majPosition, t)}`}
                      marqueur="voiture"
                    />
                  ) : (
                    <View style={styles.ligneDetail}>
                      <Ionicons name="location-outline" size={14} color={couleurs.texteSecondaire} />
                      <Text style={styles.detail}>
                        {String(champ(choisi, 'zone') ?? '—')} · {t('equipe_position_inconnue')}
                      </Text>
                    </View>
                  );
                })()}
                <Bouton
                  titre={t('equipe_confirmer_chauffeur')}
                  icone="checkmark-circle-outline"
                  onPress={() => confirmerChauffeur(course)}
                  charge={actionEnCours === course.id}
                />
              </>
            )}
          </Carte>
        );
      })}

      {/* Courses PASSÉES : rangées par jour, repliées par défaut — on
          touche une date pour voir le détail du jour. */}
      {groupesPasses.length > 0 && (
        <>
          <Text style={styles.titreSection}>
            🗂 {t('equipe_courses_passees')} ({coursesPassees.length})
          </Text>
          {groupesPasses.map((groupe) => {
            const ouvert = !!joursOuverts[groupe.jour];
            return (
              <View key={groupe.jour}>
                <Pressable
                  onPress={() =>
                    setJoursOuverts((prev) => ({ ...prev, [groupe.jour]: !ouvert }))
                  }
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.enTeteJour, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons
                    name={ouvert ? 'chevron-down' : 'chevron-forward'}
                    size={16}
                    color={couleurs.primaireFonce}
                  />
                  <Text style={styles.texteJour}>{libelleJour(groupe.jour)}</Text>
                  <Text style={styles.compteJour}>
                    {t('equipe_jour_compte', { n: groupe.liste.length })}
                  </Text>
                </Pressable>
                {ouvert &&
                  groupe.liste.map((course) => {
                    const statut = champ<StatutTrajet>(course, 'status', 'statut');
                    const heure = new Date(dateCourse(course)).toLocaleTimeString(localeDate, {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Africa/Dar_es_Salaam',
                    });
                    const chauffeurCourse = champ<string>(course, 'driver_name', 'driverName');
                    return (
                      <View key={course.id} style={styles.lignePassee}>
                        <View style={styles.entetePassee}>
                          <Text style={styles.itineraire} numberOfLines={1}>
                            {String(champ(course, 'pickup_location', 'pickupLocation') ?? '?')} →{' '}
                            {String(champ(course, 'dropoff_location', 'dropoffLocation') ?? '?')}
                          </Text>
                          <Text style={styles.prixPassee}>{formaterPrix(course)}</Text>
                        </View>
                        <View style={styles.piedPassee}>
                          <Text style={styles.detail}>
                            {heure}
                            {chauffeurCourse ? ` · 🚕 ${chauffeurCourse}` : ''}
                          </Text>
                          {statut && <BadgeStatutTrajet statut={statut} />}
                        </View>
                      </View>
                    );
                  })}
              </View>
            );
          })}
        </>
      )}

        </>
      )}

      {/* 1 bis. COURSES EN COURS — LA ROUTE, EN DIRECT.
          Le taxi a chargé ses passagers ; ils roulent en ce moment. Ces
          courses tombaient dans l'historique, avec les terminées : l'équipe
          ne voyait donc jamais ce qui se passait à l'instant T.
          Celle qui roule depuis le plus longtemps est en tête — c'est la
          seule qui peut avoir besoin d'un coup de fil. */}
      {section === 'encours' && (
        <>
          <Text style={styles.titreSection}>
            🚕 {t('equipe_courses_en_cours')} ({coursesEnCours.length})
          </Text>
          <Text style={styles.introMenu}>{t('equipe_en_cours_intro')}</Text>
          {coursesEnCours.length === 0 && (
            <EncartInfo icone="navigate-outline">{t('equipe_en_cours_vide')}</EncartInfo>
          )}
          {coursesEnCours.map((course) => {
            const ecoule = minutesDepuisDepart(course);
            const attendue = dureeAttendue(course);
            const traine = courseEnRetard(course);
            const chauffeurCourse = champ<string>(course, 'driver_name', 'driverName');
            const plaqueCourse = champ<string>(course, 'vehicle_plate', 'vehiclePlate');
            const clientCourse = champ<string>(course, 'client_name', 'clientName');
            const telCourse = champ<string>(course, 'client_phone', 'clientPhone');
            return (
              <Pressable
                key={course.id}
                onPress={() => router.push(`/trip/${course.id}`)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.ligneEnCours,
                  traine && styles.ligneEnCoursTraine,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={styles.entetePassee}>
                  <Text style={styles.itineraire} numberOfLines={2}>
                    {lieuCourt(String(champ(course, 'pickup_location', 'pickupLocation') ?? '?'))} →{' '}
                    {lieuCourt(String(champ(course, 'dropoff_location', 'dropoffLocation') ?? '?'))}
                  </Text>
                  <Text style={styles.prixPassee}>{formaterPrix(course)}</Text>
                </View>

                {/* LE CHRONO — ce que l'équipe vient chercher ici. */}
                <View style={styles.rangeeChrono}>
                  <Ionicons
                    name={traine ? 'alert-circle' : 'navigate'}
                    size={16}
                    color={traine ? couleurs.orange : couleurs.primaireFonce}
                  />
                  <Text style={[styles.chrono, traine && styles.chronoTraine]}>
                    {ecoule === null
                      ? t('equipe_en_cours_depart_inconnu')
                      : t('equipe_en_cours_depuis', { duree: dureeLisible(ecoule) })}
                    {attendue !== null
                      ? ` · ${t('equipe_en_cours_attendu', { duree: dureeLisible(attendue) })}`
                      : ''}
                  </Text>
                </View>

                <Text style={styles.detailEnCours}>
                  🚕 {chauffeurCourse ? String(chauffeurCourse) : t('equipe_sans_chauffeur')}
                  {plaqueCourse ? ` · ${String(plaqueCourse)}` : ''}
                </Text>
                {!!clientCourse && (
                  <Text style={styles.detailEnCours}>
                    👤 {String(clientCourse)}
                    {telCourse ? ` · ${String(telCourse)}` : ''}
                  </Text>
                )}

                {/* Course qui traîne : on ne se contente pas de la colorer,
                    on met le chauffeur à portée de doigt. */}
                {traine && !!telCourse && (
                  <Bouton
                    titre={t('equipe_en_cours_appeler_client')}
                    icone="call-outline"
                    variante="secondaire"
                    onPress={() => Linking.openURL(`tel:${String(telCourse).replace(/\s/g, '')}`)}
                  />
                )}
              </Pressable>
            );
          })}
        </>
      )}

      {/* 1 ter. COURSES À VENIR : les départs déjà programmés, du plus proche
          au plus lointain. Sa propre case dans le menu, dépliée d'office :
          c'est le planning qu'on regarde le matin pour préparer la journée. */}
      {section === 'avenir' && (
        <>
          <Text style={styles.titreSection}>
            📅 {t('equipe_courses_a_venir')} ({coursesAVenir.length})
          </Text>
          {coursesAVenir.length === 0 && (
            <EncartInfo icone="calendar-outline">{t('equipe_a_venir_vide')}</EncartInfo>
          )}
          {groupesAVenir.map((groupe) => (
            <View key={`avenir-${groupe.jour}`}>
              <View style={styles.enTeteJourAVenir}>
                <Ionicons name="calendar-outline" size={16} color={couleurs.primaireFonce} />
                <Text style={styles.texteJour}>{libelleJour(groupe.jour)}</Text>
                <Text style={styles.compteJour}>
                  {t('equipe_jour_compte', { n: groupe.liste.length })}
                </Text>
              </View>
              {groupe.liste.map((course) => {
                const statut = champ<StatutTrajet>(course, 'status', 'statut');
                const heure = new Date(dateCourse(course)).toLocaleTimeString(localeDate, {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Africa/Dar_es_Salaam',
                });
                const chauffeurCourse = champ<string>(course, 'driver_name', 'driverName');
                return (
                  <View key={course.id} style={styles.ligneAVenir}>
                    <View style={styles.entetePassee}>
                      <Text style={styles.itineraire} numberOfLines={1}>
                        {String(champ(course, 'pickup_location', 'pickupLocation') ?? '?')} →{' '}
                        {String(champ(course, 'dropoff_location', 'dropoffLocation') ?? '?')}
                      </Text>
                      <Text style={styles.prixPassee}>{formaterPrix(course)}</Text>
                    </View>
                    <View style={styles.piedPassee}>
                      <Text style={styles.heureAVenir}>
                        🕒 {heure}
                        {chauffeurCourse ? ` · 🚕 ${chauffeurCourse}` : ''}
                      </Text>
                      {statut && <BadgeStatutTrajet statut={statut} />}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </>
      )}

      {/* 1 quater. TAXIS PARTAGÉS — la tour de contrôle du remplissage. Les
          annonces encore vendables d'abord, en cartes ; les terminées en bas,
          en lignes compactes. Un siège vide au départ ne se rattrape jamais. */}
      {section === 'partages' && (
        <>
          <Text style={styles.titreSection}>
            🚐 {t('equipe_partages')} ({partagesOuverts.length})
          </Text>
          <Text style={styles.introMenu}>{t('equipe_partages_intro')}</Text>
          {partagesOuverts.length === 0 && (
            <EncartInfo icone="people-circle-outline">{t('equipe_partages_vide')}</EncartInfo>
          )}
          {partagesOuverts.map((annonce) => {
            const heure = new Date(annonce.departure_at).toLocaleString(localeDate, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Africa/Dar_es_Salaam',
            });
            const complet = annonce.seats_available === 0;
            return (
              <Carte key={annonce.id} style={styles.cartePartage}>
                {/* Ligne 1 : le trajet, et LE chiffre qui compte — combien de
                    places restent à vendre — dans une pastille colorée. */}
                <View style={styles.entetePartage}>
                  <Text style={styles.itineraire} numberOfLines={1}>
                    {lieuCourt(annonce.origin)} → {lieuCourt(annonce.destination)}
                  </Text>
                  <View style={[styles.pastillePartage, complet && styles.pastillePartageOk]}>
                    <Text
                      style={[
                        styles.textePastillePartage,
                        complet && styles.textePastillePartageOk,
                      ]}
                    >
                      {complet
                        ? t('equipe_partages_complet')
                        : t('equipe_partages_restantes', { n: annonce.seats_available })}
                    </Text>
                  </View>
                </View>
                <Text style={styles.departPartage}>
                  🕒 {heure} · {annonce.price_per_seat_usd} $ {t('equipe_partages_la_place')}
                </Text>

                {/* La jauge : un carré par siège. Plein = payé, cerclé =
                    réservé pas encore réglé, pâle = encore à vendre. */}
                <View style={styles.jauge}>
                  {Array.from({ length: annonce.seats_total }, (_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.siege,
                        i < annonce.seats_sold && styles.siegePaye,
                        i >= annonce.seats_sold &&
                          i < annonce.seats_sold + annonce.seats_reserved &&
                          styles.siegeReserve,
                      ]}
                    />
                  ))}
                  <Text style={styles.bilanPartage}>
                    {t('equipe_partages_bilan', {
                      payees: annonce.seats_sold,
                      libres: annonce.seats_available,
                    })}
                    {annonce.seats_reserved > 0
                      ? ` · ${t('equipe_partages_reservees', { n: annonce.seats_reserved })}`
                      : ''}
                  </Text>
                </View>
                {annonce.commission_usd > 0 && (
                  <Text style={styles.gainPartage}>
                    💰 {t('equipe_partages_commission', { montant: annonce.commission_usd.toFixed(2) })}
                  </Text>
                )}

                <View style={styles.ligneDetail}>
                  <Ionicons name="car-outline" size={14} color={couleurs.texteSecondaire} />
                  <Text style={styles.detail}>
                    {annonce.driver_name}
                    {annonce.vehicle_plate ? ` · ${annonce.vehicle_plate}` : ''}
                    {annonce.driver_phone ? ` · ${annonce.driver_phone}` : ''}
                  </Text>
                </View>
                {annonce.bookings.map((place, i) => (
                  <View key={i} style={styles.ligneDetail}>
                    <Ionicons
                      name={place.paid ? 'checkmark-circle' : 'time-outline'}
                      size={14}
                      color={place.paid ? couleurs.succes : couleurs.primaire}
                    />
                    <Text style={styles.detail}>
                      {place.client_name ?? t('equipe_partages_anonyme')} ·{' '}
                      {t('equipe_partages_sieges', { n: place.seats })}
                      {place.paid ? '' : ` · ${t('equipe_partages_impayee')}`}
                    </Text>
                  </View>
                ))}
              </Carte>
            );
          })}

          {/* Les annonces terminées : une ligne chacune, l'essentiel sans
              encombrer — le remplissage final dit si la voiture est bien partie. */}
          {partagesTermines.length > 0 && (
            <>
              <Text style={styles.titreSection}>
                🗂 {t('equipe_partages_terminees')} ({partagesTermines.length})
              </Text>
              {partagesTermines.map((annonce) => {
                const heure = new Date(annonce.departure_at).toLocaleString(localeDate, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Africa/Dar_es_Salaam',
                });
                return (
                  <View key={annonce.id} style={styles.lignePartageFinie}>
                    <View style={styles.entetePassee}>
                      <Text style={styles.itineraire} numberOfLines={1}>
                        {lieuCourt(annonce.origin)} → {lieuCourt(annonce.destination)}
                      </Text>
                      <Text style={styles.bilanFin}>
                        {t('equipe_partages_vendues', {
                          n: annonce.seats_sold,
                          total: annonce.seats_total,
                        })}
                      </Text>
                    </View>
                    <Text style={styles.detail}>
                      {heure}
                      {annonce.status === 'cancelled'
                        ? ` · ${t('equipe_partages_annulee')}`
                        : ''}
                      {annonce.commission_usd > 0
                        ? ` · zanziGo ${annonce.commission_usd.toFixed(2)} $`
                        : ''}
                    </Text>
                  </View>
                );
              })}
            </>
          )}
        </>
      )}

      {/* 2. Paiements : remboursements à verser, en attente, puis reçus */}
      {section === 'paiements' && (() => {
        // Corps commun d'une carte paiement : type, montant, trajet, client.
        const corpsPaiement = (paiement: PaiementEquipe) => {
          const estColis = !!paiement.package_id;
          const estPlace = !!paiement.ride_booking_id;
          const depart = estColis
            ? paiement.package_pickup
            : estPlace
              ? paiement.ride_origin
              : paiement.trip_pickup;
          const arrivee = estColis
            ? paiement.package_dropoff
            : estPlace
              ? paiement.ride_destination
              : paiement.trip_dropoff;
          const montant = formaterMontant(
            Number(champ(paiement, 'amount') ?? 0),
            String(champ(paiement, 'currency') ?? 'TZS')
          );
          return (
            <>
              {/* flexWrap : un gros montant (800 000 TZS) passe à la ligne au
                  lieu d'être coupé au bord de l'écran. */}
              <View style={styles.lignePaiement}>
                <Badge
                  texte={
                    estColis
                      ? t('equipe_paiement_colis')
                      : estPlace
                        ? t('equipe_paiement_place', { n: paiement.ride_seats ?? 1 })
                        : t('equipe_paiement_course')
                  }
                  ton="primaire"
                />
                <Text style={styles.prix}>{montant}</Text>
              </View>
              <Text style={styles.itineraire}>
                {depart ?? '?'}{'  '}
                <Text style={styles.fleche}>→</Text>{'  '}
                {arrivee ?? '?'}
              </Text>
              {estColis && !!paiement.package_qr && (
                <Text style={styles.detail}>{paiement.package_qr}</Text>
              )}
              {estPlace && !!paiement.ride_client_name && (
                <Text style={styles.detail}>{paiement.ride_client_name}</Text>
              )}
              {!estColis && !estPlace && !!paiement.trip_client_name && (
                <Text style={styles.detail}>{paiement.trip_client_name}</Text>
              )}
              {/* PAR QUEL MOYEN l'argent arrive : un virement Tigo en
                  shillings ne se cherche pas au même endroit qu'un paiement
                  carte en dollars. Sans ça, l'équipe le devinait à la devise
                  — ce qui ne suffit plus depuis qu'un touriste facturé en
                  dollars peut régler au portefeuille mobile. */}
              {!!champ(paiement, 'method') && (
                <Text style={styles.detail}>
                  {champ(paiement, 'method') === 'mobile'
                    ? `📱 ${t('paiement_moyen_mobile_court')}`
                    : champ(paiement, 'method') === 'credit'
                      ? `🏨 ${t('trip_payer_credit')}`
                      : `💳 ${t('paiement_moyen_carte_court')}`}
                </Text>
              )}
              {/* QUAND : demandé le… et départ prévu — indispensable pour
                  savoir quoi encaisser en priorité. */}
              <Text style={styles.detail}>
                🕐 {t('equipe_paiement_demande')} {formaterDate(champ(paiement, 'created_at'))}
              </Text>
              {(() => {
                const depart = estPlace
                  ? champ(paiement, 'ride_departure_at')
                  : champ(paiement, 'trip_scheduled_at');
                return depart ? (
                  <Text style={styles.detail}>
                    🚗 {t('equipe_paiement_depart')} {formaterDate(depart)}
                  </Text>
                ) : null;
              })()}
              {/* La fiche complète s'ouvre pour une course ou un colis. */}
              {(!!paiement.trip_id || !!paiement.package_id) && (
                <Pressable
                  onPress={() =>
                    router.push(
                      paiement.trip_id
                        ? `/trip/${paiement.trip_id}`
                        : `/package/${paiement.package_id}`
                    )
                  }
                  accessibilityRole="button"
                  style={({ pressed }) => pressed && { opacity: 0.7 }}
                >
                  <Text style={styles.lienFicheEquipe}>{t('equipe_ouvrir_fiche')}</Text>
                </Pressable>
              )}
            </>
          );
        };
        return (
        <>
      {/* Remboursements à VERSER (annulations clients à +24 h du départ). */}
      {remboursements.length > 0 && (
        <>
          <Text style={styles.titreSection}>
            ↩️ {t('equipe_remboursements')} ({remboursements.length})
          </Text>
          {remboursements.map((paiement) => {
            const montantDu = Number(paiement.refund_amount ?? 0);
            const devise = String(champ(paiement, 'currency') ?? 'TZS');
            const taux = Math.round(
              (montantDu / Math.max(Number(champ(paiement, 'amount') ?? 1), 0.01)) * 100
            );
            return (
              <Carte key={paiement.id}>
                {corpsPaiement(paiement)}
                <Text style={styles.montantRembourser}>
                  {t('equipe_rembourser_montant', {
                    montant: formaterMontant(montantDu, devise),
                    taux: String(taux),
                  })}
                </Text>
                <Bouton
                  titre={t('equipe_rembourse_bouton')}
                  icone="checkmark-circle-outline"
                  variante="secondaire"
                  onPress={() => agir(paiement.id, () => api.marquerRembourse(paiement.id))}
                  charge={actionEnCours === paiement.id}
                />
              </Carte>
            );
          })}
        </>
      )}

      <Text style={styles.titreSection}>
        {t('equipe_paiements')} ({paiements.length})
      </Text>
      {paiements.length === 0 && (
        <EncartInfo icone="checkmark-circle-outline" ton="succes">
          {t('equipe_paiements_vide')}
        </EncartInfo>
      )}
      {paiements.map((paiement) => (
        <Carte key={paiement.id}>
          {corpsPaiement(paiement)}
          <Text style={styles.badgeAttentePaiement}>⏳ {t('resa_impayee')}</Text>
          <Bouton
            titre={t('equipe_marquer_paye')}
            icone="cash-outline"
            onPress={() => agir(paiement.id, () => api.confirmerPaiementEquipe(paiement.id))}
            charge={actionEnCours === paiement.id}
          />
        </Carte>
      ))}

      {/* Derniers paiements REÇUS : la preuve que « ça a bien été payé »,
          y compris les paiements par crédit hôtel (badge 💳, encaissés
          automatiquement sans passer par « en attente »). */}
      {paiementsRecus.length > 0 && (
        <>
          <Text style={styles.titreSection}>✅ {t('equipe_paiements_recus')}</Text>
          {paiementsRecus
            .filter((paiement) => !paiement.refund_due_at || paiement.refunded_at)
            .slice(0, 10)
            .map((paiement) => {
            const parCredit = String(paiement.pesapal_reference ?? '').startsWith('CREDIT-');
            return (
              <Carte key={paiement.id}>
                {corpsPaiement(paiement)}
                {/* VERT réservé au crédit hôtel (argent déjà chez zanziGo) ;
                    tout le reste est en ORANGE — validé à la main par vous. */}
                <View style={styles.ligneRecu}>
                  {parCredit ? (
                    <Text style={styles.badgeRecuCredit}>💳 {t('equipe_paiement_credit')} ✅</Text>
                  ) : (
                    <Text style={styles.badgeValideMain}>✔ {t('equipe_paiement_valide_main')}</Text>
                  )}
                  <Text style={styles.dateRecu}>
                    {formaterDateRelativeI18n(
                      champ(paiement, 'confirmed_at', 'confirmedAt', 'created_at', 'createdAt'),
                      t
                    )}
                  </Text>
                </View>
              </Carte>
            );
          })}
        </>
      )}

        </>
        );
      })()}

      {/* 2 bis. RECHARGES DE CRÉDIT — les demandes des partenaires.
          Cette rubrique n'existait pas : « Recharger mon crédit » ouvrait un
          WhatsApp et rien d'autre. Une demande pouvait donc arriver sans que
          personne ne l'apprenne, et sans rien laisser à retrouver. */}
      {section === 'recharges' && (
        <>
          <Text style={styles.titreSection}>
            💰 {t('equipe_recharges')} ({recharges.length})
          </Text>
          {recharges.length === 0 ? (
            <EncartInfo icone="checkmark-circle-outline" ton="succes">
              {t('equipe_recharges_vide')}
            </EncartInfo>
          ) : (
            <EncartInfo icone="alert-circle-outline" ton="attente">
              {t('equipe_recharge_verifier')}
            </EncartInfo>
          )}
          {recharges.map((demande) => {
            const montant = Number(demande.amount);
            const moyen = MOYEN_RECHARGE[demande.method] ?? demande.method;
            return (
              <Carte key={demande.id}>
                <Text style={styles.itineraire}>
                  {demande.hotel_name} · {formaterMontant(montant, 'USD')}
                </Text>
                <LigneInfo label={t('equipe_recharge_moyen')} valeur={t(moyen)} />
                <LigneInfo
                  label={t('equipe_recharge_solde')}
                  valeur={formaterMontant(Number(demande.credit_balance ?? 0), 'USD')}
                />
                {!!demande.note && (
                  <LigneInfo label={t('equipe_recharge_note')} valeur={demande.note} />
                )}
                <LigneInfo
                  label={t('commun_telephone')}
                  valeur={demande.hotel_phone ?? '—'}
                />
                <Text style={styles.dateRecu}>
                  {formaterDateRelativeI18n(demande.created_at, t)}
                </Text>
                <Bouton
                  titre={t('equipe_recharge_crediter', {
                    montant: formaterMontant(montant, 'USD'),
                  })}
                  icone="cash-outline"
                  onPress={() =>
                    agir(demande.id, () => api.crediterDemandeRecharge(demande.id))
                  }
                  charge={actionEnCours === demande.id}
                />
                <Bouton
                  titre={t('equipe_recharge_refuser')}
                  icone="close-circle-outline"
                  variante="secondaire"
                  onPress={() =>
                    agir(demande.id, () => api.refuserDemandeRecharge(demande.id))
                  }
                  charge={actionEnCours === demande.id}
                />
              </Carte>
            );
          })}
        </>
      )}

      {/* 3. Candidatures chauffeurs */}
      {section === 'candidatures' && (
        <>
      <Text style={styles.titreSection}>
        {t('equipe_candidatures')} ({candidats.length})
      </Text>
      {candidats.length === 0 && (
        <EncartInfo icone="checkmark-circle-outline" ton="succes">
          {t('equipe_candidatures_vide')}
        </EncartInfo>
      )}
      {candidats.map((candidat) => {
        const documents: Array<[string, unknown]> = [
          [t('equipe_doc_permis'), champ(candidat, 'license_document_url', 'licenseDocumentUrl')],
          [t('equipe_doc_assurance'), champ(candidat, 'insurance_document_url', 'insuranceDocumentUrl')],
          [t('equipe_doc_vehicule'), champ(candidat, 'vehicle_photo_url', 'vehiclePhotoUrl')],
        ];
        return (
          <Carte key={candidat.id}>
            <Text style={styles.itineraire}>{libelleChauffeur(candidat)}</Text>
            <Text style={styles.detail}>
              {String(champ(candidat, 'vehicle_model', 'vehicleModel') ?? '—')} ·{' '}
              {String(champ(candidat, 'zone') ?? '—')} ·{' '}
              {String(champ(candidat, 'phone') ?? '')}
            </Text>
            <View style={styles.rangeeDocs}>
              {documents.map(([libelle, url]) => {
                if (typeof url !== 'string' || !url) return null;
                // Le document s'ouvre DANS l'application (visionneuse) :
                // plus de sortie vers le navigateur qui ramenait à l'accueil.
                const perdu = /localhost|127\.0\.0\.1/.test(url);
                return (
                  <Bouton
                    key={libelle}
                    titre={perdu ? `${libelle} — ${t('equipe_doc_indisponible')}` : libelle}
                    icone={perdu ? 'alert-circle-outline' : 'document-attach-outline'}
                    variante="secondaire"
                    onPress={() => setDocumentOuvert({ url, titre: libelle })}
                  />
                );
              })}
            </View>
            <View style={styles.rangeeActions}>
              <View style={styles.demiAction}>
                <Bouton
                  titre={t('equipe_valider')}
                  onPress={() => agir(candidat.id, () => api.verifierChauffeur(candidat.id, 'verified'))}
                  charge={actionEnCours === candidat.id}
                />
              </View>
              <View style={styles.demiAction}>
                <Bouton
                  titre={t('equipe_refuser')}
                  variante="danger"
                  onPress={() => agir(candidat.id, () => api.verifierChauffeur(candidat.id, 'rejected'))}
                  charge={actionEnCours === candidat.id}
                />
              </View>
            </View>
          </Carte>
        );
      })}

        </>
      )}

      {/* 4. Comptes clients à valider */}
      {section === 'comptes' && (
        <>
      <Text style={styles.titreSection}>
        {t('equipe_comptes')} ({clients.length})
      </Text>
      {clients.length === 0 && (
        <EncartInfo icone="checkmark-circle-outline" ton="succes">
          {t('equipe_comptes_vide')}
        </EncartInfo>
      )}
      {clients.map((client) => {
        const document = champ(client, 'id_document_url', 'idDocumentUrl');
        return (
          <Carte key={client.id}>
            <Text style={styles.itineraire}>
              {String(champ(client, 'full_name', 'fullName') ?? '?')}
            </Text>
            <Text style={styles.detail}>
              {String(champ(client, 'account_type', 'accountType') ?? '—')} ·{' '}
              {String(champ(client, 'phone') ?? '')}
            </Text>
            {typeof document === 'string' && !!document && (
              <Bouton
                titre={t('equipe_document')}
                icone="document-attach-outline"
                variante="secondaire"
                onPress={() => setDocumentOuvert({ url: document, titre: t('equipe_document') })}
              />
            )}
            <View style={styles.rangeeActions}>
              <View style={styles.demiAction}>
                <Bouton
                  titre={t('equipe_valider')}
                  onPress={() => agir(client.id, () => api.verifierClient(client.id, 'verified'))}
                  charge={actionEnCours === client.id}
                />
              </View>
              <View style={styles.demiAction}>
                <Bouton
                  titre={t('equipe_refuser')}
                  variante="danger"
                  onPress={() => agir(client.id, () => api.verifierClient(client.id, 'rejected'))}
                  charge={actionEnCours === client.id}
                />
              </View>
            </View>
          </Carte>
        );
      })}

        </>
      )}

      {/* 5. Hôtels à vérifier (anti-usurpation : appeler l'établissement) */}
      {section === 'hotels' && (
        <>
      <Text style={styles.titreSection}>
        {t('equipe_hotels')} ({hotels.length})
      </Text>
      {hotels.length === 0 && (
        <EncartInfo icone="checkmark-circle-outline" ton="succes">
          {t('equipe_hotels_vide')}
        </EncartInfo>
      )}
      {hotels.length > 0 && (
        <EncartInfo icone="call-outline" ton="attente">
          {t('equipe_hotels_conseil')}
        </EncartInfo>
      )}
      {hotels.map((lHotel) => {
        const telephone = String(champ(lHotel, 'phone') ?? '');
        return (
          <Carte key={lHotel.id}>
            {/* Le nom ouvre la fiche complète de l'établissement. */}
            <Pressable
              onPress={() => router.push(`/hotel/${lHotel.id}`)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.lienHotel, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.nomHotelLien}>{String(champ(lHotel, 'name') ?? '?')}</Text>
              <Ionicons name="chevron-forward" size={18} color={couleurs.primaire} />
            </Pressable>
            <Text style={styles.detail}>
              {String(champ(lHotel, 'contact_name', 'contactName') ?? '—')} ·{' '}
              {String(champ(lHotel, 'zone') ?? '—')} · {telephone}
            </Text>
            <Text style={styles.detail}>{String(champ(lHotel, 'email') ?? '')}</Text>
            {!!telephone && (
              <Bouton
                titre={`WhatsApp · ${telephone}`}
                icone="logo-whatsapp"
                variante="secondaire"
                onPress={() =>
                  Linking.openURL(`https://wa.me/${telephone.replace(/[^\d]/g, '')}`)
                }
              />
            )}
            <View style={styles.rangeeActions}>
              <View style={styles.demiAction}>
                <Bouton
                  titre={t('equipe_valider')}
                  onPress={() => agir(lHotel.id, () => api.verifierHotel(lHotel.id, 'verified'))}
                  charge={actionEnCours === lHotel.id}
                />
              </View>
              <View style={styles.demiAction}>
                <Bouton
                  titre={t('equipe_refuser')}
                  variante="danger"
                  onPress={() => agir(lHotel.id, () => api.verifierHotel(lHotel.id, 'rejected'))}
                  charge={actionEnCours === lHotel.id}
                />
              </View>
            </View>
          </Carte>
        );
      })}

      {/* Crédit prépayé : créditer un hôtel après réception de l'argent
          (mobile money, espèces). Montant négatif = correction. */}
      <Text style={styles.titreSection}>
        {t('equipe_credit_titre')} ({hotelsVerifies.length})
      </Text>
      {hotelsVerifies.length > 0 && (
        <EncartInfo icone="business-outline">{t('equipe_hotels_conseil_fiche')}</EncartInfo>
      )}
      {/* Chaque établissement ouvre sa fiche : coordonnées, solde, historique
          des mouvements, fidélité, réservations — et la case pour créditer. */}
      {hotelsVerifies.map((lHotel) => (
        <Pressable
          key={`credit-${lHotel.id}`}
          onPress={() => router.push(`/hotel/${lHotel.id}`)}
          accessibilityRole="button"
          style={({ pressed }) => pressed && { opacity: 0.7 }}
        >
          <Carte>
            <View style={styles.enTete}>
              <Text style={styles.nomHotelLien}>{String(champ(lHotel, 'name') ?? '?')}</Text>
              <Text style={styles.soldeHotel}>
                {formaterMontant(
                  Number(champ(lHotel, 'credit_balance', 'creditBalance') ?? 0),
                  'USD'
                )}
              </Text>
            </View>
            <View style={styles.lienHotel}>
              <Text style={styles.lienFicheEquipe}>{t('hotel_fiche_ouvrir')}</Text>
              <Ionicons name="chevron-forward" size={18} color={couleurs.primaire} />
            </View>
          </Carte>
        </Pressable>
      ))}

        </>
      )}

      {/* 6. Mes taxis : chauffeurs vérifiés CLASSÉS PAR VILLE, position GPS,
          radiation avec confirmation. */}
      {section === 'taxis' && (
        <>
      <Text style={styles.titreSection}>
        {t('equipe_taxis')} ({chauffeurs.length})
      </Text>
      {chauffeurs.length === 0 && (
        <EncartInfo icone="car-outline">{t('equipe_taxis_vide')}</EncartInfo>
      )}
      {groupesTaxis.map((groupe) => (
        <View key={groupe.ville} style={styles.groupeVille}>
          <View style={styles.enTeteVille}>
            <Ionicons name="location" size={14} color={couleurs.primaireFonce} />
            <Text style={styles.texteVille}>
              {groupe.ville} ({groupe.liste.length})
            </Text>
            <View style={styles.filetVille} />
          </View>
          {groupe.liste.map((chauffeur) => {
            const lat = Number(champ(chauffeur, 'last_lat') ?? NaN);
            const lng = Number(champ(chauffeur, 'last_lng') ?? NaN);
            const positionConnue = Number.isFinite(lat) && Number.isFinite(lng);
            const majPosition = champ(chauffeur, 'position_updated_at');
            // Documents : date d'expiration + voyant si sous 30 jours.
            const expPermis = champ<string>(chauffeur, 'license_expires_on', 'licenseExpiresOn');
            const expAssurance = champ<string>(
              chauffeur,
              'insurance_expires_on',
              'insuranceExpiresOn'
            );
            const bientot = (d?: string | null) =>
              !!d && new Date(String(d)).getTime() < Date.now() + 30 * 86400000;
            const docsAlerte = bientot(expPermis) || bientot(expAssurance);
            return (
              <Pressable
                key={chauffeur.id}
                onPress={() => router.push(`/taxi/${chauffeur.id}`)}
                accessibilityRole="button"
                style={({ pressed }) => pressed && { opacity: 0.7 }}
              >
                <Carte>
                  <View style={styles.ligneDetails}>
                    <Text style={styles.nomHotelLien}>{libelleChauffeur(chauffeur)}</Text>
                    {docsAlerte && <Badge texte={t('equipe_docs_alerte')} ton="danger" />}
                  </View>
                  <Text style={styles.detail}>
                    {String(champ(chauffeur, 'vehicle_model', 'vehicleModel') ?? '—')} ·{' '}
                    {String(champ(chauffeur, 'vehicle_plate', 'vehiclePlate') ?? '—')} ·{' '}
                    {String(champ(chauffeur, 'phone') ?? '')}
                  </Text>
                  <Text style={styles.detail}>
                    📄 {t('equipe_docs_permis')} :{' '}
                    {expPermis ? String(expPermis).slice(0, 10) : '—'} ·{' '}
                    {t('equipe_docs_assurance')} :{' '}
                    {expAssurance ? String(expAssurance).slice(0, 10) : '—'}
                  </Text>
                  <Text style={styles.detail}>
                    📍{' '}
                    {positionConnue
                      ? formaterDateRelativeI18n(majPosition, t)
                      : t('equipe_position_inconnue')}
                  </Text>
                  <View style={styles.lienHotel}>
                    <Text style={styles.lienFicheEquipe}>{t('taxi_fiche_ouvrir')}</Text>
                    <Ionicons name="chevron-forward" size={18} color={couleurs.primaire} />
                  </View>
                </Carte>
              </Pressable>
            );
          })}
        </View>
      ))}

        </>
      )}

      {/* Demandes en liste d'attente du taxi partagé : clients à recontacter
          — le voyant s'éteint quand une annonce correspondante est sortie. */}
      {section === 'attentes' && (
        <>
          <Text style={styles.titreSection}>🕐 {t('equipe_stat_attentes')}</Text>
          <EncartInfo icone="notifications-outline">{t('equipe_attentes_intro')}</EncartInfo>
          {attentes.length === 0 && (
            <EncartInfo icone="checkmark-circle-outline" ton="succes">
              {t('equipe_attentes_vide')}
            </EncartInfo>
          )}
          {attentes.map((demande) => (
            <Carte key={demande.id}>
              <View style={styles.ligneDetails}>
                <Text style={styles.itineraire}>
                  {demande.origin}  →  {demande.destination}
                </Text>
                {demande.matched_at ? (
                  <Badge texte={t('equipe_attente_trouvee')} ton="succes" />
                ) : (
                  <Badge texte={t('equipe_attente_ouverte')} ton="attente" />
                )}
              </View>
              <Text style={styles.detail}>
                {demande.full_name} · {demande.phone ?? demande.email ?? '—'} ·{' '}
                {t('places_detail', { n: demande.seats })}
                {demande.desired_date ? ` · ${String(demande.desired_date).slice(0, 10)}` : ''}
              </Text>
              {!!demande.phone && (
                <Bouton
                  titre={t('equipe_attente_contacter')}
                  icone="logo-whatsapp"
                  variante="secondaire"
                  onPress={() =>
                    Linking.openURL(`https://wa.me/${String(demande.phone).replace('+', '')}`)
                  }
                />
              )}
            </Carte>
          ))}
        </>
      )}

      {/* 7-8. Clients / Locaux : recherche par nom ou téléphone, radiation. */}
      {(section === 'clients' || section === 'locaux') && (
        <>
          <Text style={styles.titreSection}>
            {section === 'clients' ? t('equipe_stat_clients') : t('equipe_stat_locaux')}
          </Text>
          <EncartInfo icone="search-outline">{t('equipe_recherche_intro')}</EncartInfo>
          <Champ
            label={t('equipe_recherche_label')}
            value={recherche}
            onChangeText={setRecherche}
            autoCapitalize="none"
            placeholder="Amina / +255712…"
          />
          <Bouton
            titre={t('equipe_recherche_bouton')}
            icone="search-outline"
            onPress={() => lancerRecherche()}
            charge={rechercheEnCours}
          />
          {rechercheFaite && resultats.length === 0 && (
            <EncartInfo icone="help-circle-outline" ton="attente">
              {t('equipe_recherche_vide')}
            </EncartInfo>
          )}
          {resultats.map((profil) => {
            const bloque = !!champ(profil, 'banned_at', 'bannedAt');
            const nom = String(champ(profil, 'full_name', 'fullName') ?? '?');
            const type = String(champ(profil, 'account_type', 'accountType') ?? '—');
            return (
              <Carte key={profil.id}>
                <View style={styles.ligneDetails}>
                  <Text style={styles.itineraire}>{nom}</Text>
                  {bloque ? (
                    <Badge texte={t('equipe_profil_bloque')} ton="danger" />
                  ) : (
                    // Le type de compte en toutes lettres (mêmes libellés que
                    // l'inscription), plus le code brut « tourist/resident ».
                    <Badge
                      texte={
                        type === 'tourist'
                          ? t('client_type_touriste')
                          : type === 'resident'
                            ? t('client_type_resident')
                            : type === 'local'
                              ? t('client_type_local')
                              : type
                      }
                      ton="primaire"
                    />
                  )}
                </View>
                <Text style={styles.detail}>{String(champ(profil, 'phone') ?? '')}</Text>
                {/* Suivi parrainage : qui a amené ce client, et où en est la
                    récompense (acquise après 2 courses terminées). */}
                {!!champ(profil, 'referred_by_name', 'referredByName') && (
                  <Text style={styles.detail}>
                    🤝 {t('equipe_parraine_par', {
                      nom: String(champ(profil, 'referred_by_name', 'referredByName')),
                    })}{' '}
                    {champ(profil, 'referral_rewarded_at', 'referralRewardedAt')
                      ? `— ${t('equipe_parrainage_acquis')}`
                      : `— ${t('equipe_parrainage_progres', {
                          n: String(
                            Math.min(
                              Number(
                                champ(profil, 'filleul_courses_terminees', 'filleulCoursesTerminees') ?? 0
                              ),
                              2
                            )
                          ),
                        })}`}
                  </Text>
                )}
                {bloque ? (
                  <Bouton
                    titre={t('equipe_reintegrer')}
                    icone="refresh-outline"
                    onPress={() => basculerBlocageClient(profil, false)}
                    charge={actionEnCours === profil.id}
                  />
                ) : (
                  <Bouton
                    titre={t('equipe_radier_client')}
                    icone="close-circle-outline"
                    variante="danger"
                    onPress={() => radierClient(profil)}
                    charge={actionEnCours === profil.id}
                  />
                )}
              </Carte>
            );
          })}
        </>
      )}

      {section === null && (
        <>
          {/* Alertes instantanées : une réservation fait sonner ce téléphone
              en une à trois secondes, là où la passerelle WhatsApp gratuite
              met une trentaine de secondes à remettre son message. */}
          <Carte>
            <Text style={styles.titreSection}>{t('alertes_titre')}</Text>
            {etatPush === 'actif' ? (
              <>
                <EncartInfo icone="notifications" ton="succes">
                  {t('alertes_actives')}
                </EncartInfo>
                <Bouton
                  titre={t('alertes_tester')}
                  icone="volume-high-outline"
                  variante="secondaire"
                  onPress={essayerAlerte}
                  charge={actionEnCours === 'alerte-test'}
                />
                <Bouton
                  titre={t('alertes_couper')}
                  icone="notifications-off-outline"
                  variante="secondaire"
                  onPress={couperAlertes}
                />
              </>
            ) : etatPush === 'indisponible' ? (
              <EncartInfo icone="information-circle-outline" ton="attente">
                {surIphoneSansInstallation() ? t('alertes_iphone') : t('alertes_indisponible')}
              </EncartInfo>
            ) : (
              <>
                <EncartInfo icone="notifications-outline">{t('alertes_intro')}</EncartInfo>
                <Bouton
                  titre={t('alertes_activer')}
                  icone="notifications-outline"
                  onPress={allumerAlertes}
                  charge={actionEnCours === 'alerte-on'}
                />
              </>
            )}
            {!!messageAlertes && <Text style={styles.detail}>{messageAlertes}</Text>}
          </Carte>

          {/* Sauvegarde complète de la base (clients, courses, paiements…) :
              à télécharger régulièrement, surtout avant toute échéance de
              l'hébergement de la base. */}
          <Bouton
            titre={t('equipe_sauvegarde_bouton')}
            icone="download-outline"
            variante="secondaire"
            onPress={telechargerLaSauvegarde}
            charge={sauvegardeEnCours}
          />
          <Bouton
            titre={t('equipe_quitter')}
            icone="log-out-outline"
            variante="secondaire"
            onPress={quitter}
          />
        </>
      )}
    </Ecran>
  );
}

const styles = stylesReactifs(() => ({
  explication: {
    fontSize: 14,
    color: couleurs.texteSecondaire,
    lineHeight: 20,
  },
  titreSection: {
    fontSize: 16,
    fontWeight: '800',
    color: couleurs.encre,
    marginTop: espaces.m,
  },
  itineraire: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
    lineHeight: 21,
    // Dans une rangée avec un badge à droite : le texte se replie sur
    // plusieurs lignes au lieu de pousser le badge hors de l'écran
    // (indispensable depuis le nom complet de l'aéroport).
    flexShrink: 1,
  },
  enTete: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  lienHotel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaces.xs,
  },
  nomHotelLien: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: couleurs.primaireFonce,
  },
  soldeHotel: {
    fontSize: 16,
    fontWeight: '800',
    color: couleurs.primaireFonce,
    fontVariant: ['tabular-nums'],
  },
  fleche: {
    color: couleurs.primaire,
    fontWeight: '800',
  },
  ligneDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  lienFicheEquipe: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.primaireFonce,
    paddingTop: espaces.xs,
  },
  // Historique des courses passées : en-têtes de jour + lignes compactes.
  enTeteJour: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    paddingVertical: espaces.m,
    paddingHorizontal: espaces.s,
  },
  texteJour: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '700',
    color: couleurs.primaireFonce,
    textTransform: 'capitalize',
  },
  compteJour: {
    fontSize: 12.5,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  // TAXIS PARTAGÉS. Les cartes des annonces ouvertes portent un filet corail :
  // ce sont elles qu'on travaille. La pastille dit LE chiffre qui compte.
  cartePartage: { borderLeftWidth: 3, borderLeftColor: couleurs.primaire },
  entetePartage: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.s,
  },
  pastillePartage: {
    backgroundColor: couleurs.primaire,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pastillePartageOk: { backgroundColor: couleurs.succes },
  // Le blanc était écrit en dur, du temps où `primaire` était le corail.
  // Sur le lagon, `primaire` est presque blanc : la pastille « 3 à vendre »
  // affichait du blanc sur du blanc. Chaque aplat a désormais son texte.
  textePastillePartage: { color: couleurs.surPrimaire, fontSize: 12, fontWeight: '800' },
  textePastillePartageOk: { color: couleurs.surSucces },
  departPartage: { fontSize: 14, fontWeight: '600', color: couleurs.primaireFonce },
  // La jauge des sièges : un carré par place. Plein = payé, cerclé = réservé
  // mais pas réglé, pâle = encore à vendre.
  jauge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginVertical: espaces.xs },
  siege: {
    width: 24,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: couleurs.texteSecondaire,
    opacity: 0.35,
  },
  siegePaye: { backgroundColor: couleurs.succes, borderColor: couleurs.succes, opacity: 1 },
  siegeReserve: { borderColor: couleurs.primaire, borderWidth: 2.5, opacity: 1 },
  bilanPartage: { fontSize: 12, color: couleurs.texteSecondaire, marginLeft: 4, flexShrink: 1 },
  gainPartage: { fontSize: 13, fontWeight: '700', color: couleurs.succes },
  // Annonce terminée : une ligne compacte, comme l'historique des courses.
  lignePartageFinie: {
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.bouton,
    padding: espaces.m,
    marginBottom: espaces.s,
    gap: 4,
    opacity: 0.75,
  },
  bilanFin: { fontSize: 13, fontWeight: '700', color: couleurs.texteSecondaire },
  lignePassee: {
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.bouton,
    padding: espaces.m,
    marginBottom: espaces.s,
    gap: 4,
  },
  // Courses à venir : même gabarit que l'historique, mais un filet corail à
  // gauche et une heure en évidence — ce sont des rendez-vous, pas des
  // archives, et l'œil doit les distinguer d'un coup.
  enTeteJourAVenir: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    paddingVertical: espaces.m,
    paddingHorizontal: espaces.s,
  },
  // La course qui roule : un filet turquoise à gauche, comme les autres,
  // qui vire au corail dès qu'elle dure anormalement longtemps.
  ligneEnCours: {
    backgroundColor: couleurs.surface,
    borderRadius: rayons.bouton,
    borderLeftWidth: 3,
    borderLeftColor: couleurs.primaire,
    padding: espaces.m,
    marginBottom: espaces.s,
    gap: 6,
  },
  ligneEnCoursTraine: {
    borderLeftColor: couleurs.orange,
  },
  rangeeChrono: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chrono: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
    color: couleurs.primaireFonce,
  },
  chronoTraine: {
    color: couleurs.orange,
  },
  detailEnCours: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
  },
  ligneAVenir: {
    backgroundColor: couleurs.surface,
    borderRadius: rayons.bouton,
    borderLeftWidth: 3,
    borderLeftColor: couleurs.primaire,
    padding: espaces.m,
    marginBottom: espaces.s,
    gap: 4,
  },
  heureAVenir: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.primaireFonce,
  },
  entetePassee: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  prixPassee: {
    fontSize: 13.5,
    fontWeight: '800',
    color: couleurs.primaire,
    flexShrink: 0,
  },
  piedPassee: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  lignePaiement: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.s,
  },
  ligneDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs,
  },
  detail: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
  },
  // Fiche détaillée dépliée au clic : bloc séparé par un filet, sous la carte.
  detailsCourse: {
    marginTop: espaces.s,
    paddingTop: espaces.s,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    gap: espaces.xs,
  },
  detailsTitre: {
    fontSize: 12,
    fontWeight: '700',
    color: couleurs.texteSecondaire,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  prix: {
    fontSize: 15,
    fontWeight: '800',
    color: couleurs.primaire,
  },
  rangeeDocs: {
    gap: espaces.s,
  },
  rangeeActions: {
    flexDirection: 'row',
    gap: espaces.m,
  },
  demiAction: {
    flex: 1,
  },
  introMenu: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
    marginTop: -espaces.s,
  },
  bandeauAbonnes: {
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.carte,
    padding: espaces.l,
    gap: espaces.m,
    ...ombres.carte,
  },
  titreAbonnes: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.texteSecondaire,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  rangeeAbonnes: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colAbonnes: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  filetAbonnes: {
    width: 1,
    height: 34,
    backgroundColor: couleurs.bordure,
  },
  nbAbonnes: {
    fontSize: 24,
    fontWeight: '800',
    color: couleurs.primaire,
  },
  labelAbonnes: {
    fontSize: 12,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  bandeauCa: {
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.carte,
    paddingHorizontal: espaces.l,
    paddingVertical: espaces.m,
    gap: espaces.s,
    ...ombres.carte,
  },
  enTeteCa: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  // Jamais écrasé par le titre : le raccourci garde sa largeur.
  droiteEnTeteCa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs,
    flexShrink: 0,
  },
  astuceCa: {
    fontSize: 11,
    color: couleurs.texteSecondaire,
  },
  ligneCa: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  gaucheCa: {
    flexShrink: 1,
    gap: 1,
  },
  labelCa: {
    fontSize: 14,
    fontWeight: '700',
    color: couleurs.encre,
  },
  detailCa: {
    fontSize: 12,
    color: couleurs.texteSecondaire,
  },
  droiteCa: {
    alignItems: 'flex-end',
    gap: 1,
  },
  montantCa: {
    fontSize: 15,
    fontWeight: '800',
    color: couleurs.primaire,
  },
  netCa: {
    fontSize: 12,
    fontWeight: '700',
    color: couleurs.succes,
  },
  // Gain net du jour : le chiffre en GRAND, en shillings, au centre.
  heroCa: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: espaces.s,
  },
  heroMontantCa: {
    fontSize: 30,
    fontWeight: '800',
    color: couleurs.succes,
  },
  heroLabelCa: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.encre,
  },
  heroDetailCa: {
    fontSize: 12.5,
    color: couleurs.texteSecondaire,
  },
  heroSousCa: {
    fontSize: 12,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  // Rubrique paiements : remboursement dû + paiements reçus.
  montantRembourser: {
    fontSize: 14,
    fontWeight: '800',
    color: couleurs.danger,
  },
  ligneRecu: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: espaces.s,
  },
  // VERT : argent déjà encaissé automatiquement (crédit prépayé hôtel).
  badgeRecuCredit: {
    fontSize: 12.5,
    fontWeight: '700',
    color: couleurs.succes,
    backgroundColor: couleurs.succesFond,
    paddingHorizontal: espaces.s,
    paddingVertical: 2,
    borderRadius: rayons.pastille,
    overflow: 'hidden',
  },
  // ORANGE : validé à la main par l'équipe (bouton « Marquer payé »).
  badgeValideMain: {
    fontSize: 12.5,
    fontWeight: '700',
    color: couleurs.attente,
    backgroundColor: couleurs.attenteFond,
    paddingHorizontal: espaces.s,
    paddingVertical: 2,
    borderRadius: rayons.pastille,
    overflow: 'hidden',
  },
  // ORANGE : paiement pas encore fait (à encaisser).
  badgeAttentePaiement: {
    fontSize: 12.5,
    fontWeight: '700',
    color: couleurs.attente,
    backgroundColor: couleurs.attenteFond,
    paddingHorizontal: espaces.s,
    paddingVertical: 2,
    borderRadius: rayons.pastille,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  dateRecu: {
    fontSize: 12,
    color: couleurs.texteSecondaire,
    marginLeft: 'auto',
  },
  retourMenu: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs,
    paddingVertical: espaces.s,
    alignSelf: 'flex-start',
  },
  texteRetourMenu: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.primaireFonce,
  },
  groupeVille: {
    gap: espaces.m,
  },
  enTeteVille: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    marginTop: espaces.xs,
  },
  texteVille: {
    fontSize: 14,
    fontWeight: '800',
    color: couleurs.primaireFonce,
    letterSpacing: 0.3,
  },
  filetVille: {
    flex: 1,
    height: 1,
    backgroundColor: couleurs.bordure,
  },
}));
