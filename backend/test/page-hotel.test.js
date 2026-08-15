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

describe('Page restaurants partenaires', () => {
  it('parle au restaurateur, pas à une réception d’hôtel', async () => {
    const res = await request(app).get('/restaurant');
    assert.equal(res.status, 200);
    const page = res.text;

    // Son problème à lui : le dernier service, les clients qui repartent.
    assert.match(page, /costs your restaurant nothing/i, 'la gratuité n’est pas dite');
    assert.match(page, /getting them home/i, 'le sujet du soir n’est pas posé');
    // …et le service colis, le MÊME que celui des hôtels.
    assert.match(page, /parcel/i, 'le service colis manque');
    // zanziGo n'est pas un service de livraison de repas : la page ne doit
    // jamais le laisser croire, et le dit noir sur blanc.
    assert.ok(!/meal order|food delivery|from your kitchen/i.test(page), 'la page vend de la livraison de repas');
    assert.match(page, /not meals to a doorstep/i, 'la page ne dit pas ce qu’on ne fait PAS');
    assert.match(page, /5% partner rate/i, 'le tarif partenaire manque');
    assert.match(page, /47\.50/, 'le prix partenaire remisé manque');
    assert.match(page, /straight away/i, 'la disponibilité immédiate n’est pas dite');
    assert.match(page, /wa\.me\/255666241749/, 'le contact WhatsApp manque');
    assert.match(page, /20 completed rides/i, 'la fidélité manque');
    assert.match(page, /href="\/web"/, 'le lien vers l’application manque');
    // Aucune trace du vocabulaire hôtelier : on ne recycle pas la page.
    assert.ok(!/your guests? deserve/i.test(page), 'texte d’hôtel recyclé');
    assert.ok(!/reception desk/i.test(page), 'texte d’hôtel recyclé');
  });

  it('affiche la grille des colis au vrai prix, sans remise', async () => {
    const page = (await request(app).get('/restaurant')).text;
    assert.match(page, /5\.00/, 'le petit colis manque');
    assert.match(page, /10\.00/, 'le colis moyen manque');
    assert.match(page, /18\.00/, 'le gros colis manque');
    // La remise ne vaut que sur les courses privées : jamais 9,50 sur un colis.
    assert.ok(!/9\.50/.test(page), 'un colis ne doit pas apparaître remisé');
    assert.match(page, /applies to private cars only/i, 'la limite de la remise n’est pas dite');
    assert.match(page, /Parcels between towns/i, 'le colis n’est pas cadré « entre les villes »');
  });

  it('la page hôtels ne promet plus de remise sur les colis', async () => {
    const page = (await request(app).get('/hotel')).text;
    assert.ok(!/9\.50/.test(page), 'la page hôtels affiche encore un colis remisé');
  });
});
