// Entretien automatique de la plateforme — indépendant de toute visite.
//
// Le ménage (places réservées non payées, annonces dont le départ est
// passé) était jusqu'ici « paresseux » : il ne s'exécutait que lorsqu'un
// client ou l'équipe ouvrait une page. Concrètement, une place réservée à
// 10 h et jamais payée pouvait rester bloquée jusqu'à la prochaine
// consultation — invendable pour les autres voyageurs, et affichée comme
// active côté client. Ce balayage tourne maintenant tout seul.
import { annulerReservationsImpayees, cloturerRidesPartis } from '../routes/rides.js';
import { signalerCoursesFigees } from './coursesFigees.js';

const INTERVALLE_MS = 60 * 1000;

let minuteur = null;
// Une passe à la fois : si la précédente traîne (envoi d'e-mails lent), la
// suivante saute son tour au lieu de s'empiler sur le pool de connexions.
let passeEnCours = false;

export async function passageEntretien() {
  if (passeEnCours) return [];
  passeEnCours = true;
  try {
    return await passageEntretienInterne();
  } finally {
    passeEnCours = false;
  }
}

async function passageEntretienInterne() {
  await cloturerRidesPartis();
  const liberees = await annulerReservationsImpayees();
  // Une course prise par un chauffeur qui ne donne plus signe de vie ne se
  // voit nulle part : c'est ici qu'on la remonte à l'équipe.
  await signalerCoursesFigees().catch((err) => {
    console.error('[entretien] alerte courses figées :', err.message);
  });
  return liberees;
}

/** Démarre le balayage périodique (aucun effet en environnement de test). */
export function demarrerEntretienAutomatique(ms = INTERVALLE_MS) {
  if (process.env.NODE_ENV === 'test' || minuteur) return minuteur;
  const passage = () => {
    passageEntretien().catch((err) => {
      console.error('[entretien] échec du passage automatique :', err.message);
    });
  };
  passage(); // rattrapage immédiat au démarrage (et après une mise en veille)
  minuteur = setInterval(passage, ms);
  // Ne retarde pas l'arrêt du serveur.
  if (typeof minuteur.unref === 'function') minuteur.unref();
  return minuteur;
}

export function arreterEntretienAutomatique() {
  if (minuteur) {
    clearInterval(minuteur);
    minuteur = null;
  }
}
