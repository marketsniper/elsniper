// LA FILE DE VÉRIFICATION — ce qu'elle doit garantir.
//
//  1. rien ne manque : un dossier en attente, quel que soit son type, EST
//     dans la file (celui qu'on oublie est celui qui part chez un concurrent) ;
//  2. rien ne s'y trouve à tort : ni les touristes (aucun document à
//     contrôler), ni les dossiers déjà traités, ni les chauffeurs radiés ;
//  3. le plus ancien passe en premier ;
//  4. la file est réservée à l'équipe — elle contient des pièces d'identité.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  adminHeaders,
  app,
  authHeaders,
  createDriverApplication,
  createHotel,
  createLocal,
  createTourist,
  createVerifiedDriver,
  DOC_URL,
  useTestDb,
} from './setup.js';

useTestDb();

const file = async () => {
  const r = await request(app).get('/api/verifications').set(adminHeaders());
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
};

describe('File de vérification : ce qu\'elle contient', () => {
  it('vide quand il n\'y a rien à contrôler', async () => {
    const f = await file();
    assert.equal(f.total, 0);
    assert.deepEqual(f.dossiers, []);
  });

  it('un chauffeur candidat arrive avec ses pièces et de quoi les contrôler', async () => {
    const { driver } = await createDriverApplication();
    const f = await file();
    assert.equal(f.total, 1);
    assert.equal(f.par_type.chauffeur, 1);

    const dossier = f.dossiers[0];
    assert.equal(dossier.type, 'chauffeur');
    assert.equal(dossier.id, driver.id);
    assert.ok(dossier.nom, 'le nom du candidat');
    // Les pièces sont déjà rassemblées : l'écran n'a rien à aller chercher.
    const libelles = dossier.documents.map((d) => d.libelle);
    assert.ok(libelles.includes('Permis de conduire'), JSON.stringify(libelles));
    assert.ok(dossier.documents.every((d) => !!d.url));
    // …et les informations à confronter au document.
    const labels = dossier.infos.map((i) => i.label);
    assert.ok(labels.includes('Plaque'));
    assert.ok(labels.includes('N° de permis'));
    assert.equal(typeof dossier.heures_attente, 'number');
  });

  it('un LOCAL à carte NIDA y est, un TOURISTE n\'y est jamais', async () => {
    await createTourist();
    const { user } = await createLocal({ verify: false });
    const f = await file();
    assert.equal(f.total, 1, 'le touriste n’a aucun document à faire valider');
    assert.equal(f.dossiers[0].type, 'client');
    assert.equal(f.dossiers[0].id, user.id);
    assert.match(f.dossiers[0].documents[0].libelle, /NIDA/);
    assert.ok(
      f.dossiers[0].infos.some((i) => /shillings/.test(i.valeur)),
      'l’équipe voit quel droit elle ouvre'
    );
  });

  it('un hôtel y est, avec la consigne : on vérifie par téléphone', async () => {
    await createHotel({ verify: false });
    const f = await file();
    assert.equal(f.par_type.hotel, 1);
    const dossier = f.dossiers[0];
    assert.equal(dossier.type, 'hotel');
    assert.deepEqual(dossier.documents, [], 'un hôtel ne dépose aucune pièce');
    assert.equal(dossier.verification_par_telephone, true);
    assert.ok(dossier.contact, 'le numéro à appeler');
  });

  it('un dossier déjà traité SORT de la file', async () => {
    const { driver } = await createDriverApplication();
    assert.equal((await file()).total, 1);

    await request(app)
      .patch(`/api/drivers/${driver.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'verified' });

    assert.equal((await file()).total, 0, 'validé = plus rien à faire');
  });

  it('un chauffeur déjà vérifié n\'y apparaît pas', async () => {
    await createVerifiedDriver();
    assert.equal((await file()).total, 0);
  });

  it('le plus ancien passe en premier — c\'est celui qui attend', async () => {
    const { driver: premier } = await createDriverApplication();
    // Le second dossier est créé après : il doit passer derrière, même si sa
    // famille (client) est listée ailleurs dans la requête.
    await new Promise((r) => setTimeout(r, 1100));
    const { user } = await createLocal({ verify: false });

    const f = await file();
    assert.equal(f.total, 2);
    assert.equal(f.dossiers[0].id, premier.id, 'le chauffeur attend depuis plus longtemps');
    assert.equal(f.dossiers[1].id, user.id);
  });

  it('les trois familles cohabitent et sont comptées séparément', async () => {
    await createDriverApplication();
    await createLocal({ verify: false });
    await createHotel({ verify: false });
    const f = await file();
    assert.equal(f.total, 3);
    assert.deepEqual(f.par_type, { chauffeur: 1, client: 1, hotel: 1 });
  });
});

describe('File de vérification : qui peut la voir', () => {
  it('sans la clé équipe, la porte est fermée', async () => {
    await createDriverApplication();
    const anonyme = await request(app).get('/api/verifications');
    assert.equal(anonyme.status, 401);

    // Un client connecté n'est pas l'équipe : la file contient des pièces
    // d'identité, elle ne s'ouvre pas avec un simple jeton — seule la clé
    // équipe ouvre cette porte (401 admin_required, comme partout ailleurs).
    const { token } = await createTourist();
    const client = await request(app).get('/api/verifications').set(authHeaders(token));
    assert.equal(client.status, 401);
    assert.equal(client.body.error.code, 'admin_required');
  });
});

describe('File de vérification : le document reste ouvrable', () => {
  it('l\'URL fournie est celle du document déposé', async () => {
    await createDriverApplication();
    const f = await file();
    const permis = f.dossiers[0].documents.find((d) => d.libelle === 'Permis de conduire');
    assert.equal(permis.url, DOC_URL);
  });
});
