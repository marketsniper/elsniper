// ══════════════════════════════════════════════════════════════════════════
// LE SOLEIL DE ZANZIBAR.
//
// L'application a une heure du jour — la vraie, celle qu'il est dehors quand
// le client ou le chauffeur la tient. Toutes les ombres portées de
// l'interface tombent dans la direction où le soleil les jetterait à cet
// instant sur l'île : à gauche le matin, courtes à midi, à droite le soir.
//
// Ce n'est ni une animation ni un effet : c'est une seule variable — le
// secteur solaire — lue au montage de l'application et rafraîchie toutes les
// dix minutes. Elle coûte un calcul trigonométrique et rien d'autre.
//
// L'algorithme est celui de la NOAA (Solar Position Calculator), dans sa
// forme courante : équation du temps, déclinaison, angle horaire. Précision
// de l'ordre du dixième de degré aux latitudes tropicales — très au-delà de
// ce qu'une ombre de carte demande.
//
// Ce module ne connaît que le ciel : aucune couleur, aucun composant. Le
// branchement sur React vit dans `theme.ts`, à côté de la bascule de peau.
// ══════════════════════════════════════════════════════════════════════════

/** Stone Town. L'île fait 84 km : la différence d'un bout à l'autre est
 *  inférieure au degré, donc invisible sur une ombre de 12 pixels. */
const LATITUDE = -6.165;
const LONGITUDE = 39.2;

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface PositionSolaire {
  /** Hauteur au-dessus de l'horizon, en degrés. Négative la nuit. */
  elevation: number;
  /** Azimut en degrés depuis le nord, dans le sens des aiguilles (est = 90). */
  azimut: number;
}

/** Position du soleil au-dessus de Zanzibar à un instant donné. */
export function positionSolaire(quand: Date = new Date()): PositionSolaire {
  // Jour julien, puis siècle julien depuis J2000.
  const jj = quand.getTime() / 86400000 + 2440587.5;
  const t = (jj - 2451545) / 36525;

  const moyLongitude = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const moyAnomalie = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const excentricite = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  const centre =
    Math.sin(moyAnomalie * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * moyAnomalie * RAD) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * moyAnomalie * RAD) * 0.000289;
  const vraieLongitude = moyLongitude + centre;
  const longitudeApparente =
    vraieLongitude - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * t) * RAD);

  const obliquiteMoy =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquite = obliquiteMoy + 0.00256 * Math.cos((125.04 - 1934.136 * t) * RAD);

  const declinaison =
    Math.asin(Math.sin(obliquite * RAD) * Math.sin(longitudeApparente * RAD)) * DEG;

  // Équation du temps, en minutes.
  const y = Math.tan((obliquite / 2) * RAD) ** 2;
  const eqTemps =
    4 *
    DEG *
    (y * Math.sin(2 * moyLongitude * RAD) -
      2 * excentricite * Math.sin(moyAnomalie * RAD) +
      4 * excentricite * y * Math.sin(moyAnomalie * RAD) * Math.cos(2 * moyLongitude * RAD) -
      0.5 * y * y * Math.sin(4 * moyLongitude * RAD) -
      1.25 * excentricite * excentricite * Math.sin(2 * moyAnomalie * RAD));

  // Heure solaire vraie, en minutes depuis minuit local vrai.
  const minutesUTC =
    quand.getUTCHours() * 60 + quand.getUTCMinutes() + quand.getUTCSeconds() / 60;
  const tempsVrai = (minutesUTC + eqTemps + 4 * LONGITUDE + 1440) % 1440;
  const angleHoraire = tempsVrai / 4 - 180; // degrés, 0 au midi solaire

  const sinLat = Math.sin(LATITUDE * RAD);
  const cosLat = Math.cos(LATITUDE * RAD);
  const sinDec = Math.sin(declinaison * RAD);
  const cosDec = Math.cos(declinaison * RAD);
  const cosH = Math.cos(angleHoraire * RAD);

  const cosZenith = sinLat * sinDec + cosLat * cosDec * cosH;
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZenith))) * DEG;
  const elevation = 90 - zenith;

  // Azimut : depuis le nord, sens horaire.
  let azimut =
    Math.acos(
      Math.min(
        1,
        Math.max(-1, (sinLat * Math.cos(zenith * RAD) - sinDec) / (cosLat * Math.sin(zenith * RAD)))
      )
    ) * DEG;
  azimut = angleHoraire > 0 ? (azimut + 180) % 360 : (540 - azimut) % 360;

  return { elevation, azimut };
}

/**
 * LE SECTEUR SOLAIRE — l'azimut de l'OMBRE, quantifié en 12 secteurs de 30°.
 *
 * Quantifié pour une raison mesurable : au 6ᵉ parallèle sud, le soleil passe
 * au zénith deux fois par an, et ces jours-là son azimut balaie 275° en
 * trois heures. Sans palier, les ombres de l'application pivoteraient d'un
 * quart de tour entre deux écrans. Au-dessus de 70° d'élévation, le secteur
 * est gelé sur la verticale : à midi, une ombre n'a plus de direction, elle
 * n'a plus qu'une longueur.
 *
 * Secteur 0 = ombre vers le nord (vers le haut de l'écran), puis dans le
 * sens des aiguilles d'une montre.
 */
export const SECTEUR_ZENITH = -1;

export function secteurSolaire(quand: Date = new Date()): number {
  const { elevation, azimut } = positionSolaire(quand);
  // Soleil couché : on garde la dernière direction plausible du soir plutôt
  // qu'une ombre venue de sous l'horizon.
  if (elevation <= 0) return SECTEUR_ZENITH;
  if (elevation >= 70) return SECTEUR_ZENITH;
  const azimutOmbre = (azimut + 180) % 360;
  return Math.round(azimutOmbre / 30) % 12;
}

/**
 * Le déplacement d'une ombre pour un secteur donné, à partir de la longueur
 * voulue par le design.
 *
 * L'écran est lu comme une carte : le nord en haut, l'est à droite. Le matin
 * le soleil est à l'est, les ombres partent donc vers la gauche ; le soir
 * l'inverse. Un plancher vers le bas est imposé : une ombre qui remonterait
 * franchement au-dessus de sa carte se lirait comme une lumière venue du
 * sol — vrai en décembre, illisible à l'écran.
 */
export function decalageSolaire(
  secteur: number,
  base: { width: number; height: number }
): { width: number; height: number } {
  const longueur = Math.hypot(base.width, base.height) || 1;
  if (secteur === SECTEUR_ZENITH) {
    // Zénith : l'ombre se ramasse sous l'objet, un peu plus courte.
    return { width: 0, height: Math.round(longueur * 0.62 * 10) / 10 };
  }
  const angle = secteur * 30 * RAD;
  const dx = Math.sin(angle) * longueur;
  const dy = -Math.cos(angle) * longueur; // nord = vers le haut de l'écran
  // Le plancher relève l'ombre vers le bas ; on la ramène ensuite à la
  // longueur voulue, sinon une ombre plein est finirait plus longue qu'une
  // ombre plein sud — le design a choisi une longueur, pas deux.
  const plancher = Math.max(dy, longueur * 0.3);
  const norme = Math.hypot(dx, plancher) || 1;
  const k = longueur / norme;
  return {
    width: Math.round(dx * k * 10) / 10,
    height: Math.round(plancher * k * 10) / 10,
  };
}
