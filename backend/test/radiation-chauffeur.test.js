// RADIATION DÉFINITIVE d'un chauffeur : sa fiche est close et sort de toutes
// les listes, ses courses passées restent dans les comptes, et son numéro
// comme sa plaque redeviennent libres — il peut redéposer une candidature.
// Et mot de passe : l'équipe ne peut jamais le lire, seulement le remplacer.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  adminHeaders,
  app,
  authHeaders,
  createVerifiedDriver,
  nextPhone,
  nextPlate,
  useTestDb,
  DOC_URL,
} from './setup.js';

useTestDb();

describe('Radiation définitive d\'un chauffeur', () => {
  it('radié : il disparaît des listes, ne se connecte plus, et peut se réinscrire', async () => {
    const phone = nextPhone();
    const plaque = nextPlate();
    const inscription = await request(app)
      .post('/api/auth/driver-register')
      .send({ phone, password: 'DerevaMdp1' });
    const candidature = await request(app)
      .post('/api/drivers')
      .set(authHeaders(inscription.body.token))
      .send({
        fullName: 'Ali Juma',
        phone,
        licenseNumber: 'DL-909090',
        vehiclePlate: plaque,
        zone: 'Nungwi',
        licenseDocumentUrl: DOC_URL,
        insuranceDocumentUrl: DOC_URL,
        vehiclePhotoUrl: DOC_URL,
      });
    assert.equal(candidature.status, 201);
    const driverId = candidature.body.id;
    await request(app)
      .patch(`/api/drivers/${driverId}/verify`)
      .set(adminHeaders())
      .send({ status: 'verified' });

    // Il est bien dans la liste des taxis avant la radiation.
    const avant = await request(app).get('/api/drivers').set(adminHeaders());
    assert.ok(avant.body.some((d) => d.id === driverId));

    const radiation = await request(app)
      .post(`/api/drivers/${driverId}/radier`)
      .set(adminHeaders());
    assert.equal(radiation.status, 200, JSON.stringify(radiation.body));
    assert.ok(radiation.body.archived_at);
    assert.equal(radiation.body.password_hash, undefined);

    // 1. Il sort de toutes les listes de l'équipe.
    for (const statut of ['verified', 'pending', 'rejected']) {
      const liste = await request(app)
        .get(`/api/drivers?verificationStatus=${statut}`)
        .set(adminHeaders());
      assert.ok(
        !liste.body.some((d) => d.id === driverId),
        `encore présent en ${statut}`
      );
    }

    // 2. Il ne peut plus se connecter.
    const connexion = await request(app)
      .post('/api/auth/driver-login')
      .send({ phone, password: 'DerevaMdp1' });
    assert.equal(connexion.status, 401);

    // 3. Son numéro ET sa plaque sont libres : nouvelle candidature possible.
    const retour = await request(app)
      .post('/api/auth/driver-register')
      .send({ phone, password: 'NouveauMdp1' });
    assert.equal(retour.status, 201, JSON.stringify(retour.body));
    const nouvelleCandidature = await request(app)
      .post('/api/drivers')
      .set(authHeaders(retour.body.token))
      .send({
        fullName: 'Ali Juma',
        phone,
        licenseNumber: 'DL-909090',
        vehiclePlate: plaque,
        zone: 'Nungwi',
        licenseDocumentUrl: DOC_URL,
        insuranceDocumentUrl: DOC_URL,
        vehiclePhotoUrl: DOC_URL,
      });
    assert.equal(nouvelleCandidature.status, 201, JSON.stringify(nouvelleCandidature.body));
    assert.notEqual(nouvelleCandidature.body.id, driverId); // une fiche neuve

    // 4. La fiche radiée reste consultable (les comptes passés sont intacts).
    const fiche = await request(app).get(`/api/drivers/${driverId}`).set(adminHeaders());
    assert.equal(fiche.status, 200);
    assert.ok(fiche.body.archived_at);

    // 5. On ne radie pas deux fois.
    const encore = await request(app)
      .post(`/api/drivers/${driverId}/radier`)
      .set(adminHeaders());
    assert.equal(encore.status, 409);
  });

  it("le mot de passe n'est jamais lisible, seulement remplaçable", async () => {
    const { driver } = await createVerifiedDriver();

    const fiche = await request(app).get(`/api/drivers/${driver.id}`).set(adminHeaders());
    assert.equal(fiche.status, 200);
    assert.equal(fiche.body.password_hash, undefined);
    assert.equal(fiche.body.password, undefined);
    assert.equal(typeof fiche.body.has_password, 'boolean');

    const pose = await request(app)
      .post(`/api/drivers/${driver.id}/mot-de-passe`)
      .set(adminHeaders())
      .send({ password: 'ZanziGo2026' });
    assert.equal(pose.status, 200, JSON.stringify(pose.body));

    // Le chauffeur se connecte avec le mot de passe donné par l'équipe.
    const connexion = await request(app)
      .post('/api/auth/driver-login')
      .send({ phone: driver.phone, password: 'ZanziGo2026' });
    assert.equal(connexion.status, 200, JSON.stringify(connexion.body));

    // Trop court : refusé. Sans la clé équipe : refusé aussi.
    const court = await request(app)
      .post(`/api/drivers/${driver.id}/mot-de-passe`)
      .set(adminHeaders())
      .send({ password: 'court' });
    assert.equal(court.status, 400);

    const sansCle = await request(app)
      .post(`/api/drivers/${driver.id}/mot-de-passe`)
      .set(authHeaders(connexion.body.token))
      .send({ password: 'AutreMdp12' });
    assert.ok([401, 403].includes(sansCle.status), `refus attendu, reçu ${sansCle.status}`);
  });

  it('un chauffeur ne se radie pas lui-même', async () => {
    const { driver, token } = await createVerifiedDriver();
    const tentative = await request(app)
      .post(`/api/drivers/${driver.id}/radier`)
      .set(authHeaders(token));
    assert.ok([401, 403].includes(tentative.status), `refus attendu, reçu ${tentative.status}`);
  });
});
