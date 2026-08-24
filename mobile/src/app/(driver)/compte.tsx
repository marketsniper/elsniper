// Mode chauffeur — profil, langue et déconnexion.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import {
  Badge,
  Carte,
  Ecran,
  LigneInfo,
  TexteErreur,
  SelecteurLangue,
  SousTitre,
} from '@/components/ui';
import { CarteAlertes } from '@/components/CarteAlertes';
import { ChoixDocument } from '@/components/ChoixDocument';
import { CarteVersion } from '@/components/Version';
import { api, ErreurApi, type StatsChauffeur } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { couleurs, espaces, rayons, stylesReactifs, tailles } from '@/lib/theme';
import { champ, formaterMontant, totalEnTzs, type StatutVerification } from '@/lib/types';

/** Initiales (2 lettres max) d'un nom complet. */
function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return 'Z';
  const premiere = mots[0].charAt(0);
  const seconde = mots.length > 1 ? mots[mots.length - 1].charAt(0) : '';
  return (premiere + seconde).toUpperCase();
}

export default function EcranCompteChauffeur() {
  const router = useRouter();
  const { session, deconnexion } = useAuth();
  const { t } = useT();
  const chauffeur = session?.driver ?? null;

  // Compteur de gains (courses terminées + colis livrés, nets de commission).
  const [stats, setStats] = useState<StatsChauffeur | null>(null);
  const chargerStats = useCallback(async () => {
    if (!chauffeur?.id) return;
    try {
      setStats(await api.statsChauffeur(chauffeur.id));
    } catch {
      // silencieux : la carte gains reste vide
    }
  }, [chauffeur?.id]);
  useFocusEffect(
    useCallback(() => {
      chargerStats();
      // La session en mémoire ne se rafraîchit pas toute seule : sans ce
      // rappel, un chauffeur qui rouvre l'écran croirait n'avoir aucune
      // photo — et l'équipe en recevrait une deuxième.
      if (chauffeur?.id) {
        api
          .obtenirChauffeur(chauffeur.id)
          .then((frais) => setPhotoChauffeur(champ<string>(frais, 'photo_url', 'photoUrl') ?? null))
          .catch(() => {});
      }
    }, [chargerStats, chauffeur?.id])
  );

  const statutVerif =
    champ<StatutVerification>(chauffeur, 'verification_status', 'verificationStatus') ?? 'pending';
  const verifie = statutVerif === 'verified';
  const moyenneBrute = champ<number | string>(chauffeur, 'rating_avg', 'ratingAvg');
  const nbNotes = Number(champ<number | string>(chauffeur, 'rating_count', 'ratingCount') ?? 0);
  const moyenne =
    moyenneBrute !== undefined && Number.isFinite(Number(moyenneBrute))
      ? Number(moyenneBrute).toFixed(1)
      : null;
  const nomAffiche = String(
    champ(chauffeur, 'full_name', 'fullName') ?? t('rides_chauffeur_defaut')
  );

  // MA PHOTO. Elle part au serveur en deux temps : le fichier d'abord
  // (redimensionné et réenregistré en JPEG par ChoixDocument — les iPhone
  // produisent du HEIC que le serveur ne sait pas lire), puis son adresse
  // sur la fiche. On l'affiche tout de suite, sans attendre un rechargement.
  const [photoChauffeur, setPhotoChauffeur] = useState<string | null>(
    champ<string>(chauffeur, 'photo_url', 'photoUrl') ?? null
  );
  const [erreurPhoto, setErreurPhoto] = useState('');
  const idChauffeur = champ<string>(chauffeur, 'id') ?? null;

  const enregistrerPhoto = async (uri: string) => {
    if (!idChauffeur) return;
    setErreurPhoto('');
    // Optimiste : le chauffeur voit sa photo pendant que l'envoi se fait.
    setPhotoChauffeur(uri);
    try {
      const { url } = await api.televerser(uri);
      const maj = await api.definirPhotoChauffeur(idChauffeur, url);
      setPhotoChauffeur(champ<string>(maj, 'photo_url', 'photoUrl') ?? url);
    } catch (erreur) {
      // L'aperçu revient à l'état d'avant : mieux vaut pas de photo qu'une
      // photo que le client ne verra jamais.
      setPhotoChauffeur(champ<string>(chauffeur, 'photo_url', 'photoUrl') ?? null);
      setErreurPhoto(erreur instanceof ErreurApi ? erreur.message : t('photo_erreur'));
    }
  };

  const seDeconnecter = async () => {
    await deconnexion();
    router.replace('/');
  };

  return (
    <Ecran fond="vagues">
      <Carte style={styles.carteIdentite}>
        <View style={styles.avatar}>
          <Text style={styles.initiale}>{initiales(nomAffiche)}</Text>
        </View>
        <Text style={styles.nom}>{nomAffiche}</Text>
        <SousTitre>{session?.phone ?? ''}</SousTitre>
        <Badge
          texte={
            verifie
              ? t('compte_badge_verifie')
              : statutVerif === 'rejected'
                ? t('compte_badge_refuse')
                : t('compte_badge_attente')
          }
          ton={verifie ? 'succes' : statutVerif === 'rejected' ? 'danger' : 'attente'}
        />
        {moyenne !== null && nbNotes > 0 && (
          <Badge texte={t('compte_avis', { note: moyenne, n: nbNotes })} ton="primaire" />
        )}
      </Carte>

      {/* MA PHOTO — celle que le client verra avant de monter.
          Un chauffeur vérifié seulement : tant que le dossier n'est pas
          validé, aucune course ne lui est confiée, la photo ne servirait à
          personne et l'équipe aurait une image de plus à regarder. */}
      {verifie && (
        <Carte>
          <Text style={styles.titreGains}>📸 {t('photo_titre')}</Text>
          <Text style={styles.explicationPhoto}>{t('photo_explication')}</Text>
          {!!photoChauffeur && (
            <View style={styles.rangeePhoto}>
              <Image
                source={{ uri: photoChauffeur }}
                style={styles.apercuPhoto}
                accessibilityLabel={nomAffiche}
              />
              <Text style={styles.explicationPhoto}>{t('photo_deja')}</Text>
            </View>
          )}
          <ChoixDocument
            uri={photoChauffeur}
            onFichier={enregistrerPhoto}
            onErreur={setErreurPhoto}
            texteAjouter={t('photo_ajouter')}
            texteAjoute={t('photo_ajoutee')}
            texteChanger={t('photo_changer')}
            camera
          />
          {!!erreurPhoto && <TexteErreur>{erreurPhoto}</TexteErreur>}
        </Carte>
      )}

      {/* Compteur de gains — TOUT EN SHILLINGS : le gain net du jour en
          grand (les places payées en USD sont converties au taux zanziGo),
          puis 7 jours et 30 jours avec la moyenne par jour. */}
      {verifie && stats && (
        <Carte>
          <Text style={styles.titreGains}>💰 {t('gains_titre')}</Text>
          <View style={styles.heroGains}>
            <Text style={styles.heroMontantGains}>
              {formaterMontant(totalEnTzs(stats.today.gains), 'TZS')}
            </Text>
            <Text style={styles.heroLabelGains}>{t('gains_hero_label')}</Text>
            <Text style={styles.heroDetailGains}>
              {t('gains_detail_compte', {
                courses: stats.today.courses,
                colis: stats.today.colis,
                places: stats.today.places ?? 0,
              })}
            </Text>
          </View>
          {(
            [
              ['gains_7j', stats.week, 7],
              ['gains_30j', stats.month, 30],
            ] as const
          ).map(([cle, fenetre, jours]) => (
            <View key={cle} style={styles.ligneGains}>
              <View style={styles.colonneGains}>
                <Text style={styles.labelGains}>{t(cle)}</Text>
                <Text style={styles.detailGains}>
                  {t('gains_detail_compte', { courses: fenetre.courses, colis: fenetre.colis, places: fenetre.places ?? 0 })}
                </Text>
              </View>
              <View style={styles.colonneMontants}>
                <Text style={styles.montantGains}>
                  {formaterMontant(totalEnTzs(fenetre.gains), 'TZS')}
                </Text>
                <Text style={styles.parJourGains}>
                  {t('equipe_ca_par_jour', {
                    montant: formaterMontant(Math.round(totalEnTzs(fenetre.gains) / jours), 'TZS'),
                  })}
                </Text>
              </View>
            </View>
          ))}
          <Text style={styles.noteGains}>
            {t('gains_note_paiement')} {t('gains_note_conversion')}
          </Text>
        </Carte>
      )}

      <Carte>
        <LigneInfo label={t('commun_telephone')} valeur={session?.phone ?? '—'} />
        <LigneInfo
          label={t('compte_vehicule')}
          valeur={String(champ(chauffeur, 'vehicle_model', 'vehicleModel') ?? '—')}
        />
        <LigneInfo
          label={t('compte_plaque')}
          valeur={String(champ(chauffeur, 'vehicle_plate', 'vehiclePlate') ?? '—')}
        />
        <LigneInfo
          label={t('compte_permis')}
          valeur={String(champ(chauffeur, 'license_number', 'licenseNumber') ?? '—')}
        />
        <LigneInfo label={t('commun_zone')} valeur={String(champ(chauffeur, 'zone') ?? '—')} />
      </Carte>

      <Carte>
        <Text style={styles.labelLangue}>{t('commun_langue')}</Text>
        <SelecteurLangue compact />
      </Carte>

      {/* Alertes instantanées : son téléphone sonne dès qu'une course lui est
          attribuée. Réservé aux chauffeurs validés — avant, il n'a pas encore
          de courses à recevoir. */}
      {verifie && (
        <CarteAlertes
          cible="chauffeur"
          titre={t('alertes_chauffeur_titre')}
          intro={t('alertes_chauffeur_intro')}
          nomAppareil={t('alertes_chauffeur_appareil')}
        />
      )}

      <CarteVersion />

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

const styles = stylesReactifs(() => ({
  explicationPhoto: {
    fontSize: 12.5,
    lineHeight: 18,
    color: couleurs.texteSecondaire,
  },
  rangeePhoto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
  },
  apercuPhoto: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: couleurs.bordure,
  },
  titreGains: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
  },
  // Gain du jour : le chiffre en GRAND, en shillings, au centre.
  heroGains: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: espaces.s,
  },
  heroMontantGains: {
    fontSize: 30,
    fontWeight: '800',
    color: couleurs.succes,
  },
  heroLabelGains: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.encre,
  },
  heroDetailGains: {
    fontSize: 12.5,
    color: couleurs.texteSecondaire,
  },
  colonneMontants: {
    alignItems: 'flex-end',
    gap: 1,
  },
  parJourGains: {
    fontSize: 12,
    fontWeight: '700',
    color: couleurs.succes,
  },
  ligneGains: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
    paddingVertical: espaces.xs,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
  },
  colonneGains: {
    flex: 1,
    gap: 2,
  },
  labelGains: {
    fontSize: 14,
    fontWeight: '600',
    color: couleurs.encre,
  },
  detailGains: {
    fontSize: 12.5,
    color: couleurs.texteSecondaire,
  },
  montantGains: {
    fontSize: 15,
    fontWeight: '800',
    color: couleurs.primaire,
    textAlign: 'right',
    flexShrink: 1,
  },
  noteGains: {
    fontSize: 12.5,
    color: couleurs.texteSecondaire,
    lineHeight: 18,
  },
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
}));
