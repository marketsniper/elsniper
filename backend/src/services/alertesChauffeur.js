// Les quatre moments où le téléphone d'un chauffeur doit sonner.
//
// Un chauffeur ne reçoit QUE ce qui le concerne : la course qui lui est
// attribuée, son paiement, son annulation, et la validation de son compte.
// Jamais les paiements des autres, jamais les candidatures, jamais les
// compteurs de l'équipe — le tri se fait dans pushService.destinataires().
//
// Aucune de ces alertes ne peut faire échouer l'action qui la déclenche :
// toutes sont lancées sans être attendues, et toutes avalent leurs erreurs.
// Une notification ratée ne doit jamais annuler une course.
import { query } from '../db.js';
import { envoyerPushChauffeur } from './pushService.js';

/** Date lisible à l'heure de Zanzibar, ou « dès que possible ». */
function quand(valeur) {
  if (!valeur) return 'dès que possible';
  return new Date(valeur).toLocaleString('fr-FR', {
    timeZone: 'Africa/Dar_es_Salaam',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function trajet(trip) {
  return `${trip.pickup_location} → ${trip.dropoff_location}`;
}

/** Envoi silencieux : ni attente, ni erreur qui remonte. */
function envoyer(driverId, titre, corps, donnees) {
  if (!driverId) return;
  envoyerPushChauffeur(driverId, titre, corps, donnees).catch((err) => {
    console.error('[alerte chauffeur] échec silencieux :', err?.message ?? err);
  });
}

/** L'équipe vient de lui attribuer une course. */
export function alerterNouvelleCourse(trip) {
  envoyer(
    trip.driver_id,
    '🚕 Nouvelle course pour vous',
    `${trajet(trip)}\nDépart : ${quand(trip.scheduled_at)}`,
    { url: '/web/courses', tag: `course-${trip.id}` }
  );
}

/** Le client a réglé : le chauffeur peut démarrer. */
export function alerterCoursePayee(trip) {
  envoyer(
    trip.driver_id,
    '✅ Course payée — vous pouvez démarrer',
    `${trajet(trip)}\nDépart : ${quand(trip.scheduled_at)}`,
    { url: `/web/course/${trip.id}`, tag: `course-${trip.id}` }
  );
}

/** Même chose, quand on n'a sous la main que l'identifiant de la course. */
export async function alerterCoursePayeeParId(tripId) {
  if (!tripId) return;
  try {
    const { rows } = await query(
      'SELECT id, driver_id, pickup_location, dropoff_location, scheduled_at FROM trips WHERE id = $1',
      [tripId]
    );
    if (rows[0]) alerterCoursePayee(rows[0]);
  } catch (err) {
    console.error('[alerte chauffeur] course payée introuvable :', err?.message ?? err);
  }
}

/** La course est annulée : qu'il ne se déplace pas pour rien. */
export function alerterCourseAnnulee(trip) {
  envoyer(
    trip.driver_id,
    '❌ Course annulée',
    `${trajet(trip)}\nDépart prévu : ${quand(trip.scheduled_at)}`,
    { url: '/web/courses', tag: `course-${trip.id}` }
  );
}

/** Son dossier vient d'être validé par l'équipe. */
export function alerterCompteValide(driver) {
  envoyer(
    driver.id,
    '🎉 Votre compte Taxi Partner est validé',
    'Vous pouvez recevoir des courses dès maintenant. Bonne route !',
    { url: '/web/courses', tag: 'compte' }
  );
}

/* ------------------------------------------------------------------ */
/* LA BOURSE SONNE TOUTE SEULE.                                        */
/* ------------------------------------------------------------------ */

/** ~5 minutes de route : le rayon (en km) qui fait dire « près de vous ». */
const RAYON_PROCHE_KM = 3;
/** Une position plus vieille que ça ne prouve plus rien. */
const FRAICHEUR_POSITION_MIN = 15;

/**
 * À la publication d'une course privée — et à chaque retour en bourse —
 * TOUS les chauffeurs vérifiés et disponibles la reçoivent sur leur
 * téléphone, sans groupe WhatsApp, sans copier-coller, sans humain. Ceux
 * dont la position fraîche est à moins de RAYON_PROCHE_KM du client (quand
 * il a partagé sa position) reçoivent un message prioritaire « PRÈS DE
 * VOUS » avec la distance : le mieux placé a toutes les raisons de cliquer
 * le premier. Premier arrivé, premier servi — le claim atomique fait foi.
 *
 * Renvoie la liste { id, distance_km } des chauffeurs prévenus (la
 * distance est nulle quand la course n'a pas de position ou que celle du
 * chauffeur est vieille) — la fonction ne lève jamais.
 */
export async function diffuserCourseAuxChauffeurs(trip, { sauf = null } = {}) {
  if (!trip || trip.trip_type !== 'private') return [];
  try {
    const { rows } = await query(
      `SELECT d.id,
              CASE WHEN $2::double precision IS NOT NULL
                    AND p.updated_at >= now() - ($4 || ' minutes')::interval
                   THEN 2 * 6371 * asin(sqrt(
                          power(sin(radians(($2 - p.lat) / 2)), 2)
                          + cos(radians(p.lat)) * cos(radians($2::double precision))
                          * power(sin(radians(($3 - p.lng) / 2)), 2)))
                   ELSE NULL END AS distance_km
         FROM drivers d
         LEFT JOIN driver_positions p ON p.driver_id = d.id
        WHERE d.verification_status = 'verified'
          AND d.archived_at IS NULL
          AND d.available
          AND ($1::uuid IS NULL OR d.id <> $1::uuid)`,
      [sauf, trip.pickup_lat ?? null, trip.pickup_lng ?? null, String(FRAICHEUR_POSITION_MIN)]
    );
    const depart = quand(trip.scheduled_at);
    for (const d of rows) {
      const proche = d.distance_km !== null && Number(d.distance_km) <= RAYON_PROCHE_KM;
      envoyer(
        d.id,
        proche
          ? `🚕 Course à prendre PRÈS DE VOUS (~${Number(d.distance_km).toFixed(1)} km)`
          : '🚕 Course à prendre — premier arrivé, premier servi',
        `${trajet(trip)}\nDépart : ${depart}\nPrix : ${trip.price} ${trip.currency}`,
        { url: '/web/courses', tag: `bourse-${trip.id}` }
      );
    }
    return rows;
  } catch (err) {
    console.error('[diffusion bourse] échec silencieux :', err?.message ?? err);
    return [];
  }
}
