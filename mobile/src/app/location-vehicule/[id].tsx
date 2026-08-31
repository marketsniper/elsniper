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
import { IconeCategorie } from '@/components/IconeCategorie';
import { Selecteur } from '@/components/Selecteur';
import { VisionneusePhotos } from '@/components/VisionneusePhotos';
import {
  Badge,
  Bouton,
  Carte,
  Champ,
  ChargementCentre,
  Ecran,
  LigneInfo,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { HEURES_CHOIX, libelleCategorieVehicule, useT } from '@/lib/i18n';
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
  // Photo ouverte en grand (position dans la galerie), ou null.
  const [photoOuverte, setPhotoOuverte] = useState<number | null>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // Où le client veut récupérer le véhicule (optionnel — sinon le lieu de
  // retrait de la fiche), et à quelle heure il veut démarrer.
  const [lieuRemise, setLieuRemise] = useState('');
  const [heureRemise, setHeureRemise] = useState('');
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
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/location'))}
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
      const booking = await api.reserverVehicule(
        vehicule.id,
        startDate,
        endDate,
        undefined,
        lieuRemise.trim() || undefined,
        heureRemise || undefined
      );
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
          {/* Chaque photo S'OUVRE EN GRAND (demande du client) : la vignette
              du ruban ne montre qu'un cadrage — le plein écran montre le
              véhicule. La petite loupe dit que ça se touche. */}
          {vehicule.photos.map((photo, position) => (
            <Pressable
              key={photo.id}
              onPress={() => setPhotoOuverte(position)}
              accessibilityRole="button"
              accessibilityLabel={t('photos_ouvrir')}
              style={({ pressed }) => [styles.cadrePhoto, pressed && { opacity: 0.85 }]}
            >
              <Image source={{ uri: photo.url }} style={styles.photo} resizeMode="cover" />
              <View style={styles.loupe}>
                <Ionicons name="expand-outline" size={14} color="#FFFFFF" />
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <VisionneusePhotos
        photos={vehicule.photos}
        index={photoOuverte}
        titre={`${vehicule.make} ${vehicule.model}`}
        onFermer={() => setPhotoOuverte(null)}
      />

      <Carte>
        <View style={styles.enTete}>
          <Titre>
            {vehicule.make} {vehicule.model}
          </Titre>
          {vehicule.documents_verified && <Badge texte={t('location_verifie')} ton="succes" />}
        </View>
        <View style={styles.ligneCategorie}>
          <IconeCategorie categorie={vehicule.category} taille={18} couleur={couleurs.texteSecondaire} />
          <Text style={styles.categorie}>{libelleCategorieVehicule(vehicule.category, t)}</Text>
        </View>
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

        {/* OÙ REMETTRE LE VÉHICULE (demande du client) : l'hôtel, une
            adresse… Optionnel — vide, la remise se fait au lieu de retrait
            de la fiche, affiché juste au-dessus. */}
        <Champ
          label={t('location_champ_lieu_remise')}
          value={lieuRemise}
          onChangeText={setLieuRemise}
          placeholder={vehicule.pickup_location}
        />
        {/* L'HEURE DE DÉBUT (demande du client) : mêmes créneaux que la
            programmation d'une course. Optionnelle — sans heure, la remise
            se convient par WhatsApp comme avant. */}
        <Selecteur
          label={t('location_champ_heure_remise')}
          valeur={heureRemise}
          options={HEURES_CHOIX}
          onChange={setHeureRemise}
        />

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
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/location'))}
      />
    </Ecran>
  );
}

const styles = stylesReactifs(() => ({
  galerie: { marginBottom: espaces.s },
  cadrePhoto: { marginRight: espaces.s },
  photo: {
    width: 260,
    height: 180,
    borderRadius: rayons.carte,
    backgroundColor: couleurs.surface,
  },
  // La loupe en coin : l'indice que la vignette s'ouvre en grand.
  loupe: {
    position: 'absolute',
    right: espaces.s,
    bottom: espaces.s,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(4, 8, 6, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  enTete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espaces.m },
  ligneCategorie: { flexDirection: 'row', alignItems: 'center', gap: espaces.xs },
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
