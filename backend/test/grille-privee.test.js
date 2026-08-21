// LA GRILLE PRIVÉE PART DU NET CHAUFFEUR (21/08/2026).
//
// Renversement du modèle : chaque trajet porte un montant décidé sur le
// terrain — ce que le chauffeur garde — et le prix client est ce net PLUS le
// forfait zanziGo, puis la commission est repassée au POURCENTAGE le même
// jour : 12 % à partir de 40 USD de prix client, 15 % en dessous.
//
// Ces tests verrouillent les deux bouts : les nets annoncés aux chauffeurs
// (c'est un engagement, ils recrutent dessus) et le taux qui s'y applique.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  pricePackage,
  privateUsdForRoute,
  netChauffeurPriveUsd,
  forfaitZanzigoTrajetUsd,
  priceTrip,
  sharedSeatUsdForRoute,
  sharedAllowedForRoute,
} from '../src/services/pricingService.js';
import { app, authHeaders, createTourist, useTestDb } from './setup.js';

useTestDb();

const HUBS = ['Stone Town', 'Aéroport international Abeid Amani Karume'];

/** Une course entre deux villages porte 1 USD de supplément, tout pour zanziGo. */
const estEntreVillages = (a, b) =>
  !HUBS.includes(a) && !HUBS.includes(b) && a !== 'Stone Town Ferry' && b !== 'Stone Town Ferry';

/**
 * Vérifie un trajet dans les DEUX sens : le montant promis au chauffeur, le
 * prix client, et le fait que la commission tombe bien sur 12 ou 15 % sans
 * jamais entamer la promesse.
 */
function verifier(depart, arrivee, net, prixClient) {
  for (const [a, b] of [
    [depart, arrivee],
    [arrivee, depart],
  ]) {
    assert.equal(netChauffeurPriveUsd(a, b), net, `net promis ${a} → ${b}`);
    assert.equal(privateUsdForRoute(a, b), prixClient, `prix client ${a} → ${b}`);
    const course = priceTrip('private', 'tourist', { pickup: a, dropoff: b });
    // Le SUPPLÉMENT de 1 USD entre villages va entier à zanziGo : le taux ne
    // porte donc que sur le reste du prix.
    const supplement = estEntreVillages(a, b) ? 1 : 0;
    const taux = (course.commission - supplement) / (course.price - supplement);
    assert.ok(
      Math.abs(taux - 0.12) < 0.0005 || Math.abs(taux - 0.15) < 0.0005,
      `${a} → ${b} : commission de ${(taux * 100).toFixed(2)} %, attendu 12 ou 15`
    );
    assert.ok(
      course.price - course.commission >= net,
      `${a} → ${b} : le chauffeur ne garde que ${course.price - course.commission}, promis ${net}`
    );
  }
}

describe('Grille privée : le net du chauffeur décide, le forfait s’ajoute', () => {
  it('transfert depuis un hub : 45 USD au chauffeur vers toute l’île', () => {
    // Prix unique quelle que soit la plage — décision de terrain, assumée :
    // un transfert court paie autant qu'un long.
    for (const hub of HUBS) {
      for (const plage of [
        'Nungwi',
        'Kendwa',
        'Matemwe',
        'Pwani Mchangani',
        'Kiwengwa',
        'Pongwe',
        'Uroa',
        'Chwaka',
        'Michamvi',
        'Dongwe',
        'Makunduchi',
        'Mtende',
        'Kizimkazi',
        'Fumba',
      ]) {
        verifier(hub, plage, 45, 52);
      }
    }
  });

  it('le couloir du sud-est : 105 000 TZS ronds au chauffeur, 17 % à zanziGo', () => {
    // Stone Town et l'aéroport vers Paje, Bwejuu et Jambiani : la liaison la
    // plus demandée de l'île, et la plus courte des transferts. Le chauffeur y
    // touche 105 000 TZS tout rond ; zanziGo prend 17 % — c'est le volume qui
    // finance l'infrastructure. Client : 49 USD, sous le transfert ordinaire.
    for (const hub of HUBS) {
      for (const plage of ['Paje', 'Bwejuu', 'Jambiani']) {
        assert.equal(privateUsdForRoute(hub, plage), 49, `prix ${hub} → ${plage}`);
        const course = priceTrip('private', 'tourist', { pickup: hub, dropoff: plage });
        assert.equal(course.commission, 8.33, `${hub} → ${plage} : 17 % de 49`);
        // La promesse en shillings, à la lettre : une course locale rend
        // exactement 105 000 au chauffeur.
        const locale = priceTrip('private', 'local', { pickup: hub, dropoff: plage });
        assert.equal(locale.price - locale.commission, 105000, `${hub} → ${plage} en TZS`);
        assert.ok(
          privateUsdForRoute(hub, plage) < privateUsdForRoute(hub, 'Nungwi'),
          `${hub} → ${plage} doit coûter moins cher que ${hub} → Nungwi`
        );
      }
    }
  });

  it('aéroport ↔ Stone Town : 10 USD au chauffeur, 4,50 fixes à zanziGo', () => {
    // Sept kilomètres, mais la course la plus fréquente de l'île — celle qui
    // tourne toute la journée. Un pourcentage y rapportait 1,95 USD, moins que
    // le coût du service : la commission est donc posée en dollars.
    for (const ville of ['Stone Town', 'Stone Town Ferry']) {
      for (const [a, b] of [
        ['Aéroport international Abeid Amani Karume', ville],
        [ville, 'Aéroport international Abeid Amani Karume'],
      ]) {
        assert.equal(netChauffeurPriveUsd(a, b), 10, `net ${a} → ${b}`);
        assert.equal(privateUsdForRoute(a, b), 14.5, `prix client ${a} → ${b}`);
        const course = priceTrip('private', 'tourist', { pickup: a, dropoff: b });
        assert.equal(course.commission, 4.5, `${a} → ${b} : commission fixe`);
        assert.equal(course.price - course.commission, 10, 'le chauffeur garde ses 10 USD');
      }
    }
  });

  it('les traversées du nord vers le sud : 55 USD au chauffeur, 64 au client', () => {
    for (const nord of ['Nungwi', 'Kendwa']) {
      for (const sud of ['Makunduchi', 'Kizimkazi', 'Mtende', 'Michamvi', 'Dongwe']) {
        verifier(nord, sud, 55, 64);
      }
    }
  });

  it('depuis le nord, par paliers : 25, 35 puis 50 USD', () => {
    for (const nord of ['Nungwi', 'Kendwa']) {
      for (const ville of ['Matemwe', 'Pwani Mchangani']) verifier(nord, ville, 25, 31);
      for (const ville of ['Kiwengwa', 'Uroa', 'Chwaka']) verifier(nord, ville, 35, 41);
      for (const ville of ['Paje', 'Bwejuu', 'Jambiani']) verifier(nord, ville, 50, 58);
    }
    // Nungwi et Kendwa sont voisins : la règle du nord ne s'applique pas entre eux.
    verifier('Nungwi', 'Kendwa', 10, 13);
  });

  it('sauts de village de la côte est : 10, 15 ou 20 USD', () => {
    verifier('Paje', 'Jambiani', 10, 13);
    verifier('Paje', 'Bwejuu', 10, 13);
    verifier('Paje', 'Makunduchi', 15, 19);
    verifier('Kizimkazi', 'Makunduchi', 15, 19);
    verifier('Makunduchi', 'Mtende', 15, 19);
    // Michamvi et Dongwe sont au bout de la presqu'île : le chauffeur en
    // revient à vide. Plus cher que Makunduchi, pourtant plus loin.
    verifier('Paje', 'Michamvi', 20, 25);
    verifier('Paje', 'Dongwe', 20, 25);
    verifier('Paje', 'Kizimkazi', 20, 25);
    assert.ok(
      netChauffeurPriveUsd('Paje', 'Michamvi') > netChauffeurPriveUsd('Paje', 'Makunduchi'),
      'la presqu’île sans issue doit rester au-dessus du village plus lointain'
    );
  });

  it('la côte sud-est vers la côte nord-est passe par Tunguu : 45, 47 ou 50', () => {
    for (const sudEst of ['Paje', 'Bwejuu', 'Jambiani']) {
      for (const nordEst of ['Chwaka', 'Uroa', 'Pongwe']) verifier(sudEst, nordEst, 45, 53);
      for (const nordEst of ['Kiwengwa', 'Pwani Mchangani', 'Matemwe']) {
        verifier(sudEst, nordEst, 47, 55);
      }
    }
    for (const sud of ['Makunduchi', 'Michamvi', 'Dongwe', 'Kizimkazi', 'Mtende']) {
      for (const nordEst of [
        'Uroa',
        'Pongwe',
        'Chwaka',
        'Kiwengwa',
        'Pwani Mchangani',
        'Matemwe',
      ]) {
        verifier(sud, nordEst, 50, 58);
      }
    }
  });

  it('ce que la liste ne couvre pas retombe sur les kilomètres', () => {
    // Villages voisins de la côte nord-est : aucun groupe ne les nomme.
    verifier('Uroa', 'Pongwe', 10, 13); // ≈ 7 km
    verifier('Matemwe', 'Kiwengwa', 15, 19); // ≈ 22 km
    verifier('Kiwengwa', 'Chwaka', 20, 25); // ≈ 27 km
  });

  it('la côte est se compte en VILLAGES traversés, pas en kilomètres', () => {
    // Michamvi — Dongwe — Bwejuu — Paje — Jambiani — Makunduchi — Mtende —
    // Kizimkazi se suivent sur une seule route. Un voisin immédiat vaut 10,
    // quel que soit le kilométrage : Jambiani ↔ Makunduchi fait 14 km et
    // Michamvi ↔ Dongwe 9, les deux se paient pareil.
    verifier('Jambiani', 'Makunduchi', 10, 13);
    verifier('Michamvi', 'Dongwe', 10, 13);
    verifier('Mtende', 'Kizimkazi', 10, 13);
    verifier('Bwejuu', 'Jambiani', 15, 19); // un village entre les deux
    verifier('Jambiani', 'Kizimkazi', 20, 25); // trois villages et plus
    verifier('Michamvi', 'Makunduchi', 20, 25);
    // Un voisin ne peut jamais coûter plus cher qu'un village plus lointain
    // sur la même route — c'est ce que les paliers au kilomètre faisaient.
    assert.ok(
      netChauffeurPriveUsd('Jambiani', 'Makunduchi') <=
        netChauffeurPriveUsd('Paje', 'Makunduchi'),
      'le village voisin dépasse le village d’écart'
    );
  });

  it('la commission est une soustraction, pas un pourcentage', () => {
    const transfert = priceTrip('private', 'tourist', {
      pickup: 'Stone Town',
      dropoff: 'Nungwi',
    });
    assert.equal(transfert.price, 52);
    assert.equal(transfert.commission, 6.24);
    assert.equal(transfert.price - transfert.commission, 45.76, 'le net promis au chauffeur');

    const emprunte = priceTrip('private', 'tourist', { pickup: 'Stone Town', dropoff: 'Paje' });
    assert.equal(emprunte.price, 49);
    assert.equal(emprunte.commission, 8.33, '17 % sur le couloir du sud-est');
    // La promesse du couloir est 105 000 TZS (40,3846 USD) : tenue, arrondie.
    assert.ok(emprunte.price - emprunte.commission >= 105000 / 2600, 'promesse tenue');
  });

  it('la remise ne mord JAMAIS sur la part du chauffeur', () => {
    // Le net est un montant promis, pas un pourcentage : un arrangement passé
    // avec un hôtel ou un résident ne le regarde pas. C'est zanziGo qui paie
    // la remise, quitte à ne rien gagner sur cette course-là.
    for (const audience of ['resident', 'hotel']) {
      for (const [depart, arrivee] of [
        ['Stone Town', 'Nungwi'],
        ['Stone Town', 'Paje'],
        ['Nungwi', 'Makunduchi'],
        ['Paje', 'Jambiani'],
      ]) {
        const course = priceTrip('private', audience, { pickup: depart, dropoff: arrivee });
        const net = netChauffeurPriveUsd(depart, arrivee);
        const garde = course.price - course.commission;
        // Au moins la promesse — et pas plus d'un centime au-dessus : le
        // centime d'arrondi reste chez le chauffeur, jamais chez zanziGo.
        assert.ok(garde >= net - 1e-9, `${audience} ${depart} → ${arrivee} : ${garde} < ${net}`);
        assert.ok(garde <= net + 0.01 + 1e-9, `${audience} ${depart} → ${arrivee} : ${garde} > ${net}`);
        assert.ok(course.commission >= 0, 'zanziGo ne peut pas payer pour rouler');
        assert.ok(course.price <= privateUsdForRoute(depart, arrivee), 'la remise doit baisser');
      }
    }
  });

  it('la place en taxi partagé vaut le tiers du privé', () => {
    for (const [depart, arrivee] of [
      ['Stone Town', 'Nungwi'],
      ['Stone Town', 'Paje'],
      ['Nungwi', 'Makunduchi'],
      ['Paje', 'Chwaka'],
      ['Nungwi', 'Kiwengwa'],
    ]) {
      const prive = privateUsdForRoute(depart, arrivee);
      assert.equal(sharedSeatUsdForRoute(depart, arrivee), Math.floor(prive / 3));
      assert.ok(
        sharedSeatUsdForRoute(depart, arrivee) * 3 <= prive,
        'trois places ne doivent jamais coûter plus cher que la voiture entière'
      );
    }
    // Pas de taxi partagé sur les petits trajets.
    assert.equal(sharedAllowedForRoute('Paje', 'Jambiani'), false);
    assert.equal(sharedAllowedForRoute('Stone Town', 'Nungwi'), true);
  });

  it('la voiture pleine rapporte plus que la course privée', () => {
    // C'est l'argument de recrutement : quatre places suffisent à dépasser le
    // privé, et la voiture en tient six. S'il tombe, la fiche chauffeur ment.
    for (const [depart, arrivee] of [
      ['Stone Town', 'Nungwi'],
      ['Stone Town', 'Paje'],
      ['Nungwi', 'Makunduchi'],
    ]) {
      const place = priceTrip('shared_tourist', 'tourist', { pickup: depart, dropoff: arrivee });
      const gainPlace = place.price - place.commission;
      const netPrive = netChauffeurPriveUsd(depart, arrivee);
      assert.ok(
        gainPlace * 4 > netPrive,
        `${depart} → ${arrivee} : 4 places (${(gainPlace * 4).toFixed(2)}) doivent battre le privé (${netPrive})`
      );
    }
  });

  it('aucun trajet ne coûte plus cher qu’un trajet plus long sur la même route', () => {
    // Un client compare. Matemwe est entre Nungwi et la pointe sud : sa course
    // ne peut pas dépasser celle qui va jusqu'au bout.
    const nordSud = privateUsdForRoute('Nungwi', 'Makunduchi');
    for (const etape of ['Matemwe', 'Kiwengwa', 'Paje', 'Jambiani']) {
      assert.ok(
        privateUsdForRoute('Nungwi', etape) <= nordSud,
        `Nungwi → ${etape} dépasse Nungwi → Makunduchi`
      );
    }
  });

  it('le chauffeur touche des comptes RONDS en shillings', () => {
    // 118 976 devient 118 000 ; les shillings restants rejoignent la
    // commission zanziGo. Un chauffeur vérifie son portefeuille de tête.
    for (const [a, b] of [
      ['Stone Town', 'Nungwi'],
      ['Stone Town', 'Paje'],
      ['Paje', 'Jambiani'],
      ['Nungwi', 'Makunduchi'],
      ['Aéroport international Abeid Amani Karume', 'Stone Town'],
    ]) {
      const course = priceTrip('private', 'local', { pickup: a, dropoff: b });
      const net = course.price - course.commission;
      assert.equal(net % 1000, 0, `${a} → ${b} : ${net} n'est pas un compte rond`);
    }
    // L'exemple fondateur de la règle, à la lettre.
    const nungwi = priceTrip('private', 'local', { pickup: 'Stone Town', dropoff: 'Nungwi' });
    assert.equal(nungwi.price - nungwi.commission, 118000);
    // La place locale et le colis en shillings suivent.
    const place = priceTrip('shared_local', 'local', { pickup: 'Stone Town', dropoff: 'Nungwi' });
    assert.equal(place.price - place.commission, 13000);
    const colis = pricePackage('TZS', 'small');
    assert.equal((colis.price - colis.commission) % 1000, 0);
  });

  it('bout en bout : une course privée Stone Town → Nungwi est créée à 49 USD', async () => {
    const { token, user } = await createTourist();
    const creation = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: user.id,
        tripType: 'private',
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Nungwi',
      });
    assert.equal(creation.status, 201, JSON.stringify(creation.body));
    assert.equal(Number(creation.body.price), 52);
    assert.equal(creation.body.currency, 'USD');
    assert.equal(Number(creation.body.commission), 6.24);
  });
});
