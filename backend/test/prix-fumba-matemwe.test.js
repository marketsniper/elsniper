// DEUX DESTINATIONS SORTENT DU PRIX UNIQUE DE TRANSFERT (24/08/2026).
//
// Un hub (Stone Town, ferry, aéroport) vers n'importe quelle plage coûtait
// 52 USD, quelle que soit la distance. Fumba est à 27 km de Stone Town quand
// Nungwi est à 67 : le client payait la plage la plus lointaine pour aller à
// la plus proche.
//
//   Stone Town → Fumba    20 USD
//   Stone Town → Matemwe  33 USD
//
// Ces deux montants sont une décision commerciale, pas un calcul : ce test
// les tient, et vérifie que le reste de la grille n'a pas bougé avec.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { priceTrip, netChauffeurPriveUsd } from '../src/services/pricingService.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const TYPES_MOBILE = path.resolve(ICI, '../../mobile/src/lib/types.ts');
const AEROPORT = 'Aéroport international Abeid Amani Karume';

/** Le prix privé touriste vu par l'APPLICATION, pour une liste d'itinéraires. */
function prixApplication(routes) {
  const sortie = execFileSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--no-warnings',
      '-e',
      `import(${JSON.stringify(TYPES_MOBILE)}).then((m) => {
         const r = ${JSON.stringify(routes)};
         console.log(JSON.stringify(r.map((x) =>
           m.tarifTrajetProfil('private', 'tourist', { depart: x[0], arrivee: x[1] })?.montant
         )));
       });`,
    ],
    { encoding: 'utf8' }
  ).trim();
  return JSON.parse(sortie);
}

describe('Prix de transfert — Fumba et Matemwe', () => {
  it('Stone Town → Fumba coûte 20 USD, Stone Town → Matemwe 33 USD', () => {
    assert.equal(priceTrip('private', 'tourist', { pickup: 'Stone Town', dropoff: 'Fumba' }).price, 20);
    assert.equal(priceTrip('private', 'tourist', { pickup: 'Stone Town', dropoff: 'Matemwe' }).price, 33);
    // Et dans l'autre sens : un transfert se lit dans les deux directions.
    assert.equal(priceTrip('private', 'tourist', { pickup: 'Fumba', dropoff: 'Stone Town' }).price, 20);
    assert.equal(priceTrip('private', 'tourist', { pickup: 'Matemwe', dropoff: 'Stone Town' }).price, 33);
  });

  it('le chauffeur y garde une part, zanziGo ne roule pas à perte', () => {
    for (const [ville, prix, net] of [['Fumba', 20, 17], ['Matemwe', 33, 28]]) {
      const tarif = priceTrip('private', 'tourist', { pickup: 'Stone Town', dropoff: ville });
      assert.equal(netChauffeurPriveUsd('Stone Town', ville), net, `net chauffeur ${ville}`);
      assert.ok(tarif.commission > 0, `zanziGo perdrait de l'argent sur ${ville}`);
      // Le net promis est un plancher : le prix moins la commission le tient.
      assert.ok(
        tarif.price - tarif.commission >= net - 0.01,
        `${ville} : le chauffeur touche ${tarif.price - tarif.commission}, moins que les ${net} promis`
      );
      assert.equal(tarif.price, prix);
    }
  });

  it('le prix vaut depuis TOUS les hubs — l’aéroport est plus près que Stone Town', () => {
    // Garder 52 USD au départ de l'aéroport pendant que Stone Town descend à
    // 20 aurait créé un écart que n'importe quel client aurait relevé.
    assert.equal(priceTrip('private', 'tourist', { pickup: AEROPORT, dropoff: 'Fumba' }).price, 20);
    assert.equal(priceTrip('private', 'tourist', { pickup: AEROPORT, dropoff: 'Matemwe' }).price, 33);
    assert.equal(
      priceTrip('private', 'tourist', { pickup: 'Stone Town Ferry', dropoff: 'Fumba' }).price,
      20
    );
  });

  it('le reste de la grille n’a pas bougé', () => {
    // Les transferts ordinaires gardent leur prix unique.
    for (const ville of ['Nungwi', 'Kendwa', 'Kiwengwa', 'Kizimkazi']) {
      assert.equal(
        priceTrip('private', 'tourist', { pickup: 'Stone Town', dropoff: ville }).price,
        52,
        `${ville} a changé de prix sans qu'on le demande`
      );
    }
    // Le couloir du sud-est garde le sien, et l'aéroport ↔ ville aussi.
    assert.equal(priceTrip('private', 'tourist', { pickup: 'Stone Town', dropoff: 'Paje' }).price, 49);
    assert.equal(priceTrip('private', 'tourist', { pickup: AEROPORT, dropoff: 'Stone Town' }).price, 14.5);
  });

  it('l’application affiche exactement les mêmes prix que le serveur', () => {
    const routes = [
      ['Stone Town', 'Fumba'],
      ['Stone Town', 'Matemwe'],
      [AEROPORT, 'Fumba'],
      [AEROPORT, 'Matemwe'],
      ['Stone Town', 'Nungwi'],
      ['Stone Town', 'Paje'],
    ];
    const app = prixApplication(routes);
    routes.forEach(([depart, arrivee], i) => {
      const serveur = priceTrip('private', 'tourist', { pickup: depart, dropoff: arrivee }).price;
      assert.equal(
        app[i],
        serveur,
        `${depart} → ${arrivee} : l'app annonce ${app[i]}, le serveur facture ${serveur}`
      );
    });
  });
});
