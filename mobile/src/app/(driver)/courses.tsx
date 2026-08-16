// Mode chauffeur — mes courses.
// La liste vient du serveur (GET /drivers/:id/trips) : dès que l'équipe
// assigne le chauffeur sur une course, elle apparaît ici au prochain
// rafraîchissement — plus besoin de la référence WhatsApp, qui reste
// utilisable en secours pour ouvrir une course directement.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  BadgeStatutColis,
  BadgeStatutTrajet,
  Bouton,
  Carte,
  Champ,
  Ecran,
  EncartInfo,
  EtatVide,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { effacerColisMasques, listerColisMasques, masquerColis } from '@/lib/colisLocal';
import { departCourse, formaterDateRelativeI18n, libelleTailleColis, useT } from '@/lib/i18n';
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
  type StatutTrajet,
  type Trajet,
} from '@/lib/types';

export default function EcranCourses() {
  const router = useRouter();
  const { session } = useAuth();
  const { t, langue } = useT();
  const [idSaisi, setIdSaisi] = useState('');
  const [recentes, setRecentes] = useState<Trajet[]>([]);
  // Bourse aux colis : colis payés en attente de ramassage (hôtels en tête).
  // Bourse aux courses : les courses privées encore sans chauffeur.
  const [coursesDispo, setCoursesDispo] = useState<Trajet[]>([]);
  const [colisDispo, setColisDispo] = useState<Colis[]>([]);
  // Mes colis : réservés (« Je prends la livraison ») et en cours de livraison.
  const [mesColis, setMesColis] = useState<Colis[]>([]);
  // Colis masqués par CE chauffeur (« Pas intéressé ») — local au téléphone.
  const [colisMasques, setColisMasques] = useState<string[]>([]);
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);
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

  const ouvrir = async () => {
    setErreur('');
    // Tolère un lien collé contenant la référence (on extrait l'UUID).
    const correspondance = idSaisi.match(
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/
    );
    const id = correspondance?.[0] ?? '';
    if (!id) {
      setErreur(t('courses_erreur_reference'));
      return;
    }
    setCharge(true);
    try {
      await api.obtenirTrajet(id); // vérifie l'accès (chauffeur assigné)
      setIdSaisi('');
      router.push(`/course/${id}`);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('courses_erreur_introuvable'));
    } finally {
      setCharge(false);
    }
  };

  return (
    <Ecran fond="vagues" onRefresh={rafraichir}>
      <EncartInfo icone="logo-whatsapp">{t('courses_info')}</EncartInfo>
      {partagePosition && (
        <EncartInfo icone="location-outline" ton="succes">
          {t('courses_position_active')}
        </EncartInfo>
      )}

      <Carte>
        <Titre>{t('courses_ouvrir_titre')}</Titre>
        <Champ
          label={t('courses_reference')}
          value={idSaisi}
          onChangeText={setIdSaisi}
          placeholder={t('courses_reference_placeholder')}
          autoCapitalize="none"
        />
        <TexteErreur>{erreur}</TexteErreur>
        <Bouton
          titre={t('courses_ouvrir_bouton')}
          icone="open-outline"
          onPress={ouvrir}
          charge={charge}
        />
        <Bouton
          titre={t('courses_scanner_bouton')}
          icone="qr-code-outline"
          variante="secondaire"
          onPress={() => router.push('/(driver)/scanner')}
        />
      </Carte>

      {/* BOURSE AUX COURSES — en tête d'écran : c'est là que le chauffeur
          gagne sa journée. Le nom et le téléphone du client n'apparaissent
          qu'une fois la course prise. */}
      <Text style={styles.titreSection}>
        {t('courses_dispo_titre')} ({coursesDispo.length})
      </Text>
      {coursesDispo.length === 0 && (
        <EncartInfo icone="car-outline">{t('courses_dispo_vide')}</EncartInfo>
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

      {/* Mes colis : réservés via « Je prends la livraison » et en cours de
          livraison — le scan du QR au ramassage reste obligatoire. */}
      {mesColis.length > 0 && (
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

      {/* Bourse aux colis : colis payés à ramasser (envois des hôtels en tête).
          Ramassage via l'onglet Scanner — le QR est sur le colis. */}
      <Text style={styles.titreSection}>
        {t('courses_colis_titre')} ({colisVisibles.length})
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

      <Text style={styles.titreSection}>{t('courses_recentes')}</Text>
      {coursesVisibles.length === 0 && (
        <EtatVide
          icone="car-outline"
          titre={t('courses_vide_titre')}
          message={t('courses_vide_texte')}
        />
      )}
      {coursesVisibles.map((item) => {
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
