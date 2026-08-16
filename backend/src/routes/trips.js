import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isAdmin, requireAuth, requireAdmin } from '../middleware/auth.js';
import { hubToHubRoute, priceTrip, sharedAllowedForRoute } from '../services/pricingService.js';
import { createPaymentOrder, isStubMode } from '../services/pesapalService.js';
import { circuitPaiementUsd } from '../services/paypalService.js';
import {
  buildTeamNotificationLink,
  lienGroupeChauffeurs,
  messageGroupeChauffeurs,
  tripRequestMessage,
} from '../services/whatsappService.js';
import { assertHotelVerified, libellePartenaire } from './hotels.js';
import { randomUUID } from 'node:crypto';
import { tauxRemboursement } from '../services/annulationService.js';
import { alertePaiementCourse, aValiderALaMain } from '../services/paiementManuel.js';
import { notifierEquipe } from '../services/emailService.js';
import {
  alerterCourseAnnulee,
  alerterCoursePayee,
  alerterNouvelleCourse,
} from '../services/alertesChauffeur.js';

const router = Router();

/**
 * Ajoute à une course, POUR L'ÉQUIPE SEULEMENT, l'annonce prête à coller dans
 * le groupe WhatsApp des chauffeurs (anglais + swahili). Calculée à la volée :
 * si le prix ou l'heure changent, l'annonce suit, sans copie périmée en base.
 * Réservée aux courses privées — les taxis partagés se remplissent par la
 * bourse aux places, pas par le groupe.
 */
function avecAnnonceGroupe(trip, req) {
  if (!trip || !isAdmin(req) || trip.trip_type !== 'private') return trip;
  return {
    ...trip,
    message_groupe_chauffeurs: messageGroupeChauffeurs(trip),
    lien_groupe_chauffeurs: lienGroupeChauffeurs(trip),
  };
}

// Une course est réservée soit par un compte client (userId), soit par un
// hôtel partenaire pour l'un de ses clients (hotelId + nom et téléphone).
const createTripSchema = z
  .object({
    userId: z.string().uuid().optional(),
    hotelId: z.string().uuid().optional(),
    clientName: z.string().min(2).optional(),
    clientPhone: z.string().min(6).optional(),
    tripType: z.enum(['private', 'shared_tourist', 'shared_local', 'posted_return']),
    pickupLocation: z.string().min(2),
    dropoffLocation: z.string().min(2),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
    // Transfert aéroport : n° de vol pour vérifier l'heure d'atterrissage.
    flightNumber: z.string().min(2).max(12).optional(),
    // Course privée uniquement : aller-retour avec attente (prix ×1,8) et
    // options véhicule (siège bébé, gros bagages).
    roundTrip: z.boolean().optional(),
    babySeat: z.boolean().optional(),
    bulkyLuggage: z.boolean().optional(),
  })
  .refine((d) => Boolean(d.userId) !== Boolean(d.hotelId), {
    path: ['userId'],
    message: 'Fournir soit userId (client), soit hotelId (hôtel) — pas les deux',
  })
  .refine((d) => !d.hotelId || (d.clientName && d.clientPhone), {
    path: ['clientName'],
    message: "clientName et clientPhone requis pour une réservation d'hôtel",
  });

const assignDriverSchema = z.object({ driverId: z.string().uuid() });
const ratingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

// Infos PUBLIQUES du taxi assigné, jointes aux courses : dès que tout est
// réglé, le client sait qui vient le chercher (nom du chauffeur, plaque,
// modèle du véhicule).
const CHAMPS_CHAUFFEUR = `d.full_name AS driver_name, d.vehicle_plate, d.vehicle_model`;

async function getTrip(id) {
  const { rows } = await query(
    `SELECT t.*, ${CHAMPS_CHAUFFEUR}
     FROM trips t LEFT JOIN drivers d ON d.id = t.driver_id
     WHERE t.id = $1`,
    [id]
  );
  if (!rows[0]) throw notFound('Trajet');
  return rows[0];
}

// POST /trips — demande de trajet : calcule le prix (figé), génère le lien
// WhatsApp pour que l'équipe organise le matching manuellement.
// Le client ne peut réserver que pour lui-même (userId = jeton).
// Règle métier : le tarif local (shared_local) est réservé aux résidents
// dont le document a été vérifié par l'équipe.
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = createTripSchema.parse(req.body);

    // Stone Town, le ferry et l'aéroport sont à quelques minutes : aucune
    // course n'est proposée entre ces trois points.
    if (hubToHubRoute(data.pickupLocation, data.dropoffLocation)) {
      throw new HttpError(
        422,
        'route_indisponible',
        'Pas de course entre Stone Town, le ferry et l\'aéroport — ces points sont à quelques minutes les uns des autres'
      );
    }

    // Pas de taxi partagé sur les trajets courts (course privée du même
    // trajet à moins de 35 USD) : course privée uniquement.
    if (data.tripType !== 'private' && !sharedAllowedForRoute(data.pickupLocation, data.dropoffLocation)) {
      throw new HttpError(
        422,
        'no_shared_route',
        'Pas de taxi partagé sur ce trajet court — réservez une course privée'
      );
    }

    let bookerLabel;
    let audience;

    if (data.userId) {
      // ----- Réservation par un compte client -----
      if (!isAdmin(req) && data.userId !== req.auth.userId) {
        throw new HttpError(403, 'forbidden', 'Un client ne peut réserver que pour lui-même');
      }
      const { rows: userRows } = await query('SELECT * FROM users WHERE id = $1', [data.userId]);
      const user = userRows[0];
      if (!user) throw notFound('Utilisateur');
      // Profil radié par l'équipe : plus aucune réservation possible.
      if (user.banned_at) {
        throw new HttpError(403, 'account_blocked', "Compte bloqué par l'équipe zanziGo — contactez-nous sur WhatsApp");
      }

      if (user.account_type === 'local') {
        // Le tarif local (TZS) exige une carte d'identité tanzanienne validée.
        if (user.verification_status !== 'verified') {
          throw new HttpError(
            403,
            'local_not_verified',
            "Le tarif local nécessite une carte d'identité tanzanienne vérifiée (validation en cours)"
          );
        }
        audience = 'local';
      } else {
        if (data.tripType === 'shared_local') {
          throw new HttpError(
            403,
            'local_only',
            "Le taxi partagé local est réservé aux locaux munis d'une carte d'identité tanzanienne"
          );
        }
        // La remise résident (-10 %) ne s'applique qu'une fois les documents
        // de résidence validés — en attendant, plein tarif touriste.
        audience =
          user.account_type === 'resident' && user.verification_status === 'verified'
            ? 'resident'
            : 'tourist';
      }
      bookerLabel = `${user.full_name} (${user.phone ?? user.email ?? 'sans contact'})`;
    } else {
      // ----- Réservation par un hôtel partenaire, pour son client -----
      if (!isAdmin(req) && data.hotelId !== req.auth.hotelId) {
        throw new HttpError(403, 'forbidden', 'Un établissement partenaire ne peut réserver que pour ses propres clients');
      }
      const { rows: hotelRows } = await query('SELECT * FROM hotels WHERE id = $1', [data.hotelId]);
      const hotel = hotelRows[0];
      if (!hotel) throw notFound('Hôtel');
      assertHotelVerified(hotel);

      if (data.tripType === 'shared_local') {
        throw new HttpError(
          403,
          'local_only',
          "Le taxi partagé local est réservé aux locaux munis d'une carte d'identité tanzanienne"
        );
      }
      audience = 'hotel';
      bookerLabel = `${hotel.name} (${libellePartenaire(hotel)}) pour ${data.clientName} (${data.clientPhone})`;
    }

    const pricing = priceTrip(data.tripType, audience, {
      pickup: data.pickupLocation,
      dropoff: data.dropoffLocation,
    });
    if (!pricing) {
      throw new HttpError(
        400,
        'unsupported_trip_type',
        `Le type de trajet ${data.tripType} n'est pas disponible pour ce profil`
      );
    }

    // Aller-retour avec attente (course privée uniquement) : ×1,8 — le
    // chauffeur attend sur place et ramène le client, prix figé comme le
    // reste (commission au même taux).
    const allerRetour = data.roundTrip === true && data.tripType === 'private';
    const round2 = (n) => Math.round(n * 100) / 100;
    const price = allerRetour ? round2(pricing.price * 1.8) : pricing.price;
    const commission = allerRetour ? round2(pricing.commission * 1.8) : pricing.commission;

    const { rows } = await query(
      `INSERT INTO trips (user_id, hotel_id, client_name, client_phone, trip_type, pickup_location, dropoff_location, scheduled_at, price, commission, currency, flight_number, round_trip, baby_seat, bulky_luggage)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        data.userId ?? null,
        data.hotelId ?? null,
        data.clientName ?? null,
        data.clientPhone ?? null,
        data.tripType,
        data.pickupLocation,
        data.dropoffLocation,
        data.scheduledAt ?? null,
        price,
        commission,
        pricing.currency,
        data.flightNumber?.trim().toUpperCase() ?? null,
        allerRetour,
        data.babySeat === true,
        data.bulkyLuggage === true,
      ]
    );
    let trip = rows[0];

    const whatsappLink = buildTeamNotificationLink(tripRequestMessage(trip, bookerLabel, audience));
    const updated = await query('UPDATE trips SET whatsapp_link = $1 WHERE id = $2 RETURNING *', [
      whatsappLink,
      trip.id,
    ]);
    // L'équipe est prévenue AUTOMATIQUEMENT (e-mail) — le client n'a plus
    // de message à envoyer lui-même.
    // L'alerte de l'équipe emporte, pour une course privée, l'annonce toute
    // prête à recoller dans le groupe WhatsApp des chauffeurs : plus rien à
    // rédiger dans l'urgence.
    const resume = tripRequestMessage(trip, bookerLabel, audience);
    notifierEquipe(
      '🚕 Nouvelle demande de course — zanziGo',
      trip.trip_type === 'private'
        ? `${resume}\n\n— — — À COLLER DANS LE GROUPE CHAUFFEURS — — —\n${messageGroupeChauffeurs(trip)}`
        : resume
    );
    res.status(201).json(updated.rows[0]);
  })
);

// GET /trips?userId= ou ?hotelId= — historique (le titulaire ou l'équipe).
// Sans userId ni hotelId : liste globale, réservée à l'équipe (tableau de
// bord), avec filtre optionnel ?status= (ex. requested = à traiter).
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId, hotelId, status } = z
      .object({
        userId: z.string().uuid().optional(),
        hotelId: z.string().uuid().optional(),
        status: z
          .enum(['requested', 'driver_confirmed', 'paid', 'in_progress', 'completed', 'cancelled'])
          .optional(),
      })
      .refine((d) => !(d.userId && d.hotelId), {
        path: ['userId'],
        message: 'Fournir userId ou hotelId, pas les deux',
      })
      .parse(req.query);

    if (!userId && !hotelId) {
      if (!isAdmin(req)) {
        throw new HttpError(403, 'forbidden', 'Fournir userId ou hotelId (liste globale réservée à l\'équipe)');
      }
      const params = [];
      let where = '';
      if (status) {
        params.push(status);
        where = 'WHERE t.status = $1';
      }
      // Contexte pour l'équipe qui valide : QUI a réservé (nom + téléphone du
      // compte client, ou nom/téléphone saisis par un hôtel partenaire) et,
      // le cas échéant, le nom de l'établissement partenaire. Réservé à
      // l'équipe (liste admin) — ces champs ne sortent pas ailleurs.
      const { rows } = await query(
        `SELECT t.*, ${CHAMPS_CHAUFFEUR},
                u.full_name AS booker_name, u.phone AS booker_phone,
                u.email AS booker_email, u.account_type AS booker_account_type,
                h.name AS hotel_name
         FROM trips t
         LEFT JOIN drivers d ON d.id = t.driver_id
         LEFT JOIN users u ON u.id = t.user_id
         LEFT JOIN hotels h ON h.id = t.hotel_id
         ${where}
         ORDER BY t.created_at DESC LIMIT 200`,
        params
      );
      return res.json(rows.map((trip) => avecAnnonceGroupe(trip, req)));
    }

    if (userId) {
      if (!isAdmin(req) && userId !== req.auth.userId) {
        throw new HttpError(403, 'forbidden', 'Accès réservé au titulaire du compte');
      }
      const { rows } = await query(
        `SELECT t.*, ${CHAMPS_CHAUFFEUR}
         FROM trips t LEFT JOIN drivers d ON d.id = t.driver_id
         WHERE t.user_id = $1 ORDER BY t.created_at DESC`,
        [userId]
      );
      return res.json(rows);
    }

    if (!isAdmin(req) && hotelId !== req.auth.hotelId) {
      throw new HttpError(403, 'forbidden', "Accès réservé à l'hôtel concerné");
    }
    const { rows } = await query(
      `SELECT t.*, ${CHAMPS_CHAUFFEUR}
       FROM trips t LEFT JOIN drivers d ON d.id = t.driver_id
       WHERE t.hotel_id = $1 ORDER BY t.created_at DESC`,
      [hotelId]
    );
    res.json(rows);
  })
);

// ---------------------------------------------------------------------------
// BOURSE AUX COURSES — le chauffeur se sert lui-même
// ---------------------------------------------------------------------------
// Jusqu'ici, seule l'équipe assignait les chauffeurs : chaque course demandait
// une manipulation humaine. Désormais un chauffeur VÉRIFIÉ voit les courses
// libres et en prend une en un clic (premier arrivé, premier servi), exactement
// comme la bourse aux colis.
//
// L'ÉQUIPE GARDE LA MAIN : si personne ne prend la course, elle assigne depuis
// son tableau de bord comme avant ; et elle peut reprendre une course déjà
// prise (chauffeur injoignable) — voir PATCH /assign-driver.
//
// VIE PRIVÉE : avant la prise, le chauffeur voit le trajet, l'heure, ce qu'il
// gagne et les contraintes (siège bébé, gros bagages, vol) — mais NI le nom NI
// le téléphone du client, ni sa position exacte. Il les obtient en prenant la
// course, comme pour un colis.
function courseSansIdentiteClient(trip) {
  return {
    id: trip.id,
    trip_type: trip.trip_type,
    status: trip.status,
    pickup_location: trip.pickup_location,
    dropoff_location: trip.dropoff_location,
    scheduled_at: trip.scheduled_at,
    created_at: trip.created_at,
    price: trip.price,
    commission: trip.commission,
    currency: trip.currency,
    // Ce que le chauffeur touche réellement — la seule ligne qui l'intéresse.
    net_chauffeur: Number((Number(trip.price) - Number(trip.commission)).toFixed(2)),
    flight_number: trip.flight_number,
    round_trip: trip.round_trip,
    baby_seat: trip.baby_seat,
    bulky_luggage: trip.bulky_luggage,
  };
}

// GET /trips/disponibles — les courses libres, pour les chauffeurs vérifiés.
// Déclarée AVANT /:id (sinon « disponibles » serait pris pour un identifiant).
router.get(
  '/disponibles',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isAdmin(req) && !req.auth.driverId) {
      throw new HttpError(403, 'forbidden', 'Accès réservé aux chauffeurs');
    }
    const { rows } = await query(
      `SELECT * FROM trips
       WHERE status = 'requested' AND driver_id IS NULL AND trip_type = 'private'
         AND created_at >= now() - interval '48 hours'
       ORDER BY COALESCE(scheduled_at, created_at) ASC
       LIMIT 100`
    );
    res.json(rows.map(courseSansIdentiteClient));
  })
);

// POST /trips/:id/claim — « Je prends cette course ».
// Prise ATOMIQUE : la condition driver_id IS NULL dans le UPDATE empêche deux
// chauffeurs de prendre la même course, même au même instant.
router.post(
  '/:id/claim',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.auth.driverId) {
      throw new HttpError(403, 'forbidden', 'Accès réservé aux chauffeurs');
    }
    const { rows: driverRows } = await query(
      `SELECT full_name, phone, available FROM drivers
       WHERE id = $1 AND verification_status = 'verified'`,
      [req.auth.driverId]
    );
    if (!driverRows[0]) {
      throw new HttpError(
        403,
        'driver_not_verified',
        "Votre compte chauffeur n'a pas encore été validé par l'équipe"
      );
    }
    if (!driverRows[0].available) {
      throw new HttpError(
        409,
        'driver_not_available',
        'Vous êtes en indisponible — repassez disponible pour prendre une course'
      );
    }

    const { rows } = await query(
      `UPDATE trips SET driver_id = $1, status = 'driver_confirmed'
       WHERE id = $2 AND status = 'requested' AND driver_id IS NULL AND trip_type = 'private'
       RETURNING *`,
      [req.auth.driverId, req.params.id]
    );
    if (!rows[0]) {
      const trip = await getTrip(req.params.id); // 404 si la course n'existe pas
      throw new HttpError(
        409,
        'course_deja_prise',
        trip.driver_id
          ? 'Trop tard — cette course vient d’être prise'
          : `Cette course n'est plus disponible (statut actuel : ${trip.status})`
      );
    }

    // L'équipe est prévenue : elle voit dans la seconde qui a pris quoi.
    const chauffeur = driverRows[0];
    const course = rows[0];
    notifierEquipe(
      '🚕 Course prise par un chauffeur',
      [
        `Chauffeur : ${chauffeur.full_name} (${chauffeur.phone})`,
        `Trajet : ${course.pickup_location} → ${course.dropoff_location}`,
        `Prix : ${course.price} ${course.currency}`,
        `Réf : ${course.id}`,
      ].join('\n')
    ).catch(() => {});
    res.json(course);
  })
);

// GET /trips/:id — détail (le client, le chauffeur assigné ou l'équipe).
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const trip = await getTrip(req.params.id);
    const allowed =
      isAdmin(req) ||
      (trip.user_id !== null && trip.user_id === req.auth.userId) ||
      (trip.hotel_id !== null && trip.hotel_id === req.auth.hotelId) ||
      (trip.driver_id !== null && trip.driver_id === req.auth.driverId);
    if (!allowed) {
      throw new HttpError(403, 'forbidden', 'Accès réservé au réservateur, au chauffeur assigné ou à l\'équipe');
    }
    res.json(avecAnnonceGroupe(trip, req));
  })
);

// PATCH /trips/:id/assign-driver — l'équipe confirme un chauffeur (équipe uniquement).
router.patch(
  '/:id/assign-driver',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { driverId } = assignDriverSchema.parse(req.body);
    const trip = await getTrip(req.params.id);

    // L'ÉQUIPE GARDE LA MAIN. Elle assigne une course libre ('requested'), et
    // peut aussi REPRENDRE une course déjà prise par un chauffeur
    // ('driver_confirmed') pour la confier à un autre — le cas concret : le
    // chauffeur qui a cliqué ne répond plus. Au-delà (payée, démarrée,
    // terminée, annulée), on ne touche plus : de l'argent ou une course en
    // cours sont en jeu.
    if (trip.status !== 'requested' && trip.status !== 'driver_confirmed') {
      throw new HttpError(
        409,
        'invalid_status',
        `Un chauffeur ne peut être assigné que sur un trajet 'requested' ou 'driver_confirmed' (statut actuel: ${trip.status})`
      );
    }

    const { rows: driverRows } = await query('SELECT * FROM drivers WHERE id = $1', [driverId]);
    const driver = driverRows[0];
    if (!driver) throw notFound('Chauffeur');
    if (driver.verification_status !== 'verified') {
      throw new HttpError(409, 'driver_not_verified', "Ce chauffeur n'a pas encore été validé par l'équipe");
    }
    if (!driver.available) {
      throw new HttpError(409, 'driver_not_available', "Ce chauffeur n'est pas disponible");
    }

    const { rows } = await query(
      `UPDATE trips SET driver_id = $1, status = 'driver_confirmed' WHERE id = $2 RETURNING *`,
      [driverId, req.params.id]
    );
    // Son téléphone sonne dans la seconde : c'est l'alerte qui fait gagner le
    // plus de temps sur chaque réservation.
    alerterNouvelleCourse(rows[0]);
    res.json(rows[0]);
  })
);

// POST /trips/:id/payment — lien de paiement (client ou équipe) : PayPal si
// configuré (USD), sinon Pesapal/stub. Règle métier : le paiement ne peut
// être demandé qu'après confirmation d'un chauffeur — jamais avant.
router.post(
  '/:id/payment',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { method } = z
      .object({ method: z.enum(['credit']).optional() })
      .parse(req.body ?? {});
    const trip = await getTrip(req.params.id);
    const isBooker =
      (trip.user_id !== null && trip.user_id === req.auth.userId) ||
      (trip.hotel_id !== null && trip.hotel_id === req.auth.hotelId);
    if (!isAdmin(req) && !isBooker) {
      throw new HttpError(403, 'forbidden', 'Accès réservé au réservateur de la course');
    }

    if (trip.status !== 'driver_confirmed') {
      throw new HttpError(
        409,
        'invalid_status',
        `Le paiement ne peut être demandé qu'après confirmation d'un chauffeur (statut actuel: ${trip.status})`
      );
    }

    // ----- Paiement par CRÉDIT PRÉPAYÉ (hôtels partenaires) -----
    // Débit atomique du solde, paiement confirmé immédiatement, course payée
    // dans la foulée — aucun circuit externe.
    if (method === 'credit') {
      if (!trip.hotel_id || trip.hotel_id !== req.auth.hotelId) {
        throw new HttpError(403, 'forbidden', 'Le paiement par crédit est réservé à l\'hôtel réservateur');
      }
      const { paiement, hotelNom, soldeRestant } = await withTransaction(async (client) => {
        const { rows: hotelRows } = await client.query(
          'SELECT name, credit_balance FROM hotels WHERE id = $1 FOR UPDATE',
          [trip.hotel_id]
        );
        const solde = Number(hotelRows[0].credit_balance);
        if (solde < Number(trip.price)) {
          throw new HttpError(
            409,
            'insufficient_credit',
            `Crédit insuffisant (solde: ${solde} USD, course: ${trip.price} ${trip.currency})`
          );
        }
        await client.query('UPDATE hotels SET credit_balance = credit_balance - $1 WHERE id = $2', [
          trip.price,
          trip.hotel_id,
        ]);
        await client.query(
          `INSERT INTO hotel_credit_transactions (hotel_id, amount, reason, reference)
           VALUES ($1, $2, 'trip_payment', $3)`,
          [trip.hotel_id, -trip.price, trip.id]
        );
        const { rows } = await client.query(
          `INSERT INTO payments (trip_id, amount, currency, pesapal_reference, status, confirmed_at)
           VALUES ($1, $2, $3, $4, 'confirmed', now())
           RETURNING *`,
          [trip.id, trip.price, trip.currency, `CREDIT-${randomUUID()}`]
        );
        await client.query(
          `UPDATE trips SET status = 'paid' WHERE id = $1 AND status = 'driver_confirmed'`,
          [trip.id]
        );
        await client.query(
          `UPDATE payments SET status = 'failed'
           WHERE id <> $1 AND status = 'pending' AND trip_id = $2`,
          [rows[0].id, trip.id]
        );
        return {
          paiement: rows[0],
          hotelNom: hotelRows[0].name,
          soldeRestant: Math.round((solde - Number(trip.price)) * 100) / 100,
        };
      });
      // L'équipe est ALERTÉE AUTOMATIQUEMENT (e-mail) — la ligne apparaît
      // aussi dans « Derniers paiements reçus » du tableau de bord (badge
      // crédit). Le lien WhatsApp reste disponible en secours.
      const resumeCredit = [
        '💳 Paiement reçu par CRÉDIT — course zanziGo',
        `Hôtel: ${hotelNom}`,
        `Trajet: ${trip.pickup_location} → ${trip.dropoff_location}`,
        `Montant: ${trip.price} ${trip.currency} (déjà encaissé — payé avec le crédit prépayé)`,
        `Solde crédit restant: ${soldeRestant} USD`,
        `Réf: ${trip.id}`,
      ].join('\n');
      notifierEquipe('💳 Paiement reçu par crédit hôtel — course', resumeCredit);
      // Le chauffeur assigné apprend tout de suite qu'il peut démarrer.
      alerterCoursePayee(trip);
      res.status(201).json({
        ...paiement,
        payment_method: 'credit',
        whatsapp_link: buildTeamNotificationLink(resumeCredit),
      });
      return;
    }

    const paypal = await circuitPaiementUsd({
      amount: trip.price,
      currency: trip.currency,
      description: `zanziGo trajet ${trip.id}`,
    });
    // Sans PayPal ni clés Pesapal : lien WhatsApp vers l'équipe (montant et
    // référence pré-remplis), validation dans le tableau de bord — même
    // circuit manuel que les colis. Avec clés Pesapal : lien Pesapal réel.
    let circuit = paypal;
    if (!circuit && isStubMode()) {
      circuit = {
        reference: `WHATSAPP-${randomUUID()}`,
        paymentLink: buildTeamNotificationLink(
          [
            '💳 Paiement course zanziGo',
            `Réf: ${trip.id}`,
            `Trajet: ${trip.pickup_location} → ${trip.dropoff_location}`,
            `Montant: ${trip.price} ${trip.currency}`,
            'Bonjour, je souhaite régler cette course — merci de m\'envoyer le lien de paiement.',
          ].join('\n')
        ),
        method: 'manual',
      };
    }
    const { reference, paymentLink } =
      circuit ??
      (await createPaymentOrder({
        amount: trip.price,
        currency: trip.currency,
        description: `zanziGo trajet ${trip.id}`,
      }));

    const { rows } = await query(
      `INSERT INTO payments (trip_id, amount, currency, pesapal_reference, payment_link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [trip.id, trip.price, trip.currency, reference, paymentLink]
    );

    // Paiement que l'ÉQUIPE devra encaisser puis valider à la main : elle est
    // prévenue à la seconde où le client demande à payer. Avant, elle ne
    // l'apprenait que si le client pensait à envoyer son message WhatsApp —
    // et le paiement pouvait dormir des heures dans « à valider ».
    // Les paiements qui se confirment tout seuls (Pesapal, capture PayPal)
    // n'ont rien à annoncer : personne n'a de geste à faire.
    if (aValiderALaMain(reference)) {
      const alerte = alertePaiementCourse(trip);
      notifierEquipe(alerte.sujet, alerte.texte);
    }

    // payment_method (non stocké) : l'app affiche « J'ai payé — vérifier »
    // pour les circuits vérifiables (PayPal capture, Pesapal statut réel).
    res.status(201).json({
      ...rows[0],
      payment_method: paypal?.method ?? (isStubMode() ? 'manual' : 'pesapal'),
    });
  })
);

// PATCH /trips/:id/pickup-position — le client (ou l'hôtel qui a réservé pour
// lui) partage son point de rendez-vous EXACT. Le chauffeur assigné le voit
// alors sur une carte et peut lancer son GPS dessus.
//
// Réservé au réservateur de la course et à l'équipe : personne d'autre ne
// peut poser un point sur la course de quelqu'un. Et seulement tant que la
// course est vivante — une course terminée ou annulée ne bouge plus.
const positionSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

router.patch(
  '/:id/pickup-position',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { lat, lng } = positionSchema.parse(req.body);
    const trip = await getTrip(req.params.id);
    const isBooker =
      (trip.user_id !== null && trip.user_id === req.auth.userId) ||
      (trip.hotel_id !== null && trip.hotel_id === req.auth.hotelId);
    if (!isAdmin(req) && !isBooker) {
      throw new HttpError(403, 'forbidden', 'Seul le réservateur de la course peut partager le point de rendez-vous');
    }
    if (['completed', 'cancelled'].includes(trip.status)) {
      throw new HttpError(
        409,
        'invalid_status',
        `Cette course est ${trip.status === 'completed' ? 'terminée' : 'annulée'} — le point de rendez-vous ne sert plus`
      );
    }

    const { rows } = await query(
      `UPDATE trips SET pickup_lat = $1, pickup_lng = $2, pickup_position_at = now()
       WHERE id = $3 RETURNING *`,
      [lat, lng, req.params.id]
    );
    res.json(avecAnnonceGroupe(rows[0], req));
  })
);

// GET /trips/:id/driver-position — « où en est mon taxi ? »
//
// Le réservateur suit l'approche de son chauffeur sur une carte. On ne rend
// QUE la dernière position connue et son heure : ni téléphone, ni trajet, ni
// historique. Le suivi s'arrête avec la course — une fois terminée ou
// annulée, plus personne ne sait où est le chauffeur.
router.get(
  '/:id/driver-position',
  requireAuth,
  asyncHandler(async (req, res) => {
    const trip = await getTrip(req.params.id);
    const isBooker =
      (trip.user_id !== null && trip.user_id === req.auth.userId) ||
      (trip.hotel_id !== null && trip.hotel_id === req.auth.hotelId);
    if (!isAdmin(req) && !isBooker) {
      throw new HttpError(403, 'forbidden', 'Seul le réservateur de la course peut suivre son chauffeur');
    }
    if (['completed', 'cancelled'].includes(trip.status)) {
      throw new HttpError(
        409,
        'invalid_status',
        `Cette course est ${trip.status === 'completed' ? 'terminée' : 'annulée'} — le suivi du chauffeur est clos`
      );
    }
    if (!trip.driver_id) {
      throw new HttpError(409, 'no_driver', "Aucun chauffeur n'est encore confirmé sur cette course");
    }

    const { rows } = await query(
      `SELECT d.full_name, d.vehicle_plate, p.lat, p.lng, p.updated_at
       FROM drivers d
       LEFT JOIN driver_positions p ON p.driver_id = d.id
       WHERE d.id = $1`,
      [trip.driver_id]
    );
    const ligne = rows[0];
    // Chauffeur confirmé mais pas encore repéré : on le dit franchement
    // plutôt que d'afficher un point inventé.
    res.json({
      driver_name: ligne?.full_name ?? null,
      vehicle_plate: ligne?.vehicle_plate ?? null,
      lat: ligne?.lat ?? null,
      lng: ligne?.lng ?? null,
      updated_at: ligne?.updated_at ?? null,
    });
  })
);

// PATCH /trips/:id/start — le chauffeur assigné (ou l'équipe) démarre la
// course d'une simple touche. Pas de QR à scanner : la position GPS déjà
// partagée en continu (PATCH /drivers/:id/location) reste la preuve de
// terrain, sans friction supplémentaire pour le chauffeur.
router.patch(
  '/:id/start',
  requireAuth,
  asyncHandler(async (req, res) => {
    const trip = await getTrip(req.params.id);
    if (!isAdmin(req) && (!req.auth.driverId || trip.driver_id !== req.auth.driverId)) {
      throw new HttpError(403, 'forbidden', 'Accès réservé au chauffeur assigné à cette course');
    }

    if (trip.status !== 'paid') {
      throw new HttpError(
        409,
        'invalid_status',
        `Le départ ne peut être déclaré que sur un trajet payé (statut actuel: ${trip.status})`
      );
    }

    const { rows } = await query(
      `UPDATE trips SET status = 'in_progress', started_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json(rows[0]);
  })
);

// PATCH /trips/:id/complete — le chauffeur assigné (ou l'équipe) clôture la
// course d'une simple touche. Incrémente les stats mensuelles du chauffeur
// (support du programme de fidélité) — ce qui débloque son paiement.
router.patch(
  '/:id/complete',
  requireAuth,
  asyncHandler(async (req, res) => {
    const trip = await getTrip(req.params.id);
    if (!isAdmin(req) && (!req.auth.driverId || trip.driver_id !== req.auth.driverId)) {
      throw new HttpError(403, 'forbidden', 'Accès réservé au chauffeur assigné à cette course');
    }

    if (trip.status !== 'in_progress') {
      throw new HttpError(
        409,
        'invalid_status',
        `L'arrivée ne peut être déclarée que sur un trajet en cours (statut actuel: ${trip.status})`
      );
    }

    const updated = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE trips SET status = 'completed', completed_at = now() WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      await client.query(
        `INSERT INTO driver_monthly_stats (driver_id, month, trips_completed)
         VALUES ($1, date_trunc('month', now())::date, 1)
         ON CONFLICT (driver_id, month)
         DO UPDATE SET trips_completed = driver_monthly_stats.trips_completed + 1`,
        [trip.driver_id]
      );
      return rows[0];
    });
    // Parrainage : la récompense (5 $ chacun) est ACQUISE quand le filleul
    // termine sa 2e course — l'équipe est alors prévenue, une seule fois.
    validerParrainageApresCourse(trip.user_id).catch(() => {});
    res.json(updated);
  })
);

// Vérifie si ce client est un filleul qui vient d'atteindre 2 courses
// terminées : horodate la récompense (anti-doublon) et prévient l'équipe.
async function validerParrainageApresCourse(userId) {
  if (!userId) return;
  const { rows } = await query(
    `SELECT u.full_name, u.phone, u.email, u.referral_rewarded_at, p.full_name AS parrain_nom
     FROM users u JOIN users p ON p.id = u.referred_by_user_id
     WHERE u.id = $1`,
    [userId]
  );
  const filleul = rows[0];
  if (!filleul || filleul.referral_rewarded_at) return;
  const { rows: compte } = await query(
    `SELECT COUNT(*)::int AS n FROM trips WHERE user_id = $1 AND status = 'completed'`,
    [userId]
  );
  if (compte[0].n < 2) return;
  await query('UPDATE users SET referral_rewarded_at = now() WHERE id = $1', [userId]);
  notifierEquipe(
    '🎁 Parrainage validé — zanziGo',
    [
      `${filleul.full_name} (${filleul.phone ?? filleul.email ?? 'sans contact'})`,
      `vient de terminer sa 2e course : la récompense de parrainage est`,
      `ACQUISE — 5 $ pour lui et 5 $ pour son parrain ${filleul.parrain_nom},`,
      'à déduire de leur prochain paiement.',
    ].join('\n')
  );
}

// POST /trips/:id/cancel — annulation par le réservateur (client ou hôtel).
// Course non payée : annulable librement. Course PAYÉE avec une date de
// départ planifiée : barème client — ≥ 48 h avant = remboursement 100 %,
// entre 24 h et 48 h = 50 %, < 24 h = refusée (contacter l'équipe). Le
// remboursement dû est tracé sur le paiement (tableau de bord équipe).
// L'équipe peut annuler une course payée à tout moment. Les paiements
// encore en attente sont marqués 'failed' pour ne pas rester confirmables
// sur une course morte.
router.post(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const trip = await getTrip(req.params.id);
    const isBooker =
      (trip.user_id !== null && trip.user_id === req.auth.userId) ||
      (trip.hotel_id !== null && trip.hotel_id === req.auth.hotelId);
    if (!isAdmin(req) && !isBooker) {
      throw new HttpError(403, 'forbidden', 'Seul le réservateur de la course peut l\'annuler');
    }

    // Barème appliqué au réservateur d'une course payée (jamais requis pour
    // l'équipe, qui garde la main sans condition).
    const tauxPaye = trip.scheduled_at ? tauxRemboursement(trip.scheduled_at) : null;
    const annulables = isAdmin(req)
      ? ['requested', 'driver_confirmed', 'paid']
      : ['requested', 'driver_confirmed', ...(tauxPaye !== null ? ['paid'] : [])];
    if (!annulables.includes(trip.status)) {
      throw new HttpError(
        409,
        'invalid_status',
        trip.status === 'paid'
          ? "Course payée : annulation possible jusqu'à 24 h avant le départ (remboursement 100 % à +48 h, 50 % entre 24 h et 48 h) — passé ce délai, contactez l'équipe sur WhatsApp"
          : `Cette course ne peut plus être annulée (statut actuel: ${trip.status})`
      );
    }

    const { updated, refund } = await withTransaction(async (client) => {
      await client.query(
        `UPDATE payments SET status = 'failed' WHERE trip_id = $1 AND status = 'pending'`,
        [req.params.id]
      );
      // Course déjà payée annulée par le CLIENT : remboursement dû selon le
      // barème, tracé sur le paiement confirmé.
      let refund = null;
      if (trip.status === 'paid' && !isAdmin(req) && tauxPaye !== null) {
        const { rows: paiements } = await client.query(
          `UPDATE payments
           SET refund_amount = ROUND(amount * $2, 2), refund_due_at = now()
           WHERE trip_id = $1 AND status = 'confirmed' AND refund_due_at IS NULL
           RETURNING refund_amount, currency`,
          [req.params.id, tauxPaye]
        );
        if (paiements[0]) {
          refund = {
            amount: Number(paiements[0].refund_amount),
            currency: paiements[0].currency,
            rate: tauxPaye,
          };
        }
      }
      const { rows } = await client.query(
        `UPDATE trips SET status = 'cancelled' WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      return { updated: rows[0], refund };
    });

    // Le chauffeur déjà assigné est prévenu : il ne se déplacera pas pour rien.
    alerterCourseAnnulee(updated);

    const sortie = { ...updated, refund };
    if (refund) {
      const resumeAnnulation = [
        '❌ Annulation course payée — zanziGo',
        `Trajet: ${trip.pickup_location} → ${trip.dropoff_location}`,
        `Montant payé: ${trip.price} ${trip.currency}`,
        `À rembourser: ${refund.amount} ${refund.currency} (${refund.rate * 100} %)`,
        `Réf: ${trip.id}`,
      ].join('\n');
      // Remboursement dû : l'équipe est prévenue automatiquement (e-mail),
      // la ligne arrive aussi dans « Remboursements à verser ».
      notifierEquipe('❌ Annulation course payée — remboursement à verser', resumeAnnulation);
      sortie.whatsapp_link = buildTeamNotificationLink(resumeAnnulation);
    }
    res.json(sortie);
  })
);

// POST /trips/:id/rating — note du chauffeur (1-5), à sens unique :
// une course déjà notée renvoie 409 Conflict. Réservé au client de la course.
router.post(
  '/:id/rating',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = ratingSchema.parse(req.body);
    const trip = await getTrip(req.params.id);
    const isBooker =
      (trip.user_id !== null && trip.user_id === req.auth.userId) ||
      (trip.hotel_id !== null && trip.hotel_id === req.auth.hotelId);
    if (!isAdmin(req) && !isBooker) {
      throw new HttpError(403, 'forbidden', 'Seul le réservateur de la course peut la noter');
    }

    if (trip.status !== 'completed') {
      throw new HttpError(409, 'invalid_status', 'Seule une course terminée peut être notée');
    }
    if (trip.rating !== null) {
      throw new HttpError(409, 'already_rated', 'Cette course a déjà été notée');
    }

    const updated = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'UPDATE trips SET rating = $1, rating_comment = $2 WHERE id = $3 RETURNING *',
        [data.rating, data.comment ?? null, req.params.id]
      );

      // Moyenne et compteur recalculés depuis les courses réellement notées —
      // pas d'incrément aveugle qui pourrait dériver.
      await client.query(
        `UPDATE drivers d SET
           rating_avg = s.avg_rating,
           rating_count = s.nb
         FROM (
           SELECT AVG(rating)::numeric(3,2) AS avg_rating, COUNT(*) AS nb
           FROM trips WHERE driver_id = $1 AND rating IS NOT NULL
         ) s
         WHERE d.id = $1`,
        [trip.driver_id]
      );

      await client.query(
        `UPDATE driver_monthly_stats m SET rating_avg = s.avg_rating
         FROM (
           SELECT AVG(rating)::numeric(3,2) AS avg_rating
           FROM trips
           WHERE driver_id = $1 AND rating IS NOT NULL
             AND date_trunc('month', completed_at) = date_trunc('month', now())
         ) s
         WHERE m.driver_id = $1 AND m.month = date_trunc('month', now())::date`,
        [trip.driver_id]
      );

      return rows[0];
    });
    res.json(updated);
  })
);

export default router;
