// Mode chauffeur — mes courses.
// L'API MVP n'expose pas de liste des courses d'un chauffeur : l'équipe
// zanziGo notifie chaque chauffeur par WhatsApp avec la référence de la
// course. On ouvre donc une course par sa référence (GET /trips/:id, autorisé
// au chauffeur assigné) et on garde localement les courses récemment ouvertes.
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
import { ajouterCourseLocale, listerCoursesLocales } from '@/lib/colisLocal';
import { formaterDateRelativeI18n, useT } from '@/lib/i18n';
import { couleurs, espaces, ombres, rayons } from '@/lib/theme';
import { champ, formaterPrix, type StatutTrajet, type Trajet } from '@/lib/types';

export default function EcranCourses() {
  const router = useRouter();
  const { session } = useAuth();
  const { t } = useT();
  const [idSaisi, setIdSaisi] = useState('');
  const [recentes, setRecentes] = useState<Trajet[]>([]);
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

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
    const ids = await listerCoursesLocales(chauffeurId);
    const resultats = await Promise.all(
      ids.map((courseId) => api.obtenirTrajet(courseId).catch(() => null))
    );
    setRecentes(resultats.filter((trajet): trajet is Trajet => trajet !== null));
  }, [chauffeurId]);

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
      if (chauffeurId) await ajouterCourseLocale(chauffeurId, id);
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

      <Text style={styles.titreSection}>{t('courses_recentes')}</Text>
      {recentes.length === 0 && (
        <EtatVide
          icone="car-outline"
          titre={t('courses_vide_titre')}
          message={t('courses_vide_texte')}
        />
      )}
      {recentes.map((item) => {
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
