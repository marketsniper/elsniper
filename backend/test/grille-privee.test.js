// LA GRILLE PRIVÉE PART DU NET CHAUFFEUR (21/08/2026).
//
// Renversement du modèle : chaque trajet porte un montant décidé sur le
// terrain — ce que le chauffeur garde — et le prix client est ce net PLUS le
// forfait zanziGo. La commission n'est donc plus un pourcentage.
//
// Ces tests verrouillent les deux bouts : les nets annoncés aux chauffeurs
// (c'est un engagement, ils recrutent dessus) et le forfait qui s'y ajoute.
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

/** Vérifie un trajet dans les DEUX sens : net, forfait, prix client. */
function verifier(depart, arrivee, net, forfait) {
  for (const [a, b] of [
    [depart, arrivee],
    [arrivee, depart],
  ]) {
    assert.equal(netChauffeurPriveUsd(a, b), net, `net ${a} → ${b}`);
    assert.equal(forfaitZanzigoTrajetUsd(a, b), forfait, `forfait ${a} → ${b}`);
    assert.equal(privateUsdForRoute(a, b), net + forfait, `prix client ${a} → ${b}`);
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
        verifier(hub, plage, 45, 5); // client 50 USD
      }
    }
  });

  it('couloir très emprunté : le forfait double, le chauffeur touche pareil', () => {
    // Stone Town et l'aéroport vers les plages du sud-est : la liaison la plus
    // demandée de l'île. C'est le VOLUME qui finance zanziGo, pas le chauffeur
    // — son net ne bouge pas d'un dollar.
    for (const hub of HUBS) {
      for (const plage of ['Paje', 'Bwejuu', 'Jambiani']) {
        verifier(hub, plage, 45, 9); // client 54 USD
      }
    }
    // Et le net est bien le même que vers une plage ordinaire.
    assert.equal(
      netChauffeurPriveUsd('Stone Town', 'Paje'),
      netChauffeurPriveUsd('Stone Town', 'Nungwi')
    );
  });

  it('aéroport ↔ Stone Town : 11 USD au chauffeur, 4 à zanziGo', () => {
    for (const ville of ['Stone Town', 'Stone Town Ferry']) {
      verifier('Aéroport international Abeid Amani Karume', ville, 11, 4); // client 15 USD
    }
  });

  it('les traversées du nord vers le sud : 55 USD au chauffeur, 60 au client', () => {
    for (const nord of ['Nungwi', 'Kendwa']) {
      for (const sud of ['Makunduchi', 'Kizimkazi', 'Mtende', 'Michamvi', 'Dongwe']) {
        verifier(nord, sud, 55, 5); // client 60 USD
      }
    }
  });

  it('depuis le nord, par paliers : 25, 35 puis 50 USD', () => {
    for (const nord of ['Nungwi', 'Kendwa']) {
      for (const ville of ['Matemwe', 'Pwani Mchangani']) verifier(nord, ville, 25, 4);
      for (const ville of ['Kiwengwa', 'Uroa', 'Chwaka']) verifier(nord, ville, 35, 4);
      for (const ville of ['Paje', 'Bwejuu', 'Jambiani']) verifier(nord, ville, 50, 5);
    }
    // Nungwi et Kendwa sont voisins : la règle du nord ne s'applique pas entre eux.
    verifier('Nungwi', 'Kendwa', 10, 4);
  });

  it('sauts de village de la côte est : 10, 15 ou 20 USD', () => {
    verifier('Paje', 'Jambiani', 10, 4);
    verifier('Paje', 'Bwejuu', 10, 4);
    verifier('Paje', 'Makunduchi', 15, 5);
    verifier('Kizimkazi', 'Makunduchi', 15, 5);
    verifier('Makunduchi', 'Mtende', 15, 5);
    // Michamvi et Dongwe sont au bout de la presqu'île : le chauffeur en
    // revient à vide. Plus cher que Makunduchi, pourtant plus loin.
    verifier('Paje', 'Michamvi', 20, 7);
    verifier('Paje', 'Dongwe', 20, 7);
    verifier('Paje', 'Kizimkazi', 20, 7);
    assert.ok(
      netChauffeurPriveUsd('Paje', 'Michamvi') > netChauffeurPriveUsd('Paje', 'Makunduchi'),
      'la presqu’île sans issue doit rester au-dessus du village plus lointain'
    );
  });

  it('la côte sud-est vers la côte nord-est passe par Tunguu : 45, 47 ou 50', () => {
    for (const sudEst of ['Paje', 'Bwejuu', 'Jambiani']) {
      for (const nordEst of ['Chwaka', 'Uroa', 'Pongwe']) verifier(sudEst, nordEst, 45, 5);
      for (const nordEst of ['Kiwengwa', 'Pwani Mchangani', 'Matemwe']) {
        verifier(sudEst, nordEst, 47, 5);
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
        verifier(sud, nordEst, 50, 5);
      }
    }
  });

  it('ce que la liste ne couvre pas retombe sur les kilomètres', () => {
    // Villages voisins de la côte nord-est : aucun groupe ne les nomme.
    verifier('Uroa', 'Pongwe', 10, 4); // ≈ 7 km
    verifier('Matemwe', 'Kiwengwa', 15, 5); // ≈ 22 km
    verifier('Kiwengwa', 'Chwaka', 20, 7); // ≈ 27 km
  });

  it('la côte est se compte en VILLAGES traversés, pas en kilomètres', () => {
    // Michamvi — Dongwe — Bwejuu — Paje — Jambiani — Makunduchi — Mtende —
    // Kizimkazi se suivent sur une seule route. Un voisin immédiat vaut 10,
    // quel que soit le kilométrage : Jambiani ↔ Makunduchi fait 14 km et
    // Michamvi ↔ Dongwe 9, les deux se paient pareil.
    verifier('Jambiani', 'Makunduchi', 10, 4);
    verifier('Michamvi', 'Dongwe', 10, 4);
    verifier('Mtende', 'Kizimkazi', 10, 4);
    verifier('Bwejuu', 'Jambiani', 15, 5); // un village entre les deux
    verifier('Jambiani', 'Kizimkazi', 20, 7); // trois villages et plus
    verifier('Michamvi', 'Makunduchi', 20, 7);
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
    assert.equal(transfert.price, 50);
    assert.equal(transfert.commission, 5);
    assert.equal(transfert.price - transfert.commission, 45, 'le net promis au chauffeur');

    const emprunte = priceTrip('private', 'tourist', { pickup: 'Stone Town', dropoff: 'Paje' });
    assert.equal(emprunte.price, 54);
    assert.equal(emprunte.commission, 9, 'zanziGo double sa part sur le couloir chargé');
    assert.equal(emprunte.price - emprunte.commission, 45, 'le chauffeur touche la même chose');
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
    assert.equal(Number(creation.body.price), 50);
    assert.equal(creation.body.currency, 'USD');
    assert.equal(Number(creation.body.commission), 5);
  });
});
