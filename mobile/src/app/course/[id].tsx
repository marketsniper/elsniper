// Mode chauffeur — détail d'une course assignée.
// Démarrage quand la course est « paid », clôture quand « in_progress » :
// une simple touche (avec confirmation), pas de QR à scanner. La position
// GPS déjà partagée en continu (courses.tsx, toutes les 45 s) reste la
// preuve de terrain — elle ne dépend pas de ce départ/arrivée.
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text } from 'react-native';

import { CartePosition } from '@/components/CartePosition';
import { TimelineStatut } from '@/components/TimelineStatut';
import {
  BadgeStatutTrajet,
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
import { libelleStatutTrajet, libelleTypeTrajet, useT } from '@/lib/i18n';
import { couleurs, espaces } from '@/lib/theme';
import {
  champ,
  ETAPES_TRAJET,
  formaterDate,
  formaterMontant,
  formaterPrix,
  type StatutTrajet,
  type Trajet,
  type TypeTrajet,
} from '@/lib/types';

export default function EcranDetailCourse() {
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [course, setCourse] = useState<Trajet | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargeAction, setChargeAction] = useState(false);

  const charger = useCallback(async () => {
    if (!id) return;
    try {
      setCourse(await api.obtenirTrajet(id));
      setErreur('');
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('courses_erreur_introuvable'));
    }
  }, [id, t]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (!course) {
    return erreur ? (
      <Ecran fond="vagues">
        <TexteErreur>{erreur}</TexteErreur>
      </Ecran>
    ) : (
      <ChargementCentre message={t('course_chargement')} />
    );
  }

  const statut = champ<StatutTrajet>(course, 'status', 'statut');
  const typeTrajet = champ<TypeTrajet>(course, 'trip_type', 'tripType');
  const nomClient = champ<string>(course, 'client_name', 'clientName');
  const telClient = champ<string>(course, 'client_phone', 'clientPhone');
  // Le serveur dit lui-même si les coordonnées sont ouvertes : elles ne le
  // sont qu'une fois le paiement validé par l'équipe. (Les anciennes versions
  // de l'API n'envoient pas ce drapeau — on se rabat alors sur le statut.)
  const contactOuvert = champ<boolean>(course, 'contact_client_visible');
  const contactVerrouille =
    contactOuvert === undefined
      ? statut === 'requested' || statut === 'driver_confirmed'
      : contactOuvert === false;
  // Règles serveur : départ uniquement sur une course payée, arrivée sur une
  // course en cours.
  const peutDemarrer = statut === 'paid';
  const peutTerminer = statut === 'in_progress';

  const lancerAction = async (action: 'start' | 'complete') => {
    setChargeAction(true);
    setErreur('');
    try {
      if (action === 'start') {
        await api.demarrerCourse(course.id);
      } else {
        await api.terminerCourse(course.id);
      }
      await charger();
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : t('course_erreur_action'));
    } finally {
      setChargeAction(false);
    }
  };

  const confirmerAction = (action: 'start' | 'complete') => {
    const titre = action === 'start' ? t('course_demarrer_titre') : t('course_terminer_titre');
    const texte = action === 'start' ? t('course_demarrer_confirm') : t('course_terminer_confirm');
    // Boutons SANS ambiguïté : « Oui, démarrer » / « Oui, terminer » —
    // jamais le « Oui, annuler » des dialogues d'annulation.
    Alert.alert(titre, texte, [
      { text: t('commun_pas_encore'), style: 'cancel' },
      {
        text: action === 'start' ? t('course_demarrer_oui') : t('course_terminer_oui'),
        onPress: () => lancerAction(action),
      },
    ]);
  };

  return (
    <Ecran fond="vagues" onRefresh={charger}>
      <Carte>
        <Titre>{t('titre_course')}</Titre>
        <BadgeStatutTrajet statut={statut} />
        {typeTrajet && (
          <LigneInfo label={t('commun_type')} valeur={libelleTypeTrajet(typeTrajet, t)} />
        )}
        <LigneInfo
          label={t('commun_depart')}
          valeur={String(champ(course, 'pickup_location', 'pickupLocation') ?? '—')}
        />
        <LigneInfo
          label={t('commun_arrivee')}
          valeur={String(champ(course, 'dropoff_location', 'dropoffLocation') ?? '—')}
        />
        {!!champ(course, 'scheduled_at', 'scheduledAt') && (
          <LigneInfo
            label={t('trip_programme_le')}
            valeur={formaterDate(champ(course, 'scheduled_at', 'scheduledAt'))}
          />
        )}
        <LigneInfo label={t('commun_prix')} valeur={formaterPrix(course)} />
        {(() => {
          // Transparence chauffeur : commission zanziGo et gain net.
          const prix = Number(champ(course, 'price') ?? NaN);
          const commission = Number(champ(course, 'commission') ?? NaN);
          const devise = String(champ(course, 'currency') ?? '');
          if (!Number.isFinite(prix) || !Number.isFinite(commission)) return null;
          return (
            <>
              <LigneInfo
                label={t('gain_commission')}
                valeur={`− ${formaterMontant(commission, devise)}`}
              />
              <LigneInfo
                label={t('gain_net')}
                valeur={formaterMontant(Math.round((prix - commission) * 100) / 100, devise)}
              />
            </>
          );
        })()}
      </Carte>

      {/* VOTRE CLIENT — qui appeler, et devant quelle porte se présenter.
          Ces informations appartiennent au client : le serveur ne les livre
          qu'une fois le paiement validé par l'équipe. Avant, on l'annonce
          clairement plutôt que d'afficher un vide inquiétant. */}
      <Carte>
        <SousTitre>{t('course_client_titre')}</SousTitre>
        {contactVerrouille ? (
          <EncartInfo icone="lock-closed-outline" ton="attente">
            {t('course_client_verrouille', {
              lieu: String(champ(course, 'pickup_location', 'pickupLocation') ?? '—'),
            })}
          </EncartInfo>
        ) : (
          <>
            {!!nomClient && <LigneInfo label={t('commun_client')} valeur={String(nomClient)} />}
            {/* Le numéro se touche : un appui, ça appelle. */}
            {!!telClient && (
              <Pressable
                onPress={() => Linking.openURL(`tel:${telClient}`)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.ligneAppel, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.texteAppel}>📞 {t('course_client_appeler')} · {telClient}</Text>
              </Pressable>
            )}
            {(() => {
              const lat = Number(champ(course, 'pickup_lat') ?? NaN);
              const lng = Number(champ(course, 'pickup_lng') ?? NaN);
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                return (
                  <EncartInfo icone="location-outline" ton="attente">
                    {t('course_client_position_absente', {
                      lieu: String(champ(course, 'pickup_location', 'pickupLocation') ?? '—'),
                    })}
                  </EncartInfo>
                );
              }
              return (
                <CartePosition
                  lat={lat}
                  lng={lng}
                  navigation
                  titre={String(champ(course, 'pickup_location', 'pickupLocation') ?? '')}
                  hauteur={220}
                />
              );
            })()}
          </>
        )}
      </Carte>

      <Carte>
        <SousTitre>{t('course_progression')}</SousTitre>
        <TimelineStatut
          etapes={ETAPES_TRAJET.map((cle) => ({ cle, label: libelleStatutTrajet(cle, t) }))}
          statutCourant={statut}
          annule={statut === 'cancelled'}
        />
      </Carte>

      {/* FEU VERT — AVANT le bouton : on annonce la bonne nouvelle, puis on
          propose l'action. C'est le signal que le chauffeur attend, et le
          moment exact où les coordonnées du client s'ouvrent au-dessus. */}
      {statut === 'paid' && (
        <EncartInfo icone="checkmark-circle" ton="feuVert">
          {t('course_feu_vert')}
        </EncartInfo>
      )}
      {peutDemarrer && (
        <Bouton
          titre={t('course_demarrer_bouton')}
          icone="play-circle-outline"
          onPress={() => confirmerAction('start')}
          charge={chargeAction}
        />
      )}
      {peutTerminer && (
        <Bouton
          titre={t('course_terminer_bouton')}
          icone="flag-outline"
          onPress={() => confirmerAction('complete')}
          charge={chargeAction}
        />
      )}
      {statut === 'requested' && (
        <EncartInfo icone="time-outline" ton="attente">
          {t('course_demandee')}
        </EncartInfo>
      )}
      {statut === 'driver_confirmed' && (
        <EncartInfo icone="card-outline" ton="attente">
          {t('course_attente_paiement')}
        </EncartInfo>
      )}

      <TexteErreur>{erreur}</TexteErreur>
      <Bouton
        titre={t('commun_actualiser')}
        icone="refresh-outline"
        variante="secondaire"
        onPress={charger}
      />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  // Le numéro du client se touche pour appeler : cible large, texte lisible
  // au volant.
  ligneAppel: {
    paddingVertical: espaces.s,
  },
  texteAppel: {
    fontSize: 16,
    fontWeight: '800',
    color: couleurs.primaireFonce,
  },
});
