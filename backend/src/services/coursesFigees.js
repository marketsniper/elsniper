/**
 * COURSES FIGÉES — le chauffeur a dit oui, puis plus rien.
 *
 * La bourse aux courses a supprimé une intervention humaine : plus personne
 * ne vérifie qu'un chauffeur qui clique « Je prends » va vraiment y aller.
 * Ce silence-là ne se voit nulle part — jusqu'au coup de fil du client
 * depuis le hall de l'aéroport.
 *
 * Ce balayage rend la surveillance à l'équipe. Deux situations, une alerte :
 *
 *   1. LE DÉPART APPROCHE. Course prise, départ dans moins de deux heures,
 *      et rien n'a démarré. C'est le cas qui coûte un client.
 *
 *   2. LE PAIEMENT TRAÎNE. Course prise il y a plus de six heures, toujours
 *      pas payée. Souvent un chauffeur qui a « réservé » une course et l'a
 *      oubliée : elle bloque la bourse pour les autres.
 *
 * Une course n'est signalée QU'UNE FOIS (colonne alerte_figee_at), sans quoi
 * l'équipe recevrait le même message toutes les minutes. Le compteur repart
 * dès que la course bouge — libérée par le chauffeur, ou réassignée.
 */
import { query } from '../db.js';
import { notifierEquipe } from './emailService.js';

/** Le départ est proche à ce point : on ne peut plus attendre. */
const HEURES_AVANT_DEPART = 2;
/** Prise depuis si longtemps sans être payée : elle bloque la bourse. */
const HEURES_SANS_PAIEMENT = 6;

function messageAlerte(course, raison) {
  return [
    raison,
    '',
    `Trajet : ${course.pickup_location} → ${course.dropoff_location}`,
    course.scheduled_at
      ? `Départ prévu : ${new Date(course.scheduled_at).toISOString()}`
      : 'Départ : immédiat',
    `Chauffeur : ${course.driver_name ?? '—'} (${course.driver_phone ?? '—'})`,
    `Prix : ${course.price} ${course.currency}`,
    '',
    "Appelez le chauffeur. S'il ne répond pas, réassignez la course depuis le",
    'tableau de bord — elle est réassignable même une fois prise.',
    `Réf : ${course.id}`,
  ].join('\n');
}

/**
 * Un passage. Renvoie la liste des courses signalées — vide la plupart du
 * temps, ce qui est le but.
 */
export async function signalerCoursesFigees() {
  const { rows } = await query(
    `SELECT t.id, t.pickup_location, t.dropoff_location, t.scheduled_at, t.created_at,
            t.price, t.currency,
            d.full_name AS driver_name, d.phone AS driver_phone,
            -- Laquelle des deux situations a déclenché l'alerte.
            (t.scheduled_at IS NOT NULL
             AND t.scheduled_at <= now() + ($1 || ' hours')::interval) AS depart_proche
       FROM trips t
       LEFT JOIN drivers d ON d.id = t.driver_id
      WHERE t.status = 'driver_confirmed'
        AND t.alerte_figee_at IS NULL
        AND (
          -- 1. le départ approche
          (t.scheduled_at IS NOT NULL
           AND t.scheduled_at <= now() + ($1 || ' hours')::interval)
          -- 2. prise depuis longtemps, toujours pas payée
          OR t.created_at <= now() - ($2 || ' hours')::interval
        )
      LIMIT 50`,
    [String(HEURES_AVANT_DEPART), String(HEURES_SANS_PAIEMENT)]
  );
  if (rows.length === 0) return [];

  // On marque AVANT d'envoyer : si l'envoi échoue, mieux vaut une alerte
  // perdue qu'une alerte répétée toutes les minutes.
  await query('UPDATE trips SET alerte_figee_at = now() WHERE id = ANY($1)', [
    rows.map((r) => r.id),
  ]);

  for (const course of rows) {
    const raison = course.depart_proche
      ? `⏰ DÉPART DANS MOINS DE ${HEURES_AVANT_DEPART} H — la course n'a toujours pas démarré.`
      : `💤 Course prise depuis plus de ${HEURES_SANS_PAIEMENT} h et toujours pas payée.`;
    await notifierEquipe('⚠️ Course figée — zanziGo', messageAlerte(course, raison)).catch(
      () => {}
    );
  }
  return rows;
}
