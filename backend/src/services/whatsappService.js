import { config } from '../config.js';

// MVP : liens wa.me générés côté serveur — l'équipe les ouvre manuellement
// pour contacter chauffeurs/clients. Aucune API payante nécessaire.
// V2 : remplacer par l'API WhatsApp Business officielle.

export function buildTeamNotificationLink(text) {
  // wa.me attend le numéro international sans "+" ni espaces.
  const number = config.teamWhatsappNumber.replace(/\D/g, '');
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

// Libellés lisibles pour les résumés WhatsApp de l'équipe.
export const TRIP_TYPE_LIBELLES = {
  private: 'Taxi privé',
  shared_tourist: 'Taxi partagé (touristes)',
  shared_local: 'Taxi partagé (local)',
  posted_return: 'Retour affiché',
};

export const AUDIENCE_LIBELLES = {
  tourist: 'Touriste',
  resident: 'Résident',
  local: 'Local',
  hotel: 'Hôtel',
};

export function tripRequestMessage(trip, bookerLabel, audience) {
  return [
    `🚕 Nouvelle réservation zanziGo`,
    `Course: ${TRIP_TYPE_LIBELLES[trip.trip_type] ?? trip.trip_type}${trip.round_trip ? ' — ALLER-RETOUR (attente incluse)' : ''}`,
    `Profil: ${AUDIENCE_LIBELLES[audience] ?? audience ?? '—'}`,
    `Client: ${bookerLabel}`,
    `Départ: ${trip.pickup_location}`,
    `Arrivée: ${trip.dropoff_location}`,
    // Transfert aéroport : le n° de vol permet de vérifier l'heure réelle
    // d'atterrissage avant d'envoyer le chauffeur.
    ...(trip.flight_number ? [`✈️ Vol: ${trip.flight_number}`] : []),
    ...(trip.baby_seat ? ['👶 Siège bébé demandé'] : []),
    ...(trip.bulky_luggage ? ['🧳 Gros bagages — prévoir un grand véhicule'] : []),
    `Prix: ${trip.price} ${trip.currency}`,
    `Réf: ${trip.id}`,
  ].join('\n');
}

/**
 * Message PRÊT À COLLER dans le groupe WhatsApp des chauffeurs.
 *
 * Écrit en anglais et en swahili — les langues du groupe — et volontairement
 * court : un chauffeur le lit d'un coup d'œil sur son téléphone. Il donne ce
 * qui permet de décider (trajet, heure, gain net) et RIEN de ce qui appartient
 * au client : ni son nom, ni son numéro. Ces informations-là, l'équipe ne les
 * confie qu'au chauffeur retenu.
 */
const FUSEAU_ZANZIBAR = 'Africa/Dar_es_Salaam';

/**
 * Jour et heure en swahili simple, à l'heure de Zanzibar :
 * « LEO saa 14:30 », « KESHO saa 09:00 », sinon « 21/08 saa 14:00 ».
 * On ne convertit PAS en heure swahili traditionnelle : les chauffeurs lisent
 * l'heure du téléphone, c'est celle-là qu'il faut donner.
 */
function jourHeureSwahili(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const heure = date.toLocaleTimeString('en-GB', {
    timeZone: FUSEAU_ZANZIBAR,
    hour: '2-digit',
    minute: '2-digit',
  });
  const jour = (d) => d.toLocaleDateString('en-CA', { timeZone: FUSEAU_ZANZIBAR });
  const maintenant = new Date();
  if (jour(date) === jour(maintenant)) return `LEO saa ${heure}`;
  if (jour(date) === jour(new Date(maintenant.getTime() + 86400000))) {
    return `KESHO saa ${heure}`;
  }
  const court = date.toLocaleDateString('en-GB', {
    timeZone: FUSEAU_ZANZIBAR,
    day: '2-digit',
    month: '2-digit',
  });
  return `${court} saa ${heure}`;
}

/**
 * Annonce à coller dans le groupe WhatsApp des chauffeurs.
 *
 * EN SWAHILI UNIQUEMENT, et le plus court possible : nos chauffeurs sont
 * zanzibarites et lisent l'annonce sur un téléphone, souvent au volant. Une
 * ligne = une information. L'anglais a été retiré : il doublait la longueur
 * du message pour rien.
 *
 * Le gain est donné en SHILLINGS, la monnaie dans laquelle un chauffeur juge
 * une course — même quand le client paie en dollars.
 *
 * Ce message part dans un groupe de dizaines de chauffeurs : il ne contient
 * NI le nom NI le numéro du client. Seul celui qui est retenu les reçoit.
 */
export function messageGroupeChauffeurs(trip) {
  const quand = trip.scheduled_at ? jourHeureSwahili(trip.scheduled_at) : null;

  const prix = Number(trip.price);
  const commission = Number(trip.commission);
  const net = Number.isFinite(prix) && Number.isFinite(commission) ? prix - commission : null;
  const netTzs =
    net === null
      ? null
      : trip.currency === 'USD'
        ? Math.round(net * config.usdToTzsRate)
        : Math.round(net);

  return [
    '🚕 SAFARI MPYA — zanziGo',
    '',
    `📍 ${trip.pickup_location} ➡️ ${trip.dropoff_location}`,
    `🕒 ${quand ?? 'SASA HIVI — mteja anasubiri'}`,
    ...(netTzs === null ? [] : [`💰 Unapata ${netTzs.toLocaleString('en-US')} TZS`]),
    // Les contraintes : seulement celles qui existent, une par ligne.
    ...(trip.round_trip ? ['🔁 Kwenda na kurudi'] : []),
    ...(trip.flight_number ? [`✈️ Ndege ${trip.flight_number}`] : []),
    ...(trip.baby_seat ? ['👶 Kiti cha mtoto'] : []),
    ...(trip.bulky_luggage ? ['🧳 Mizigo mikubwa'] : []),
    '',
    'Nani yupo? Jibu hapa.',
    'Wa kwanza kujibu ndiye atapata.',
    '',
    `Namba: ${String(trip.id).slice(0, 8)}`,
  ].join('\n');
}

/** Lien qui ouvre WhatsApp avec ce message, à envoyer au groupe choisi. */
export function lienGroupeChauffeurs(trip) {
  return `https://wa.me/?text=${encodeURIComponent(messageGroupeChauffeurs(trip))}`;
}

export function packageRequestMessage(pkg, senderLabel) {
  const quand = pkg.pickup_at
    ? new Date(pkg.pickup_at).toLocaleString('fr-FR', {
        timeZone: 'Africa/Dar_es_Salaam',
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : 'dès que possible';
  return [
    `📦 Nouvelle demande de colis zanziGo`,
    `Expéditeur: ${senderLabel}`,
    `Ramassage: ${pkg.pickup_location}`,
    `À ramasser: ${quand}`,
    `Livraison: ${pkg.dropoff_location}`,
    `Destinataire: ${pkg.recipient_name} (${pkg.recipient_phone})`,
    `Prix: ${pkg.price} ${pkg.currency}`,
    `Réf: ${pkg.id}`,
  ].join('\n');
}
