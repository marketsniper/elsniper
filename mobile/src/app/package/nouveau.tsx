// Création d'un envoi de colis (POST /packages).
// Payload backend : {senderType, senderUserId | senderHotelId, size (REQUIS :
// small | medium | large — détermine le prix), pickupLocation,
// dropoffLocation, recipientName, recipientPhone, description?}.
// Prix par taille figé côté serveur : 5/10/18 USD (touristes/résidents ;
// hôtel partenaire −5 %) ou 13 000/26 000/47 000 TZS (locaux).
// Payé en ligne à 100 % par l'expéditeur.
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Selecteur } from '@/components/Selecteur';
import {
  Bouton,
  Carte,
  Champ,
  Ecran,
  EncartInfo,
  SousTitre,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ajouterColisLocal } from '@/lib/colisLocal';
import {
  HEURES_CHOIX,
  isoDepuisChoix,
  libellesDates,
  useT,
  type CleChaine,
} from '@/lib/i18n';
import { couleurs, espaces, rayons } from '@/lib/theme';
import {
  champ,
  deviseUtilisateur,
  formaterMontant,
  TAILLES_COLIS,
  REMISE_HOTEL,
  tarifColisTaille,
  type Devise,
  type TailleColis,
} from '@/lib/types';

// Icône + clés i18n de chaque taille.
const PRESENTATION_TAILLES: Record<
  TailleColis,
  { icone: React.ComponentProps<typeof Ionicons>['name']; titre: CleChaine; exemples: CleChaine }
> = {
  small: { icone: 'mail-outline', titre: 'ncolis_taille_petit', exemples: 'ncolis_taille_petit_ex' },
  medium: {
    icone: 'bag-handle-outline',
    titre: 'ncolis_taille_moyen',
    exemples: 'ncolis_taille_moyen_ex',
  },
  large: { icone: 'cube-outline', titre: 'ncolis_taille_grand', exemples: 'ncolis_taille_grand_ex' },
};

export default function EcranNouveauColis() {
  const router = useRouter();
  const { session } = useAuth();
  const { t, langue } = useT();

  const [taille, setTaille] = useState<TailleColis | null>(null);
  const [depart, setDepart] = useState('');
  const [arrivee, setArrivee] = useState('');
  const [destinataire, setDestinataire] = useState('');
  const [telephone, setTelephone] = useState('+255');
  // Numéro de l'expéditeur pour la ramasse — prérempli avec celui du compte.
  const [telExpediteur, setTelExpediteur] = useState(session?.phone ?? '+255');
  const [description, setDescription] = useState('');
  // Quand ramasser : date vide = « Dès que possible ».
  const choixDates = libellesDates(t, langue);
  const [dateRamassage, setDateRamassage] = useState('');
  const [heureRamassage, setHeureRamassage] = useState('');
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  const expediteurUser = session?.user ?? null;
  const expediteurHotel = session?.hotel ?? null;

  // Bons fidélité de l'hôtel : proposer l'envoi GRATUIT s'il en reste.
  const [bonsDispo, setBonsDispo] = useState(0);
  const [utiliserBon, setUtiliserBon] = useState(false);
  const hotelId = expediteurHotel?.id ?? null;
  useEffect(() => {
    if (!hotelId) return;
    api
      .fideliteHotel(hotelId)
      .then((f) => setBonsDispo(f.vouchers_available))
      .catch(() => setBonsDispo(0));
  }, [hotelId]);
  // Devise de l'expéditeur : USD touriste/résident/hôtel, TZS local.
  // Hôtel partenaire : même grille USD que les touristes avec −5 %.
  const devise: Devise = expediteurHotel ? 'USD' : deviseUtilisateur(expediteurUser);
  const tarifAffiche = (laTaille: TailleColis): number => {
    const brut = tarifColisTaille(laTaille, devise);
    return expediteurHotel ? Math.round(brut * (1 - REMISE_HOTEL) * 100) / 100 : brut;
  };
  const prix = taille ? tarifAffiche(taille) : null;

  const envoyer = async () => {
    setErreur('');
    if (!expediteurUser && !expediteurHotel) {
      setErreur(t('ncolis_erreur_profil'));
      return;
    }
    if (!taille) {
      setErreur(t('ncolis_erreur_taille'));
      return;
    }
    if (!depart.trim() || !arrivee.trim() || !destinataire.trim()) {
      setErreur(t('ncolis_erreur_champs'));
      return;
    }
    const telephoneNormalise = telephone.replace(/[\s-]/g, '');
    if (!/^\+[1-9]\d{6,14}$/.test(telephoneNormalise)) {
      setErreur(t('ncolis_erreur_tel'));
      return;
    }
    const telExpediteurNormalise = telExpediteur.replace(/[\s-]/g, '');
    if (!/^\+[1-9]\d{6,14}$/.test(telExpediteurNormalise)) {
      setErreur(t('ncolis_erreur_tel_expediteur'));
      return;
    }
    let pickupAt: string | undefined;
    if (dateRamassage) {
      const iso = heureRamassage
        ? isoDepuisChoix(choixDates, dateRamassage, heureRamassage)
        : null;
      if (!iso) {
        setErreur(t('sel_erreur_datetime'));
        return;
      }
      pickupAt = iso;
    }
    setCharge(true);
    try {
      const colis = await api.creerColis({
        senderType: expediteurHotel ? 'hotel' : 'user',
        senderUserId: expediteurHotel ? undefined : expediteurUser!.id,
        senderHotelId: expediteurHotel ? expediteurHotel.id : undefined,
        size: taille,
        pickupLocation: depart.trim(),
        dropoffLocation: arrivee.trim(),
        recipientName: destinataire.trim(),
        recipientPhone: telephoneNormalise,
        senderPhone: telExpediteurNormalise,
        description: description.trim() || undefined,
        pickupAt,
        useVoucher: utiliserBon || undefined,
      });
      const proprietaireId = (expediteurHotel ?? expediteurUser)!.id;
      await ajouterColisLocal(proprietaireId, colis.id);
      router.replace(`/package/${colis.id}`);
      // Résumé « colis posté » vers l'équipe, prêt à envoyer.
      const lienNotification = champ<string>(colis, 'whatsapp_link', 'whatsappLink');
      if (lienNotification) await Linking.openURL(lienNotification);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('ncolis_erreur_creation'));
    } finally {
      setCharge(false);
    }
  };

  return (
    <Ecran fond="lagon">
      <Carte>
        <Titre>{t('colis_envoyer')}</Titre>
        <SousTitre>{t('ncolis_intro')}</SousTitre>

        <Text style={styles.titreSection}>{t('ncolis_taille_titre')}</Text>
        {TAILLES_COLIS.map((cle) => {
          const presentation = PRESENTATION_TAILLES[cle];
          const active = taille === cle;
          return (
            <Pressable
              key={cle}
              onPress={() => setTaille(cle)}
              accessibilityRole="button"
              style={[styles.carteTaille, active && styles.carteTailleActive]}
            >
              <View style={[styles.bulleTaille, active && styles.bulleTailleActive]}>
                <Ionicons
                  name={presentation.icone}
                  size={22}
                  color={active ? couleurs.surPrimaire : couleurs.primaire}
                />
              </View>
              <View style={styles.textesTaille}>
                <View style={styles.enTeteTaille}>
                  <Text style={[styles.titreTaille, active && { color: couleurs.primaireFonce }]}>
                    {t(presentation.titre)}
                  </Text>
                  <Text style={styles.prixTaille}>
                    {formaterMontant(tarifAffiche(cle), devise)}
                  </Text>
                </View>
                <Text style={styles.exemplesTaille}>{t(presentation.exemples)}</Text>
              </View>
              {active && (
                <Ionicons name="checkmark-circle" size={22} color={couleurs.primaire} />
              )}
            </Pressable>
          );
        })}

        <Text style={styles.titreSection}>{t('ncolis_section_trajet')}</Text>
        <Champ
          label={t('ncolis_collecte')}
          value={depart}
          onChangeText={setDepart}
          placeholder={t('ncolis_collecte_placeholder')}
        />
        <Champ
          label={t('ncolis_livraison')}
          value={arrivee}
          onChangeText={setArrivee}
          placeholder={t('ncolis_livraison_placeholder')}
        />

        {/* Quand ramasser : le chauffeur voit cette heure sur l'annonce. */}
        <Selecteur
          label={t('ncolis_quand')}
          valeur={dateRamassage}
          options={[t('ncolis_asap'), ...choixDates]}
          placeholder={t('ncolis_asap')}
          onChange={(choix) => {
            if (choix === t('ncolis_asap')) {
              setDateRamassage('');
              setHeureRamassage('');
            } else {
              setDateRamassage(choix);
            }
          }}
        />
        {!!dateRamassage && (
          <Selecteur
            label={t('sel_heure')}
            valeur={heureRamassage}
            options={HEURES_CHOIX}
            onChange={setHeureRamassage}
          />
        )}

        {/* Numéro de l'expéditeur : le chauffeur l'appelle pour la ramasse. */}
        <Champ
          label={t('ncolis_tel_expediteur')}
          value={telExpediteur}
          onChangeText={setTelExpediteur}
          keyboardType="phone-pad"
          placeholder="+255 712 345 678"
        />

        <Text style={styles.titreSection}>{t('ncolis_section_destinataire')}</Text>
        <Champ
          label={t('ncolis_nom_dest')}
          value={destinataire}
          onChangeText={setDestinataire}
          placeholder={t('ncolis_nom_dest_placeholder')}
        />
        <Champ
          label={t('ncolis_tel_dest')}
          value={telephone}
          onChangeText={setTelephone}
          keyboardType="phone-pad"
          placeholder="+255 712 345 678"
        />
        <Champ
          label={t('ncolis_description_opt')}
          value={description}
          onChangeText={setDescription}
          placeholder={t('ncolis_description_placeholder')}
          multiline
        />

        {/* Bon fidélité hôtel : envoi GRATUIT, un bon consommé. */}
        {bonsDispo > 0 && (
          <Pressable
            onPress={() => setUtiliserBon((v) => !v)}
            accessibilityRole="button"
            style={[styles.carteBon, utiliserBon && styles.carteBonActive]}
          >
            <Ionicons
              name={utiliserBon ? 'gift' : 'gift-outline'}
              size={22}
              color={utiliserBon ? couleurs.surPrimaire : couleurs.primaireFonce}
            />
            <Text style={[styles.texteBon, utiliserBon && { color: couleurs.surPrimaire }]}>
              {utiliserBon
                ? t('ncolis_bon_actif')
                : t('ncolis_bon_proposer', { n: bonsDispo })}
            </Text>
          </Pressable>
        )}

        <View style={styles.blocPrix}>
          <View style={styles.lignePrix}>
            <Text style={styles.labelPrix}>{t('ncolis_prix_envoi')}</Text>
            <Text style={[styles.valeurPrix, utiliserBon && styles.prixBarre]}>
              {prix !== null ? formaterMontant(prix, devise) : '—'}
            </Text>
            {utiliserBon && <Text style={styles.prixOffert}>{t('ncolis_offert')}</Text>}
          </View>
          <Text style={styles.note}>{t('ncolis_note_prix')}</Text>
        </View>

        {!utiliserBon && <EncartInfo icone="card-outline">{t('ncolis_paye_expediteur')}</EncartInfo>}

        <TexteErreur>{erreur}</TexteErreur>
        <Bouton titre={t('ncolis_bouton')} icone="cube-outline" onPress={envoyer} charge={charge} />
      </Carte>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  titreSection: {
    fontSize: 14,
    fontWeight: '700',
    color: couleurs.encre,
    marginTop: espaces.s,
  },
  carteTaille: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    backgroundColor: couleurs.surface,
    borderRadius: rayons.carte,
    padding: espaces.m,
    borderWidth: 2,
    borderColor: couleurs.bordure,
  },
  carteTailleActive: {
    borderColor: couleurs.primaire,
    backgroundColor: couleurs.primaireClair,
  },
  bulleTaille: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: couleurs.primaireClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulleTailleActive: {
    backgroundColor: couleurs.primaire,
  },
  textesTaille: {
    flex: 1,
    gap: 2,
  },
  enTeteTaille: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.s,
  },
  titreTaille: {
    fontSize: 15,
    fontWeight: '800',
    color: couleurs.encre,
  },
  prixTaille: {
    fontSize: 14,
    fontWeight: '800',
    color: couleurs.primaire,
  },
  exemplesTaille: {
    fontSize: 12,
    color: couleurs.texteSecondaire,
    lineHeight: 16,
  },
  carteBon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.m,
    borderWidth: 1.5,
    borderColor: couleurs.etoile,
    backgroundColor: couleurs.surface,
    borderRadius: rayons.bouton,
    padding: espaces.m,
    marginTop: espaces.s,
  },
  carteBonActive: {
    backgroundColor: couleurs.primaire,
    borderColor: couleurs.primaire,
  },
  texteBon: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: couleurs.encre,
    lineHeight: 19,
  },
  prixBarre: {
    textDecorationLine: 'line-through',
    color: couleurs.texteSecondaire,
  },
  prixOffert: {
    fontSize: 16,
    fontWeight: '800',
    color: couleurs.succes,
  },
  blocPrix: {
    backgroundColor: couleurs.primaireClair,
    borderRadius: rayons.bouton,
    padding: espaces.m,
    gap: espaces.xs,
    marginTop: espaces.s,
  },
  lignePrix: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelPrix: {
    fontSize: 14,
    fontWeight: '600',
    color: couleurs.primaireFonce,
  },
  valeurPrix: {
    fontSize: 22,
    fontWeight: '800',
    color: couleurs.primaireFonce,
  },
  note: {
    fontSize: 12,
    color: couleurs.primaireFonce,
    lineHeight: 17,
    opacity: 0.8,
  },
});
