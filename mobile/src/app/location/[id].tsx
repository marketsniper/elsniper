// FICHE D'UNE LOCATION DE VÉHICULE (client) — suivi de la réservation :
// véhicule, dates, montant à régler avec la marche à suivre, et annulation
// au barème 24/48 h. Même mécanique que place/[id].tsx pour une place de
// taxi partagé — le paiement passe par le même moteur commun.
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';

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
import { useT } from '@/lib/i18n';
import { couleurs, espaces, stylesReactifs } from '@/lib/theme';
import {
  formaterDate,
  formaterMontant,
  moyensPaiement,
  reglementPaiement,
  type MoyenPaiement,
  type ReservationVehicule,
} from '@/lib/types';

const WHATSAPP_EQUIPE = 'https://wa.me/255666241749';

export default function EcranLocation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT();
  const [location, setLocation] = useState<ReservationVehicule | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargeAnnulation, setChargeAnnulation] = useState(false);
  const [moyenEnCours, setMoyenEnCours] = useState<MoyenPaiement | null>(null);
  const [introuvable, setIntrouvable] = useState(false);

  const charger = useCallback(async () => {
    if (!id) return;
    try {
      const locations = await api.listerMesLocations();
      const trouvee = locations.find((l) => l.id === id) ?? null;
      setLocation(trouvee);
      setIntrouvable(!trouvee);
      setErreur('');
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('vehicule_fiche_erreur'));
    }
  }, [id, t]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (!location) {
    return introuvable || erreur ? (
      <Ecran fond="palmiers">
        <TexteErreur>{erreur || t('vehicule_fiche_erreur')}</TexteErreur>
        <Bouton
          titre={t('commun_retour_accueil')}
          icone="arrow-back-outline"
          variante="secondaire"
          onPress={() => router.replace('/(tabs)/location')}
        />
      </Ecran>
    ) : (
      <ChargementCentre />
    );
  }

  const montant = formaterMontant(location.price, location.currency);
  const payee = location.payment_status === 'confirmed' || !!location.paid_at;
  const annulee = !!location.cancelled_at;

  const messagePaiement = [
    '💳 Paiement location de véhicule zanziGo',
    `Véhicule: ${location.make ?? ''} ${location.model ?? ''}`,
    `Du ${location.start_date} au ${location.end_date}`,
    `Montant: ${montant}`,
    `Réf: ${location.id}`,
    'Bonjour, je souhaite régler cette location — merci de me confirmer le moyen de paiement.',
  ].join('\n');

  const moyensDisponibles = moyensPaiement(location.currency);
  const parCarte = reglementPaiement(Number(location.price), location.currency, 'carte');
  const parMobile = reglementPaiement(Number(location.price), location.currency, 'mobile');

  const reglerAvec = async (moyen: MoyenPaiement) => {
    setMoyenEnCours(moyen);
    setErreur('');
    try {
      const lienLocal = `${WHATSAPP_EQUIPE}?text=${encodeURIComponent(messagePaiement)}`;
      if (!location.payment_id) {
        await Linking.openURL(lienLocal);
        return;
      }
      const paiement = await api.choisirMoyenPaiement(location.payment_id, moyen);
      await Linking.openURL(String(paiement.payment_link ?? lienLocal));
      await charger();
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('vehicule_erreur'));
    } finally {
      setMoyenEnCours(null);
    }
  };

  const annuler = () => {
    Alert.alert(t('vehicule_annuler'), '', [
      { text: t('commun_confirmer_non'), style: 'cancel' },
      {
        text: t('commun_confirmer_oui'),
        style: 'destructive',
        onPress: async () => {
          setChargeAnnulation(true);
          setErreur('');
          try {
            const resultat = await api.annulerLocation(location.id);
            await charger();
            Alert.alert(
              t('vehicule_annuler'),
              resultat.refund
                ? t('vehicule_remboursement', {
                    montant: String(resultat.refund.amount),
                    devise: resultat.refund.currency,
                    pct: String(resultat.refund.rate * 100),
                  })
                : t('vehicule_pas_remboursement')
            );
          } catch (e) {
            setErreur(e instanceof ErreurApi ? e.message : t('commun_annulation_impossible'));
          } finally {
            setChargeAnnulation(false);
          }
        },
      },
    ]);
  };

  return (
    <Ecran fond="palmiers" onRefresh={charger}>
      <Carte>
        <View style={styles.enTete}>
          <Titre>
            {location.make} {location.model}
          </Titre>
          {annulee ? (
            <Badge texte={t('mes_locations_statut_annulee')} ton="danger" />
          ) : payee ? (
            <Badge texte={t('mes_locations_statut_payee')} ton="succes" />
          ) : (
            <Badge texte={t('mes_locations_statut_attente')} ton="attente" />
          )}
        </View>
        {!!location.plate && <LigneInfo label={t('vehicule_champ_plaque')} valeur={location.plate} />}
        {/* La remise : l'endroit CHOISI par le client s'il en a demandé un,
            sinon le lieu de retrait de la fiche — et l'heure de début. */}
        {!!(location.pickup_location ?? location.vehicle_pickup_location) && (
          <LigneInfo
            label={t('location_lieu_remise')}
            valeur={
              String(location.pickup_location ?? location.vehicle_pickup_location) +
              (location.pickup_time ? ` · ${location.pickup_time}` : '')
            }
          />
        )}
        <LigneInfo label={t('vehicule_date_depart')} valeur={formaterDate(location.start_date)} />
        <LigneInfo label={t('vehicule_date_retour')} valeur={formaterDate(location.end_date)} />
        <View style={styles.blocPrix}>
          <Text style={styles.prix}>{montant}</Text>
          <Text style={styles.labelPrix}>
            {t('vehicule_prix_total')} · {t('vehicule_jours', { n: location.days })}
          </Text>
        </View>
      </Carte>

      {!annulee && !payee && (
        <>
          <EncartInfo icone="cash-outline" ton="attente">
            {t('vehicule_reservation_confirmee')}
          </EncartInfo>
          {moyensDisponibles.length > 1 ? (
            <>
              <Bouton
                titre={t('paiement_carte', { montant: formaterMontant(parCarte.montant, parCarte.devise) })}
                icone="card-outline"
                onPress={() => reglerAvec('carte')}
                charge={moyenEnCours === 'carte'}
                desactive={moyenEnCours !== null && moyenEnCours !== 'carte'}
              />
              <Bouton
                titre={t('paiement_mobile', { montant: formaterMontant(parMobile.montant, parMobile.devise) })}
                icone="phone-portrait-outline"
                variante="secondaire"
                onPress={() => reglerAvec('mobile')}
                charge={moyenEnCours === 'mobile'}
                desactive={moyenEnCours !== null && moyenEnCours !== 'mobile'}
              />
            </>
          ) : (
            <Bouton
              titre={t('paiement_mobile', { montant })}
              icone="phone-portrait-outline"
              onPress={() => reglerAvec('mobile')}
              charge={moyenEnCours === 'mobile'}
            />
          )}
        </>
      )}
      {payee && !annulee && (
        <EncartInfo icone="checkmark-circle-outline" ton="succes">
          {t('place_paiement_valide')}
        </EncartInfo>
      )}

      {!annulee && (
        <Bouton
          titre={t('vehicule_annuler')}
          icone="close-circle-outline"
          variante="danger"
          onPress={annuler}
          charge={chargeAnnulation}
        />
      )}

      <TexteErreur>{erreur}</TexteErreur>
      <Bouton
        titre={t('commun_contact_whatsapp')}
        icone="logo-whatsapp"
        variante="secondaire"
        onPress={() => Linking.openURL(WHATSAPP_EQUIPE)}
      />
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
  enTete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espaces.m },
  blocPrix: {
    marginTop: espaces.s,
    paddingTop: espaces.m,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    alignItems: 'center',
    gap: 2,
  },
  labelPrix: { fontSize: 14, fontWeight: '600', color: couleurs.texteSecondaire },
  prix: { fontSize: 26, fontWeight: '800', color: couleurs.primaire },
}));
