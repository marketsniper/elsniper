// LOCATION DE VÉHICULES — zanziGo intermédiaire entre le loueur et le
// client. Trois garde-fous demandés par Karim, verrouillés ici :
//  - seule l'équipe crée/édite un véhicule (jamais de candidature loueur) ;
//  - un véhicule reste invisible tant qu'il n'est pas VÉRIFIÉ, comme un
//    dossier chauffeur, même saisi par l'équipe elle-même ;
//  - le loueur (nom, téléphone, documents) n'est JAMAIS envoyé au client —
//    zanziGo reste l'unique interlocuteur.
// La réservation et le paiement réutilisent le moteur commun (comme une
// place de taxi partagé) : mêmes tests de chevauchement de dates et de
// barème d'annulation 24/48 h que test/annulation-remboursement.test.js.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  adminHeaders,
  app,
  authHeaders,
  createLocal,
  createTourist,
  createVerifiedDriver,
  DOC_URL,
  nextPlate,
  useTestDb,
} from './setup.js';

useTestDb();

function vehiculePayload(extra = {}) {
  return {
    category: '4x4',
    make: 'Toyota',
    model: 'RAV4',
    year: 2021,
    plate: nextPlate(),
    seats: 5,
    transmission: 'automatique',
    description: 'Climatisation, 4x4, idéal pour la côte est.',
    pickupLocation: 'Stone Town',
    loueurName: 'Ali Loueur',
    loueurPhone: '+255700000001',
    dailyPrice: 40,
    dailyCommission: 8,
    currency: 'USD',
    insuranceDocumentUrl: DOC_URL,
    roadLicenceDocumentUrl: DOC_URL,
    ...extra,
  };
}

async function creerVehicule(extra = {}) {
  const res = await request(app)
    .post('/api/rental-vehicles')
    .set(adminHeaders())
    .send(vehiculePayload(extra));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

async function creerEtVerifier(extra = {}) {
  const vehicule = await creerVehicule(extra);
  const verif = await request(app)
    .patch(`/api/rental-vehicles/${vehicule.id}/verify`)
    .set(adminHeaders())
    .send({ status: 'verified' });
  assert.equal(verif.status, 200, JSON.stringify(verif.body));
  return verif.body;
}

const dansNJours = (n) => new Date(Date.now() + n * 24 * 3600 * 1000).toISOString().slice(0, 10);

async function reserverEtPayer(token, vehiculeId, startDate, endDate) {
  const resa = await request(app)
    .post(`/api/rental-vehicles/${vehiculeId}/book`)
    .set(authHeaders(token))
    .send({ startDate, endDate });
  assert.equal(resa.status, 201, JSON.stringify(resa.body));
  const confirm = await request(app)
    .post(`/api/payments/${resa.body.payment.id}/confirm`)
    .set(authHeaders(token));
  assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
  return resa.body;
}

describe('Location de véhicules — création réservée à l’équipe', () => {
  it('un client (touriste) ne peut pas créer un véhicule', async () => {
    const { token } = await createTourist();
    const res = await request(app)
      .post('/api/rental-vehicles')
      .set(authHeaders(token))
      .send(vehiculePayload());
    assert.equal(res.status, 401);
  });

  it('un chauffeur vérifié ne peut pas non plus en créer', async () => {
    const { token } = await createVerifiedDriver();
    const res = await request(app)
      .post('/api/rental-vehicles')
      .set(authHeaders(token))
      .send(vehiculePayload());
    assert.equal(res.status, 401);
  });

  it('l’équipe crée un véhicule avec ses photos → 201, pending', async () => {
    const res = await request(app)
      .post('/api/rental-vehicles')
      .set(adminHeaders())
      .send(vehiculePayload({ photoUrls: [DOC_URL, DOC_URL] }));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.verification_status, 'pending');
    assert.equal(res.body.photos.length, 2);
    assert.equal(res.body.loueur_name, 'Ali Loueur');
  });

  it('commission au-delà du prix journalier → 400', async () => {
    const res = await request(app)
      .post('/api/rental-vehicles')
      .set(adminHeaders())
      .send(vehiculePayload({ dailyCommission: 999 }));
    assert.equal(res.status, 400);
  });

  it('catégorie hors de la liste figée → 400 ; les six valeurs sont acceptées', async () => {
    const invalide = await request(app)
      .post('/api/rental-vehicles')
      .set(adminHeaders())
      .send(vehiculePayload({ category: 'SUV', plate: nextPlate() }));
    assert.equal(invalide.status, 400);

    for (const category of ['tourisme', '4x4', 'luxe', 'scooter', 'moto', 'enduro']) {
      const res = await request(app)
        .post('/api/rental-vehicles')
        .set(adminHeaders())
        .send(vehiculePayload({ category, plate: nextPlate() }));
      assert.equal(res.status, 201, `${category} : ${JSON.stringify(res.body)}`);
      assert.equal(res.body.category, category);
    }
  });

  it('PATCH corrige un champ, sans toucher aux autres', async () => {
    const vehicule = await creerVehicule();
    const res = await request(app)
      .patch(`/api/rental-vehicles/${vehicule.id}`)
      .set(adminHeaders())
      .send({ dailyPrice: 55 });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(Number(res.body.daily_price), 55);
    assert.equal(res.body.make, 'Toyota');
  });
});

describe('Location de véhicules — catalogue et visibilité', () => {
  it('un véhicule pending n’apparaît ni au catalogue ni sur sa fiche client', async () => {
    const vehicule = await creerVehicule();
    const { token } = await createTourist();

    const catalogue = await request(app).get('/api/rental-vehicles').set(authHeaders(token));
    assert.equal(catalogue.status, 200);
    assert.equal(catalogue.body.length, 0);

    const fiche = await request(app)
      .get(`/api/rental-vehicles/${vehicule.id}`)
      .set(authHeaders(token));
    assert.equal(fiche.status, 404);
  });

  it('l’équipe voit le véhicule pending et peut filtrer par statut', async () => {
    await creerVehicule();
    const liste = await request(app).get('/api/rental-vehicles').set(adminHeaders());
    assert.equal(liste.body.length, 1);
    const filtre = await request(app)
      .get('/api/rental-vehicles?verificationStatus=verified')
      .set(adminHeaders());
    assert.equal(filtre.body.length, 0);
  });

  it('le catalogue client se filtre par catégorie souhaitée', async () => {
    await creerEtVerifier({ category: '4x4' });
    await creerEtVerifier({ category: 'scooter', plate: nextPlate() });
    const { token } = await createTourist();

    const tout = await request(app).get('/api/rental-vehicles').set(authHeaders(token));
    assert.equal(tout.body.length, 2);

    const seulement4x4 = await request(app)
      .get('/api/rental-vehicles?category=4x4')
      .set(authHeaders(token));
    assert.equal(seulement4x4.status, 200);
    assert.equal(seulement4x4.body.length, 1);
    assert.equal(seulement4x4.body[0].category, '4x4');

    const seulementMoto = await request(app)
      .get('/api/rental-vehicles?category=moto')
      .set(authHeaders(token));
    assert.equal(seulementMoto.body.length, 0);

    const invalide = await request(app)
      .get('/api/rental-vehicles?category=SUV')
      .set(authHeaders(token));
    assert.equal(invalide.status, 400);
  });

  it('la liste équipe se filtre aussi par catégorie', async () => {
    await creerVehicule({ category: 'luxe' });
    await creerVehicule({ category: 'enduro', plate: nextPlate() });
    const filtre = await request(app)
      .get('/api/rental-vehicles?category=luxe')
      .set(adminHeaders());
    assert.equal(filtre.status, 200);
    assert.equal(filtre.body.length, 1);
    assert.equal(filtre.body[0].category, 'luxe');
  });

  it('vérifié et disponible : sort au catalogue, SANS le loueur ni les documents', async () => {
    const vehicule = await creerEtVerifier();
    const { token } = await createTourist();

    const catalogue = await request(app).get('/api/rental-vehicles').set(authHeaders(token));
    assert.equal(catalogue.status, 200);
    assert.equal(catalogue.body.length, 1);
    const fiche = catalogue.body[0];
    assert.equal(fiche.make, 'Toyota');
    assert.equal(Number(fiche.daily_price), 40);
    assert.equal(fiche.documents_verified, true);
    assert.equal(fiche.loueur_name, undefined);
    assert.equal(fiche.loueur_phone, undefined);
    assert.equal(fiche.plate, undefined);
    assert.equal(fiche.insurance_document_url, undefined);
    assert.equal(fiche.daily_commission, undefined);

    const detail = await request(app)
      .get(`/api/rental-vehicles/${vehicule.id}`)
      .set(authHeaders(token));
    assert.equal(detail.status, 200);
    assert.equal(detail.body.loueur_name, undefined);

    // L'équipe, elle, voit tout.
    const detailAdmin = await request(app)
      .get(`/api/rental-vehicles/${vehicule.id}`)
      .set(adminHeaders());
    assert.equal(detailAdmin.body.loueur_phone, '+255700000001');
    assert.equal(detailAdmin.body.plate, vehicule.plate);
  });

  it('rejeté : reste hors catalogue', async () => {
    const vehicule = await creerVehicule();
    await request(app)
      .patch(`/api/rental-vehicles/${vehicule.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'rejected' });
    const { token } = await createTourist();
    const catalogue = await request(app).get('/api/rental-vehicles').set(authHeaders(token));
    assert.equal(catalogue.body.length, 0);
  });

  it('archivé : disparaît définitivement, même vérifié — archivage non répétable', async () => {
    const vehicule = await creerEtVerifier();
    const archive = await request(app)
      .post(`/api/rental-vehicles/${vehicule.id}/archive`)
      .set(adminHeaders());
    assert.equal(archive.status, 200);
    assert.ok(archive.body.archived_at);

    const { token } = await createTourist();
    const catalogue = await request(app).get('/api/rental-vehicles').set(authHeaders(token));
    assert.equal(catalogue.body.length, 0);

    const encore = await request(app)
      .post(`/api/rental-vehicles/${vehicule.id}/archive`)
      .set(adminHeaders());
    assert.equal(encore.status, 409);
  });
});

describe('Location de véhicules — galerie photo', () => {
  it('ajoute puis retire une photo', async () => {
    const vehicule = await creerVehicule();
    const ajout = await request(app)
      .post(`/api/rental-vehicles/${vehicule.id}/photos`)
      .set(adminHeaders())
      .send({ url: DOC_URL });
    assert.equal(ajout.status, 201, JSON.stringify(ajout.body));
    assert.equal(ajout.body.position, 0);

    const fiche = await request(app)
      .get(`/api/rental-vehicles/${vehicule.id}`)
      .set(adminHeaders());
    assert.equal(fiche.body.photos.length, 1);

    const suppression = await request(app)
      .delete(`/api/rental-vehicles/${vehicule.id}/photos/${ajout.body.id}`)
      .set(adminHeaders());
    assert.equal(suppression.status, 204);

    const ficheApres = await request(app)
      .get(`/api/rental-vehicles/${vehicule.id}`)
      .set(adminHeaders());
    assert.equal(ficheApres.body.photos.length, 0);
  });

  it('12 photos maximum par véhicule', async () => {
    const vehicule = await creerVehicule({ photoUrls: Array.from({ length: 12 }, () => DOC_URL) });
    const treizieme = await request(app)
      .post(`/api/rental-vehicles/${vehicule.id}/photos`)
      .set(adminHeaders())
      .send({ url: DOC_URL });
    assert.equal(treizieme.status, 400);
    assert.equal(treizieme.body.error.code, 'too_many_photos');
  });
});

describe('Location de véhicules — réservation et paiement (moteur commun)', () => {
  it('un client réserve → prix figé sur la durée (inclusive), paiement créé', async () => {
    const vehicule = await creerEtVerifier();
    const { token } = await createTourist();

    const res = await request(app)
      .post(`/api/rental-vehicles/${vehicule.id}/book`)
      .set(authHeaders(token))
      // Le client choisit OÙ récupérer le véhicule (son hôtel…) — optionnel.
      .send({ startDate: dansNJours(5), endDate: dansNJours(7), pickupLocation: 'Hôtel Baraka, Nungwi' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.pickup_location, 'Hôtel Baraka, Nungwi', 'le lieu de remise choisi est gardé');
    assert.equal(res.body.days, 3, 'du 1er au 3e jour = 3 jours pleins, inclusifs');
    assert.equal(Number(res.body.price), 120);
    // La commission zanziGo ne sort JAMAIS vers le client — même règle que
    // daily_commission au catalogue (sanitizeVehicle) : la réponse de
    // réservation la divulguait (commission ÷ jours = daily_commission).
    assert.equal(res.body.commission, undefined);
    assert.ok(res.body.payment.payment_link);
    assert.equal(res.body.payment.rental_booking_id, res.body.id);

    const mine = await request(app)
      .get('/api/rental-vehicles/bookings/mine')
      .set(authHeaders(token));
    assert.equal(mine.status, 200);
    assert.equal(mine.body.length, 1);
    assert.equal(mine.body[0].make, 'Toyota');
    assert.equal(mine.body[0].commission, undefined, 'commission cachée aussi dans « mes locations »');
    assert.equal(mine.body[0].pickup_location, 'Hôtel Baraka, Nungwi', 'le lieu CHOISI, pas celui de la fiche');
    assert.ok(mine.body[0].vehicle_pickup_location, 'le lieu de la fiche reste disponible en repli');
  });

  it('mêmes dates de départ et de retour = 1 jour', async () => {
    const vehicule = await creerEtVerifier();
    const { token } = await createTourist();
    const res = await request(app)
      .post(`/api/rental-vehicles/${vehicule.id}/book`)
      .set(authHeaders(token))
      .send({ startDate: dansNJours(2), endDate: dansNJours(2) });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.days, 1);
    assert.equal(Number(res.body.price), 40);
  });

  it('chevauchement de dates refusé ; des dates libres sont acceptées', async () => {
    const vehicule = await creerEtVerifier();
    const { token: t1 } = await createTourist();
    const { token: t2 } = await createTourist();
    const premiere = await request(app)
      .post(`/api/rental-vehicles/${vehicule.id}/book`)
      .set(authHeaders(t1))
      .send({ startDate: dansNJours(5), endDate: dansNJours(8) });
    assert.equal(premiere.status, 201);

    const chevauche = await request(app)
      .post(`/api/rental-vehicles/${vehicule.id}/book`)
      .set(authHeaders(t2))
      .send({ startDate: dansNJours(7), endDate: dansNJours(9) });
    assert.equal(chevauche.status, 409);
    assert.equal(chevauche.body.error.code, 'dates_unavailable');

    const libre = await request(app)
      .post(`/api/rental-vehicles/${vehicule.id}/book`)
      .set(authHeaders(t2))
      .send({ startDate: dansNJours(9), endDate: dansNJours(10) });
    assert.equal(libre.status, 201, JSON.stringify(libre.body));
  });

  it('véhicule non vérifié ou indisponible → 409 not_available', async () => {
    const vehicule = await creerVehicule(); // jamais vérifié
    const { token } = await createTourist();
    const res = await request(app)
      .post(`/api/rental-vehicles/${vehicule.id}/book`)
      .set(authHeaders(token))
      .send({ startDate: dansNJours(5), endDate: dansNJours(6) });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'not_available');
  });

  it('paiement confirmé (stub) : la location est marquée payée et comptée dans les stats équipe', async () => {
    const vehicule = await creerEtVerifier();
    const { token } = await createTourist();
    const booking = await reserverEtPayer(token, vehicule.id, dansNJours(5), dansNJours(6));

    const mine = await request(app)
      .get('/api/rental-vehicles/bookings/mine')
      .set(authHeaders(token));
    assert.ok(mine.body[0].paid_at);
    assert.equal(mine.body[0].payment_status, 'confirmed');

    const statsEquipe = await request(app).get('/api/stats').set(adminHeaders());
    assert.equal(statsEquipe.body.revenue.today.locations, 1);
    assert.equal(Number(statsEquipe.body.revenue.today.ca.USD), Number(booking.price));
    // La commission n'est plus dans la réponse client : on la recalcule
    // depuis la fiche du véhicule d'essai (8 USD de commission par jour).
    assert.equal(Number(statsEquipe.body.revenue.today.gains.USD), booking.days * 8);
  });
});

describe('Location de véhicules — annulation (barème 24/48 h, comme les places partagées)', () => {
  it('départ à +4 jours ou plus : remboursement 100 %, dates rendues', async () => {
    const vehicule = await creerEtVerifier();
    const { token } = await createLocal();
    const booking = await reserverEtPayer(token, vehicule.id, dansNJours(4), dansNJours(6));

    const annulation = await request(app)
      .post(`/api/rental-vehicles/bookings/${booking.id}/cancel`)
      .set(authHeaders(token));
    assert.equal(annulation.status, 200, JSON.stringify(annulation.body));
    assert.equal(annulation.body.refund.rate, 1);
    assert.equal(Number(annulation.body.refund.amount), Number(booking.price));

    const dus = await request(app).get('/api/payments/remboursements').set(adminHeaders());
    assert.equal(dus.body.length, 1);
    assert.equal(dus.body[0].rental_make, 'Toyota');

    // Les dates sont libres à nouveau.
    const { token: autre } = await createTourist();
    const reprise = await request(app)
      .post(`/api/rental-vehicles/${vehicule.id}/book`)
      .set(authHeaders(autre))
      .send({ startDate: dansNJours(4), endDate: dansNJours(6) });
    assert.equal(reprise.status, 201, JSON.stringify(reprise.body));
  });

  it('à moins de 24 h : annulation refusée pour le client, l’équipe garde la main', async () => {
    const vehicule = await creerEtVerifier();
    const { token } = await createLocal();
    const booking = await reserverEtPayer(token, vehicule.id, dansNJours(0), dansNJours(1));

    const refus = await request(app)
      .post(`/api/rental-vehicles/bookings/${booking.id}/cancel`)
      .set(authHeaders(token));
    assert.equal(refus.status, 409);
    assert.equal(refus.body.error.code, 'invalid_status');

    const parEquipe = await request(app)
      .post(`/api/rental-vehicles/bookings/${booking.id}/cancel`)
      .set(adminHeaders());
    assert.equal(parEquipe.status, 200, JSON.stringify(parEquipe.body));
    assert.equal(parEquipe.body.cancelled, true);
    assert.equal(parEquipe.body.refund, null, 'annulation équipe : pas de remboursement automatique tracé');
  });

  it('non payée : annulable sans remboursement, le paiement pending est soldé', async () => {
    const vehicule = await creerEtVerifier();
    const { token } = await createTourist();
    const resa = await request(app)
      .post(`/api/rental-vehicles/${vehicule.id}/book`)
      .set(authHeaders(token))
      .send({ startDate: dansNJours(0), endDate: dansNJours(1) });
    assert.equal(resa.status, 201);

    const annulation = await request(app)
      .post(`/api/rental-vehicles/bookings/${resa.body.id}/cancel`)
      .set(authHeaders(token));
    assert.equal(annulation.status, 200, JSON.stringify(annulation.body));
    assert.equal(annulation.body.refund, null);

    const pendings = await request(app).get('/api/payments?status=pending').set(adminHeaders());
    assert.equal(pendings.body.length, 0);
  });

  it('seul le réservateur (ou l’équipe) peut annuler sa location', async () => {
    const vehicule = await creerEtVerifier();
    const { token } = await createLocal();
    const { token: autre } = await createLocal();
    const booking = await reserverEtPayer(token, vehicule.id, dansNJours(4), dansNJours(5));

    const refus = await request(app)
      .post(`/api/rental-vehicles/bookings/${booking.id}/cancel`)
      .set(authHeaders(autre));
    assert.equal(refus.status, 403);
  });

  it('déjà annulée : 409', async () => {
    const vehicule = await creerEtVerifier();
    const { token } = await createTourist();
    const resa = await request(app)
      .post(`/api/rental-vehicles/${vehicule.id}/book`)
      .set(authHeaders(token))
      .send({ startDate: dansNJours(4), endDate: dansNJours(5) });
    await request(app)
      .post(`/api/rental-vehicles/bookings/${resa.body.id}/cancel`)
      .set(authHeaders(token));

    const encore = await request(app)
      .post(`/api/rental-vehicles/bookings/${resa.body.id}/cancel`)
      .set(authHeaders(token));
    assert.equal(encore.status, 409);
    assert.equal(encore.body.error.code, 'already_cancelled');
  });
});

describe('Location de véhicules — pièces jointes de l’équipe', () => {
  it('la seule clé équipe suffit pour téléverser (pas besoin de session client)', async () => {
    // Le téléphone de l'équipe n'a pas forcément de session client ouverte :
    // la fiche véhicule envoie ses pièces avec X-Admin-Key seule. Ce test
    // verrouille le contrat côté serveur (requireAuth laisse passer isAdmin) —
    // c'est le bug « je ne peux pas joindre de fichier » du 31/08/2026.
    const res = await request(app)
      .post('/api/uploads')
      .set(adminHeaders())
      .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01]), {
        filename: 'assurance.jpg',
        contentType: 'image/jpeg',
      });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(String(res.body.url).startsWith('http'), 'une URL publique est renvoyée');

    // Sans clé NI jeton : porte fermée.
    const anonyme = await request(app)
      .post('/api/uploads')
      .attach('file', Buffer.from([0xff, 0xd8]), { filename: 'x.jpg', contentType: 'image/jpeg' });
    assert.equal(anonyme.status, 401);
  });
});

describe('Location de véhicules — file de vérification (queue commune)', () => {
  it('apparaît dans /verifications avec ses deux documents ; disparaît une fois vérifié', async () => {
    const vehicule = await creerVehicule();
    const file = await request(app).get('/api/verifications').set(adminHeaders());
    assert.equal(file.status, 200);
    assert.equal(file.body.par_type.vehicule, 1);
    const dossier = file.body.dossiers.find((d) => d.type === 'vehicule' && d.id === vehicule.id);
    assert.ok(dossier, 'le véhicule doit apparaître dans la file');
    assert.equal(dossier.documents.length, 2);
    assert.ok(dossier.documents.some((p) => p.libelle === 'Assurance'));
    assert.ok(dossier.documents.some((p) => p.libelle === 'Road licence'));
    // Le loueur, jamais le client (pas encore de réservation) — c'est lui
    // que l'équipe rappelle en cas de doute sur un document.
    assert.equal(dossier.contact, '+255700000001');

    await request(app)
      .patch(`/api/rental-vehicles/${vehicule.id}/verify`)
      .set(adminHeaders())
      .send({ status: 'verified' });
    const fileApres = await request(app).get('/api/verifications').set(adminHeaders());
    assert.equal(fileApres.body.par_type.vehicule, 0);
  });
});
