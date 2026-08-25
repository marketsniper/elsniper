// LES TRANSFERTS QUI SORTENT DU PRIX UNIQUE (24/08/2026).
//
// Un hub vers n'importe quelle plage coûtait 52 USD, quelle que soit la
// distance : le client payait la plage la plus lointaine pour aller à la plus
// proche. Et le HUB DE DÉPART compte — l'aéroport est plus loin de Nungwi que
// Stone Town.
//
//   Stone Town / ferry → Fumba     20 USD      (aéroport aussi)
//   Stone Town / ferry → Matemwe   33 USD      aéroport → Matemwe  45 USD
//   Stone Town / ferry → Nungwi    45 USD      aéroport → Nungwi   48 USD
//
// Ces montants sont des décisions commerciales, pas des calculs : ce test les
// tient, et vérifie que le reste de la grille n'a pas bougé avec.
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

describe('Prix de transfert — les exceptions au prix unique', () => {
  // [départ, arrivée, prix client, net chauffeur] — LA GRILLE ENTIÈRE du
  // 25/08/2026 : plus d'exceptions à un prix unique, chaque destination
  // porte son prix, posé sur les kilomètres.
  const EXCEPTIONS = [
    ['Stone Town', 'Fumba', 20, 17],
    ['Stone Town Ferry', 'Fumba', 20, 17],
    [AEROPORT, 'Fumba', 20, 17],
    ['Stone Town', 'Chwaka', 28, 23],
    [AEROPORT, 'Chwaka', 28, 23],
    ['Stone Town', 'Uroa', 28, 23],
    ['Stone Town', 'Pongwe', 28, 23],
    ['Stone Town', 'Kiwengwa', 29, 24],
    [AEROPORT, 'Kiwengwa', 31, 26],
    ['Stone Town', 'Pwani Mchangani', 30, 25],
    [AEROPORT, 'Pwani Mchangani', 33, 28],
    ['Stone Town', 'Matemwe', 33, 28],
    ['Stone Town Ferry', 'Matemwe', 33, 28],
    [AEROPORT, 'Matemwe', 45, 39],
    ['Stone Town', 'Paje', 45, 39],
    [AEROPORT, 'Paje', 45, 39],
    ['Stone Town', 'Bwejuu', 45, 39],
    ['Stone Town', 'Jambiani', 45, 39],
    ['Stone Town', 'Kizimkazi', 45, 39],
    ['Stone Town', 'Makunduchi', 45, 39],
    ['Stone Town', 'Mtende', 45, 39],
    ['Stone Town', 'Kendwa', 45, 39],
    [AEROPORT, 'Kendwa', 48, 42],
    ['Stone Town', 'Nungwi', 45, 39],
    ['Stone Town Ferry', 'Nungwi', 45, 39],
    [AEROPORT, 'Nungwi', 48, 42],
    ['Stone Town', 'Michamvi', 48, 42],
    ['Stone Town', 'Dongwe', 48, 42],
  ];

  it('chaque couple hub → plage porte le prix décidé, dans les deux sens', () => {
    for (const [depart, arrivee, prix] of EXCEPTIONS) {
      assert.equal(
        priceTrip('private', 'tourist', { pickup: depart, dropoff: arrivee }).price,
        prix,
        `${depart} → ${arrivee}`
      );
      // Un transfert se lit dans les deux directions.
      assert.equal(
        priceTrip('private', 'tourist', { pickup: arrivee, dropoff: depart }).price,
        prix,
        `${arrivee} → ${depart}`
      );
    }
  });

  it('le hub de départ compte : l’aéroport est plus loin que la ville', () => {
    // C'est le sens de toute la table. Si ces deux écarts disparaissaient,
    // c'est que le net serait redevenu commun à tous les hubs.
    const villeMatemwe = priceTrip('private', 'tourist', { pickup: 'Stone Town', dropoff: 'Matemwe' }).price;
    const aeroMatemwe = priceTrip('private', 'tourist', { pickup: AEROPORT, dropoff: 'Matemwe' }).price;
    assert.ok(aeroMatemwe > villeMatemwe, `Matemwe : aéroport ${aeroMatemwe} ≤ ville ${villeMatemwe}`);

    const villeNungwi = priceTrip('private', 'tourist', { pickup: 'Stone Town', dropoff: 'Nungwi' }).price;
    const aeroNungwi = priceTrip('private', 'tourist', { pickup: AEROPORT, dropoff: 'Nungwi' }).price;
    assert.ok(aeroNungwi > villeNungwi, `Nungwi : aéroport ${aeroNungwi} ≤ ville ${villeNungwi}`);

    // Stone Town et son ferry sont la MÊME place : jamais d'écart entre eux.
    for (const plage of ['Fumba', 'Matemwe', 'Nungwi']) {
      assert.equal(
        priceTrip('private', 'tourist', { pickup: 'Stone Town', dropoff: plage }).price,
        priceTrip('private', 'tourist', { pickup: 'Stone Town Ferry', dropoff: plage }).price,
        `${plage} : la ville et son ferry divergent`
      );
    }
  });

  it('le chauffeur y garde une part, zanziGo ne roule pas à perte', () => {
    for (const [depart, arrivee, prix, net] of EXCEPTIONS) {
      const tarif = priceTrip('private', 'tourist', { pickup: depart, dropoff: arrivee });
      assert.equal(netChauffeurPriveUsd(depart, arrivee), net, `net ${depart} → ${arrivee}`);
      assert.ok(tarif.commission > 0, `zanziGo perdrait de l'argent : ${depart} → ${arrivee}`);
      // Le net promis est un plancher : le prix moins la commission le tient.
      assert.ok(
        tarif.price - tarif.commission >= net - 0.01,
        `${depart} → ${arrivee} : le chauffeur touche ${tarif.price - tarif.commission}, promis ${net}`
      );
      assert.equal(tarif.price, prix);
    }
  });

  it('l’aéroport ↔ ville et les trajets ville ↔ ville n’ont pas bougé', () => {
    // La grille des transferts a changé ; le forfait aéroport ↔ Stone Town et
    // la grille au kilomètre entre villes, eux, restent ce qu'ils étaient.
    assert.equal(priceTrip('private', 'tourist', { pickup: AEROPORT, dropoff: 'Stone Town' }).price, 14.5);
    assert.equal(priceTrip('private', 'tourist', { pickup: 'Nungwi', dropoff: 'Kendwa' }).price, 13);
  });

  it('l’application affiche exactement les mêmes prix que le serveur', () => {
    const routes = [
      ...EXCEPTIONS.map(([d, a]) => [d, a]),
      ['Stone Town', 'Kendwa'],
      [AEROPORT, 'Kendwa'],
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
