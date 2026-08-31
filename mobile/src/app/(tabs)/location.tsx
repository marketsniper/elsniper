// ONGLET LOCATION — le catalogue des véhicules vérifiés, disponibles, non
// archivés (jamais un véhicule encore en attente de contrôle), et une
// bascule vers « Mes locations » pour suivre ses réservations en cours.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import {
  Badge,
  Carte,
  ChargementCentre,
  Ecran,
  EtatVide,
  SousTitre,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, rayons, stylesReactifs } from '@/lib/theme';
import { formaterDate, formaterMontant, type ReservationVehicule, type VehiculeLocation } from '@/lib/types';

type Onglet = 'catalogue' | 'mine';

export default function EcranLocationOnglet() {
  const router = useRouter();
  const { t } = useT();
  const [onglet, setOnglet] = useState<Onglet>('catalogue');
  const [vehicules, setVehicules] = useState<VehiculeLocation[]>([]);
  const [mesLocations, setMesLocations] = useState<ReservationVehicule[]>([]);
  const [charge, setCharge] = useState(true);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    try {
      const [catalogue, locations] = await Promise.all([
        api.listerVehicules(),
        api.listerMesLocations().catch(() => []),
      ]);
      setVehicules(catalogue);
      setMesLocations(locations);
      setErreur('');
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('location_erreur'));
    } finally {
      setCharge(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (charge) return <ChargementCentre />;

  const statutLocation = (l: ReservationVehicule) =>
    l.cancelled_at
      ? { texte: t('mes_locations_statut_annulee'), ton: 'danger' as const }
      : l.paid_at || l.payment_status === 'confirmed'
        ? { texte: t('mes_locations_statut_payee'), ton: 'succes' as const }
        : { texte: t('mes_locations_statut_attente'), ton: 'attente' as const };

  return (
    <Ecran fond="palmiers" onRefresh={charger}>
      <Titre>{t('location_titre')}</Titre>
      <SousTitre>{t('location_sous_titre')}</SousTitre>

      <View style={styles.onglets}>
        <Pressable
          onPress={() => setOnglet('catalogue')}
          accessibilityRole="button"
          style={[styles.pill, onglet === 'catalogue' && styles.pillActif]}
        >
          <Text style={[styles.pillTexte, onglet === 'catalogue' && styles.pillTexteActif]}>
            {t('location_onglet_catalogue')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setOnglet('mine')}
          accessibilityRole="button"
          style={[styles.pill, onglet === 'mine' && styles.pillActif]}
        >
          <Text style={[styles.pillTexte, onglet === 'mine' && styles.pillTexteActif]}>
            {t('location_onglet_mes_locations')}
          </Text>
        </Pressable>
      </View>

      <TexteErreur>{erreur}</TexteErreur>

      {onglet === 'catalogue' ? (
        vehicules.length === 0 ? (
          <EtatVide
            icone="car-sport-outline"
            titre={t('location_vide_titre')}
            message={t('location_vide_message')}
          />
        ) : (
          vehicules.map((v) => (
            <Pressable
              key={v.id}
              onPress={() => router.push(`/location-vehicule/${v.id}`)}
              accessibilityRole="button"
              style={({ pressed }) => pressed && { opacity: 0.85 }}
            >
              <Carte>
                <View style={styles.ligneCarte}>
                  {v.photos[0] ? (
                    <Image source={{ uri: v.photos[0].url }} style={styles.vignette} resizeMode="cover" />
                  ) : (
                    <View style={[styles.vignette, styles.vignetteVide]}>
                      <Ionicons name="car-sport-outline" size={26} color={couleurs.primaire} />
                    </View>
                  )}
                  <View style={styles.infosCarte}>
                    <Text style={styles.titreCarte}>
                      {v.make} {v.model}
                    </Text>
                    <Text style={styles.sousTitreCarte}>
                      {v.category}
                      {v.seats ? ` · ${t('location_places', { n: v.seats })}` : ''}
                    </Text>
                    <Text style={styles.prixCarte}>
                      {formaterMontant(v.daily_price, v.currency)}
                      {t('location_par_jour')}
                    </Text>
                  </View>
                </View>
              </Carte>
            </Pressable>
          ))
        )
      ) : mesLocations.length === 0 ? (
        <EtatVide
          icone="key-outline"
          titre={t('mes_locations_vide_titre')}
          message={t('mes_locations_vide_message')}
        />
      ) : (
        mesLocations.map((l) => {
          const statut = statutLocation(l);
          return (
            <Pressable
              key={l.id}
              onPress={() => router.push(`/location/${l.id}`)}
              accessibilityRole="button"
              style={({ pressed }) => pressed && { opacity: 0.85 }}
            >
              <Carte>
                <View style={styles.enTeteCarte}>
                  <Text style={styles.titreCarte}>
                    {l.make} {l.model}
                  </Text>
                  <Badge texte={statut.texte} ton={statut.ton} />
                </View>
                <Text style={styles.sousTitreCarte}>
                  {formaterDate(l.start_date)} → {formaterDate(l.end_date)}
                </Text>
                <Text style={styles.prixCarte}>{formaterMontant(l.price, l.currency)}</Text>
              </Carte>
            </Pressable>
          );
        })
      )}
    </Ecran>
  );
}

const styles = stylesReactifs(() => ({
  onglets: {
    flexDirection: 'row',
    gap: espaces.s,
    marginBottom: espaces.s,
  },
  pill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: espaces.s,
    borderRadius: rayons.pastille,
    backgroundColor: couleurs.surface,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  pillActif: {
    backgroundColor: couleurs.primaire,
    borderColor: couleurs.primaire,
  },
  pillTexte: { fontSize: 14, fontWeight: '700', color: couleurs.texteSecondaire },
  pillTexteActif: { color: couleurs.surPrimaire },
  ligneCarte: { flexDirection: 'row', gap: espaces.m, alignItems: 'center' },
  vignette: { width: 88, height: 72, borderRadius: rayons.bouton, backgroundColor: couleurs.surface },
  vignetteVide: { alignItems: 'center', justifyContent: 'center' },
  infosCarte: { flex: 1, gap: 2 },
  titreCarte: { fontSize: 16, fontWeight: '800', color: couleurs.encre },
  sousTitreCarte: { fontSize: 13, color: couleurs.texteSecondaire },
  prixCarte: { fontSize: 15, fontWeight: '700', color: couleurs.primaireFonce },
  enTeteCarte: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espaces.m },
}));
