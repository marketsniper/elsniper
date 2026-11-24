// Détail d'un trajet publié (mode chauffeur) : le décompte des places se fait
// AUTOMATIQUEMENT quand un client réserve dans l'app — ici, le chauffeur voit
// qui a réservé (type de client et prix par place correspondant) et peut, en
// conscience, ajuster ses places à la main (réservation prise en direct,
// annulation) ou clôturer/annuler le trajet — chaque action destructrice
// demande confirmation. On arrive ici en touchant la carte du trajet dans
// « Mes trajets publiés » : aucun bouton d'ajustement n'est exposé aux
// touchers accidentels dans la liste.
//
// C'est aussi ICI que le chauffeur déclare le départ puis l'arrivée de son
// taxi partagé (« Démarrer », « Terminer »), comme sur la fiche d'une course
// privée. Le bouton vit tout en haut, juste sous l'itinéraire : une action
// qu'il faut aller chercher au bas d'une page est une action qu'on ne voit
// pas.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

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
import { couleurs, espaces, rayons, stylesReactifs } from '@/lib/theme';
import {
  champ,
  formaterDate,
  formaterMontant,
  rideDemarrable,
  TAUX_USD_TZS,
  type ReservationRide,
  type Ride,
  type StatutRide,
} from '@/lib/types';

// L'heure RÉELLE d'un départ ou d'une arrivée, dans le MÊME fuseau que
// l'heure annoncée affichée juste au-dessus par formaterDate : celui du
// téléphone, comme partout côté chauffeur. Deux fuseaux sur la même carte, et
// un départ déclaré une demi-heure avant l'heure se lisait une heure et demie
// après. « — » tant que le serveur ne l'a pas envoyée.
function heureLocale(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function EcranAnnonce() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT();
  const [ride, setRide] = useState<Ride | null>(null);
  const [erreur, setErreur] = useState('');
  // L'échec d'un « Démarrer » / « Terminer » s'écrit sous SON bouton, en haut
  // de la fiche : le message du bas, trois cartes plus loin, serait hors de
  // l'écran — le chauffeur toucherait, et croirait qu'il ne s'est rien passé.
  const [erreurAction, setErreurAction] = useState('');
  const [chargeAction, setChargeAction] = useState(false);
  // LE BATTEMENT. Le bouton « Démarrer » ne dépend pas d'une réponse du
  // serveur mais de l'heure qu'il est : il s'ouvre une heure avant le départ.
  // Toutes les trente secondes, l'écran relit donc l'horloge — le chauffeur
  // qui attend, fiche ouverte, voit le bouton se débloquer tout seul, sans
  // avoir à tirer pour rafraîchir. (Hooks placés AVANT le retour anticipé du
  // chargement, comme tous les autres.)
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      setMaintenant(Date.now());
      const minuteur = setInterval(() => setMaintenant(Date.now()), 30_000);
      return () => clearInterval(minuteur);
    }, [])
  );

  const charger = useCallback(async () => {
    if (!id) return;
    try {
      const liste = await api.listerMesRides();
      const trouve = liste.find((r) => r.id === id) ?? null;
      setRide(trouve);
      setErreur(trouve ? '' : t('annonce_introuvable'));
      setErreurAction('');
      // Tirer pour rafraîchir remet aussi l'horloge de l'écran à l'heure.
      setMaintenant(Date.now());
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
  // Le chauffeur voit ce qu'une place lui RAPPORTE, dans les deux devises —
  // le prix payé par le passager ne lui est plus envoyé (vueChauffeur.js).
  const netTzs = champ<number | string>(ride, 'net_par_place_tzs');
  const netUsd = champ<number | string>(ride, 'net_par_place_usd');
  const partPct = champ<number | string>(ride, 'part_zanzigo_pct');
  const total = Number(champ(ride, 'seats_total', 'seatsTotal') ?? 0);
  const restantes = Number(champ(ride, 'seats_available', 'seatsAvailable') ?? 0);
  const reservations = champ<ReservationRide[]>(ride, 'bookings') ?? [];
  const notes = champ<string>(ride, 'notes');
  const ouvert = statut === 'open';
  // DÉPART ET ARRIVÉE. Le serveur tranche (propriétaire de l'annonce, statut,
  // fenêtre d'une heure avant à douze heures après l'heure annoncée) ; l'écran
  // se contente de proposer le bon bouton au bon moment. Un trajet clôturé se
  // démarre aussi : clôturer ferme les réservations, pas la route.
  const enRoute = statut === 'in_progress';
  const demarrable = rideDemarrable(
    statut,
    champ(ride, 'departure_at', 'departureAt'),
    maintenant
  );

  const ajuster = async (delta: number) => {
    const suivantes = Math.min(Math.max(restantes + delta, 0), total);
    if (suivantes === restantes) return;
    setChargeAction(true);
    setErreur('');
    setErreurAction('');
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
          // Clôture : « Oui, clôturer » ; annulation : « Oui, annuler ».
          text: nouveau === 'closed' ? t('annonce_cloturer_oui') : t('commun_confirmer_oui'),
          style: nouveau === 'cancelled' ? 'destructive' : 'default',
          onPress: async () => {
            setChargeAction(true);
            setErreur('');
            setErreurAction('');
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

  const lancerAction = async (action: 'start' | 'complete') => {
    setChargeAction(true);
    setErreur('');
    setErreurAction('');
    try {
      if (action === 'start') {
        await api.demarrerRide(ride.id);
      } else {
        await api.terminerRide(ride.id);
      }
      await charger();
    } catch (e) {
      setErreurAction(e instanceof ErreurApi ? e.message : t('course_erreur_action'));
    } finally {
      setChargeAction(false);
    }
  };

  // Démarrer ferme les réservations, terminer clôt le trajet : ni l'un ni
  // l'autre ne se défait, donc on demande avant. Mêmes boutons sans ambiguïté
  // que sur une course privée — « Oui, démarrer » / « Oui, terminer », jamais
  // le « Oui, annuler » des dialogues d'annulation.
  const confirmerAction = (action: 'start' | 'complete') => {
    Alert.alert(
      action === 'start' ? t('annonce_demarrer_titre') : t('annonce_terminer_titre'),
      action === 'start' ? t('annonce_demarrer_confirm') : t('annonce_terminer_confirm'),
      [
        { text: t('commun_pas_encore'), style: 'cancel' },
        {
          text: action === 'start' ? t('course_demarrer_oui') : t('course_terminer_oui'),
          onPress: () => lancerAction(action),
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
            ton={
              statut === 'open'
                ? 'primaire'
                : statut === 'in_progress'
                  ? 'succes'
                  : statut === 'cancelled'
                    ? 'danger'
                    : 'neutre'
            }
          />
        </View>
        <LigneInfo
          label={t('sel_date')}
          valeur={formaterDate(champ(ride, 'departure_at', 'departureAt'))}
        />
        {netTzs !== undefined && netUsd !== undefined && (
          <LigneInfo
            label={t('annonce_net_place')}
            valeur={t('annonces_prix_deux', {
              tzs: formaterMontant(netTzs, 'TZS'),
              usd: formaterMontant(netUsd, 'USD'),
            })}
          />
        )}
        {partPct !== undefined && (
          <LigneInfo label={t('gain_part_zanzigo_ligne')} valeur={`${partPct} %`} />
        )}
        {!!notes && <LigneInfo label={t('annonces_notes')} valeur={String(notes)} />}
      </Carte>

      {/* L'ACTION DU MOMENT — juste sous l'itinéraire, avant tout le reste :
          on annonce où en est le trajet, puis on propose le seul geste qui
          compte. Bien avant le départ, le bouton est déjà là, grisé, avec la
          raison écrite dessous : le chauffeur sait qu'il existe, et quand il
          s'ouvrira. */}
      {enRoute && (
        <>
          <EncartInfo icone="navigate-outline" ton="succes">
            {t('annonce_en_route_info', {
              heure: heureLocale(champ(ride, 'started_at', 'startedAt')),
            })}
          </EncartInfo>
          <Bouton
            titre={t('annonce_terminer_bouton')}
            onPress={() => confirmerAction('complete')}
            charge={chargeAction}
          />
        </>
      )}
      {demarrable === 'oui' && (
        <>
          <EncartInfo icone="alarm-outline" ton="feuVert">
            {t('annonce_demarrer_pret')}
          </EncartInfo>
          <Bouton
            titre={t('annonce_demarrer_bouton')}
            onPress={() => confirmerAction('start')}
            charge={chargeAction}
          />
        </>
      )}
      {demarrable === 'trop_tot' && (
        <>
          <Bouton
            titre={t('annonce_demarrer_bouton')}
            onPress={() => confirmerAction('start')}
            desactive
          />
          <Text style={styles.noteAction}>{t('annonce_demarrer_trop_tot')}</Text>
        </>
      )}
      {statut === 'completed' && (
        <EncartInfo icone="flag-outline">
          {t('annonce_termine_info', {
            heure: heureLocale(champ(ride, 'completed_at', 'completedAt')),
          })}
        </EncartInfo>
      )}
      <TexteErreur>{erreurAction}</TexteErreur>

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
                {resa.client_name ?? '—'} — {resa.seats} × {t(`resa_type_${resa.client_type}`)}
                {resa.net_per_seat !== undefined
                  ? ` · ${formaterMontant(resa.net_per_seat, resa.currency)} ${t('gain_net_par_place')}`
                  : ''}
                {resa.paid ? ` · ✔ ${t('resa_payee')}` : ` · ⏳ ${t('resa_impayee')}`}
              </Text>
            </View>
          ))
        )}
        {reservations.length > 0 && (
          <View style={styles.ligneTotal}>
            <Text style={styles.labelTotal}>{t('annonce_gain_total')}</Text>
            <Text style={styles.valeurTotal}>
              {(() => {
                // Totaux par devise des places PAYÉES uniquement (le compteur
                // ne bouge qu'au paiement), avec l'équivalent global en
                // shillings quand il y a de l'USD.
                const totaux: Record<string, number> = {};
                for (const resa of reservations) {
                  if (!resa.paid || resa.net_per_seat === undefined) continue;
                  totaux[resa.currency] =
                    (totaux[resa.currency] ?? 0) + resa.net_per_seat * resa.seats;
                }
                const parts = Object.entries(totaux).map(([devise, montant]) =>
                  formaterMontant(Math.round(montant * 100) / 100, devise)
                );
                if (parts.length === 0) return '—';
                const affichage = parts.join(' + ');
                if (totaux.USD) {
                  const totalTzs = Math.round(
                    (totaux.TZS ?? 0) + totaux.USD * TAUX_USD_TZS
                  );
                  return `${affichage} (≈ ${formaterMontant(totalTzs, 'TZS')})`;
                }
                return affichage;
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

const styles = stylesReactifs(() => ({
  enTete: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
    flexWrap: 'wrap',
  },
  // Sous le bouton « Démarrer » encore grisé : pourquoi il l'est.
  noteAction: {
    fontSize: 13,
    lineHeight: 18,
    color: couleurs.texteSecondaire,
    textAlign: 'center',
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
}));
