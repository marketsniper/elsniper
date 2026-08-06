// Onglet « Réserver » : choix du type de course (tarif plat par type),
// itinéraire, course programmée optionnelle. Le prix officiel est calculé par
// le backend (pricingService) et FIGÉ à la création du trajet ; la grille
// affichée ici en est le miroir exact.
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Bouton, Carte, Champ, Ecran, SousTitre, TexteErreur } from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { couleurs, espaces, rayons } from '@/lib/theme';
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

// Types de course proposés au client — clés = trip_type de l'API.
const FORMULES: { cle: TypeTrajet; description: string }[] = [
  {
    cle: 'private',
    description: 'Un véhicule rien que pour vous, départ immédiat ou programmé.',
  },
  {
    cle: 'shared_tourist',
    description: 'Trajet partagé entre voyageurs sur les grands axes.',
  },
  {
    cle: 'shared_local',
    description: 'Trajet partagé au tarif local, réservé aux résidents vérifiés.',
  },
  {
    cle: 'posted_return',
    description: "Profitez d'un retour à vide annoncé par un chauffeur, à prix doux.",
  },
];

export default function EcranReserver() {
  const router = useRouter();
  const { session } = useAuth();
  const utilisateur = session?.user ?? null;

  const devise = deviseUtilisateur(utilisateur);
  const estResident = champ<TypeCompte>(utilisateur, 'account_type', 'accountType') === 'resident';
  const localAutorise = residentVerifie(utilisateur);

  const [formule, setFormule] = useState<TypeTrajet>('private');
  const [depart, setDepart] = useState('');
  const [arrivee, setArrivee] = useState('');
  const [programme, setProgramme] = useState('');
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
    if (!utilisateur) {
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
      const trajet = await api.creerTrajet({
        userId: utilisateur.id,
        tripType: formule,
        pickupLocation: depart.trim(),
        dropoffLocation: arrivee.trim(),
        scheduledAt,
      });
      setDepart('');
      setArrivee('');
      setProgramme('');
      router.push(`/trip/${trajet.id}`);
    } catch (e) {
      if (e instanceof ErreurApi && e.code === 'resident_not_verified') {
        setErreur(
          "Votre compte résident est en attente de validation par l'équipe — le tarif local sera disponible ensuite."
        );
      } else {
        setErreur(e instanceof ErreurApi ? e.message : 'La réservation a échoué.');
      }
    } finally {
      setCharge(false);
    }
  };

  return (
    <Ecran>
      <SousTitre>Type de course</SousTitre>
      {FORMULES.map((f) => {
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
            style={[
              styles.carteType,
              actif && !indisponible && styles.carteTypeActive,
              indisponible && styles.carteTypeInactive,
            ]}
          >
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
                <Text style={[styles.prixType, indisponible && { color: couleurs.texteSecondaire }]}>
                  {formaterMontant(tarif, estLocal ? 'TZS' : devise)}
                </Text>
              )}
            </View>
            <Text style={styles.descriptionType}>{f.description}</Text>
            {indisponible && <Text style={styles.indispo}>{raisonLocalIndisponible}</Text>}
          </Pressable>
        );
      })}

      <SousTitre>Itinéraire</SousTitre>
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

      <Carte style={styles.cartePrix}>
        <View style={styles.lignePrix}>
          <Text style={styles.labelPrix}>Prix de la course</Text>
          <Text style={styles.valeurPrix}>
            {prixFormule !== null ? formaterMontant(prixFormule, devise) : '—'}
          </Text>
        </View>
        <Text style={styles.note}>
          Tarif plat selon le type de course (grille zanziGo). Le prix est figé par le serveur à
          la réservation — aucun supplément ensuite.
        </Text>
      </Carte>

      <TexteErreur>{erreur}</TexteErreur>
      <Bouton titre="Réserver cette course" onPress={reserver} charge={charge} />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  carteType: {
    backgroundColor: couleurs.blanc,
    borderRadius: rayons.carte,
    padding: espaces.l,
    gap: espaces.xs,
    borderWidth: 1.5,
    borderColor: couleurs.blanc,
  },
  carteTypeActive: {
    borderColor: couleurs.primaire,
    backgroundColor: couleurs.primaireClair,
  },
  carteTypeInactive: {
    opacity: 0.6,
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
    gap: espaces.s,
  },
  lignePrix: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelPrix: {
    fontSize: 14,
    color: couleurs.texteSecondaire,
  },
  valeurPrix: {
    fontSize: 22,
    fontWeight: '800',
    color: couleurs.primaire,
  },
  note: {
    fontSize: 12,
    color: couleurs.texteSecondaire,
    lineHeight: 17,
  },
});
