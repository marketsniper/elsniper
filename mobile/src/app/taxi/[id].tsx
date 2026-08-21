// Fiche COMPLÈTE d'un chauffeur, côté équipe : on l'ouvre en touchant son
// nom dans la rubrique « Mes taxis ».
// Tout ce que l'équipe doit pouvoir contrôler sans appeler personne : les
// quatre pièces jointes déposées (ouvrables dans l'application), le véhicule,
// les dates d'expiration des documents, les gains, les courses, la position,
// le mot de passe (remplaçable — jamais lisible) et la radiation définitive.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { VisionneuseDocument } from '@/components/VisionneuseDocument';
import {
  Badge,
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
import { CartePosition } from '@/components/CartePosition';
import { api, definirCleEquipe, ErreurApi, type StatsChauffeur } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { lireStockage } from '@/lib/stockage';
import { couleurs, espaces, rayons, stylesReactifs } from '@/lib/theme';
import {
  champ,
  formaterDate,
  formaterMontant,
  type Chauffeur,
  type Trajet,
} from '@/lib/types';

const CLE_STOCKAGE = 'zanzigo.cle_equipe';
const MAX_COURSES = 12;

export default function EcranTaxiEquipe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT();

  const [chauffeur, setChauffeur] = useState<Chauffeur | null>(null);
  const [stats, setStats] = useState<StatsChauffeur | null>(null);
  const [courses, setCourses] = useState<Trajet[]>([]);
  const [charge, setCharge] = useState(true);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  const [documentOuvert, setDocumentOuvert] = useState<{ url: string; titre: string } | null>(null);
  const [datePermis, setDatePermis] = useState('');
  const [dateAssurance, setDateAssurance] = useState('');
  const [nouveauMdp, setNouveauMdp] = useState('');
  const [confirmeRadiation, setConfirmeRadiation] = useState(false);
  const [actionEnCours, setActionEnCours] = useState('');

  const charger = useCallback(async () => {
    if (!id) return;
    // Fiche ouverte par lien direct ou après un rechargement : on relit la
    // clé de l'équipe sur l'appareil.
    const enregistree = await lireStockage(CLE_STOCKAGE);
    if (enregistree) definirCleEquipe(enregistree);
    try {
      const [laFiche, lesStats, lesCourses] = await Promise.all([
        api.obtenirChauffeur(id, true),
        api.statsChauffeur(id, true).catch(() => null),
        api.listerCoursesChauffeur(id, true).catch(() => []),
      ]);
      setChauffeur(laFiche);
      setStats(lesStats);
      setCourses(lesCourses);
      setErreur('');
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('taxi_fiche_introuvable'));
    } finally {
      setCharge(false);
    }
  }, [id, t]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const enregistrerDates = async () => {
    setErreur('');
    setMessage('');
    const permis = datePermis.trim();
    const assurance = dateAssurance.trim();
    const formatOk = (v: string) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (!formatOk(permis) || !formatOk(assurance) || (permis === '' && assurance === '')) {
      setErreur(t('equipe_docs_format'));
      return;
    }
    setActionEnCours('dates');
    try {
      await api.majDocumentsChauffeur(id, {
        licenseExpiresOn: permis || undefined,
        insuranceExpiresOn: assurance || undefined,
      });
      setDatePermis('');
      setDateAssurance('');
      setMessage(t('taxi_fiche_dates_ok'));
      await charger();
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('equipe_action_erreur'));
    } finally {
      setActionEnCours('');
    }
  };

  const changerMotDePasse = async () => {
    setErreur('');
    setMessage('');
    if (nouveauMdp.length < 8) {
      setErreur(t('tel_erreur_mdp'));
      return;
    }
    setActionEnCours('mdp');
    try {
      await api.definirMotDePasseChauffeur(id, nouveauMdp);
      setMessage(t('taxi_fiche_mdp_ok', { mdp: nouveauMdp }));
      setNouveauMdp('');
      await charger();
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('equipe_action_erreur'));
    } finally {
      setActionEnCours('');
    }
  };

  const radier = async () => {
    setErreur('');
    setActionEnCours('radiation');
    try {
      await api.radierDefinitivement(id);
      router.replace('/equipe');
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('equipe_action_erreur'));
      setActionEnCours('');
    }
  };

  if (charge) return <ChargementCentre />;
  if (!chauffeur) {
    return (
      <Ecran fond="vagues">
        <Carte>
          <Titre>{t('taxi_fiche_introuvable')}</Titre>
          <TexteErreur>{erreur}</TexteErreur>
        </Carte>
      </Ecran>
    );
  }

  const nom = String(champ(chauffeur, 'full_name', 'fullName') ?? '?');
  const telephone = String(champ(chauffeur, 'phone') ?? '');
  const statut = String(champ(chauffeur, 'verification_status', 'verificationStatus') ?? 'pending');
  const radie = !!champ(chauffeur, 'archived_at', 'archivedAt');
  const aUnMotDePasse = !!champ(chauffeur, 'has_password', 'hasPassword');
  const expPermis = champ<string>(chauffeur, 'license_expires_on', 'licenseExpiresOn');
  const expAssurance = champ<string>(chauffeur, 'insurance_expires_on', 'insuranceExpiresOn');
  const lat = Number(champ(chauffeur, 'last_lat') ?? NaN);
  const lng = Number(champ(chauffeur, 'last_lng') ?? NaN);
  const positionConnue = Number.isFinite(lat) && Number.isFinite(lng);

  // Les quatre pièces du dossier, dans l'ordre où l'équipe les contrôle.
  const PIECES: { cle: string; titre: string; url: string }[] = [
    { cle: 'permis', titre: t('pro_doc_permis'), url: String(champ(chauffeur, 'license_document_url', 'licenseDocumentUrl') ?? '') },
    { cle: 'assurance', titre: t('pro_doc_assurance'), url: String(champ(chauffeur, 'insurance_document_url', 'insuranceDocumentUrl') ?? '') },
    { cle: 'vehicule', titre: t('pro_doc_vehicule'), url: String(champ(chauffeur, 'vehicle_photo_url', 'vehiclePhotoUrl') ?? '') },
    { cle: 'identite', titre: t('taxi_fiche_piece_identite'), url: String(champ(chauffeur, 'id_document_url', 'idDocumentUrl') ?? '') },
  ].filter((piece) => !!piece.url);

  // Gains NETS (commission déduite) d'une fenêtre, toutes devises réunies,
  // avec le nombre de courses et de colis.
  const gainsFenetre = (fenetre: 'today' | 'week' | 'month') => {
    const bloc = stats?.[fenetre];
    if (!bloc) return '—';
    const montants = Object.entries(bloc.gains ?? {})
      .filter(([, montant]) => Number(montant) > 0)
      .map(([devise, montant]) => formaterMontant(Number(montant), devise as 'USD' | 'TZS'));
    const argent = montants.length ? montants.join(' · ') : formaterMontant(0, 'USD');
    return `${argent}  (${bloc.courses} 🚕 · ${bloc.colis} 📦)`;
  };

  return (
    <Ecran fond="vagues">
      <VisionneuseDocument
        url={documentOuvert?.url ?? null}
        titre={documentOuvert?.titre ?? ''}
        onFermer={() => setDocumentOuvert(null)}
      />

      {/* --- Identité --- */}
      <Carte>
        <View style={styles.enTete}>
          <Text style={styles.nom}>{nom}</Text>
          <Badge
            texte={
              radie
                ? t('taxi_fiche_statut_radie')
                : statut === 'verified'
                  ? t('hotel_fiche_statut_verifie')
                  : statut === 'rejected'
                    ? t('hotel_fiche_statut_refuse')
                    : t('hotel_fiche_statut_attente')
            }
            ton={radie || statut === 'rejected' ? 'danger' : statut === 'verified' ? 'succes' : 'attente'}
          />
        </View>
        <LigneInfo label={t('hotel_fiche_telephone')} valeur={telephone || '—'} />
        <LigneInfo label={t('hotel_fiche_zone')} valeur={String(champ(chauffeur, 'zone') ?? '—')} />
        <LigneInfo
          label={t('taxi_fiche_note')}
          valeur={
            champ(chauffeur, 'rating_avg', 'ratingAvg')
              ? `${Number(champ(chauffeur, 'rating_avg', 'ratingAvg')).toFixed(1)} ★ (${String(champ(chauffeur, 'rating_count', 'ratingCount') ?? 0)})`
              : '—'
          }
        />
        <LigneInfo
          label={t('hotel_fiche_inscrit_le')}
          valeur={formaterDate(champ<string>(chauffeur, 'created_at', 'createdAt')) || '—'}
        />
        {!!telephone && !radie && (
          <Bouton
            titre={`WhatsApp · ${telephone}`}
            icone="logo-whatsapp"
            variante="secondaire"
            onPress={() => Linking.openURL(`https://wa.me/${telephone.replace(/[^\d]/g, '')}`)}
          />
        )}
      </Carte>

      {/* --- Le véhicule --- */}
      <Carte>
        <Text style={styles.titreBloc}>{t('taxi_fiche_vehicule')}</Text>
        <LigneInfo
          label={t('taxi_fiche_plaque')}
          valeur={String(champ(chauffeur, 'vehicle_plate', 'vehiclePlate') ?? '—')}
        />
        <LigneInfo
          label={t('taxi_fiche_modele')}
          valeur={String(champ(chauffeur, 'vehicle_model', 'vehicleModel') ?? '—')}
        />
        <LigneInfo
          label={t('taxi_fiche_permis_numero')}
          valeur={String(champ(chauffeur, 'license_number', 'licenseNumber') ?? '—')}
        />
        <LigneInfo
          label={t('taxi_fiche_qr')}
          valeur={String(champ(chauffeur, 'vehicle_qr_code', 'vehicleQrCode') ?? '—')}
        />
        {positionConnue ? (
          <CartePosition lat={lat} lng={lng} titre={t('equipe_position')} marqueur="voiture" />
        ) : (
          <Text style={styles.detail}>{t('equipe_position_inconnue')}</Text>
        )}
      </Carte>

      {/* --- Les pièces jointes déposées, ouvrables dans l'app --- */}
      <Carte>
        <Text style={styles.titreBloc}>
          {t('taxi_fiche_pieces')} ({PIECES.length})
        </Text>
        {PIECES.length === 0 ? (
          <Text style={styles.detail}>{t('taxi_fiche_aucune_piece')}</Text>
        ) : (
          PIECES.map((piece) => (
            <Pressable
              key={piece.cle}
              onPress={() => setDocumentOuvert({ url: piece.url, titre: piece.titre })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.lignePiece, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="document-text-outline" size={20} color={couleurs.primaireFonce} />
              <Text style={styles.nomPiece}>{piece.titre}</Text>
              <Ionicons name="chevron-forward" size={18} color={couleurs.primaire} />
            </Pressable>
          ))
        )}

        <Text style={styles.sousTitreBloc}>{t('taxi_fiche_expirations')}</Text>
        <LigneInfo
          label={t('equipe_docs_permis')}
          valeur={expPermis ? String(expPermis).slice(0, 10) : '—'}
        />
        <LigneInfo
          label={t('equipe_docs_assurance')}
          valeur={expAssurance ? String(expAssurance).slice(0, 10) : '—'}
        />
        <Champ
          label={`${t('equipe_docs_permis')} (AAAA-MM-JJ)`}
          value={datePermis}
          onChangeText={setDatePermis}
          placeholder="2026-12-31"
        />
        <Champ
          label={`${t('equipe_docs_assurance')} (AAAA-MM-JJ)`}
          value={dateAssurance}
          onChangeText={setDateAssurance}
          placeholder="2026-12-31"
        />
        <Bouton
          titre={t('equipe_docs_enregistrer')}
          icone="save-outline"
          variante="secondaire"
          onPress={enregistrerDates}
          charge={actionEnCours === 'dates'}
        />
      </Carte>

      {/* --- Mot de passe : remplaçable, jamais lisible --- */}
      <Carte>
        <Text style={styles.titreBloc}>{t('taxi_fiche_mdp_titre')}</Text>
        <EncartInfo icone="lock-closed-outline">
          {aUnMotDePasse ? t('taxi_fiche_mdp_explication') : t('taxi_fiche_mdp_absent')}
        </EncartInfo>
        <Champ
          label={t('taxi_fiche_mdp_nouveau')}
          value={nouveauMdp}
          onChangeText={setNouveauMdp}
          autoCapitalize="none"
          placeholder="ZanziGo2026"
        />
        <Bouton
          titre={t('taxi_fiche_mdp_bouton')}
          icone="key-outline"
          variante="secondaire"
          onPress={changerMotDePasse}
          charge={actionEnCours === 'mdp'}
        />
      </Carte>

      {/* --- Ce qu'il a fait --- */}
      <Carte>
        <Text style={styles.titreBloc}>{t('taxi_fiche_gains')}</Text>
        <LigneInfo label={t('taxi_fiche_gains_jour')} valeur={gainsFenetre('today')} />
        <LigneInfo label={t('taxi_fiche_gains_semaine')} valeur={gainsFenetre('week')} />
        <LigneInfo label={t('taxi_fiche_gains_mois')} valeur={gainsFenetre('month')} />

        <Text style={styles.sousTitreBloc}>
          {t('taxi_fiche_courses')} ({courses.length})
        </Text>
        {courses.length === 0 ? (
          <Text style={styles.detail}>{t('taxi_fiche_aucune_course')}</Text>
        ) : (
          courses.slice(0, MAX_COURSES).map((course) => (
            <View key={course.id} style={styles.ligneCourse}>
              <View style={styles.texteCourse}>
                <Text style={styles.itineraire}>
                  {String(champ(course, 'pickup_location', 'pickupLocation') ?? '?')} →{' '}
                  {String(champ(course, 'dropoff_location', 'dropoffLocation') ?? '?')}
                </Text>
                <Text style={styles.detail}>
                  {formaterDate(champ<string>(course, 'scheduled_at', 'scheduledAt')) ||
                    formaterDate(champ<string>(course, 'created_at', 'createdAt'))}
                </Text>
              </View>
              <BadgeStatutTrajet statut={course.status} />
            </View>
          ))
        )}
      </Carte>

      {!!message && (
        <Carte>
          <View style={styles.ligneOk}>
            <Ionicons name="checkmark-circle" size={20} color={couleurs.succes} />
            <Text style={styles.messageOk}>{message}</Text>
          </View>
        </Carte>
      )}
      <TexteErreur>{erreur}</TexteErreur>

      {/* --- Radiation définitive --- */}
      {!radie && (
        <Carte>
          <Text style={styles.titreBloc}>{t('taxi_fiche_radiation_titre')}</Text>
          <EncartInfo icone="warning-outline" ton="attente">
            {t('taxi_fiche_radiation_explication')}
          </EncartInfo>
          {confirmeRadiation ? (
            <>
              <Text style={styles.confirmation}>
                {t('taxi_fiche_radiation_confirme', { nom })}
              </Text>
              <Bouton
                titre={t('taxi_fiche_radiation_oui')}
                icone="close-circle-outline"
                variante="danger"
                onPress={radier}
                charge={actionEnCours === 'radiation'}
              />
              <Bouton
                titre={t('commun_annuler')}
                variante="secondaire"
                onPress={() => setConfirmeRadiation(false)}
              />
            </>
          ) : (
            <Bouton
              titre={t('taxi_fiche_radiation_bouton')}
              icone="close-circle-outline"
              variante="danger"
              onPress={() => setConfirmeRadiation(true)}
            />
          )}
        </Carte>
      )}
      {radie && (
        <Carte>
          <EncartInfo icone="information-circle-outline">
            {t('taxi_fiche_radie_explication')}
          </EncartInfo>
        </Carte>
      )}
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
  lignePiece: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.bouton,
    paddingVertical: espaces.s,
    paddingHorizontal: espaces.m,
    backgroundColor: couleurs.surface,
  },
  nomPiece: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '700',
    color: couleurs.encre,
  },
  ligneCourse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    paddingTop: espaces.s,
  },
  texteCourse: {
    flex: 1,
    gap: 2,
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
  ligneOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.s,
  },
  messageOk: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: couleurs.succes,
  },
  confirmation: {
    fontSize: 14.5,
    fontWeight: '700',
    color: couleurs.danger,
    lineHeight: 20,
  },
}));
