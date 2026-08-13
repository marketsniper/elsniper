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
import { ecrireStockage, lireStockage, supprimerStockage } from '@/lib/stockage';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Selecteur } from '@/components/Selecteur';
import {
  Badge,
  Bouton,
  Carte,
  Champ,
  ChargementCentre,
  Ecran,
  EncartInfo,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, definirCleEquipe, ErreurApi, type AttentePartage, type StatsAbonnes } from '@/lib/api';
import { formaterDateRelativeI18n, libelleTypeTrajet, useT } from '@/lib/i18n';
import { useRafraichissementAuto } from '@/lib/rafraichissementAuto';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import {
  champ,
  formaterMontant,
  formaterPrix,
  totalEnTzs,
  type Chauffeur,
  type Hotel,
  type PaiementEquipe,
  type Trajet,
  type TypeTrajet,
  type Utilisateur,
} from '@/lib/types';

const CLE_STOCKAGE = 'zanzigo.cle_equipe';

// Rubriques du tableau de bord — le menu est une grille de cases (comme un
// écran d'accueil de téléphone), chaque case ouvre sa rubrique.
type SectionEquipe =
  | 'courses'
  | 'paiements'
  | 'candidatures'
  | 'comptes'
  | 'hotels'
  | 'taxis'
  | 'clients'
  | 'locaux'
  | 'attentes';

// Libellé d'un chauffeur dans le sélecteur d'assignation.
function libelleChauffeur(chauffeur: Chauffeur): string {
  const nom = champ<string>(chauffeur, 'full_name', 'fullName') ?? '?';
  const plaque = champ<string>(chauffeur, 'vehicle_plate', 'vehiclePlate');
  return plaque ? `${nom} · ${plaque}` : nom;
}

export default function EcranEquipe() {
  const { t } = useT();
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
  const [candidats, setCandidats] = useState<Chauffeur[]>([]);
  const [clients, setClients] = useState<Utilisateur[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  // Compteurs d'abonnés (clients / locaux / hôtels) affichés en tête de menu.
  const [abonnes, setAbonnes] = useState<StatsAbonnes | null>(null);
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
  const [montantsCredit, setMontantsCredit] = useState<Record<string, string>>({});
  // Liste d'attente du taxi partagé : demandes clients à recontacter.
  const [attentes, setAttentes] = useState<AttentePartage[]>([]);
  // Dates d'expiration saisies par chauffeur (permis / assurance).
  const [datesDocs, setDatesDocs] = useState<Record<string, { permis: string; assurance: string }>>({});
  // Sauvegarde de la base : téléchargement en cours.
  const [sauvegardeEnCours, setSauvegardeEnCours] = useState(false);

  const charger = useCallback(async () => {
    setErreur('');
    try {
      const [lesCourses, lesPaiements, lesCandidats, lesClients, lesHotels, lesChauffeurs, lesAbonnes, lesVerifies, lesRemboursements, lesRecus, lesAttentes] =
        await Promise.all([
          api.listerCoursesEquipe('requested'),
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
        ]);
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
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('equipe_action_erreur'));
    }
  }, [t]);

  // Crédite (montant positif) ou corrige (négatif) le compte d'un hôtel.
  const crediterUnHotel = async (hotelId: string) => {
    const montant = Number((montantsCredit[hotelId] ?? '').replace(',', '.'));
    if (!Number.isFinite(montant) || montant === 0) return;
    setActionEnCours(hotelId);
    setErreur('');
    try {
      await api.crediterHotel(hotelId, montant);
      setMontantsCredit((prev) => ({ ...prev, [hotelId]: '' }));
      await charger();
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('equipe_action_erreur'));
    } finally {
      setActionEnCours(null);
    }
  };

  // Pose les dates d'expiration permis/assurance d'un chauffeur (AAAA-MM-JJ).
  const majDatesChauffeur = async (chauffeurId: string) => {
    const saisieDates = datesDocs[chauffeurId] ?? { permis: '', assurance: '' };
    const permis = saisieDates.permis.trim();
    const assurance = saisieDates.assurance.trim();
    const formatOk = (v: string) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (!formatOk(permis) || !formatOk(assurance) || (permis === '' && assurance === '')) {
      setErreur(t('equipe_docs_format'));
      return;
    }
    setActionEnCours(`docs-${chauffeurId}`);
    setErreur('');
    try {
      await api.majDocumentsChauffeur(chauffeurId, {
        licenseExpiresOn: permis || undefined,
        insuranceExpiresOn: assurance || undefined,
      });
      setDatesDocs((prev) => ({ ...prev, [chauffeurId]: { permis: '', assurance: '' } }));
      await charger();
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('equipe_action_erreur'));
    } finally {
      setActionEnCours(null);
    }
  };

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
    setCourses([]);
    setPaiements([]);
    setCandidats([]);
    setClients([]);
    setHotels([]);
    setChauffeurs([]);
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
  const radierChauffeur = (chauffeur: Chauffeur) => {
    const nom = champ<string>(chauffeur, 'full_name', 'fullName') ?? '?';
    Alert.alert(t('equipe_radier_titre'), t('equipe_radier_texte', { nom }), [
      { text: t('commun_annuler'), style: 'cancel' },
      {
        text: t('equipe_radier_confirmer'),
        style: 'destructive',
        onPress: () => agir(chauffeur.id, () => api.verifierChauffeur(chauffeur.id, 'rejected')),
      },
    ]);
  };

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

  // Les six cases du menu — compteur ORANGE dès qu'une action attend
  // (paiements pas encore encaissés compris : le vert est réservé aux
  // paiements par crédit hôtel, déjà dans la caisse).
  const rubriques: {
    cle: SectionEquipe;
    label: string;
    icone: React.ComponentProps<typeof Ionicons>['name'];
    n: number;
    action: boolean;
  }[] = [
    { cle: 'courses', label: t('equipe_stat_courses'), icone: 'car-outline', n: courses.length, action: true },
    { cle: 'attentes', label: t('equipe_stat_attentes'), icone: 'notifications-outline', n: attentes.filter((a) => !a.matched_at).length, action: true },
    { cle: 'paiements', label: t('equipe_stat_paiements'), icone: 'cash-outline', n: paiements.length + remboursements.length, action: true },
    { cle: 'candidatures', label: t('equipe_stat_candidatures'), icone: 'document-text-outline', n: candidats.length, action: true },
    { cle: 'comptes', label: t('equipe_stat_comptes'), icone: 'id-card-outline', n: clients.length, action: true },
    { cle: 'hotels', label: t('equipe_stat_hotels'), icone: 'business-outline', n: hotels.length, action: true },
    { cle: 'taxis', label: t('equipe_stat_taxis'), icone: 'location-outline', n: chauffeurs.length, action: false },
    { cle: 'clients', label: t('equipe_stat_clients'), icone: 'people-outline', n: abonnes?.clients ?? 0, action: false },
    { cle: 'locaux', label: t('equipe_stat_locaux'), icone: 'card-outline', n: abonnes?.locals ?? 0, action: false },
  ];

  // ----- Tableau de bord ----------------------------------------------------
  return (
    <Ecran fond="vagues" onRefresh={charger}>
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
                <Text style={styles.titreAbonnes}>💰 {t('equipe_ca_titre')}</Text>
                <View style={styles.droiteEnTeteCa}>
                  {!caOuvert && (
                    <Text style={styles.astuceCa}>{t('equipe_ca_ouvrir')}</Text>
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
          <Text style={styles.introMenu}>{t('equipe_menu_intro')}</Text>
          <View style={styles.grilleMenu}>
            {rubriques.map((rubrique) => (
              <Pressable
                key={rubrique.cle}
                onPress={() => ouvrirSection(rubrique.cle)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.caseMenu, pressed && { opacity: 0.75 }]}
              >
                <View style={styles.bulleMenu}>
                  <Ionicons name={rubrique.icone} size={26} color={couleurs.primaire} />
                </View>
                <Text style={styles.labelMenu}>{rubrique.label}</Text>
                <View
                  style={[
                    styles.pastilleMenu,
                    rubrique.action && rubrique.n > 0 && styles.pastilleMenuAction,
                  ]}
                >
                  <Text
                    style={[
                      styles.textePastilleMenu,
                      rubrique.action && rubrique.n > 0 && styles.textePastilleMenuAction,
                    ]}
                  >
                    {rubrique.n}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
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
        {t('equipe_courses')} ({courses.length})
      </Text>
      {courses.length === 0 && (
        <EncartInfo icone="checkmark-circle-outline" ton="succes">
          {t('equipe_courses_vide')}
        </EncartInfo>
      )}
      {courses.map((course) => {
        const type = champ<TypeTrajet>(course, 'trip_type', 'tripType');
        const nomClient = champ<string>(course, 'client_name', 'clientName');
        return (
          <Carte key={course.id}>
            <Text style={styles.itineraire}>
              {String(champ(course, 'pickup_location', 'pickupLocation') ?? '?')}{'  '}
              <Text style={styles.fleche}>→</Text>{'  '}
              {String(champ(course, 'dropoff_location', 'dropoffLocation') ?? '?')}
            </Text>
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
                    <Bouton
                      titre={`📍 ${String(champ(choisi, 'zone') ?? '—')} · ${t('equipe_position')} · ${formaterDateRelativeI18n(majPosition, t)}`}
                      icone="location-outline"
                      variante="secondaire"
                      onPress={() => Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}`)}
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
              {documents.map(
                ([libelle, url]) =>
                  typeof url === 'string' &&
                  !!url && (
                    <Bouton
                      key={libelle}
                      titre={libelle}
                      icone="document-attach-outline"
                      variante="secondaire"
                      onPress={() => Linking.openURL(url)}
                    />
                  )
              )}
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
                onPress={() => Linking.openURL(document)}
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
            <Text style={styles.itineraire}>{String(champ(lHotel, 'name') ?? '?')}</Text>
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
        <EncartInfo icone="wallet-outline">{t('equipe_credit_conseil')}</EncartInfo>
      )}
      {hotelsVerifies.map((lHotel) => (
        <Carte key={`credit-${lHotel.id}`}>
          <View style={styles.enTete}>
            <Text style={styles.itineraire}>{String(champ(lHotel, 'name') ?? '?')}</Text>
            <Text style={styles.soldeHotel}>
              {formaterMontant(Number(champ(lHotel, 'credit_balance', 'creditBalance') ?? 0), 'USD')}
            </Text>
          </View>
          <View style={styles.rangeeActions}>
            <View style={styles.demiAction}>
              <Champ
                label={t('equipe_credit_montant')}
                value={montantsCredit[lHotel.id] ?? ''}
                onChangeText={(texte) =>
                  setMontantsCredit((prev) => ({ ...prev, [lHotel.id]: texte }))
                }
                keyboardType="numbers-and-punctuation"
                placeholder="50"
              />
            </View>
            <View style={styles.demiAction}>
              <Bouton
                titre={t('equipe_crediter')}
                icone="add-circle-outline"
                onPress={() => crediterUnHotel(lHotel.id)}
                charge={actionEnCours === lHotel.id}
              />
            </View>
          </View>
        </Carte>
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
            const saisieDates = datesDocs[chauffeur.id] ?? { permis: '', assurance: '' };
            return (
              <Carte key={chauffeur.id}>
                <View style={styles.ligneDetails}>
                  <Text style={styles.itineraire}>{libelleChauffeur(chauffeur)}</Text>
                  {docsAlerte && <Badge texte={t('equipe_docs_alerte')} ton="danger" />}
                </View>
                <Text style={styles.detail}>
                  {String(champ(chauffeur, 'vehicle_model', 'vehicleModel') ?? '—')} ·{' '}
                  {String(champ(chauffeur, 'phone') ?? '')}
                </Text>
                {/* Expiration des documents (suivies pour l'alerte auto). */}
                <Text style={styles.detail}>
                  📄 {t('equipe_docs_permis')} :{' '}
                  {expPermis ? String(expPermis).slice(0, 10) : '—'} ·{' '}
                  {t('equipe_docs_assurance')} :{' '}
                  {expAssurance ? String(expAssurance).slice(0, 10) : '—'}
                </Text>
                <Champ
                  label={`${t('equipe_docs_permis')} (AAAA-MM-JJ)`}
                  value={saisieDates.permis}
                  onChangeText={(v) =>
                    setDatesDocs((prev) => ({
                      ...prev,
                      [chauffeur.id]: { ...saisieDates, permis: v },
                    }))
                  }
                  placeholder="2026-12-31"
                />
                <Champ
                  label={`${t('equipe_docs_assurance')} (AAAA-MM-JJ)`}
                  value={saisieDates.assurance}
                  onChangeText={(v) =>
                    setDatesDocs((prev) => ({
                      ...prev,
                      [chauffeur.id]: { ...saisieDates, assurance: v },
                    }))
                  }
                  placeholder="2026-12-31"
                />
                {(saisieDates.permis.trim() !== '' || saisieDates.assurance.trim() !== '') && (
                  <Bouton
                    titre={t('equipe_docs_enregistrer')}
                    icone="save-outline"
                    variante="secondaire"
                    onPress={() => majDatesChauffeur(chauffeur.id)}
                    charge={actionEnCours === `docs-${chauffeur.id}`}
                  />
                )}
                {positionConnue ? (
                  <Bouton
                    titre={`${t('equipe_position')} · ${formaterDateRelativeI18n(majPosition, t)}`}
                    icone="location-outline"
                    variante="secondaire"
                    onPress={() => Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}`)}
                  />
                ) : (
                  <View style={styles.ligneDetail}>
                    <Ionicons name="location-outline" size={14} color={couleurs.texteSecondaire} />
                    <Text style={styles.detail}>{t('equipe_position_inconnue')}</Text>
                  </View>
                )}
                <Bouton
                  titre={t('equipe_radier')}
                  icone="close-circle-outline"
                  variante="danger"
                  onPress={() => radierChauffeur(chauffeur)}
                  charge={actionEnCours === chauffeur.id}
                />
              </Carte>
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
                    <Badge texte={type} ton="primaire" />
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

const styles = StyleSheet.create({
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
  grilleMenu: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaces.m,
  },
  caseMenu: {
    flexBasis: '45%',
    flexGrow: 1,
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.carte,
    paddingVertical: espaces.xl,
    paddingHorizontal: espaces.m,
    alignItems: 'center',
    gap: espaces.s,
    ...ombres.carte,
  },
  bulleMenu: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelMenu: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.encre,
    textAlign: 'center',
  },
  pastilleMenu: {
    minWidth: 30,
    alignItems: 'center',
    backgroundColor: couleurs.primaireClair,
    borderRadius: rayons.pastille,
    paddingHorizontal: espaces.s,
    paddingVertical: 3,
  },
  pastilleMenuAction: {
    backgroundColor: couleurs.attenteFond,
  },
  textePastilleMenu: {
    fontSize: 14,
    fontWeight: '800',
    color: couleurs.primaireFonce,
  },
  textePastilleMenuAction: {
    color: couleurs.attente,
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
  droiteEnTeteCa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs,
    flexShrink: 1,
  },
  astuceCa: {
    fontSize: 11,
    color: couleurs.texteSecondaire,
    flexShrink: 1,
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
});
