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
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RidesPartages } from '@/components/RidesPartages';
import { Selecteur } from '@/components/Selecteur';
import { Bouton, Champ, Ecran, EncartInfo, EtatVide, TexteErreur } from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  HEURES_CHOIX,
  isoDepuisChoix,
  libellesDates,
  libelleTypeTrajet,
  useT,
} from '@/lib/i18n';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import {
  champ,
  formaterMontant,
  localVerifie,
  ORIGINES_RIDES,
  profilTarifaireUtilisateur,
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
  // Programmation optionnelle : date + heure en menus déroulants ; date vide
  // = départ dès que possible (option « Maintenant »).
  const [dateProgramme, setDateProgramme] = useState('');
  const [heureProgramme, setHeureProgramme] = useState('');
  const choixDates = libellesDates(t, langue);
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
  // Trajet spécial (privé uniquement) : villes exactes, deux sens.
  const estSpecial = mode === 'prive' && tarifSpecialPrive(depart, arrivee) !== null;
  const tarifCourant = tarifTrajetProfil('private', profil, itineraire);

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
    if (dateProgramme) {
      const iso = heureProgramme
        ? isoDepuisChoix(choixDates, dateProgramme, heureProgramme)
        : null;
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
      const trajet = modeHotel
        ? await api.creerTrajetHotel({
            hotelId: hotel!.id,
            clientName: nomClient.trim(),
            clientPhone: telClientNormalise,
            tripType: 'private',
            pickupLocation,
            dropoffLocation,
            scheduledAt,
          })
        : await api.creerTrajet({
            userId: utilisateur!.id,
            tripType: 'private',
            pickupLocation,
            dropoffLocation,
            scheduledAt,
          });
      setDepart('');
      setArrivee('');
      setPrecision('');
      setDateProgramme('');
      setHeureProgramme('');
      setNomClient('');
      setTelClient('+255');
      router.push(`/trip/${trajet.id}`);
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
        options={lieux}
        onChange={setArrivee}
      />
      <Champ
        label={t('reserver_precision')}
        value={precision}
        onChangeText={setPrecision}
        placeholder={t('reserver_precision_placeholder')}
      />

      <Text style={styles.titreSection}>{t('reserver_mode_titre')}</Text>
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
            {
              cle: 'partage' as ModeCourse,
              icone: 'people-outline' as const,
              titre: t('reserver_partage'),
              description: t('reserver_partage_desc'),
              type: typePartage,
            },
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
              {tarif !== null && (
                <Text style={styles.prixMode}>
                  {formaterMontant(tarif.montant, tarif.devise)}
                </Text>
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
          {/* Règle de ponctualité : affichée AVANT la réservation. */}
          <EncartInfo icone="time-outline" ton="attente">
            {t('rides_regle_retard')}
          </EncartInfo>
          <RidesPartages />
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

          <Selecteur
            label={t('reserver_programmer')}
            valeur={dateProgramme}
            options={[t('sel_maintenant'), ...choixDates]}
            placeholder={t('sel_maintenant')}
            onChange={(choix) => {
              if (choix === t('sel_maintenant')) {
                setDateProgramme('');
                setHeureProgramme('');
              } else {
                setDateProgramme(choix);
              }
            }}
          />
          {!!dateProgramme && (
            <Selecteur
              label={t('sel_heure')}
              valeur={heureProgramme}
              options={HEURES_CHOIX}
              onChange={setHeureProgramme}
            />
          )}

          <View style={styles.cartePrix}>
            <View style={styles.lignePrix}>
              <Text style={styles.labelPrix}>{t('reserver_prix_course')}</Text>
              <Text style={styles.valeurPrix}>
                {tarifCourant !== null
                  ? formaterMontant(tarifCourant.montant, tarifCourant.devise)
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
  lignePrix: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelPrix: {
    fontSize: 14,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  valeurPrix: {
    fontSize: 24,
    fontWeight: '800',
    color: couleurs.primaire,
  },
  note: {
    fontSize: 12,
    color: couleurs.texteSecondaire,
    lineHeight: 17,
  },
});
