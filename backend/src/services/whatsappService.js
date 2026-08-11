import { config } from '../config.js';

// MVP : liens wa.me générés côté serveur — l'équipe les ouvre manuellement
// pour contacter chauffeurs/clients. Aucune API payante nécessaire.
// V2 : remplacer par l'API WhatsApp Business officielle.

export function buildTeamNotificationLink(text) {
  // wa.me attend le numéro international sans "+" ni espaces.
  const number = config.teamWhatsappNumber.replace(/\D/g, '');
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function tripRequestMessage(trip, bookerLabel) {
  return [
    `🚕 Nouvelle demande de trajet zanziGo`,
    `Type: ${trip.trip_type}`,
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
