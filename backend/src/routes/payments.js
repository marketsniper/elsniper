import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isAdmin, requireAdmin, requireAuth } from '../middleware/auth.js';
import { createPaymentOrder, getTransactionStatus, isStubMode } from '../services/pesapalService.js';
import { capturePaypalOrder } from '../services/paypalService.js';
import { config } from '../config.js';
import { annulerReservationsImpayees, baseFacturePlace } from './rides.js';
import { alerterCoursePayeeParId } from '../services/alertesChauffeur.js';
import { aValiderALaMain } from '../services/paiementManuel.js';
import { buildTeamNotificationLink } from '../services/whatsappService.js';
import { notifierEquipe } from '../services/emailService.js';
import { libelleMoyen, moyensPour, reglement } from '../services/moyenPaiement.js';

const router = Router();

// GET /payments?status=pending — liste pour le tableau de bord équipe, avec
// le contexte de la cible (trajet ou colis) pour un affichage lisible.
router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status } = z
      .object({ status: z.enum(['pending', 'confirmed', 'failed']).optional() })
      .parse(req.query);

    // Les réservations de places impayées depuis +5 min sont annulées avant
    // l'affichage : leurs paiements passent en 'failed' et sortent du tableau.
    await annulerReservationsImpayees();

    const { rows } = await query(
      `SELECT p.*,
              t.pickup_location  AS trip_pickup,
              t.dropoff_location AS trip_dropoff,
              t.client_name      AS trip_client_name,
              t.scheduled_at     AS trip_scheduled_at,
              pk.pickup_location  AS package_pickup,
              pk.dropoff_location AS package_dropoff,
              pk.qr_code          AS package_qr,
              r.origin            AS ride_origin,
              r.destination       AS ride_destination,
              r.departure_at      AS ride_departure_at,
              rb.seats            AS ride_seats,
              COALESCE(u.full_name, h.name) AS ride_client_name
       FROM payments p
       LEFT JOIN trips t ON t.id = p.trip_id
       LEFT JOIN packages pk ON pk.id = p.package_id
       LEFT JOIN ride_bookings rb ON rb.id = p.ride_booking_id
       LEFT JOIN posted_rides r ON r.id = rb.ride_id
       LEFT JOIN users u ON u.id = rb.user_id
       LEFT JOIN hotels h ON h.id = rb.hotel_id
       WHERE p.status = $1
       ORDER BY p.created_at DESC
       LIMIT 200`,
      [status ?? 'pending']
    );
    res.json(rows);
  })
);

// GET /payments/remboursements — les remboursements À VERSER (annulations
// clients à +24 h du départ) : montant dû (100 % ou 50 % du paiement reçu),
// avec le contexte de la cible. L'équipe solde chaque ligne d'un bouton
// une fois l'argent rendu (POST /payments/:id/rembourse).
router.get(
  '/remboursements',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT p.*,
              t.pickup_location  AS trip_pickup,
              t.dropoff_location AS trip_dropoff,
              t.client_name      AS trip_client_name,
              t.scheduled_at     AS trip_scheduled_at,
              pk.pickup_location  AS package_pickup,
              pk.dropoff_location AS package_dropoff,
              pk.qr_code          AS package_qr,
              r.origin            AS ride_origin,
              r.destination       AS ride_destination,
              r.departure_at      AS ride_departure_at,
              rb.seats            AS ride_seats,
              COALESCE(u.full_name, h.name) AS ride_client_name
       FROM payments p
       LEFT JOIN trips t ON t.id = p.trip_id
       LEFT JOIN packages pk ON pk.id = p.package_id
       LEFT JOIN ride_bookings rb ON rb.id = p.ride_booking_id
       LEFT JOIN posted_rides r ON r.id = rb.ride_id
       LEFT JOIN users u ON u.id = rb.user_id
       LEFT JOIN hotels h ON h.id = rb.hotel_id
       WHERE p.refund_due_at IS NOT NULL AND p.refunded_at IS NULL
       ORDER BY p.refund_due_at ASC
       LIMIT 200`
    );
    res.json(rows);
  })
);

// POST /payments/:id/rembourse — l'équipe confirme avoir VERSÉ le
// remboursement (mobile money, espèces, re-crédit hôtel…) : la ligne sort
// de la liste des remboursements à traiter.
router.post(
  '/:id/rembourse',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `UPDATE payments SET refunded_at = now()
       WHERE id = $1 AND refund_due_at IS NOT NULL AND refunded_at IS NULL
       RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) {
      const paiement = await getPayment(req.params.id);
      throw new HttpError(
        409,
        'refund_not_due',
        paiement.refunded_at
          ? 'Ce remboursement a déjà été soldé'
          : 'Aucun remboursement n\'est dû sur ce paiement'
      );
    }
    res.json(rows[0]);
  })
);

async function getPayment(id) {
  const { rows } = await query('SELECT * FROM payments WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('Paiement');
  return rows[0];
}

// Vrai si le porteur du jeton est le payeur de la cible du paiement (client
// de la course, expéditeur du colis, ou réservateur de la place partagée).
async function isPayer(payment, auth) {
  if (payment.trip_id) {
    const { rows } = await query('SELECT user_id, hotel_id FROM trips WHERE id = $1', [payment.trip_id]);
    if (!rows[0]) return false;
    return (
      (rows[0].user_id !== null && rows[0].user_id === auth.userId) ||
      (rows[0].hotel_id !== null && rows[0].hotel_id === auth.hotelId)
    );
  }
  if (payment.ride_booking_id) {
    const { rows } = await query('SELECT user_id, hotel_id FROM ride_bookings WHERE id = $1', [
      payment.ride_booking_id,
    ]);
    if (!rows[0]) return false;
    return (
      (rows[0].user_id !== null && rows[0].user_id === auth.userId) ||
      (rows[0].hotel_id !== null && rows[0].hotel_id === auth.hotelId)
    );
  }
  const { rows } = await query(
    'SELECT sender_user_id, sender_hotel_id FROM packages WHERE id = $1',
    [payment.package_id]
  );
  if (!rows[0]) return false;
  return (
    (rows[0].sender_user_id !== null && rows[0].sender_user_id === auth.userId) ||
    (rows[0].sender_hotel_id !== null && rows[0].sender_hotel_id === auth.hotelId)
  );
}

// GET /payments/:id — détail (payeur ou équipe).
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payment = await getPayment(req.params.id);
    if (!isAdmin(req) && !(await isPayer(payment, req.auth))) {
      throw new HttpError(403, 'forbidden', 'Accès réservé au payeur ou à l\'équipe');
    }
    res.json(payment);
  })
);

// POST /payments/:id/moyen — le client CHANGE de moyen de paiement avant
// d'avoir payé : carte bancaire (dollars, frais bancaires en plus) ou
// portefeuille mobile (shillings, sans frais).
//
// Le montant est TOUJOURS recalculé depuis le prix de la grille, jamais
// depuis la somme déjà affichée : sinon les frais du premier choix se
// retrouveraient dans le second, et un aller-retour carte → mobile → carte
// gonflerait la note à chaque passage.
//
// Réservé au payeur (et à l'équipe), et seulement tant que le paiement est en
// attente : une fois l'argent encaissé, on ne rejoue pas la facture.
const moyenSchema = z.object({ moyen: z.enum(['carte', 'mobile']) });

router.post(
  '/:id/moyen',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { moyen } = moyenSchema.parse(req.body ?? {});
    const payment = await getPayment(req.params.id);
    if (!isAdmin(req) && !(await isPayer(payment, req.auth))) {
      throw new HttpError(403, 'forbidden', 'Accès réservé au payeur ou à l\'équipe');
    }
    if (payment.status !== 'pending') {
      throw new HttpError(
        409,
        'payment_already_processed',
        `Ce paiement a déjà été traité (statut: ${payment.status})`
      );
    }

    // Le prix d'origine et de quoi remplir le message de l'équipe.
    let base = null;
    let entete = [];
    if (payment.trip_id) {
      const { rows } = await query(
        'SELECT price, currency, pickup_location, dropoff_location FROM trips WHERE id = $1',
        [payment.trip_id]
      );
      if (!rows[0]) throw notFound('Course');
      // La remise de parrainage FIGÉE sur ce paiement reste déduite, quel
      // que soit le moyen choisi — changer d'avis ne la fait pas disparaître.
      const remiseUsd = Number(payment.remise_parrainage_usd ?? 0);
      const remiseCourse =
        rows[0].currency === 'USD'
          ? remiseUsd
          : Math.round(remiseUsd * config.usdToTzsRate);
      base = {
        montant: Math.round((Number(rows[0].price) - remiseCourse) * 100) / 100,
        devise: rows[0].currency,
      };
      entete = [
        '💳 Paiement course zanziGo',
        `Trajet: ${rows[0].pickup_location} → ${rows[0].dropoff_location}`,
      ];
    } else if (payment.package_id) {
      const { rows } = await query(
        'SELECT price, currency, qr_code, pickup_location, dropoff_location FROM packages WHERE id = $1',
        [payment.package_id]
      );
      if (!rows[0]) throw notFound('Colis');
      base = { montant: Number(rows[0].price), devise: rows[0].currency };
      entete = [
        '💳 Paiement colis zanziGo',
        `QR: ${rows[0].qr_code}`,
        `Trajet: ${rows[0].pickup_location} → ${rows[0].dropoff_location}`,
      ];
    } else {
      // La facture FIGÉE au moment de la réservation (migration 037) fait
      // foi : si la grille a bougé depuis, le client garde son prix. Le
      // recalcul depuis la grille ne sert que de secours pour les paiements
      // antérieurs à la colonne.
      base =
        payment.prix_facture !== null && payment.prix_facture !== undefined
          ? { montant: Number(payment.prix_facture), devise: payment.devise_facture }
          : await baseFacturePlace(payment.ride_booking_id);
      if (!base) throw notFound('Réservation');
      const { rows } = await query(
        `SELECT r.origin, r.destination, b.seats
           FROM ride_bookings b JOIN posted_rides r ON r.id = b.ride_id
          WHERE b.id = $1`,
        [payment.ride_booking_id]
      );
      entete = [
        '💳 Paiement place(s) taxi partagé zanziGo',
        `Trajet: ${rows[0].origin} → ${rows[0].destination}`,
        `Places: ${rows[0].seats}`,
      ];
    }

    const regle = reglement(base.montant, base.devise, moyen);

    // Le lien de paiement porte le montant : il doit suivre le changement.
    // Circuit manuel (WhatsApp) : on réécrit le message. Circuit externe
    // (Pesapal/PayPal) : l'ordre déjà créé porte l'ancien montant, on en
    // ouvre un nouveau plutôt que d'envoyer le client payer la mauvaise somme.
    let reference = payment.pesapal_reference;
    let paymentLink;
    // SANS CLÉS PESAPAL, toujours le circuit manuel — jamais createPaymentOrder.
    // Sa référence STUB- se confirmerait toute seule (getTransactionStatus
    // renvoie COMPLETED en stub) SANS passer par l'équipe : un client aurait
    // pu marquer sa course payée en changeant simplement de moyen. Les trois
    // autres points de création ont ce garde-fou ; celui-ci l'avait raté.
    if (aValiderALaMain(reference) || isStubMode()) {
      reference = reference && aValiderALaMain(reference) ? reference : `WHATSAPP-${randomUUID()}`;
      paymentLink = buildTeamNotificationLink(
        [
          ...entete,
          `Moyen: ${libelleMoyen(regle.moyen)}`,
          `Montant: ${regle.montant} ${regle.devise}`,
          ...(regle.surcharge > 0
            ? [`(dont ${regle.surcharge} ${regle.devise} de frais bancaires carte)`]
            : []),
          `Prix: ${base.montant} ${base.devise}`,
          `Réf: ${payment.trip_id ?? payment.package_id ?? payment.ride_booking_id}`,
          'Bonjour, je souhaite régler — merci de me confirmer la marche à suivre.',
        ].join('\n')
      );
    } else {
      const ordre = await createPaymentOrder({
        amount: regle.montant,
        currency: regle.devise,
        description: entete[0],
      });
      reference = ordre.reference;
      paymentLink = ordre.paymentLink;
    }

    const { rows } = await query(
      `UPDATE payments
          SET amount = $2, currency = $3, surcharge = $4, method = $5,
              pesapal_reference = $6, payment_link = $7
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [payment.id, regle.montant, regle.devise, regle.surcharge, regle.moyen, reference, paymentLink]
    );
    if (!rows[0]) {
      // Confirmé (ou soldé) pendant qu'on reconstruisait le lien : on ne
      // touche à rien et on le dit clairement.
      throw new HttpError(
        409,
        'payment_already_processed',
        'Ce paiement a été traité entre-temps — rien n\'a été modifié'
      );
    }

    res.json({
      ...rows[0],
      prix_course: base.montant,
      devise_course: base.devise,
      mention_surcharge: regle.mention,
      moyen: regle.moyen,
      moyens_disponibles: moyensPour(base.devise),
    });
  })
);

// POST /payments/:id/confirm — confirmation du paiement.
// MODE STUB (sans clés Pesapal) : simule le webhook — réservé au payeur ou à
// l'équipe. MODE RÉEL : cette route sert d'endpoint IPN Pesapal (appelée par
// Pesapal, sans jeton) — la sécurité vient de la vérification du statut réel
// de la transaction via l'API Pesapal (GetTransactionStatus === COMPLETED).
// Fait avancer la cible : trip -> 'paid', package -> 'paid'.
router.post(
  '/:id/confirm',
  asyncHandler(async (req, res, next) => {
    if (isStubMode()) {
      // En stub, on exige l'authentification du payeur (ou l'équipe).
      return requireAuth(req, res, next);
    }
    next();
  }),
  asyncHandler(async (req, res) => {
    const payment = await getPayment(req.params.id);
    if (isStubMode() && !isAdmin(req) && !(await isPayer(payment, req.auth))) {
      throw new HttpError(403, 'forbidden', 'Accès réservé au payeur ou à l\'équipe');
    }
    if (payment.status !== 'pending') {
      throw new HttpError(
        409,
        'payment_already_processed',
        `Ce paiement a déjà été traité (statut: ${payment.status})`
      );
    }

    // Trois familles de références :
    //  - PAYPAL-…  : capture + vérification RÉELLE auprès de PayPal — le
    //    payeur peut déclencher, la vérité vient de PayPal, pas du client ;
    //  - WHATSAPP-… / PAYPALME-… : validation manuelle après réception de
    //    l'argent — réservée à l'équipe en production (tableau de bord) ;
    //  - sinon : Pesapal (stub sans clés, vérification réelle avec).
    const reference = payment.pesapal_reference ?? '';
    let status;
    if (reference.startsWith('PAYPAL-')) {
      status = await capturePaypalOrder(reference.slice('PAYPAL-'.length));
    } else if (aValiderALaMain(reference)) {
      if (config.env === 'production' && !isAdmin(req)) {
        throw new HttpError(
          403,
          'manual_confirm_admin_only',
          "Paiement manuel : c'est l'équipe qui valide après réception de l'argent"
        );
      }
      status = 'COMPLETED';
    } else {
      status = await getTransactionStatus(reference);
    }
    if (status !== 'COMPLETED') {
      throw new HttpError(
        409,
        'payment_not_completed',
        `Paiement non abouti pour le moment (${status}) — terminez le paiement puis réessayez`
      );
    }

    const updated = await appliquerConfirmation(payment);
    res.json(updated);
  })
);

// Applique la confirmation d'un paiement : paiement 'confirmed', cible
// avancée (course/colis → paid), doublons pending de la même cible soldés.
async function appliquerConfirmation(payment) {
  return withTransaction(async (client) => {
    // La garde AND status='pending' fait autorité, pas la lecture faite en
    // amont : entre les deux il y a un appel réseau (PayPal/Pesapal), pendant
    // lequel une annulation d'équipe ou un second confirm concurrent peut
    // passer. Zéro ligne = quelqu'un d'autre a tranché — on ne rejoue rien.
    const { rows: paymentRows } = await client.query(
      `UPDATE payments SET status = 'confirmed', confirmed_at = now()
        WHERE id = $1 AND status = 'pending' RETURNING *`,
      [payment.id]
    );
    if (!paymentRows[0]) {
      throw new HttpError(
        409,
        'payment_already_processed',
        'Ce paiement a déjà été traité entre-temps'
      );
    }

    // L'ARGENT EST LÀ, quoi qu'il soit arrivé à la cible entre-temps. Si la
    // cible a été annulée pendant que le client payait (course annulée,
    // réservation balayée au bout de 5 minutes), la confirmation ne doit
    // JAMAIS être silencieuse : on trace un remboursement dû à 100 % (hors
    // frais bancaires) et l'équipe est prévenue — sinon un client a payé,
    // n'a rien reçu, et n'apparaît nulle part.
    let cibleAnnulee = null;
    if (payment.trip_id) {
      const { rows } = await client.query(
        // paid_at : la trace qui survit à tout, posée INCONDITIONNELLEMENT.
        // Le statut, lui, n'avance que depuis 'driver_confirmed' : une
        // course rendue par son chauffeur (redevenue 'requested') garde son
        // statut — mais son paid_at fait qu'elle repartira en 'paid' à la
        // prochaine prise, et que la bourse l'affiche « déjà payée ».
        `UPDATE trips
            SET paid_at = COALESCE(paid_at, now()),
                status = CASE WHEN status = 'driver_confirmed'
                              THEN 'paid'::trip_status ELSE status END
          WHERE id = $1
          RETURNING status`,
        [payment.trip_id]
      );
      if (rows[0]?.status === 'cancelled') cibleAnnulee = 'course annulée';
    } else if (payment.package_id) {
      const { rows } = await client.query(
        `UPDATE packages
            SET status = CASE WHEN status = 'created'
                              THEN 'paid'::package_status ELSE status END
          WHERE id = $1
          RETURNING status`,
        [payment.package_id]
      );
      if (rows[0]?.status === 'cancelled') cibleAnnulee = 'colis annulé';
    } else if (payment.ride_booking_id) {
      // Place soldée — mais JAMAIS sur une réservation déjà annulée : ses
      // places sont retournées sur l'annonce, peut-être déjà revendues.
      const { rowCount } = await client.query(
        `UPDATE ride_bookings SET paid_at = now()
          WHERE id = $1 AND paid_at IS NULL AND cancelled_at IS NULL`,
        [payment.ride_booking_id]
      );
      if (rowCount === 0) {
        const { rows } = await client.query(
          'SELECT cancelled_at FROM ride_bookings WHERE id = $1',
          [payment.ride_booking_id]
        );
        if (rows[0]?.cancelled_at) cibleAnnulee = 'réservation annulée (paiement arrivé trop tard)';
      }
    }

    if (cibleAnnulee) {
      await client.query(
        `UPDATE payments
            SET refund_amount = ROUND(amount - surcharge, 2), refund_due_at = now()
          WHERE id = $1 AND refund_due_at IS NULL`,
        [payment.id]
      );
    } else if (payment.trip_id && Number(payment.remise_parrainage_usd ?? 0) > 0) {
      // Le paiement a abouti avec sa remise : le crédit de parrainage est
      // CONSOMMÉ maintenant — pas à la création du lien, qu'un client peut
      // abandonner sans conséquence. GREATEST(0, …) : au pire des pires (deux
      // paiements concurrents portant la même remise), zanziGo offre 5 $ de
      // trop plutôt que de produire un crédit négatif.
      await client.query(
        `UPDATE users
            SET credit_parrainage_usd = GREATEST(0, credit_parrainage_usd - $1)
          WHERE id = (SELECT user_id FROM trips WHERE id = $2)`,
        [payment.remise_parrainage_usd, payment.trip_id]
      );
    }

    // Un client qui appuie plusieurs fois sur « payer » crée plusieurs
    // paiements en attente pour la même cible : une fois l'un confirmé,
    // les doublons sont soldés en 'failed' pour ne pas encombrer le
    // tableau de bord équipe.
    await client.query(
      `UPDATE payments SET status = 'failed'
       WHERE id <> $1 AND status = 'pending'
         AND ((trip_id IS NOT NULL AND trip_id = $2)
           OR (package_id IS NOT NULL AND package_id = $3)
           OR (ride_booking_id IS NOT NULL AND ride_booking_id = $4))`,
      [payment.id, payment.trip_id, payment.package_id, payment.ride_booking_id]
    );

    return { confirme: paymentRows[0], cibleAnnulee };
  }).then(({ confirme, cibleAnnulee }) => {
    // Après la transaction, et sans l'attendre : une alerte ne doit jamais
    // retenir ni annuler un paiement confirmé.
    if (cibleAnnulee) {
      notifierEquipe(
        '⚠️ Paiement reçu sur une cible annulée — remboursement à verser',
        [
          `Un paiement a été confirmé alors que sa cible est ${cibleAnnulee}.`,
          `Montant reçu: ${confirme.amount} ${confirme.currency}`,
          `À rembourser (hors frais carte): ${confirme.refund_amount ?? Math.round((confirme.amount - confirme.surcharge) * 100) / 100} ${confirme.currency}`,
          `Réf paiement: ${confirme.id}`,
          'La ligne est dans « Remboursements à verser ».',
        ].join('\n')
      );
    } else {
      if (payment.trip_id) {
        // Course réglée : le chauffeur assigné apprend qu'il peut démarrer.
        alerterCoursePayeeParId(payment.trip_id);
      }
      // Et la tour de contrôle voit l'argent arriver, quel que soit le moyen.
      notifierPaiementConfirme(confirme).catch(() => {});
    }
    return confirme;
  });
}

// L'ARGENT EST ARRIVÉ — l'événement que la tour de contrôle veut voir passer
// en premier. Chaque paiement confirmé (course, colis ou place partagée)
// part en notification avec le contexte qu'il faut pour comprendre d'un
// coup d'œil, sans ouvrir le tableau de bord. Fire-and-forget.
async function notifierPaiementConfirme(p) {
  const lignes = [];
  let sujet = '💰 Paiement confirmé';
  if (p.trip_id) {
    sujet = '💰 Paiement confirmé — course';
    const { rows } = await query(
      `SELECT t.pickup_location, t.dropoff_location, u.full_name
         FROM trips t LEFT JOIN users u ON u.id = t.user_id
        WHERE t.id = $1`,
      [p.trip_id]
    );
    if (rows[0]) {
      lignes.push(`Trajet : ${rows[0].pickup_location} → ${rows[0].dropoff_location}`);
      lignes.push(`Client : ${rows[0].full_name ?? '—'}`);
    }
  } else if (p.package_id) {
    sujet = '💰 Paiement confirmé — colis';
    const { rows } = await query(
      'SELECT pickup_location, dropoff_location, size FROM packages WHERE id = $1',
      [p.package_id]
    );
    if (rows[0]) {
      lignes.push(
        `Colis : ${rows[0].pickup_location} → ${rows[0].dropoff_location} (${rows[0].size})`
      );
    }
  } else if (p.ride_booking_id) {
    sujet = '💰 Paiement confirmé — place partagée';
    const { rows } = await query(
      `SELECT b.seats, r.origin, r.destination, u.full_name
         FROM ride_bookings b
         JOIN rides r ON r.id = b.ride_id
         LEFT JOIN users u ON u.id = b.user_id
        WHERE b.id = $1`,
      [p.ride_booking_id]
    );
    if (rows[0]) {
      lignes.push(
        `Trajet : ${rows[0].origin} → ${rows[0].destination} — ${rows[0].seats} place(s)`
      );
      lignes.push(`Client : ${rows[0].full_name ?? '—'}`);
    }
  }
  lignes.push(`Montant : ${p.amount} ${p.currency} — ${libelleMoyen(p.method)}`);
  lignes.push(`Réf paiement : ${p.id}`);
  await notifierEquipe(sujet, lignes.join('\n'));
}

// POST /payments/pesapal-ipn — webhook Pesapal : appelé automatiquement par
// Pesapal quand un paiement change d'état. Sans jeton — la sécurité vient de
// la vérification du statut RÉEL auprès de l'API Pesapal avant toute action.
// Ainsi, un paiement Pesapal se confirme TOUT SEUL, sans que le client ni
// l'équipe n'aient rien à toucher.
router.post(
  '/pesapal-ipn',
  asyncHandler(async (req, res) => {
    const orderTrackingId =
      req.body?.OrderTrackingId ?? req.query?.OrderTrackingId ?? null;
    if (orderTrackingId) {
      const { rows } = await query('SELECT * FROM payments WHERE pesapal_reference = $1', [
        orderTrackingId,
      ]);
      const payment = rows[0];
      if (payment && payment.status === 'pending') {
        const status = await getTransactionStatus(orderTrackingId);
        if (status === 'COMPLETED') {
          await appliquerConfirmation(payment);
        }
      }
    }
    // Réponse au format attendu par Pesapal (statut 200 = notification reçue).
    res.json({
      orderNotificationType: 'IPNCHANGE',
      orderTrackingId,
      status: 200,
    });
  })
);

export default router;
