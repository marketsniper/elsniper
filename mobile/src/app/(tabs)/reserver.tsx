// Onglet « Réserver » : choix du type de course (tarif plat par type),
// itinéraire, course programmée optionnelle. Le prix officiel est calculé par
// le backend (pricingService) et FIGÉ à la création du trajet ; la grille
// affichée ici en est le miroir exact.
// Mode hôtel (profil hôtel connecté) : l'hôtel réserve POUR SON CLIENT —
// prix en TZS, pas de navette locale, champs « Nom / Téléphone du client »,
// payload {hotelId, clientName, clientPhone, …} sans userId.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RidesPartages } from '@/components/RidesPartages';
import { Bouton, Champ, Ecran, EncartInfo, TexteErreur } from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import {
  champ,
  deviseUtilisateur,
  formaterMontant,
  LIBELLES_TYPE_TRAJET,
  residentVerifie,
  tarifTrajet,
  type TypeCompte,
  type TypeTrajet,
} from '@/lib/types';

// Types de course proposés — clés = trip_type de l'API, icône par formule.
const FORMULES: {
  cle: TypeTrajet;
  icone: React.ComponentProps<typeof Ionicons>['name'];
  description: string;
}[] = [
  {
    cle: 'private',
    icone: 'car-outline',
    description: 'Un véhicule rien que pour vous, départ immédiat ou programmé.',
  },
  {
    cle: 'shared_tourist',
    icone: 'bus-outline',
    description: 'Trajet partagé entre voyageurs sur les grands axes.',
  },
  {
    cle: 'shared_local',
    icone: 'home-outline',
    description: 'Trajet partagé au tarif local, réservé aux résidents vérifiés.',
  },
  {
    cle: 'posted_return',
    icone: 'swap-horizontal-outline',
    description: "Profitez d'un retour à vide annoncé par un chauffeur, à prix doux.",
  },
];

export default function EcranReserver() {
  const router = useRouter();
  const { session } = useAuth();
  const utilisateur = session?.user ?? null;
  const hotel = session?.hotel ?? null;
  // Mode hôtel : le profil hôtel réserve des taxis pour ses clients.
  const modeHotel = !!hotel;

  const devise = modeHotel ? 'TZS' : deviseUtilisateur(utilisateur);
  const estResident = champ<TypeCompte>(utilisateur, 'account_type', 'accountType') === 'resident';
  const localAutorise = residentVerifie(utilisateur);

  // Cloison tarifaire : la navette locale (tarif résident en TZS) n'apparaît
  // QUE pour les comptes résidents — jamais aux touristes ni aux hôtels.
  const formules =
    !modeHotel && estResident ? FORMULES : FORMULES.filter((f) => f.cle !== 'shared_local');

  const [formule, setFormule] = useState<TypeTrajet>('private');
  const [depart, setDepart] = useState('');
  const [arrivee, setArrivee] = useState('');
  const [programme, setProgramme] = useState('');
  const [nomClient, setNomClient] = useState('');
  const [telClient, setTelClient] = useState('+255');
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  const prixFormule = tarifTrajet(formule, devise);

  // Raison d'indisponibilité du tarif local pour ce compte (ou null si OK).
  const raisonLocalIndisponible = !estResident
    ? 'Réservé aux résidents de Zanzibar (compte résident vérifié).'
    : !localAutorise
      ? "Compte résident en attente de validation par l'équipe."
      : null;

  const reserver = async () => {
    setErreur('');
    if (!utilisateur && !modeHotel) {
      setErreur('Créez votre profil client avant de réserver.');
      return;
    }
    if (formule === 'shared_local' && raisonLocalIndisponible) {
      setErreur(raisonLocalIndisponible);
      return;
    }
    if (!depart.trim() || !arrivee.trim()) {
      setErreur('Indiquez le lieu de départ et la destination.');
      return;
    }
    let telClientNormalise = '';
    if (modeHotel) {
      if (!nomClient.trim()) {
        setErreur('Indiquez le nom du client pour cette course.');
        return;
      }
      telClientNormalise = telClient.replace(/[\s-]/g, '');
      if (!/^\+[1-9]\d{6,14}$/.test(telClientNormalise)) {
        setErreur('Téléphone du client invalide (format international +255…).');
        return;
      }
    }
    let scheduledAt: string | undefined;
    if (programme.trim()) {
      const date = new Date(programme.trim().replace(' ', 'T'));
      if (Number.isNaN(date.getTime())) {
        setErreur('Date programmée invalide. Format attendu : AAAA-MM-JJ HH:MM.');
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
            tripType: formule,
            pickupLocation: depart.trim(),
            dropoffLocation: arrivee.trim(),
            scheduledAt,
          })
        : await api.creerTrajet({
            userId: utilisateur!.id,
            tripType: formule,
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
      if (e instanceof ErreurApi && e.code === 'resident_not_verified') {
        setErreur(
          "Votre compte résident est en attente de validation par l'équipe — le tarif local sera disponible ensuite."
        );
      } else {
        setErreur(e instanceof ErreurApi ? e.message : 'La réservation a échoué. Réessayez.');
      }
    } finally {
      setCharge(false);
    }
  };

  return (
    <Ecran>
      {modeHotel && (
        <EncartInfo icone="business-outline">
          Mode hôtel — réservez un taxi pour votre client, tarifs en TZS.
        </EncartInfo>
      )}

      <Text style={styles.titreSection}>Type de course</Text>
      {formules.map((f) => {
        const actif = formule === f.cle;
        const estLocal = f.cle === 'shared_local';
        const indisponible = estLocal && !!raisonLocalIndisponible;
        const tarif = tarifTrajet(f.cle, estLocal ? 'TZS' : devise);
        return (
          <Pressable
            key={f.cle}
            onPress={() => {
              if (!indisponible) setFormule(f.cle);
            }}
            disabled={indisponible}
            accessibilityRole="button"
            style={[
              styles.carteType,
              actif && !indisponible && styles.carteTypeActive,
              indisponible && styles.carteTypeInactive,
            ]}
          >
            <View style={styles.rangeeType}>
              <View
                style={[
                  styles.bulleIcone,
                  actif && !indisponible && styles.bulleIconeActive,
                  indisponible && styles.bulleIconeInactive,
                ]}
              >
                <Ionicons
                  name={indisponible ? 'lock-closed-outline' : f.icone}
                  size={22}
                  color={
                    indisponible
                      ? couleurs.texteSecondaire
                      : actif
                        ? couleurs.blanc
                        : couleurs.primaire
                  }
                />
              </View>
              <View style={styles.textesType}>
                <View style={styles.enTeteType}>
                  <Text
                    style={[
                      styles.titreType,
                      actif && !indisponible && { color: couleurs.primaireFonce },
                      indisponible && { color: couleurs.texteSecondaire },
                    ]}
                  >
                    {LIBELLES_TYPE_TRAJET[f.cle]}
                  </Text>
                  {tarif !== null && (
                    <Text
                      style={[styles.prixType, indisponible && { color: couleurs.texteSecondaire }]}
                    >
                      {formaterMontant(tarif, estLocal ? 'TZS' : devise)}
                    </Text>
                  )}
                </View>
                <Text style={styles.descriptionType}>{f.description}</Text>
                {indisponible && <Text style={styles.indispo}>{raisonLocalIndisponible}</Text>}
              </View>
            </View>
          </Pressable>
        );
      })}

      <RidesPartages />

      {modeHotel && (
        <>
          <Text style={styles.titreSection}>Votre client</Text>
          <Champ
            label="Nom du client"
            value={nomClient}
            onChangeText={setNomClient}
            placeholder="Ex. : M. et Mme Dupont, chambre 12"
          />
          <Champ
            label="Téléphone du client"
            value={telClient}
            onChangeText={setTelClient}
            keyboardType="phone-pad"
            placeholder="+255 712 345 678"
          />
        </>
      )}

      <Text style={styles.titreSection}>Itinéraire</Text>
      <Champ
        label="Départ"
        value={depart}
        onChangeText={setDepart}
        placeholder="Ex. : aéroport de Zanzibar (ZNZ)"
      />
      <Champ
        label="Arrivée"
        value={arrivee}
        onChangeText={setArrivee}
        placeholder="Ex. : Nungwi, hôtel Ocean View"
      />
      <Champ
        label="Programmer (optionnel, AAAA-MM-JJ HH:MM)"
        value={programme}
        onChangeText={setProgramme}
        placeholder="Laisser vide pour partir dès que possible"
      />

      <View style={styles.cartePrix}>
        <View style={styles.lignePrix}>
          <Text style={styles.labelPrix}>Prix de la course</Text>
          <Text style={styles.valeurPrix}>
            {prixFormule !== null ? formaterMontant(prixFormule, devise) : '—'}
          </Text>
        </View>
        <Text style={styles.note}>
          Tarif plat selon le type de course (grille zanziGo). Le prix est figé à la
          réservation — aucun supplément ensuite.
        </Text>
      </View>

      <TexteErreur>{erreur}</TexteErreur>
      <Bouton
        titre={modeHotel ? 'Réserver pour ce client' : 'Réserver cette course'}
        icone="checkmark-circle-outline"
        onPress={reserver}
        charge={charge}
      />
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
  carteType: {
    backgroundColor: couleurs.blanc,
    borderRadius: rayons.carte,
    padding: espaces.l,
    borderWidth: 2,
    borderColor: couleurs.blanc,
    ...ombres.carte,
  },
  carteTypeActive: {
    borderColor: couleurs.primaire,
    backgroundColor: couleurs.primaireClair,
  },
  carteTypeInactive: {
    opacity: 0.6,
  },
  rangeeType: {
    flexDirection: 'row',
    gap: espaces.m,
    alignItems: 'flex-start',
  },
  bulleIcone: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulleIconeActive: {
    backgroundColor: couleurs.primaire,
  },
  bulleIconeInactive: {
    backgroundColor: couleurs.bordure,
  },
  textesType: {
    flex: 1,
    gap: espaces.xs,
  },
  enTeteType: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  titreType: {
    fontSize: 16,
    fontWeight: '700',
    color: couleurs.encre,
    flexShrink: 1,
  },
  prixType: {
    fontSize: 15,
    fontWeight: '800',
    color: couleurs.primaire,
  },
  descriptionType: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
    lineHeight: 18,
  },
  indispo: {
    fontSize: 12,
    color: couleurs.attente,
    fontWeight: '600',
  },
  cartePrix: {
    backgroundColor: couleurs.blanc,
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
