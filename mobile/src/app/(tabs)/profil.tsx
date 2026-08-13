// Onglet « Profil » : informations du compte (touriste/résident/local/hôtel,
// devise), statut de vérification des documents, langue, déconnexion.
// Hôtels : carte de FIDÉLITÉ (1 bon colis offert / 10 courses terminées) et
// solde de CRÉDIT prépayé (rechargé auprès de l'équipe).
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Badge,
  Bouton,
  Carte,
  Ecran,
  EncartInfo,
  LigneInfo,
  SelecteurLangue,
  SousTitre,
} from '@/components/ui';
import { api, type CreditHotel, type FideliteHotel } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, rayons, tailles } from '@/lib/theme';
import {
  champ,
  formaterMontant,
  type StatutVerification,
  type TypeCompte,
} from '@/lib/types';

const WHATSAPP_EQUIPE = 'https://wa.me/255666241749';

/** Initiales (2 lettres max) d'un nom complet. */
function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return 'Z';
  const premiere = mots[0].charAt(0);
  const seconde = mots.length > 1 ? mots[mots.length - 1].charAt(0) : '';
  return (premiere + seconde).toUpperCase();
}

export default function EcranProfil() {
  const router = useRouter();
  const { session, deconnexion, majSession } = useAuth();
  const { t } = useT();
  const utilisateur = session?.user ?? null;
  const hotel = session?.hotel ?? null;
  const [chargeMaj, setChargeMaj] = useState(false);

  // Fidélité + crédit (hôtels uniquement) — rechargés à chaque focus.
  const [fidelite, setFidelite] = useState<FideliteHotel | null>(null);
  const [credit, setCredit] = useState<CreditHotel | null>(null);
  const hotelId = hotel?.id ?? null;
  useFocusEffect(
    useCallback(() => {
      if (!hotelId) return;
      (async () => {
        try {
          setFidelite(await api.fideliteHotel(hotelId));
          setCredit(await api.creditHotel(hotelId));
        } catch {
          // silencieux : les cartes fidélité/crédit restent masquées
        }
      })();
    }, [hotelId])
  );

  const demanderRecharge = () => {
    Linking.openURL(
      `${WHATSAPP_EQUIPE}?text=${encodeURIComponent(
        `💰 Recharge crédit zanziGo\nHôtel: ${String(champ(hotel, 'name') ?? '')}\nJe souhaite recharger mon compte crédit. Montant souhaité (USD):`
      )}`
    );
  };

  // Transforme UN bon fidélité en crédit prépayé (l'autre usage : colis offert).
  const [chargeConversion, setChargeConversion] = useState(false);
  const convertirUnBon = () => {
    if (!hotelId || !fidelite) return;
    const montant = fidelite.voucher_credit_usd ?? 10;
    Alert.alert(
      t('fidelite_convertir_titre'),
      t('fidelite_convertir_confirm', { montant }),
      [
        { text: t('commun_confirmer_non'), style: 'cancel' },
        {
          // « Oui, convertir » — pas le « Oui, annuler » des annulations.
          text: t('fidelite_convertir_oui'),
          onPress: async () => {
            setChargeConversion(true);
            try {
              await api.convertirBonEnCredit(hotelId);
              setFidelite(await api.fideliteHotel(hotelId));
              setCredit(await api.creditHotel(hotelId));
            } catch {
              // silencieux : le solde affiché reste inchangé
            } finally {
              setChargeConversion(false);
            }
          },
        },
      ]
    );
  };

  const typeCompte = champ<TypeCompte>(utilisateur, 'account_type', 'accountType');
  const estResident = typeCompte === 'resident';
  const estLocal = typeCompte === 'local';
  // Statut de vérification du compte hôtel (les comptes créés avant la mise
  // en place de la vérification n'ont pas le champ : considérés vérifiés).
  const statutVerifHotel =
    champ<StatutVerification>(hotel, 'verification_status', 'verificationStatus') ?? 'verified';
  // Touriste : vérifié d'office. Résident/local : pending → verified/rejected
  // (validation manuelle des documents par l'équipe).
  const statutVerif =
    champ<StatutVerification>(utilisateur, 'verification_status', 'verificationStatus') ??
    'pending';
  const devise = champ<string>(utilisateur, 'currency');
  const nomAffiche = String(
    champ(utilisateur ?? hotel, 'full_name', 'fullName', 'name') ?? t('profil_compte_defaut')
  );

  // Badge selon le type de compte et l'état de vérification.
  const texteBadge = estResident
    ? statutVerif === 'verified'
      ? t('profil_badge_resident_ok')
      : statutVerif === 'rejected'
        ? t('profil_badge_refuse')
        : t('profil_badge_resident_attente')
    : estLocal
      ? statutVerif === 'verified'
        ? t('profil_badge_local_ok')
        : statutVerif === 'rejected'
          ? t('profil_badge_refuse')
          : t('profil_badge_local_attente')
      : t('profil_badge_verifie');
  const tonBadge =
    !estResident && !estLocal
      ? ('succes' as const)
      : statutVerif === 'verified'
        ? ('succes' as const)
        : statutVerif === 'rejected'
          ? ('danger' as const)
          : ('attente' as const);

  // Recharge le profil (utile pour voir la validation arriver).
  const actualiser = async () => {
    setChargeMaj(true);
    try {
      if (utilisateur) {
        await majSession({ user: await api.obtenirUtilisateur(utilisateur.id) });
      } else if (hotel) {
        await majSession({ hotel: await api.obtenirHotel(hotel.id) });
      }
    } catch {
      // silencieux : le profil affiché reste celui de la session
    } finally {
      setChargeMaj(false);
    }
  };

  const seDeconnecter = async () => {
    await deconnexion();
    router.replace('/');
  };

  return (
    <Ecran fond="lagon">
      <Carte style={styles.carteIdentite}>
        <View style={styles.avatar}>
          <Text style={styles.initiale}>{initiales(nomAffiche)}</Text>
        </View>
        <Text style={styles.nom}>{nomAffiche}</Text>
        <SousTitre>{session?.phone || session?.email || ''}</SousTitre>
        {utilisateur && <Badge texte={texteBadge} ton={tonBadge} />}
        {hotel && <Badge texte={t('profil_badge_hotel')} ton="primaire" />}
      </Carte>

      {estResident && statutVerif === 'pending' && (
        <EncartInfo icone="hourglass-outline" ton="attente">
          {t('profil_info_resident_attente')}
        </EncartInfo>
      )}
      {estLocal && statutVerif === 'pending' && (
        <EncartInfo icone="hourglass-outline" ton="attente">
          {t('profil_info_local_attente')}
        </EncartInfo>
      )}
      {(estResident || estLocal) && statutVerif === 'rejected' && (
        <EncartInfo icone="alert-circle-outline" ton="attente">
          {t('profil_info_refuse')}
        </EncartInfo>
      )}
      {hotel && statutVerifHotel === 'pending' && (
        <EncartInfo icone="hourglass-outline" ton="attente">
          {t('hotel_attente_verif')}
        </EncartInfo>
      )}
      {hotel && statutVerifHotel === 'rejected' && (
        <EncartInfo icone="alert-circle-outline" ton="attente">
          {t('hotel_refuse_verif')}
        </EncartInfo>
      )}

      {/* Parrainage : le client partage son code ZG- — récompense pour les
          deux au prochain paiement (gérée par l'équipe). */}
      {utilisateur && !!champ(utilisateur, 'referral_code', 'referralCode') && (
        <Carte>
          <Text style={styles.titreBloc}>🤝 {t('parrainage_titre')}</Text>
          <SousTitre>{t('parrainage_texte')}</SousTitre>
          <View style={styles.blocCodeParrain}>
            <Text style={styles.codeParrain}>
              {String(champ(utilisateur, 'referral_code', 'referralCode'))}
            </Text>
          </View>
          <Bouton
            titre={t('parrainage_partager')}
            icone="logo-whatsapp"
            variante="secondaire"
            onPress={() =>
              Linking.openURL(
                `https://wa.me/?text=${encodeURIComponent(
                  t('parrainage_message', {
                    code: String(champ(utilisateur, 'referral_code', 'referralCode')),
                  })
                )}`
              )
            }
          />
        </Carte>
      )}

      {/* Carte de fidélité : une case par course terminée, un bon toutes
          les 10 — la récompense concrète du volume apporté par l'hôtel. */}
      {hotel && fidelite && (
        <Carte>
          <View style={styles.enTeteFidelite}>
            <Text style={styles.titreBloc}>🎁 {t('fidelite_titre')}</Text>
            {fidelite.vouchers_available > 0 && (
              <Badge
                texte={t('fidelite_bons_dispo', { n: fidelite.vouchers_available })}
                ton="succes"
              />
            )}
          </View>
          <View style={styles.rangeeTampons}>
            {Array.from({ length: fidelite.trips_per_voucher }, (_, i) => (
              <View
                key={i}
                style={[styles.tampon, i < fidelite.progress && styles.tamponRempli]}
              >
                {i < fidelite.progress && (
                  <Ionicons name="car" size={13} color={couleurs.surPrimaire} />
                )}
              </View>
            ))}
          </View>
          <Text style={styles.texteFidelite}>
            {t('fidelite_progression', {
              n: fidelite.progress,
              total: fidelite.trips_per_voucher,
            })}
          </Text>
          <Text style={styles.noteFidelite}>{t('fidelite_regle')}</Text>
          {fidelite.vouchers_available > 0 && (
            <Bouton
              titre={t('fidelite_convertir', { montant: fidelite.voucher_credit_usd ?? 10 })}
              icone="cash-outline"
              variante="secondaire"
              onPress={convertirUnBon}
              charge={chargeConversion}
            />
          )}
        </Carte>
      )}

      {/* Crédit prépayé : payer les courses et colis en un geste. */}
      {hotel && credit && (
        <Carte>
          <Text style={styles.titreBloc}>💳 {t('credit_titre')}</Text>
          <View style={styles.ligneSolde}>
            <Text style={styles.labelSolde}>{t('credit_solde')}</Text>
            <Text style={styles.valeurSolde}>{formaterMontant(credit.balance, 'USD')}</Text>
          </View>
          <Text style={styles.noteFidelite}>{t('credit_explication')}</Text>
          <Bouton
            titre={t('credit_recharger')}
            icone="logo-whatsapp"
            variante="secondaire"
            onPress={demanderRecharge}
          />
        </Carte>
      )}

      <Carte>
        {/* Identité e-mail : le WhatsApp du profil (sinon l'e-mail vérifié). */}
        <LigneInfo
          label={t('commun_telephone')}
          valeur={
            session?.phone ||
            String(champ(session?.user, 'phone') ?? '') ||
            session?.email ||
            '—'
          }
        />
        <LigneInfo
          label={t('commun_email')}
          valeur={String(champ(utilisateur ?? hotel, 'email') ?? '—')}
        />
        <LigneInfo
          label={t('profil_type_compte')}
          valeur={
            hotel
              ? t('profil_badge_hotel')
              : estResident
                ? t('client_type_resident')
                : estLocal
                  ? t('profil_type_local')
                  : t('client_type_touriste')
          }
        />
        {hotel && (
          <>
            <LigneInfo
              label={t('profil_contact')}
              valeur={String(champ(hotel, 'contact_name', 'contactName') ?? '—')}
            />
            <LigneInfo label={t('commun_zone')} valeur={String(champ(hotel, 'zone') ?? '—')} />
          </>
        )}
        {/* Hôtels : grille touriste −5 % en USD — jamais TZS. */}
        <LigneInfo
          label={t('commun_devise')}
          valeur={devise ?? (estLocal ? 'TZS' : 'USD')}
        />
      </Carte>

      <Carte>
        <Text style={styles.labelLangue}>{t('commun_langue')}</Text>
        <SelecteurLangue compact />
      </Carte>

      {(utilisateur || hotel) && (
        <Bouton
          titre={t('profil_actualiser')}
          icone="refresh-outline"
          variante="secondaire"
          onPress={actualiser}
          charge={chargeMaj}
        />
      )}

      {/* Un gérant peut inscrire un autre établissement : le formulaire crée
          le compte puis bascule la session sur ce nouvel hôtel. */}
      {hotel && (
        <Bouton
          titre={t('hotel_ajouter_bouton')}
          icone="business-outline"
          variante="secondaire"
          onPress={() => router.push('/(auth)/hotel-inscription')}
        />
      )}

      <Pressable
        onPress={seDeconnecter}
        style={({ pressed }) => [styles.ligneDeconnexion, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
      >
        <Ionicons name="log-out-outline" size={20} color={couleurs.danger} />
        <Text style={styles.texteDeconnexion}>{t('commun_se_deconnecter')}</Text>
      </Pressable>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  carteIdentite: {
    alignItems: 'center',
    gap: espaces.s,
    paddingVertical: espaces.xl,
  },
  avatar: {
    width: tailles.avatar,
    height: tailles.avatar,
    borderRadius: tailles.avatar / 2,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initiale: {
    fontSize: 28,
    fontWeight: '800',
    color: couleurs.primaireFonce,
  },
  nom: {
    fontSize: 20,
    fontWeight: '700',
    color: couleurs.encre,
  },
  labelLangue: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  titreBloc: {
    fontSize: 16,
    fontWeight: '800',
    color: couleurs.encre,
  },
  // Code parrain : bien visible, facile à recopier de vive voix.
  blocCodeParrain: {
    alignSelf: 'center',
    backgroundColor: couleurs.primaireClair,
    borderWidth: 2,
    borderColor: couleurs.primaire,
    borderRadius: rayons.bouton,
    paddingHorizontal: espaces.xl,
    paddingVertical: espaces.m,
    marginVertical: espaces.s,
  },
  codeParrain: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 2,
    color: couleurs.primaireFonce,
  },
  enTeteFidelite: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  rangeeTampons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaces.s,
    marginVertical: espaces.s,
  },
  tampon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.sable,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tamponRempli: {
    backgroundColor: couleurs.primaire,
    borderColor: couleurs.primaire,
  },
  texteFidelite: {
    fontSize: 14,
    fontWeight: '700',
    color: couleurs.encre,
  },
  noteFidelite: {
    fontSize: 12.5,
    color: couleurs.texteSecondaire,
    lineHeight: 18,
    marginTop: 2,
  },
  ligneSolde: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.s,
    backgroundColor: couleurs.sable,
    borderRadius: rayons.bouton,
    paddingHorizontal: espaces.m,
    paddingVertical: espaces.m,
    marginVertical: espaces.xs,
  },
  labelSolde: {
    fontSize: 14,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  valeurSolde: {
    fontSize: 20,
    fontWeight: '800',
    color: couleurs.primaireFonce,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
    textAlign: 'right',
  },
  ligneDeconnexion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaces.s,
    paddingVertical: espaces.l,
    marginTop: espaces.s,
  },
  texteDeconnexion: {
    fontSize: 15,
    fontWeight: '600',
    color: couleurs.danger,
  },
});
