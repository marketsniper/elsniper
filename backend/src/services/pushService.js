// Alertes INSTANTANÉES sur le téléphone de l'équipe (notifications web).
//
// POURQUOI
// La passerelle WhatsApp gratuite (CallMeBot) met les messages dans sa propre
// file d'attente : mesuré, notre requête part en 0,2 s mais le message arrive
// 35 s plus tard. Une notification web, elle, passe par le service du
// navigateur (Apple pour iPhone, Google pour Android) et arrive en une à
// trois secondes. WhatsApp reste envoyé en parallèle : il garde la trace
// écrite que l'équipe aime relire.
//
// Fonctionne sur un iPhone à condition que zanziGo soit AJOUTÉ À L'ÉCRAN
// D'ACCUEIL (Apple ne l'autorise que là), et sur Android dans le navigateur
// comme en application installée.
import webpush from 'web-push';
import { query } from '../db.js';
import { config } from '../config.js';

let configure = false;

/** Les clés VAPID identifient notre serveur auprès d'Apple et de Google. */
function preparer() {
  const { publicKey, privateKey, subject } = config.push;
  if (!publicKey || !privateKey) return false;
  if (!configure) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configure = true;
  }
  return true;
}

export function pushActif() {
  return !!(config.push.publicKey && config.push.privateKey);
}

export function clePubliquePush() {
  return config.push.publicKey || null;
}

/** Enregistre (ou met à jour) l'abonnement d'un téléphone. */
export async function enregistrerAbonnement({ endpoint, p256dh, auth, label }) {
  const { rows } = await query(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, label)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE
       SET p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           label = COALESCE(EXCLUDED.label, push_subscriptions.label),
           failures = 0
     RETURNING id, label, created_at`,
    [endpoint, p256dh, auth, label ?? null]
  );
  return rows[0];
}

export async function retirerAbonnement(endpoint) {
  const { rowCount } = await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
  return rowCount > 0;
}

export async function listerAbonnements() {
  const { rows } = await query(
    'SELECT id, label, created_at, last_ok_at, failures FROM push_subscriptions ORDER BY created_at'
  );
  return rows;
}

/** Nombre d'échecs consécutifs au-delà duquel l'abonnement est oublié. */
const ECHECS_AVANT_OUBLI = 5;

/**
 * Envoie l'alerte à tous les téléphones abonnés. Ne lève jamais : une
 * notification ratée ne doit jamais faire échouer une réservation.
 * Les abonnements morts (téléphone réinitialisé, application désinstallée)
 * sont retirés tout seuls — le navigateur répond alors 404 ou 410.
 */
export async function envoyerPush(titre, corps, donnees = {}) {
  if (!preparer()) return { envoyes: 0, raison: 'non_configure' };
  const { rows } = await query('SELECT * FROM push_subscriptions');
  if (rows.length === 0) return { envoyes: 0, raison: 'aucun_abonne' };

  const charge = JSON.stringify({ titre, corps, ...donnees });
  let envoyes = 0;

  await Promise.all(
    rows.map(async (abonnement) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: abonnement.endpoint,
            keys: { p256dh: abonnement.p256dh, auth: abonnement.auth },
          },
          charge,
          { TTL: 600, urgency: 'high' }
        );
        envoyes += 1;
        await query('UPDATE push_subscriptions SET last_ok_at = now(), failures = 0 WHERE id = $1', [
          abonnement.id,
        ]);
      } catch (err) {
        const statut = err?.statusCode;
        if (statut === 404 || statut === 410) {
          await query('DELETE FROM push_subscriptions WHERE id = $1', [abonnement.id]);
          console.log(`[push] abonnement expiré retiré (${abonnement.label ?? abonnement.id})`);
          return;
        }
        const { rows: maj } = await query(
          'UPDATE push_subscriptions SET failures = failures + 1 WHERE id = $1 RETURNING failures',
          [abonnement.id]
        );
        if ((maj[0]?.failures ?? 0) >= ECHECS_AVANT_OUBLI) {
          await query('DELETE FROM push_subscriptions WHERE id = $1', [abonnement.id]);
          console.log(`[push] abonnement retiré après ${ECHECS_AVANT_OUBLI} échecs`);
        }
        console.error(`[push] échec (${statut ?? err?.message}) — ${abonnement.label ?? abonnement.id}`);
      }
    })
  );

  if (envoyes > 0) console.log(`[push] ${envoyes} téléphone(s) alerté(s) — ${titre}`);
  return { envoyes };
}
