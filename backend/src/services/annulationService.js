// Barème d'annulation CLIENT d'un voyage payé, à partir de l'heure de départ
// prévue (course planifiée ou taxi partagé) :
//  - à 48 h ou plus : remboursement 100 % ;
//  - entre 24 h et 48 h : remboursement 50 % ;
//  - à moins de 24 h : annulation refusée (la place reste due — respect des
//    autres voyageurs et du chauffeur déjà engagé).
export const REMBOURSEMENT_TOTAL_HEURES = 48;
export const REMBOURSEMENT_MOITIE_HEURES = 24;

// Renvoie 1 (100 %), 0.5 (50 %) ou null (annulation refusée).
export function tauxRemboursement(departAt, maintenantMs = Date.now()) {
  if (!departAt) return null;
  const heuresAvantDepart = (new Date(departAt).getTime() - maintenantMs) / 3_600_000;
  if (heuresAvantDepart >= REMBOURSEMENT_TOTAL_HEURES) return 1;
  if (heuresAvantDepart >= REMBOURSEMENT_MOITIE_HEURES) return 0.5;
  return null;
}
