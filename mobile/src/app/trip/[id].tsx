// Détail / confirmation d'un trajet : récap prix figé, timeline de statut,
// paiement Pesapal (uniquement après confirmation du chauffeur), contact
// WhatsApp équipe et notation quand la course est terminée
// (POST /trips/:id/rating {rating, comment?}).
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';

import { CartePosition } from '@/components/CartePosition';
import { Etoiles } from '@/components/Etoiles';
import { TimelineStatut } from '@/components/TimelineStatut';
import {
  BadgeStatutTrajet,
  Bouton,
  Carte,
  Champ,
  ChargementCentre,
  Depliant,
  Ecran,
  EncartInfo,
  LigneInfo,
  SousTitre,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { positionActuelle } from '@/lib/position';
import { api, definirCleEquipe, ErreurApi, type SuiviChauffeur } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRafraichissementAuto } from '@/lib/rafraichissementAuto';
import { lireStockage } from '@/lib/stockage';
import { formaterDateRelativeI18n, libelleStatutTrajet, libelleTypeTrajet, useT } from '@/lib/i18n';
import { couleurs, espaces, policeMontant, stylesReactifs } from '@/lib/theme';
import {
  champ,
  coordonneesVille,
  dureeApprocheMinutes,
  dureeRouteMinutes,
  ETAPES_TRAJET,
  formaterDate,
  formaterMontant,
  formaterPrix,
  kmEntrePoints,
  kmEntreVilles,
  moyensPaiement,
  reglementPaiement,
  TAUX_USD_TZS,
  tauxRemboursement,
  type MoyenPaiement,
  type StatutTrajet,
  type Trajet,
  type TypeTrajet,
} from '@/lib/types';

// Contact WhatsApp de l'équipe zanziGo (secours si whatsapp_link absent).
const WHATSAPP_EQUIPE = 'https://wa.me/255666241749';

export default function EcranTrajet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT();
  const { session } = useAuth();
  const [trajet, setTrajet] = useState<Trajet | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargePaiement, setChargePaiement] = useState(false);
  // Moyen de paiement en cours de traitement (pour n'animer QUE son bouton).
  const [moyenEnCours, setMoyenEnCours] = useState<MoyenPaiement | null>(null);
  // Crédit prépayé (hôtels) : solde chargé au focus, bouton dédié si suffisant.
  const [soldeCredit, setSoldeCredit] = useState<number | null>(null);
  const [chargeCredit, setChargeCredit] = useState(false);
  const hotelId = session?.hotel?.id ?? null;
  // Paiement créé sur cet écran (pour la simulation de confirmation en dev).
  const [paiementId, setPaiementId] = useState<string | null>(null);
  // 'paypal' = circuit automatique (bouton « J'ai payé — vérifier »).
  const [methodePaiement, setMethodePaiement] = useState<string>('manual');
  const [chargeConfirmation, setChargeConfirmation] = useState(false);
  const [note, setNote] = useState(0);
  const [commentaire, setCommentaire] = useState('');
  const [chargeNote, setChargeNote] = useState(false);
  const [noteEnvoyee, setNoteEnvoyee] = useState(false);
  const [chargeAnnulation, setChargeAnnulation] = useState(false);
  // Point de rendez-vous exact envoyé au chauffeur (course privée).
  const [chargePosition, setChargePosition] = useState(false);
  const [erreurPosition, setErreurPosition] = useState('');
  // Suivi du taxi qui approche : ouvert seulement si le client le demande.
  const [suiviOuvert, setSuiviOuvert] = useState(false);
  const [positionTaxi, setPositionTaxi] = useState<SuiviChauffeur | null>(null);
  const [chargeSuivi, setChargeSuivi] = useState(false);
  const [erreurSuivi, setErreurSuivi] = useState('');

  const charger = useCallback(async () => {
    if (!id) return;
    // Fiche ouverte depuis le tableau de bord (ou par lien direct) : on
    // remet en mémoire la clé de l'équipe, sinon un trajet qui n'est pas le
    // sien reste inaccessible après un rechargement de page.
    const cleEquipe = await lireStockage('zanzigo.cle_equipe');
    if (cleEquipe) definirCleEquipe(cleEquipe);
    try {
      setTrajet(await api.obtenirTrajet(id));
      setErreur('');
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('trip_introuvable'));
    }
  }, [id, t]);

  // La fiche se met à jour toute seule : chauffeur confirmé par l'équipe,
  // paiement validé… le client voit l'avancement sans rien toucher.
  useRafraichissementAuto(charger);

  // Le relevé de position. `visible` distingue le geste du client (bouton
  // qui tourne, erreur affichée) du relevé automatique qui alimente les
  // minutes du bandeau : celui-là travaille en silence — un chauffeur pas
  // encore repéré n'est pas une erreur, c'est l'état normal des débuts.
  const releverTaxi = useCallback(
    async (visible = false) => {
      if (!id) return;
      if (visible) setChargeSuivi(true);
      try {
        setPositionTaxi(await api.positionDeMonChauffeur(id));
        setErreurSuivi('');
      } catch (e) {
        if (visible) setErreurSuivi(e instanceof ErreurApi ? e.message : t('trip_introuvable'));
      } finally {
        if (visible) setChargeSuivi(false);
      }
    },
    [id, t]
  );

  const basculerSuivi = useCallback(() => {
    setErreurSuivi('');
    if (suiviOuvert) {
      setSuiviOuvert(false);
      return;
    }
    setSuiviOuvert(true);
    releverTaxi(true);
  }, [suiviOuvert, releverTaxi]);

  // LE SUIVI TOURNE TOUT SEUL, carte ouverte ou non. Les minutes annoncées
  // en haut de l'écran ne valent que si la position est fraîche : dès qu'un
  // chauffeur est confirmé sur une course vivante, on le relève toutes les
  // vingt secondes. C'est ce relevé qui fait le chiffre.
  const statutCourant = trajet ? String(champ(trajet, 'status', 'statut') ?? '') : '';
  const suitLeTaxi =
    !!(trajet && champ(trajet, 'driver_name', 'driverName')) &&
    ['driver_confirmed', 'paid', 'in_progress'].includes(statutCourant);

  useEffect(() => {
    if (!suitLeTaxi) return;
    releverTaxi();
    const minuteur = setInterval(() => releverTaxi(), 20000);
    return () => clearInterval(minuteur);
  }, [suitLeTaxi, releverTaxi]);

  useFocusEffect(
    useCallback(() => {
      charger();
      if (hotelId) {
        api
          .creditHotel(hotelId)
          .then((c) => setSoldeCredit(c.balance))
          .catch(() => setSoldeCredit(null));
      }
    }, [charger, hotelId])
  );

  if (!trajet) {
    return erreur ? (
      <Ecran fond="palmiers">
        <TexteErreur>{erreur}</TexteErreur>
      </Ecran>
    ) : (
      <ChargementCentre message={t('trip_chargement')} />
    );
  }

  const statut = champ<StatutTrajet>(trajet, 'status', 'statut');
  const typeTrajet = champ<TypeTrajet>(trajet, 'trip_type', 'tripType');
  const nomClient = champ<string>(trajet, 'client_name', 'clientName');
  // Le taxi assigné : dès que l'équipe a confirmé un chauffeur, le client
  // sait qui vient le chercher — nom, plaque d'immatriculation, modèle.
  const nomChauffeur = champ<string>(trajet, 'driver_name', 'driverName');
  const plaqueTaxi = champ<string>(trajet, 'vehicle_plate', 'vehiclePlate');
  const modeleTaxi = champ<string>(trajet, 'vehicle_model', 'vehicleModel');
  const lienWhatsapp = champ<string>(trajet, 'whatsapp_link', 'whatsappLink') ?? WHATSAPP_EQUIPE;
  const annule = statut === 'cancelled';
  // Règle serveur : le paiement n'est possible qu'après confirmation d'un chauffeur.
  const peutPayer = statut === 'driver_confirmed';
  // MOYENS DE PAIEMENT et montants correspondants, calculés d'avance pour que
  // le client voie ce qu'il va régler AVANT de choisir (le serveur refait le
  // calcul et reste seul juge du montant dû).
  const prixCourse = Number(champ(trajet, 'price') ?? 0);
  const deviseCourse = String(champ(trajet, 'currency') ?? 'USD');
  const moyensDisponibles = moyensPaiement(deviseCourse);
  // REMISE DE PARRAINAGE : le serveur annonce le crédit disponible du
  // réservateur ; les montants affichés la déduisent AVANT le choix du
  // moyen — le client voit son cadeau, pas une surprise sur le lien.
  const creditParrainageUsd = Number(
    champ(trajet, 'remise_parrainage_disponible_usd', 'remiseParrainageDisponibleUsd') ?? 0
  );
  const remiseCourse =
    creditParrainageUsd > 0
      ? deviseCourse === 'USD'
        ? Math.min(creditParrainageUsd, prixCourse)
        : Math.min(Math.round(creditParrainageUsd * TAUX_USD_TZS), prixCourse)
      : 0;
  const baseAPayer = Math.round((prixCourse - remiseCourse) * 100) / 100;
  const parCarte = reglementPaiement(baseAPayer, deviseCourse, 'carte');
  const parMobile = reglementPaiement(baseAPayer, deviseCourse, 'mobile');
  // Annulation par le réservateur : libre avant paiement. Course PAYÉE avec
  // départ planifié : barème 24/48 h — remboursement 100 % à +48 h, 50 %
  // entre 24 h et 48 h, refusée à moins de 24 h (même règle côté serveur).
  const tauxRembours =
    statut === 'paid'
      ? tauxRemboursement(champ<string>(trajet, 'scheduled_at', 'scheduledAt'))
      : null;
  const peutAnnuler =
    statut === 'requested' || statut === 'driver_confirmed' || tauxRembours !== null;
  // POINT DE RENDEZ-VOUS — course privée encore vivante : le client peut
  // envoyer sa position exacte, et la renvoyer s'il s'est déplacé.
  const estPrivee = champ<TypeTrajet>(trajet, 'trip_type', 'tripType') === 'private';
  const courseVivante = !annule && statut !== 'completed';
  // AVANT LE DÉPART : le point de rendez-vous n'a de sens que tant que le
  // client attend son taxi. Une fois à bord, dire au chauffeur où venir le
  // chercher n'aide plus personne.
  const avantDepart = courseVivante && statut !== 'in_progress';
  const positionPartagee =
    Number.isFinite(Number(champ(trajet, 'pickup_lat') ?? NaN)) &&
    Number.isFinite(Number(champ(trajet, 'pickup_lng') ?? NaN));
  const partagerMaPosition = async () => {
    setErreurPosition('');
    setChargePosition(true);
    try {
      const { position, souci } = await positionActuelle();
      if (!position) {
        setErreurPosition(souci ?? '');
        return;
      }
      setTrajet(await api.partagerPointRendezVous(trajet.id, position.lat, position.lng));
    } catch (e) {
      setErreurPosition(e instanceof ErreurApi ? e.message : t('trip_introuvable'));
    } finally {
      setChargePosition(false);
    }
  };

  // Notation : course terminée, jamais notée (rating null côté serveur).
  const dejaNotee = champ<number>(trajet, 'rating') !== undefined;
  const peutNoter = statut === 'completed' && !dejaNotee && !noteEnvoyee;

  // Paiement en un geste avec le crédit prépayé de l'hôtel.
  const payerAvecCredit = async () => {
    setChargeCredit(true);
    setErreur('');
    try {
      const paiement = await api.payerTrajetAvecCredit(trajet.id);
      if (hotelId) {
        api.creditHotel(hotelId).then((c) => setSoldeCredit(c.balance)).catch(() => {});
      }
      await charger();
      // L'équipe est prévenue automatiquement par le serveur (e-mail).
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('trip_paiement_indisponible'));
    } finally {
      setChargeCredit(false);
    }
  };

  const payer = async (moyen?: MoyenPaiement) => {
    setMoyenEnCours(moyen ?? null);
    setChargePaiement(true);
    setErreur('');
    try {
      const paiement = await api.payerTrajet(trajet.id, moyen);
      setPaiementId(paiement.id ?? null);
      setMethodePaiement(String(paiement.payment_method ?? 'manual'));
      if (paiement.payment_link) {
        await Linking.openURL(paiement.payment_link);
      } else {
        setErreur(t('trip_lien_indisponible'));
      }
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('trip_paiement_indisponible'));
    } finally {
      setChargePaiement(false);
      setMoyenEnCours(null);
    }
  };

  // En dev/stub Pesapal : simule le webhook de confirmation du paiement.
  const simulerConfirmation = async () => {
    if (!paiementId) return;
    setChargeConfirmation(true);
    setErreur('');
    try {
      await api.confirmerPaiement(paiementId);
      setPaiementId(null);
      await charger();
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('trip_confirmation_impossible'));
    } finally {
      setChargeConfirmation(false);
    }
  };

  // Annulation avec confirmation (dialogue natif) — irréversible. Course
  // payée : le message précise le remboursement (100 % ou 50 %).
  const annuler = () => {
    const prix = Number(champ(trajet, 'price') ?? 0);
    const devise = String(champ(trajet, 'currency') ?? 'USD');
    const message =
      tauxRembours !== null
        ? t('trip_annuler_confirm_rembours', {
            montant: formaterMontant(Math.round(prix * tauxRembours * 100) / 100, devise),
            taux: String(tauxRembours * 100),
          })
        : t('trip_annuler_confirm');
    Alert.alert(t('trip_annuler'), message, [
      { text: t('commun_confirmer_non'), style: 'cancel' },
      {
        text: t('commun_confirmer_oui'),
        style: 'destructive',
        onPress: async () => {
          setChargeAnnulation(true);
          setErreur('');
          try {
            const resultat = await api.annulerTrajet(trajet.id);
            await charger();
            // Remboursement dû : l'équipe est prévenue automatiquement par
            // le serveur (e-mail).
            const refund = champ<{ amount: number; currency: string }>(resultat, 'refund');
            if (refund) {
              Alert.alert(
                t('trip_annulee_titre'),
                t('trip_annulee_rembours', {
                  montant: formaterMontant(refund.amount, refund.currency),
                })
              );
            }
          } catch (e) {
            setErreur(e instanceof ErreurApi ? e.message : t('commun_annulation_impossible'));
          } finally {
            setChargeAnnulation(false);
          }
        },
      },
    ]);
  };

  const envoyerNote = async () => {
    if (note < 1) {
      setErreur(t('trip_note_erreur'));
      return;
    }
    setChargeNote(true);
    setErreur('');
    try {
      await api.noterTrajet(trajet.id, note, commentaire.trim() || undefined);
      setNoteEnvoyee(true);
    } catch (e) {
      if (e instanceof ErreurApi && e.code === 'already_rated') {
        setNoteEnvoyee(true);
      } else {
        setErreur(e instanceof ErreurApi ? e.message : t('trip_note_envoi_erreur'));
      }
    } finally {
      setChargeNote(false);
    }
  };

  // ─── CE QUE LE CLIENT LIT EN ARRIVANT ─────────────────────────────────
  //
  // Le prototype tenait en trois blocs : où en est ma course, qui vient me
  // chercher, combien j'ai payé. Tout le reste — l'itinéraire, les options,
  // la chronologie, l'annulation — se range derrière une touche. Cet écran
  // suit le même parcours.

  const departLibelle = String(champ(trajet, 'pickup_location', 'pickupLocation') ?? '—');
  const arriveeLibelle = String(champ(trajet, 'dropoff_location', 'dropoffLocation') ?? '—');
  const kmCourse = kmEntreVilles(departLibelle, arriveeLibelle);
  const departPrevu = champ<string>(trajet, 'scheduled_at', 'scheduledAt');
  // Course payée pour dans trois jours : annoncer des minutes serait faux —
  // le taxi n'est pas encore en route. On annonce un rendez-vous.
  const plusTard =
    !!departPrevu && new Date(departPrevu).getTime() - Date.now() > 2 * 3600 * 1000;

  // LE POINT DE RENDEZ-VOUS pour l'estimation : la position exacte partagée
  // par le client si elle existe, sinon le centre de sa ville de départ.
  // Sans l'un ni l'autre, pas de chiffre — on n'invente pas des minutes.
  const pointRdv: [number, number] | null = positionPartagee
    ? [Number(champ(trajet, 'pickup_lat')), Number(champ(trajet, 'pickup_lng'))]
    : coordonneesVille(departLibelle);
  const kmDuTaxi =
    pointRdv && positionTaxi && positionTaxi.lat !== null && positionTaxi.lng !== null
      ? kmEntrePoints(Number(positionTaxi.lat), Number(positionTaxi.lng), pointRdv[0], pointRdv[1])
      : null;
  const minutesDuTaxi = kmDuTaxi !== null ? dureeApprocheMinutes(kmDuTaxi) : null;

  // Le bandeau : une phrase, un chiffre quand il en existe un de vrai.
  const bandeau: {
    titre: string;
    sous: string;
    icone: React.ComponentProps<typeof Ionicons>['name'];
    chiffre?: string;
    unite?: string;
  } = annule
    ? { titre: t('trip_etat_annulee'), sous: t('trip_etat_annulee_sous'), icone: 'close-circle' }
    : statut === 'completed'
      ? {
          titre: t('trip_etat_terminee'),
          sous: t('trip_etat_terminee_sous'),
          icone: 'checkmark-done-circle',
        }
      : statut === 'in_progress'
        ? {
            titre: t('trip_etat_en_route'),
            sous: t('trip_etat_en_route_sous'),
            icone: 'navigate-circle',
          }
        : statut === 'requested'
          ? {
              titre: t('trip_etat_recherche'),
              sous: t('trip_etat_recherche_sous'),
              icone: 'search-circle',
            }
          : peutPayer
            ? {
                titre: t('trip_etat_confirme'),
                sous: t('trip_etat_confirme_sous'),
                icone: 'card',
                chiffre: formaterPrix(trajet),
              }
            : plusTard
              ? {
                  titre: t('trip_etat_programme'),
                  sous: formaterDate(departPrevu),
                  icone: 'calendar',
                }
              : {
                  titre: t('trip_etat_arrive'),
                  sous:
                    minutesDuTaxi !== null && kmDuTaxi !== null
                      ? t('trip_minutes_sous', {
                          chauffeur: String(nomChauffeur ?? '').split(' ')[0] || t('trip_taxi_chauffeur'),
                          km: kmDuTaxi < 10 ? kmDuTaxi.toFixed(1) : String(Math.round(kmDuTaxi)),
                          quand: positionTaxi?.updated_at
                            ? formaterDateRelativeI18n(positionTaxi.updated_at, t)
                            : '—',
                        })
                      : t('trip_position_attente'),
                  icone: 'car-sport',
                  ...(minutesDuTaxi !== null
                    ? { chiffre: String(minutesDuTaxi), unite: t('trip_minutes') }
                    : {}),
                };

  // Le numéro du chauffeur : le serveur ne le donne qu'une fois la course
  // payée. C'est exactement quand le client en a besoin.
  const telChauffeur = champ<string>(trajet, 'driver_phone', 'driverPhone');
  const initialeChauffeur = String(nomChauffeur ?? '?').trim().charAt(0).toUpperCase() || '?';

  // Le trajet en une ligne, pour les dépliants et le bandeau.
  const ligneItineraire = `${departLibelle} → ${arriveeLibelle}`;
  const resumeDetails = [
    kmCourse !== null
      ? t('course_distance', {
          km: String(Math.round(kmCourse)),
          min: String(dureeRouteMinutes(kmCourse)),
        })
      : null,
    typeTrajet ? libelleTypeTrajet(typeTrajet, t) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Ecran fond="palmiers" onRefresh={charger}>
      {/* 1 · OÙ EN EST MA COURSE — la question à laquelle tout le monde
          vient répondre. Une phrase, et le chiffre qui compte. */}
      <Carte style={styles.bandeau}>
        <View style={styles.bandeauTete}>
          <Ionicons name={bandeau.icone} size={26} color={couleurs.primaire} />
          <Text style={styles.bandeauTitre}>{bandeau.titre}</Text>
        </View>
        <Text style={styles.bandeauItineraire}>{ligneItineraire}</Text>
        {!!bandeau.chiffre && (
          <View style={styles.bandeauChiffreRangee}>
            <Text style={styles.bandeauChiffre}>{bandeau.chiffre}</Text>
            {!!bandeau.unite && <Text style={styles.bandeauUnite}>{bandeau.unite}</Text>}
          </View>
        )}
        <Text style={styles.bandeauSous}>{bandeau.sous}</Text>
      </Carte>

      {/* 2 · QUI VIENT ME CHERCHER — visible dès l'assignation. Le client
          reconnaît la voiture à la plaque, et appelle l'homme au volant
          d'une touche dès que la course est réglée. */}
      {!annule && !!nomChauffeur && (
        <Carte>
          <View style={styles.fiche}>
            <View style={styles.pastilleChauffeur}>
              <Text style={styles.initiale}>{initialeChauffeur}</Text>
            </View>
            <View style={styles.textesChauffeur}>
              <Text style={styles.nomChauffeur}>{String(nomChauffeur)}</Text>
              {!!modeleTaxi && <Text style={styles.modeleTaxi}>{String(modeleTaxi)}</Text>}
            </View>
            <Text style={styles.plaque}>{String(plaqueTaxi ?? '—')}</Text>
          </View>
          {!!telChauffeur && courseVivante && (
            <Bouton
              titre={t('trip_appeler_chauffeur')}
              icone="call"
              onPress={() => Linking.openURL(`tel:${String(telChauffeur).replace(/\s/g, '')}`)}
            />
          )}
        </Carte>
      )}

      {/* 3 · COMBIEN — réglé ou à régler, sur une seule ligne. Sauf quand le
          bandeau porte déjà le montant en gros : on ne dit pas deux fois le
          même chiffre à dix centimètres d'écart. */}
      {!annule && !peutPayer && (
        <Carte>
          <View style={styles.rangeePrix}>
            <View style={styles.libellePrix}>
              <Ionicons
                name={statut === 'requested' || peutPayer ? 'time-outline' : 'checkmark-circle'}
                size={20}
                color={statut === 'requested' || peutPayer ? couleurs.texteSecondaire : couleurs.succes}
              />
              <Text style={styles.labelPrix}>
                {statut === 'requested' || peutPayer ? t('trip_a_regler') : t('trip_regle')}
              </Text>
            </View>
            <Text style={styles.prix}>{formaterPrix(trajet)}</Text>
          </View>
        </Carte>
      )}

      {/* 4 · L'ACTION DU MOMENT. Un seul geste attendu à la fois : payer,
          donner son point de rendez-vous, ou noter. */}

      {/* Remise de parrainage : le cadeau se voit AVANT le choix du moyen. */}
      {peutPayer && remiseCourse > 0 && (
        <EncartInfo icone="gift-outline" ton="succes">
          {t('parrainage_remise_info', {
            montant: formaterMontant(remiseCourse, deviseCourse),
          })}
        </EncartInfo>
      )}

      {/* Hôtel avec crédit suffisant : paiement en un geste, sans détour. */}
      {peutPayer &&
        hotelId &&
        soldeCredit !== null &&
        soldeCredit >= Number(champ(trajet, 'price') ?? Infinity) && (
          <Bouton
            titre={`${t('trip_payer_credit')} (${formaterMontant(soldeCredit, 'USD')})`}
            icone="wallet-outline"
            onPress={payerAvecCredit}
            charge={chargeCredit}
          />
        )}

      {/* LES DEUX PORTES DU PAIEMENT, présentées comme les deux offres de
          l'écran de réservation : le montant EXACT est sur la ligne, pas
          caché derrière. Un client facturé en shillings n'en voit qu'une. */}
      {peutPayer &&
        (moyensDisponibles.length > 1 ? (
          <Carte>
            <Pressable
              onPress={() => payer('carte')}
              disabled={chargePaiement}
              accessibilityRole="button"
              style={({ pressed }) => [styles.moyen, pressed && styles.moyenAppuye]}
            >
              <Ionicons name="card-outline" size={24} color={couleurs.primaire} />
              <View style={styles.textesMoyen}>
                <Text style={styles.titreMoyen}>{t('paiement_moyen_carte_court')}</Text>
                <Text style={styles.detailMoyen}>
                  {t('paiement_carte_detail', {
                    prix: formaterMontant(baseAPayer, deviseCourse),
                    frais: formaterMontant(parCarte.surcharge, parCarte.devise),
                  })}
                </Text>
              </View>
              {chargePaiement && moyenEnCours === 'carte' ? (
                <ActivityIndicator color={couleurs.primaire} />
              ) : (
                <Text style={styles.prixMoyen}>
                  {formaterMontant(parCarte.montant, parCarte.devise)}
                </Text>
              )}
            </Pressable>
            <View style={styles.filetMoyen} />
            <Pressable
              onPress={() => payer('mobile')}
              disabled={chargePaiement}
              accessibilityRole="button"
              style={({ pressed }) => [styles.moyen, pressed && styles.moyenAppuye]}
            >
              <Ionicons name="phone-portrait-outline" size={24} color={couleurs.primaire} />
              <View style={styles.textesMoyen}>
                <Text style={styles.titreMoyen}>{t('paiement_moyen_mobile_court')}</Text>
                <Text style={styles.detailMoyen}>{t('paiement_mobile_detail')}</Text>
              </View>
              {chargePaiement && moyenEnCours === 'mobile' ? (
                <ActivityIndicator color={couleurs.primaire} />
              ) : (
                <Text style={styles.prixMoyen}>
                  {formaterMontant(parMobile.montant, parMobile.devise)}
                </Text>
              )}
            </Pressable>
          </Carte>
        ) : (
          <Bouton
            titre={`${t('trip_payer')} · ${formaterMontant(parMobile.montant, parMobile.devise)}`}
            icone="phone-portrait-outline"
            onPress={() => payer('mobile')}
            charge={chargePaiement}
          />
        ))}
      {peutPayer && paiementId && (methodePaiement === 'paypal' || methodePaiement === 'pesapal') && (
        <Bouton
          titre={t('trip_verifier_paiement')}
          icone="shield-checkmark-outline"
          variante="secondaire"
          onPress={simulerConfirmation}
          charge={chargeConfirmation}
        />
      )}
      {__DEV__ && peutPayer && paiementId && methodePaiement !== 'paypal' && methodePaiement !== 'pesapal' && (
        <Bouton
          titre={t('trip_confirm_dev')}
          variante="secondaire"
          onPress={simulerConfirmation}
          charge={chargeConfirmation}
        />
      )}

      {/* POINT DE RENDEZ-VOUS — « Nungwi » ne dit pas devant quelle porte
          attendre. Tant qu'il n'est pas donné, c'est le geste le plus utile
          de l'écran : il reste ici, en clair. Une fois donné, il rejoint la
          carte de suivi dans le dépliant. */}
      {estPrivee && avantDepart && !positionPartagee && (
        <Carte>
          <SousTitre>{t('trip_point_rendez_vous')}</SousTitre>
          <EncartInfo icone="information-circle-outline">{t('trip_position_invite')}</EncartInfo>
          <Bouton
            titre={t('trip_partager_position')}
            icone="location-outline"
            onPress={partagerMaPosition}
            charge={chargePosition}
          />
          <TexteErreur>{erreurPosition}</TexteErreur>
        </Carte>
      )}

      {/* Course terminée : la note. C'est la seule chose qu'on demande. */}
      {statut === 'completed' && (
        <Carte>
          {noteEnvoyee || dejaNotee ? (
            <View style={styles.blocNote}>
              <Ionicons name="checkmark-circle" size={22} color={couleurs.succes} />
              <Text style={styles.merci}>{t('trip_note_merci')}</Text>
            </View>
          ) : peutNoter ? (
            <>
              <SousTitre>{t('trip_note_question')}</SousTitre>
              <View style={styles.etoilesCentrees}>
                <Etoiles note={note} onChange={setNote} taille={40} />
              </View>
              <Champ
                label={t('trip_note_commentaire')}
                value={commentaire}
                onChangeText={setCommentaire}
                placeholder={t('trip_note_placeholder')}
                multiline
              />
              <Bouton
                titre={t('trip_note_envoyer')}
                icone="star-outline"
                onPress={envoyerNote}
                charge={chargeNote}
              />
            </>
          ) : null}
        </Carte>
      )}

      {/* Pas de numéro de chauffeur à composer : l'équipe reste joignable
          en un geste, sans aller la chercher dans un dépliant. */}
      {courseVivante && !telChauffeur && (
        <Bouton
          titre={t('commun_contact_whatsapp')}
          icone="logo-whatsapp"
          variante="secondaire"
          onPress={() => Linking.openURL(lienWhatsapp)}
        />
      )}

      <TexteErreur>{erreur}</TexteErreur>

      {/* 5 · CE QU'ON CONSULTE RAREMENT, à une touche. */}
      <Depliant titre={t('trip_details_titre')} resume={resumeDetails}>
        {typeTrajet && (
          <LigneInfo label={t('commun_type')} valeur={libelleTypeTrajet(typeTrajet, t)} />
        )}
        {!!nomClient && <LigneInfo label={t('commun_client')} valeur={String(nomClient)} />}
        <LigneInfo label={t('commun_depart')} valeur={departLibelle} />
        <LigneInfo label={t('commun_arrivee')} valeur={arriveeLibelle} />
        {kmCourse !== null && (
          <LigneInfo
            label={t('trip_distance')}
            valeur={t('course_distance', {
              km: String(Math.round(kmCourse)),
              min: String(dureeRouteMinutes(kmCourse)),
            })}
          />
        )}
        {!!departPrevu && (
          <LigneInfo label={t('trip_programme_le')} valeur={formaterDate(departPrevu)} />
        )}
        {!!champ(trajet, 'flight_number', 'flightNumber') && (
          <LigneInfo
            label={t('trip_vol')}
            valeur={`✈️ ${champ(trajet, 'flight_number', 'flightNumber')}`}
          />
        )}
        {champ<boolean>(trajet, 'round_trip', 'roundTrip') === true && (
          <LigneInfo label={t('trip_aller_retour')} valeur={t('trip_aller_retour_valeur')} />
        )}
        {(champ<boolean>(trajet, 'baby_seat', 'babySeat') === true ||
          champ<boolean>(trajet, 'bulky_luggage', 'bulkyLuggage') === true) && (
          <LigneInfo
            label={t('trip_options')}
            valeur={[
              champ<boolean>(trajet, 'baby_seat', 'babySeat') === true
                ? t('reserver_siege_bebe')
                : null,
              champ<boolean>(trajet, 'bulky_luggage', 'bulkyLuggage') === true
                ? t('reserver_gros_bagages')
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        )}
        <View style={styles.chronologie}>
          <TimelineStatut
            etapes={ETAPES_TRAJET.map((cle) => ({ cle, label: libelleStatutTrajet(cle, t) }))}
            statutCourant={statut}
            annule={annule}
          />
        </View>
      </Depliant>

      <Depliant titre={t('trip_autres_actions')}>
        {/* SUIVRE SON TAXI SUR LA CARTE. Le chiffre du bandeau suffit à la
            plupart ; celui qui veut VOIR la voiture approcher ouvre ici. */}
        {courseVivante && !!nomChauffeur && (
          <>
            <Bouton
              titre={suiviOuvert ? t('trip_masquer_taxi') : t('trip_suivre_taxi')}
              icone={suiviOuvert ? 'chevron-up' : 'car-outline'}
              variante="secondaire"
              onPress={basculerSuivi}
              charge={chargeSuivi}
            />
            {suiviOuvert &&
              positionTaxi &&
              positionTaxi.lat !== null &&
              positionTaxi.lng !== null && (
                <CartePosition
                  lat={Number(positionTaxi.lat)}
                  lng={Number(positionTaxi.lng)}
                  titre={`${t('trip_taxi_en_route')}${
                    positionTaxi.updated_at
                      ? ` — ${t('trip_taxi_position_datee', {
                          quand: formaterDateRelativeI18n(positionTaxi.updated_at, t),
                        })}`
                      : ''
                  }`}
                  hauteur={200}
                  lien={false}
                  marqueur="voiture"
                  cadrer={pointRdv ? { lat: pointRdv[0], lng: pointRdv[1] } : undefined}
                />
              )}
            {suiviOuvert && positionTaxi && positionTaxi.lat === null && (
              <EncartInfo icone="time-outline" ton="attente">
                {t('trip_taxi_pas_repere')}
              </EncartInfo>
            )}
            <TexteErreur>{erreurSuivi}</TexteErreur>
          </>
        )}

        {/* Point de rendez-vous DÉJÀ donné : on peut le revoir et le
            corriger — on se déplace, on change de plage. */}
        {estPrivee && avantDepart && positionPartagee && (
          <>
            <EncartInfo icone="checkmark-circle-outline" ton="succes">
              {t('trip_position_partagee')}
            </EncartInfo>
            <CartePosition
              lat={Number(champ(trajet, 'pickup_lat'))}
              lng={Number(champ(trajet, 'pickup_lng'))}
              hauteur={150}
              lien={false}
              marqueur="client"
            />
            <Bouton
              titre={t('trip_position_maj')}
              icone="location-outline"
              variante="secondaire"
              onPress={partagerMaPosition}
              charge={chargePosition}
            />
            <TexteErreur>{erreurPosition}</TexteErreur>
          </>
        )}

        {!annule && (!courseVivante || !!telChauffeur) && (
          <Bouton
            titre={t('commun_contact_whatsapp')}
            icone="logo-whatsapp"
            variante="secondaire"
            onPress={() => Linking.openURL(lienWhatsapp)}
          />
        )}
        <Bouton
          titre={t('commun_actualiser_statut')}
          icone="refresh-outline"
          variante="secondaire"
          onPress={charger}
        />
        {peutAnnuler && (
          <Bouton
            titre={t('trip_annuler')}
            icone="close-circle-outline"
            variante="danger"
            onPress={annuler}
            charge={chargeAnnulation}
          />
        )}
      </Depliant>

      {/* Retour toujours possible — course terminée comprise : le client
          repart faire autre chose. */}
      <Bouton
        titre={t('commun_retour_accueil')}
        icone="arrow-back-outline"
        variante="secondaire"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/trajets'))}
      />
    </Ecran>
  );
}

const styles = stylesReactifs(() => ({
  // ─── LE BANDEAU D'ÉTAT ───────────────────────────────────────────────
  bandeau: {
    alignItems: 'flex-start',
  },
  bandeauTete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
  },
  bandeauTitre: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: couleurs.encre,
  },
  bandeauItineraire: {
    fontSize: 14,
    color: couleurs.texteSecondaire,
    marginTop: 2,
  },
  // Le chiffre et son unité posés sur la même ligne de base.
  bandeauChiffreRangee: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: espaces.xs,
    marginTop: espaces.m,
  },
  // Le chiffre qui compte prend le serif de labeur : il donne aux nombres une
  // assise que la grotesque n'a pas. `poserLaPolice` ne remplit que les styles
  // SANS fontFamily — l'écrire ici suffit à l'imposer.
  bandeauChiffre: {
    fontSize: 56,
    lineHeight: 62,
    fontWeight: '800',
    letterSpacing: -2,
    fontFamily: policeMontant(),
    color: couleurs.primaire,
  },
  bandeauUnite: {
    fontSize: 20,
    fontWeight: '700',
    color: couleurs.primaire,
  },
  bandeauSous: {
    fontSize: 14,
    lineHeight: 20,
    color: couleurs.texteSecondaire,
    marginTop: espaces.s,
  },

  // ─── LA FICHE DU CHAUFFEUR ───────────────────────────────────────────
  fiche: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
  },
  pastilleChauffeur: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initiale: {
    fontSize: 22,
    fontWeight: '800',
    color: couleurs.primaireFonce,
  },
  textesChauffeur: {
    flex: 1,
    gap: 2,
  },
  nomChauffeur: {
    fontSize: 17,
    fontWeight: '700',
    color: couleurs.encre,
  },
  modeleTaxi: {
    fontSize: 14,
    color: couleurs.texteSecondaire,
  },
  // La plaque se lit comme une plaque : encadrée, espacée, en capitales.
  plaque: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
    color: couleurs.encre,
    backgroundColor: couleurs.sable,
    borderWidth: 1.5,
    borderColor: couleurs.encre,
    borderRadius: 6,
    paddingHorizontal: espaces.s,
    paddingVertical: 4,
    overflow: 'hidden',
  },

  // ─── LE PRIX ─────────────────────────────────────────────────────────
  rangeePrix: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  libellePrix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
  },
  labelPrix: {
    fontSize: 15,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  prix: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontFamily: policeMontant(),
    color: couleurs.encre,
  },

  // ─── LES DEUX PORTES DU PAIEMENT ─────────────────────────────────────
  moyen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    paddingVertical: espaces.s,
    minHeight: 64,
  },
  moyenAppuye: {
    opacity: 0.6,
  },
  textesMoyen: {
    flex: 1,
    gap: 2,
  },
  titreMoyen: {
    fontSize: 16,
    fontWeight: '700',
    color: couleurs.encre,
  },
  detailMoyen: {
    fontSize: 13,
    lineHeight: 18,
    color: couleurs.texteSecondaire,
  },
  prixMoyen: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontFamily: policeMontant(),
    color: couleurs.primaire,
  },
  filetMoyen: {
    height: 1,
    backgroundColor: couleurs.bordure,
  },

  // ─── LE RESTE ────────────────────────────────────────────────────────
  chronologie: {
    marginTop: espaces.s,
  },
  blocNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
  },
  merci: {
    fontSize: 15,
    fontWeight: '600',
    color: couleurs.encre,
  },
  etoilesCentrees: {
    alignItems: 'center',
    paddingVertical: espaces.s,
  },
}));
