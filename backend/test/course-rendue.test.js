// LE CHAUFFEUR QUI NE PEUT PLUS — et celui qui se tait.
//
// La bourse aux courses a retiré l'humain du circuit : personne ne vérifie
// qu'un chauffeur qui clique « Je prends » ira vraiment. Deux garde-fous se
// répondent ici : il peut RENDRE la course d'un geste, et s'il ne dit rien,
// le serveur alerte l'équipe tout seul.
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
import { query } from '../src/db.js';
import { signalerCoursesFigees } from '../src/services/coursesFigees.js';

useTestDb();

async function coursePrise({ dansHeures } = {}) {
  const { token, user } = await createTourist();
  const { token: jetonChauffeur, driver } = await createVerifiedDriver();
  const course = await request(app)
    .post('/api/trips')
    .set(authHeaders(token))
    .send({
      userId: user.id,
      tripType: 'private',
      pickupLocation: 'Nungwi',
      dropoffLocation: 'Paje',
      ...(dansHeures === undefined
        ? {}
        : { scheduledAt: new Date(Date.now() + dansHeures * 3600 * 1000).toISOString() }),
    });
  assert.equal(course.status, 201, JSON.stringify(course.body));
  const prise = await request(app)
    .post(`/api/trips/${course.body.id}/claim`)
    .set(authHeaders(jetonChauffeur));
  assert.equal(prise.status, 200, JSON.stringify(prise.body));
  return { id: course.body.id, jetonChauffeur, jetonClient: token, driver };
}

const statutDe = async (id) => {
  const res = await request(app).get(`/api/trips/${id}`).set(adminHeaders());
  return res.body;
};

const dansLaBourse = async (id, jeton) => {
  const res = await request(app).get('/api/trips/disponibles').set(authHeaders(jeton));
  assert.equal(res.status, 200);
  return res.body.some((c) => c.id === id);
};

describe('« Je ne peux plus faire cette course »', () => {
  it('rend la course à la bourse et libère le chauffeur', async () => {
    const { id, jetonChauffeur } = await coursePrise({ dansHeures: 24 });
    assert.equal(await dansLaBourse(id, jetonChauffeur), false, 'course prise : plus dans la bourse');

    const rendu = await request(app)
      .post(`/api/trips/${id}/release`)
      .set(authHeaders(jetonChauffeur));
    assert.equal(rendu.status, 200, JSON.stringify(rendu.body));

    const apres = await statutDe(id);
    assert.equal(apres.status, 'requested', 'la course doit redevenir libre');
    assert.equal(apres.driver_id, null, 'le chauffeur ne doit plus y être accroché');
    assert.equal(await dansLaBourse(id, jetonChauffeur), true, 'elle doit revenir dans la bourse');
  });

  it('reste possible APRÈS paiement — mieux vaut le savoir trois heures avant', async () => {
    const { id, jetonChauffeur, jetonClient } = await coursePrise({ dansHeures: 6 });
    const paiement = await request(app)
      .post(`/api/trips/${id}/payment`)
      .set(authHeaders(jetonClient));
    await request(app)
      .post(`/api/payments/${paiement.body.id}/confirm`)
      .set(adminHeaders())
      .send({});
    assert.equal((await statutDe(id)).status, 'paid');

    const rendu = await request(app)
      .post(`/api/trips/${id}/release`)
      .set(authHeaders(jetonChauffeur));
    assert.equal(rendu.status, 200, JSON.stringify(rendu.body));
    assert.equal((await statutDe(id)).status, 'requested');
  });

  // LE SCÉNARIO DU TERRAIN, celui qui a révélé le bug : le client paie, le
  // chauffeur se désiste, l'équipe met quelqu'un d'autre. Le remplaçant
  // voyait « en attente du paiement du client » — alors que l'argent était
  // encaissé. Il ne pouvait ni démarrer, ni obtenir les coordonnées.
  it('course DÉJÀ PAYÉE rendue puis réassignée : le remplaçant la reçoit payée', async () => {
    const { id, jetonChauffeur, jetonClient } = await coursePrise({ dansHeures: 6 });
    const paiement = await request(app)
      .post(`/api/trips/${id}/payment`)
      .set(authHeaders(jetonClient));
    await request(app)
      .post(`/api/payments/${paiement.body.id}/confirm`)
      .set(adminHeaders())
      .send({});
    await request(app).post(`/api/trips/${id}/release`).set(authHeaders(jetonChauffeur));

    // L'équipe confie la course à un autre chauffeur.
    const { token: jetonRemplacant, driver: remplacant } = await createVerifiedDriver();
    const assignation = await request(app)
      .patch(`/api/trips/${id}/assign-driver`)
      .set(adminHeaders())
      .send({ driverId: remplacant.id });
    assert.equal(assignation.status, 200, JSON.stringify(assignation.body));
    assert.equal(assignation.body.status, 'paid', 'la course était payée : elle doit le rester');

    // Et le remplaçant, LUI, doit voir une course payée : c'est ce statut
    // qui lui ouvre les coordonnées du client et le bouton « Démarrer ».
    const saVue = await request(app)
      .get(`/api/trips/${id}`)
      .set(authHeaders(jetonRemplacant));
    assert.equal(saVue.status, 200, JSON.stringify(saVue.body));
    assert.equal(saVue.body.status, 'paid', 'le remplaçant ne doit pas attendre un paiement reçu');
    assert.equal(saVue.body.contact_client_visible, true, 'il doit pouvoir appeler le client');
    assert.ok(saVue.body.client_phone, 'le numéro du client doit lui être ouvert');

    // Il peut démarrer immédiatement.
    const depart = await request(app)
      .patch(`/api/trips/${id}/start`)
      .set(authHeaders(jetonRemplacant));
    assert.equal(depart.status, 200, JSON.stringify(depart.body));
  });

  it('course déjà payée reprise depuis la BOURSE : même règle', async () => {
    const { id, jetonChauffeur, jetonClient } = await coursePrise({ dansHeures: 6 });
    const paiement = await request(app)
      .post(`/api/trips/${id}/payment`)
      .set(authHeaders(jetonClient));
    await request(app)
      .post(`/api/payments/${paiement.body.id}/confirm`)
      .set(adminHeaders())
      .send({});
    await request(app).post(`/api/trips/${id}/release`).set(authHeaders(jetonChauffeur));

    // Elle réapparaît dans la bourse, ANNONCÉE COMME DÉJÀ PAYÉE — c'est la
    // plus urgente, et pour celui qui la prend c'est un gain certain.
    const { token: autre } = await createVerifiedDriver();
    const bourse = await request(app).get('/api/trips/disponibles').set(authHeaders(autre));
    const offre = bourse.body.find((c) => c.id === id);
    assert.ok(offre, 'la course payée sans chauffeur doit revenir dans la bourse');
    assert.equal(offre.deja_payee, true, 'la bourse doit signaler qu’elle est déjà payée');

    const prise = await request(app).post(`/api/trips/${id}/claim`).set(authHeaders(autre));
    assert.equal(prise.status, 200, JSON.stringify(prise.body));
    assert.equal(prise.body.status, 'paid', 'reprise dans la bourse : elle reste payée');
    assert.equal(prise.body.contact_client_visible, true);
  });

  it('une course JAMAIS payée reprise reste bien « en attente de paiement »', async () => {
    const { id, jetonChauffeur } = await coursePrise({ dansHeures: 6 });
    await request(app).post(`/api/trips/${id}/release`).set(authHeaders(jetonChauffeur));
    const { token: autre } = await createVerifiedDriver();
    const prise = await request(app).post(`/api/trips/${id}/claim`).set(authHeaders(autre));
    assert.equal(prise.body.status, 'driver_confirmed', 'rien n’a été payé : pas de faux feu vert');
    assert.equal(prise.body.contact_client_visible, false);
  });

  it('refusé une fois la course démarrée', async () => {
    const { id, jetonChauffeur, jetonClient } = await coursePrise({ dansHeures: 1 });
    const paiement = await request(app)
      .post(`/api/trips/${id}/payment`)
      .set(authHeaders(jetonClient));
    await request(app)
      .post(`/api/payments/${paiement.body.id}/confirm`)
      .set(adminHeaders())
      .send({});
    await request(app).patch(`/api/trips/${id}/start`).set(authHeaders(jetonChauffeur));

    const rendu = await request(app)
      .post(`/api/trips/${id}/release`)
      .set(authHeaders(jetonChauffeur));
    assert.equal(rendu.status, 409, JSON.stringify(rendu.body));
    assert.equal(rendu.body.error?.code, 'course_non_liberable');
  });

  it('un chauffeur ne peut pas rendre la course d’un autre', async () => {
    const { id } = await coursePrise({ dansHeures: 24 });
    const { token: autre } = await createVerifiedDriver();
    const vol = await request(app).post(`/api/trips/${id}/release`).set(authHeaders(autre));
    assert.equal(vol.status, 403);
    assert.equal((await statutDe(id)).status, 'driver_confirmed', 'la course ne doit pas bouger');
  });
});

describe('Course figée : l’équipe est prévenue toute seule', () => {
  it('alerte quand le départ approche et que rien n’a démarré', async () => {
    const { id } = await coursePrise({ dansHeures: 1 }); // dans moins de 2 h
    const signalees = await signalerCoursesFigees();
    assert.ok(
      signalees.some((c) => c.id === id),
      'la course dont le départ approche devait être signalée'
    );

    // Signalée UNE fois : sans ça, l'équipe recevrait le même message toutes
    // les minutes, et finirait par ne plus les lire.
    const deuxieme = await signalerCoursesFigees();
    assert.ok(!deuxieme.some((c) => c.id === id), 'pas de seconde alerte pour la même course');
  });

  it('alerte aussi une course prise depuis longtemps et jamais payée', async () => {
    const { id } = await coursePrise({ dansHeures: 240 }); // départ très lointain
    assert.deepEqual(await signalerCoursesFigees(), [], 'rien à signaler pour l’instant');

    // On la vieillit : prise il y a 8 h, toujours pas payée.
    await query("UPDATE trips SET created_at = now() - interval '8 hours' WHERE id = $1", [id]);
    const signalees = await signalerCoursesFigees();
    assert.ok(
      signalees.some((c) => c.id === id),
      'une course prise depuis 8 h sans paiement bloque la bourse : il faut le dire'
    );
  });

  it('rendre la course remet le compteur d’alerte à zéro', async () => {
    const { id, jetonChauffeur } = await coursePrise({ dansHeures: 1 });
    await signalerCoursesFigees();
    const { rows: avant } = await query('SELECT alerte_figee_at FROM trips WHERE id = $1', [id]);
    assert.ok(avant[0].alerte_figee_at, 'la course devait être marquée comme signalée');

    await request(app).post(`/api/trips/${id}/release`).set(authHeaders(jetonChauffeur));
    const { rows: apres } = await query('SELECT alerte_figee_at FROM trips WHERE id = $1', [id]);
    assert.equal(apres[0].alerte_figee_at, null, 'une nouvelle prise doit pouvoir réalerter');
  });

  it('ne signale pas une course payée ni une course sans chauffeur', async () => {
    const { token, user } = await createTourist();
    const libre = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: user.id,
        tripType: 'private',
        pickupLocation: 'Nungwi',
        dropoffLocation: 'Paje',
        scheduledAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      });

    const { id, jetonClient } = await coursePrise({ dansHeures: 1 });
    const paiement = await request(app)
      .post(`/api/trips/${id}/payment`)
      .set(authHeaders(jetonClient));
    await request(app)
      .post(`/api/payments/${paiement.body.id}/confirm`)
      .set(adminHeaders())
      .send({});

    const signalees = await signalerCoursesFigees();
    const ids = signalees.map((c) => c.id);
    assert.ok(!ids.includes(id), 'une course payée n’est pas figée');
    assert.ok(
      !ids.includes(libre.body.id),
      'une course que personne n’a prise n’est pas « figée » — elle attend, c’est différent'
    );
  });
});

describe('Connexion par code : la porte est fermée', () => {
  it('reste ouverte hors production (les tests en dépendent)', async () => {
    const res = await request(app)
      .post('/api/auth/request-otp')
      .send({ phone: '+255700111333' });
    assert.equal(res.status, 200, 'en test, le code doit continuer de fonctionner');
  });
});
