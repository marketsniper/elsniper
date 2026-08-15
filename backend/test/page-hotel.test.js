// Page /hotel — l'argumentaire qu'on montre à une réception, ou qu'on lui
// envoie après la visite. Elle doit tenir debout toute seule : ce que ça
// coûte à l'hôtel, ce que ça change pour ses clients, les prix affichés, et
// comment démarrer sans rien installer.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, useTestDb } from './setup.js';

useTestDb();

describe('Page hôtels partenaires', () => {
  it('répond aux quatre questions d’un directeur d’hôtel', async () => {
    const res = await request(app).get('/hotel');
    assert.equal(res.status, 200);
    const page = res.text;

    // 1. Combien ça me coûte ?
    assert.match(page, /costs your hotel nothing/i, 'la gratuité n’est pas dite');
    assert.match(page, /5% partner rate/i, 'le tarif partenaire manque');
    // 2. Qu'est-ce que ça change pour mes clients ?
    assert.match(page, /verified/i, 'la vérification des chauffeurs manque');
    assert.match(page, /fixed/i, 'le prix fixe manque');
    // 3. Combien ça leur coûte ?
    assert.match(page, /47\.50/, 'le prix partenaire remisé manque');
    // La remise ne vaut PAS sur les places partagées : la page le dit, et ne
    // les affiche pas remisées.
    assert.match(page, /partner rate applies to private cars/i, 'la limite de la remise n’est pas dite');
    assert.ok(!/13\.30/.test(page), 'une place partagée ne doit pas apparaître remisée');
    // Ce qu'une réception veut vraiment savoir : combien de temps son client
    // va attendre. Les chauffeurs partagent leur position, on envoie le plus
    // proche — c'est l'argument, pas la marge.
    assert.match(page, /straight away/i, 'la disponibilité immédiate n’est pas dite');
    assert.match(page, /share their position/i, 'le repérage GPS des taxis manque');
    assert.ok(!/You keep/i.test(page), 'la colonne de marge ne doit plus figurer');
    assert.match(page, /Nungwi/, 'les destinations manquent');
    // 4. Comment je démarre ?
    assert.match(page, /wa\.me\/255666241749/, 'le contact WhatsApp manque');
    assert.match(page, /20 completed rides/i, 'la fidélité manque');
  });

  it('ne demande jamais d’installer quoi que ce soit', async () => {
    const page = (await request(app).get('/hotel')).text;
    assert.match(page, /Nothing to install|no software to install/i);
    // Le lien vers l'application web, ouvrable depuis n'importe quel appareil.
    assert.match(page, /href="\/web"/);
  });
});
