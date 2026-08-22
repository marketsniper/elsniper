// LA REMISE PARTENAIRE NE VAUT QUE SUR LES COURSES PRIVÉES.
//
// Une place de taxi partagé se vend déjà au plus bas de la grille (4 à 19
// USD) : la remiser rognerait la part du chauffeur, qui remplit sa voiture
// place par place. Le serveur appliquait bien la règle ; l'APPLICATION, non.
// Elle affichait une place à 18,05 USD là où le serveur en facturait 19 — le
// partenaire voyait un prix et payait l'autre.
//
// Ce test relie les deux bouts sur TOUTE la grille, pas sur trois exemples.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { priceTrip, sharedAllowedForRoute, memeEndroit } from '../src/services/pricingService.js';
import { RIDE_ORIGINS } from '../src/services/locations.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const TYPES_MOBILE = path.resolve(ICI, '../../mobile/src/lib/types.ts');

/** Interroge la grille de l'APPLICATION (TypeScript) sur une liste de cas. */
function tarifsApplication(cas) {
  const sortie = execFileSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--no-warnings',
      '-e',
      `import(${JSON.stringify(TYPES_MOBILE)}).then((m) => {
         const cas = ${JSON.stringify(cas)};
         console.log(JSON.stringify(cas.map((c) =>
           m.tarifTrajetProfil(c.type, c.profil, { depart: c.depart, arrivee: c.arrivee })
         )));
       });`,
    ],
    { encoding: 'utf8' }
  ).trim();
  return JSON.parse(sortie);
}

/** Les itinéraires où une place de taxi partagé est réellement vendable. */
function itinerairesPartageables(limite = 40) {
  const routes = [];
  for (const depart of RIDE_ORIGINS) {
    for (const arrivee of RIDE_ORIGINS) {
      if (depart === arrivee || memeEndroit(depart, arrivee)) continue;
      if (!sharedAllowedForRoute(depart, arrivee)) continue;
      routes.push({ depart, arrivee });
      if (routes.length >= limite) return routes;
    }
  }
  return routes;
}

describe('Remise partenaire −5 %', () => {
  it('ne s’applique PAS aux places de taxi partagé (app comme serveur)', () => {
    const routes = itinerairesPartageables();
    assert.ok(routes.length >= 10, 'trop peu d’itinéraires partageables pour conclure');

    const cas = routes.map((r) => ({ ...r, type: 'shared_tourist', profil: 'hotel' }));
    const app = tarifsApplication(cas);

    const ecarts = [];
    cas.forEach((c, i) => {
      const serveur = priceTrip('shared_tourist', 'hotel', { pickup: c.depart, dropoff: c.arrivee });
      const touriste = priceTrip('shared_tourist', 'tourist', {
        pickup: c.depart,
        dropoff: c.arrivee,
      });
      // Le serveur vend la place au PLEIN TARIF touriste, remise comprise.
      assert.equal(
        serveur.price,
        touriste.price,
        `${c.depart} → ${c.arrivee} : le serveur remise une place partagée`
      );
      if (app[i]?.montant !== serveur.price) {
        ecarts.push(`${c.depart} → ${c.arrivee} : app ${app[i]?.montant} ≠ serveur ${serveur.price}`);
      }
    });
    assert.deepEqual(ecarts, [], `l’app affiche un prix que le serveur ne facture pas :\n${ecarts.join('\n')}`);
  });

  it('s’applique bien aux courses privées, du même montant des deux côtés', () => {
    const routes = itinerairesPartageables(20);
    const cas = routes.map((r) => ({ ...r, type: 'private', profil: 'hotel' }));
    const app = tarifsApplication(cas);

    let remisees = 0;
    cas.forEach((c, i) => {
      const serveur = priceTrip('private', 'hotel', { pickup: c.depart, dropoff: c.arrivee });
      const plein = priceTrip('private', 'tourist', { pickup: c.depart, dropoff: c.arrivee });
      assert.equal(
        app[i]?.montant,
        serveur.price,
        `${c.depart} → ${c.arrivee} : app ${app[i]?.montant} ≠ serveur ${serveur.price}`
      );
      if (serveur.price < plein.price) remisees += 1;
    });
    assert.ok(
      remisees >= cas.length - 1,
      `la remise privée a disparu : seulement ${remisees}/${cas.length} courses remisées`
    );
  });

  it('la remise résident, elle, vaut aussi sur le partagé', () => {
    // Elle est portée moitié-moitié par zanziGo et le chauffeur, qui y gagne
    // un client de toute l'année : c'est ce qui la distingue de la partenaire.
    const [{ depart, arrivee }] = itinerairesPartageables(1);
    const resident = priceTrip('shared_tourist', 'resident', { pickup: depart, dropoff: arrivee });
    const touriste = priceTrip('shared_tourist', 'tourist', { pickup: depart, dropoff: arrivee });
    assert.ok(
      resident.price < touriste.price,
      `${depart} → ${arrivee} : le résident ne paie pas moins cher sa place`
    );
    const [app] = tarifsApplication([
      { depart, arrivee, type: 'shared_tourist', profil: 'resident_verifie' },
    ]);
    assert.equal(app?.montant, resident.price, 'app et serveur divergent sur la place résident');
  });
});
