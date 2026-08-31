// Fiche COMPLÈTE d'un hôtel partenaire, côté équipe : on l'ouvre en
// touchant le nom de l'établissement dans le tableau de bord.
// Elle rassemble ce qui était éparpillé (ou introuvable) : coordonnées,
// solde de crédit avec la case pour en ajouter, historique des mouvements,
// carte de fidélité, réservations et colis de l'établissement.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Linking, Text, View } from 'react-native';

import {
  Badge,
  BadgeStatutColis,
  BadgeStatutTrajet,
  Bouton,
  Carte,
  Champ,
  ChargementCentre,
  Ecran,
  EncartInfo,
  LigneInfo,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, definirCleEquipe, ErreurApi, type CreditHotel, type FideliteHotel } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { lireStockage } from '@/lib/stockage';
import { couleurs, espaces, stylesReactifs } from '@/lib/theme';
import { champ, formaterDate, formaterMontant, type Colis, type Hotel, type Trajet } from '@/lib/types';

const CLE_STOCKAGE = 'zanzigo.cle_equipe';
/** Au-delà, on n'affiche que les plus récents : la fiche reste lisible. */
const MAX_LIGNES = 12;

export default function EcranHotelEquipe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();

  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [credit, setCredit] = useState<CreditHotel | null>(null);
  const [fidelite, setFidelite] = useState<FideliteHotel | null>(null);
  const [courses, setCourses] = useState<Trajet[]>([]);
  const [colis, setColis] = useState<Colis[]>([]);
  const [charge, setCharge] = useState(true);
  const [erreur, setErreur] = useState('');

  const [montant, setMontant] = useState('');
  const [note, setNote] = useState('');
  const [creditEnCours, setCreditEnCours] = useState(false);
  const [message, setMessage] = useState('');
  const [actionEnCours, setActionEnCours] = useState(false);

  const charger = useCallback(async () => {
    if (!id) return;
    // Fiche ouverte directement (lien collé, page rechargée) : la clé de
    // l'équipe n'est plus en mémoire, on la relit sur l'appareil.
    const enregistree = await lireStockage(CLE_STOCKAGE);
    if (enregistree) definirCleEquipe(enregistree);
    try {
      const [laFiche, leCredit, laFidelite, lesCourses, lesColis] = await Promise.all([
        api.obtenirHotel(id, true),
        api.creditHotel(id, true).catch(() => null),
        api.fideliteHotel(id, true).catch(() => null),
        api.listerTrajetsHotel(id, true).catch(() => []),
        api.listerColisHotel(id, true).catch(() => []),
      ]);
      setHotel(laFiche);
      setCredit(leCredit);
      setFidelite(laFidelite);
      setCourses(lesCourses);
      setColis(lesColis);
      setErreur('');
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('hotel_fiche_introuvable'));
    } finally {
      setCharge(false);
    }
  }, [id, t]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const ajouterDuCredit = async () => {
    setMessage('');
    setErreur('');
    const valeur = Number(montant.replace(',', '.'));
    if (!Number.isFinite(valeur) || valeur === 0) {
      setErreur(t('hotel_fiche_erreur_montant'));
      return;
    }
    setCreditEnCours(true);
    try {
      const resultat = await api.crediterHotel(id, valeur, note.trim() || undefined);
      setMontant('');
      setNote('');
      setMessage(
        t('hotel_fiche_credit_ok', { solde: formaterMontant(resultat.balance, 'USD') })
      );
      await charger();
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('hotel_fiche_erreur_credit'));
    } finally {
      setCreditEnCours(false);
    }
  };

  const verifier = async (statut: 'verified' | 'rejected') => {
    setErreur('');
    setActionEnCours(true);
    try {
      await api.verifierHotel(id, statut);
      await charger();
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('hotel_fiche_erreur_credit'));
    } finally {
      setActionEnCours(false);
    }
  };

  if (charge) return <ChargementCentre />;
  if (!hotel) {
    return (
      <Ecran fond="vagues">
        <Carte>
          <Titre>{t('hotel_fiche_introuvable')}</Titre>
          <TexteErreur>{erreur}</TexteErreur>
        </Carte>
      </Ecran>
    );
  }

  const nom = String(champ(hotel, 'name') ?? '?');
  const telephone = String(champ(hotel, 'phone') ?? '');
  const statut = String(champ(hotel, 'verification_status', 'verificationStatus') ?? 'pending');
  const solde = Number(champ(hotel, 'credit_balance', 'creditBalance') ?? 0);
  const inscritLe = champ<string>(hotel, 'created_at', 'createdAt');
  const tonStatut = statut === 'verified' ? 'succes' : statut === 'rejected' ? 'danger' : 'attente';
  const libelleStatut =
    statut === 'verified'
      ? t('hotel_fiche_statut_verifie')
      : statut === 'rejected'
        ? t('hotel_fiche_statut_refuse')
        : t('hotel_fiche_statut_attente');

  return (
    <Ecran fond="vagues" onRefresh={charger}>
      {/* --- Identité de l'établissement --- */}
      <Carte>
        <View style={styles.enTete}>
          <Text style={styles.nom}>{nom}</Text>
          <Badge texte={libelleStatut} ton={tonStatut} />
        </View>
        {/* Hôtel ou restaurant : l'équipe doit le voir d'un coup d'œil —
            on n'appelle pas un restaurateur en lui parlant de sa réception. */}
        <Badge
          texte={
            champ(hotel, 'partner_type') === 'restaurant'
              ? `🍽️ ${t('partenaire_type_restaurant')}`
              : `🏨 ${t('partenaire_type_hotel')}`
          }
          ton="neutre"
        />
        <LigneInfo
          label={t('hotel_fiche_contact')}
          valeur={String(champ(hotel, 'contact_name', 'contactName') ?? '—')}
        />
        <LigneInfo label={t('hotel_fiche_zone')} valeur={String(champ(hotel, 'zone') ?? '—')} />
        <LigneInfo
          label={t('hotel_fiche_adresse')}
          valeur={String(champ(hotel, 'address') ?? '—')}
        />
        <LigneInfo label={t('hotel_fiche_email')} valeur={String(champ(hotel, 'email') ?? '—')} />
        <LigneInfo label={t('hotel_fiche_telephone')} valeur={telephone || '—'} />
        {!!inscritLe && (
          <LigneInfo label={t('hotel_fiche_inscrit_le')} valeur={formaterDate(inscritLe)} />
        )}
        {!!telephone && (
          <Bouton
            titre={`WhatsApp · ${telephone}`}
            icone="logo-whatsapp"
            variante="secondaire"
            onPress={() => Linking.openURL(`https://wa.me/${telephone.replace(/[^\d]/g, '')}`)}
          />
        )}
        {statut === 'pending' && (
          <View style={styles.rangee}>
            <View style={styles.demi}>
              <Bouton
                titre={t('equipe_valider')}
                onPress={() => verifier('verified')}
                charge={actionEnCours}
              />
            </View>
            <View style={styles.demi}>
              <Bouton
                titre={t('equipe_refuser')}
                variante="danger"
                onPress={() => verifier('rejected')}
                charge={actionEnCours}
              />
            </View>
          </View>
        )}
      </Carte>

      {/* --- Crédit prépayé : solde et recharge --- */}
      <Carte>
        <View style={styles.enTete}>
          <Text style={styles.titreBloc}>{t('hotel_fiche_solde')}</Text>
          <Text style={styles.solde}>{formaterMontant(solde, 'USD')}</Text>
        </View>
        <EncartInfo icone="wallet-outline">{t('equipe_credit_conseil')}</EncartInfo>
        <Champ
          label={t('equipe_credit_montant')}
          value={montant}
          onChangeText={setMontant}
          keyboardType="numbers-and-punctuation"
          placeholder="50"
        />
        <Champ
          label={t('hotel_fiche_note')}
          value={note}
          onChangeText={setNote}
          placeholder={t('hotel_fiche_note_exemple')}
        />
        <Bouton
          titre={t('hotel_fiche_ajouter_credit')}
          icone="add-circle-outline"
          onPress={ajouterDuCredit}
          charge={creditEnCours}
        />
        {!!message && (
          <View style={styles.ligneOk}>
            <Ionicons name="checkmark-circle" size={18} color={couleurs.succes} />
            <Text style={styles.messageOk}>{message}</Text>
          </View>
        )}
        <TexteErreur>{erreur}</TexteErreur>

        <Text style={styles.sousTitreBloc}>{t('hotel_fiche_mouvements')}</Text>
        {(credit?.transactions ?? []).length === 0 ? (
          <Text style={styles.vide}>{t('hotel_fiche_aucun_mouvement')}</Text>
        ) : (
          (credit?.transactions ?? []).slice(0, MAX_LIGNES).map((mouvement) => {
            const valeur = Number(mouvement.amount);
            return (
              <View key={mouvement.id} style={styles.ligneMouvement}>
                <View style={styles.mouvementTexte}>
                  <Text style={styles.mouvementLibelle}>
                    {mouvement.reason === 'topup'
                      ? t('hotel_fiche_recharge')
                      : mouvement.reason === 'adjustment'
                        ? t('hotel_fiche_correction')
                        : mouvement.reason}
                  </Text>
                  <Text style={styles.detail}>
                    {mouvement.created_at ? formaterDate(mouvement.created_at) : ''}
                    {mouvement.reference ? ` · ${mouvement.reference}` : ''}
                  </Text>
                </View>
                <Text style={[styles.mouvementMontant, valeur < 0 && { color: couleurs.danger }]}>
                  {valeur > 0 ? '+' : ''}
                  {formaterMontant(valeur, 'USD')}
                </Text>
              </View>
            );
          })
        )}
      </Carte>

      {/* --- Fidélité : les courses qui donnent droit à un bon --- */}
      {!!fidelite && (
        <Carte>
          <Text style={styles.titreBloc}>{t('hotel_fiche_fidelite')}</Text>
          <LigneInfo
            label={t('hotel_fiche_courses_terminees')}
            valeur={String(fidelite.completed_trips)}
          />
          <LigneInfo
            label={t('hotel_fiche_bons_dispo')}
            valeur={String(fidelite.vouchers_available)}
          />
          <Text style={styles.detail}>
            {t('hotel_fiche_progression', {
              restant: String(Math.max(0, fidelite.trips_per_voucher - fidelite.progress)),
              total: String(fidelite.trips_per_voucher),
              bon: formaterMontant(fidelite.voucher_credit_usd ?? 10, 'USD'),
            })}
          </Text>
        </Carte>
      )}

      {/* --- Ce que l'établissement a réservé --- */}
      <Carte>
        <Text style={styles.titreBloc}>
          {t('hotel_fiche_courses')} ({courses.length})
        </Text>
        {courses.length === 0 ? (
          <Text style={styles.vide}>{t('hotel_fiche_aucune_course')}</Text>
        ) : (
          courses.slice(0, MAX_LIGNES).map((course) => (
            <View key={course.id} style={styles.ligneListe}>
              <View style={styles.mouvementTexte}>
                <Text style={styles.itineraire}>
                  {String(champ(course, 'pickup_location', 'pickupLocation') ?? '?')} →{' '}
                  {String(champ(course, 'dropoff_location', 'dropoffLocation') ?? '?')}
                </Text>
                <Text style={styles.detail}>
                  {formaterDate(champ<string>(course, 'scheduled_at', 'scheduledAt'))}
                  {' · '}
                  {String(champ(course, 'client_name', 'clientName') ?? '—')}
                </Text>
              </View>
              <BadgeStatutTrajet statut={course.status} />
            </View>
          ))
        )}
        {courses.length > MAX_LIGNES && (
          <Text style={styles.detail}>
            {t('hotel_fiche_et_plus', { n: String(courses.length - MAX_LIGNES) })}
          </Text>
        )}
      </Carte>

      {/* --- Colis expédiés depuis l'établissement --- */}
      <Carte>
        <Text style={styles.titreBloc}>
          {t('hotel_fiche_colis')} ({colis.length})
        </Text>
        {colis.length === 0 ? (
          <Text style={styles.vide}>{t('hotel_fiche_aucun_colis')}</Text>
        ) : (
          colis.slice(0, MAX_LIGNES).map((unColis) => (
            <View key={unColis.id} style={styles.ligneListe}>
              <View style={styles.mouvementTexte}>
                <Text style={styles.itineraire}>
                  {String(champ(unColis, 'pickup_location', 'pickupLocation') ?? '?')} →{' '}
                  {String(champ(unColis, 'dropoff_location', 'dropoffLocation') ?? '?')}
                </Text>
                <Text style={styles.detail}>
                  {formaterDate(champ<string>(unColis, 'created_at', 'createdAt'))}
                </Text>
              </View>
              <BadgeStatutColis statut={unColis.status} />
            </View>
          ))
        )}
      </Carte>
    </Ecran>
  );
}

const styles = stylesReactifs(() => ({
  enTete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaces.s,
  },
  nom: {
    flex: 1,
    fontSize: 19,
    fontWeight: '800',
    color: couleurs.encre,
  },
  titreBloc: {
    fontSize: 16,
    fontWeight: '800',
    color: couleurs.encre,
  },
  sousTitreBloc: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.texteSecondaire,
    marginTop: espaces.s,
  },
  solde: {
    fontSize: 20,
    fontWeight: '800',
    color: couleurs.primaireFonce,
  },
  rangee: {
    flexDirection: 'row',
    gap: espaces.m,
  },
  demi: {
    flex: 1,
  },
  ligneOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs,
  },
  messageOk: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
    color: couleurs.succes,
  },
  ligneMouvement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    paddingTop: espaces.s,
  },
  ligneListe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    paddingTop: espaces.s,
  },
  mouvementTexte: {
    flex: 1,
    gap: 2,
  },
  mouvementLibelle: {
    fontSize: 14,
    fontWeight: '700',
    color: couleurs.encre,
  },
  mouvementMontant: {
    fontSize: 15,
    fontWeight: '800',
    color: couleurs.succes,
  },
  itineraire: {
    fontSize: 14.5,
    fontWeight: '700',
    color: couleurs.encre,
  },
  detail: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
    lineHeight: 18,
  },
  vide: {
    fontSize: 13.5,
    color: couleurs.texteSecondaire,
    paddingVertical: espaces.xs,
  },
}));
