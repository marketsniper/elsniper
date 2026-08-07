// Onglet « Réserver » : itinéraire en haut, puis choix du mode Privé ou
// Partagé, récapitulatif de prix et bouton. Le prix officiel est calculé par
// le backend (pricingService) et FIGÉ à la création ; la grille affichée ici
// en est le miroir exact (types.ts).
// Segmentation : touriste USD plein tarif ; résident USD (−10 % une fois
// vérifié, bandeau d'attente sinon) ; local (carte tanzanienne) 15 000 TZS
// partout une fois vérifié — non vérifié, il ne peut pas réserver (écran
// d'attente, 403 local_not_verified côté serveur). « Partagé » =
// shared_tourist pour touristes/résidents/hôtels, shared_local pour les
// locaux vérifiés. La formule posted_return n'est plus proposée.
// Mode hôtel : réservation POUR SON CLIENT — TZS, champs Nom/Téléphone du
// client, payload {hotelId, clientName, clientPhone, …} sans userId.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RidesPartages } from '@/components/RidesPartages';
import { Bouton, Champ, Ecran, EncartInfo, EtatVide, TexteErreur } from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { libelleTypeTrajet, useT } from '@/lib/i18n';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import {
  champ,
  formaterMontant,
  localVerifie,
  profilTarifaireUtilisateur,
  tarifTrajetProfil,
  type ProfilTarifaire,
  type TypeCompte,
  type TypeTrajet,
} from '@/lib/types';

type ModeCourse = 'prive' | 'partage';

export default function EcranReserver() {
  const router = useRouter();
  const { session } = useAuth();
  const { t } = useT();
  const utilisateur = session?.user ?? null;
  const hotel = session?.hotel ?? null;
  // Mode hôtel : le profil hôtel réserve des taxis pour ses clients.
  const modeHotel = !!hotel;

  const typeCompteClient = champ<TypeCompte>(utilisateur, 'account_type', 'accountType');
  const estLocalVerifie = localVerifie(utilisateur);
  const estLocalEnAttente = !modeHotel && typeCompteClient === 'local' && !estLocalVerifie;

  // Profil tarifaire : détermine devise et montants affichés.
  const profil: ProfilTarifaire = modeHotel ? 'hotel' : profilTarifaireUtilisateur(utilisateur);

  const [mode, setMode] = useState<ModeCourse>('prive');
  const [depart, setDepart] = useState('');
  const [arrivee, setArrivee] = useState('');
  const [programme, setProgramme] = useState('');
  const [nomClient, setNomClient] = useState('');
  const [telClient, setTelClient] = useState('+255');
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  // « Partagé » = navette locale pour un local vérifié, navette touristes sinon.
  const typePartage: TypeTrajet = estLocalVerifie ? 'shared_local' : 'shared_tourist';
  const typeCourse: TypeTrajet = mode === 'prive' ? 'private' : typePartage;
  const tarifCourant = tarifTrajetProfil(typeCourse, profil);

  const reserver = async () => {
    setErreur('');
    if (!utilisateur && !modeHotel) {
      setErreur(t('reserver_erreur_profil'));
      return;
    }
    if (!depart.trim() || !arrivee.trim()) {
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
    if (programme.trim()) {
      const date = new Date(programme.trim().replace(' ', 'T'));
      if (Number.isNaN(date.getTime())) {
        setErreur(t('reserver_erreur_date'));
        return;
      }
      scheduledAt = date.toISOString();
    }
    setCharge(true);
    try {
      const trajet = modeHotel
        ? await api.creerTrajetHotel({
            hotelId: hotel!.id,
            clientName: nomClient.trim(),
            clientPhone: telClientNormalise,
            tripType: typeCourse,
            pickupLocation: depart.trim(),
            dropoffLocation: arrivee.trim(),
            scheduledAt,
          })
        : await api.creerTrajet({
            userId: utilisateur!.id,
            tripType: typeCourse,
            pickupLocation: depart.trim(),
            dropoffLocation: arrivee.trim(),
            scheduledAt,
          });
      setDepart('');
      setArrivee('');
      setProgramme('');
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
      <Champ
        label={t('commun_depart')}
        value={depart}
        onChangeText={setDepart}
        placeholder={t('reserver_depart_placeholder')}
      />
      <Champ
        label={t('commun_arrivee')}
        value={arrivee}
        onChangeText={setArrivee}
        placeholder={t('reserver_arrivee_placeholder')}
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
          const tarif = tarifTrajetProfil(option.type, profil);
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
                  color={actif ? couleurs.blanc : couleurs.primaire}
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
            </Pressable>
          );
        })}
      </View>

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

      <Champ
        label={t('reserver_programmer')}
        value={programme}
        onChangeText={setProgramme}
        placeholder={t('reserver_programmer_placeholder')}
      />

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

      <RidesPartages />
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
