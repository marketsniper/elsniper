// Tests de bout en bout avec de vraies requêtes HTTP contre le serveur démarré
// et une vraie base PostgreSQL. Couvre les deux flux métier complets du cahier
// des charges, les règles métier critiques ET l'authentification (OTP + JWT,
// ownership, routes équipe). Sort avec un code != 0 au premier échec.
//
// Usage : le serveur doit tourner (npm start), puis `npm run smoke-test`.
// Nécessite NODE_ENV != production côté serveur (utilise devCode de l'OTP).

const BASE = process.env.API_URL || 'http://localhost:3000/api';
const ADMIN = { 'X-Admin-Key': process.env.ADMIN_API_KEY || 'dev-admin-key' };

let passed = 0;
let failed = 0;

async function call(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

// Authentifie un numéro par OTP (via devCode, exposé hors production).
// Le header admin sert uniquement à exempter le smoke-test du rate limiting.
async function authenticate(phone) {
  const otp = await call('POST', '/auth/request-otp', { phone }, ADMIN);
  if (!otp.body?.devCode) {
    throw new Error(`request-otp sans devCode pour ${phone}: ${JSON.stringify(otp)}`);
  }
  const verified = await call('POST', '/auth/verify-otp', { phone, code: otp.body.devCode });
  if (!verified.body?.token) {
    throw new Error(`verify-otp sans token pour ${phone}: ${JSON.stringify(verified)}`);
  }
  return verified.body;
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

// Suffixe numérique unique pour rendre le script rejouable
// (téléphones au format +255..., plaques et permis uniques).
const run = Date.now().toString().slice(-7);
const PHONES = {
  tourist: `+33611${run}`,
  resident: `+25571${run}`,
  noDoc: `+25572${run}`,
  driver: `+25573${run}`,
  hotel: `+25574${run}`,
};

async function main() {
  console.log('— Santé du serveur');
  const health = await call('GET', '/health');
  check('GET /health répond ok', health.status === 200 && health.body.status === 'ok', health);

  console.log('— Authentification OTP + JWT');
  const noToken = await call('POST', '/users', { fullName: 'X', phone: '+255999', accountType: 'tourist' });
  check('route protégée sans jeton -> 401 unauthorized', noToken.status === 401 && noToken.body.error.code === 'unauthorized', noToken);

  const badPhone = await call('POST', '/auth/request-otp', { phone: '0612' }, ADMIN);
  check('request-otp avec numéro invalide -> 400', badPhone.status === 400 && badPhone.body.error.code === 'validation_error', badPhone);

  await call('POST', '/auth/request-otp', { phone: PHONES.tourist }, ADMIN);
  const wrongCode = await call('POST', '/auth/verify-otp', { phone: PHONES.tourist, code: '000000' });
  check('mauvais code OTP -> 401 invalid_otp', wrongCode.status === 401 && wrongCode.body.error.code === 'invalid_otp', wrongCode);

  const touristAuth = await authenticate(PHONES.tourist);
  check('flux OTP -> JWT (aucun profil encore)', !!touristAuth.token && touristAuth.user === null, touristAuth);
  const touristToken = touristAuth.token;

  console.log('— Inscriptions');
  const phoneMismatch = await call(
    'POST',
    '/users',
    { fullName: 'Imposteur', phone: '+255700000001', accountType: 'tourist' },
    bearer(touristToken)
  );
  check('création de profil avec un autre téléphone que le jeton -> 403 phone_mismatch', phoneMismatch.status === 403 && phoneMismatch.body.error.code === 'phone_mismatch', phoneMismatch);

  const tourist = (
    await call(
      'POST',
      '/users',
      { fullName: 'Alice Tourist', phone: PHONES.tourist, email: 'alice@example.com', accountType: 'tourist' },
      bearer(touristToken)
    )
  ).body;
  check('touriste créé en USD, vérifié d’office', tourist.currency === 'USD' && tourist.verification_status === 'verified', tourist);

  const residentToken = (await authenticate(PHONES.resident)).token;
  const resident = (
    await call(
      'POST',
      '/users',
      {
        fullName: 'Bakari Resident',
        phone: PHONES.resident,
        accountType: 'resident',
        idDocumentUrl: 'https://files.example.com/id-bakari.jpg',
      },
      bearer(residentToken)
    )
  ).body;
  check('résident créé en TZS, en attente de vérification', resident.currency === 'TZS' && resident.verification_status === 'pending', resident);

  const noDocToken = (await authenticate(PHONES.noDoc)).token;
  const residentNoDoc = await call(
    'POST',
    '/users',
    { fullName: 'Sans Document', phone: PHONES.noDoc, accountType: 'resident' },
    bearer(noDocToken)
  );
  check('résident sans document -> 400 validation_error', residentNoDoc.status === 400 && residentNoDoc.body.error.code === 'validation_error', residentNoDoc);

  console.log('— Règle métier : tarif local bloqué avant vérification');
  const blockedTrip = await call(
    'POST',
    '/trips',
    { userId: resident.id, tripType: 'shared_local', pickupLocation: 'Stone Town', dropoffLocation: 'Bububu' },
    bearer(residentToken)
  );
  check('shared_local refusé tant que non vérifié (403 resident_not_verified)', blockedTrip.status === 403 && blockedTrip.body.error.code === 'resident_not_verified', blockedTrip);

  const verifyNoAdmin = await call('PATCH', `/users/${resident.id}/verify`, { status: 'verified' }, bearer(residentToken));
  check('validation de compte sans clé équipe -> 401 admin_required', verifyNoAdmin.status === 401 && verifyNoAdmin.body.error.code === 'admin_required', verifyNoAdmin);

  const residentVerified = (await call('PATCH', `/users/${resident.id}/verify`, { status: 'verified' }, ADMIN)).body;
  check('validation manuelle du résident (équipe)', residentVerified.verification_status === 'verified', residentVerified);

  const localTrip = await call(
    'POST',
    '/trips',
    { userId: resident.id, tripType: 'shared_local', pickupLocation: 'Stone Town', dropoffLocation: 'Bububu' },
    bearer(residentToken)
  );
  check('shared_local accepté après vérification (prix TZS figé)', localTrip.status === 201 && localTrip.body.currency === 'TZS', localTrip);

  console.log('— Chauffeur : candidature puis validation (QR véhicule)');
  const driverToken = (await authenticate(PHONES.driver)).token;
  const driver = (
    await call(
      'POST',
      '/drivers',
      {
        fullName: 'Juma Driver',
        phone: PHONES.driver,
        licenseNumber: `LIC-${run}`,
        vehiclePlate: `Z-${run}`,
        vehicleModel: 'Toyota Noah',
        zone: 'Stone Town',
        licenseDocumentUrl: 'https://files.example.com/lic-juma.jpg',
        idDocumentUrl: 'https://files.example.com/id-juma.jpg',
      },
      bearer(driverToken)
    )
  ).body;
  check('candidature chauffeur en pending, sans QR', driver.verification_status === 'pending' && driver.vehicle_qr_code === null, driver);

  const assignBeforeVerify = await call('PATCH', `/trips/${localTrip.body.id}/assign-driver`, { driverId: driver.id }, ADMIN);
  check('assignation refusée tant que chauffeur non validé (409)', assignBeforeVerify.status === 409 && assignBeforeVerify.body.error.code === 'driver_not_verified', assignBeforeVerify);

  const driverVerified = (await call('PATCH', `/drivers/${driver.id}/verify`, { status: 'verified' }, ADMIN)).body;
  check('validation chauffeur -> QR véhicule fixe généré', driverVerified.verification_status === 'verified' && /^VEH-/.test(driverVerified.vehicle_qr_code), driverVerified);

  const search = await call('GET', `/drivers?zone=${encodeURIComponent('Stone Town')}&available=true`, undefined, ADMIN);
  check('recherche chauffeurs vérifiés disponibles par zone (équipe)', search.status === 200 && search.body.some((d) => d.id === driver.id), search.body?.length);

  const searchNoAdmin = await call('GET', '/drivers?zone=Stone%20Town', undefined, bearer(touristToken));
  check('recherche chauffeurs sans clé équipe -> 401', searchNoAdmin.status === 401, searchNoAdmin);

  console.log('— Flux complet : course privée');
  const trip = (
    await call(
      'POST',
      '/trips',
      { userId: tourist.id, tripType: 'private', pickupLocation: 'Aéroport AAKIA', dropoffLocation: 'Nungwi' },
      bearer(touristToken)
    )
  ).body;
  check('demande créée (requested), prix USD figé, lien WhatsApp généré', trip.status === 'requested' && trip.currency === 'USD' && trip.whatsapp_link?.includes('wa.me'), trip);

  const foreignRead = await call('GET', `/trips/${trip.id}`, undefined, bearer(residentToken));
  check('un client ne peut pas lire la course d’un autre -> 403', foreignRead.status === 403 && foreignRead.body.error.code === 'forbidden', foreignRead);

  const earlyPayment = await call('POST', `/trips/${trip.id}/payment`, {}, bearer(touristToken));
  check('paiement refusé avant confirmation chauffeur (409)', earlyPayment.status === 409 && earlyPayment.body.error.code === 'invalid_status', earlyPayment);

  const assigned = (await call('PATCH', `/trips/${trip.id}/assign-driver`, { driverId: driver.id }, ADMIN)).body;
  check('chauffeur confirmé par l’équipe', assigned.status === 'driver_confirmed' && assigned.driver_id === driver.id, assigned);

  const tripPayment = (await call('POST', `/trips/${trip.id}/payment`, {}, bearer(touristToken))).body;
  check('lien de paiement Pesapal (stub) créé', tripPayment.status === 'pending' && !!tripPayment.payment_link, tripPayment);

  const startBeforePaid = await call('PATCH', `/trips/${trip.id}/start`, { qrCode: driverVerified.vehicle_qr_code }, bearer(driverToken));
  check('départ refusé avant paiement (409)', startBeforePaid.status === 409, startBeforePaid);

  const confirmed = (await call('POST', `/payments/${tripPayment.id}/confirm`, {}, bearer(touristToken))).body;
  check('paiement confirmé (simulation webhook Pesapal)', confirmed.status === 'confirmed', confirmed);

  const tripPaid = (await call('GET', `/trips/${trip.id}`, undefined, bearer(touristToken))).body;
  check('trajet passé en paid', tripPaid.status === 'paid', tripPaid);

  const doubleConfirm = await call('POST', `/payments/${tripPayment.id}/confirm`, {}, bearer(touristToken));
  check('double confirmation refusée (409)', doubleConfirm.status === 409 && doubleConfirm.body.error.code === 'payment_already_processed', doubleConfirm);

  const startByTourist = await call('PATCH', `/trips/${trip.id}/start`, { qrCode: driverVerified.vehicle_qr_code }, bearer(touristToken));
  check('départ scanné par un non-chauffeur -> 403', startByTourist.status === 403 && startByTourist.body.error.code === 'forbidden', startByTourist);

  const wrongQr = await call('PATCH', `/trips/${trip.id}/start`, { qrCode: 'VEH-fake-qr' }, bearer(driverToken));
  check('QR d’un autre véhicule refusé (403 qr_mismatch)', wrongQr.status === 403 && wrongQr.body.error.code === 'qr_mismatch', wrongQr);

  const started = (await call('PATCH', `/trips/${trip.id}/start`, { qrCode: driverVerified.vehicle_qr_code }, bearer(driverToken))).body;
  check('scan départ -> in_progress', started.status === 'in_progress' && !!started.started_at, started);

  const completed = (await call('PATCH', `/trips/${trip.id}/complete`, { qrCode: driverVerified.vehicle_qr_code }, bearer(driverToken))).body;
  check('scan arrivée -> completed', completed.status === 'completed' && !!completed.completed_at, completed);

  const rated = (await call('POST', `/trips/${trip.id}/rating`, { rating: 5, comment: 'Parfait !' }, bearer(touristToken))).body;
  check('notation 5/5 enregistrée', rated.rating === 5, rated);

  const doubleRating = await call('POST', `/trips/${trip.id}/rating`, { rating: 1 }, bearer(touristToken));
  check('double notation refusée (409 already_rated)', doubleRating.status === 409 && doubleRating.body.error.code === 'already_rated', doubleRating);

  const driverAfter = (await call('GET', `/drivers/${driver.id}`, undefined, bearer(driverToken))).body;
  check('note moyenne du chauffeur mise à jour (lecture par lui-même)', Number(driverAfter.rating_avg) === 5 && driverAfter.rating_count === 1, driverAfter);

  const history = await call('GET', `/trips?userId=${tourist.id}`, undefined, bearer(touristToken));
  check('historique utilisateur contient la course', history.status === 200 && history.body.some((t) => t.id === trip.id), history.body?.length);

  const foreignHistory = await call('GET', `/trips?userId=${tourist.id}`, undefined, bearer(residentToken));
  check('historique d’un autre utilisateur -> 403', foreignHistory.status === 403, foreignHistory);

  console.log('— Flux complet : colis envoyé par un hôtel');
  const hotelEmail = `hotel${run}@test.example.com`;
  const hotelPassword = 'MotDePasse#1';
  const hotelCreated = await call('POST', '/hotels', {
    name: 'Hotel Baraka',
    contactName: 'Fatma',
    email: hotelEmail,
    password: hotelPassword,
    phone: PHONES.hotel,
    zone: 'Nungwi',
  });
  check('hôtel partenaire inscrit (email + mot de passe)', hotelCreated.status === 201 && !!hotelCreated.body.id, hotelCreated);

  const badLogin = await call('POST', '/auth/hotel-login', { email: hotelEmail, password: 'mauvais' });
  check('connexion hôtel avec mauvais mot de passe -> 401', badLogin.status === 401 && badLogin.body.error.code === 'invalid_credentials', badLogin);

  const hotelLogin = await call('POST', '/auth/hotel-login', { email: hotelEmail, password: hotelPassword });
  check('connexion hôtel par email + mot de passe', hotelLogin.status === 200 && !!hotelLogin.body.token, hotelLogin);
  const hotelToken = hotelLogin.body.token;
  const hotel = hotelLogin.body.hotel;

  const hotelTrip = await call(
    'POST',
    '/trips',
    {
      hotelId: hotel.id,
      clientName: 'M. Dupont',
      clientPhone: '+33612345678',
      tripType: 'private',
      pickupLocation: 'Hotel Baraka, Nungwi',
      dropoffLocation: 'Aéroport AAKIA',
    },
    bearer(hotelToken)
  );
  check('hôtel réserve un taxi pour son client (prix TZS figé)', hotelTrip.status === 201 && hotelTrip.body.currency === 'TZS' && hotelTrip.body.client_name === 'M. Dupont', hotelTrip);

  const badSender = await call(
    'POST',
    '/packages',
    {
      senderType: 'hotel',
      senderUserId: tourist.id,
      pickupLocation: 'Hotel Baraka',
      dropoffLocation: 'Stone Town',
      recipientName: 'Omar',
      recipientPhone: `+2552${run}`,
    },
    bearer(hotelToken)
  );
  check('expéditeur incohérent (user id pour senderType hotel) -> 400', badSender.status === 400 && badSender.body.error.code === 'validation_error', badSender);

  const pkg = (
    await call(
      'POST',
      '/packages',
      {
        senderType: 'hotel',
        senderHotelId: hotel.id,
        pickupLocation: 'Hotel Baraka, Nungwi',
        dropoffLocation: 'Marché de Stone Town',
        recipientName: 'Omar',
        recipientPhone: `+2552${run}`,
        description: 'Documents clients',
      },
      bearer(hotelToken)
    )
  ).body;
  check('colis créé avec QR unique, prix TZS figé', pkg.status === 'created' && /^PKG-/.test(pkg.qr_code) && pkg.currency === 'TZS', pkg);

  const pkgPayment = (await call('POST', `/packages/${pkg.id}/payment`, {}, bearer(hotelToken))).body;
  check('lien de paiement colis créé', pkgPayment.status === 'pending' && pkgPayment.package_id === pkg.id, pkgPayment);

  const pickupBeforePaid = await call(
    'PATCH',
    `/packages/${pkg.id}/pickup`,
    { qrCode: pkg.qr_code, photoUrl: 'https://files.example.com/pickup.jpg' },
    bearer(driverToken)
  );
  check('ramassage refusé avant paiement (409)', pickupBeforePaid.status === 409, pickupBeforePaid);

  await call('POST', `/payments/${pkgPayment.id}/confirm`, {}, bearer(hotelToken));
  const pkgPaid = (await call('GET', `/packages/${pkg.id}`, undefined, bearer(hotelToken))).body;
  check('colis passé en paid après confirmation', pkgPaid.status === 'paid', pkgPaid);

  const wrongPkgQr = await call(
    'PATCH',
    `/packages/${pkg.id}/pickup`,
    { qrCode: 'PKG-fake', photoUrl: 'https://files.example.com/pickup.jpg' },
    bearer(driverToken)
  );
  check('QR d’un autre colis refusé (403 qr_mismatch)', wrongPkgQr.status === 403 && wrongPkgQr.body.error.code === 'qr_mismatch', wrongPkgQr);

  const pickupByTourist = await call(
    'PATCH',
    `/packages/${pkg.id}/pickup`,
    { qrCode: pkg.qr_code, photoUrl: 'https://files.example.com/pickup.jpg' },
    bearer(touristToken)
  );
  check('ramassage par un non-chauffeur -> 403', pickupByTourist.status === 403 && pickupByTourist.body.error.code === 'forbidden', pickupByTourist);

  const pickedUp = (
    await call(
      'PATCH',
      `/packages/${pkg.id}/pickup`,
      { qrCode: pkg.qr_code, photoUrl: 'https://files.example.com/pickup.jpg' },
      bearer(driverToken)
    )
  ).body;
  check('ramassage : photo + QR -> picked_up, chauffeur du jeton enregistré', pickedUp.status === 'picked_up' && !!pickedUp.pickup_photo_url && pickedUp.driver_id === driver.id, pickedUp);

  const delivered = (
    await call(
      'PATCH',
      `/packages/${pkg.id}/deliver`,
      { qrCode: pkg.qr_code, photoUrl: 'https://files.example.com/delivery.jpg' },
      bearer(driverToken)
    )
  ).body;
  check('livraison : photo + QR -> delivered', delivered.status === 'delivered' && !!delivered.delivery_photo_url, delivered);

  const byQr = await call('GET', `/packages/by-qr/${pkg.qr_code}`, undefined, bearer(driverToken));
  check('lookup par QR (app chauffeur)', byQr.status === 200 && byQr.body.id === pkg.id, byQr);

  const byQrTourist = await call('GET', `/packages/by-qr/${pkg.qr_code}`, undefined, bearer(touristToken));
  check('lookup par QR par un non-chauffeur -> 403', byQrTourist.status === 403, byQrTourist);

  const hotelHistory = await call('GET', `/hotels/${hotel.id}/packages`, undefined, bearer(hotelToken));
  check('historique des colis de l’hôtel', hotelHistory.status === 200 && hotelHistory.body.some((p) => p.id === pkg.id), hotelHistory.body?.length);

  const foreignHotelHistory = await call('GET', `/hotels/${hotel.id}/packages`, undefined, bearer(touristToken));
  check('historique colis d’un hôtel par un tiers -> 403', foreignHotelHistory.status === 403, foreignHotelHistory);

  console.log(`\n${passed} tests réussis, ${failed} échec(s).`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Erreur inattendue :', err);
  process.exit(1);
});
