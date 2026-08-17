/**
 * CE QUE LE CHAUFFEUR A LE DROIT DE VOIR SUR UNE COURSE.
 *
 * Depuis la bourse aux courses, un chauffeur se sert lui-même : il prend une
 * course d'un clic, sans que personne de l'équipe n'intervienne. Il faut donc
 * une règle nette, appliquée par le serveur — pas par l'écran — sur le moment
 * où les COORDONNÉES DU CLIENT lui sont confiées.
 *
 * LA RÈGLE : tant que l'équipe n'a pas validé le paiement, le chauffeur voit
 * le travail (trajet, heure, options, ce qu'il gagne) mais RIEN de ce qui
 * appartient au client — ni son nom, ni son numéro, ni son point de rendez-vous
 * exact. Dès que la course passe en « payée », tout s'ouvre : il doit pouvoir
 * appeler et se rendre à la bonne porte.
 *
 * Pourquoi le serveur et pas l'écran : un chauffeur qui regarde la réponse de
 * l'API depuis un navigateur verrait tout. Ici les champs ne PARTENT pas.
 *
 * Ce qui est retiré avant validation :
 *   · client_name / client_phone  — le nom et le numéro (client ou hôte) ;
 *   · pickup_lat / pickup_lng     — le point GPS partagé par le client ;
 *   · whatsapp_link               — le message d'équipe, qui contient le nom.
 * Et dans tous les cas : le message du groupe chauffeurs reste à l'équipe.
 */

/** Statuts à partir desquels l'équipe a validé l'argent. */
const STATUTS_PAYES = new Set(['paid', 'in_progress', 'completed']);

export function coursePayee(trip) {
  return STATUTS_PAYES.has(String(trip?.status));
}

/**
 * Vue d'une course pour LE CHAUFFEUR qui en est chargé.
 *
 * @param {object} trip ligne `trips`, éventuellement enrichie par la jointure
 *   `users` (colonnes `compte_client_nom` / `compte_client_tel`) et `hotels`
 *   (colonne `hotel_name`).
 * @returns {object} la course, coordonnées comprises ou masquées.
 */
export function vueChauffeur(trip) {
  if (!trip) return trip;
  const {
    // Colonnes de jointure : elles ne sortent jamais telles quelles.
    compte_client_nom: compteNom,
    compte_client_tel: compteTel,
    ...reste
  } = trip;

  if (!coursePayee(trip)) {
    return {
      ...reste,
      client_name: null,
      client_phone: null,
      pickup_lat: null,
      pickup_lng: null,
      whatsapp_link: null,
      hotel_name: null,
      // Drapeau lu par l'app pour expliquer l'attente au lieu d'afficher un
      // vide inquiétant (« où est le client ? »).
      contact_client_visible: false,
    };
  }

  // Course payée : le chauffeur reçoit de quoi appeler et de quoi arriver.
  // Une course réservée par un hôtel porte le nom de l'hôte dans la course
  // même ; une course réservée depuis un compte client vient de `users`.
  return {
    ...reste,
    client_name: trip.client_name ?? compteNom ?? null,
    client_phone: trip.client_phone ?? compteTel ?? null,
    whatsapp_link: null, // le lien d'équipe ne concerne pas le chauffeur
    contact_client_visible: true,
  };
}

/** Les colonnes à joindre pour que `vueChauffeur` ait de quoi travailler. */
export const CHAMPS_CLIENT_POUR_CHAUFFEUR = `u.full_name AS compte_client_nom,
                u.phone AS compte_client_tel,
                h.name AS hotel_name`;
