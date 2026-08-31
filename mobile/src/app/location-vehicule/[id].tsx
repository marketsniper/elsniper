// FICHE VÉHICULE (client) — catalogue de location : photos, description,
// prix par jour, et la réservation elle-même (dates + paiement dans l'app,
// comme une place de taxi partagé). Aucune coordonnée du loueur : zanziGo
// reste l'unique interlocuteur — seul le fait que les documents sont
// vérifiés est montré (voir sanitizeVehicle côté serveur).
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { CalendrierDate } from '@/components/CalendrierDate';
import {
  Badge,
  Bouton,
  Carte,
  ChargementCentre,
  Ecran,
  LigneInfo,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, rayons, stylesReactifs } from '@/lib/theme';
import { formaterMontant, type VehiculeLocation } from '@/lib/types';

// Horizon de réservation : large, une location se planifie parfois des mois
// à l'avance (un vol réservé longtemps avant le séjour).
const MAX_JOURS_RESERVATION = 180;

export default function EcranFicheVehiculeLocation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, langue } = useT();
  const [vehicule, setVehicule] = useState<VehiculeLocation | null>(null);
  const [erreur, setErreur] = useState('');
  const [introuvable, setIntrouvable] = useState(false);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [ouvertDepart, setOuvertDepart] = useState(false);
  const [ouvertRetour, setOuvertRetour] = useState(false);
  const [reservationEnCours, setReservationEnCours] = useState(false);

  const charger = useCallback(async () => {
    if (!id) return;
    try {
      const v = await api.obtenirVehicule(id, false);
      setVehicule(v);
      setErreur('');
    } catch (e) {
      setIntrouvable(true);
      setErreur(e instanceof ErreurApi ? e.message : t('vehicule_fiche_erreur'));
    }
  }, [id, t]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (!vehicule) {
    return introuvable || erreur ? (
      <Ecran fond="palmiers">
        <TexteErreur>{erreur || t('vehicule_fiche_erreur')}</TexteErreur>
        <Bouton
          titre={t('commun_retour_accueil')}
          icone="arrow-back-outline"
          variante="secondaire"
          onPress={() => router.back()}
        />
      </Ecran>
    ) : (
      <ChargementCentre />
    );
  }

  const jours =
    startDate && endDate && endDate >= startDate
      ? Math.round(
          (new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) /
            86_400_000
        ) + 1
      : 0;
  const prixTotal = jours > 0 ? Math.round(Number(vehicule.daily_price) * jours * 100) / 100 : 0;

  const reserver = async () => {
    setErreur('');
    if (jours <= 0) {
      setErreur(t('vehicule_erreur_dates'));
      return;
    }
    setReservationEnCours(true);
    try {
      const booking = await api.reserverVehicule(vehicule.id, startDate, endDate);
      router.replace(`/location/${booking.id}`);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('vehicule_erreur'));
    } finally {
      setReservationEnCours(false);
    }
  };

  return (
    <Ecran fond="palmiers" onRefresh={charger}>
      {vehicule.photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galerie}>
          {vehicule.photos.map((photo) => (
            <Image key={photo.id} source={{ uri: photo.url }} style={styles.photo} resizeMode="cover" />
          ))}
        </ScrollView>
      )}

      <Carte>
        <View style={styles.enTete}>
          <Titre>
            {vehicule.make} {vehicule.model}
          </Titre>
          {vehicule.documents_verified && <Badge texte={t('location_verifie')} ton="succes" />}
        </View>
        <Text style={styles.categorie}>{vehicule.category}</Text>
        {!!vehicule.seats && (
          <LigneInfo label={t('vehicule_champ_places')} valeur={String(vehicule.seats)} />
        )}
        {!!vehicule.transmission && (
          <LigneInfo label={t('vehicule_champ_transmission')} valeur={vehicule.transmission} />
        )}
        <LigneInfo label={t('vehicule_champ_lieu_retrait')} valeur={vehicule.pickup_location} />
        {!!vehicule.description && <Text style={styles.description}>{vehicule.description}</Text>}
        <View style={styles.blocPrix}>
          <Text style={styles.prix}>{formaterMontant(vehicule.daily_price, vehicule.currency)}</Text>
          <Text style={styles.parJour}>{t('location_par_jour')}</Text>
        </View>
      </Carte>

      <Carte>
        <Titre>{t('vehicule_reserver_titre')}</Titre>

        <Pressable
          onPress={() => {
            setOuvertDepart((v) => !v);
            setOuvertRetour(false);
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.champDate, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.labelDate}>{t('vehicule_date_depart')}</Text>
          <View style={styles.ligneValeurDate}>
            <Text style={styles.valeurDate}>{startDate || '—'}</Text>
            <Ionicons name={ouvertDepart ? 'chevron-up' : 'chevron-down'} size={18} color={couleurs.texteSecondaire} />
          </View>
        </Pressable>
        {ouvertDepart && (
          <CalendrierDate
            valeur={startDate}
            maxJours={MAX_JOURS_RESERVATION}
            langue={langue}
            onChange={(date) => {
              setStartDate(date);
              if (endDate && endDate < date) setEndDate('');
              setOuvertDepart(false);
            }}
          />
        )}

        <Pressable
          onPress={() => {
            setOuvertRetour((v) => !v);
            setOuvertDepart(false);
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.champDate, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.labelDate}>{t('vehicule_date_retour')}</Text>
          <View style={styles.ligneValeurDate}>
            <Text style={styles.valeurDate}>{endDate || '—'}</Text>
            <Ionicons name={ouvertRetour ? 'chevron-up' : 'chevron-down'} size={18} color={couleurs.texteSecondaire} />
          </View>
        </Pressable>
        {ouvertRetour && (
          <CalendrierDate
            valeur={endDate}
            maxJours={MAX_JOURS_RESERVATION}
            langue={langue}
            onChange={(date) => {
              setEndDate(date);
              setOuvertRetour(false);
            }}
          />
        )}

        {jours > 0 && (
          <View style={styles.blocPrix}>
            <Text style={styles.prix}>{formaterMontant(prixTotal, vehicule.currency)}</Text>
            <Text style={styles.parJour}>
              {t('vehicule_prix_total')} · {t('vehicule_jours', { n: jours })}
            </Text>
          </View>
        )}

        <TexteErreur>{erreur}</TexteErreur>
        <Bouton
          titre={t('vehicule_reserver_bouton')}
          icone="calendar-outline"
          onPress={reserver}
          charge={reservationEnCours}
          desactive={jours <= 0 || reservationEnCours}
        />
      </Carte>

      <Bouton
        titre={t('commun_retour_accueil')}
        icone="arrow-back-outline"
        variante="secondaire"
        onPress={() => router.back()}
      />
    </Ecran>
  );
}

const styles = stylesReactifs(() => ({
  galerie: { marginBottom: espaces.s },
  photo: {
    width: 260,
    height: 180,
    borderRadius: rayons.carte,
    marginRight: espaces.s,
    backgroundColor: couleurs.surface,
  },
  enTete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espaces.m },
  categorie: { color: couleurs.texteSecondaire, fontSize: 13.5, textTransform: 'uppercase', letterSpacing: 0.4 },
  description: { color: couleurs.encre, fontSize: 14.5, lineHeight: 21 },
  blocPrix: {
    marginTop: espaces.s,
    paddingTop: espaces.m,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    alignItems: 'center',
    gap: 2,
  },
  prix: { fontSize: 24, fontWeight: '800', color: couleurs.primaire },
  parJour: { fontSize: 13, fontWeight: '600', color: couleurs.texteSecondaire },
  champDate: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: couleurs.surface,
    borderRadius: rayons.bouton,
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.s,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  labelDate: { fontSize: 13, fontWeight: '600', color: couleurs.texteSecondaire },
  ligneValeurDate: { flexDirection: 'row', alignItems: 'center', gap: espaces.xs },
  valeurDate: { fontSize: 15, fontWeight: '700', color: couleurs.encre },
}));
