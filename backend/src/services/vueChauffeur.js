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
 * ET L'ARGENT SUIT LA MÊME RÈGLE (25/08/2026). Le chauffeur voit CE QU'IL MET
 * DANS SA POCHE, et le pourcentage que zanziGo retient — jamais le prix payé
 * par le client, jamais la commission en argent. C'est la façon de faire
 * d'Uber et de Bolt, et elle tient à trois raisons :
 *
 *  · un chauffeur qui lit « 45 USD » en haut de l'écran et reçoit 39,60
 *    retient l'écart, pas le gain. Le chiffre qui compte pour lui est celui
 *    qu'il touche ; c'est le seul qu'on lui montre ;
 *  · le prix client n'est PAS son affaire : il ne l'encaisse pas. Le client
 *    règle par carte ou par portefeuille mobile, l'équipe valide, et le
 *    chauffeur est payé ensuite. Lui montrer une somme qu'il ne touchera
 *    jamais n'a aucune utilité et prête à négociation au bord de la route ;
 *  · le même prix ne se lit pas pareil selon le client (touriste, résident
 *    vérifié, hôtel partenaire), alors que son net, lui, ne bouge pas.
 *
 * Le pourcentage, en revanche, RESTE AFFICHÉ : cacher le net ET le taux
 * ferait de zanziGo une boîte noire. Un chauffeur doit pouvoir dire « ils
 * prennent 12 % » — c'est ce qui permet de comparer, donc de faire confiance.
 *
 * POURQUOI LE SERVEUR ET PAS L'ÉCRAN, dans les deux cas : un chauffeur qui
 * ouvre la réponse de l'API dans un navigateur verrait tout ce qu'on se
 * serait contenté de masquer à l'affichage. Ici les champs ne PARTENT pas.
 *
 * Ce qui est retiré À TOUS LES COUPS :
 *   · price / commission          — le prix client et la commission en argent,
 *                                   remplacés par net_chauffeur + le %.
 * Ce qui est retiré TANT QUE LE PAIEMENT N'EST PAS VALIDÉ :
 *   · client_name / client_phone  — le nom et le numéro (client ou hôte) ;
 *   · pickup_lat / pickup_lng     — le point GPS partagé par le client ;
 *   · whatsapp_link               — le message d'équipe, qui contient le nom.
 * Et dans tous les cas : le message du groupe chauffeurs reste à l'équipe.
 */

/** Statuts à partir desquels l'équipe a validé l'argent. */
const STATUTS_PAYES = new Set(['paid', 'in_progress', 'completed']);

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * LA PART zanziGo, EN POURCENTAGE ENTIER — jamais en argent.
 *
 * Elle se déduit de la course elle-même, et elle n'est pas la même partout :
 * 12 % sur un transfert, 15 % sur une petite course, 17 % sur le couloir du
 * sud-est, et sur l'aéroport ↔ Stone Town c'est un FORFAIT de 4,50 $ — soit
 * 31 % d'une course à 14,50. On affiche le taux réel de CETTE course-là, pas
 * une moyenne rassurante : un chiffre qui ne correspond pas à ce que le
 * chauffeur peut recalculer coûte plus de confiance qu'il n'en gagne.
 *
 * @returns {number|null} le pourcentage arrondi, ou null si incalculable.
 */
export function partZanziGoPct(prix, commission) {
  const p = Number(prix);
  const c = Number(commission);
  if (!Number.isFinite(p) || !Number.isFinite(c) || p <= 0) return null;
  return Math.round((c / p) * 100);
}

/**
 * Retire le prix client et la commission en argent, et laisse à la place le
 * gain net et le pourcentage.
 *
 * Le net DÉJÀ CALCULÉ est conservé tel quel s'il est présent : les places en
 * shillings passent par l'arrondi au millier inférieur (`arrondiMillierTzs`),
 * et un `prix − commission` refait ici donnerait un autre chiffre.
 *
 * @param {object} objet la ligne à filtrer (course, colis, place…).
 * @param {{prix?: string, commission?: string, net?: string}} champs les noms
 *   de colonnes, pour les places qui les nomment `*_per_seat`.
 */
export function gainsSeuls(objet, champs = {}) {
  if (!objet) return objet;
  const {
    prix = 'price',
    commission = 'commission',
    net = 'net_chauffeur',
  } = champs;
  const { [prix]: montantPrix, [commission]: montantCommission, ...reste } = objet;
  const pct = partZanziGoPct(montantPrix, montantCommission);
  const dejaCalcule = Number(reste[net]);
  const gain = Number.isFinite(dejaCalcule)
    ? dejaCalcule
    : Number.isFinite(Number(montantPrix)) && Number.isFinite(Number(montantCommission))
      ? round2(Number(montantPrix) - Number(montantCommission))
      : null;
  return { ...reste, [net]: gain, part_zanzigo_pct: pct };
}

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
    return gainsSeuls({
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
    });
  }

  // Course payée : le chauffeur reçoit de quoi appeler et de quoi arriver.
  // Une course réservée par un hôtel porte le nom de l'hôte dans la course
  // même ; une course réservée depuis un compte client vient de `users`.
  return gainsSeuls({
    ...reste,
    client_name: trip.client_name ?? compteNom ?? null,
    client_phone: trip.client_phone ?? compteTel ?? null,
    whatsapp_link: null, // le lien d'équipe ne concerne pas le chauffeur
    contact_client_visible: true,
  });
}

/** Les colonnes à joindre pour que `vueChauffeur` ait de quoi travailler. */
export const CHAMPS_CLIENT_POUR_CHAUFFEUR = `u.full_name AS compte_client_nom,
                u.phone AS compte_client_tel,
                h.name AS hotel_name`;
