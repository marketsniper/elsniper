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
    const taux = course.commission / course.price;
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

  it('le couloir du sud-est : 15 % pour zanziGo, le chauffeur touche pareil', () => {
    // Stone Town et l'aéroport vers Paje, Bwejuu et Jambiani : la liaison la
    // plus demandée de l'île. zanziGo y prend 15 % au lieu de 12 — c'est le
    // volume qui finance l'infrastructure. Le chauffeur, lui, garde ses 45 USD
    // comme sur n'importe quel autre transfert : c'est le CLIENT qui met la
    // différence, pas lui.
    for (const hub of HUBS) {
      for (const plage of ['Paje', 'Bwejuu', 'Jambiani']) {
        verifier(hub, plage, 45, 53);
        const course = priceTrip('private', 'tourist', { pickup: hub, dropoff: plage });
        assert.equal(course.commission, 7.95, `${hub} → ${plage} : 15 % de 53`);
        assert.ok(
          privateUsdForRoute(hub, plage) > privateUsdForRoute(hub, 'Nungwi'),
          `${hub} → ${plage} doit coûter plus cher que ${hub} → Nungwi`
        );
      }
    }
    // Le net promis ne bouge pas d'un cent entre les deux.
    assert.equal(
      netChauffeurPriveUsd('Stone Town', 'Paje'),
      netChauffeurPriveUsd('Stone Town', 'Nungwi')
    );
  });

  it('aéroport ↔ Stone Town : 11 USD au chauffeur, 13 au client', () => {
    for (const ville of ['Stone Town', 'Stone Town Ferry']) {
      verifier('Aéroport international Abeid Amani Karume', ville, 11, 13);
    }
  });

  it('les traversées du nord vers le sud : 55 USD au chauffeur, 63 au client', () => {
    for (const nord of ['Nungwi', 'Kendwa']) {
      for (const sud of ['Makunduchi', 'Kizimkazi', 'Mtende', 'Michamvi', 'Dongwe']) {
        verifier(nord, sud, 55, 63);
      }
    }
  });

  it('depuis le nord, par paliers : 25, 35 puis 50 USD', () => {
    for (const nord of ['Nungwi', 'Kendwa']) {
      for (const ville of ['Matemwe', 'Pwani Mchangani']) verifier(nord, ville, 25, 30);
      for (const ville of ['Kiwengwa', 'Uroa', 'Chwaka']) verifier(nord, ville, 35, 40);
      for (const ville of ['Paje', 'Bwejuu', 'Jambiani']) verifier(nord, ville, 50, 57);
    }
    // Nungwi et Kendwa sont voisins : la règle du nord ne s'applique pas entre eux.
    verifier('Nungwi', 'Kendwa', 10, 12);
  });

  it('sauts de village de la côte est : 10, 15 ou 20 USD', () => {
    verifier('Paje', 'Jambiani', 10, 12);
    verifier('Paje', 'Bwejuu', 10, 12);
    verifier('Paje', 'Makunduchi', 15, 18);
    verifier('Kizimkazi', 'Makunduchi', 15, 18);
    verifier('Makunduchi', 'Mtende', 15, 18);
    // Michamvi et Dongwe sont au bout de la presqu'île : le chauffeur en
    // revient à vide. Plus cher que Makunduchi, pourtant plus loin.
    verifier('Paje', 'Michamvi', 20, 24);
    verifier('Paje', 'Dongwe', 20, 24);
    verifier('Paje', 'Kizimkazi', 20, 24);
    assert.ok(
      netChauffeurPriveUsd('Paje', 'Michamvi') > netChauffeurPriveUsd('Paje', 'Makunduchi'),
      'la presqu’île sans issue doit rester au-dessus du village plus lointain'
    );
  });

  it('la côte sud-est vers la côte nord-est passe par Tunguu : 45, 47 ou 50', () => {
    for (const sudEst of ['Paje', 'Bwejuu', 'Jambiani']) {
      for (const nordEst of ['Chwaka', 'Uroa', 'Pongwe']) verifier(sudEst, nordEst, 45, 52);
      for (const nordEst of ['Kiwengwa', 'Pwani Mchangani', 'Matemwe']) {
        verifier(sudEst, nordEst, 47, 54);
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
        verifier(sud, nordEst, 50, 57);
      }
    }
  });

  it('ce que la liste ne couvre pas retombe sur les kilomètres', () => {
    // Villages voisins de la côte nord-est : aucun groupe ne les nomme.
    verifier('Uroa', 'Pongwe', 10, 12); // ≈ 7 km
    verifier('Matemwe', 'Kiwengwa', 15, 18); // ≈ 22 km
    verifier('Kiwengwa', 'Chwaka', 20, 24); // ≈ 27 km
  });

  it('la côte est se compte en VILLAGES traversés, pas en kilomètres', () => {
    // Michamvi — Dongwe — Bwejuu — Paje — Jambiani — Makunduchi — Mtende —
    // Kizimkazi se suivent sur une seule route. Un voisin immédiat vaut 10,
    // quel que soit le kilométrage : Jambiani ↔ Makunduchi fait 14 km et
    // Michamvi ↔ Dongwe 9, les deux se paient pareil.
    verifier('Jambiani', 'Makunduchi', 10, 12);
    verifier('Michamvi', 'Dongwe', 10, 12);
    verifier('Mtende', 'Kizimkazi', 10, 12);
    verifier('Bwejuu', 'Jambiani', 15, 18); // un village entre les deux
    verifier('Jambiani', 'Kizimkazi', 20, 24); // trois villages et plus
    verifier('Michamvi', 'Makunduchi', 20, 24);
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
    assert.equal(emprunte.price, 53);
    assert.equal(emprunte.commission, 7.95, '15 % sur le couloir du sud-est');
    assert.ok(emprunte.price - emprunte.commission >= 45, 'les 45 USD promis sont tenus');
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
        assert.equal(
          course.price - course.commission,
          net,
          `${audience} ${depart} → ${arrivee} : le chauffeur doit garder ${net}`
        );
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
