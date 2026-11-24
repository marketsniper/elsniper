// « Le chauffeur ne peut pas démarrer la course sur les taxis partagés, je
// n'ai pas vu l'option. Et je dois avoir un visu sur les courses futures ou
// en cours en taxi partagé. »
//
// Une annonce savait s'ouvrir, se clore et s'annuler — jamais rouler. Elle a
// maintenant deux états de plus (en route, terminé) et deux touches pour y
// arriver : PATCH /rides/:id/start et PATCH /rides/:id/complete.
//
// Ces tests verrouillent ce qui coûterait cher si ça cassait en silence :
//  - la fenêtre de départ (pas la veille, pas trois jours après) ;
//  - qui a le droit de toucher (le chauffeur de l'annonce, l'équipe, personne
//    d'autre) ;
//  - UN TRAJET PARTI NE S'ANNULE PLUS : annuler une annonce rembourse 100 %
//    des places payées — sur une voiture qui roule, ce serait rendre l'argent
//    de passagers qu'on transporte ;
//  - démarrer et terminer ne bougent AUCUN montant ;
//  - un « Terminer » oublié ne laisse pas une voiture « en route » à jamais ;
//  - le nom d'un passager reste réservé aux places payées, même en route.
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import { cloturerRidesPartis } from '../src/routes/rides.js';
import {
  adminHeaders,
  app,
  authHeaders,
  createTourist,
  createVerifiedDriver,
  useTestDb,
} from './setup.js';

useTestDb();

// ===== Aides =====

/** Une annonce Stone Town → Nungwi, départ dans 72 h (donc réservable). */
async function annoncePostee({ seatsTotal = 4 } = {}) {
  const { token: tokenChauffeur, driver } = await createVerifiedDriver();
  const res = await request(app)
    .post('/api/rides')
    .set(authHeaders(tokenChauffeur))
    .send({
      origin: 'Stone Town',
      destination: 'Nungwi',
      departureAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
      seatsTotal,
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { annonce: res.body, tokenChauffeur, driver };
}

/**
 * Le temps qui passe : l'API refuse (à raison) de poster un départ passé ou
 * de le déplacer — on avance donc l'horloge de l'annonce en base, par rapport
 * au `now()` de PostgreSQL. `'30 minutes'` : départ dans une demi-heure ;
 * `'-11 minutes'` : parti depuis onze minutes.
 */
async function departDans(rideId, intervalle) {
  await pool.query(
    `UPDATE posted_rides SET departure_at = now() + $2::interval WHERE id = $1`,
    [rideId, intervalle]
  );
}

/** La vérité : la ligne telle qu'elle est en base. */
async function enBase(rideId) {
  const { rows } = await pool.query('SELECT * FROM posted_rides WHERE id = $1', [rideId]);
  return rows[0];
}

const demarrer = (rideId, entetes) => {
  const req = request(app).patch(`/api/rides/${rideId}/start`);
  return entetes ? req.set(entetes) : req;
};
const terminer = (rideId, entetes) => {
  const req = request(app).patch(`/api/rides/${rideId}/complete`);
  return entetes ? req.set(entetes) : req;
};

/** Un touriste réserve ; `payer: true` solde la place dans la foulée. */
async function reserver(rideId, { seats = 1, payer = false, fullName } = {}) {
  const { token, user } = await createTourist(fullName ? { fullName } : {});
  const resa = await request(app)
    .post(`/api/rides/${rideId}/book`)
    .set(authHeaders(token))
    .send({ seats, method: 'carte' });
  assert.equal(resa.status, 201, JSON.stringify(resa.body));
  if (payer) {
    const confirme = await request(app)
      .post(`/api/payments/${resa.body.payment.id}/confirm`)
      .set(authHeaders(token));
    assert.equal(confirme.status, 200, JSON.stringify(confirme.body));
  }
  return { token, user, bookingId: resa.body.booking_id, paymentId: resa.body.payment.id };
}

/** Une annonce avec UNE place payée, puis démarrée par son chauffeur. */
async function trajetEnRouteAvecPlacePayee() {
  const { annonce, tokenChauffeur, driver } = await annoncePostee();
  const client = await reserver(annonce.id, { seats: 2, payer: true });
  await departDans(annonce.id, '30 minutes');
  const depart = await demarrer(annonce.id, authHeaders(tokenChauffeur));
  assert.equal(depart.status, 200, JSON.stringify(depart.body));
  return { annonce, tokenChauffeur, driver, client };
}

/** Le paiement et la réservation d'une place, lus en base. */
async function argentDeLaPlace(client) {
  const { rows: paiements } = await pool.query(
    `SELECT status, amount, surcharge, refund_amount, refund_due_at
       FROM payments WHERE id = $1`,
    [client.paymentId]
  );
  const { rows: resas } = await pool.query(
    'SELECT paid_at, cancelled_at FROM ride_bookings WHERE id = $1',
    [client.bookingId]
  );
  return { paiement: paiements[0], reservation: resas[0] };
}

/** Aucun remboursement ouvert, place toujours payée et active. */
async function rienARembourser(client, contexte) {
  const { paiement, reservation } = await argentDeLaPlace(client);
  assert.equal(paiement.status, 'confirmed', `${contexte} : le paiement reste confirmé`);
  assert.equal(paiement.refund_due_at, null, `${contexte} : AUCUN remboursement ne doit s'ouvrir`);
  assert.equal(paiement.refund_amount, null, `${contexte} : aucun montant à rendre`);
  assert.equal(reservation.cancelled_at, null, `${contexte} : la place reste active`);
  assert.notEqual(reservation.paid_at, null, `${contexte} : la place reste payée`);
  const dus = await request(app).get('/api/payments/remboursements').set(adminHeaders());
  assert.equal(dus.status, 200);
  assert.equal(dus.body.length, 0, `${contexte} : rien dans « Remboursements à verser »`);
}

/**
 * Écoute ce qui part RÉELLEMENT vers le WhatsApp de l'équipe.
 *
 * Sans canal configuré, notifierEquipe ne trace que le sujet : pour lire le
 * TEXTE du message (places à bord, durée…), on branche le canal WhatsApp sur
 * une passerelle factice — c'est le vrai chemin de production, jusqu'à
 * l'appel réseau exclu.
 */
function ecouterWhatsappEquipe(t) {
  const messages = [];
  const cleAvant = config.callmebot.apiKey;
  config.callmebot.apiKey = 'cle-de-test';
  mock.method(globalThis, 'fetch', async (url) => {
    const texte = new URL(String(url)).searchParams.get('text');
    if (texte) messages.push(texte);
    return new Response('Message queued', { status: 200 });
  });
  t.after(() => {
    config.callmebot.apiKey = cleAvant;
    mock.restoreAll();
  });
  return messages;
}

/** Les alertes partent « en l'air » (sans await) : on leur laisse le temps. */
async function attendre(trouver, delaiMs = 3000) {
  const fin = Date.now() + delaiMs;
  for (;;) {
    const valeur = trouver();
    if (valeur || Date.now() > fin) return valeur;
    await new Promise((r) => setTimeout(r, 20));
  }
}

/**
 * Force le PIRE entrelacement de requêtes concurrentes : chacune lit l'annonce
 * (et la voit encore « ouverte ») avant qu'aucune n'ait écrit. Sans cela,
 * deux requêtes lancées « en même temps » passent le plus souvent l'une après
 * l'autre, et un UPDATE non atomique passerait le test par chance.
 *
 * Les routes lisent l'annonce par `SELECT * FROM posted_rides WHERE id = $1` :
 * on retient le résultat de cette lecture jusqu'à ce que `combien` requêtes
 * l'aient faite. Le compteur rendu permet de vérifier que la barrière a bien
 * joué (si la lecture change de forme, le test le dit au lieu de passer).
 */
function lireTousAvantDEcrire(t, combien) {
  const vraieRequete = pool.query.bind(pool);
  const etat = { lectures: 0 };
  let ouvrir;
  const barriere = new Promise((r) => {
    ouvrir = r;
  });
  // Filet : si la barrière n'est jamais atteinte, on ne bloque pas la suite.
  const filet = setTimeout(ouvrir, 3000);
  mock.method(pool, 'query', async (texte, ...reste) => {
    const resultat = await vraieRequete(texte, ...reste);
    if (typeof texte === 'string' && texte.trim() === 'SELECT * FROM posted_rides WHERE id = $1') {
      etat.lectures += 1;
      if (etat.lectures >= combien) ouvrir();
      await barriere;
    }
    return resultat;
  });
  etat.lever = () => {
    clearTimeout(filet);
    mock.restoreAll();
  };
  t.after(etat.lever);
  return etat;
}

// ===== Le départ =====

describe('Taxi partagé — le chauffeur déclare le départ', () => {
  it('dans la fenêtre : en route, heure réelle notée, plus listé ni réservable', async () => {
    const { annonce, tokenChauffeur } = await annoncePostee();
    const { token: tokenTouriste } = await createTourist();
    await departDans(annonce.id, '30 minutes');

    // Avant : l'annonce est bien sur la place de marché (sinon son absence
    // après le départ ne prouverait rien).
    const avant = await request(app).get('/api/rides').set(authHeaders(tokenTouriste));
    assert.ok(avant.body.find((r) => r.id === annonce.id), 'annonce listée avant le départ');

    const res = await demarrer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.id, annonce.id);
    assert.equal(res.body.status, 'in_progress');
    assert.ok(res.body.started_at, 'started_at doit figurer dans la réponse');
    assert.equal(res.body.completed_at, null);

    // La vérité est en base.
    const ligne = await enBase(annonce.id);
    assert.equal(ligne.status, 'in_progress');
    assert.ok(ligne.started_at instanceof Date, 'started_at écrit en base');
    assert.ok(
      Math.abs(Date.now() - ligne.started_at.getTime()) < 15_000,
      'started_at = maintenant, pas l’heure annoncée'
    );
    assert.equal(new Date(res.body.started_at).getTime(), ligne.started_at.getTime());
    assert.equal(ligne.completed_at, null);
    assert.equal(ligne.seats_available, 4, 'les places ne bougent pas au départ');

    // Plus sur la place de marché…
    const apres = await request(app).get('/api/rides').set(authHeaders(tokenTouriste));
    assert.equal(apres.status, 200);
    assert.equal(apres.body.find((r) => r.id === annonce.id), undefined);

    // …et plus réservable, alors même que l'heure annoncée n'est pas passée.
    const resa = await request(app)
      .post(`/api/rides/${annonce.id}/book`)
      .set(authHeaders(tokenTouriste))
      .send({ seats: 1 });
    assert.equal(resa.status, 409, JSON.stringify(resa.body));
    assert.equal(resa.body.error.code, 'ride_closed');
    assert.equal((await enBase(annonce.id)).seats_available, 4, 'aucune place décomptée');
    const { rows: resas } = await pool.query(
      'SELECT count(*)::int AS n FROM ride_bookings WHERE ride_id = $1',
      [annonce.id]
    );
    assert.equal(resas[0].n, 0, 'aucune réservation créée sur un trajet parti');
  });

  it('le chauffeur reçoit son annonce SANS prix de place — ses gains seulement', async () => {
    const { annonce, tokenChauffeur } = await annoncePostee();
    await departDans(annonce.id, '30 minutes');
    const res = await demarrer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    // Même toilette que GET /rides/mine : ni le prix local ni le prix touriste.
    assert.ok(!('price_per_seat' in res.body), 'le prix local ne sort pas vers le chauffeur');
    assert.ok(!('price_per_seat_usd' in res.body), 'le prix touriste non plus');
    // Ni par la bande : le lien « demande de place » écrit le prix en clair.
    assert.ok(!('whatsapp_link' in res.body), 'le lien client (qui porte le prix) ne sort pas');
    assert.ok(
      !decodeURIComponent(JSON.stringify(res.body)).includes('Prix par place'),
      'aucun « Prix par place » nulle part dans la réponse'
    );
    assert.ok(res.body.net_par_place_tzs > 0, 'il voit ce qu’une place lui rapporte (TZS)');
    assert.ok(res.body.net_par_place_usd > 0, 'et en USD');
    // Et c'est exactement ce que GET /rides/mine lui montre.
    const mine = await request(app).get('/api/rides/mine').set(authHeaders(tokenChauffeur));
    const dansMaListe = mine.body.find((r) => r.id === annonce.id);
    assert.ok(!('whatsapp_link' in dansMaListe), 'GET /rides/mine ne rend pas le lien non plus');
    assert.ok(
      !decodeURIComponent(JSON.stringify(dansMaListe)).includes('Prix par place'),
      'ni le prix en clair'
    );
    assert.equal(res.body.net_par_place_tzs, dansMaListe.net_par_place_tzs);
    assert.equal(res.body.net_par_place_usd, dansMaListe.net_par_place_usd);
  });

  it('trop tôt → 409 too_early ; la borne est bien à 60 minutes du départ', async () => {
    const { annonce, tokenChauffeur } = await annoncePostee();

    // Départ dans 72 h : la veille, l'avant-veille… jamais.
    const tresTot = await demarrer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(tresTot.status, 409, JSON.stringify(tresTot.body));
    assert.equal(tresTot.body.error.code, 'too_early');

    // 62 minutes avant : encore trop tôt.
    await departDans(annonce.id, '62 minutes');
    const presque = await demarrer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(presque.status, 409, JSON.stringify(presque.body));
    assert.equal(presque.body.error.code, 'too_early');

    // Un refus n'écrit RIEN.
    const ligne = await enBase(annonce.id);
    assert.equal(ligne.status, 'open');
    assert.equal(ligne.started_at, null);

    // 58 minutes avant : la fenêtre est ouverte.
    await departDans(annonce.id, '58 minutes');
    const ok = await demarrer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal((await enBase(annonce.id)).status, 'in_progress');
  });

  it('trop tard → 409 too_late ; la borne est bien à 12 heures après le départ', async () => {
    const { annonce, tokenChauffeur } = await annoncePostee();

    await departDans(annonce.id, '-12 hours -5 minutes');
    const tropTard = await demarrer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(tropTard.status, 409, JSON.stringify(tropTard.body));
    assert.equal(tropTard.body.error.code, 'too_late');
    const ligne = await enBase(annonce.id);
    assert.notEqual(ligne.status, 'in_progress');
    assert.equal(ligne.started_at, null, 'un refus n’écrit rien');

    // 11 h 55 après l'heure annoncée : un gros retard, mais ça se démarre.
    await departDans(annonce.id, '-11 hours -55 minutes');
    const ok = await demarrer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal((await enBase(annonce.id)).status, 'in_progress');
  });

  it('annonce close toute seule (10 min après l’heure) : le chauffeur en retard démarre quand même', async () => {
    const { annonce, tokenChauffeur } = await annoncePostee();
    await departDans(annonce.id, '-11 minutes');

    // Une lecture déclenche le balayage : l'annonce est CLOSE.
    const mine = await request(app).get('/api/rides/mine').set(authHeaders(tokenChauffeur));
    assert.equal(mine.body.find((r) => r.id === annonce.id).status, 'closed');
    assert.equal((await enBase(annonce.id)).status, 'closed');

    const res = await demarrer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, 'in_progress');
    const ligne = await enBase(annonce.id);
    assert.equal(ligne.status, 'in_progress');
    assert.ok(ligne.started_at instanceof Date);
  });

  it('double départ → 409 invalid_status, l’heure du premier départ n’est pas écrasée', async () => {
    const { annonce, tokenChauffeur } = await annoncePostee();
    await departDans(annonce.id, '30 minutes');

    const premier = await demarrer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(premier.status, 200, JSON.stringify(premier.body));
    const heureDuDepart = (await enBase(annonce.id)).started_at.getTime();

    await new Promise((r) => setTimeout(r, 30));
    const second = await demarrer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(second.status, 409, JSON.stringify(second.body));
    assert.equal(second.body.error.code, 'invalid_status');
    assert.match(second.body.error.message, /in_progress/, 'le refus dit le statut actuel');
    assert.equal((await enBase(annonce.id)).started_at.getTime(), heureDuDepart);
  });

  it('trois touches EN MÊME TEMPS (chauffeur ×2, équipe) : un seul départ passe', async (t) => {
    const { annonce, tokenChauffeur } = await annoncePostee();
    await departDans(annonce.id, '30 minutes');

    // Les trois requêtes ont LU l'annonce « ouverte » avant la première
    // écriture : seule la condition de statut DANS le UPDATE les départage.
    const barriere = lireTousAvantDEcrire(t, 3);
    const reponses = await Promise.all([
      demarrer(annonce.id, authHeaders(tokenChauffeur)),
      demarrer(annonce.id, authHeaders(tokenChauffeur)),
      demarrer(annonce.id, adminHeaders()),
    ]);
    barriere.lever();
    assert.equal(barriere.lectures, 3, 'les trois ont lu avant qu’aucune n’écrive');
    const codes = reponses.map((r) => r.status).sort();
    assert.deepEqual(codes, [200, 409, 409], JSON.stringify(reponses.map((r) => r.body)));
    for (const refus of reponses.filter((r) => r.status === 409)) {
      assert.equal(refus.body.error.code, 'invalid_status');
    }
    // L'heure renvoyée au gagnant est celle qui est restée en base.
    const gagnant = reponses.find((r) => r.status === 200);
    assert.equal(
      new Date(gagnant.body.started_at).getTime(),
      (await enBase(annonce.id)).started_at.getTime()
    );
  });

  it('annonce annulée → 409 invalid_status : on ne démarre pas un trajet annulé', async () => {
    const { annonce, tokenChauffeur } = await annoncePostee();
    await departDans(annonce.id, '30 minutes');
    const annulee = await request(app)
      .patch(`/api/rides/${annonce.id}`)
      .set(authHeaders(tokenChauffeur))
      .send({ status: 'cancelled' });
    assert.equal(annulee.status, 200, JSON.stringify(annulee.body));

    const res = await demarrer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.error.code, 'invalid_status');
    assert.match(res.body.error.message, /cancelled/);
    const ligne = await enBase(annonce.id);
    assert.equal(ligne.status, 'cancelled');
    assert.equal(ligne.started_at, null);
  });

  // Le détour : annulée → close → démarrée. Annuler rembourse les passagers ;
  // si l'annonce pouvait ensuite redevenir « close », elle se démarrait, et
  // l'équipe voyait « en route » un trajet dont elle doit rendre l'argent —
  // sans plus pouvoir le corriger, puisqu'un trajet parti ne se modifie plus.
  it('une annonce annulée ne se rouvre ni ne se clôt : le détour vers « en route » est fermé', async () => {
    const { annonce, tokenChauffeur } = await annoncePostee();
    const client = await reserver(annonce.id, { seats: 2, payer: true });
    await departDans(annonce.id, '30 minutes');
    const annulee = await request(app)
      .patch(`/api/rides/${annonce.id}`)
      .set(authHeaders(tokenChauffeur))
      .send({ status: 'cancelled' });
    assert.equal(annulee.status, 200, JSON.stringify(annulee.body));
    const { paiement: avant } = await argentDeLaPlace(client);
    assert.notEqual(avant.refund_due_at, null, 'l’annulation a bien ouvert le remboursement');

    // Ni le chauffeur ni l'équipe ne la font ressortir de « annulée ».
    for (const [qui, entetes] of [
      ['chauffeur', authHeaders(tokenChauffeur)],
      ['équipe', adminHeaders()],
    ]) {
      for (const status of ['closed', 'open']) {
        const res = await request(app)
          .patch(`/api/rides/${annonce.id}`)
          .set(entetes)
          .send({ status });
        assert.equal(res.status, 409, `${qui} → ${status} : ${JSON.stringify(res.body)}`);
        assert.equal(res.body.error.code, 'invalid_status');
        assert.match(res.body.error.message, /cancelled/);
      }
    }
    // Répéter l'annulation reste sans effet ni erreur (double toucher).
    const encore = await request(app)
      .patch(`/api/rides/${annonce.id}`)
      .set(authHeaders(tokenChauffeur))
      .send({ status: 'cancelled' });
    assert.equal(encore.status, 200, JSON.stringify(encore.body));

    const depart = await demarrer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(depart.status, 409, JSON.stringify(depart.body));
    assert.equal(depart.body.error.code, 'invalid_status');

    const ligne = await enBase(annonce.id);
    assert.equal(ligne.status, 'cancelled', 'toujours annulée en base');
    assert.equal(ligne.started_at, null, 'jamais démarrée');
    const { paiement: apres } = await argentDeLaPlace(client);
    assert.notEqual(apres.refund_due_at, null, 'le remboursement dû reste dû');
    assert.equal(String(apres.refund_amount), String(avant.refund_amount), 'au même montant');
  });

  it('autre chauffeur → 403, client → 403, sans jeton → 401, annonce inconnue → 404', async () => {
    const { annonce, tokenChauffeur } = await annoncePostee();
    await departDans(annonce.id, '30 minutes');
    const { token: tokenAutreChauffeur } = await createVerifiedDriver();
    const { token: tokenTouriste } = await createTourist();

    const autre = await demarrer(annonce.id, authHeaders(tokenAutreChauffeur));
    assert.equal(autre.status, 403, JSON.stringify(autre.body));
    assert.equal(autre.body.error.code, 'forbidden');

    const client = await demarrer(annonce.id, authHeaders(tokenTouriste));
    assert.equal(client.status, 403, JSON.stringify(client.body));
    assert.equal(client.body.error.code, 'forbidden');

    const anonyme = await demarrer(annonce.id);
    assert.equal(anonyme.status, 401);

    const inconnue = await demarrer(randomUUID(), authHeaders(tokenChauffeur));
    assert.equal(inconnue.status, 404);
    assert.equal(inconnue.body.error.code, 'not_found');

    // Personne n'a rien démarré.
    const ligne = await enBase(annonce.id);
    assert.equal(ligne.status, 'open');
    assert.equal(ligne.started_at, null);
  });
});

// ===== L'arrivée =====

describe('Taxi partagé — le chauffeur déclare l’arrivée', () => {
  it('en route → terminé, heure réelle d’arrivée notée ; un second « Terminer » → 409', async () => {
    const { annonce, tokenChauffeur } = await annoncePostee();
    await departDans(annonce.id, '30 minutes');
    await demarrer(annonce.id, authHeaders(tokenChauffeur));
    const heureDuDepart = (await enBase(annonce.id)).started_at.getTime();

    const res = await terminer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, 'completed');
    assert.ok(res.body.completed_at, 'completed_at doit figurer dans la réponse');
    assert.ok(res.body.started_at, 'started_at reste dans la réponse');
    assert.ok(!('price_per_seat' in res.body), 'toujours sans prix de place pour le chauffeur');

    const ligne = await enBase(annonce.id);
    assert.equal(ligne.status, 'completed');
    assert.ok(ligne.completed_at instanceof Date, 'completed_at écrit en base');
    assert.ok(Math.abs(Date.now() - ligne.completed_at.getTime()) < 15_000);
    assert.equal(ligne.started_at.getTime(), heureDuDepart, 'l’arrivée ne réécrit pas le départ');
    assert.ok(ligne.completed_at.getTime() >= ligne.started_at.getTime());
    assert.equal(new Date(res.body.completed_at).getTime(), ligne.completed_at.getTime());

    const heureArrivee = ligne.completed_at.getTime();
    await new Promise((r) => setTimeout(r, 30));
    const second = await terminer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(second.status, 409, JSON.stringify(second.body));
    assert.equal(second.body.error.code, 'invalid_status');
    assert.match(second.body.error.message, /completed/);
    assert.equal((await enBase(annonce.id)).completed_at.getTime(), heureArrivee);

    // Et un trajet terminé ne se redémarre pas.
    const redemarre = await demarrer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(redemarre.status, 409);
    assert.equal(redemarre.body.error.code, 'invalid_status');
    assert.equal((await enBase(annonce.id)).status, 'completed');
  });

  it('deux « Terminer » EN MÊME TEMPS : une seule arrivée passe', async (t) => {
    const { annonce, tokenChauffeur } = await annoncePostee();
    await departDans(annonce.id, '30 minutes');
    await demarrer(annonce.id, authHeaders(tokenChauffeur));

    const barriere = lireTousAvantDEcrire(t, 2);
    const reponses = await Promise.all([
      terminer(annonce.id, authHeaders(tokenChauffeur)),
      terminer(annonce.id, adminHeaders()),
    ]);
    barriere.lever();
    assert.equal(barriere.lectures, 2, 'les deux ont lu « en route » avant qu’aucune n’écrive');
    assert.deepEqual(
      reponses.map((r) => r.status).sort(),
      [200, 409],
      JSON.stringify(reponses.map((r) => r.body))
    );
    const refus = reponses.find((r) => r.status === 409);
    assert.equal(refus.body.error.code, 'invalid_status');
    assert.match(refus.body.error.message, /completed/, 'le refus dit le statut RELU, pas celui lu avant');
    const gagnant = reponses.find((r) => r.status === 200);
    assert.equal(
      new Date(gagnant.body.completed_at).getTime(),
      (await enBase(annonce.id)).completed_at.getTime()
    );
  });

  it('arrivée sans départ → 409 invalid_status (annonce ouverte, close ou annulée)', async () => {
    const { annonce, tokenChauffeur } = await annoncePostee();
    await departDans(annonce.id, '30 minutes');

    const ouverte = await terminer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(ouverte.status, 409, JSON.stringify(ouverte.body));
    assert.equal(ouverte.body.error.code, 'invalid_status');
    assert.match(ouverte.body.error.message, /open/);

    await request(app)
      .patch(`/api/rides/${annonce.id}`)
      .set(authHeaders(tokenChauffeur))
      .send({ status: 'closed' });
    const close = await terminer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(close.status, 409);
    assert.equal(close.body.error.code, 'invalid_status');

    await request(app)
      .patch(`/api/rides/${annonce.id}`)
      .set(authHeaders(tokenChauffeur))
      .send({ status: 'cancelled' });
    const annulee = await terminer(annonce.id, adminHeaders());
    assert.equal(annulee.status, 409);
    assert.equal(annulee.body.error.code, 'invalid_status');

    const ligne = await enBase(annonce.id);
    assert.equal(ligne.status, 'cancelled');
    assert.equal(ligne.completed_at, null, 'aucune arrivée écrite');
  });

  it('autre chauffeur → 403, client → 403, sans jeton → 401 : le trajet reste en route', async () => {
    const { annonce, tokenChauffeur } = await annoncePostee();
    await departDans(annonce.id, '30 minutes');
    await demarrer(annonce.id, authHeaders(tokenChauffeur));
    const { token: tokenAutreChauffeur } = await createVerifiedDriver();
    const { token: tokenTouriste } = await createTourist();

    const autre = await terminer(annonce.id, authHeaders(tokenAutreChauffeur));
    assert.equal(autre.status, 403, JSON.stringify(autre.body));
    assert.equal(autre.body.error.code, 'forbidden');
    const client = await terminer(annonce.id, authHeaders(tokenTouriste));
    assert.equal(client.status, 403);
    assert.equal(client.body.error.code, 'forbidden');
    const anonyme = await terminer(annonce.id);
    assert.equal(anonyme.status, 401);
    const inconnue = await terminer(randomUUID(), authHeaders(tokenChauffeur));
    assert.equal(inconnue.status, 404);

    const ligne = await enBase(annonce.id);
    assert.equal(ligne.status, 'in_progress');
    assert.equal(ligne.completed_at, null);
  });

  it('l’équipe (clé seule) peut démarrer puis terminer à la place du chauffeur', async () => {
    const { annonce } = await annoncePostee();
    await departDans(annonce.id, '30 minutes');

    const depart = await demarrer(annonce.id, adminHeaders());
    assert.equal(depart.status, 200, JSON.stringify(depart.body));
    assert.equal(depart.body.status, 'in_progress');
    assert.ok(depart.body.started_at);
    // L'équipe garde la double grille (comme sur PATCH /rides/:id).
    assert.equal(Number(depart.body.price_per_seat), 17000);
    assert.equal(Number(depart.body.price_per_seat_usd), 12);
    assert.equal((await enBase(annonce.id)).status, 'in_progress');

    const arrivee = await terminer(annonce.id, adminHeaders());
    assert.equal(arrivee.status, 200, JSON.stringify(arrivee.body));
    assert.equal(arrivee.body.status, 'completed');
    assert.ok(arrivee.body.completed_at);
    const ligne = await enBase(annonce.id);
    assert.equal(ligne.status, 'completed');
    assert.ok(ligne.completed_at instanceof Date);
  });
});

// ===== Un trajet parti ne se retouche plus =====

describe('Taxi partagé — un trajet parti ne s’annule plus et ne se rouvre plus', () => {
  // Toutes les modifications que PATCH /rides/:id sait faire.
  const MODIFICATIONS = [
    { status: 'cancelled' },
    { status: 'closed' },
    { status: 'open' },
    { seatsAvailable: 1 },
    { seatsAvailable: 0, status: 'cancelled' },
  ];

  it('EN ROUTE : annulation, clôture, réouverture, places → 409, et AUCUN remboursement', async () => {
    const { annonce, tokenChauffeur, client } = await trajetEnRouteAvecPlacePayee();
    const avant = await enBase(annonce.id);

    for (const entetes of [authHeaders(tokenChauffeur), adminHeaders()]) {
      for (const corps of MODIFICATIONS) {
        const res = await request(app).patch(`/api/rides/${annonce.id}`).set(entetes).send(corps);
        assert.equal(res.status, 409, `${JSON.stringify(corps)} → ${JSON.stringify(res.body)}`);
        assert.equal(res.body.error.code, 'invalid_status');
        assert.match(res.body.error.message, /in_progress/);
      }
    }

    const apres = await enBase(annonce.id);
    assert.equal(apres.status, 'in_progress', 'toujours en route');
    assert.equal(apres.seats_available, avant.seats_available, 'places inchangées');
    assert.equal(apres.started_at.getTime(), avant.started_at.getTime());
    // L'enjeu : la place payée n'a PAS été remboursée.
    await rienARembourser(client, 'trajet en route');
  });

  it('TERMINÉ : mêmes refus, toujours aucun remboursement', async () => {
    const { annonce, tokenChauffeur, client } = await trajetEnRouteAvecPlacePayee();
    const arrivee = await terminer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(arrivee.status, 200, JSON.stringify(arrivee.body));
    const avant = await enBase(annonce.id);

    for (const entetes of [authHeaders(tokenChauffeur), adminHeaders()]) {
      for (const corps of MODIFICATIONS) {
        const res = await request(app).patch(`/api/rides/${annonce.id}`).set(entetes).send(corps);
        assert.equal(res.status, 409, `${JSON.stringify(corps)} → ${JSON.stringify(res.body)}`);
        assert.equal(res.body.error.code, 'invalid_status');
        assert.match(res.body.error.message, /completed/);
      }
    }

    const apres = await enBase(annonce.id);
    assert.equal(apres.status, 'completed', 'toujours terminé');
    assert.equal(apres.seats_available, avant.seats_available);
    assert.equal(apres.completed_at.getTime(), avant.completed_at.getTime());
    await rienARembourser(client, 'trajet terminé');
  });

  it('témoin : AVANT le départ, la même annulation rembourse bien la place à 100 %', async () => {
    // Sans ce témoin, les deux tests du dessus passeraient aussi si
    // l'annulation ne remboursait plus jamais rien.
    const { annonce, tokenChauffeur } = await annoncePostee();
    const client = await reserver(annonce.id, { seats: 2, payer: true });
    const res = await request(app)
      .patch(`/api/rides/${annonce.id}`)
      .set(authHeaders(tokenChauffeur))
      .send({ status: 'cancelled' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { paiement, reservation } = await argentDeLaPlace(client);
    assert.notEqual(paiement.refund_due_at, null, 'remboursement ouvert');
    assert.equal(Number(paiement.refund_amount), 24, '2 places à 12 USD, hors frais carte');
    assert.notEqual(reservation.cancelled_at, null);
  });

  it('départ et annulation EN MÊME TEMPS : jamais un trajet en route remboursé', async (t) => {
    // L'un des deux gagne, peu importe lequel — mais jamais les deux : un
    // trajet « en route » dont les passagers ont été remboursés n'existe pas.
    for (let essai = 0; essai < 4; essai += 1) {
      const { annonce, tokenChauffeur } = await annoncePostee();
      const client = await reserver(annonce.id, { seats: 1, payer: true });
      await departDans(annonce.id, '30 minutes');

      // Les deux ont lu l'annonce « ouverte » : l'annulation a donc passé sa
      // garde de lecture. Seule la garde répétée dans l'écriture peut encore
      // l'arrêter si le départ écrit le premier.
      const barriere = lireTousAvantDEcrire(t, 2);
      const [depart, annulation] = await Promise.all([
        demarrer(annonce.id, authHeaders(tokenChauffeur)),
        request(app)
          .patch(`/api/rides/${annonce.id}`)
          .set(authHeaders(tokenChauffeur))
          .send({ status: 'cancelled' }),
      ]);
      barriere.lever();
      assert.equal(barriere.lectures, 2, 'les deux ont lu avant qu’aucune n’écrive');
      const contexte = `essai ${essai} : départ ${depart.status}, annulation ${annulation.status}`;
      assert.deepEqual([depart.status, annulation.status].sort(), [200, 409], contexte);

      const ligne = await enBase(annonce.id);
      const { paiement, reservation } = await argentDeLaPlace(client);
      if (depart.status === 200) {
        assert.equal(ligne.status, 'in_progress', contexte);
        assert.equal(paiement.refund_due_at, null, `${contexte} — aucun remboursement`);
        assert.equal(reservation.cancelled_at, null, `${contexte} — place active`);
      } else {
        assert.equal(ligne.status, 'cancelled', contexte);
        assert.equal(ligne.started_at, null, contexte);
        assert.notEqual(paiement.refund_due_at, null, `${contexte} — place remboursée`);
      }
    }
  });

  it('le client ne peut pas non plus se faire rembourser sa place sur un trajet en route', async () => {
    const { client } = await trajetEnRouteAvecPlacePayee();
    const res = await request(app)
      .post(`/api/rides/reservations/${client.bookingId}/cancel`)
      .set(authHeaders(client.token));
    // À moins de 24 h du départ, la place payée reste due (barème inchangé).
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.error.code, 'cancellation_too_late');
    await rienARembourser(client, 'annulation client en route');
  });
});

// ===== L'argent ne bouge pas =====

describe('Taxi partagé — démarrer et terminer ne touchent à aucun montant', () => {
  it('gains du chauffeur, paiement et statistiques mensuelles : identiques avant et après', async () => {
    const { annonce, tokenChauffeur, driver } = await annoncePostee();
    const client = await reserver(annonce.id, { seats: 2, payer: true });
    await departDans(annonce.id, '30 minutes');

    const gains = async () =>
      (await request(app).get(`/api/drivers/${driver.id}/stats`).set(authHeaders(tokenChauffeur)))
        .body;
    const gainsAvant = await gains();
    assert.equal(gainsAvant.today.places, 2, 'les 2 places payées comptent déjà — dès le paiement');
    const argentAvant = await argentDeLaPlace(client);

    assert.equal((await demarrer(annonce.id, authHeaders(tokenChauffeur))).status, 200);
    assert.deepEqual(await gains(), gainsAvant, 'le départ ne change pas les gains');
    assert.equal((await terminer(annonce.id, authHeaders(tokenChauffeur))).status, 200);
    assert.deepEqual(await gains(), gainsAvant, 'l’arrivée ne change pas les gains');

    assert.deepEqual(await argentDeLaPlace(client), argentAvant, 'paiement et place inchangés');
    // Pas de course « terminée » comptée au programme de fidélité : ce
    // compteur est celui des courses privées.
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM driver_monthly_stats WHERE driver_id = $1',
      [driver.id]
    );
    assert.equal(rows[0].n, 0, 'driver_monthly_stats n’est pas touché');
  });
});

// ===== Le balayage =====

describe('Taxi partagé — un « Terminer » oublié ne reste pas en route pour toujours', () => {
  it('parti depuis 13 h : terminé tout seul à la lecture suivante ; depuis 11 h : toujours en route', async () => {
    const { tokenChauffeur, annonce: vieux } = await annoncePostee();
    await departDans(vieux.id, '30 minutes');
    await demarrer(vieux.id, authHeaders(tokenChauffeur));
    const recent = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({
        origin: 'Stone Town',
        destination: 'Paje',
        departureAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
        seatsTotal: 4,
      });
    assert.equal(recent.status, 201, JSON.stringify(recent.body));
    await departDans(recent.body.id, '30 minutes');
    await demarrer(recent.body.id, authHeaders(tokenChauffeur));

    // Le temps a passé (impossible à produire par l'API).
    await pool.query(
      `UPDATE posted_rides SET started_at = now() - interval '13 hours' WHERE id = $1`,
      [vieux.id]
    );
    await pool.query(
      `UPDATE posted_rides SET started_at = now() - interval '11 hours' WHERE id = $1`,
      [recent.body.id]
    );

    const mine = await request(app).get('/api/rides/mine').set(authHeaders(tokenChauffeur));
    assert.equal(mine.status, 200);
    const vu = mine.body.find((r) => r.id === vieux.id);
    assert.equal(vu.status, 'completed', 'le chauffeur le voit terminé');
    assert.ok(vu.completed_at, 'avec une heure d’arrivée');
    assert.equal(mine.body.find((r) => r.id === recent.body.id).status, 'in_progress');

    const ligne = await enBase(vieux.id);
    assert.equal(ligne.status, 'completed');
    assert.ok(Math.abs(Date.now() - ligne.completed_at.getTime()) < 15_000, 'completed_at = now()');
    const ligneRecente = await enBase(recent.body.id);
    assert.equal(ligneRecente.status, 'in_progress');
    assert.equal(ligneRecente.completed_at, null);
  });

  it('le balayage s’applique aussi par le passage direct (entretien) et reste idempotent', async () => {
    const { annonce, tokenChauffeur } = await annoncePostee();
    await departDans(annonce.id, '30 minutes');
    await demarrer(annonce.id, authHeaders(tokenChauffeur));
    await pool.query(
      `UPDATE posted_rides SET started_at = now() - interval '13 hours' WHERE id = $1`,
      [annonce.id]
    );

    await cloturerRidesPartis();
    const premier = await enBase(annonce.id);
    assert.equal(premier.status, 'completed');
    await new Promise((r) => setTimeout(r, 30));
    await cloturerRidesPartis();
    const second = await enBase(annonce.id);
    assert.equal(second.status, 'completed');
    assert.equal(
      second.completed_at.getTime(),
      premier.completed_at.getTime(),
      'un second passage ne déplace pas l’heure d’arrivée'
    );
  });

  it('la clôture des annonces parties ne touche PAS un trajet en route', async () => {
    const { annonce, tokenChauffeur } = await annoncePostee();
    // Témoin : une annonce ouverte du même chauffeur, que le balayage DOIT clore.
    const temoin = await request(app)
      .post('/api/rides')
      .set(authHeaders(tokenChauffeur))
      .send({
        origin: 'Stone Town',
        destination: 'Paje',
        departureAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
        seatsTotal: 4,
      });
    assert.equal(temoin.status, 201, JSON.stringify(temoin.body));

    await departDans(annonce.id, '30 minutes');
    await demarrer(annonce.id, authHeaders(tokenChauffeur));
    // Deux heures après l'heure annoncée : bien au-delà des 10 minutes.
    await departDans(annonce.id, '-2 hours');
    await departDans(temoin.body.id, '-2 hours');

    await cloturerRidesPartis();

    assert.equal((await enBase(temoin.body.id)).status, 'closed', 'le témoin est bien clos');
    const ligne = await enBase(annonce.id);
    assert.equal(ligne.status, 'in_progress', 'un trajet en route n’est pas « reclos »');
    assert.equal(ligne.completed_at, null, 'ni terminé avant ses 12 heures');
  });
});

// ===== Ce que chacun voit =====

describe('Taxi partagé — le départ se lit partout où l’annonce se lit', () => {
  it('GET /rides/equipe et GET /rides/mine : statut, heures réelles, et noms réservés aux places payées', async () => {
    const { annonce, tokenChauffeur } = await annoncePostee();
    await reserver(annonce.id, { seats: 2, payer: true, fullName: 'Paula Payante' });
    await reserver(annonce.id, { seats: 1, payer: false, fullName: 'Nora Nonpayee' });
    await departDans(annonce.id, '30 minutes');
    assert.equal((await demarrer(annonce.id, authHeaders(tokenChauffeur))).status, 200);
    const ligne = await enBase(annonce.id);

    // --- La vue équipe ---
    const equipe = await request(app).get('/api/rides/equipe').set(adminHeaders());
    assert.equal(equipe.status, 200);
    const a = equipe.body.find((r) => r.id === annonce.id);
    assert.ok(a, 'un trajet en route reste dans la vue équipe');
    assert.equal(a.status, 'in_progress');
    assert.equal(new Date(a.started_at).getTime(), ligne.started_at.getTime());
    assert.equal(a.completed_at, null);
    assert.equal(a.seats_sold, 2);
    assert.equal(a.seats_reserved, 1);
    assert.equal(a.bookings.find((b) => b.paid).client_name, 'Paula Payante');
    assert.equal(a.bookings.find((b) => !b.paid).client_name, null);
    assert.ok(
      !JSON.stringify(equipe.body).includes('Nora'),
      'le nom d’une place non payée ne sort nulle part, même en route'
    );

    // --- La vue du chauffeur ---
    const mine = await request(app).get('/api/rides/mine').set(authHeaders(tokenChauffeur));
    assert.equal(mine.status, 200);
    const m = mine.body.find((r) => r.id === annonce.id);
    assert.equal(m.status, 'in_progress');
    assert.equal(new Date(m.started_at).getTime(), ligne.started_at.getTime());
    assert.equal(m.completed_at, null);
    assert.equal(m.bookings.find((b) => b.paid).client_name, 'Paula Payante');
    assert.equal(m.bookings.find((b) => !b.paid).client_name, null);
    assert.ok(!JSON.stringify(mine.body).includes('Nora'));

    // --- Après l'arrivée : l'heure réelle d'arrivée sort des deux côtés ---
    assert.equal((await terminer(annonce.id, authHeaders(tokenChauffeur))).status, 200);
    const arrivee = (await enBase(annonce.id)).completed_at.getTime();
    const equipeApres = await request(app).get('/api/rides/equipe').set(adminHeaders());
    const aApres = equipeApres.body.find((r) => r.id === annonce.id);
    assert.equal(aApres.status, 'completed');
    assert.equal(new Date(aApres.completed_at).getTime(), arrivee);
    const mineApres = await request(app).get('/api/rides/mine').set(authHeaders(tokenChauffeur));
    const mApres = mineApres.body.find((r) => r.id === annonce.id);
    assert.equal(mApres.status, 'completed');
    assert.equal(new Date(mApres.completed_at).getTime(), arrivee);
    assert.ok(!JSON.stringify(equipeApres.body).includes('Nora'));
    assert.ok(!JSON.stringify(mineApres.body).includes('Nora'));
  });

  it('GET /rides/reservations : le passager voit sa voiture partie, puis arrivée', async () => {
    const { annonce, tokenChauffeur, client } = await trajetEnRouteAvecPlacePayee();
    const ligne = await enBase(annonce.id);

    const enRoute = await request(app).get('/api/rides/reservations').set(authHeaders(client.token));
    assert.equal(enRoute.status, 200);
    const place = enRoute.body.find((b) => b.id === client.bookingId);
    assert.ok(place, 'la place du client est listée');
    assert.equal(place.ride_status, 'in_progress');
    assert.equal(new Date(place.ride_started_at).getTime(), ligne.started_at.getTime());
    assert.equal(place.ride_completed_at, null);
    assert.equal(place.cancelled, false, 'un trajet en route n’est pas un trajet annulé');
    assert.equal(place.paid, true);
    assert.equal(place.cancellable, false, 'place payée, trajet parti : plus d’annulation');
    assert.equal(place.refund_rate, null);

    assert.equal((await terminer(annonce.id, authHeaders(tokenChauffeur))).status, 200);
    const arrivee = (await enBase(annonce.id)).completed_at.getTime();
    const termine = await request(app).get('/api/rides/reservations').set(authHeaders(client.token));
    const placeApres = termine.body.find((b) => b.id === client.bookingId);
    assert.equal(placeApres.ride_status, 'completed');
    assert.equal(new Date(placeApres.ride_completed_at).getTime(), arrivee);
    assert.equal(placeApres.cancelled, false);
  });

  it('avant le départ, les heures réelles sont nulles partout (pas l’heure annoncée recopiée)', async () => {
    const { annonce, tokenChauffeur } = await annoncePostee();
    const client = await reserver(annonce.id, { seats: 1, payer: true });

    const equipe = await request(app).get('/api/rides/equipe').set(adminHeaders());
    const a = equipe.body.find((r) => r.id === annonce.id);
    assert.equal(a.status, 'open');
    assert.equal(a.started_at, null);
    assert.equal(a.completed_at, null);
    const mine = await request(app).get('/api/rides/mine').set(authHeaders(tokenChauffeur));
    const m = mine.body.find((r) => r.id === annonce.id);
    assert.equal(m.started_at, null);
    assert.equal(m.completed_at, null);
    const places = await request(app).get('/api/rides/reservations').set(authHeaders(client.token));
    assert.equal(places.body[0].ride_status, 'open');
    assert.equal(places.body[0].ride_started_at, null);
    assert.equal(places.body[0].ride_completed_at, null);
  });
});

// ===== L'équipe est prévenue =====

describe('Taxi partagé — la tour de contrôle voit la voiture partir et arriver', () => {
  it('départ puis arrivée : deux alertes, avec chauffeur, places PAYÉES à bord et durée', async (t) => {
    const { annonce, tokenChauffeur, driver } = await annoncePostee();
    await reserver(annonce.id, { seats: 2, payer: true, fullName: 'Paula Payante' });
    await reserver(annonce.id, { seats: 1, payer: false, fullName: 'Nora Nonpayee' });
    await departDans(annonce.id, '30 minutes');
    const messages = ecouterWhatsappEquipe(t);

    assert.equal((await demarrer(annonce.id, authHeaders(tokenChauffeur))).status, 200);
    const depart = await attendre(() => messages.find((m) => m.startsWith('▶️ Taxi partagé démarré')));
    assert.ok(depart, `aucune alerte de départ (reçues : ${messages.join(' | ') || 'aucune'})`);
    assert.match(depart, /Trajet: Stone Town → Nungwi/);
    assert.match(depart, /Départ prévu: \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
    assert.ok(depart.includes(`Chauffeur: ${driver.full_name} (${driver.phone})`), depart);
    // 2 places payées, 1 réservée non payée : seules les payées sont « à bord ».
    assert.match(depart, /Places payées à bord: 2 sur 4/);
    assert.ok(depart.includes(`Réf: ${annonce.id}`), depart);
    assert.ok(!/Paula|Nora/.test(depart), 'aucun nom de passager dans l’alerte');

    // Le trajet a duré 25 minutes (le temps passe en base).
    await pool.query(
      `UPDATE posted_rides SET started_at = now() - interval '25 minutes' WHERE id = $1`,
      [annonce.id]
    );
    assert.equal((await terminer(annonce.id, authHeaders(tokenChauffeur))).status, 200);
    const arrivee = await attendre(() => messages.find((m) => m.startsWith('✅ Taxi partagé terminé')));
    assert.ok(arrivee, `aucune alerte d’arrivée (reçues : ${messages.join(' | ') || 'aucune'})`);
    assert.match(arrivee, /Trajet: Stone Town → Nungwi/);
    assert.ok(arrivee.includes(`Chauffeur: ${driver.full_name} (${driver.phone})`), arrivee);
    assert.match(arrivee, /Places payées à bord: 2 sur 4/);
    assert.match(arrivee, /Durée du trajet: 25 min/);
    assert.ok(arrivee.includes(`Réf: ${annonce.id}`), arrivee);
  });

  it('une alerte qui tombe ne retient pas la voiture : le départ passe quand même', async (t) => {
    const { annonce, tokenChauffeur } = await annoncePostee();
    await departDans(annonce.id, '30 minutes');
    // La passerelle WhatsApp est en panne.
    const cleAvant = config.callmebot.apiKey;
    config.callmebot.apiKey = 'cle-de-test';
    mock.method(globalThis, 'fetch', async () => {
      throw new Error('passerelle injoignable');
    });
    t.after(() => {
      config.callmebot.apiKey = cleAvant;
      mock.restoreAll();
    });

    const depart = await demarrer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(depart.status, 200, JSON.stringify(depart.body));
    const arrivee = await terminer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(arrivee.status, 200, JSON.stringify(arrivee.body));
    assert.equal((await enBase(annonce.id)).status, 'completed');
  });

  it('même si la préparation de l’alerte casse en base, départ et arrivée sont acquis', async (t) => {
    const { annonce, tokenChauffeur } = await annoncePostee();
    await departDans(annonce.id, '30 minutes');
    // La lecture « combien de places payées à bord » — propre à l'alerte, et
    // faite APRÈS l'écriture — tombe en panne. Une promesse rejetée et
    // laissée sans .catch ferait échouer ce test (unhandledRejection).
    const vraieRequete = pool.query.bind(pool);
    let pannes = 0;
    mock.method(pool, 'query', (texte, ...reste) => {
      if (typeof texte === 'string' && /SUM\(seats\)/.test(texte)) {
        pannes += 1;
        return Promise.reject(new Error('base en panne'));
      }
      return vraieRequete(texte, ...reste);
    });
    t.after(() => mock.restoreAll());

    const depart = await demarrer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(depart.status, 200, JSON.stringify(depart.body));
    assert.equal(depart.body.status, 'in_progress');
    const arrivee = await terminer(annonce.id, authHeaders(tokenChauffeur));
    assert.equal(arrivee.status, 200, JSON.stringify(arrivee.body));

    // La panne a bien eu lieu (sinon ce test ne prouverait rien)…
    await attendre(() => pannes >= 2);
    assert.equal(pannes, 2, 'les deux alertes ont bien tenté leur lecture');
    // …et le trajet est allé au bout quand même.
    mock.restoreAll();
    const ligne = await enBase(annonce.id);
    assert.equal(ligne.status, 'completed');
    assert.ok(ligne.started_at instanceof Date);
    assert.ok(ligne.completed_at instanceof Date);
  });
});
