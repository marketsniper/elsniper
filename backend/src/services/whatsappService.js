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
export function messageGroupeChauffeurs(trip) {
  const quand = trip.scheduled_at
    ? new Date(trip.scheduled_at).toLocaleString('en-GB', {
        timeZone: 'Africa/Dar_es_Salaam',
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : null;

  // Gain net du chauffeur : le prix moins la commission zanziGo. Les courses
  // en dollars sont aussi données en shillings — c'est la monnaie dans
  // laquelle un chauffeur juge une course.
  const prix = Number(trip.price);
  const commission = Number(trip.commission);
  const net = Number.isFinite(prix) && Number.isFinite(commission) ? prix - commission : null;
  const montant =
    net === null
      ? null
      : trip.currency === 'USD'
        ? `${Math.round(net * 100) / 100} USD (≈ ${Math.round(
            net * config.usdToTzsRate
          ).toLocaleString('en-US')} TZS)`
        : `${Math.round(net).toLocaleString('en-US')} ${trip.currency}`;

  return [
    '🚕 zanziGo — Private ride / Safari ya binafsi',
    '',
    `📍 ${trip.pickup_location} → ${trip.dropoff_location}`,
    ...(quand ? [`🕒 ${quand}`] : ['🕒 As soon as possible / Haraka iwezekanavyo']),
    ...(trip.round_trip ? ['🔁 Return trip, waiting included / Kwenda na kurudi, kusubiri kumejumuishwa'] : []),
    ...(trip.flight_number ? [`✈️ Flight / Ndege: ${trip.flight_number}`] : []),
    ...(trip.baby_seat ? ['👶 Baby seat needed / Kiti cha mtoto kinahitajika'] : []),
    ...(trip.bulky_luggage ? ['🧳 Large luggage / Mizigo mikubwa'] : []),
    ...(montant ? [`💰 Driver / Dereva: ${montant}`] : []),
    '',
    'EN — Who is available? Reply here, first to answer gets it.',
    'SW — Nani yupo? Jibu hapa, wa kwanza kujibu atapata.',
    '',
    `Ref: ${String(trip.id).slice(0, 8)}`,
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
