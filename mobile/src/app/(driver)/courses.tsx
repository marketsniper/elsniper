// Mode chauffeur — mes courses.
// L'API MVP n'expose pas de liste des courses d'un chauffeur : l'équipe
// zanziGo notifie chaque chauffeur par WhatsApp avec la référence de la
// course. On ouvre donc une course par sa référence (GET /trips/:id, autorisé
// au chauffeur assigné) et on garde localement les courses récemment ouvertes.
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Bouton, Carte, Champ, Ecran, SousTitre, TexteErreur, Titre } from '@/components/ui';
import { api, ErreurApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ajouterCourseLocale, listerCoursesLocales } from '@/lib/colisLocal';
import { couleurs, espaces, rayons } from '@/lib/theme';
import {
  champ,
  formaterPrix,
  LIBELLES_STATUT_TRAJET,
  type StatutTrajet,
  type Trajet,
} from '@/lib/types';

export default function EcranCourses() {
  const router = useRouter();
  const { session } = useAuth();
  const [idSaisi, setIdSaisi] = useState('');
  const [recentes, setRecentes] = useState<Trajet[]>([]);
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  const chauffeurId = session?.driver?.id ?? null;

  const rafraichir = useCallback(async () => {
    if (!chauffeurId) return;
    const ids = await listerCoursesLocales(chauffeurId);
    const resultats = await Promise.all(
      ids.map((courseId) => api.obtenirTrajet(courseId).catch(() => null))
    );
    setRecentes(resultats.filter((t): t is Trajet => t !== null));
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
      setErreur('Référence de course invalide (collez la référence ou le lien WhatsApp reçu).');
      return;
    }
    setCharge(true);
    try {
      await api.obtenirTrajet(id); // vérifie l'accès (chauffeur assigné)
      if (chauffeurId) await ajouterCourseLocale(chauffeurId, id);
      setIdSaisi('');
      router.push(`/course/${id}`);
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : 'Course introuvable ou non assignée.');
    } finally {
      setCharge(false);
    }
  };

  return (
    <Ecran>
      <Carte>
        <Titre>Ouvrir une course</Titre>
        <SousTitre>
          Pas de liste automatique au lancement : l&apos;équipe zanziGo vous notifie chaque
          course assignée par WhatsApp, avec sa référence. Collez-la ici (ou ouvrez le lien
          reçu) pour afficher la fiche.
        </SousTitre>
        <Champ
          label="Référence de course"
          value={idSaisi}
          onChangeText={setIdSaisi}
          placeholder="ex. 6f9619ff-8b86-d011-b42d-00c04fc964ff"
          autoCapitalize="none"
        />
        <TexteErreur>{erreur}</TexteErreur>
        <Bouton titre="Ouvrir la course" onPress={ouvrir} charge={charge} />
      </Carte>

      <SousTitre>Courses récentes</SousTitre>
      {recentes.length === 0 && (
        <SousTitre>Aucune course ouverte récemment sur ce téléphone.</SousTitre>
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
              <Text style={styles.type}>Course</Text>
              <Badge
                texte={statut ? LIBELLES_STATUT_TRAJET[statut] ?? statut : '—'}
                ton={
                  statut === 'in_progress'
                    ? 'attente'
                    : statut === 'completed'
                      ? 'succes'
                      : 'primaire'
                }
              />
            </View>
            <Text style={styles.itineraire}>
              {champ(item, 'pickup_location', 'pickupLocation') ?? '?'} →{' '}
              {champ(item, 'dropoff_location', 'dropoffLocation') ?? '?'}
            </Text>
            <Text style={styles.prix}>{formaterPrix(item)}</Text>
          </Pressable>
        );
      })}
    </Ecran>
  );
}

const styles = StyleSheet.create({
  carte: {
    backgroundColor: couleurs.blanc,
    borderRadius: rayons.carte,
    padding: espaces.l,
    gap: espaces.s,
  },
  enTete: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espaces.m,
  },
  type: {
    fontSize: 16,
    fontWeight: '700',
    color: couleurs.encre,
  },
  itineraire: {
    fontSize: 14,
    color: couleurs.encre,
  },
  prix: {
    fontSize: 15,
    fontWeight: '700',
    color: couleurs.primaire,
  },
});
