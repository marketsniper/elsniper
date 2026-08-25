// ══════════════════════════════════════════════════════════════════════════
// LE PORTAIL CHAUFFEUR NE MONTRE QUE DU NET.
//
// Un chauffeur zanziGo voit CE QU'IL MET DANS SA POCHE et le pourcentage que
// zanziGo retient. Jamais le prix payé par le client, jamais la commission en
// argent. C'est la règle d'Uber et de Bolt, et elle est appliquée par le
// SERVEUR — les champs ne partent pas — pour qu'un chauffeur qui ouvre l'API
// dans un navigateur ne les trouve pas non plus.
//
// Ce fichier tient la règle de deux façons :
//
//  1. UN BALAYAGE. Pour chaque endpoint que le portail chauffeur appelle, on
//     parcourt la réponse ENTIÈRE — objets imbriqués compris — et on refuse
//     la moindre clé `price` / `commission` / `price_per_seat`. C'est ce qui
//     attrape la régression qu'aucun test nommé n'aurait vue : un champ
//     ajouté demain dans un sous-objet, une jointure qui ramène une colonne
//     de plus.
//  2. DES VÉRIFICATIONS NOMMÉES sur les chiffres eux-mêmes : le net doit être
//     juste, le pourcentage doit être celui de CETTE course.
//
// Et le contrepoids, sans lequel la règle serait une fuite déguisée en
// fonctionnalité : L'ÉQUIPE ET LE CLIENT, EUX, VOIENT TOUT. C'est vérifié ici
// aussi — le jour où quelqu'un appliquera le filtre trop largement, le
// tableau de bord perdrait ses montants en silence.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import {
  adminHeaders,
  app,
  authHeaders,
  createTourist,
  createVerifiedDriver,
  useTestDb,
} from './setup.js';
import { partZanziGoPct, tarifSpecial } from '../src/services/vueChauffeur.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racineDepot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

useTestDb();

// Les noms de champs qui ne doivent JAMAIS atteindre un chauffeur.
const INTERDITS = ['price', 'commission', 'price_per_seat', 'price_per_seat_usd', 'commission_per_seat'];

/**
 * Parcourt une réponse JSON de fond en comble et renvoie les chemins des
 * champs interdits qu'elle contient.
 */
function champsInterdits(valeur, chemin = '$') {
  if (Array.isArray(valeur)) {
    return valeur.flatMap((v, i) => champsInterdits(v, `${chemin}[${i}]`));
  }
  if (!valeur || typeof valeur !== 'object') return [];
  const trouves = [];
  for (const [cle, sousValeur] of Object.entries(valeur)) {
    if (INTERDITS.includes(cle)) trouves.push(`${chemin}.${cle}`);
    trouves.push(...champsInterdits(sousValeur, `${chemin}.${cle}`));
  }
  return trouves;
}

/** Une course Stone Town → Nungwi (45 $, 12 %) prise par un chauffeur. */
async function coursePrise({ payee = false } = {}) {
  const { token, user } = await createTourist();
  const { token: jetonChauffeur, driver } = await createVerifiedDriver();
  const course = await request(app)
    .post('/api/trips')
    .set(authHeaders(token))
    .send({
      userId: user.id,
      tripType: 'private',
      pickupLocation: 'Stone Town',
      dropoffLocation: 'Nungwi',
    });
  assert.equal(course.status, 201, JSON.stringify(course.body));
  await request(app)
    .patch(`/api/trips/${course.body.id}/assign-driver`)
    .set(adminHeaders())
    .send({ driverId: driver.id });
  if (payee) {
    const paiement = await request(app)
      .post(`/api/trips/${course.body.id}/payment`)
      .set(authHeaders(token));
    await request(app)
      .post(`/api/payments/${paiement.body.id}/confirm`)
      .set(authHeaders(token));
  }
  return { id: course.body.id, jetonChauffeur, jetonClient: token, driver };
}

describe('Le pourcentage zanziGo, calculé sur la course elle-même', () => {
  it('un transfert à 45 $ : 12 %', () => {
    assert.equal(partZanziGoPct(45, 5.4), 12);
  });

  it('l’aéroport ↔ Stone Town : le calcul brut donne bien 31 %…', () => {
    // La fonction pure dit la vérité arithmétique : 4,50 de forfait sur une
    // course à 14,50, c'est 31 %. Mais ce chiffre-là ne S'AFFICHE pas — sur
    // ce trajet le portail écrit « Special trip » (voir le test suivant et
    // la vérification de bout en bout plus bas).
    assert.equal(partZanziGoPct(14.5, 4.5), 31);
  });

  it('…mais le trajet est marqué « Special trip », et le pourcentage se tait', () => {
    // La commission y est un FORFAIT vendu comme un produit à part, pas un
    // pourcentage : l'afficher en % serait vrai et pourtant trompeur.
    const aeroport = {
      trip_type: 'private',
      pickup_location: 'Aéroport (AAKIA)',
      dropoff_location: 'Stone Town',
    };
    assert.equal(tarifSpecial(aeroport), true);
    // Dans les deux sens, et sous tous les noms de l'aéroport.
    assert.equal(
      tarifSpecial({
        trip_type: 'private',
        pickup_location: 'Stone Town Ferry',
        dropoff_location: 'Aéroport international Abeid Amani Karume',
      }),
      true
    );
    // Un transfert ordinaire garde son pourcentage…
    assert.equal(
      tarifSpecial({
        trip_type: 'private',
        pickup_location: 'Stone Town',
        dropoff_location: 'Nungwi',
      }),
      false
    );
    // …et une place PARTAGÉE du même trajet aéroport aussi : le forfait ne
    // vaut que pour la course privée.
    assert.equal(tarifSpecial({ ...aeroport, trip_type: 'shared_tourist' }), false);
  });

  it('une place de taxi partagé : 25 %', () => {
    assert.equal(partZanziGoPct(16, 4), 25);
  });

  it('rien à calculer → rien à afficher, pas un zéro trompeur', () => {
    assert.equal(partZanziGoPct(0, 0), null);
    assert.equal(partZanziGoPct(null, 5), null);
    assert.equal(partZanziGoPct(45, undefined), null);
  });
});

describe('Portail chauffeur : aucun prix client ne sort du serveur', () => {
  it('la bourse aux courses : le gain et le pourcentage, rien d’autre', async () => {
    const { token, user } = await createTourist();
    await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: user.id,
        tripType: 'private',
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Nungwi',
      });
    const { token: jetonChauffeur } = await createVerifiedDriver();

    const bourse = await request(app)
      .get('/api/trips/disponibles')
      .set(authHeaders(jetonChauffeur));
    assert.equal(bourse.status, 200);
    assert.equal(bourse.body.length, 1);
    assert.deepEqual(champsInterdits(bourse.body), []);
    assert.equal(Number(bourse.body[0].net_chauffeur), 39.6);
    assert.equal(Number(bourse.body[0].part_zanzigo_pct), 12);
  });

  it('une course aéroport ↔ Stone Town arrive marquée « Special trip », sans pourcentage', async () => {
    const { token, user } = await createTourist();
    const creation = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: user.id,
        tripType: 'private',
        pickupLocation: 'Aéroport (AAKIA)',
        dropoffLocation: 'Stone Town',
      });
    assert.equal(creation.status, 201, JSON.stringify(creation.body));
    const { token: jetonChauffeur, driver } = await createVerifiedDriver();

    // Sur la bourse…
    const bourse = await request(app)
      .get('/api/trips/disponibles')
      .set(authHeaders(jetonChauffeur));
    assert.equal(bourse.status, 200);
    const vue = bourse.body.find((c) => c.id === creation.body.id);
    assert.ok(vue, 'la course aéroport doit être sur la bourse');
    assert.deepEqual(champsInterdits([vue]), []);
    assert.equal(Number(vue.net_chauffeur), 10, 'le net promis sur ce trajet');
    assert.equal(vue.tarif_special, true, 'marquée « Special trip »');
    assert.equal(vue.part_zanzigo_pct, null, 'aucun pourcentage à afficher');

    // …et sur la fiche du chauffeur qui l'a prise.
    await request(app)
      .patch(`/api/trips/${creation.body.id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: driver.id });
    const fiche = await request(app)
      .get(`/api/trips/${creation.body.id}`)
      .set(authHeaders(jetonChauffeur));
    assert.equal(fiche.status, 200);
    assert.equal(fiche.body.tarif_special, true);
    assert.equal(fiche.body.part_zanzigo_pct, null);
    assert.equal(Number(fiche.body.net_chauffeur), 10);
  });

  it('la fiche d’une course, AVANT et APRÈS la validation du paiement', async () => {
    for (const payee of [false, true]) {
      const { id, jetonChauffeur } = await coursePrise({ payee });
      const vue = await request(app)
        .get(`/api/trips/${id}`)
        .set(authHeaders(jetonChauffeur));
      assert.equal(vue.status, 200, JSON.stringify(vue.body));
      assert.deepEqual(
        champsInterdits(vue.body),
        [],
        `course ${payee ? 'payée' : 'non payée'} : un prix client a filtré`
      );
      assert.equal(Number(vue.body.net_chauffeur), 39.6);
      assert.equal(Number(vue.body.part_zanzigo_pct), 12);
    }
  });

  it('la liste des courses du chauffeur', async () => {
    const { jetonChauffeur, driver } = await coursePrise({ payee: true });
    const liste = await request(app)
      .get(`/api/drivers/${driver.id}/trips`)
      .set(authHeaders(jetonChauffeur));
    assert.equal(liste.status, 200);
    assert.equal(liste.body.length, 1);
    assert.deepEqual(champsInterdits(liste.body), []);
    assert.equal(Number(liste.body[0].net_chauffeur), 39.6);
  });

  it('la bourse aux colis et « mes colis », du dépôt à la livraison', async () => {
    const { token, user } = await createTourist();
    const colis = await request(app)
      .post('/api/packages')
      .set(authHeaders(token))
      .send({
        senderType: 'user',
        senderUserId: user.id,
        size: 'medium',
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Nungwi',
        recipientName: 'Asha',
        recipientPhone: '+255700000999',
      });
    assert.equal(colis.status, 201, JSON.stringify(colis.body));
    const paiement = await request(app)
      .post(`/api/packages/${colis.body.id}/payment`)
      .set(authHeaders(token));
    await request(app)
      .post(`/api/payments/${paiement.body.id}/confirm`)
      .set(authHeaders(token));

    const { token: jetonChauffeur } = await createVerifiedDriver();
    const bourse = await request(app).get('/api/packages').set(authHeaders(jetonChauffeur));
    assert.equal(bourse.status, 200);
    assert.ok(bourse.body.length > 0, 'le colis payé doit être sur la bourse');
    assert.deepEqual(champsInterdits(bourse.body), []);
    assert.ok(Number(bourse.body[0].net_chauffeur) > 0);
    assert.ok(Number(bourse.body[0].part_zanzigo_pct) > 0);

    // Il le prend…
    const prise = await request(app)
      .post(`/api/packages/${colis.body.id}/claim`)
      .set(authHeaders(jetonChauffeur));
    assert.equal(prise.status, 200, JSON.stringify(prise.body));
    assert.deepEqual(champsInterdits(prise.body), []);

    // …et « mes colis » le montre sans prix client, lui non plus.
    const miens = await request(app)
      .get('/api/packages/mine')
      .set(authHeaders(jetonChauffeur));
    assert.equal(miens.status, 200);
    assert.equal(miens.body.length, 1);
    assert.deepEqual(champsInterdits(miens.body), []);

    // La fiche du colis, vue par le chauffeur qui l'a pris.
    const fiche = await request(app)
      .get(`/api/packages/${colis.body.id}`)
      .set(authHeaders(jetonChauffeur));
    assert.equal(fiche.status, 200);
    assert.deepEqual(champsInterdits(fiche.body), []);
  });

  it('les annonces de taxi partagé : le net par place, dans les deux devises', async () => {
    const { token: jetonChauffeur } = await createVerifiedDriver();
    const depart = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const annonce = await request(app)
      .post('/api/rides')
      .set(authHeaders(jetonChauffeur))
      .send({ origin: 'Stone Town', destination: 'Nungwi', departureAt: depart, seatsTotal: 4 });
    assert.equal(annonce.status, 201, JSON.stringify(annonce.body));

    const { token: jetonTouriste } = await createTourist();
    await request(app)
      .post(`/api/rides/${annonce.body.id}/book`)
      .set(authHeaders(jetonTouriste))
      .send({ seats: 1 });

    const miennes = await request(app).get('/api/rides/mine').set(authHeaders(jetonChauffeur));
    assert.equal(miennes.status, 200);
    assert.deepEqual(champsInterdits(miennes.body), []);
    const vue = miennes.body[0];
    // Place touriste à 15 USD (privé 45 → place 15) : 25 % pour zanziGo.
    assert.equal(Number(vue.net_par_place_usd), 11.25);
    assert.equal(Number(vue.part_zanzigo_pct), 25);
    // Et le net en shillings suit la règle des comptes ronds.
    assert.equal(Number(vue.net_par_place_tzs) % 1000, 0, 'le net local est un compte rond');
    assert.equal(Number(vue.bookings[0].net_per_seat), 11.25);
  });
});

// ─────────────────── ET CÔTÉ ÉCRAN, LA MÊME DISCIPLINE ─────────────────────
//
// Le serveur ne l'envoie plus : un écran de chauffeur ne peut donc plus
// afficher un prix client, même par erreur. Reste le cas du téléphone qui a
// gardé en mémoire une vieille réponse — et surtout celui du prochain écran
// qu'on ajoutera au portail. `formaterPrix` lit le champ `price` : sa seule
// présence dans un fichier chauffeur est le signe qu'on a recommencé.
describe('Les écrans du chauffeur ne savent pas afficher un prix client', () => {
  const ECRANS_CHAUFFEUR = [
    'mobile/src/app/(driver)/courses.tsx',
    'mobile/src/app/(driver)/annonces.tsx',
    'mobile/src/app/(driver)/compte.tsx',
    'mobile/src/app/(driver)/scanner.tsx',
    'mobile/src/app/course/[id].tsx',
    'mobile/src/app/colis-dispo/[id].tsx',
    'mobile/src/app/annonce/[id].tsx',
  ];

  it('aucun n’appelle formaterPrix — ils passent tous par le gain net', () => {
    const fautifs = ECRANS_CHAUFFEUR.filter((relatif) => {
      const source = readFileSync(path.join(racineDepot, relatif), 'utf8');
      return /\bformaterPrix\b/.test(source);
    });
    assert.deepEqual(
      fautifs,
      [],
      'un écran chauffeur affiche le prix client : passer par GainChauffeur / gainNetChauffeur'
    );
  });
});

describe('…mais l’équipe et le client, eux, voient les montants', () => {
  it('l’équipe garde le prix ET la commission sur la fiche d’une course', async () => {
    const { id } = await coursePrise({ payee: true });
    const vue = await request(app).get(`/api/trips/${id}`).set(adminHeaders());
    assert.equal(vue.status, 200);
    assert.equal(Number(vue.body.price), 45, "l'équipe doit voir ce que le client paie");
    assert.equal(Number(vue.body.commission), 5.4, 'et ce que zanziGo encaisse');
  });

  it('le client voit le prix de SA course', async () => {
    const { id, jetonClient } = await coursePrise({ payee: true });
    const vue = await request(app).get(`/api/trips/${id}`).set(authHeaders(jetonClient));
    assert.equal(vue.status, 200);
    assert.equal(Number(vue.body.price), 45);
  });

  it('le passager voit le prix de la place qu’il réserve', async () => {
    const { token: jetonChauffeur } = await createVerifiedDriver();
    const depart = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    await request(app)
      .post('/api/rides')
      .set(authHeaders(jetonChauffeur))
      .send({ origin: 'Stone Town', destination: 'Nungwi', departureAt: depart, seatsTotal: 4 });
    const { token: jetonTouriste } = await createTourist();
    const liste = await request(app).get('/api/rides').set(authHeaders(jetonTouriste));
    assert.equal(liste.status, 200);
    assert.equal(Number(liste.body[0].price_per_seat_usd), 15, 'sinon il ne peut pas décider');
  });
});
