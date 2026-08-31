/**
 * LOCATION DE VÉHICULES — zanziGo intermédiaire entre le loueur et le client.
 *
 * Même principe que les taxis, adapté à un catalogue plutôt qu'à une
 * dispatche. Trois différences volontaires avec les chauffeurs :
 *
 *  · PAS DE COMPTE LOUEUR. C'est L'ÉQUIPE qui saisit chaque véhicule — ses
 *    documents, son prix, ses photos — comme elle le ferait pour une fiche
 *    partenaire. Toutes les routes de création et d'édition sont donc
 *    réservées à l'équipe (requireAdmin), jamais ouvertes en candidature.
 *
 *  · UN VÉHICULE VÉRIFIÉ, comme un dossier chauffeur. Il commence 'pending'
 *    même saisi par l'équipe elle-même — c'est un contrôle qualité avant
 *    publication, pas une candidature à approuver. Seul un véhicule
 *    `verified` + `available` + non archivé sort dans le catalogue client.
 *
 *  · LE LOUEUR RESTE INVISIBLE DU CLIENT. Son nom et son téléphone ne servent
 *    qu'à l'équipe (coordination de la remise des clés) : zanziGo reste
 *    l'unique interlocuteur du client, c'est le sens même d' « intermédiaire ».
 *
 * La réservation et le paiement se font DANS L'APP, avec une commission
 * zanziGo — même moteur de paiement que les courses, les colis et les
 * places de taxi partagé (voir routes/payments.js, target rental_booking_id).
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isAdmin, requireAdmin, requireAuth } from '../middleware/auth.js';
import { createPaymentOrder, isStubMode } from '../services/pesapalService.js';
import { circuitPaiementUsd } from '../services/paypalService.js';
import { aValiderALaMain } from '../services/paiementManuel.js';
import { buildTeamNotificationLink } from '../services/whatsappService.js';
import { notifierEquipe } from '../services/emailService.js';
import { libelleMoyen, moyensPour, reglement } from '../services/moyenPaiement.js';
import { tauxRemboursement } from '../services/annulationService.js';

const router = Router();

const round2 = (n) => Math.round(n * 100) / 100;

// Catégories figées (migration 043) : le client choisit sa catégorie
// souhaitée au catalogue, l'équipe la choisit à la création — jamais de
// texte libre, pour que le filtre reste fiable.
const RENTAL_CATEGORIES = ['tourisme', '4x4', 'luxe', 'scooter', 'moto', 'enduro'];

const champsVehicule = {
  category: z.enum(RENTAL_CATEGORIES),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1980).max(new Date().getFullYear() + 1).nullable().optional(),
  plate: z.string().min(3),
  seats: z.number().int().min(1).max(30).nullable().optional(),
  transmission: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  pickupLocation: z.string().min(2),
  loueurName: z.string().min(2),
  loueurPhone: z.string().min(6),
  dailyPrice: z.number().min(0),
  dailyCommission: z.number().min(0),
  currency: z.enum(['USD', 'TZS']).default('USD'),
  insuranceDocumentUrl: z.string().url(),
  insuranceExpiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  roadLicenceDocumentUrl: z.string().url(),
  roadLicenceExpiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
};

const createVehicleSchema = z
  .object({ ...champsVehicule, photoUrls: z.array(z.string().url()).max(12).optional() })
  .refine((d) => d.dailyCommission <= d.dailyPrice, {
    message: 'La commission ne peut pas dépasser le prix journalier',
    path: ['dailyCommission'],
  });

// Toutes les colonnes sont facultatives sur l'édition — l'équipe corrige
// un champ à la fois sans avoir à retaper toute la fiche.
const updateVehicleSchema = z
  .object({ ...champsVehicule, available: z.boolean() })
  .partial()
  .refine(
    (d) =>
      d.dailyPrice === undefined ||
      d.dailyCommission === undefined ||
      d.dailyCommission <= d.dailyPrice,
    { message: 'La commission ne peut pas dépasser le prix journalier', path: ['dailyCommission'] }
  );

const COLONNES_SQL = {
  category: 'category',
  make: 'make',
  model: 'model',
  year: 'year',
  plate: 'plate',
  seats: 'seats',
  transmission: 'transmission',
  description: 'description',
  pickupLocation: 'pickup_location',
  loueurName: 'loueur_name',
  loueurPhone: 'loueur_phone',
  dailyPrice: 'daily_price',
  dailyCommission: 'daily_commission',
  currency: 'currency',
  insuranceDocumentUrl: 'insurance_document_url',
  insuranceExpiresOn: 'insurance_expires_on',
  roadLicenceDocumentUrl: 'road_licence_document_url',
  roadLicenceExpiresOn: 'road_licence_expires_on',
  available: 'available',
};

async function getVehicle(id) {
  const { rows } = await query('SELECT * FROM rental_vehicles WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('Véhicule');
  return rows[0];
}

async function getPhotos(vehicleId) {
  const { rows } = await query(
    'SELECT id, url, position FROM rental_vehicle_photos WHERE vehicle_id = $1 ORDER BY position ASC, created_at ASC',
    [vehicleId]
  );
  return rows;
}

/**
 * Vue d'un véhicule. Le CLIENT ne voit jamais le loueur (son nom, son
 * téléphone) ni les documents bruts — seulement le fait qu'ils sont
 * vérifiés. L'ÉQUIPE voit tout : c'est elle qui coordonne avec le loueur.
 */
function sanitizeVehicle(vehicle, photos, { admin }) {
  const commun = {
    id: vehicle.id,
    category: vehicle.category,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    seats: vehicle.seats,
    transmission: vehicle.transmission,
    description: vehicle.description,
    pickup_location: vehicle.pickup_location,
    daily_price: vehicle.daily_price,
    currency: vehicle.currency,
    photos,
  };
  if (!admin) {
    return {
      ...commun,
      documents_verified: vehicle.verification_status === 'verified',
    };
  }
  return {
    ...commun,
    plate: vehicle.plate,
    loueur_name: vehicle.loueur_name,
    loueur_phone: vehicle.loueur_phone,
    daily_commission: vehicle.daily_commission,
    insurance_document_url: vehicle.insurance_document_url,
    insurance_expires_on: vehicle.insurance_expires_on,
    road_licence_document_url: vehicle.road_licence_document_url,
    road_licence_expires_on: vehicle.road_licence_expires_on,
    verification_status: vehicle.verification_status,
    available: vehicle.available,
    archived_at: vehicle.archived_at,
    created_at: vehicle.created_at,
  };
}

// POST /rental-vehicles — l'équipe saisit un véhicule (documents + prix +,
// en option, ses premières photos). Démarre 'pending' : encore invisible du
// catalogue tant que l'équipe n'a pas explicitement vérifié le dossier.
router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = createVehicleSchema.parse(req.body);
    const vehicule = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO rental_vehicles
           (category, make, model, year, plate, seats, transmission, description,
            pickup_location, loueur_name, loueur_phone, daily_price, daily_commission,
            currency, insurance_document_url, insurance_expires_on,
            road_licence_document_url, road_licence_expires_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         RETURNING *`,
        [
          data.category,
          data.make,
          data.model,
          data.year ?? null,
          data.plate,
          data.seats ?? null,
          data.transmission ?? null,
          data.description ?? null,
          data.pickupLocation,
          data.loueurName,
          data.loueurPhone,
          data.dailyPrice,
          data.dailyCommission,
          data.currency,
          data.insuranceDocumentUrl,
          data.insuranceExpiresOn ?? null,
          data.roadLicenceDocumentUrl,
          data.roadLicenceExpiresOn ?? null,
        ]
      );
      const vehicule = rows[0];
      for (const [i, url] of (data.photoUrls ?? []).entries()) {
        await client.query(
          'INSERT INTO rental_vehicle_photos (vehicle_id, url, position) VALUES ($1, $2, $3)',
          [vehicule.id, url, i]
        );
      }
      return vehicule;
    });
    const photos = await getPhotos(vehicule.id);
    res.status(201).json(sanitizeVehicle(vehicule, photos, { admin: true }));
  })
);

// GET /rental-vehicles/bookings — TOUTES les réservations (équipe), les plus
// récentes d'abord. Déclarée avant /:id, sinon « bookings » serait pris pour
// un identifiant de véhicule.
router.get(
  '/bookings',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT b.*, v.make, v.model, v.plate, v.category,
              u.full_name AS client_name, u.phone AS client_phone
         FROM rental_bookings b
         JOIN rental_vehicles v ON v.id = b.vehicle_id
         JOIN users u ON u.id = b.user_id
        ORDER BY b.created_at DESC
        LIMIT 200`
    );
    res.json(rows);
  })
);

// GET /rental-vehicles/bookings/mine — les réservations du client connecté.
router.get(
  '/bookings/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.auth.userId) {
      throw new HttpError(403, 'forbidden', 'Réservé aux clients');
    }
    const { rows } = await query(
      `SELECT b.*, v.make, v.model, v.plate, v.category, v.pickup_location,
              p.id AS payment_id, p.status AS payment_status
         FROM rental_bookings b
         JOIN rental_vehicles v ON v.id = b.vehicle_id
         LEFT JOIN payments p ON p.rental_booking_id = b.id AND p.status <> 'failed'
        WHERE b.user_id = $1
        ORDER BY b.created_at DESC`,
      [req.auth.userId]
    );
    res.json(rows);
  })
);

// POST /rental-vehicles/bookings/:id/cancel — annulation par le réservateur
// (ou l'équipe, sans condition). Même barème que les courses et les places
// partagées : à 48 h ou plus du départ, 100 % ; entre 24 et 48 h, 50 % ;
// en dessous, refusée pour un client (l'équipe garde la main).
router.post(
  '/bookings/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM rental_bookings WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw notFound('Réservation');
    const booking = rows[0];
    if (!isAdmin(req) && booking.user_id !== req.auth.userId) {
      throw new HttpError(403, 'forbidden', 'Seul le réservateur peut annuler sa location');
    }
    if (booking.cancelled_at) {
      throw new HttpError(409, 'already_cancelled', 'Cette réservation est déjà annulée');
    }

    const dejaPayee = booking.paid_at !== null;
    const taux = tauxRemboursement(booking.start_date);
    if (dejaPayee && !isAdmin(req) && taux === null) {
      throw new HttpError(
        409,
        'invalid_status',
        "Location payée : annulation possible jusqu'à 24 h avant le départ (remboursement 100 % à +48 h, 50 % entre 24 h et 48 h) — passé ce délai, contactez l'équipe sur WhatsApp"
      );
    }

    const { refund } = await withTransaction(async (client) => {
      await client.query('UPDATE rental_bookings SET cancelled_at = now() WHERE id = $1', [
        booking.id,
      ]);
      await client.query(
        `UPDATE payments SET status = 'failed'
          WHERE rental_booking_id = $1 AND status = 'pending'`,
        [booking.id]
      );
      let refund = null;
      if (dejaPayee && !isAdmin(req) && taux !== null) {
        const { rows: paiements } = await client.query(
          `UPDATE payments
              SET refund_amount = ROUND((amount - surcharge) * $2, 2), refund_due_at = now()
            WHERE rental_booking_id = $1 AND status = 'confirmed' AND refund_due_at IS NULL
            RETURNING refund_amount, currency`,
          [booking.id, taux]
        );
        if (paiements[0]) refund = { amount: paiements[0].refund_amount, currency: paiements[0].currency, rate: taux };
      }
      return { refund };
    });

    notifierEquipe(
      refund ? '❌ Location annulée — remboursement à verser' : '❌ Location annulée',
      [
        '❌ Annulation location de véhicule — zanziGo',
        `Réf: ${booking.id}`,
        refund
          ? `À rembourser: ${refund.amount} ${refund.currency} (${refund.rate * 100} %)`
          : 'Aucun remboursement dû.',
      ].join('\n')
    );

    res.json({ id: booking.id, cancelled: true, refund });
  })
);

// GET /rental-vehicles — le CATALOGUE (client : vérifiés, disponibles, non
// archivés uniquement, filtrable par catégorie souhaitée) ou LA LISTE
// COMPLÈTE (équipe, avec filtres optionnels sur le statut de vérification —
// pour la file « à vérifier » — et sur la catégorie).
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (isAdmin(req)) {
      const { verificationStatus, category } = z
        .object({
          verificationStatus: z.enum(['pending', 'verified', 'rejected']).optional(),
          category: z.enum(RENTAL_CATEGORIES).optional(),
        })
        .parse(req.query);
      const conditions = ['archived_at IS NULL'];
      const params = [];
      if (verificationStatus) {
        params.push(verificationStatus);
        conditions.push(`verification_status = $${params.length}`);
      }
      if (category) {
        params.push(category);
        conditions.push(`category = $${params.length}`);
      }
      const { rows } = await query(
        `SELECT * FROM rental_vehicles WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 200`,
        params
      );
      const vehicules = await Promise.all(
        rows.map(async (v) => sanitizeVehicle(v, await getPhotos(v.id), { admin: true }))
      );
      return res.json(vehicules);
    }
    const { category } = z.object({ category: z.enum(RENTAL_CATEGORIES).optional() }).parse(req.query);
    const conditions = ["verification_status = 'verified'", 'available = true', 'archived_at IS NULL'];
    const params = [];
    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    const { rows } = await query(
      `SELECT * FROM rental_vehicles WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 200`,
      params
    );
    const vehicules = await Promise.all(
      rows.map(async (v) => sanitizeVehicle(v, await getPhotos(v.id), { admin: false }))
    );
    res.json(vehicules);
  })
);

// GET /rental-vehicles/:id — détail. Un client ne voit une fiche NON publiée
// (pending/rejected/indisponible) que si elle est déjà dans une de ses
// réservations passées ; sinon 404 — pas de fuite d'un catalogue en préparation.
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const vehicule = await getVehicle(req.params.id);
    if (isAdmin(req)) {
      return res.json(sanitizeVehicle(vehicule, await getPhotos(vehicule.id), { admin: true }));
    }
    const publie =
      vehicule.verification_status === 'verified' &&
      vehicule.available &&
      !vehicule.archived_at;
    if (!publie) {
      const { rows } = await query(
        'SELECT 1 FROM rental_bookings WHERE vehicle_id = $1 AND user_id = $2 LIMIT 1',
        [vehicule.id, req.auth.userId ?? null]
      );
      if (!rows[0]) throw notFound('Véhicule');
    }
    res.json(sanitizeVehicle(vehicule, await getPhotos(vehicule.id), { admin: false }));
  })
);

// PATCH /rental-vehicles/:id — l'équipe corrige un ou plusieurs champs.
router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = updateVehicleSchema.parse(req.body);
    const entrees = Object.entries(data);
    if (entrees.length === 0) {
      return res.json(
        sanitizeVehicle(await getVehicle(req.params.id), await getPhotos(req.params.id), {
          admin: true,
        })
      );
    }
    const sets = [];
    const params = [req.params.id];
    for (const [cle, valeur] of entrees) {
      params.push(valeur);
      sets.push(`${COLONNES_SQL[cle]} = $${params.length}`);
    }
    const { rows } = await query(
      `UPDATE rental_vehicles SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    if (!rows[0]) throw notFound('Véhicule');
    res.json(sanitizeVehicle(rows[0], await getPhotos(rows[0].id), { admin: true }));
  })
);

// PATCH /rental-vehicles/:id/verify — comme un dossier chauffeur : l'équipe
// contrôle l'assurance et la road licence, puis publie ou refuse.
router.patch(
  '/:id/verify',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(['verified', 'rejected']) }).parse(req.body);
    const { rows } = await query(
      'UPDATE rental_vehicles SET verification_status = $2 WHERE id = $1 RETURNING *',
      [req.params.id, status]
    );
    if (!rows[0]) throw notFound('Véhicule');
    res.json(sanitizeVehicle(rows[0], await getPhotos(rows[0].id), { admin: true }));
  })
);

// POST /rental-vehicles/:id/archive — retrait DÉFINITIF du catalogue (le
// loueur a repris son véhicule, ou ne travaille plus avec zanziGo). Les
// réservations passées restent en base, pour l'historique et les paiements.
router.post(
  '/:id/archive',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `UPDATE rental_vehicles SET archived_at = now(), available = false
        WHERE id = $1 AND archived_at IS NULL RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) {
      const vehicule = await getVehicle(req.params.id);
      if (vehicule.archived_at) {
        throw new HttpError(409, 'already_archived', 'Ce véhicule est déjà archivé');
      }
      throw notFound('Véhicule');
    }
    res.json(sanitizeVehicle(rows[0], await getPhotos(rows[0].id), { admin: true }));
  })
);

// POST /rental-vehicles/:id/photos {url} — ajoute UNE photo (le client web
// envoie chaque photo dès qu'elle est choisie, comme pour un document
// chauffeur — voir ChoixDocument). Prend la position suivante automatiquement.
router.post(
  '/:id/photos',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { url } = z.object({ url: z.string().url() }).parse(req.body);
    await getVehicle(req.params.id);
    const { rows: existantes } = await query(
      'SELECT COALESCE(MAX(position), -1) AS max FROM rental_vehicle_photos WHERE vehicle_id = $1',
      [req.params.id]
    );
    if (Number(existantes[0].max) + 1 >= 12) {
      throw new HttpError(400, 'too_many_photos', '12 photos maximum par véhicule');
    }
    const { rows } = await query(
      `INSERT INTO rental_vehicle_photos (vehicle_id, url, position)
       VALUES ($1, $2, $3) RETURNING id, url, position`,
      [req.params.id, url, Number(existantes[0].max) + 1]
    );
    res.status(201).json(rows[0]);
  })
);

// DELETE /rental-vehicles/:id/photos/:photoId
router.delete(
  '/:id/photos/:photoId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { rowCount } = await query(
      'DELETE FROM rental_vehicle_photos WHERE id = $1 AND vehicle_id = $2',
      [req.params.photoId, req.params.id]
    );
    if (rowCount === 0) throw notFound('Photo');
    res.status(204).end();
  })
);

// POST /rental-vehicles/:id/book {startDate, endDate, method?} — réservation
// ET paiement dans l'app, comme une place de taxi partagé. Le prix est FIGÉ
// à la réservation (jour × tarif du véhicule) : une modification de prix par
// l'équipe après coup ne change jamais une réservation déjà créée.
//
// DURÉE : inclusive — du 1er au 3e, le client a le véhicule 3 jours pleins,
// pas 2. Une location d'un seul jour (mêmes dates) compte 1 jour.
const bookSchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    method: z.enum(['carte', 'mobile']).optional(),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'La date de retour doit être après la date de départ',
    path: ['endDate'],
  });

router.post(
  '/:id/book',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.auth.userId) {
      throw new HttpError(403, 'forbidden', 'Réservé aux clients');
    }
    const data = bookSchema.parse(req.body);
    const vehicule = await getVehicle(req.params.id);
    if (
      vehicule.verification_status !== 'verified' ||
      !vehicule.available ||
      vehicule.archived_at
    ) {
      throw new HttpError(409, 'not_available', "Ce véhicule n'est pas disponible à la réservation");
    }

    const jours =
      Math.round(
        (new Date(`${data.endDate}T00:00:00Z`).getTime() -
          new Date(`${data.startDate}T00:00:00Z`).getTime()) /
          86_400_000
      ) + 1;
    const prix = round2(Number(vehicule.daily_price) * jours);
    const commission = round2(Number(vehicule.daily_commission) * jours);

    const booking = await withTransaction(async (client) => {
      // Chevauchement de dates : seules les réservations non annulées
      // comptent, payées ou non — une réservation en attente de paiement
      // bloque déjà les dates, le temps qu'elle se règle ou expire.
      const { rows: conflits } = await client.query(
        `SELECT 1 FROM rental_bookings
          WHERE vehicle_id = $1 AND cancelled_at IS NULL
            AND start_date <= $3 AND end_date >= $2
          LIMIT 1`,
        [vehicule.id, data.startDate, data.endDate]
      );
      if (conflits[0]) {
        throw new HttpError(
          409,
          'dates_unavailable',
          'Ce véhicule est déjà réservé sur une partie de ces dates'
        );
      }
      const { rows } = await client.query(
        `INSERT INTO rental_bookings (vehicle_id, user_id, start_date, end_date, days, price, commission, currency)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [vehicule.id, req.auth.userId, data.startDate, data.endDate, jours, prix, commission, vehicule.currency]
      );
      return rows[0];
    });

    // Le paiement : même moteur que colis/courses/places (services/moyenPaiement.js).
    const regle = reglement(booking.price, booking.currency, data.method);
    const entete = [
      '💳 Paiement location de véhicule zanziGo',
      `Véhicule: ${vehicule.make} ${vehicule.model} (${vehicule.plate})`,
      `Du ${booking.start_date} au ${booking.end_date} (${booking.days} j)`,
    ];

    const paypal =
      regle.devise === 'USD'
        ? await circuitPaiementUsd({ amount: regle.montant, currency: regle.devise, description: entete[0] })
        : null;
    let circuit = paypal;
    if (!circuit && !isStubMode()) {
      circuit = await createPaymentOrder({
        amount: regle.montant,
        currency: regle.devise,
        description: entete[0],
      });
    }
    const reference = circuit?.reference ?? `WHATSAPP-${randomUUID()}`;
    const paymentLink =
      circuit?.paymentLink ??
      buildTeamNotificationLink(
        [
          ...entete,
          `Moyen: ${libelleMoyen(regle.moyen)}`,
          `Montant: ${regle.montant} ${regle.devise}`,
          ...(regle.surcharge > 0
            ? [`(dont ${regle.surcharge} ${regle.devise} de frais bancaires carte)`]
            : []),
          `Prix: ${booking.price} ${booking.currency}`,
          `Réf: ${booking.id}`,
          'Bonjour, je souhaite régler cette location — merci de me confirmer la marche à suivre.',
        ].join('\n')
      );

    const { rows: paiementRows } = await query(
      `INSERT INTO payments (rental_booking_id, amount, currency, pesapal_reference, payment_link, surcharge, method)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [booking.id, regle.montant, regle.devise, reference, paymentLink, regle.surcharge, regle.moyen]
    );

    if (aValiderALaMain(reference)) {
      notifierEquipe(
        '🚗 Nouvelle réservation véhicule — zanziGo',
        [...entete, `Montant à encaisser: ${regle.montant} ${regle.devise}`, `Réf: ${booking.id}`].join('\n')
      );
    }

    res.status(201).json({
      ...booking,
      payment: {
        ...paiementRows[0],
        payment_method: paypal?.method ?? (isStubMode() ? 'manual' : 'pesapal'),
        prix_location: booking.price,
        devise_location: booking.currency,
        mention_surcharge: regle.mention,
        moyen: regle.moyen,
        moyens_disponibles: moyensPour(booking.currency),
      },
    });
  })
);

export default router;
