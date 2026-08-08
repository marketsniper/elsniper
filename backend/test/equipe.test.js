// Tests du tableau de bord équipe : listes globales réservées à la clé admin
// (courses par statut, paiements en attente avec contexte, comptes à valider,
// candidatures chauffeurs).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  adminHeaders,
  app,
  authHeaders,
  createDriverApplication,
  createLocal,
  createTourist,
  useTestDb,
} from './setup.js';

useTestDb();

describe('Tableau de bord équipe', () => {
  it("l'équipe liste les courses par statut ; un client sans filtre → 403", async () => {
    const { token, user } = await createTourist();
    const tripRes = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: user.id,
        tripType: 'private',
        pickupLocation: 'Stone Town',
        dropoffLocation: 'Nungwi',
      });
    assert.equal(tripRes.status, 201);

    const liste = await request(app).get('/api/trips?status=requested').set(adminHeaders());
    assert.equal(liste.status, 200);
    assert.ok(Array.isArray(liste.body));
    assert.ok(liste.body.some((t) => t.id === tripRes.body.id));

    const vide = await request(app).get('/api/trips?status=completed').set(adminHeaders());
    assert.equal(vide.status, 200);
    assert.equal(vide.body.length, 0);

    const interdit = await request(app).get('/api/trips').set(authHeaders(token));
    assert.equal(interdit.status, 403);
    assert.equal(interdit.body.error.code, 'forbidden');
  });

  it("l'équipe liste les paiements en attente avec le contexte de la course", async () => {
    const { token, user } = await createTourist();
    const tripRes = await request(app)
      .post('/api/trips')
      .set(authHeaders(token))
      .send({
        userId: user.id,
        tripType: 'private',
        pickupLocation: 'Paje',
        dropoffLocation: 'Nungwi',
      });
    assert.equal(tripRes.status, 201);
    // L'équipe peut créer le lien de paiement même avant chauffeur ? Non :
    // on passe par le circuit normal (chauffeur confirmé requis) — ici on
    // vérifie simplement la liste sur un paiement de colis, plus direct.
    const pkgRes = await request(app)
      .post('/api/packages')
      .set(authHeaders(token))
      .send({
        senderType: 'user',
        senderUserId: user.id,
        size: 'small',
        pickupLocation: 'Paje',
        dropoffLocation: 'Stone Town',
        recipientName: 'Ali Destinataire',
        recipientPhone: '+255780000009',
      });
    assert.equal(pkgRes.status, 201);
    const payRes = await request(app)
      .post(`/api/packages/${pkgRes.body.id}/payment`)
      .set(authHeaders(token));
    assert.equal(payRes.status, 201);

    const liste = await request(app).get('/api/payments?status=pending').set(adminHeaders());
    assert.equal(liste.status, 200);
    const ligne = liste.body.find((p) => p.id === payRes.body.id);
    assert.ok(ligne, 'le paiement du colis est listé');
    assert.equal(ligne.package_pickup, 'Paje');
    assert.equal(ligne.package_dropoff, 'Stone Town');
    assert.ok(ligne.package_qr.startsWith('PKG-'));

    const interdit = await request(app).get('/api/payments').set(authHeaders(token));
    assert.equal(interdit.status, 401);
    assert.equal(interdit.body.error.code, 'admin_required');
  });

  it("l'équipe liste les comptes en attente de validation (résidents/locaux)", async () => {
    const { user } = await createLocal({ verify: false });

    const liste = await request(app)
      .get('/api/users?verificationStatus=pending')
      .set(adminHeaders());
    assert.equal(liste.status, 200);
    assert.ok(liste.body.some((u) => u.id === user.id));

    const { token } = await createTourist();
    const interdit = await request(app).get('/api/users').set(authHeaders(token));
    assert.equal(interdit.status, 401);
  });

  it("l'équipe liste les candidatures chauffeurs en attente", async () => {
    const { driver } = await createDriverApplication();

    const enAttente = await request(app)
      .get('/api/drivers?verificationStatus=pending')
      .set(adminHeaders());
    assert.equal(enAttente.status, 200);
    assert.ok(enAttente.body.some((d) => d.id === driver.id));

    // Sans filtre : seuls les vérifiés (comportement historique inchangé).
    const verifies = await request(app).get('/api/drivers').set(adminHeaders());
    assert.equal(verifies.status, 200);
    assert.ok(!verifies.body.some((d) => d.id === driver.id));
  });
});
