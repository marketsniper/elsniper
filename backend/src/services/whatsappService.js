import { config } from '../config.js';

// MVP : liens wa.me générés côté serveur — l'équipe les ouvre manuellement
// pour contacter chauffeurs/clients. Aucune API payante nécessaire.
// V2 : remplacer par l'API WhatsApp Business officielle.

export function buildTeamNotificationLink(text) {
  return `https://wa.me/${config.teamWhatsappNumber}?text=${encodeURIComponent(text)}`;
}

export function tripRequestMessage(trip, user) {
  return [
    `🚕 Nouvelle demande de trajet zanziGo`,
    `Type: ${trip.trip_type}`,
    `Client: ${user.full_name} (${user.phone})`,
    `Départ: ${trip.pickup_location}`,
    `Arrivée: ${trip.dropoff_location}`,
    `Prix: ${trip.price} ${trip.currency}`,
    `Réf: ${trip.id}`,
  ].join('\n');
}

export function packageRequestMessage(pkg, senderLabel) {
  return [
    `📦 Nouvelle demande de colis zanziGo`,
    `Expéditeur: ${senderLabel}`,
    `Ramassage: ${pkg.pickup_location}`,
    `Livraison: ${pkg.dropoff_location}`,
    `Destinataire: ${pkg.recipient_name} (${pkg.recipient_phone})`,
    `Prix: ${pkg.price} ${pkg.currency}`,
    `Réf: ${pkg.id}`,
  ].join('\n');
}
