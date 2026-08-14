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
