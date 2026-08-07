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
import {
  champ,
  ETAPES_TRAJET,
  formaterDate,
  formaterPrix,
  LIBELLES_STATUT_TRAJET,
  LIBELLES_TYPE_TRAJET,
  type StatutTrajet,
  type Trajet,
  type TypeTrajet,
} from '@/lib/types';

export default function EcranDetailCourse() {
  const router = useRouter();
  const { session } = useAuth();
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
      setErreur(e instanceof ErreurApi ? e.message : 'Course introuvable.');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger])
  );

  if (!course) {
    return erreur ? (
      <Ecran>
        <TexteErreur>{erreur}</TexteErreur>
      </Ecran>
    ) : (
      <ChargementCentre message="Chargement de la course…" />
    );
  }

  const statut = champ<StatutTrajet>(course, 'status', 'statut');
  const typeTrajet = champ<TypeTrajet>(course, 'trip_type', 'tripType');
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
        setErreur('Ce QR ne correspond pas au véhicule assigné à cette course.');
      } else {
        setErreur(e instanceof ErreurApi ? e.message : 'Action refusée pour cette course.');
      }
    } finally {
      setChargeAction(false);
    }
  };

  return (
    <Ecran>
      <Carte>
        <Titre>Course</Titre>
        <BadgeStatutTrajet statut={statut} />
        {typeTrajet && (
          <LigneInfo label="Type" valeur={LIBELLES_TYPE_TRAJET[typeTrajet] ?? typeTrajet} />
        )}
        <LigneInfo label="Départ" valeur={String(champ(course, 'pickup_location', 'pickupLocation') ?? '—')} />
        <LigneInfo label="Arrivée" valeur={String(champ(course, 'dropoff_location', 'dropoffLocation') ?? '—')} />
        {!!champ(course, 'scheduled_at', 'scheduledAt') && (
          <LigneInfo label="Programmé le" valeur={formaterDate(champ(course, 'scheduled_at', 'scheduledAt'))} />
        )}
        <LigneInfo label="Prix" valeur={formaterPrix(course)} />
      </Carte>

      <Carte>
        <SousTitre>Progression</SousTitre>
        <TimelineStatut
          etapes={ETAPES_TRAJET.map((cle) => ({ cle, label: LIBELLES_STATUT_TRAJET[cle] }))}
          statutCourant={statut}
          annule={statut === 'cancelled'}
        />
      </Carte>

      {peutDemarrer && (
        <>
          <Bouton
            titre="Scanner le QR véhicule — démarrer"
            icone="qr-code-outline"
            onPress={() => allerAuScan('start')}
          />
          {monQrVehicule && (
            <Bouton
              titre="Utiliser mon QR véhicule"
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
            titre="Scanner le QR véhicule — terminer"
            icone="qr-code-outline"
            onPress={() => allerAuScan('complete')}
          />
          {monQrVehicule && (
            <Bouton
              titre="Utiliser mon QR véhicule"
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
          Course demandée — pas encore confirmée par l&apos;équipe.
        </EncartInfo>
      )}
      {statut === 'driver_confirmed' && (
        <EncartInfo icone="card-outline" ton="attente">
          En attente du paiement du client. Le départ pourra être scanné une fois la course
          payée.
        </EncartInfo>
      )}

      <TexteErreur>{erreur}</TexteErreur>
      <Bouton titre="Actualiser" icone="refresh-outline" variante="secondaire" onPress={charger} />
    </Ecran>
  );
}
