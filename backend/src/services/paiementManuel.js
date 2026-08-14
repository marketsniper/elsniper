// Un paiement zanziGo suit l'un de deux chemins :
//
//  - AUTOMATIQUE (Pesapal, capture PayPal) : la banque confirme, la course
//    passe à « payée » toute seule, personne n'a de geste à faire ;
//  - À LA MAIN (lien WhatsApp, PayPal.me) : le client règle l'équipe, qui
//    encaisse puis marque « payé » dans le tableau de bord.
//
// La différence se lit dans la référence du paiement. Elle décide de deux
// choses : qui a le droit de valider (l'équipe seule, en production) et si
// une alerte doit partir sur le téléphone de l'équipe — un paiement qui se
// confirme tout seul n'a personne à réveiller.
export function aValiderALaMain(reference) {
  const brut = String(reference ?? '');
  return brut.startsWith('WHATSAPP-') || brut.startsWith('PAYPALME-');
}

/** Date lisible à l'heure de Zanzibar. */
function quand(valeur) {
  return new Date(valeur).toLocaleString('fr-FR', {
    timeZone: 'Africa/Dar_es_Salaam',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

// Le rappel du geste à faire, en fin de message : sans lui, on sait qu'un
// client veut payer, mais pas où l'on valide.
const GESTE = '👉 Dès que l\'argent est reçu : Tableau de bord → Paiements → « Marquer payé ».';

/** Alerte « un client veut régler sa course ». */
export function alertePaiementCourse(trip) {
  return {
    sujet: '💳 Paiement à encaisser — course',
    texte: [
      '💳 Un client veut régler sa course',
      `Trajet: ${trip.pickup_location} → ${trip.dropoff_location}`,
      ...(trip.scheduled_at ? [`Départ: ${quand(trip.scheduled_at)}`] : []),
      `Montant: ${trip.price} ${trip.currency}`,
      ...(trip.client_name ? [`Client: ${trip.client_name}`] : []),
      `Réf: ${trip.id}`,
      '',
      GESTE,
    ].join('\n'),
  };
}

/** Alerte « un client veut régler son colis ». */
export function alertePaiementColis(pkg) {
  return {
    sujet: '💳 Paiement à encaisser — colis',
    texte: [
      '💳 Un client veut régler son colis',
      `Trajet: ${pkg.pickup_location} → ${pkg.dropoff_location}`,
      `Taille: ${pkg.size}`,
      `Montant: ${pkg.price} ${pkg.currency}`,
      `QR: ${pkg.qr_code}`,
      `Réf: ${pkg.id}`,
      '',
      GESTE,
    ].join('\n'),
  };
}
