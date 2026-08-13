// Détail d'un trajet publié (mode chauffeur) : le décompte des places se fait
// AUTOMATIQUEMENT quand un client réserve dans l'app — ici, le chauffeur voit
// qui a réservé (type de client et prix par place correspondant) et peut, en
// conscience, ajuster ses places à la main (réservation prise en direct,
// annulation) ou clôturer/annuler le trajet — chaque action destructrice
// demande confirmation. On arrive ici en touchant la carte du trajet dans
// « Mes trajets publiés » : aucun bouton d'ajustement n'est exposé aux
// touchers accidentels dans la liste.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Badge,
  Bouton,
  Carte,
  ChargementCentre,
  Ecran,
  EncartInfo,
  LigneInfo,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { libelleStatutRide, useT } from '@/lib/i18n';
import { couleurs, espaces, rayons } from '@/lib/theme';
import {
  champ,
  formaterDate,
  formaterMontant,
  type ReservationRide,
  type Ride,
  type StatutRide,
} from '@/lib/types';

export default function EcranAnnonce() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT();
  const [ride, setRide] = useState<Ride | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargeAction, setChargeAction] = useState(false);

  const charger = useCallback(async () => {
    if (!id) return;
    try {
      const liste = await api.listerMesRides();
      const trouve = liste.find((r) => r.id === id) ?? null;
      setRide(trouve);
      setErreur(trouve ? '' : t('annonce_introuvable'));
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('annonces_erreur_chargement'));
    }
  }, [id, t]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (!ride) {
    return erreur ? (
      <Ecran fond="vagues">
        <TexteErreur>{erreur}</TexteErreur>
      </Ecran>
    ) : (
      <ChargementCentre />
    );
  }

  const statut = champ<StatutRide>(ride, 'status', 'statut');
  const prixTzs = champ<number | string>(ride, 'price_per_seat', 'pricePerSeat');
  const prixUsd = champ<number | string>(ride, 'price_per_seat_usd', 'pricePerSeatUsd');
  const total = Number(champ(ride, 'seats_total', 'seatsTotal') ?? 0);
  const restantes = Number(champ(ride, 'seats_available', 'seatsAvailable') ?? 0);
  const reservations = champ<ReservationRide[]>(ride, 'bookings') ?? [];
  const notes = champ<string>(ride, 'notes');
  const ouvert = statut === 'open';

  const ajuster = async (delta: number) => {
    const suivantes = Math.min(Math.max(restantes + delta, 0), total);
    if (suivantes === restantes) return;
    setChargeAction(true);
    setErreur('');
    try {
      await api.modifierRide(ride.id, { seatsAvailable: suivantes });
      await charger();
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('annonces_erreur_places_maj'));
    } finally {
      setChargeAction(false);
    }
  };

  const changerStatut = (nouveau: 'closed' | 'cancelled') => {
    Alert.alert(
      nouveau === 'closed' ? t('annonces_cloturer') : t('commun_annuler'),
      nouveau === 'closed' ? t('annonce_cloturer_confirm') : t('annonce_annuler_confirm'),
      [
        { text: t('commun_confirmer_non'), style: 'cancel' },
        {
          text: t('commun_confirmer_oui'),
          style: nouveau === 'cancelled' ? 'destructive' : 'default',
          onPress: async () => {
            setChargeAction(true);
            setErreur('');
            try {
              await api.modifierRide(ride.id, { status: nouveau });
              await charger();
            } catch (e) {
              setErreur(e instanceof ErreurApi ? e.message : t('annonces_erreur_statut'));
            } finally {
              setChargeAction(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Ecran fond="vagues" onRefresh={charger}>
      <Carte>
        <View style={styles.enTete}>
          <Titre>
            {String(champ(ride, 'origin', 'origine') ?? '?')} →{' '}
            {String(champ(ride, 'destination') ?? '?')}
          </Titre>
          <Badge
            texte={libelleStatutRide(statut, t)}
            ton={statut === 'open' ? 'primaire' : statut === 'cancelled' ? 'danger' : 'neutre'}
          />
        </View>
        <LigneInfo
          label={t('sel_date')}
          valeur={formaterDate(champ(ride, 'departure_at', 'departureAt'))}
        />
        {prixTzs !== undefined && prixUsd !== undefined && (
          <LigneInfo
            label={t('annonce_prix_label')}
            valeur={t('annonces_prix_deux', {
              tzs: formaterMontant(prixTzs, 'TZS'),
              usd: formaterMontant(prixUsd, 'USD'),
            })}
          />
        )}
        {!!notes && <LigneInfo label={t('annonces_notes')} valeur={String(notes)} />}
      </Carte>

      {/* Deux devises par conception : chaque client paie dans la sienne. */}
      <EncartInfo icone="cash-outline">{t('annonce_prix_info')}</EncartInfo>

      {/* Réservations reçues : type de client et prix par place correspondant. */}
      <Carte>
        <Text style={styles.titreBloc}>
          {t('annonces_resa_titre')} ({reservations.length})
        </Text>
        {reservations.length === 0 ? (
          <Text style={styles.texteVide}>{t('annonce_resa_vide')}</Text>
        ) : (
          reservations.map((resa, index) => (
            <View key={index} style={styles.ligneResa}>
              <Ionicons name="person-circle-outline" size={20} color={couleurs.primaire} />
              <Text style={styles.texteResa}>
                {resa.client_name ?? '—'} — {resa.seats} × {t(`resa_type_${resa.client_type}`)} ·{' '}
                {formaterMontant(resa.price_per_seat, resa.currency)} {t('rides_par_place')}
                {resa.net_per_seat !== undefined
                  ? ` (${formaterMontant(resa.net_per_seat, resa.currency)} ${t('gain_net_par_place')})`
                  : ''}
                {resa.paid ? ` · ✅ ${t('resa_payee')}` : ` · ⏳ ${t('resa_impayee')}`}
              </Text>
            </View>
          ))
        )}
        {reservations.length > 0 && (
          <View style={styles.ligneTotal}>
            <Text style={styles.labelTotal}>{t('annonce_gain_total')}</Text>
            <Text style={styles.valeurTotal}>
              {(() => {
                // Totaux par devise (des places USD et TZS peuvent coexister).
                const totaux: Record<string, number> = {};
                for (const resa of reservations) {
                  if (resa.net_per_seat === undefined) continue;
                  totaux[resa.currency] =
                    (totaux[resa.currency] ?? 0) + resa.net_per_seat * resa.seats;
                }
                const parts = Object.entries(totaux).map(([devise, montant]) =>
                  formaterMontant(Math.round(montant * 100) / 100, devise)
                );
                return parts.length > 0 ? parts.join(' + ') : '—';
              })()}
            </Text>
          </View>
        )}
      </Carte>

      {/* Ajustement volontaire des places — jamais depuis la liste. */}
      <Carte>
        <Text style={styles.titreBloc}>{t('annonce_places_titre')}</Text>
        <View style={styles.rangeeAjustement}>
          <Pressable
            onPress={() => ajuster(-1)}
            disabled={!ouvert || chargeAction || restantes <= 0}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.boutonAjuster,
              (!ouvert || pressed || chargeAction || restantes <= 0) && { opacity: 0.4 },
            ]}
          >
            <Ionicons name="remove" size={26} color={couleurs.primaireFonce} />
          </Pressable>
          <View style={styles.compteurPlaces}>
            <Text style={styles.nbRestantes}>{restantes}</Text>
            <Text style={styles.surTotal}>/ {total}</Text>
          </View>
          <Pressable
            onPress={() => ajuster(1)}
            disabled={!ouvert || chargeAction || restantes >= total}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.boutonAjuster,
              (!ouvert || pressed || chargeAction || restantes >= total) && { opacity: 0.4 },
            ]}
          >
            <Ionicons name="add" size={26} color={couleurs.primaireFonce} />
          </Pressable>
        </View>
        <EncartInfo icone="information-circle-outline">{t('annonce_ajuster_note')}</EncartInfo>
      </Carte>

      {ouvert && (
        <>
          <Bouton
            titre={t('annonces_cloturer')}
            icone="lock-closed-outline"
            variante="secondaire"
            onPress={() => changerStatut('closed')}
            charge={chargeAction}
          />
          <Bouton
            titre={t('commun_annuler')}
            icone="close-circle-outline"
            variante="danger"
            onPress={() => changerStatut('cancelled')}
            charge={chargeAction}
          />
        </>
      )}

      <TexteErreur>{erreur}</TexteErreur>
      <Bouton
        titre={t('annonce_retour')}
        icone="arrow-back-outline"
        variante="secondaire"
        onPress={() => router.back()}
      />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  enTete: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
    flexWrap: 'wrap',
  },
  titreBloc: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
  },
  texteVide: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
  },
  ligneResa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
  },
  texteResa: {
    flex: 1,
    fontSize: 14,
    color: couleurs.encre,
    lineHeight: 20,
  },
  ligneTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    paddingTop: espaces.s,
    marginTop: espaces.xs,
  },
  labelTotal: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  valeurTotal: {
    fontSize: 16,
    fontWeight: '800',
    color: couleurs.primaire,
  },
  rangeeAjustement: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaces.xl,
    paddingVertical: espaces.s,
  },
  boutonAjuster: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compteurPlaces: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: espaces.xs,
    backgroundColor: couleurs.surface,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.carte,
    paddingHorizontal: espaces.l,
    paddingVertical: espaces.s,
  },
  nbRestantes: {
    fontSize: 32,
    fontWeight: '800',
    color: couleurs.primaire,
  },
  surTotal: {
    fontSize: 16,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
});
