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
  diffuserCourseAuxChauffeurs,
} from '../services/alertesChauffeur.js';
import { CHAMPS_CLIENT_POUR_CHAUFFEUR, vueChauffeur } from '../services/vueChauffeur.js';
import { libelleMoyen, moyensPour, reglement } from '../services/moyenPaiement.js';

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

// POST /trips/purge — FAIRE LE VIDE (équipe uniquement).
//
// Pendant la phase pilote, la base se remplit de courses de test et de
// courses annulées : le tableau de bord devient illisible. Cet outil efface
// DÉFINITIVEMENT des courses, au choix par statut.
//
// Contrairement au « coup de balai » de l'app — qui masque seulement les
// courses sur UN téléphone —, ici les lignes disparaissent de la base. Les
// paiements rattachés partent avec (sinon la clé étrangère bloquerait), le
// tout dans une transaction : soit tout est effacé, soit rien.
//
// Sans filtre `statuses`, TOUTES les courses sont effacées : l'appelant doit
// alors confirmer explicitement (`confirm: 'EFFACER TOUT'`), pour qu'un appel
// distrait ne vide pas l'historique des gains.
//
// Attention : les options `partages` et `colis` ne connaissent pas le filtre
// par statut — elles vident leur table entière. C'est voulu : on s'en sert
// pour repartir d'une base propre, pas pour trier.
const purgeSchema = z
  .object({
    statuses: z
      .array(z.enum(['requested', 'driver_confirmed', 'paid', 'in_progress', 'completed', 'cancelled']))
      .min(1)
      .optional(),
    // Efface AUSSI les taxis partagés : annonces des chauffeurs, places
    // réservées et demandes en liste d'attente. Sans ça, le chiffre d'affaires
    // du tableau garde un reliquat que plus aucune course n'explique.
    partages: z.boolean().optional(),
    // Efface AUSSI les colis (table à part) : un colis livré pendant les
    // essais continue sinon d'alimenter à lui seul le chiffre d'affaires du
    // tableau de bord, alors que plus aucune course ne l'accompagne.
    colis: z.boolean().optional(),
    confirm: z.string().optional(),
  })
  .refine((d) => d.statuses !== undefined || d.confirm === 'EFFACER TOUT', {
    path: ['confirm'],
    message: 'Pour tout effacer sans filtre, envoyez confirm: "EFFACER TOUT"',
  });

router.post(
  '/purge',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { statuses, partages, colis } = purgeSchema.parse(req.body ?? {});

    const resultat = await withTransaction(async (client) => {
      const filtre = statuses ? 'WHERE status = ANY($1)' : '';
      const params = statuses ? [statuses] : [];
      const { rows: cibles } = await client.query(`SELECT id FROM trips ${filtre}`, params);
      const ids = cibles.map((t) => t.id);

      let courses = 0;
      let paiements = 0;
      if (ids.length > 0) {
        // Les paiements d'abord : ils pointent vers les courses.
        const p = await client.query('DELETE FROM payments WHERE trip_id = ANY($1)', [ids]);
        const c = await client.query('DELETE FROM trips WHERE id = ANY($1)', [ids]);
        paiements = p.rowCount;
        courses = c.rowCount;
      }

      let annonces = 0;
      let places = 0;
      let attentes = 0;
      if (partages) {
        // Ordre imposé par les clés étrangères : les paiements des places, puis
        // les annonces (les places tombent en cascade avec leur annonce).
        const pp = await client.query(
          'DELETE FROM payments WHERE ride_booking_id IS NOT NULL'
        );
        paiements += pp.rowCount;
        const { rows: nb } = await client.query('SELECT count(*)::int AS n FROM ride_bookings');
        places = nb[0]?.n ?? 0;
        const a = await client.query('DELETE FROM posted_rides');
        annonces = a.rowCount;
        const w = await client.query('DELETE FROM ride_waitlist');
        attentes = w.rowCount;
      }

      let colisEfaces = 0;
      if (colis) {
        // Les colis vivent dans leur propre table : la purge des courses ne
        // les touche pas. Deux références à défaire avant de les supprimer —
        // leurs paiements, et les bons de fidélité qui pointent vers eux.
        const pc = await client.query('DELETE FROM payments WHERE package_id IS NOT NULL');
        paiements += pc.rowCount;
        // Le bon de fidélité, lui, reste acquis à l'hôtel : on coupe juste le
        // lien vers le colis effacé (sans quoi la clé étrangère bloquerait).
        await client.query(
          'UPDATE hotel_vouchers SET package_id = NULL WHERE package_id IS NOT NULL'
        );
        const c = await client.query('DELETE FROM packages');
        colisEfaces = c.rowCount;
      }

      return { courses, paiements, annonces, places, attentes, colis: colisEfaces };
    });

    res.json({ ...resultat, statuts: statuses ?? 'tous', partages: !!partages });
  })
);
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
    // Et la bourse sonne toute seule : chaque chauffeur disponible reçoit
    // la course sur son téléphone, les plus proches du client en priorité.
    diffuserCourseAuxChauffeurs(updated.rows[0]);
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
    // DÉJÀ PAYÉE : le client a réglé, et le chauffeur précédent s'est
    // désisté. C'est la course la plus urgente de la bourse — et pour celui
    // qui la prend, un gain certain. On le dit.
    deja_payee: trip.paid_at !== null && trip.paid_at !== undefined,
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
    // La bourse est réservée aux chauffeurs VÉRIFIÉS — la même règle que la
    // prise de course (claim). Un candidat refusé n'a rien à y observer.
    if (!isAdmin(req)) {
      const { rows: moi } = await query(
        'SELECT verification_status FROM drivers WHERE id = $1',
        [req.auth.driverId]
      );
      if (moi[0]?.verification_status !== 'verified') {
        throw new HttpError(403, 'driver_not_verified', 'Compte chauffeur non validé');
      }
    }
    const { rows } = await query(
      // Deux familles de courses : les demandes récentes (48 h), et les
      // courses DÉJÀ PAYÉES rendues par leur chauffeur — celles-là ne
      // périment JAMAIS : un client a payé, il attend un taxi, la course
      // doit rester visible jusqu'à ce que quelqu'un la prenne.
      `SELECT * FROM trips
       WHERE status = 'requested' AND driver_id IS NULL AND trip_type = 'private'
         AND (created_at >= now() - interval '48 hours' OR paid_at IS NOT NULL)
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
      // Si le client a DÉJÀ payé (course rendue par un précédent chauffeur),
      // elle repart directement en 'paid' : le remplaçant ne doit pas
      // attendre un paiement qui est déjà encaissé.
      `UPDATE trips
          SET driver_id = $1,
              status = CASE WHEN paid_at IS NULL THEN 'driver_confirmed'::trip_status
                            ELSE 'paid'::trip_status END,
              alerte_figee_at = NULL
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
    // Prendre la course ne donne PAS encore les coordonnées du client : elles
    // s'ouvrent quand l'équipe valide le paiement (services/vueChauffeur.js).
    res.json(vueChauffeur(course));
  })
);

// POST /trips/:id/release — « Je ne peux plus faire cette course ».
//
// Contrepartie indispensable de la bourse : un chauffeur qui a pris une
// course et qui ne peut plus l'assurer n'avait AUCUN moyen de la rendre.
// Son seul choix était de se taire — et le client découvrait le problème sur
// le trottoir. Ici, la course retourne dans la bourse sur-le-champ, et
// l'équipe est prévenue.
//
// On accepte le renoncement tant que la course n'a pas démarré, y compris
// après paiement : mieux vaut le savoir trois heures avant que jamais. Mais
// l'équipe doit alors le voir comme une urgence — l'argent est encaissé.
router.post(
  '/:id/release',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.auth.driverId) {
      throw new HttpError(403, 'forbidden', 'Accès réservé aux chauffeurs');
    }
    const trip = await getTrip(req.params.id);
    if (trip.driver_id !== req.auth.driverId) {
      throw new HttpError(403, 'forbidden', "Cette course n'est pas la vôtre");
    }
    if (trip.status !== 'driver_confirmed' && trip.status !== 'paid') {
      throw new HttpError(
        409,
        'course_non_liberable',
        `Une course ${trip.status === 'in_progress' ? 'déjà démarrée' : 'terminée ou annulée'} ne peut plus être rendue — appelez l'équipe`
      );
    }

    // Retour à l'état « libre » : le statut redescend à 'requested' et la
    // course réapparaît dans la bourse pour les autres chauffeurs. L'alerte
    // d'immobilité est remise à zéro — une nouvelle prise qui s'enliserait
    // doit pouvoir réalerter.
    const { rows } = await query(
      `UPDATE trips SET driver_id = NULL, status = 'requested', alerte_figee_at = NULL
       WHERE id = $1 AND driver_id = $2
       RETURNING *`,
      [req.params.id, req.auth.driverId]
    );
    if (!rows[0]) {
      throw new HttpError(409, 'course_non_liberable', 'La course a changé entre-temps');
    }
    // La course revient en bourse : les autres chauffeurs sonnent aussitôt
    // (pas celui qui vient de la rendre).
    diffuserCourseAuxChauffeurs(rows[0], { sauf: req.auth.driverId });

    const { rows: chauffeurs } = await query(
      'SELECT full_name, phone FROM drivers WHERE id = $1',
      [req.auth.driverId]
    );
    const chauffeur = chauffeurs[0] ?? {};
    const etaitPayee = trip.status === 'paid';
    notifierEquipe(
      etaitPayee
        ? '🔴 URGENT — un chauffeur rend une course DÉJÀ PAYÉE'
        : '↩️ Un chauffeur rend une course',
      [
        `Chauffeur : ${chauffeur.full_name ?? '—'} (${chauffeur.phone ?? '—'})`,
        `Trajet : ${trip.pickup_location} → ${trip.dropoff_location}`,
        trip.scheduled_at ? `Départ prévu : ${trip.scheduled_at}` : 'Départ : immédiat',
        etaitPayee
          ? 'La course était PAYÉE : trouvez un remplaçant en priorité.'
          : 'La course est repartie dans la bourse.',
        `Réf : ${trip.id}`,
      ].join('\n')
    ).catch(() => {});

    res.json(vueChauffeur(rows[0]));
  })
);

// GET /trips/:id — détail (le client, le chauffeur assigné ou l'équipe).
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const trip = await getTrip(req.params.id);
    const estReservateur =
      (trip.user_id !== null && trip.user_id === req.auth.userId) ||
      (trip.hotel_id !== null && trip.hotel_id === req.auth.hotelId);
    const estChauffeurAssigne = trip.driver_id !== null && trip.driver_id === req.auth.driverId;
    const allowed = isAdmin(req) || estReservateur || estChauffeurAssigne;
    if (!allowed) {
      throw new HttpError(403, 'forbidden', 'Accès réservé au réservateur, au chauffeur assigné ou à l\'équipe');
    }

    // Vue CHAUFFEUR : les coordonnées du client ne lui sont confiées qu'une
    // fois le paiement validé par l'équipe (voir services/vueChauffeur.js).
    // L'équipe et le réservateur, eux, voient la course entière.
    if (estChauffeurAssigne && !isAdmin(req) && !estReservateur) {
      const { rows } = await query(
        `SELECT t.*, ${CHAMPS_CHAUFFEUR}, ${CHAMPS_CLIENT_POUR_CHAUFFEUR}
         FROM trips t
         LEFT JOIN drivers d ON d.id = t.driver_id
         LEFT JOIN users u ON u.id = t.user_id
         LEFT JOIN hotels h ON h.id = t.hotel_id
         WHERE t.id = $1`,
        [req.params.id]
      );
      return res.json(vueChauffeur(rows[0]));
    }

    // Le RÉSERVATEUR voit son crédit de parrainage disponible : l'écran de
    // paiement peut alors annoncer la remise AVANT le choix du moyen, au
    // lieu de la faire découvrir sur le lien.
    let remiseDisponible = 0;
    if (estReservateur && trip.user_id && ['requested', 'driver_confirmed'].includes(trip.status)) {
      const { rows: porteur } = await query(
        'SELECT credit_parrainage_usd FROM users WHERE id = $1',
        [trip.user_id]
      );
      remiseDisponible = Number(porteur[0]?.credit_parrainage_usd ?? 0);
    }
    res.json({
      ...avecAnnonceGroupe(trip, req),
      remise_parrainage_disponible_usd: remiseDisponible,
    });
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
      // alerte_figee_at remise à zéro : le nouveau chauffeur repart avec
      // une page blanche, et son propre silence pourra réalerter.
      // Même règle que pour la bourse : une course déjà payée reprend en
      // 'paid', pas en « en attente de paiement ».
      // La garde de statut est DANS le WHERE, pas seulement dans la lecture
      // faite plus haut : entre les deux, le client peut annuler. Sans elle,
      // l'équipe pouvait ressusciter une course annulée (ou rétrograder une
      // course en cours) en assignant un remplaçant au mauvais moment — et
      // un chauffeur partait pour une course qui n'existait plus.
      `UPDATE trips
          SET driver_id = $1,
              status = CASE WHEN paid_at IS NULL THEN 'driver_confirmed'::trip_status
                            ELSE 'paid'::trip_status END,
              alerte_figee_at = NULL
        WHERE id = $2 AND status IN ('requested', 'driver_confirmed', 'paid')
        RETURNING *`,
      [driverId, req.params.id]
    );
    if (!rows[0]) {
      throw new HttpError(
        409,
        'invalid_status',
        'Cette course a changé d\'état entre-temps (annulée ou démarrée) — rechargez la liste'
      );
    }
    // Son téléphone sonne dans la seconde : c'est l'alerte qui fait gagner le
    // plus de temps sur chaque réservation.
    alerterNouvelleCourse(rows[0]);
    // Course déjà payée : le remplaçant reçoit AUSSI le signal « payée —
    // vous pouvez démarrer », pas seulement « nouvelle course ».
    if (rows[0].status === 'paid') alerterCoursePayee(rows[0]);
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
    // MOYEN DE PAIEMENT choisi par le client : carte bancaire (dollars,
    // frais bancaires en plus) ou portefeuille mobile (shillings, sans
    // frais). 'credit' reste le circuit à part des hôtels partenaires.
    const { method } = z
      .object({ method: z.enum(['credit', 'carte', 'mobile']).optional() })
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
          `INSERT INTO payments (trip_id, amount, currency, pesapal_reference, status,
                                 confirmed_at, method)
           VALUES ($1, $2, $3, $4, 'confirmed', now(), 'credit')
           RETURNING *`,
          [trip.id, trip.price, trip.currency, `CREDIT-${randomUUID()}`]
        );
        await client.query(
          // paid_at : la trace qui survit à tout. Le statut peut redescendre
        // (chauffeur qui se désiste), l'argent, lui, reste encaissé.
        `UPDATE trips SET status = 'paid', paid_at = COALESCE(paid_at, now())
          WHERE id = $1 AND status = 'driver_confirmed'`,
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

    // UN SEUL PAIEMENT EN ATTENTE PAR COURSE. Un double appui sur « Payer »
    // créait deux lignes avec deux liens vivants : le client pouvait régler
    // les deux, et le second débit ne laissait aucune trace de remboursement.
    // S'il existe déjà un paiement en attente, on le renvoie tel quel — et le
    // client peut toujours en changer le moyen via POST /payments/:id/moyen.
    const { rows: dejaEnAttente } = await query(
      `SELECT * FROM payments WHERE trip_id = $1 AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1`,
      [trip.id]
    );
    if (dejaEnAttente[0] && (!method || dejaEnAttente[0].method === method)) {
      const p = dejaEnAttente[0];
      res.status(200).json({
        ...p,
        payment_method: aValiderALaMain(p.pesapal_reference) ? 'manual' : 'pesapal',
        prix_course: Number(trip.price),
        devise_course: trip.currency,
        surcharge: Number(p.surcharge),
        mention_surcharge: null,
        moyen: p.method,
        moyens_disponibles: moyensPour(trip.currency),
      });
      return;
    }

    // REMISE DE PARRAINAGE : si le compte porte un crédit (2e course du
    // filleul terminée), il se déduit ICI, automatiquement — 5 USD sur une
    // course en dollars, 13 000 TZS (le taux de la grille) sur une course
    // locale. Le crédit n'est CONSOMMÉ qu'à la confirmation du paiement :
    // un lien jamais payé ne coûte rien à personne.
    let remiseParrainageUsd = 0;
    let remiseCourse = 0;
    if (trip.user_id) {
      const { rows: porteur } = await query(
        'SELECT credit_parrainage_usd FROM users WHERE id = $1',
        [trip.user_id]
      );
      const credit = Number(porteur[0]?.credit_parrainage_usd ?? 0);
      if (credit > 0) {
        const prixUsd =
          trip.currency === 'USD'
            ? Number(trip.price)
            : Number(trip.price) / config.usdToTzsRate;
        remiseParrainageUsd = Math.min(credit, Math.round(prixUsd * 100) / 100);
        remiseCourse =
          trip.currency === 'USD'
            ? remiseParrainageUsd
            : Math.round(remiseParrainageUsd * config.usdToTzsRate);
      }
    }
    const baseAPayer = Math.round((Number(trip.price) - remiseCourse) * 100) / 100;

    // CE QUE LE CLIENT RÈGLE, selon le moyen qu'il a choisi (voir
    // services/moyenPaiement.js) : par carte, la base plus les frais de la
    // banque, en dollars ; par portefeuille mobile, la base convertie en
    // shillings, sans un centime de frais. Le PRIX de la course et la
    // commission du chauffeur ne bougent dans aucun des deux cas — les
    // frais de carte se calculent sur ce que le client paie réellement
    // (base remisée), et la remise sort de la marge zanziGo.
    const regle = reglement(baseAPayer, trip.currency, method);
    const aRegler = regle.montant;
    const surcharge = regle.surcharge;
    const deviseReglement = regle.devise;

    // PayPal ne traite que les dollars : un règlement en shillings part
    // directement sur le circuit mobile money (Pesapal) ou manuel.
    const paypal =
      deviseReglement === 'USD'
        ? await circuitPaiementUsd({
            amount: aRegler,
            currency: deviseReglement,
            description: `zanziGo trajet ${trip.id}`,
          })
        : null;
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
            `Moyen: ${libelleMoyen(regle.moyen)}`,
            `Montant: ${aRegler} ${deviseReglement}`,
            ...(surcharge > 0
              ? [`(dont ${surcharge} ${deviseReglement} de frais bancaires carte)`]
              : []),
            ...(remiseCourse > 0
              ? [`Remise parrainage déduite: −${remiseCourse} ${trip.currency}`]
              : []),
            `Prix de la course: ${trip.price} ${trip.currency}`,
            'Bonjour, je souhaite régler cette course — merci de m\'envoyer le lien de paiement.',
          ].join('\n')
        ),
        method: 'manual',
      };
    }
    const { reference, paymentLink } =
      circuit ??
      (await createPaymentOrder({
        amount: aRegler,
        currency: deviseReglement,
        description: `zanziGo trajet ${trip.id}`,
      }));

    const { rows } = await query(
      `INSERT INTO payments (trip_id, amount, currency, pesapal_reference, payment_link,
                             surcharge, method, remise_parrainage_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        trip.id,
        aRegler,
        deviseReglement,
        reference,
        paymentLink,
        surcharge,
        regle.moyen,
        remiseParrainageUsd,
      ]
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
      // Le client doit voir la surcharge AVANT de payer, jamais la découvrir
      // sur son relevé : prix de la course, frais, total.
      prix_course: Number(trip.price),
      devise_course: trip.currency,
      surcharge,
      mention_surcharge: regle.mention,
      // La remise de parrainage, annoncée noir sur blanc.
      remise_parrainage_usd: remiseParrainageUsd,
      remise_parrainage: remiseCourse,
      mention_parrainage:
        remiseCourse > 0
          ? `Remise parrainage : −${remiseCourse} ${trip.currency}`
          : null,
      // Ce que l'app affiche : le moyen retenu et ceux qu'elle peut proposer.
      moyen: regle.moyen,
      moyens_disponibles: moyensPour(trip.currency),
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
    // La tour de contrôle voit la course passer au vert — sans rien demander.
    const demarree = rows[0];
    query('SELECT full_name, phone FROM drivers WHERE id = $1', [demarree.driver_id])
      .then(({ rows: ch }) =>
        notifierEquipe(
          '▶️ Course démarrée',
          [
            `Trajet : ${demarree.pickup_location} → ${demarree.dropoff_location}`,
            `Chauffeur : ${ch[0]?.full_name ?? '—'} (${ch[0]?.phone ?? '—'})`,
            `Prix : ${demarree.price} ${demarree.currency}`,
            `Réf : ${demarree.id}`,
          ].join('\n')
        )
      )
      .catch(() => {});
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
    // Attendu (et non lancé en l'air) : le crédit de parrainage doit être
    // POSÉ quand la réponse part — sinon le client qui réserve sa course
    // suivante dans la foulée ne verrait pas encore sa remise. Les erreurs
    // restent avalées : un parrainage raté ne doit pas faire échouer la
    // clôture d'une course.
    await validerParrainageApresCourse(trip.user_id).catch(() => {});
    // Fin de parcours : l'équipe voit la course se clore en direct.
    query('SELECT full_name, phone FROM drivers WHERE id = $1', [updated.driver_id])
      .then(({ rows: ch }) =>
        notifierEquipe(
          '✅ Course terminée',
          [
            `Trajet : ${updated.pickup_location} → ${updated.dropoff_location}`,
            `Chauffeur : ${ch[0]?.full_name ?? '—'} (${ch[0]?.phone ?? '—'})`,
            `Prix : ${updated.price} ${updated.currency}`,
            `Réf : ${updated.id}`,
          ].join('\n')
        )
      )
      .catch(() => {});
    res.json(updated);
  })
);

// Vérifie si ce client est un filleul qui vient d'atteindre 2 courses
// terminées : horodate la récompense (anti-doublon) et prévient l'équipe.
// Ce que rapporte un parrainage validé, à CHACUN (filleul et parrain).
const RECOMPENSE_PARRAINAGE_USD = 5;

async function validerParrainageApresCourse(userId) {
  if (!userId) return;
  const { rows } = await query(
    `SELECT u.full_name, u.phone, u.email, u.referral_rewarded_at,
            p.id AS parrain_id, p.full_name AS parrain_nom
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
  // La garde IS NULL fait foi : deux clôtures simultanées (2e et 3e course
  // terminées ensemble) passeraient toutes deux la lecture ci-dessus — seule
  // la première écrit, et elle seule envoie l'alerte des 5 $.
  const { rowCount } = await query(
    'UPDATE users SET referral_rewarded_at = now() WHERE id = $1 AND referral_rewarded_at IS NULL',
    [userId]
  );
  if (rowCount === 0) return;
  // LA RÉCOMPENSE EST UN CRÉDIT, PAS UNE CONSIGNE. 5 $ posés automatiquement
  // sur chaque compte : ils se déduiront tout seuls du paiement de leur
  // prochaine course (5 USD, ou 13 000 TZS pour un compte local). Personne
  // n'a de geste à faire — l'alerte équipe n'est plus qu'une information.
  await query(
    `UPDATE users SET credit_parrainage_usd = credit_parrainage_usd + ${RECOMPENSE_PARRAINAGE_USD}
      WHERE id = ANY($1)`,
    [[userId, filleul.parrain_id]]
  );
  notifierEquipe(
    '🎁 Parrainage validé — zanziGo',
    [
      `${filleul.full_name} (${filleul.phone ?? filleul.email ?? 'sans contact'})`,
      `vient de terminer sa 2e course : ${RECOMPENSE_PARRAINAGE_USD} $ de crédit ont été`,
      `posés AUTOMATIQUEMENT sur son compte et sur celui de son parrain`,
      `${filleul.parrain_nom}. La remise se déduira toute seule de leur`,
      'prochaine course — rien à faire.',
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
    //
    // « Payée » se lit sur paid_at, PAS sur le statut : une course payée puis
    // rendue par son chauffeur redescend en 'requested' en gardant paid_at.
    // Brancher le barème sur le statut laissait ce cas s'annuler librement,
    // sans qu'aucun remboursement ne soit tracé — l'argent encaissé
    // disparaissait en silence.
    const dejaPayee = trip.paid_at !== null;
    const tauxPaye = trip.scheduled_at ? tauxRemboursement(trip.scheduled_at) : null;
    const annulables = isAdmin(req)
      ? ['requested', 'driver_confirmed', 'paid']
      : dejaPayee
        ? tauxPaye !== null
          ? ['requested', 'driver_confirmed', 'paid']
          : []
        : ['requested', 'driver_confirmed'];
    if (!annulables.includes(trip.status)) {
      throw new HttpError(
        409,
        'invalid_status',
        dejaPayee
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
      if (dejaPayee && !isAdmin(req) && tauxPaye !== null) {
        const { rows: paiements } = await client.query(
          `UPDATE payments
           -- Le barème (100 % / 50 %) porte sur le PRIX DE LA COURSE, pas
           -- sur la surcharge carte : celle-ci a déjà été prélevée par la
           -- banque, elle n'est pas dans nos caisses. Sans ce (amount −
           -- surcharge), un client annulant à +72 h se ferait rembourser
           -- des frais bancaires que nous ne récupérons jamais.
           SET refund_amount = ROUND((amount - surcharge) * $2, 2), refund_due_at = now()
           WHERE trip_id = $1 AND status = 'confirmed' AND refund_due_at IS NULL
           RETURNING refund_amount, currency, remise_parrainage_usd`,
          [req.params.id, tauxPaye]
        );
        // Le crédit de parrainage consommé sur cette course REVIENT au
        // compte : la remise n'est pas de l'argent versé, elle ne se
        // « rembourse » pas — elle se rend, pour la prochaine course.
        const remiseARendre = paiements.reduce(
          (somme, ligne) => somme + Number(ligne.remise_parrainage_usd ?? 0),
          0
        );
        if (remiseARendre > 0 && trip.user_id) {
          await client.query(
            'UPDATE users SET credit_parrainage_usd = credit_parrainage_usd + $1 WHERE id = $2',
            [remiseARendre, trip.user_id]
          );
        }
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
