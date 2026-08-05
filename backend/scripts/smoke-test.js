// Tests de bout en bout avec de vraies requêtes HTTP contre le serveur démarré
// et une vraie base PostgreSQL. Couvre les deux flux métier complets du cahier
// des charges + les règles métier critiques. Sort avec un code != 0 au premier échec.
//
// Usage : le serveur doit tourner (npm start), puis `npm run smoke-test`.

const BASE = process.env.API_URL || 'http://localhost:3000/api';

let passed = 0;
let failed = 0;

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

// Suffixe unique pour rendre le script rejouable (téléphones/plaques uniques).
const run = Date.now().toString(36);

async function main() {
  console.log('— Santé du serveur');
  const health = await call('GET', '/health');
  check('GET /health répond ok', health.status === 200 && health.body.status === 'ok', health);

  console.log('— Inscriptions');
  const tourist = (
    await call('POST', '/users', {
      fullName: 'Alice Tourist',
      phone: `+3361${run}`,
      email: 'alice@example.com',
      accountType: 'tourist',
    })
  ).body;
  check('touriste créé en USD, vérifié d’office', tourist.currency === 'USD' && tourist.verification_status === 'verified', tourist);

  const resident = (
    await call('POST', '/users', {
      fullName: 'Bakari Resident',
      phone: `+2557${run}`,
      accountType: 'resident',
      idDocumentUrl: 'https://files.example.com/id-bakari.jpg',
    })
  ).body;
  check('résident créé en TZS, en attente de vérification', resident.currency === 'TZS' && resident.verification_status === 'pending', resident);

  const residentNoDoc = await call('POST', '/users', {
    fullName: 'Sans Document',
    phone: `+2558${run}`,
    accountType: 'resident',
  });
  check('résident sans document -> 400 validation_error', residentNoDoc.status === 400 && residentNoDoc.body.error.code === 'validation_error', residentNoDoc);

  console.log('— Règle métier : tarif local bloqué avant vérification');
  const blockedTrip = await call('POST', '/trips', {
    userId: resident.id,
    tripType: 'shared_local',
    pickupLocation: 'Stone Town',
    dropoffLocation: 'Bububu',
  });
  check('shared_local refusé tant que non vérifié (403 resident_not_verified)', blockedTrip.status === 403 && blockedTrip.body.error.code === 'resident_not_verified', blockedTrip);

  const residentVerified = (await call('PATCH', `/users/${resident.id}/verify`, { status: 'verified' })).body;
  check('validation manuelle du résident', residentVerified.verification_status === 'verified', residentVerified);

  const localTrip = await call('POST', '/trips', {
    userId: resident.id,
    tripType: 'shared_local',
    pickupLocation: 'Stone Town',
    dropoffLocation: 'Bububu',
  });
  check('shared_local accepté après vérification (prix TZS figé)', localTrip.status === 201 && localTrip.body.currency === 'TZS', localTrip);

  console.log('— Chauffeur : candidature puis validation (QR véhicule)');
  const driver = (
    await call('POST', '/drivers', {
      fullName: 'Juma Driver',
      phone: `+2559${run}`,
      licenseNumber: `LIC-${run}`,
      vehiclePlate: `Z-${run}`,
      vehicleModel: 'Toyota Noah',
      zone: 'Stone Town',
      licenseDocumentUrl: 'https://files.example.com/lic-juma.jpg',
      idDocumentUrl: 'https://files.example.com/id-juma.jpg',
    })
  ).body;
  check('candidature chauffeur en pending, sans QR', driver.verification_status === 'pending' && driver.vehicle_qr_code === null, driver);

  const assignBeforeVerify = await call('PATCH', `/trips/${localTrip.body.id}/assign-driver`, { driverId: driver.id });
  check('assignation refusée tant que chauffeur non validé (409)', assignBeforeVerify.status === 409 && assignBeforeVerify.body.error.code === 'driver_not_verified', assignBeforeVerify);

  const driverVerified = (await call('PATCH', `/drivers/${driver.id}/verify`, { status: 'verified' })).body;
  check('validation chauffeur -> QR véhicule fixe généré', driverVerified.verification_status === 'verified' && /^VEH-/.test(driverVerified.vehicle_qr_code), driverVerified);

  const search = await call('GET', `/drivers?zone=${encodeURIComponent('Stone Town')}&available=true`);
  check('recherche chauffeurs vérifiés disponibles par zone', search.status === 200 && search.body.some((d) => d.id === driver.id), search.body?.length);

  console.log('— Flux complet : course privée');
  const trip = (
    await call('POST', '/trips', {
      userId: tourist.id,
      tripType: 'private',
      pickupLocation: 'Aéroport AAKIA',
      dropoffLocation: 'Nungwi',
    })
  ).body;
  check('demande créée (requested), prix USD figé, lien WhatsApp généré', trip.status === 'requested' && trip.currency === 'USD' && trip.whatsapp_link?.includes('wa.me'), trip);

  const earlyPayment = await call('POST', `/trips/${trip.id}/payment`, {});
  check('paiement refusé avant confirmation chauffeur (409)', earlyPayment.status === 409 && earlyPayment.body.error.code === 'invalid_status', earlyPayment);

  const assigned = (await call('PATCH', `/trips/${trip.id}/assign-driver`, { driverId: driver.id })).body;
  check('chauffeur confirmé par l’équipe', assigned.status === 'driver_confirmed' && assigned.driver_id === driver.id, assigned);

  const tripPayment = (await call('POST', `/trips/${trip.id}/payment`, {})).body;
  check('lien de paiement Pesapal (stub) créé', tripPayment.status === 'pending' && !!tripPayment.payment_link, tripPayment);

  const startBeforePaid = await call('PATCH', `/trips/${trip.id}/start`, { qrCode: driverVerified.vehicle_qr_code });
  check('départ refusé avant paiement (409)', startBeforePaid.status === 409, startBeforePaid);

  const confirmed = (await call('POST', `/payments/${tripPayment.id}/confirm`, {})).body;
  check('paiement confirmé (simulation webhook Pesapal)', confirmed.status === 'confirmed', confirmed);

  const tripPaid = (await call('GET', `/trips/${trip.id}`)).body;
  check('trajet passé en paid', tripPaid.status === 'paid', tripPaid);

  const doubleConfirm = await call('POST', `/payments/${tripPayment.id}/confirm`, {});
  check('double confirmation refusée (409)', doubleConfirm.status === 409 && doubleConfirm.body.error.code === 'payment_already_processed', doubleConfirm);

  const wrongQr = await call('PATCH', `/trips/${trip.id}/start`, { qrCode: 'VEH-fake-qr' });
  check('QR d’un autre véhicule refusé (403 qr_mismatch)', wrongQr.status === 403 && wrongQr.body.error.code === 'qr_mismatch', wrongQr);

  const started = (await call('PATCH', `/trips/${trip.id}/start`, { qrCode: driverVerified.vehicle_qr_code })).body;
  check('scan départ -> in_progress', started.status === 'in_progress' && !!started.started_at, started);

  const completed = (await call('PATCH', `/trips/${trip.id}/complete`, { qrCode: driverVerified.vehicle_qr_code })).body;
  check('scan arrivée -> completed', completed.status === 'completed' && !!completed.completed_at, completed);

  const rated = (await call('POST', `/trips/${trip.id}/rating`, { rating: 5, comment: 'Parfait !' })).body;
  check('notation 5/5 enregistrée', rated.rating === 5, rated);

  const doubleRating = await call('POST', `/trips/${trip.id}/rating`, { rating: 1 });
  check('double notation refusée (409 already_rated)', doubleRating.status === 409 && doubleRating.body.error.code === 'already_rated', doubleRating);

  const driverAfter = (await call('GET', `/drivers/${driver.id}`)).body;
  check('note moyenne du chauffeur mise à jour', Number(driverAfter.rating_avg) === 5 && driverAfter.rating_count === 1, driverAfter);

  const history = await call('GET', `/trips?userId=${tourist.id}`);
  check('historique utilisateur contient la course', history.status === 200 && history.body.some((t) => t.id === trip.id), history.body?.length);

  console.log('— Flux complet : colis envoyé par un hôtel');
  const hotel = (
    await call('POST', '/hotels', {
      name: 'Hotel Baraka',
      contactName: 'Fatma',
      phone: `+2551${run}`,
      zone: 'Nungwi',
    })
  ).body;
  check('hôtel partenaire inscrit', !!hotel.id, hotel);

  const badSender = await call('POST', '/packages', {
    senderType: 'hotel',
    senderUserId: tourist.id,
    pickupLocation: 'Hotel Baraka',
    dropoffLocation: 'Stone Town',
    recipientName: 'Omar',
    recipientPhone: `+2552${run}`,
  });
  check('expéditeur incohérent (user id pour senderType hotel) -> 400', badSender.status === 400 && badSender.body.error.code === 'validation_error', badSender);

  const pkg = (
    await call('POST', '/packages', {
      senderType: 'hotel',
      senderHotelId: hotel.id,
      pickupLocation: 'Hotel Baraka, Nungwi',
      dropoffLocation: 'Marché de Stone Town',
      recipientName: 'Omar',
      recipientPhone: `+2552${run}`,
      description: 'Documents clients',
    })
  ).body;
  check('colis créé avec QR unique, prix TZS figé', pkg.status === 'created' && /^PKG-/.test(pkg.qr_code) && pkg.currency === 'TZS', pkg);

  const pkgPayment = (await call('POST', `/packages/${pkg.id}/payment`, {})).body;
  check('lien de paiement colis créé', pkgPayment.status === 'pending' && pkgPayment.package_id === pkg.id, pkgPayment);

  const pickupBeforePaid = await call('PATCH', `/packages/${pkg.id}/pickup`, {
    qrCode: pkg.qr_code,
    photoUrl: 'https://files.example.com/pickup.jpg',
  });
  check('ramassage refusé avant paiement (409)', pickupBeforePaid.status === 409, pickupBeforePaid);

  await call('POST', `/payments/${pkgPayment.id}/confirm`, {});
  const pkgPaid = (await call('GET', `/packages/${pkg.id}`)).body;
  check('colis passé en paid après confirmation', pkgPaid.status === 'paid', pkgPaid);

  const wrongPkgQr = await call('PATCH', `/packages/${pkg.id}/pickup`, {
    qrCode: 'PKG-fake',
    photoUrl: 'https://files.example.com/pickup.jpg',
  });
  check('QR d’un autre colis refusé (403 qr_mismatch)', wrongPkgQr.status === 403 && wrongPkgQr.body.error.code === 'qr_mismatch', wrongPkgQr);

  const pickedUp = (
    await call('PATCH', `/packages/${pkg.id}/pickup`, {
      qrCode: pkg.qr_code,
      photoUrl: 'https://files.example.com/pickup.jpg',
      driverId: driver.id,
    })
  ).body;
  check('ramassage : photo + QR + chauffeur -> picked_up', pickedUp.status === 'picked_up' && !!pickedUp.pickup_photo_url && pickedUp.driver_id === driver.id, pickedUp);

  const delivered = (
    await call('PATCH', `/packages/${pkg.id}/deliver`, {
      qrCode: pkg.qr_code,
      photoUrl: 'https://files.example.com/delivery.jpg',
    })
  ).body;
  check('livraison : photo + QR -> delivered', delivered.status === 'delivered' && !!delivered.delivery_photo_url, delivered);

  const byQr = await call('GET', `/packages/by-qr/${pkg.qr_code}`);
  check('lookup par QR (app chauffeur)', byQr.status === 200 && byQr.body.id === pkg.id, byQr);

  const hotelHistory = await call('GET', `/hotels/${hotel.id}/packages`);
  check('historique des colis de l’hôtel', hotelHistory.status === 200 && hotelHistory.body.some((p) => p.id === pkg.id), hotelHistory.body?.length);

  console.log(`\n${passed} tests réussis, ${failed} échec(s).`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Erreur inattendue :', err);
  process.exit(1);
});
