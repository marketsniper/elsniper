// Mode chauffeur — mes courses.
// La liste vient du serveur (GET /drivers/:id/trips) : dès que l'équipe
// assigne le chauffeur sur une course, elle apparaît ici au prochain
// rafraîchissement — plus besoin de la référence WhatsApp, qui reste
// utilisable en secours pour ouvrir une course directement.
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  BadgeStatutTrajet,
  Bouton,
  Carte,
  Champ,
  Ecran,
  EncartInfo,
  EtatVide,
  TexteErreur,
  Titre,
} from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formaterDateRelativeI18n, libelleTailleColis, useT } from '@/lib/i18n';
import { estBalaye, lireCoupDeBalai, passerCoupDeBalai } from '@/lib/menageLocal';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import { champ, formaterMontant, formaterPrix, type Colis, type StatutTrajet, type Trajet } from '@/lib/types';

export default function EcranCourses() {
  const router = useRouter();
  const { session } = useAuth();
  const { t } = useT();
  const [idSaisi, setIdSaisi] = useState('');
  const [recentes, setRecentes] = useState<Trajet[]>([]);
  // Bourse aux colis : colis payés en attente de ramassage (hôtels en tête).
  const [colisDispo, setColisDispo] = useState<Colis[]>([]);
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);
  const [balai, setBalai] = useState(0);

  const chauffeurId = session?.driver?.id ?? null;

  // Partage de position pendant les livraisons : tant qu'un écran chauffeur
  // est ouvert, la position part au serveur toutes les 45 s — c'est elle que
  // voit l'expéditeur d'un colis en route (« position du chauffeur »).
  const [partagePosition, setPartagePosition] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!chauffeurId) return undefined;
      let actif = true;
      let minuteur: ReturnType<typeof setInterval> | null = null;
      (async () => {
        try {
          const Location = await import('expo-location');
          const { granted } = await Location.requestForegroundPermissionsAsync();
          if (!granted || !actif) return;
          setPartagePosition(true);
          const envoyer = async () => {
            try {
              const pos = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
              await api.envoyerPositionChauffeur(
                chauffeurId,
                pos.coords.latitude,
                pos.coords.longitude
              );
            } catch {
              // silencieux : GPS coupé ou réseau absent, on réessaiera.
            }
          };
          envoyer();
          minuteur = setInterval(envoyer, 45000);
        } catch {
          // Module de localisation indisponible (ancienne version installée).
        }
      })();
      return () => {
        actif = false;
        if (minuteur) clearInterval(minuteur);
        setPartagePosition(false);
      };
    }, [chauffeurId])
  );

  const rafraichir = useCallback(async () => {
    if (!chauffeurId) return;
    try {
      setRecentes(await api.listerCoursesChauffeur(chauffeurId));
    } catch {
      // silencieux : hors-ligne, on garde la dernière liste affichée
    }
    try {
      setColisDispo(await api.listerColisARamasser());
    } catch {
      // silencieux : la section colis reste vide
    }
    setBalai(await lireCoupDeBalai('courses', chauffeurId));
  }, [chauffeurId]);

  // « Faire le ménage » : masque les courses terminées/annulées antérieures
  // au coup de balai (local au téléphone — les gains restent comptés).
  const estFinie = (trajet: Trajet) => {
    const statut = champ<StatutTrajet>(trajet, 'status', 'statut');
    return statut === 'completed' || statut === 'cancelled';
  };
  const coursesVisibles = recentes.filter(
    (trajet) =>
      !estFinie(trajet) || !estBalaye(champ(trajet, 'created_at', 'createdAt'), balai)
  );
  const nbNettoyables = coursesVisibles.filter(estFinie).length;

  const faireLeMenage = () => {
    if (!chauffeurId) return;
    Alert.alert(t('menage_titre'), t('menage_texte'), [
      { text: t('commun_annuler'), style: 'cancel' },
      {
        text: t('menage_confirmer'),
        style: 'destructive',
        onPress: async () => setBalai(await passerCoupDeBalai('courses', chauffeurId)),
      },
    ]);
  };

  useFocusEffect(
    useCallback(() => {
      rafraichir();
    }, [rafraichir])
  );

  const ouvrir = async () => {
    setErreur('');
    // Tolère un lien collé contenant la référence (on extrait l'UUID).
    const correspondance = idSaisi.match(
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/
    );
    const id = correspondance?.[0] ?? '';
    if (!id) {
      setErreur(t('courses_erreur_reference'));
      return;
    }
    setCharge(true);
    try {
      await api.obtenirTrajet(id); // vérifie l'accès (chauffeur assigné)
      setIdSaisi('');
      router.push(`/course/${id}`);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('courses_erreur_introuvable'));
    } finally {
      setCharge(false);
    }
  };

  return (
    <Ecran fond="vagues" onRefresh={rafraichir}>
      <EncartInfo icone="logo-whatsapp">{t('courses_info')}</EncartInfo>
      {partagePosition && (
        <EncartInfo icone="location-outline" ton="succes">
          {t('courses_position_active')}
        </EncartInfo>
      )}

      <Carte>
        <Titre>{t('courses_ouvrir_titre')}</Titre>
        <Champ
          label={t('courses_reference')}
          value={idSaisi}
          onChangeText={setIdSaisi}
          placeholder={t('courses_reference_placeholder')}
          autoCapitalize="none"
        />
        <TexteErreur>{erreur}</TexteErreur>
        <Bouton
          titre={t('courses_ouvrir_bouton')}
          icone="open-outline"
          onPress={ouvrir}
          charge={charge}
        />
        <Bouton
          titre={t('courses_scanner_bouton')}
          icone="qr-code-outline"
          variante="secondaire"
          onPress={() => router.push('/(driver)/scanner')}
        />
      </Carte>

      {/* Bourse aux colis : colis payés à ramasser (envois des hôtels en tête).
          Ramassage via l'onglet Scanner — le QR est sur le colis. */}
      <Text style={styles.titreSection}>
        {t('courses_colis_titre')} ({colisDispo.length})
      </Text>
      {colisDispo.length === 0 && (
        <EncartInfo icone="cube-outline">{t('courses_colis_vide')}</EncartInfo>
      )}
      {colisDispo.map((colis) => {
        const nomHotel = champ<string>(colis, 'sender_hotel_name');
        const nomClient = champ<string>(colis, 'sender_user_name');
        const prix = Number(champ(colis, 'price') ?? NaN);
        const commission = Number(champ(colis, 'commission') ?? NaN);
        const devise = String(champ(colis, 'currency') ?? '');
        const net =
          Number.isFinite(prix) && Number.isFinite(commission)
            ? Math.round((prix - commission) * 100) / 100
            : null;
        return (
          <View key={colis.id} style={styles.carte}>
            <View style={styles.enTete}>
              <Text style={styles.type}>
                {nomHotel
                  ? `🏨 ${nomHotel}`
                  : `${t('courses_colis_client')}${nomClient ? ` · ${nomClient}` : ''}`}
              </Text>
              <Text style={styles.type}>
                {libelleTailleColis(champ(colis, 'size'), t)}
              </Text>
            </View>
            <Text style={styles.itineraire}>
              {champ(colis, 'pickup_location', 'pickupLocation') ?? '?'}{'  '}
              <Text style={styles.fleche}>→</Text>{'  '}
              {champ(colis, 'dropoff_location', 'dropoffLocation') ?? '?'}
            </Text>
            <View style={styles.pied}>
              <Text style={styles.date}>
                {formaterDateRelativeI18n(champ(colis, 'created_at', 'createdAt'), t)}
              </Text>
              {net !== null && (
                <Text style={styles.prix}>
                  {t('gain_net')} : {formaterMontant(net, devise)}
                </Text>
              )}
            </View>
            <Bouton
              titre={t('courses_colis_scanner')}
              icone="qr-code-outline"
              variante="secondaire"
              onPress={() => router.push('/(driver)/scanner')}
            />
          </View>
        );
      })}

      <Text style={styles.titreSection}>{t('courses_recentes')}</Text>
      {coursesVisibles.length === 0 && (
        <EtatVide
          icone="car-outline"
          titre={t('courses_vide_titre')}
          message={t('courses_vide_texte')}
        />
      )}
      {coursesVisibles.map((item) => {
        const statut = champ<StatutTrajet>(item, 'status', 'statut');
        return (
          <Pressable
            key={item.id}
            onPress={() => router.push(`/course/${item.id}`)}
            style={({ pressed }) => [styles.carte, pressed && { opacity: 0.7 }]}
          >
            <View style={styles.enTete}>
              <Text style={styles.type}>{t('trajets_course_defaut')}</Text>
              <BadgeStatutTrajet statut={statut} />
            </View>
            <Text style={styles.itineraire}>
              {champ(item, 'pickup_location', 'pickupLocation') ?? '?'}{'  '}
              <Text style={styles.fleche}>→</Text>{'  '}
              {champ(item, 'dropoff_location', 'dropoffLocation') ?? '?'}
            </Text>
            <View style={styles.pied}>
              <Text style={styles.date}>
                {formaterDateRelativeI18n(
                  champ(item, 'scheduled_at', 'scheduledAt', 'created_at', 'createdAt'),
                  t
                )}
              </Text>
              <Text style={styles.prix}>{formaterPrix(item)}</Text>
            </View>
          </Pressable>
        );
      })}

      {nbNettoyables > 0 && (
        <Bouton
          titre={`${t('menage_bouton')} (${nbNettoyables})`}
          icone="trash-outline"
          variante="secondaire"
          onPress={faireLeMenage}
        />
      )}
    </Ecran>
  );
}

const styles = StyleSheet.create({
  titreSection: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.encre,
    marginTop: espaces.s,
  },
  carte: {
    backgroundColor: couleurs.carteTranslucide,
    borderRadius: rayons.carte,
    padding: espaces.l,
    gap: espaces.s,
    ...ombres.carte,
  },
  enTete: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  type: {
    fontSize: 13,
    fontWeight: '600',
    color: couleurs.texteSecondaire,
  },
  itineraire: {
    fontSize: 16,
    fontWeight: '700',
    color: couleurs.encre,
    lineHeight: 22,
  },
  fleche: {
    color: couleurs.primaire,
    fontWeight: '800',
  },
  pied: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    fontSize: 13,
    color: couleurs.texteSecondaire,
  },
  prix: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.primaire,
  },
});
