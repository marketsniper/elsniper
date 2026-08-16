// Onglet « Réserver » : itinéraire en menus déroulants (hubs + villes) en
// haut, puis choix du mode Privé ou Partagé.
// - Privé : récapitulatif de prix (miroir types.ts, trajets spéciaux inclus,
//   ex. Nungwi ↔ Paje 65 USD / 58,50 USD résident vérifié) et bouton Réserver.
//   Une précision optionnelle (hôtel, adresse…) est ajoutée entre parenthèses
//   dans pickupLocation SAUF sur un trajet spécial : le serveur ne reconnaît
//   la paire spéciale que sur les villes EXACTES, on envoie alors les villes
//   seules et on rappelle à l'utilisateur de préciser le lieu via WhatsApp.
// - Partagé : PAS de réservation directe — on affiche la liste des trajets
//   postés par les chauffeurs (RidesPartages), place réservée via WhatsApp.
// Le prix officiel reste calculé et FIGÉ côté serveur (pricingService).
// Mode hôtel : réservation privée POUR SON CLIENT — TZS, champs Nom/Téléphone
// du client, payload {hotelId, clientName, clientPhone, …} sans userId.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { CalendrierDate } from '@/components/CalendrierDate';
import { RidesPartages } from '@/components/RidesPartages';
import { Selecteur } from '@/components/Selecteur';
import { Bouton, Champ, Ecran, EncartInfo, EtatVide, TexteErreur } from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  formaterDateChoisie,
  HEURES_CHOIX,
  isoDepuisDateHeure,
  JOURS_RESERVATION_AVANCE,
  libelleTypeTrajet,
  useT,
} from '@/lib/i18n';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import {
  champ,
  formaterMontant,
  localVerifie,
  ORIGINES_RIDES,
  POINTS_STONE_TOWN,
  profilTarifaireUtilisateur,
  tarifPriveItineraire,
  tarifSpecialPrive,
  tarifTrajetProfil,
  type ProfilTarifaire,
  type TypeCompte,
  type TypeTrajet,
} from '@/lib/types';

type ModeCourse = 'prive' | 'partage';

export default function EcranReserver() {
  const router = useRouter();
  const { session } = useAuth();
  const { t, langue } = useT();
  const utilisateur = session?.user ?? null;
  const hotel = session?.hotel ?? null;
  // Mode hôtel : le profil hôtel réserve des taxis pour ses clients.
  const modeHotel = !!hotel;

  const typeCompteClient = champ<TypeCompte>(utilisateur, 'account_type', 'accountType');
  const estLocalVerifie = localVerifie(utilisateur);
  const estLocalEnAttente = !modeHotel && typeCompteClient === 'local' && !estLocalVerifie;

  // Profil tarifaire : détermine devise et montants affichés.
  const profil: ProfilTarifaire = modeHotel ? 'hotel' : profilTarifaireUtilisateur(utilisateur);
  // Profils touristes/résidents (USD) : mention « Climatisation incluse ».
  const profilUsd =
    profil === 'tourist' || profil === 'resident' || profil === 'resident_verifie';

  const [mode, setMode] = useState<ModeCourse>('prive');
  const [depart, setDepart] = useState('');
  const [arrivee, setArrivee] = useState('');
  const [precision, setPrecision] = useState('');
  // Programmation optionnelle : date choisie au calendrier (« yyyy-mm-dd ») +
  // heure ; date vide = départ dès que possible (« Maintenant »).
  const [dateChoisie, setDateChoisie] = useState('');
  const [heureProgramme, setHeureProgramme] = useState('');
  const [calendrierOuvert, setCalendrierOuvert] = useState(false);
  const [nomClient, setNomClient] = useState('');
  const [telClient, setTelClient] = useState('+255');
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);
  // Lieux proposés : hubs + villes (serveur), repli sur la liste locale.
  const [lieux, setLieux] = useState<string[]>(ORIGINES_RIDES);

  const chargerLieux = useCallback(async () => {
    try {
      const reponse = await api.lieuxRides();
      if (reponse.origins.length > 0) setLieux(reponse.origins);
    } catch {
      // silencieux : repli sur la liste locale
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      chargerLieux();
    }, [chargerLieux])
  );

  // « Partagé » = navette locale pour un local vérifié, navette touristes sinon.
  const typePartage: TypeTrajet = estLocalVerifie ? 'shared_local' : 'shared_tourist';
  const itineraire = { depart, arrivee };
  // Pas de prix affiché tant que le trajet n'est pas choisi : le tarif
  // dépend du trajet (grille au km + trajets spéciaux), un montant « par
  // défaut » serait trompeur.
  const itineraireChoisi = depart !== '' && arrivee !== '';
  // Trajet spécial (privé uniquement) : villes exactes, deux sens.
  const estSpecial = mode === 'prive' && tarifSpecialPrive(depart, arrivee) !== null;
  const tarifCourant = itineraireChoisi ? tarifTrajetProfil('private', profil, itineraire) : null;
  // Pas de taxi partagé sur les trajets courts : course privée du même
  // trajet à 35 USD minimum (même règle côté serveur).
  const partageDisponible = !itineraireChoisi || tarifPriveItineraire(depart, arrivee) >= 35;
  useEffect(() => {
    if (!partageDisponible && mode === 'partage') setMode('prive');
  }, [partageDisponible, mode]);

  // Transfert aéroport : le n° de vol permet à l'équipe de suivre l'heure
  // réelle d'atterrissage (taxi garanti même si le vol est en retard).
  const trajetAeroport = /aéroport|airport/i.test(depart) || /aéroport|airport/i.test(arrivee);
  const [numeroVol, setNumeroVol] = useState('');
  // Course privée : aller-retour avec attente (×1,8) + option bagages.
  const [allerRetour, setAllerRetour] = useState(false);
  const [grosBagages, setGrosBagages] = useState(false);
  // Liste d'attente du partagé : demande laissée à l'équipe.
  const [attenteEnvoyee, setAttenteEnvoyee] = useState(false);
  const [chargeAttente, setChargeAttente] = useState(false);
  useEffect(() => {
    setAttenteEnvoyee(false);
  }, [depart, arrivee]);

  // Prix affiché : l'aller-retour multiplie par 1,8 (même règle serveur).
  const tarifAffiche =
    tarifCourant && allerRetour
      ? { montant: Math.round(tarifCourant.montant * 1.8 * 100) / 100, devise: tarifCourant.devise }
      : tarifCourant;

  // Laisse une demande en liste d'attente sur le trajet choisi (partagé).
  const laisserDemandeAttente = async () => {
    setErreur('');
    if (!depart || !arrivee) {
      setErreur(t('reserver_erreur_itineraire'));
      return;
    }
    setChargeAttente(true);
    try {
      await api.creerAttentePartage({ origin: depart, destination: arrivee });
      setAttenteEnvoyee(true);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('reserver_erreur'));
    } finally {
      setChargeAttente(false);
    }
  };

  const reserver = async () => {
    setErreur('');
    if (!utilisateur && !modeHotel) {
      setErreur(t('reserver_erreur_profil'));
      return;
    }
    if (!depart || !arrivee) {
      setErreur(t('reserver_erreur_itineraire'));
      return;
    }
    let telClientNormalise = '';
    if (modeHotel) {
      if (!nomClient.trim()) {
        setErreur(t('reserver_erreur_nom_client'));
        return;
      }
      telClientNormalise = telClient.replace(/[\s-]/g, '');
      if (!/^\+[1-9]\d{6,14}$/.test(telClientNormalise)) {
        setErreur(t('reserver_erreur_tel_client'));
        return;
      }
    }
    let scheduledAt: string | undefined;
    if (dateChoisie) {
      const iso = heureProgramme ? isoDepuisDateHeure(dateChoisie, heureProgramme) : null;
      if (!iso) {
        setErreur(t('sel_erreur_datetime'));
        return;
      }
      scheduledAt = iso;
    }
    // Trajet spécial : villes SEULES pour que le serveur applique le tarif
    // dédié. Sinon, la précision optionnelle est ajoutée entre parenthèses.
    const precisionPropre = precision.trim();
    const pickupLocation =
      !estSpecial && precisionPropre ? `${depart} (${precisionPropre})` : depart;
    const dropoffLocation = arrivee;
    setCharge(true);
    try {
      // N° de vol + aller-retour + options véhicule : mêmes champs pour les
      // réservations client et hôtel.
      const extras = {
        flightNumber: trajetAeroport && numeroVol.trim() ? numeroVol.trim() : undefined,
        roundTrip: allerRetour || undefined,
        bulkyLuggage: grosBagages || undefined,
      };
      const trajet = modeHotel
        ? await api.creerTrajetHotel({
            hotelId: hotel!.id,
            clientName: nomClient.trim(),
            clientPhone: telClientNormalise,
            tripType: 'private',
            pickupLocation,
            dropoffLocation,
            scheduledAt,
            ...extras,
          })
        : await api.creerTrajet({
            userId: utilisateur!.id,
            tripType: 'private',
            pickupLocation,
            dropoffLocation,
            scheduledAt,
            ...extras,
          });
      setDepart('');
      setArrivee('');
      setPrecision('');
      setDateChoisie('');
      setHeureProgramme('');
      setCalendrierOuvert(false);
      setNomClient('');
      setTelClient('+255');
      setNumeroVol('');
      setAllerRetour(false);
      setGrosBagages(false);
      router.push(`/trip/${trajet.id}`);
      // L'équipe est prévenue automatiquement par le serveur (e-mail) —
      // plus de message WhatsApp à envoyer par le client.
    } catch (e) {
      if (e instanceof ErreurApi && e.code === 'local_only') {
        setErreur(t('reserver_erreur_local_only'));
      } else if (e instanceof ErreurApi && e.code === 'local_not_verified') {
        setErreur(t('reserver_erreur_local_attente'));
      } else {
        setErreur(e instanceof ErreurApi ? e.message : t('reserver_erreur'));
      }
    } finally {
      setCharge(false);
    }
  };

  // Local non vérifié : pas de réservation possible — écran d'attente doux.
  if (estLocalEnAttente) {
    return (
      <Ecran fond="palmiers">
        <EtatVide
          icone="hourglass-outline"
          titre={t('reserver_local_attente_titre')}
          message={t('reserver_local_attente_texte')}
        />
      </Ecran>
    );
  }

  return (
    <Ecran fond="palmiers">
      {modeHotel && (
        <EncartInfo icone="business-outline">{t('reserver_mode_hotel_info')}</EncartInfo>
      )}
      {profil === 'resident' && (
        <EncartInfo icone="hourglass-outline" ton="attente">
          {t('reserver_remise_attente')}
        </EncartInfo>
      )}
      {profil === 'resident_verifie' && (
        <EncartInfo icone="pricetag-outline" ton="succes">
          {t('reserver_remise_activee')}
        </EncartInfo>
      )}

      <Text style={styles.titreSection}>{t('reserver_itineraire')}</Text>
      <Selecteur
        label={t('commun_depart')}
        valeur={depart}
        options={lieux}
        onChange={setDepart}
      />
      <Selecteur
        label={t('commun_arrivee')}
        valeur={arrivee}
        // Stone Town, ferry et aéroport sont à quelques minutes : aucune
        // course entre ces trois points (même règle côté serveur).
        options={
          POINTS_STONE_TOWN.includes(depart)
            ? lieux.filter((lieu) => !POINTS_STONE_TOWN.includes(lieu))
            : lieux
        }
        onChange={setArrivee}
      />
      <Champ
        label={t('reserver_precision')}
        value={precision}
        onChangeText={setPrecision}
        placeholder={t('reserver_precision_placeholder')}
      />

      <Text style={styles.titreSection}>{t('reserver_mode_titre')}</Text>
      {/* Trajet court (privé < 35 USD) : pas de taxi partagé du tout. */}
      {itineraireChoisi && !partageDisponible && (
        <EncartInfo icone="car-outline">{t('reserver_pas_partage')}</EncartInfo>
      )}
      <View style={styles.rangeeModes}>
        {(
          [
            {
              cle: 'prive' as ModeCourse,
              icone: 'car-outline' as const,
              titre: t('reserver_prive'),
              description: t('reserver_prive_desc'),
              type: 'private' as TypeTrajet,
            },
            ...(partageDisponible
              ? [
                  {
                    cle: 'partage' as ModeCourse,
                    icone: 'people-outline' as const,
                    titre: t('reserver_partage'),
                    description: t('reserver_partage_desc'),
                    type: typePartage,
                  },
                ]
              : []),
          ]
        ).map((option) => {
          const actif = mode === option.cle;
          const tarif = tarifTrajetProfil(option.type, profil, itineraire);
          return (
            <Pressable
              key={option.cle}
              onPress={() => setMode(option.cle)}
              accessibilityRole="button"
              style={[styles.carteMode, actif && styles.carteModeActive]}
            >
              <View style={[styles.bulleIcone, actif && styles.bulleIconeActive]}>
                <Ionicons
                  name={option.icone}
                  size={24}
                  color={actif ? couleurs.surPrimaire : couleurs.primaire}
                />
              </View>
              <Text style={[styles.titreMode, actif && { color: couleurs.primaireFonce }]}>
                {option.titre}
              </Text>
              <Text style={styles.descriptionMode}>{option.description}</Text>
              <Text style={styles.sousTypeMode}>{libelleTypeTrajet(option.type, t)}</Text>
              {itineraireChoisi && tarif !== null ? (
                <Text style={styles.prixMode}>
                  {formaterMontant(tarif.montant, tarif.devise)}
                </Text>
              ) : (
                <Text style={styles.prixModeAttente}>{t('reserver_prix_selon_trajet')}</Text>
              )}
              {profilUsd && (
                <View style={styles.ligneClim}>
                  <Ionicons name="snow-outline" size={13} color={couleurs.primaireFonce} />
                  <Text style={styles.texteClim}>{t('reserver_clim')}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {mode === 'partage' ? (
        // Partagé : pas de réservation directe — liste des trajets postés.
        <>
          <EncartInfo icone="people-outline">{t('reserver_partage_info')}</EncartInfo>
          {/* Règles de ponctualité et d'annulation : affichées AVANT la réservation. */}
          <EncartInfo icone="time-outline" ton="attente">
            {t('rides_regle_retard')}
          </EncartInfo>
          <EncartInfo icone="return-down-back-outline">
            {t('resa_regle_annulation')}
          </EncartInfo>
          <RidesPartages />
          {/* Aucun taxi à son heure ? Le client laisse sa demande — l'équipe
              est prévenue, puis re-notifiée dès qu'une annonce correspond. */}
          {itineraireChoisi &&
            !modeHotel &&
            (attenteEnvoyee ? (
              <EncartInfo icone="checkmark-circle-outline" ton="succes">
                {t('reserver_attente_ok')}
              </EncartInfo>
            ) : (
              <Bouton
                titre={t('reserver_attente_bouton', { depart, arrivee })}
                icone="notifications-outline"
                variante="secondaire"
                onPress={laisserDemandeAttente}
                charge={chargeAttente}
              />
            ))}
        </>
      ) : (
        <>
          {estSpecial && (
            <EncartInfo icone="sparkles-outline" ton="succes">
              {t('reserver_special_info', { depart, arrivee })}
            </EncartInfo>
          )}

          {modeHotel && (
            <>
              <Text style={styles.titreSection}>{t('reserver_votre_client')}</Text>
              <Champ
                label={t('reserver_nom_client')}
                value={nomClient}
                onChangeText={setNomClient}
                placeholder={t('reserver_nom_client_placeholder')}
              />
              <Champ
                label={t('reserver_tel_client')}
                value={telClient}
                onChangeText={setTelClient}
                keyboardType="phone-pad"
                placeholder="+255 712 345 678"
              />
            </>
          )}

          {/* Quand ? Un champ qui ouvre un vrai calendrier — on tape le jour
              voulu (jusqu'à 3 mois), au lieu de dérouler une longue liste. */}
          <Text style={styles.libelleChamp}>{t('reserver_programmer')}</Text>
          <Pressable
            onPress={() => setCalendrierOuvert((v) => !v)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.champQuand, pressed && { opacity: 0.7 }]}
          >
            <Ionicons
              name="calendar-outline"
              size={18}
              color={dateChoisie ? couleurs.primaireFonce : couleurs.texteSecondaire}
            />
            <Text style={[styles.champQuandTexte, !dateChoisie && styles.champQuandVide]}>
              {dateChoisie ? formaterDateChoisie(dateChoisie, langue) : t('sel_maintenant')}
            </Text>
            <Ionicons
              name={calendrierOuvert ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={couleurs.texteSecondaire}
            />
          </Pressable>

          {calendrierOuvert && (
            <View style={{ gap: espaces.s }}>
              {/* Revenir à « départ dès que possible » (efface la date). */}
              {!!dateChoisie && (
                <Pressable
                  onPress={() => {
                    setDateChoisie('');
                    setHeureProgramme('');
                    setCalendrierOuvert(false);
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.optionMaintenant, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="flash-outline" size={16} color={couleurs.primaireFonce} />
                  <Text style={styles.optionMaintenantTexte}>{t('sel_maintenant')}</Text>
                </Pressable>
              )}
              <CalendrierDate
                valeur={dateChoisie}
                maxJours={JOURS_RESERVATION_AVANCE}
                langue={langue}
                onChange={(date) => {
                  setDateChoisie(date);
                  setCalendrierOuvert(false);
                }}
              />
            </View>
          )}
          {!!dateChoisie && (
            <Selecteur
              label={t('sel_heure')}
              valeur={heureProgramme}
              options={HEURES_CHOIX}
              onChange={setHeureProgramme}
            />
          )}

          {/* Transfert aéroport : n° de vol — l'équipe surveille l'heure
              réelle d'atterrissage, taxi garanti même si le vol est en retard. */}
          {trajetAeroport && (
            <>
              <Champ
                label={t('reserver_num_vol')}
                value={numeroVol}
                onChangeText={setNumeroVol}
                autoCapitalize="characters"
                placeholder="ET815"
              />
              <EncartInfo icone="airplane-outline">{t('reserver_num_vol_info')}</EncartInfo>
            </>
          )}

          {/* Aller-retour + options véhicule (cases à cocher). */}
          {(
            [
              {
                cle: 'ar',
                actif: allerRetour,
                bascule: () => setAllerRetour(!allerRetour),
                icone: 'repeat-outline' as const,
                libelle: t('reserver_aller_retour'),
              },
              {
                cle: 'bagages',
                actif: grosBagages,
                bascule: () => setGrosBagages(!grosBagages),
                icone: 'briefcase-outline' as const,
                libelle: t('reserver_gros_bagages'),
              },
            ]
          ).map((option) => (
            <Pressable
              key={option.cle}
              onPress={option.bascule}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: option.actif }}
              style={[styles.ligneOption, option.actif && styles.ligneOptionActive]}
            >
              <Ionicons name={option.icone} size={20} color={couleurs.primaireFonce} />
              <Text style={styles.texteOption}>{option.libelle}</Text>
              <Ionicons
                name={option.actif ? 'checkbox' : 'square-outline'}
                size={22}
                color={option.actif ? couleurs.primaire : couleurs.texteSecondaire}
              />
            </Pressable>
          ))}

          <View style={styles.cartePrix}>
            <View style={styles.lignePrix}>
              <Text style={styles.labelPrix}>
                {allerRetour ? t('reserver_prix_aller_retour') : t('reserver_prix_course')}
              </Text>
              <Text style={styles.valeurPrix}>
                {tarifAffiche !== null
                  ? formaterMontant(tarifAffiche.montant, tarifAffiche.devise)
                  : '—'}
              </Text>
            </View>
            <Text style={styles.note}>{t('reserver_note_prix')}</Text>
          </View>

          <TexteErreur>{erreur}</TexteErreur>
          <Bouton
            titre={modeHotel ? t('reserver_bouton_hotel') : t('reserver_bouton')}
            icone="checkmark-circle-outline"
            onPress={reserver}
            charge={charge}
          />
          {/* Les annonces des chauffeurs ne s'affichent QUE dans l'onglet
              « Partagé » — les mélanger sous le formulaire privé rendait
              l'écran illisible. */}
        </>
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
  rangeeModes: {
    flexDirection: 'row',
    gap: espaces.m,
  },
  carteMode: {
    flex: 1,
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.carte,
    padding: espaces.l,
    gap: espaces.xs,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    ...ombres.carte,
  },
  carteModeActive: {
    borderColor: couleurs.primaire,
    backgroundColor: couleurs.primaireClair,
  },
  // Cases à cocher (aller-retour, siège bébé, gros bagages).
  ligneOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.bouton,
    paddingHorizontal: espaces.l,
    paddingVertical: espaces.m,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  ligneOptionActive: {
    borderColor: couleurs.primaire,
    backgroundColor: couleurs.primaireClair,
  },
  texteOption: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '600',
    color: couleurs.encre,
  },
  bulleIcone: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: espaces.xs,
  },
  bulleIconeActive: {
    backgroundColor: couleurs.primaire,
  },
  titreMode: {
    fontSize: 17,
    fontWeight: '800',
    color: couleurs.encre,
  },
  descriptionMode: {
    fontSize: 12,
    color: couleurs.texteSecondaire,
    textAlign: 'center',
    lineHeight: 16,
  },
  sousTypeMode: {
    fontSize: 11,
    color: couleurs.texteSecondaire,
    fontWeight: '600',
  },
  prixMode: {
    fontSize: 16,
    fontWeight: '800',
    color: couleurs.primaire,
    marginTop: espaces.xs,
  },
  // En attendant le choix du trajet : pas de montant, juste une invitation.
  prixModeAttente: {
    fontSize: 12.5,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
    marginTop: espaces.xs,
  },
  ligneClim: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs,
    backgroundColor: couleurs.primaireClair,
    borderRadius: rayons.pastille,
    paddingHorizontal: espaces.s,
    paddingVertical: 2,
    marginTop: espaces.xs,
  },
  texteClim: {
    fontSize: 11,
    fontWeight: '700',
    color: couleurs.primaireFonce,
  },
  cartePrix: {
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.carte,
    padding: espaces.l,
    gap: espaces.s,
    borderWidth: 2,
    borderColor: couleurs.primaire,
    ...ombres.douce,
  },
  // Prix CENTRÉ sous son libellé : les montants en shillings (6 chiffres)
  // débordaient de l'écran en rangée côte à côte.
  lignePrix: {
    alignItems: 'center',
    gap: 2,
  },
  labelPrix: {
    fontSize: 14,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
    textAlign: 'center',
  },
  valeurPrix: {
    fontSize: 26,
    fontWeight: '800',
    color: couleurs.primaire,
    textAlign: 'center',
  },
  note: {
    fontSize: 12,
    color: couleurs.texteSecondaire,
    lineHeight: 17,
  },
  libelleChamp: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
    marginBottom: espaces.xs,
  },
  champQuand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    backgroundColor: couleurs.surface,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.bouton,
    paddingHorizontal: espaces.m,
    minHeight: 48,
  },
  champQuandTexte: {
    flex: 1,
    fontSize: 16,
    color: couleurs.encre,
  },
  champQuandVide: {
    color: couleurs.texteSecondaire,
  },
  optionMaintenant: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: espaces.xs,
    paddingVertical: espaces.s,
    paddingHorizontal: espaces.m,
    backgroundColor: couleurs.primaireClair,
    borderRadius: rayons.bouton,
  },
  optionMaintenantTexte: {
    fontSize: 14,
    fontWeight: '600',
    color: couleurs.primaireFonce,
  },
});
