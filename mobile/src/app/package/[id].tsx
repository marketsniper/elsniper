// Détail d'un colis : QR code (PKG-…) à présenter au chauffeur, suivi
// Créé → Payé → Ramassé → Livré, paiement quand le colis vient d'être créé.
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Share, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { TimelineStatut } from '@/components/TimelineStatut';
import {
  BadgeStatutColis,
  Bouton,
  Carte,
  ChargementCentre,
  Ecran,
  EncartInfo,
  LigneInfo,
  SousTitre,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRafraichissementAuto } from '@/lib/rafraichissementAuto';
import { formaterDateRelativeI18n, libelleStatutColis, libelleTailleColis, useT } from '@/lib/i18n';

import { couleurs, espaces, ombres, rayons, stylesReactifs } from '@/lib/theme';
import {
  champ,
  ETAPES_COLIS,
  formaterMontant,
  formaterPrix,
  moyensPaiement,
  reglementPaiement,
  type Colis,
  type MoyenPaiement,
  type StatutColis,
  type TailleColis,
} from '@/lib/types';

// Contact WhatsApp de l'équipe zanziGo (secours si whatsapp_link absent).
const WHATSAPP_EQUIPE = 'https://wa.me/255666241749';

export default function EcranDetailColis() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT();
  const { session } = useAuth();
  const [colis, setColis] = useState<Colis | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargePaiement, setChargePaiement] = useState(false);
  // Crédit prépayé (hôtels) : solde chargé au focus, bouton dédié si suffisant.
  const [soldeCredit, setSoldeCredit] = useState<number | null>(null);
  const [chargeCredit, setChargeCredit] = useState(false);
  const hotelId = session?.hotel?.id ?? null;
  // Paiement créé sur cet écran (pour la simulation de confirmation en dev).
  const [paiementId, setPaiementId] = useState<string | null>(null);
  // Moyen de paiement en cours de traitement (pour n'animer QUE son bouton).
  const [moyenEnCours, setMoyenEnCours] = useState<MoyenPaiement | null>(null);
  // 'paypal' = circuit automatique (bouton « J'ai payé — vérifier »).
  const [methodePaiement, setMethodePaiement] = useState<string>('manual');
  const [chargeConfirmation, setChargeConfirmation] = useState(false);
  const [chargeAnnulation, setChargeAnnulation] = useState(false);
  const [chargePosition, setChargePosition] = useState(false);
  const [infoPosition, setInfoPosition] = useState('');

  const charger = useCallback(async () => {
    if (!id) return;
    try {
      setColis(await api.obtenirColis(id));
      setErreur('');
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('dcolis_introuvable'));
    }
  }, [id, t]);

  // La fiche se met à jour toute seule (payé, ramassé, livré…).
  useRafraichissementAuto(charger);

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

  if (!colis) {
    return erreur ? (
      <Ecran fond="lagon">
        <TexteErreur>{erreur}</TexteErreur>
      </Ecran>
    ) : (
      <ChargementCentre message={t('dcolis_chargement')} />
    );
  }

  const statut = champ<StatutColis>(colis, 'status', 'statut');
  const codeQr = champ<string>(colis, 'qr_code', 'qrCode');
  const lienWhatsapp = champ<string>(colis, 'whatsapp_link', 'whatsappLink') ?? WHATSAPP_EQUIPE;
  // Règle serveur : le paiement n'est possible que sur un colis nouvellement créé.
  const peutPayer = statut === 'created';
  // Montants des deux moyens, calculés d'avance : le client voit ce qu'il
  // règle avant de choisir (le serveur refait le calcul de son côté).
  const prixColis = Number(champ(colis, 'price') ?? 0);
  const deviseColis = String(champ(colis, 'currency') ?? 'USD');
  const moyensDisponibles = moyensPaiement(deviseColis);
  const parCarte = reglementPaiement(prixColis, deviseColis, 'carte');
  const parMobile = reglementPaiement(prixColis, deviseColis, 'mobile');
  // Annulation par l'expéditeur : uniquement avant paiement.
  const peutAnnuler = statut === 'created';

  // Paiement en un geste avec le crédit prépayé de l'hôtel.
  const payerAvecCredit = async () => {
    setChargeCredit(true);
    setErreur('');
    try {
      const paiement = await api.payerColisAvecCredit(colis.id);
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
      const paiement = await api.payerColis(colis.id, moyen);
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
    }
  };

  // Annulation avec confirmation (dialogue natif) — irréversible.
  const annuler = () => {
    Alert.alert(t('dcolis_annuler'), t('dcolis_annuler_confirm'), [
      { text: t('commun_confirmer_non'), style: 'cancel' },
      {
        text: t('commun_confirmer_oui'),
        style: 'destructive',
        onPress: async () => {
          setChargeAnnulation(true);
          setErreur('');
          try {
            await api.annulerColis(colis.id);
            await charger();
          } catch (e) {
            setErreur(e instanceof ErreurApi ? e.message : t('commun_annulation_impossible'));
          } finally {
            setChargeAnnulation(false);
          }
        },
      },
    ]);
  };

  // Suivi GPS pendant la livraison : récupère la dernière position du
  // chauffeur et l'ouvre dans l'app de cartes du téléphone.
  const voirPosition = async () => {
    setChargePosition(true);
    setErreur('');
    setInfoPosition('');
    try {
      const position = await api.positionColis(colis.id);
      setInfoPosition(
        t('dcolis_position_maj', { quand: formaterDateRelativeI18n(position.updated_at, t) })
      );
      await Linking.openURL(`https://maps.google.com/?q=${position.lat},${position.lng}`);
    } catch (e) {
      if (e instanceof ErreurApi && e.code === 'position_unavailable') {
        setInfoPosition(t('dcolis_position_indispo'));
      } else {
        setErreur(e instanceof ErreurApi ? e.message : t('dcolis_position_indispo'));
      }
    } finally {
      setChargePosition(false);
    }
  };

  // Partage du suivi (feuille de partage native → WhatsApp, SMS…), pour que
  // l'expéditeur transmette le code au destinataire.
  const partager = async () => {
    const trajet = `${champ(colis, 'pickup_location', 'pickupLocation') ?? '?'} → ${
      champ(colis, 'dropoff_location', 'dropoffLocation') ?? '?'
    }`;
    try {
      await Share.share({
        message: t('dcolis_partage_message', {
          trajet,
          qr: codeQr ?? '—',
          statut: libelleStatutColis(statut, t),
        }),
      });
    } catch {
      // Partage annulé par l'utilisateur : rien à faire.
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

  return (
    <Ecran fond="lagon" onRefresh={charger}>
      <Carte style={styles.carteQr}>
        <View style={styles.enTeteQr}>
          <Titre>{t('dcolis_titre')}</Titre>
          <BadgeStatutColis statut={statut} />
        </View>
        {codeQr ? (
          <View style={styles.cadreQr}>
            <QRCode
              value={codeQr}
              size={180}
              color={couleurs.encre}
              backgroundColor={couleurs.surVoile}
            />
            <Text style={styles.codeTexte}>{codeQr}</Text>
          </View>
        ) : (
          <TexteErreur>{t('dcolis_qr_indisponible')}</TexteErreur>
        )}
        <SousTitre centre>{t('dcolis_presenter')}</SousTitre>
        <Text style={styles.consigne}>{t('dcolis_consigne')}</Text>
      </Carte>

      <Carte>
        {!!champ<TailleColis>(colis, 'size', 'taille') && (
          <LigneInfo
            label={t('dcolis_taille')}
            valeur={libelleTailleColis(champ<TailleColis>(colis, 'size', 'taille'), t)}
          />
        )}
        <LigneInfo
          label={t('dcolis_collecte')}
          valeur={String(champ(colis, 'pickup_location', 'pickupLocation') ?? '—')}
        />
        <LigneInfo
          label={t('dcolis_livraison')}
          valeur={String(champ(colis, 'dropoff_location', 'dropoffLocation') ?? '—')}
        />
        <LigneInfo
          label={t('dcolis_destinataire')}
          valeur={String(champ(colis, 'recipient_name', 'recipientName') ?? '—')}
        />
        <LigneInfo
          label={t('commun_telephone')}
          valeur={String(champ(colis, 'recipient_phone', 'recipientPhone') ?? '—')}
        />
        {!!champ(colis, 'description') && (
          <LigneInfo label={t('commun_description')} valeur={String(champ(colis, 'description'))} />
        )}
        <LigneInfo label={t('commun_prix')} valeur={formaterPrix(colis)} />
      </Carte>

      <Carte>
        <Text style={styles.titreSuivi}>{t('dcolis_suivi')}</Text>
        <TimelineStatut
          etapes={ETAPES_COLIS.map((cle) => ({ cle, label: libelleStatutColis(cle, t) }))}
          statutCourant={statut}
          annule={statut === 'cancelled'}
        />
      </Carte>

      {/* Hôtel avec crédit suffisant : paiement en un geste. */}
      {peutPayer &&
        hotelId &&
        soldeCredit !== null &&
        soldeCredit >= Number(champ(colis, 'price') ?? Infinity) && (
          <Bouton
            titre={`${t('trip_payer_credit')} (${formaterMontant(soldeCredit, 'USD')})`}
            icone="wallet-outline"
            onPress={payerAvecCredit}
            charge={chargeCredit}
          />
        )}
      {/* Même choix que sur une course : carte bancaire (prix + frais) ou
          portefeuille mobile (converti en shillings, sans frais). Un colis
          facturé en shillings n'a que le portefeuille mobile. */}
      {peutPayer && (
        <>
          <EncartInfo icone="logo-whatsapp">{t('dcolis_whatsapp_aide')}</EncartInfo>
          {moyensDisponibles.length > 1 ? (
            <Carte>
              <SousTitre>{t('paiement_choix_titre')}</SousTitre>
              <Bouton
                titre={t('paiement_carte', {
                  montant: formaterMontant(parCarte.montant, parCarte.devise),
                })}
                icone="card-outline"
                onPress={() => payer('carte')}
                charge={chargePaiement && moyenEnCours === 'carte'}
                desactive={chargePaiement && moyenEnCours !== 'carte'}
              />
              <Text style={styles.detailMoyen}>
                {t('paiement_carte_detail', {
                  prix: formaterMontant(prixColis, deviseColis),
                  frais: formaterMontant(parCarte.surcharge, parCarte.devise),
                })}
              </Text>
              <Bouton
                titre={t('paiement_mobile', {
                  montant: formaterMontant(parMobile.montant, parMobile.devise),
                })}
                icone="phone-portrait-outline"
                variante="secondaire"
                onPress={() => payer('mobile')}
                charge={chargePaiement && moyenEnCours === 'mobile'}
                desactive={chargePaiement && moyenEnCours !== 'mobile'}
              />
              <Text style={styles.detailMoyen}>{t('paiement_mobile_detail')}</Text>
            </Carte>
          ) : (
            <Bouton
              titre={t('dcolis_payer_whatsapp')}
              icone="phone-portrait-outline"
              onPress={() => payer('mobile')}
              charge={chargePaiement}
            />
          )}
        </>
      )}
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
      {statut === 'paid' && (
        <EncartInfo icone="checkmark-circle-outline">{t('dcolis_paiement_recu')}</EncartInfo>
      )}
      {statut === 'picked_up' && (
        <>
          <Bouton
            titre={t('dcolis_position_bouton')}
            icone="navigate-outline"
            onPress={voirPosition}
            charge={chargePosition}
          />
          {!!infoPosition && (
            <EncartInfo icone="location-outline">{infoPosition}</EncartInfo>
          )}
        </>
      )}
      {peutAnnuler && (
        <Bouton
          titre={t('dcolis_annuler')}
          icone="close-circle-outline"
          variante="danger"
          onPress={annuler}
          charge={chargeAnnulation}
        />
      )}

      {!!codeQr && statut !== 'cancelled' && (
        <Bouton
          titre={t('dcolis_partager')}
          icone="share-social-outline"
          variante="secondaire"
          onPress={partager}
        />
      )}
      <Bouton
        titre={t('commun_contact_whatsapp')}
        icone="logo-whatsapp"
        variante="secondaire"
        onPress={() => Linking.openURL(lienWhatsapp)}
      />

      <TexteErreur>{erreur}</TexteErreur>
      <Bouton
        titre={t('commun_actualiser_statut')}
        icone="refresh-outline"
        variante="secondaire"
        onPress={charger}
      />
      {/* Retour toujours possible depuis la fiche (colis livré compris). */}
      <Bouton
        titre={t('commun_retour_accueil')}
        icone="arrow-back-outline"
        variante="secondaire"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/colis'))}
      />
    </Ecran>
  );
}

const styles = stylesReactifs(() => ({
  // Ligne d'explication sous chaque bouton de paiement (frais, sans frais).
  detailMoyen: {
    color: couleurs.texteSecondaire,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -espaces.xs,
    marginBottom: espaces.s,
  },
  carteQr: {
    alignItems: 'center',
  },
  enTeteQr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
  },
  cadreQr: {
    alignItems: 'center',
    gap: espaces.s,
    padding: espaces.l,
    marginVertical: espaces.s,
    backgroundColor: couleurs.surface,
    borderRadius: rayons.carte,
    ...ombres.douce,
  },
  codeTexte: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: couleurs.texteSecondaire,
  },
  consigne: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
    textAlign: 'center',
  },
  titreSuivi: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
    marginBottom: espaces.s,
  },
}));
