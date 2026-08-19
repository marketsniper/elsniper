// TABLEAU DE BORD CHAUFFEUR — volontairement minimal.
//
// Nos chauffeurs zanzibarites ne sont pas des habitués des applications :
// l'écran répond à DEUX questions, dans cet ordre, et rien d'autre.
//   1. « Qu'est-ce que je dois faire maintenant ? »  → À FAIRE
//   2. « Qu'est-ce que je peux prendre ? »           → À PRENDRE
// En tête, ce que la journée a rapporté ; en bas, l'historique replié.
//
// Ce qui a été RETIRÉ volontairement : le champ où recopier une référence de
// course (personne ne tape un identifiant à la main) et la séparation
// courses / colis, qui multipliait les sections. Pour le chauffeur, une
// course et un colis sont deux façons de gagner sa journée : même liste.
// Le scanner de QR garde son propre onglet.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Badge,
  BadgeStatutColis,
  BadgeStatutTrajet,
  Bouton,
  Ecran,
  EncartInfo,
  TexteErreur,
} from '@/components/ui';
import { api, ErreurApi, type StatsChauffeur } from '@/lib/api';
import { activerAlertes, etatAlertes } from '@/lib/alertesPush';
import { useAuth } from '@/lib/auth';
import { effacerColisMasques, listerColisMasques, masquerColis } from '@/lib/colisLocal';
import {
  departCourse,
  formaterDateRelativeI18n,
  libelleStatutRide,
  libelleTailleColis,
  useT,
} from '@/lib/i18n';
import { estBalaye, lireCoupDeBalai, passerCoupDeBalai } from '@/lib/menageLocal';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import {
  champ,
  formaterDate,
  formaterMontant,
  formaterPrix,
  totalEnTzs,
  trajetExpire,
  type Colis,
  type Ride,
  type StatutRide,
  type StatutTrajet,
  type Trajet,
} from '@/lib/types';

/** Les cases du menu chauffeur (« Poster un trajet » ouvre un autre écran). */
type CaseChauffeur = 'encours' | 'aprendre' | 'colis' | 'mestrajets';

export default function EcranCourses() {
  const router = useRouter();
  const { session } = useAuth();
  const { t, langue } = useT();
  const [recentes, setRecentes] = useState<Trajet[]>([]);
  // Bourse aux colis : colis payés en attente de ramassage (hôtels en tête).
  // Gains du jour, affichés en tête d'écran : la première chose qu'un
  // chauffeur veut savoir en ouvrant l'app.
  const [statsJour, setStatsJour] = useState<StatsChauffeur | null>(null);
  // Historique replié par défaut : l'écran reste court.
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);
  // QUATRE CASES, une seule à la fois. null = le menu.
  const [caseOuverte, setCaseOuverte] = useState<CaseChauffeur | null>(null);
  // Bourse aux courses : les courses privées encore sans chauffeur.
  const [coursesDispo, setCoursesDispo] = useState<Trajet[]>([]);
  const [colisDispo, setColisDispo] = useState<Colis[]>([]);
  // Mes colis : réservés (« Je prends la livraison ») et en cours de livraison.
  const [mesColis, setMesColis] = useState<Colis[]>([]);
  // Mes trajets postés (taxis partagés) : le chauffeur veut voir ce qu'il a
  // publié et si des places se remplissent, sans repasser par l'onglet.
  const [mesTrajets, setMesTrajets] = useState<Ride[]>([]);
  // Colis masqués par CE chauffeur (« Pas intéressé ») — local au téléphone.
  const [colisMasques, setColisMasques] = useState<string[]>([]);
  const [erreur, setErreur] = useState('');
  const [balai, setBalai] = useState(0);

  const chauffeurId = session?.driver?.id ?? null;

  // Partage de position pendant les livraisons : tant qu'un écran chauffeur
  // est ouvert, la position part au serveur toutes les 45 s — c'est elle que
  // voit l'expéditeur d'un colis en route (« position du chauffeur »).
  const [partagePosition, setPartagePosition] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!chauffeurId) return undefined;
      let actif = true;
      let minuteur: ReturnType<typeof setInterval> | null = null;
      (async () => {
        try {
          const Location = await import('expo-location');
          const { granted } = await Location.requestForegroundPermissionsAsync();
          if (!granted || !actif) return;
          setPartagePosition(true);
          const envoyer = async () => {
            try {
              const pos = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
              await api.envoyerPositionChauffeur(
                chauffeurId,
                pos.coords.latitude,
                pos.coords.longitude
              );
            } catch {
              // silencieux : GPS coupé ou réseau absent, on réessaiera.
            }
          };
          envoyer();
          minuteur = setInterval(envoyer, 45000);
        } catch {
          // Module de localisation indisponible (ancienne version installée).
        }
      })();
      return () => {
        actif = false;
        if (minuteur) clearInterval(minuteur);
        setPartagePosition(false);
      };
    }, [chauffeurId])
  );

  const rafraichir = useCallback(async () => {
    if (!chauffeurId) return;
    try {
      setRecentes(await api.listerCoursesChauffeur(chauffeurId));
    } catch {
      // silencieux : hors-ligne, on garde la dernière liste affichée
    }
    try {
      setStatsJour(await api.statsChauffeur(chauffeurId));
    } catch {
      // silencieux : le bandeau des gains reste discret
    }
    try {
      setCoursesDispo(await api.listerCoursesDisponibles());
    } catch {
      // silencieux : la bourse aux courses reste vide
    }
    try {
      setColisDispo(await api.listerColisARamasser());
    } catch {
      // silencieux : la section colis reste vide
    }
    try {
      setMesColis(await api.listerMesColisChauffeur());
    } catch {
      // silencieux : la section « mes colis » reste vide
    }
    try {
      setMesTrajets(await api.listerMesRides());
    } catch {
      // silencieux : la case « mes trajets » reste vide
    }
    setColisMasques(await listerColisMasques(chauffeurId));
    setBalai(await lireCoupDeBalai('courses', chauffeurId));
  }, [chauffeurId]);

  // « Je prends cette course » : premier arrivé, premier servi. Le serveur
  // tranche (mise à jour atomique) — si un autre a été plus rapide, on le dit
  // clairement et la liste se rafraîchit.
  const [courseEnCours, setCourseEnCours] = useState<string | null>(null);
  const prendreUneCourse = async (course: Trajet) => {
    setCourseEnCours(course.id);
    setErreur('');
    try {
      await api.prendreCourse(course.id);
      Alert.alert(t('courses_dispo_titre'), t('courses_dispo_prise'));
    } catch (e) {
      setErreur(
        e instanceof ErreurApi && e.code === 'course_deja_prise'
          ? t('courses_dispo_trop_tard')
          : e instanceof ErreurApi && e.code === 'driver_not_available'
            ? t('courses_dispo_indisponible')
            : e instanceof ErreurApi
              ? e.message
              : t('equipe_action_erreur')
      );
    } finally {
      setCourseEnCours(null);
      await rafraichir();
    }
  };

  // « Je prends la livraison » depuis la carte : réservation en un clic.
  const [priseEnCours, setPriseEnCours] = useState<string | null>(null);
  const prendreUnColis = (colis: Colis) => {
    Alert.alert(t('colis_prendre_titre'), t('colis_prendre_texte'), [
      { text: t('commun_annuler'), style: 'cancel' },
      {
        text: t('colis_prendre_confirmer'),
        onPress: async () => {
          setPriseEnCours(colis.id);
          setErreur('');
          try {
            const reponse = await api.prendreColis(colis.id);
            const lien = champ<string>(reponse, 'whatsapp_link', 'whatsappLink');
            if (lien) await Linking.openURL(lien);
          } catch (e) {
            setErreur(
              e instanceof ErreurApi && e.code === 'package_already_taken'
                ? t('colis_pris_trop_tard')
                : e instanceof ErreurApi
                  ? e.message
                  : t('equipe_action_erreur')
            );
          } finally {
            setPriseEnCours(null);
            await rafraichir();
          }
        },
      },
    ]);
  };

  // « Pas intéressé » : le colis disparaît de la liste de CE chauffeur
  // seulement — les autres chauffeurs le voient toujours.
  const colisVisibles = colisDispo.filter((c) => !colisMasques.includes(c.id));
  const nbColisMasques = colisDispo.length - colisVisibles.length;

  const masquerUnColis = (colis: Colis) => {
    if (!chauffeurId) return;
    Alert.alert(t('colis_masquer_titre'), t('colis_masquer_texte'), [
      { text: t('commun_annuler'), style: 'cancel' },
      {
        text: t('colis_masquer_confirmer'),
        onPress: async () => {
          await masquerColis(chauffeurId, colis.id);
          setColisMasques((prev) => [...prev, colis.id]);
        },
      },
    ]);
  };

  const reafficherColis = async () => {
    if (!chauffeurId) return;
    await effacerColisMasques(chauffeurId);
    setColisMasques([]);
  };

  // « Faire le ménage » : masque les courses terminées, annulées ou EXPIRÉES
  // (jamais payées, heure passée) antérieures au coup de balai — local au
  // téléphone, les gains restent comptés.
  const estNettoyable = (trajet: Trajet) => {
    const statut = champ<StatutTrajet>(trajet, 'status', 'statut');
    return statut === 'completed' || statut === 'cancelled' || trajetExpire(trajet);
  };
  const coursesVisibles = recentes.filter(
    (trajet) =>
      !estNettoyable(trajet) || !estBalaye(champ(trajet, 'created_at', 'createdAt'), balai)
  );
  const nbNettoyables = coursesVisibles.filter(estNettoyable).length;

  // DEUX QUESTIONS, DEUX LISTES. Ce que le chauffeur doit assurer maintenant
  // (« À faire »), et ce qu'il peut prendre (« À prendre »). Le reste — ses
  // courses terminées — se déplie à la demande, pour ne pas noyer l'écran.
  const coursesEnCours = coursesVisibles.filter((trajet) => {
    const statut = champ<StatutTrajet>(trajet, 'status', 'statut');
    return statut !== 'completed' && statut !== 'cancelled';
  });
  const coursesPassees = coursesVisibles.filter((trajet) => !coursesEnCours.includes(trajet));
  const nbAFaire = coursesEnCours.length + mesColis.length;
  const nbAPrendre = coursesDispo.length + colisVisibles.length;

  // Mes trajets postés : ceux encore en ligne d'abord (le compteur de la case
  // ne compte QUE ceux-là — un trajet clôturé n'appelle aucune action), et le
  // PROCHAIN DÉPART en tête : c'est celui-là que le chauffeur doit préparer.
  // Le serveur décide si les coordonnées du client sont ouvertes : il ne les
  // envoie qu'une fois le paiement validé par l'équipe. (Repli sur le statut
  // pour les anciennes versions de l'API, qui n'envoient pas le drapeau.)
  const contactOuvert = (trajet: Trajet) => {
    const drapeau = champ<boolean>(trajet, 'contact_client_visible');
    if (drapeau !== undefined) return drapeau === true;
    const statut = champ<StatutTrajet>(trajet, 'status', 'statut');
    return statut !== 'requested' && statut !== 'driver_confirmed';
  };

  const quandPart = (ride: Ride) =>
    new Date(String(champ(ride, 'departure_at', 'departureAt') ?? 0)).getTime() || 0;
  const trajetsOuverts = mesTrajets
    .filter((ride) => champ<StatutRide>(ride, 'status', 'statut') === 'open')
    .sort((a, b) => quandPart(a) - quandPart(b));
  // Les clôturés/annulés se lisent à l'envers : le plus récent d'abord.
  const trajetsClos = mesTrajets
    .filter((ride) => champ<StatutRide>(ride, 'status', 'statut') !== 'open')
    .sort((a, b) => quandPart(b) - quandPart(a));

  const faireLeMenage = () => {
    if (!chauffeurId) return;
    Alert.alert(t('menage_titre'), t('menage_texte'), [
      { text: t('commun_annuler'), style: 'cancel' },
      {
        text: t('menage_confirmer'),
        style: 'destructive',
        onPress: async () => setBalai(await passerCoupDeBalai('courses', chauffeurId)),
      },
    ]);
  };

  useFocusEffect(
    useCallback(() => {
      rafraichir();
    }, [rafraichir])
  );


  // La bourse ne sert à rien si le téléphone ne sonne pas : tant que les
  // alertes ne sont pas actives, une bannière impossible à rater propose de
  // les allumer en un geste. (Sur l'app native ou dans Safari non installé,
  // le message renvoyé explique quoi faire.)
  const [etatPush, setEtatPush] = useState<string | null>(null);
  const [messagePush, setMessagePush] = useState('');
  useFocusEffect(
    useCallback(() => {
      etatAlertes().then(setEtatPush).catch(() => {});
    }, [])
  );
  const activerPush = async () => {
    const souci = await activerAlertes(t('alertes_nom_appareil'), 'chauffeur');
    setMessagePush(souci ?? t('alertes_ok'));
    setEtatPush(await etatAlertes());
  };

  return (
    <Ecran fond="vagues" onRefresh={rafraichir}>
      {/* ------------------------------------------------------------------
          TABLEAU DE BORD CHAUFFEUR — volontairement réduit à DEUX questions :
          « qu'est-ce que je dois faire maintenant ? » et « qu'est-ce que je
          peux prendre ? ». Le champ de référence à recopier a disparu (on ne
          tape pas un identifiant à la main), le scanner reste sur son onglet,
          et l'historique se déplie à la demande.
          ------------------------------------------------------------------ */}

      {/* Ce que la journée a rapporté : gros chiffre, en shillings. */}
      <View style={styles.bandeauJour}>
        <Text style={styles.bandeauTitre}>{t('courses_bandeau_titre')}</Text>
        <Text style={styles.bandeauLabel}>{t('courses_bandeau_gagne')}</Text>
        <Text style={styles.bandeauMontant}>
          {formaterMontant(totalEnTzs(statsJour?.today.gains ?? {}), 'TZS')}
        </Text>
        <Text style={styles.bandeauDetail}>
          {t('courses_bandeau_detail', {
            courses: statsJour?.today.courses ?? 0,
            colis: statsJour?.today.colis ?? 0,
          })}
        </Text>
      </View>

      {/* Les échecs d'action (« trop tard, un autre l'a prise », « vous êtes
          en indisponible »…) s'affichent ici, en haut, impossibles à rater. */}
      <TexteErreur>{erreur}</TexteErreur>

      {etatPush !== null && etatPush !== 'actif' && (
        <Pressable style={styles.bandeauAlertes} onPress={activerPush}>
          <Text style={styles.bandeauAlertesTexte}>{t('bourse_alertes_titre')}</Text>
          <Text style={styles.bandeauAlertesBouton}>{t('bourse_alertes_bouton')}</Text>
          {messagePush ? <Text style={styles.bandeauAlertesMsg}>{messagePush}</Text> : null}
        </Pressable>
      )}

      {partagePosition && (
        <EncartInfo icone="location-outline" ton="succes">
          {t('courses_position_active')}
        </EncartInfo>
      )}

      {/* ===== LE MENU : quatre cases, une seule chose à choisir ===== */}
      {caseOuverte === null && (
        <>
          <Text style={styles.introMenu}>{t('courses_menu_intro')}</Text>
          <View style={styles.grilleMenu}>
            {(
              [
                {
                  cle: 'encours' as const,
                  label: t('courses_case_encours'),
                  icone: 'car-sport-outline' as const,
                  n: coursesEnCours.length,
                },
                {
                  cle: 'aprendre' as const,
                  label: t('courses_case_aprendre'),
                  icone: 'hand-left-outline' as const,
                  n: coursesDispo.length,
                },
                {
                  cle: 'colis' as const,
                  label: t('courses_case_colis'),
                  icone: 'cube-outline' as const,
                  n: mesColis.length + colisVisibles.length,
                },
                {
                  cle: 'mestrajets' as const,
                  label: t('courses_case_mes_trajets'),
                  icone: 'bus-outline' as const,
                  n: trajetsOuverts.length,
                },
              ] satisfies { cle: CaseChauffeur; label: string; icone: React.ComponentProps<typeof Ionicons>['name']; n: number }[]
            ).map((rubrique) => (
              <Pressable
                key={rubrique.cle}
                onPress={() => setCaseOuverte(rubrique.cle)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.caseMenu, pressed && { opacity: 0.75 }]}
              >
                <View style={styles.bulleMenu}>
                  <Ionicons name={rubrique.icone} size={30} color={couleurs.primaire} />
                </View>
                <Text style={styles.labelMenu}>{rubrique.label}</Text>
                <View style={[styles.pastilleMenu, rubrique.n > 0 && styles.pastilleMenuAction]}>
                  <Text
                    style={[
                      styles.textePastilleMenu,
                      rubrique.n > 0 && styles.textePastilleMenuAction,
                    ]}
                  >
                    {rubrique.n}
                  </Text>
                </View>
              </Pressable>
            ))}
            {/* Quatrième case : poster son propre trajet — elle n'ouvre pas
                une liste mais l'écran des annonces, déjà existant. */}
            <Pressable
              onPress={() => router.push('/(driver)/annonces')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.caseMenu, pressed && { opacity: 0.75 }]}
            >
              <View style={styles.bulleMenu}>
                <Ionicons name="megaphone-outline" size={30} color={couleurs.primaire} />
              </View>
              <Text style={styles.labelMenu}>{t('courses_case_poster')}</Text>
              <View style={styles.pastilleMenu}>
                <Ionicons name="arrow-forward" size={14} color={couleurs.primaireFonce} />
              </View>
            </Pressable>
          </View>
        </>
      )}

      {/* Dans une case : le chemin du retour, toujours au même endroit. */}
      {caseOuverte !== null && (
        <Pressable
          onPress={() => setCaseOuverte(null)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.retourMenu, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="chevron-back" size={18} color={couleurs.primaireFonce} />
          <Text style={styles.texteRetourMenu}>{t('courses_retour_menu')}</Text>
        </Pressable>
      )}

      {/* ===== CASE 1 — COURSE EN COURS ===== */}
      {caseOuverte === 'encours' && (
        <>
      <Text style={styles.titreSection}>
        {t('courses_case_encours')} ({coursesEnCours.length})
      </Text>
      {coursesEnCours.length === 0 && (
        <EncartInfo icone="checkmark-circle-outline" ton="succes">
          {t('courses_a_faire_vide')}
        </EncartInfo>
      )}
      {coursesEnCours.map((item) => {
        const statut = champ<StatutTrajet>(item, 'status', 'statut');
        const depart = departCourse(champ(item, 'scheduled_at', 'scheduledAt'), t, langue);
        const presse = depart.urgence !== 'planifie';
        return (
          <Pressable
            key={item.id}
            onPress={() => router.push(`/course/${item.id}`)}
            style={({ pressed }) => [
              styles.carte,
              presse && styles.carteUrgente,
              pressed && { opacity: 0.7 },
            ]}
          >
            <View style={styles.enTete}>
              <Text style={styles.type}>{t('courses_etiquette_course')}</Text>
              <BadgeStatutTrajet statut={statut} />
            </View>
            <Text style={styles.itineraire}>
              {champ(item, 'pickup_location', 'pickupLocation') ?? '?'}{'  '}
              <Text style={styles.fleche}>→</Text>{'  '}
              {champ(item, 'dropoff_location', 'dropoffLocation') ?? '?'}
            </Text>
            <View style={styles.pied}>
              <Text style={[styles.date, presse && styles.departTexteFort]}>{depart.texte}</Text>
              <Text style={styles.prix}>{formaterPrix(item)}</Text>
            </View>
            {/* Les coordonnées du client ne s'ouvrent qu'au paiement validé
                par l'équipe. Une fois ouvertes, le numéro s'appelle d'ici —
                sans ouvrir la fiche. */}
            {contactOuvert(item) ? (
              !!champ<string>(item, 'client_phone', 'clientPhone') && (
                <Pressable
                  onPress={() =>
                    Linking.openURL(
                      `tel:${String(champ(item, 'client_phone', 'clientPhone'))}`
                    )
                  }
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.ligneAppel, pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.texteAppel}>
                    📞 {t('course_client_appeler')} ·{' '}
                    {String(champ(item, 'client_phone', 'clientPhone'))}
                  </Text>
                </Pressable>
              )
            ) : (
              <Text style={styles.texteVerrou}>🔒 {t('courses_contact_verrouille')}</Text>
            )}
            <Bouton
              titre={t('courses_ouvrir_court')}
              icone="arrow-forward-circle-outline"
              onPress={() => router.push(`/course/${item.id}`)}
            />
          </Pressable>
        );
      })}
        </>
      )}

      {/* ===== CASE 3 — COLIS : les miens, puis ceux à prendre ===== */}
      {/* Mes colis : réservés via « Je prends la livraison » et en cours de
          livraison — le scan du QR au ramassage reste obligatoire. */}
      {caseOuverte === 'colis' && mesColis.length > 0 && (
        <>
          <Text style={styles.titreSection}>
            {t('courses_mes_colis')} ({mesColis.length})
          </Text>
          {mesColis.map((colis) => {
            const statut = champ(colis, 'status', 'statut') as
              | Parameters<typeof BadgeStatutColis>[0]['statut'];
            const prixC = Number(champ(colis, 'price') ?? NaN);
            const commissionC = Number(champ(colis, 'commission') ?? NaN);
            const deviseC = String(champ(colis, 'currency') ?? '');
            const telDestinataire = champ<string>(colis, 'recipient_phone', 'recipientPhone');
            const netC =
              Number.isFinite(prixC) && Number.isFinite(commissionC)
                ? Math.round((prixC - commissionC) * 100) / 100
                : null;
            return (
              <View key={colis.id} style={styles.carte}>
                <View style={styles.enTete}>
                  <BadgeStatutColis statut={statut} />
                  <Text style={styles.type}>
                    {libelleTailleColis(champ(colis, 'size'), t)}
                  </Text>
                </View>
                <Text style={styles.itineraire}>
                  {champ(colis, 'pickup_location', 'pickupLocation') ?? '?'}{'  '}
                  <Text style={styles.fleche}>→</Text>{'  '}
                  {champ(colis, 'dropoff_location', 'dropoffLocation') ?? '?'}
                </Text>
                <View style={styles.pied}>
                  <Text style={styles.date}>
                    {champ(colis, 'pickup_at', 'pickupAt')
                      ? `⏰ ${formaterDate(champ(colis, 'pickup_at', 'pickupAt'))}`
                      : t('ncolis_asap')}
                  </Text>
                  {netC !== null && (
                    <Text style={styles.prix}>
                      💰 {t('gain_net')} : {formaterMontant(totalEnTzs({ [deviseC]: netC }), 'TZS')}
                    </Text>
                  )}
                </View>
                {/* Raccourci d'appel : le DESTINATAIRE — c'est lui qu'il faut
                    joindre pour la remise du colis. */}
                {!!telDestinataire && (
                  <Pressable
                    onPress={() => Linking.openURL(`tel:${telDestinataire}`)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.ligneAppel, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={styles.texteAppel}>
                      {t('colis_appeler_destinataire')} · {telDestinataire}
                    </Text>
                  </Pressable>
                )}
                <Bouton
                  titre={t('courses_colis_scanner')}
                  icone="qr-code-outline"
                  variante="secondaire"
                  onPress={() => router.push('/(driver)/scanner')}
                />
              </View>
            );
          })}
        </>
      )}

      {/* ===== CASE 2 — COURSE À PRENDRE ===== */}
      {caseOuverte === 'aprendre' && (
        <>
      <Text style={styles.titreSection}>
        {t('courses_case_aprendre')} ({coursesDispo.length})
      </Text>
      {coursesDispo.length === 0 && (
        <EncartInfo icone="car-outline">{t('courses_a_prendre_vide')}</EncartInfo>
      )}
      {coursesDispo.map((course) => {
        const net = Number(champ(course, 'net_chauffeur', 'netChauffeur') ?? NaN);
        const devise = String(champ(course, 'currency', 'devise') ?? '');
        // QUAND partir : jour + heure explicites, ou « départ immédiat ».
        const depart = departCourse(champ(course, 'scheduled_at', 'scheduledAt'), t, langue);
        const presse = depart.urgence !== 'planifie';
        const options: string[] = [];
        if (champ<boolean>(course, 'round_trip', 'roundTrip') === true)
          options.push(t('trip_aller_retour_valeur'));
        if (champ<boolean>(course, 'baby_seat', 'babySeat') === true)
          options.push(t('reserver_siege_bebe'));
        if (champ<boolean>(course, 'bulky_luggage', 'bulkyLuggage') === true)
          options.push(t('reserver_gros_bagages'));
        const vol = champ<string>(course, 'flight_number', 'flightNumber');
        return (
          <View
            key={course.id}
            style={[styles.carte, presse && styles.carteUrgente]}
          >
            {/* Bandeau d'urgence : URGENT (départ immédiat ou dans l'heure)
                ou Programmée — visible avant même de lire le trajet. */}
            <View style={styles.ligneUrgence}>
              <View style={[styles.pastilleUrgence, presse && styles.pastilleUrgenteForte]}>
                <Ionicons
                  name={presse ? 'flash' : 'calendar-outline'}
                  size={12}
                  color={presse ? couleurs.surPrimaire : couleurs.texteSecondaire}
                />
                <Text style={[styles.texteUrgence, presse && styles.texteUrgenceFort]}>
                  {presse ? t('courses_dispo_urgent') : t('courses_dispo_programmee')}
                </Text>
              </View>
              <Text style={[styles.departTexte, presse && styles.departTexteFort]}>
                {depart.texte}
              </Text>
            </View>
            {/* DÉJÀ PAYÉE — le client a réglé et le chauffeur précédent s'est
                désisté. Pour celui qui la reprend, c'est un gain certain : il
                doit le voir avant tout le reste. */}
            {champ<boolean>(course, 'deja_payee') === true && (
              <View style={styles.bandeauPayee}>
                <Ionicons name="checkmark-circle" size={14} color={couleurs.surVertFeu} />
                <Text style={styles.textePayee}>{t('courses_dispo_deja_payee')}</Text>
              </View>
            )}
            <Text style={styles.itineraire}>
              {String(champ(course, 'pickup_location', 'pickupLocation') ?? '?')}{'  '}
              <Text style={styles.fleche}>→</Text>{'  '}
              {String(champ(course, 'dropoff_location', 'dropoffLocation') ?? '?')}
            </Text>
            <View style={styles.pied}>
              {/* Depuis combien de temps la course attend un chauffeur. */}
              <Text style={styles.date}>
                {t('courses_dispo_demandee_depuis', {
                  quand: formaterDateRelativeI18n(champ(course, 'created_at', 'createdAt'), t),
                })}
              </Text>
              {Number.isFinite(net) && (
                <Text style={styles.prix}>
                  💰 {t('courses_dispo_gain')} :{' '}
                  {formaterMontant(totalEnTzs({ [devise]: net }), 'TZS')}
                </Text>
              )}
            </View>
            {!!vol && <Text style={styles.date}>✈️ {t('trip_vol')} : {vol}</Text>}
            {options.length > 0 && (
              <Text style={styles.date}>⚙️ {options.join('  ·  ')}</Text>
            )}
            <Bouton
              titre={t('courses_dispo_prendre')}
              icone="checkmark-circle-outline"
              onPress={() => prendreUneCourse(course)}
              charge={courseEnCours === course.id}
            />
          </View>
        );
      })}
        </>
      )}

      {/* Colis libres — dans la case COLIS, sous ceux que le chauffeur porte
          déjà. Le ramassage passe par l'onglet Scanner (QR sur le colis). */}
      {caseOuverte === 'colis' && (
        <>
      <Text style={styles.titreSection}>
        {t('courses_colis_a_prendre')} ({colisVisibles.length})
      </Text>
      {colisVisibles.length === 0 && (
        <EncartInfo icone="cube-outline">{t('courses_colis_vide')}</EncartInfo>
      )}
      {colisVisibles.map((colis) => {
        const nomHotel = champ<string>(colis, 'sender_hotel_name');
        const nomClient = champ<string>(colis, 'sender_user_name');
        const prix = Number(champ(colis, 'price') ?? NaN);
        const commission = Number(champ(colis, 'commission') ?? NaN);
        const devise = String(champ(colis, 'currency') ?? '');
        const net =
          Number.isFinite(prix) && Number.isFinite(commission)
            ? Math.round((prix - commission) * 100) / 100
            : null;
        return (
          <Pressable
            key={colis.id}
            onPress={() => router.push(`/colis-dispo/${colis.id}`)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.carte, pressed && { opacity: 0.75 }]}
          >
            <View style={styles.enTete}>
              <Text style={styles.type}>
                {nomHotel
                  ? `🏨 ${nomHotel}`
                  : `${t('courses_colis_client')}${nomClient ? ` · ${nomClient}` : ''}`}
              </Text>
              <Text style={styles.type}>
                {libelleTailleColis(champ(colis, 'size'), t)}
              </Text>
            </View>
            <Text style={styles.itineraire}>
              {champ(colis, 'pickup_location', 'pickupLocation') ?? '?'}{'  '}
              <Text style={styles.fleche}>→</Text>{'  '}
              {champ(colis, 'dropoff_location', 'dropoffLocation') ?? '?'}
            </Text>
            <View style={styles.pied}>
              <Text style={styles.date}>
                {champ(colis, 'pickup_at', 'pickupAt')
                  ? `⏰ ${formaterDate(champ(colis, 'pickup_at', 'pickupAt'))}`
                  : formaterDateRelativeI18n(champ(colis, 'created_at', 'createdAt'), t)}
              </Text>
              {net !== null && (
                <Text style={styles.prix}>
                  💰 {t('gain_net')} : {formaterMontant(totalEnTzs({ [devise]: net }), 'TZS')}
                </Text>
              )}
            </View>
            <View style={styles.rangeeColis}>
              <Pressable
                onPress={() => masquerUnColis(colis)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.boutonMasquer, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="eye-off-outline" size={16} color={couleurs.texteSecondaire} />
                <Text style={styles.texteMasquer}>{t('colis_masquer')}</Text>
              </Pressable>
              <Pressable
                onPress={() => prendreUnColis(colis)}
                disabled={priseEnCours === colis.id}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.boutonPrendre,
                  (pressed || priseEnCours === colis.id) && { opacity: 0.6 },
                ]}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color={couleurs.surPrimaire} />
                <Text style={styles.textePrendre}>{t('colis_prendre_court')}</Text>
              </Pressable>
            </View>
          </Pressable>
        );
      })}
      {nbColisMasques > 0 && (
        <Pressable
          onPress={reafficherColis}
          accessibilityRole="button"
          style={({ pressed }) => [styles.lienReafficher, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="eye-outline" size={15} color={couleurs.primaireFonce} />
          <Text style={styles.texteReafficher}>
            {t('colis_reafficher', { n: nbColisMasques })}
          </Text>
        </Pressable>
      )}
        </>
      )}

      {/* ===== CASE 4 — MES TRAJETS POSTÉS =====
          Le chauffeur publie ses propres taxis partagés ; il veut savoir, sans
          chercher, si des places se sont vendues. Une carte = un trajet, avec
          la seule question qui compte : combien de places restent, combien
          j'ai déjà gagné. Le détail (qui a réservé) s'ouvre au toucher. */}
      {caseOuverte === 'mestrajets' && (
        <>
          <Text style={styles.titreSection}>
            {t('courses_case_mes_trajets')} ({trajetsOuverts.length})
          </Text>
          {mesTrajets.length === 0 && (
            <EncartInfo icone="bus-outline">{t('courses_mes_trajets_vide')}</EncartInfo>
          )}
          {[...trajetsOuverts, ...trajetsClos].map((ride) => {
            const statut = champ<StatutRide>(ride, 'status', 'statut');
            const ouvert = statut === 'open';
            const total = Number(champ(ride, 'seats_total', 'seatsTotal') ?? 0);
            const restantes = Number(champ(ride, 'seats_available', 'seatsAvailable') ?? 0);
            const vendues = Math.max(0, total - restantes);
            // Gain net des places PAYÉES seulement, tout ramené en shillings.
            const reservations = champ<{ seats: number; paid?: boolean; currency?: string; net_per_seat?: number | string }[]>(ride, 'bookings') ?? [];
            const gainTzs = Math.round(
              reservations
                .filter((resa) => resa.paid)
                .reduce((somme, resa) => {
                  const net = Number(resa.net_per_seat ?? 0) * resa.seats;
                  return somme + totalEnTzs({ [String(resa.currency ?? 'TZS')]: net });
                }, 0)
            );
            return (
              <Pressable
                key={ride.id}
                onPress={() => router.push(`/annonce/${ride.id}`)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.carte,
                  !ouvert && styles.carteClose,
                  pressed && { opacity: 0.75 },
                ]}
              >
                <View style={styles.enTete}>
                  <Text style={styles.type}>
                    🕒 {formaterDate(champ(ride, 'departure_at', 'departureAt'))}
                  </Text>
                  <Badge
                    texte={libelleStatutRide(statut, t)}
                    ton={ouvert ? 'primaire' : 'neutre'}
                  />
                </View>
                <Text style={styles.itineraire}>
                  {String(champ(ride, 'origin', 'origine') ?? '?')}{'  '}
                  <Text style={styles.fleche}>→</Text>{'  '}
                  {String(champ(ride, 'destination') ?? '?')}
                </Text>
                <View style={styles.pied}>
                  <Text style={styles.date}>
                    🪑 {t('courses_mes_trajets_places', { vendues, total })}
                  </Text>
                  {gainTzs > 0 && (
                    <Text style={styles.prix}>
                      💰 {formaterMontant(gainTzs, 'TZS')}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </>
      )}

      {/* Historique — replié, et seulement dans la case « Course en cours » :
          il n'a rien à faire sur le menu ni dans les autres cases. */}
      {caseOuverte === 'encours' && coursesPassees.length > 0 && (
        <Pressable
          onPress={() => setHistoriqueOuvert((v) => !v)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.lienHistorique, pressed && { opacity: 0.6 }]}
        >
          <Ionicons
            name={historiqueOuvert ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={couleurs.primaireFonce}
          />
          <Text style={styles.texteHistorique}>
            {historiqueOuvert
              ? t('courses_historique_masquer')
              : t('courses_historique_voir', { n: coursesPassees.length })}
          </Text>
        </Pressable>
      )}
      {historiqueOuvert &&
        coursesPassees.map((item) => {
        const statut = champ<StatutTrajet>(item, 'status', 'statut');
        // Même lecture du départ que dans la bourse : jour + heure explicites,
        // et mise en avant quand il faut partir tout de suite. Une course
        // terminée ou annulée n'a plus rien d'urgent.
        const enCours = statut !== 'completed' && statut !== 'cancelled';
        const depart = departCourse(champ(item, 'scheduled_at', 'scheduledAt'), t, langue);
        const presse = enCours && depart.urgence !== 'planifie';
        return (
          <Pressable
            key={item.id}
            onPress={() => router.push(`/course/${item.id}`)}
            style={({ pressed }) => [
              styles.carte,
              presse && styles.carteUrgente,
              pressed && { opacity: 0.7 },
            ]}
          >
            <View style={styles.enTete}>
              <Text style={styles.type}>{t('trajets_course_defaut')}</Text>
              <BadgeStatutTrajet statut={statut} />
            </View>
            <Text style={styles.itineraire}>
              {champ(item, 'pickup_location', 'pickupLocation') ?? '?'}{'  '}
              <Text style={styles.fleche}>→</Text>{'  '}
              {champ(item, 'dropoff_location', 'dropoffLocation') ?? '?'}
            </Text>
            <View style={styles.pied}>
              <Text style={[styles.date, presse && styles.departTexteFort]}>
                {enCours
                  ? depart.texte
                  : formaterDateRelativeI18n(
                      champ(item, 'scheduled_at', 'scheduledAt', 'created_at', 'createdAt'),
                      t
                    )}
              </Text>
              <Text style={styles.prix}>{formaterPrix(item)}</Text>
            </View>
          </Pressable>
        );
      })}

      {nbNettoyables > 0 && (
        <Bouton
          titre={`${t('menage_bouton')} (${nbNettoyables})`}
          icone="trash-outline"
          variante="secondaire"
          onPress={faireLeMenage}
        />
      )}
    </Ecran>
  );
}

const styles = StyleSheet.create({
  bandeauAlertes: {
    backgroundColor: couleurs.primaire,
    borderRadius: rayons.carte,
    padding: espaces.m,
    marginBottom: espaces.m,
  },
  bandeauAlertesTexte: {
    color: couleurs.surPrimaire,
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 21,
  },
  bandeauAlertesBouton: {
    color: couleurs.or,
    fontWeight: '800',
    fontSize: 15,
    marginTop: 6,
  },
  bandeauAlertesMsg: {
    color: couleurs.surPrimaire,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  // Bandeau des gains du jour : le gros chiffre qui accueille le chauffeur.
  bandeauJour: {
    backgroundColor: couleurs.nuit,
    borderRadius: rayons.carte,
    padding: espaces.l,
    alignItems: 'center',
    gap: 2,
  },
  bandeauTitre: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: couleurs.or,
  },
  bandeauLabel: {
    fontSize: 13,
    color: couleurs.voilePhotoClair,
  },
  bandeauMontant: {
    fontSize: 34,
    fontWeight: '900',
    color: couleurs.surPrimaire,
    letterSpacing: -0.5,
  },
  bandeauDetail: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.or,
  },
  // Le menu à quatre cases : de grosses cibles, faciles à toucher.
  introMenu: {
    fontSize: 14,
    color: couleurs.texteSecondaire,
    textAlign: 'center',
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
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelMenu: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
    textAlign: 'center',
  },
  pastilleMenu: {
    minWidth: 32,
    alignItems: 'center',
    backgroundColor: couleurs.primaireClair,
    borderRadius: rayons.pastille,
    paddingHorizontal: espaces.s,
    paddingVertical: 3,
  },
  pastilleMenuAction: {
    backgroundColor: couleurs.primaire,
  },
  textePastilleMenu: {
    fontSize: 16,
    fontWeight: '800',
    color: couleurs.primaireFonce,
  },
  textePastilleMenuAction: {
    color: couleurs.surPrimaire,
  },
  retourMenu: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs,
    paddingVertical: espaces.s,
  },
  texteRetourMenu: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.primaireFonce,
  },
  lienHistorique: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaces.xs,
    paddingVertical: espaces.m,
  },
  texteHistorique: {
    fontSize: 14,
    fontWeight: '600',
    color: couleurs.primaireFonce,
  },
  titreSection: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
    marginTop: espaces.s,
  },
  carte: {
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.carte,
    padding: espaces.l,
    gap: espaces.s,
    ...ombres.carte,
  },
  // Course à départ immédiat (ou dans l'heure) : liseré corail sur le bord
  // gauche — elle se repère avant même d'être lue.
  carteUrgente: {
    borderLeftWidth: 4,
    borderLeftColor: couleurs.primaire,
  },
  // Trajet posté qui n'est plus en ligne : présent, mais en retrait.
  carteClose: {
    opacity: 0.65,
  },
  ligneUrgence: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: espaces.s,
  },
  pastilleUrgence: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: espaces.s,
    borderRadius: rayons.pastille,
    backgroundColor: couleurs.bordure,
  },
  pastilleUrgenteForte: {
    backgroundColor: couleurs.primaire,
  },
  texteUrgence: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: couleurs.texteSecondaire,
  },
  texteUrgenceFort: {
    color: couleurs.surPrimaire,
  },
  departTexte: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: couleurs.encre,
  },
  departTexteFort: {
    color: couleurs.primaireFonce,
  },
  enTete: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  type: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  itineraire: {
    fontSize: 16,
    fontWeight: '700',
    color: couleurs.encre,
    lineHeight: 22,
  },
  fleche: {
    color: couleurs.primaire,
    fontWeight: '800',
  },
  // flexWrap : la date et le gain passent à la ligne au lieu de se
  // chevaucher (gain bien lisible, en shillings).
  pied: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: espaces.s,
  },
  date: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
  },
  prix: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.primaire,
  },
  rangeeColis: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaces.m,
  },
  ligneOuvrirColis: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs,
  },
  texteOuvrirColis: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.primaire,
  },
  ligneAppel: {
    paddingVertical: espaces.xs,
  },
  texteAppel: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.primaireFonce,
  },
  // « Déjà payée » : vert plein, comme le feu vert d'une course payée.
  bandeauPayee: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs,
    alignSelf: 'flex-start',
    backgroundColor: couleurs.vertFeu,
    borderRadius: rayons.pastille,
    paddingHorizontal: espaces.s,
    paddingVertical: 3,
  },
  textePayee: {
    fontSize: 12,
    fontWeight: '800',
    color: couleurs.surVertFeu,
  },
  // Coordonnées client encore fermées : dit pourquoi, sans alarmer.
  texteVerrou: {
    fontSize: 12.5,
    color: couleurs.texteSecondaire,
    lineHeight: 18,
  },
  boutonPrendre: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs,
    backgroundColor: couleurs.primaire,
    borderRadius: rayons.pastille,
    paddingHorizontal: espaces.l,
    paddingVertical: espaces.s,
  },
  textePrendre: {
    fontSize: 13,
    fontWeight: '800',
    color: couleurs.surPrimaire,
  },
  boutonMasquer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs,
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.s,
    borderRadius: rayons.pastille,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  texteMasquer: {
    fontSize: 12,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  lienReafficher: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaces.xs,
    paddingVertical: espaces.s,
  },
  texteReafficher: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.primaireFonce,
  },
});
