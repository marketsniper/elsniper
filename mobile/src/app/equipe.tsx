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
// La clé est persistée dans SecureStore et vérifiée par un premier appel.
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

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
import { api, definirCleEquipe, ErreurApi, type StatsAbonnes } from '@/lib/api';
import { formaterDateRelativeI18n, libelleTypeTrajet, useT } from '@/lib/i18n';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import {
  champ,
  formaterMontant,
  formaterPrix,
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
type SectionEquipe = 'courses' | 'paiements' | 'candidatures' | 'comptes' | 'hotels' | 'taxis';

// Libellé d'un chauffeur dans le sélecteur d'assignation.
function libelleChauffeur(chauffeur: Chauffeur): string {
  const nom = champ<string>(chauffeur, 'full_name', 'fullName') ?? '?';
  const plaque = champ<string>(chauffeur, 'vehicle_plate', 'vehiclePlate');
  return plaque ? `${nom} · ${plaque}` : nom;
}

export default function EcranEquipe() {
  const { t } = useT();
  // null = lecture de SecureStore en cours ; '' = pas de clé enregistrée.
  const [cle, setCle] = useState<string | null>(null);
  const [saisie, setSaisie] = useState('');
  const [chargeActivation, setChargeActivation] = useState(false);
  const [erreur, setErreur] = useState('');

  const [courses, setCourses] = useState<Trajet[]>([]);
  const [paiements, setPaiements] = useState<PaiementEquipe[]>([]);
  const [candidats, setCandidats] = useState<Chauffeur[]>([]);
  const [clients, setClients] = useState<Utilisateur[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  // Compteurs d'abonnés (clients / locaux / hôtels) affichés en tête de menu.
  const [abonnes, setAbonnes] = useState<StatsAbonnes | null>(null);
  // Rubrique ouverte (null = menu en grille de cases).
  const [section, setSection] = useState<SectionEquipe | null>(null);
  // Chauffeur choisi par course (libellé du sélecteur), avant confirmation.
  const [choixChauffeur, setChoixChauffeur] = useState<Record<string, string>>({});
  // Id de l'élément dont l'action est en cours (bouton en chargement).
  const [actionEnCours, setActionEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setErreur('');
    try {
      const [lesCourses, lesPaiements, lesCandidats, lesClients, lesHotels, lesChauffeurs, lesAbonnes] =
        await Promise.all([
          api.listerCoursesEquipe('requested'),
          api.listerPaiementsEquipe(),
          api.listerCandidaturesChauffeurs(),
          api.listerClientsEnAttente(),
          api.listerHotelsEnAttente(),
          api.listerChauffeursVerifies(),
          api.statsAbonnes().catch(() => null),
        ]);
      setCourses(lesCourses);
      setPaiements(lesPaiements);
      setCandidats(lesCandidats);
      setClients(lesClients);
      setHotels(lesHotels);
      setChauffeurs(lesChauffeurs);
      setAbonnes(lesAbonnes);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('equipe_action_erreur'));
    }
  }, [t]);

  // Lecture de la clé enregistrée au montage ; si présente, mode actif direct.
  useEffect(() => {
    (async () => {
      const enregistree = (await SecureStore.getItemAsync(CLE_STOCKAGE)) ?? '';
      if (enregistree) definirCleEquipe(enregistree);
      setCle(enregistree);
    })();
  }, []);

  useEffect(() => {
    if (cle) charger();
  }, [cle, charger]);

  const activer = async () => {
    const candidate = saisie.trim();
    if (!candidate) return;
    setChargeActivation(true);
    setErreur('');
    definirCleEquipe(candidate);
    try {
      await api.listerCoursesEquipe('requested');
      await SecureStore.setItemAsync(CLE_STOCKAGE, candidate);
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
    await SecureStore.deleteItemAsync(CLE_STOCKAGE);
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

  // Les six cases du menu — compteur en or dès qu'une action attend.
  const rubriques: {
    cle: SectionEquipe;
    label: string;
    icone: React.ComponentProps<typeof Ionicons>['name'];
    n: number;
    action: boolean;
  }[] = [
    { cle: 'courses', label: t('equipe_stat_courses'), icone: 'car-outline', n: courses.length, action: true },
    { cle: 'paiements', label: t('equipe_stat_paiements'), icone: 'cash-outline', n: paiements.length, action: true },
    { cle: 'candidatures', label: t('equipe_stat_candidatures'), icone: 'document-text-outline', n: candidats.length, action: true },
    { cle: 'comptes', label: t('equipe_stat_comptes'), icone: 'id-card-outline', n: clients.length, action: true },
    { cle: 'hotels', label: t('equipe_stat_hotels'), icone: 'business-outline', n: hotels.length, action: true },
    { cle: 'taxis', label: t('equipe_stat_taxis'), icone: 'location-outline', n: chauffeurs.length, action: false },
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

          <Text style={styles.titreSection}>{t('equipe_resume_titre')}</Text>
          <Text style={styles.introMenu}>{t('equipe_menu_intro')}</Text>
          <View style={styles.grilleMenu}>
            {rubriques.map((rubrique) => (
              <Pressable
                key={rubrique.cle}
                onPress={() => setSection(rubrique.cle)}
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

      {/* 2. Paiements en attente */}
      {section === 'paiements' && (
        <>
      <Text style={styles.titreSection}>
        {t('equipe_paiements')} ({paiements.length})
      </Text>
      {paiements.length === 0 && (
        <EncartInfo icone="checkmark-circle-outline" ton="succes">
          {t('equipe_paiements_vide')}
        </EncartInfo>
      )}
      {paiements.map((paiement) => {
        const estColis = !!paiement.package_id;
        const depart = estColis ? paiement.package_pickup : paiement.trip_pickup;
        const arrivee = estColis ? paiement.package_dropoff : paiement.trip_dropoff;
        const montant = formaterMontant(
          Number(champ(paiement, 'amount') ?? 0),
          String(champ(paiement, 'currency') ?? 'TZS')
        );
        return (
          <Carte key={paiement.id}>
            <View style={styles.ligneDetails}>
              <Badge
                texte={estColis ? t('equipe_paiement_colis') : t('equipe_paiement_course')}
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
            {!estColis && !!paiement.trip_client_name && (
              <Text style={styles.detail}>{paiement.trip_client_name}</Text>
            )}
            <Bouton
              titre={t('equipe_marquer_paye')}
              icone="cash-outline"
              onPress={() => agir(paiement.id, () => api.confirmerPaiement(paiement.id))}
              charge={actionEnCours === paiement.id}
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
            return (
              <Carte key={chauffeur.id}>
                <Text style={styles.itineraire}>{libelleChauffeur(chauffeur)}</Text>
                <Text style={styles.detail}>
                  {String(champ(chauffeur, 'vehicle_model', 'vehicleModel') ?? '—')} ·{' '}
                  {String(champ(chauffeur, 'phone') ?? '')}
                </Text>
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

      {section === null && (
        <Bouton
          titre={t('equipe_quitter')}
          icone="log-out-outline"
          variante="secondaire"
          onPress={quitter}
        />
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
