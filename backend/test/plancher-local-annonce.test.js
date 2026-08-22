// LE PRIX PLANCHER AFFICHÉ AUX LOCAUX DOIT ÊTRE ACHETABLE.
//
// L'écran de profil promet « Tarif local à partir de X TSh ». X est calculé
// en balayant toute la grille — et la grille sait chiffrer une place sur
// n'importe quel couple de villes, y compris là où aucun taxi partagé n'est
// jamais proposé (Nungwi ↔ Kendwa, aéroport ↔ Stone Town, Stone Town ↔
// ferry). Le premier calcul annonçait ainsi 10 400 TSh, un prix que personne
// n'aurait jamais pu réserver.
//
// Ce test relie les deux bouts : le plancher affiché par l'application doit
// être exactement le plus bas des prix que le SERVEUR accepte réellement de
// vendre.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  priceTrip,
  sharedAllowedForRoute,
  hubToHubRoute,
  memeEndroit,
} from '../src/services/pricingService.js';
import { RIDE_ORIGINS } from '../src/services/locations.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const TYPES_MOBILE = path.resolve(ICI, '../../mobile/src/lib/types.ts');

/** Le plus bas prix de place locale que le serveur accepte de vendre. */
function plancherServeurTzs() {
  let mini = Infinity;
  const routes = [];
  for (const depart of RIDE_ORIGINS) {
    for (const arrivee of RIDE_ORIGINS) {
      if (depart === arrivee || memeEndroit(depart, arrivee)) continue;
      if (!sharedAllowedForRoute(depart, arrivee)) continue;
      if (hubToHubRoute(depart, arrivee)) continue;
      const tarif = priceTrip('shared_local', 'local', { pickup: depart, dropoff: arrivee });
      if (tarif?.currency !== 'TZS' || !(tarif.price > 0)) continue;
      if (tarif.price < mini) {
        mini = tarif.price;
        routes.length = 0;
      }
      if (tarif.price === mini) routes.push(`${depart} → ${arrivee}`);
    }
  }
  return { mini, routes };
}

describe('Plancher local annoncé', () => {
  it('est le prix le plus bas réellement vendable, pas un prix de formule', () => {
    const { mini, routes } = plancherServeurTzs();
    assert.ok(Number.isFinite(mini), 'aucune place locale vendable trouvée');
    assert.ok(routes.length > 0, 'le plancher doit venir de trajets identifiables');

    // La course qui porte ce plancher doit exister pour de bon.
    const [depart, arrivee] = routes[0].split(' → ');
    assert.equal(sharedAllowedForRoute(depart, arrivee), true);
  });

  it('est le même des deux côtés : application et serveur', () => {
    const { mini } = plancherServeurTzs();
    const sortie = execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--no-warnings',
        '-e',
        `import('${TYPES_MOBILE}').then((m) => console.log(m.tarifLocalMiniTzs()));`,
      ],
      { encoding: 'utf8' }
    ).trim();
    assert.equal(
      Number(sortie),
      mini,
      `l'app annonce ${sortie} TSh, le serveur vend au plus bas ${mini} TSh`
    );
  });

  it('ne retient pas un trajet sur lequel aucun taxi partagé n’est proposé', () => {
    // Les trois pièges connus : deux villages voisins, deux hubs, la navette
    // aéroport ↔ ville. Tous chiffrables, aucun réservable en partagé.
    for (const [depart, arrivee] of [
      ['Nungwi', 'Kendwa'],
      ['Stone Town', 'Stone Town Ferry'],
      ['Aéroport international Abeid Amani Karume', 'Stone Town'],
    ]) {
      const chiffrable = priceTrip('shared_local', 'local', { pickup: depart, dropoff: arrivee });
      assert.ok(chiffrable.price > 0, `${depart} → ${arrivee} : la grille sait chiffrer`);
      assert.equal(
        sharedAllowedForRoute(depart, arrivee) && !hubToHubRoute(depart, arrivee),
        false,
        `${depart} → ${arrivee} ne doit pas compter dans le plancher annoncé`
      );
    }
  });
});
