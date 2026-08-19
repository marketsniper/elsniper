/**
 * COURSES FIGÉES — le chauffeur a dit oui, puis plus rien.
 *
 * La bourse aux courses a supprimé une intervention humaine : plus personne
 * ne vérifie qu'un chauffeur qui clique « Je prends » va vraiment y aller.
 * Ce silence-là ne se voit nulle part — jusqu'au coup de fil du client
 * depuis le hall de l'aéroport.
 *
 * Ce balayage rend la surveillance à l'équipe. Quatre situations, une alerte :
 *
 *   1. LE DÉPART APPROCHE. Course prise, départ dans moins de deux heures,
 *      et rien n'a démarré. C'est le cas qui coûte un client.
 *
 *   2. LE PAIEMENT TRAÎNE. Course prise il y a plus de six heures, toujours
 *      pas payée. Souvent un chauffeur qui a « réservé » une course et l'a
 *      oubliée : elle bloque la bourse pour les autres.
 *
 *   3. COURSE PAYÉE JAMAIS DÉMARRÉE. L'argent est encaissé, le départ est
 *      passé — le pire des cas, le client attend sur le trottoir.
 *
 *   4. PERSONNE N'A PRIS LA COURSE. La demande est publiée et aucun
 *      chauffeur n'a cliqué « Je prends » : un quart d'heure suffit à
 *      s'inquiéter pour un départ immédiat ; pour un départ planifié, on
 *      s'alarme quand l'horizon des deux heures est franchi. C'est LE
 *      moment où l'humain doit reprendre la main : relancer le groupe
 *      WhatsApp des chauffeurs ou assigner à la main.
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
/** Demande immédiate sans chauffeur depuis ce temps : on lève la main. */
const MINUTES_SANS_CHAUFFEUR = 15;

function messageAlerte(course, raison) {
  // Le conseil dépend du cas : sans chauffeur, il n'y a personne à appeler.
  const conseil =
    course.status === 'requested'
      ? [
          "Recollez l'annonce dans le groupe WhatsApp des chauffeurs, ou",
          'assignez un chauffeur à la main depuis le tableau de bord.',
        ]
      : [
          "Appelez le chauffeur. S'il ne répond pas, réassignez la course depuis le",
          'tableau de bord — elle est réassignable même une fois prise.',
        ];
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
    ...conseil,
    `Réf : ${course.id}`,
  ].join('\n');
}

/**
 * Un passage. Renvoie la liste des courses signalées — vide la plupart du
 * temps, ce qui est le but.
 */
export async function signalerCoursesFigees() {
  // MARQUAGE ET SÉLECTION EN UNE SEULE REQUÊTE. L'ancien SELECT-puis-UPDATE
  // laissait deux processus (deux instances pendant un déploiement) voir les
  // mêmes lignes non marquées et envoyer chaque alerte en double. Ici, celui
  // qui marque est celui qui envoie — l'autre ne trouve plus rien.
  const { rows } = await query(
    `UPDATE trips t
        SET alerte_figee_at = now()
       FROM (SELECT id FROM trips
              WHERE alerte_figee_at IS NULL
                AND (
                  -- 1. course prise, départ proche, rien n'a démarré
                  (status = 'driver_confirmed'
                   AND scheduled_at IS NOT NULL
                   AND scheduled_at <= now() + ($1 || ' hours')::interval)
                  -- 2. course prise depuis longtemps, toujours pas payée
                  OR (status = 'driver_confirmed'
                      AND created_at <= now() - ($2 || ' hours')::interval)
                  -- 3. course PAYÉE dont le départ est passé et qui n'a
                  --    jamais démarré : le pire cas de tous — l'argent est
                  --    encaissé et le client attend sur le trottoir. Un
                  --    quart d'heure de marge pour les départs à la minute.
                  OR (status = 'paid'
                      AND scheduled_at IS NOT NULL
                      AND scheduled_at <= now() - interval '15 minutes')
                  -- 4. demande publiée et AUCUN chauffeur n'a cliqué
                  --    « Je prends » : départ immédiat, un quart d'heure
                  --    suffit ; départ planifié, on s'alarme quand l'horizon
                  --    des deux heures est franchi.
                  OR (status = 'requested'
                      AND driver_id IS NULL
                      AND (
                        (scheduled_at IS NULL
                         AND created_at <= now() - ($3 || ' minutes')::interval)
                        OR (scheduled_at IS NOT NULL
                            AND scheduled_at <= now() + ($1 || ' hours')::interval)
                      ))
                )
              LIMIT 50
              FOR UPDATE SKIP LOCKED) figees
      WHERE t.id = figees.id
      RETURNING t.id, t.status, t.pickup_location, t.dropoff_location,
                t.scheduled_at, t.created_at, t.price, t.currency, t.driver_id,
                (t.scheduled_at IS NOT NULL
                 AND t.scheduled_at <= now() + ($1 || ' hours')::interval) AS depart_proche`,
    [String(HEURES_AVANT_DEPART), String(HEURES_SANS_PAIEMENT), String(MINUTES_SANS_CHAUFFEUR)]
  );
  if (rows.length === 0) return [];

  // Le nom du chauffeur, pour le message (hors transaction : lecture simple).
  const { rows: chauffeurs } = await query(
    'SELECT id, full_name, phone FROM drivers WHERE id = ANY($1)',
    [rows.map((r) => r.driver_id).filter(Boolean)]
  );
  const parId = new Map(chauffeurs.map((d) => [d.id, d]));

  for (const course of rows) {
    const chauffeur = parId.get(course.driver_id);
    course.driver_name = chauffeur?.full_name ?? null;
    course.driver_phone = chauffeur?.phone ?? null;
    const raison =
      course.status === 'requested'
        ? "🚨 AUCUN CHAUFFEUR n'a pris cette course — elle attend un humain."
        : course.status === 'paid'
          ? '🚨 COURSE PAYÉE, DÉPART PASSÉ, JAMAIS DÉMARRÉE — le client attend.'
          : course.depart_proche
            ? `⏰ DÉPART DANS MOINS DE ${HEURES_AVANT_DEPART} H — la course n'a toujours pas démarré.`
            : `💤 Course prise depuis plus de ${HEURES_SANS_PAIEMENT} h et toujours pas payée.`;
    await notifierEquipe('⚠️ Course figée — zanziGo', messageAlerte(course, raison)).catch(
      () => {}
    );
  }
  return rows;
}
