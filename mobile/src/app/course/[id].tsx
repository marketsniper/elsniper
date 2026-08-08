// Mode chauffeur — détail d'une course assignée.
// Démarrage quand la course est « paid », clôture quand « in_progress » :
// dans les deux cas le serveur vérifie que le QR envoyé est bien celui du
// véhicule du chauffeur assigné (403 qr_mismatch sinon). Le chauffeur peut
// scanner le QR affiché dans son véhicule, ou utiliser directement son QR
// (driver.vehicle_qr_code de la session).
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';

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
import { useAuth } from '@/lib/auth';
import { libelleStatutTrajet, libelleTypeTrajet, useT } from '@/lib/i18n';
import {
  champ,
  ETAPES_TRAJET,
  formaterDate,
  formaterPrix,
  type StatutTrajet,
  type Trajet,
  type TypeTrajet,
} from '@/lib/types';

export default function EcranDetailCourse() {
  const router = useRouter();
  const { session } = useAuth();
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [course, setCourse] = useState<Trajet | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargeAction, setChargeAction] = useState(false);

  const monQrVehicule = champ<string>(session?.driver, 'vehicle_qr_code', 'vehicleQrCode') ?? null;

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
  // Règles serveur : départ uniquement sur une course payée, arrivée sur une
  // course en cours.
  const peutDemarrer = statut === 'paid';
  const peutTerminer = statut === 'in_progress';

  const allerAuScan = (action: 'start' | 'complete') => {
    router.push({
      pathname: '/(driver)/scanner',
      params: { tripId: course.id, action },
    });
  };

  // Envoie directement le QR véhicule du chauffeur connecté, sans scanner.
  const utiliserMonQr = async (action: 'start' | 'complete') => {
    if (!monQrVehicule) return;
    setChargeAction(true);
    setErreur('');
    try {
      if (action === 'start') {
        await api.demarrerCourse(course.id, monQrVehicule);
      } else {
        await api.terminerCourse(course.id, monQrVehicule);
      }
      await charger();
    } catch (e) {
      if (e instanceof ErreurApi && e.code === 'qr_mismatch') {
        setErreur(t('course_erreur_qr'));
      } else {
        setErreur(e instanceof ErreurApi ? e.message : t('course_erreur_action'));
      }
    } finally {
      setChargeAction(false);
    }
  };

  return (
    <Ecran fond="vagues" onRefresh={charger}>
      <Carte>
        <Titre>{t('titre_course')}</Titre>
        <BadgeStatutTrajet statut={statut} />
        {typeTrajet && (
          <LigneInfo label={t('commun_type')} valeur={libelleTypeTrajet(typeTrajet, t)} />
        )}
        {!!nomClient && <LigneInfo label={t('commun_client')} valeur={String(nomClient)} />}
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
      </Carte>

      <Carte>
        <SousTitre>{t('course_progression')}</SousTitre>
        <TimelineStatut
          etapes={ETAPES_TRAJET.map((cle) => ({ cle, label: libelleStatutTrajet(cle, t) }))}
          statutCourant={statut}
          annule={statut === 'cancelled'}
        />
      </Carte>

      {peutDemarrer && (
        <>
          <Bouton
            titre={t('course_scanner_demarrer')}
            icone="qr-code-outline"
            onPress={() => allerAuScan('start')}
          />
          {monQrVehicule && (
            <Bouton
              titre={t('course_mon_qr')}
              icone="car-outline"
              variante="secondaire"
              onPress={() => utiliserMonQr('start')}
              charge={chargeAction}
            />
          )}
        </>
      )}
      {peutTerminer && (
        <>
          <Bouton
            titre={t('course_scanner_terminer')}
            icone="qr-code-outline"
            onPress={() => allerAuScan('complete')}
          />
          {monQrVehicule && (
            <Bouton
              titre={t('course_mon_qr')}
              icone="car-outline"
              variante="secondaire"
              onPress={() => utiliserMonQr('complete')}
              charge={chargeAction}
            />
          )}
        </>
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
