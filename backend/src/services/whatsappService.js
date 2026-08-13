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
    `Course: ${TRIP_TYPE_LIBELLES[trip.trip_type] ?? trip.trip_type}`,
    `Profil: ${AUDIENCE_LIBELLES[audience] ?? audience ?? '—'}`,
    `Client: ${bookerLabel}`,
    `Départ: ${trip.pickup_location}`,
    `Arrivée: ${trip.dropoff_location}`,
    `Prix: ${trip.price} ${trip.currency}`,
    `Réf: ${trip.id}`,
  ].join('\n');
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
