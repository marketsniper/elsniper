// LA FILE DE VÉRIFICATION — les dossiers en attente, un par un.
//
// Pourquoi cet écran existe. Valider un chauffeur demandait d'ouvrir la
// rubrique candidatures, choisir une fiche, ouvrir chaque document l'un après
// l'autre, revenir, recommencer. Multiplié par trois familles de dossiers
// (chauffeurs, clients à carte NIDA, hôtels), c'est la corvée qui traîne —
// et un chauffeur qui attend trois jours sa validation va voir ailleurs.
//
// Ici : le dossier le plus ancien s'affiche seul, ses pièces EN GRAND et déjà
// chargées, les informations à confronter juste à côté, et deux boutons. Une
// décision, et le suivant apparaît tout seul. Quelques secondes par dossier.
//
// Le doute a sa place : « Plus tard » renvoie le dossier en fin de file sans
// rien décider. Mieux vaut repousser que valider un permis qu'on n'a pas su
// lire.
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';

import { VisionneuseDocument } from '@/components/VisionneuseDocument';
import {
  Badge,
  Bouton,
  Carte,
  ChargementCentre,
  Ecran,
  EncartInfo,
  LigneInfo,
  TexteErreur,
} from '@/components/ui';
import { api, definirCleEquipe, ErreurApi, type DossierVerification } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { lireStockage } from '@/lib/stockage';
import { couleurs, espaces, rayons, stylesReactifs } from '@/lib/theme';
import { formaterDate } from '@/lib/types';

const CLE_STOCKAGE = 'zanzigo.cle_equipe';

export default function EcranVerifications() {
  const router = useRouter();
  const { t } = useT();
  const [dossiers, setDossiers] = useState<DossierVerification[]>([]);
  const [traites, setTraites] = useState(0);
  const [charge, setCharge] = useState(true);
  const [action, setAction] = useState<'verified' | 'rejected' | null>(null);
  const [erreur, setErreur] = useState('');
  const [documentOuvert, setDocumentOuvert] = useState<{ url: string; titre: string } | null>(null);

  const charger = useCallback(async () => {
    try {
      const enregistree = await lireStockage(CLE_STOCKAGE);
      if (enregistree) definirCleEquipe(enregistree);
      const file = await api.fileVerification();
      setDossiers(file.dossiers);
      setErreur('');
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('verif_erreur'));
    } finally {
      setCharge(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  const dossier = dossiers[0] ?? null;

  // Une décision : on appelle la route de la bonne famille, puis le dossier
  // quitte la file et le suivant s'affiche. Rien à recharger.
  const decider = async (statut: 'verified' | 'rejected') => {
    if (!dossier) return;
    setAction(statut);
    setErreur('');
    try {
      if (dossier.type === 'chauffeur') await api.verifierChauffeur(dossier.id, statut);
      else if (dossier.type === 'client') await api.verifierClient(dossier.id, statut);
      else await api.verifierHotel(dossier.id, statut);
      setDossiers((liste) => liste.slice(1));
      setTraites((n) => n + 1);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('verif_erreur'));
    } finally {
      setAction(null);
    }
  };

  // Le doute : le dossier repart en fin de file, aucune décision prise.
  const plusTard = () => {
    setDossiers((liste) => (liste.length > 1 ? [...liste.slice(1), liste[0]] : liste));
  };

  if (charge) return <ChargementCentre message={t('verif_chargement')} />;

  const retour = (
    <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      style={({ pressed }) => [styles.retour, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name="chevron-back" size={18} color={couleurs.primaireFonce} />
      <Text style={styles.texteRetour}>{t('equipe_retour_menu')}</Text>
    </Pressable>
  );

  // File vide : c'est une bonne nouvelle, elle se dit comme telle.
  if (!dossier) {
    return (
      <Ecran fond="vagues">
        {retour}
        <TexteErreur>{erreur}</TexteErreur>
        <EncartInfo icone="checkmark-circle-outline" ton="succes">
          {traites > 0 ? t('verif_termine', { n: traites }) : t('verif_rien')}
        </EncartInfo>
        <Bouton
          titre={t('commun_retour_accueil')}
          icone="arrow-back-outline"
          variante="secondaire"
          onPress={() => router.back()}
        />
      </Ecran>
    );
  }

  const libelleType =
    dossier.type === 'chauffeur'
      ? t('verif_type_chauffeur')
      : dossier.type === 'client'
        ? t('verif_type_client')
        : t('verif_type_hotel');

  // Le temps d'attente en clair : c'est lui qui dit l'urgence.
  const attente =
    dossier.heures_attente < 1
      ? t('verif_attente_minutes')
      : dossier.heures_attente < 48
        ? t('verif_attente_heures', { n: dossier.heures_attente })
        : t('verif_attente_jours', { n: Math.round(dossier.heures_attente / 24) });
  const urgent = dossier.heures_attente >= 48;

  return (
    <Ecran fond="vagues" onRefresh={charger}>
      {/* Le document en plein écran, sans jamais quitter l'application. */}
      <VisionneuseDocument
        url={documentOuvert?.url ?? null}
        titre={documentOuvert?.titre ?? ''}
        onFermer={() => setDocumentOuvert(null)}
      />
      {/* Le titre est déjà dans l'en-tête de l'écran : ici, seul le compteur
          de dossiers restants — c'est lui qu'on regarde entre deux décisions. */}
      <View style={styles.enTete}>
        {retour}
        <Badge texte={t('verif_reste', { n: dossiers.length })} ton={urgent ? 'danger' : 'attente'} />
      </View>
      <TexteErreur>{erreur}</TexteErreur>

      <Carte>
        <View style={styles.enTeteDossier}>
          <Text style={styles.nom}>{dossier.nom}</Text>
          <Badge texte={libelleType} ton="primaire" />
        </View>
        <Text style={[styles.attente, urgent && styles.attenteUrgente]}>
          ⏳ {attente} · {formaterDate(dossier.depuis)}
        </Text>
        {dossier.infos.map((info) => (
          <LigneInfo key={info.label} label={info.label} valeur={info.valeur} />
        ))}
        {!!dossier.contact && (
          <Bouton
            titre={`WhatsApp · ${dossier.contact}`}
            icone="logo-whatsapp"
            variante="secondaire"
            onPress={() =>
              Linking.openURL(`https://wa.me/${String(dossier.contact).replace(/[^0-9]/g, '')}`)
            }
          />
        )}
      </Carte>

      {/* LES PIÈCES, EN GRAND. Elles s'affichent directement : l'équipe voit
          le permis sans un seul geste, et peut l'agrandir d'un appui si un
          détail lui échappe. */}
      {dossier.documents.map((doc) => (
        <Carte key={doc.url + doc.libelle}>
          <Text style={styles.libellePiece}>{doc.libelle}</Text>
          <Pressable
            onPress={() => setDocumentOuvert({ url: doc.url, titre: doc.libelle })}
            accessibilityRole="button"
            accessibilityLabel={doc.libelle}
            style={({ pressed }) => [styles.cadrePiece, pressed && { opacity: 0.85 }]}
          >
            <Image source={{ uri: doc.url }} style={styles.piece} resizeMode="contain" />
          </Pressable>
          <Text style={styles.astucePiece}>{t('verif_agrandir')}</Text>
        </Carte>
      ))}

      {dossier.verification_par_telephone && (
        <EncartInfo icone="call-outline" ton="attente">
          {t('verif_hotel_telephone')}
        </EncartInfo>
      )}

      <Bouton
        titre={t('verif_valider')}
        icone="checkmark-circle-outline"
        onPress={() => decider('verified')}
        charge={action === 'verified'}
        desactive={action !== null}
      />
      <Bouton
        titre={t('verif_refuser')}
        icone="close-circle-outline"
        variante="danger"
        onPress={() => decider('rejected')}
        charge={action === 'rejected'}
        desactive={action !== null}
      />
      {dossiers.length > 1 && (
        <Bouton
          titre={t('verif_plus_tard')}
          icone="time-outline"
          variante="secondaire"
          onPress={plusTard}
          desactive={action !== null}
        />
      )}
    </Ecran>
  );
}

const styles = stylesReactifs(() => ({
  retour: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs,
    marginBottom: espaces.s,
  },
  texteRetour: { color: couleurs.primaireFonce, fontWeight: '700' },
  enTete: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  enTeteDossier: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
    marginBottom: espaces.xs,
  },
  nom: { fontSize: 18, fontWeight: '800', color: couleurs.encre, flexShrink: 1 },
  attente: { color: couleurs.texteSecondaire, marginBottom: espaces.s },
  attenteUrgente: { color: couleurs.danger, fontWeight: '700' },
  libellePiece: { fontWeight: '700', color: couleurs.encre, marginBottom: espaces.xs },
  cadrePiece: {
    backgroundColor: couleurs.sable,
    borderRadius: rayons.carte,
    overflow: 'hidden',
  },
  // Hauteur généreuse : un permis illisible ne se vérifie pas.
  piece: { width: '100%', height: 260 },
  astucePiece: {
    color: couleurs.texteSecondaire,
    fontSize: 12,
    marginTop: espaces.xs,
    textAlign: 'center',
  },
}));
