import { Router } from 'express';
import { query } from '../db.js';
import { HttpError } from '../errors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAdmin } from '../middleware/auth.js';
import { config } from '../config.js';
import {
  sharedSeatUsdForRoute,
  TAUX_PLACE_LOCALE,
  TAUX_PLACE_USD,
} from '../services/pricingService.js';

// Prix, commission et devise d'une réservation de place PAYÉE, selon le
// profil du client (même cloison que partout ailleurs) :
//  - hôtel : grille USD −5 %, commission au taux des places USD ;
//  - local : prix TZS de l'annonce, commission au taux des places locales ;
//  - résident vérifié : USD −10 % ; touriste : USD plein tarif.
// Les taux viennent de la grille (pricingService) : les recopier ici avait
// laissé les places de taxi partagé sur l'ancien barème.
export function valeurReservationPlace(ligne) {
  const round2 = (x) => Math.round(x * 100) / 100;
  const usd = sharedSeatUsdForRoute(ligne.origin, ligne.destination);
  if (ligne.par_hotel) {
    const price = round2(usd * (1 - config.hotelDiscountRate) * ligne.seats);
    return { price, commission: round2(price * TAUX_PLACE_USD), currency: 'USD' };
  }
  if (ligne.account_type === 'local') {
    const price = Number(ligne.price_per_seat) * ligne.seats;
    return { price, commission: round2(price * TAUX_PLACE_LOCALE), currency: 'TZS' };
  }
  const resident =
    ligne.account_type === 'resident' && ligne.verification_status === 'verified';
  const price = round2((resident ? usd * (1 - config.residentDiscountRate) : usd) * ligne.seats);
  return { price, commission: round2(price * TAUX_PLACE_USD), currency: 'USD' };
}

const router = Router();

// GET /stats/sauvegarde — export complet de la base en JSON (équipe).
// Les tables sont découvertes dynamiquement (l'export suit les évolutions
// du schéma) ; les codes OTP jetables sont exclus. À télécharger
// régulièrement depuis le tableau de bord — et impérativement avant toute
// échéance de la base gratuite.
const TABLES_EXCLUES = new Set(['otp_codes', 'schema_migrations', 'migrations']);

router.get(
  '/sauvegarde',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { rows: tables } = await query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    const dump = { exported_at: new Date().toISOString(), tables: {} };
    for (const { tablename } of tables) {
      if (TABLES_EXCLUES.has(tablename)) continue;
      // Nom de table issu de pg_tables (jamais du client) — pas d'injection.
      const { rows } = await query(`SELECT * FROM "${tablename}" LIMIT 20000`);
      dump.tables[tablename] = rows;
    }
    const jour = dump.exported_at.slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="zanzigo-sauvegarde-${jour}.json"`);
    res.json(dump);
  })
);

// POST /stats/reinitialiser — REMISE À ZÉRO complète des données métier :
// chauffeurs, clients, hôtels et tout ce qui en découle (courses, colis,
// paiements, annonces, places, bons, crédits, documents).
// Sert une seule fois, avant le vrai démarrage, pour repartir d'une base
// propre après la période d'essai. Volontairement ABSENT du tableau de
// bord : il faut la clé de l'équipe ET la phrase exacte « REINITIALISER »
// dans la requête, pour qu'aucun geste malheureux ne puisse l'appeler.
// Le compte à rebours des identifiants (numéros, identifiants clients,
// e-mails d'hôtels) repart à zéro : tout redevient disponible.
const TABLES_A_VIDER = [
  // L'ordre suit les dépendances : les enfants d'abord.
  'ride_waitlist',
  'ride_bookings',
  'posted_rides',
  'payments',
  'packages',
  'trips',
  'hotel_vouchers',
  'hotel_credit_transactions',
  'driver_monthly_stats',
  'driver_positions',
  'driver_signups',
  'drivers',
  'hotels',
  'users',
  'uploaded_files',
  'otp_codes',
];

router.post(
  '/reinitialiser',
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (req.body?.confirmation !== 'REINITIALISER') {
      throw new HttpError(
        400,
        'confirmation_requise',
        'Remise à zéro refusée : envoyer {"confirmation":"REINITIALISER"} pour confirmer'
      );
    }
    const avant = {};
    const apres = {};
    for (const table of TABLES_A_VIDER) {
      const { rows } = await query(`SELECT COUNT(*)::int AS n FROM "${table}"`);
      avant[table] = rows[0].n;
    }
    // TRUNCATE en une seule commande : les contraintes entre tables ne
    // gênent pas, et soit tout part, soit rien ne part.
    await query(`TRUNCATE TABLE ${TABLES_A_VIDER.map((t) => `"${t}"`).join(', ')} CASCADE`);
    for (const table of TABLES_A_VIDER) {
      const { rows } = await query(`SELECT COUNT(*)::int AS n FROM "${table}"`);
      apres[table] = rows[0].n;
    }
    res.json({ reinitialise: true, lignes_supprimees: avant, restant: apres });
  })
);

// GET /stats — tableau de bord équipe (réservé à la clé X-Admin-Key) :
//  - abonnés : clients (touristes + résidents), locaux, hôtels, chauffeurs ;
//  - chiffre d'affaires : courses TERMINÉES et colis LIVRÉS sur trois
//    fenêtres (aujourd'hui depuis minuit à Zanzibar, 7 et 30 derniers
//    jours), avec le CA encaissé et le NET zanziGo (les commissions),
//    totalisés par devise.
router.get(
  '/',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    // Minuit local à Zanzibar (UTC+3, pas d'heure d'été).
    const EAT_MS = 3 * 3600 * 1000;
    const maintenantEat = new Date(Date.now() + EAT_MS);
    const minuitEat =
      Date.UTC(
        maintenantEat.getUTCFullYear(),
        maintenantEat.getUTCMonth(),
        maintenantEat.getUTCDate()
      ) - EAT_MS;
    const JOUR_MS = 24 * 3600 * 1000;
    const debuts = {
      today: new Date(minuitEat),
      week: new Date(minuitEat - 6 * JOUR_MS),
      month: new Date(minuitEat - 29 * JOUR_MS),
    };

    const [{ rows: parType }, { rows: hotels }, { rows: drivers }, { rows: courses }, { rows: colis }, { rows: places }] =
      await Promise.all([
        query('SELECT account_type, COUNT(*)::int AS n FROM users GROUP BY account_type'),
        query(
          `SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE verification_status = 'verified')::int AS verifies
           FROM hotels`
        ),
        query(
          `SELECT COUNT(*) FILTER (WHERE verification_status = 'verified')::int AS verifies
           FROM drivers`
        ),
        query(
          `SELECT completed_at AS quand, price, commission, currency
           FROM trips WHERE status = 'completed' AND completed_at >= $1`,
          [debuts.month]
        ),
        query(
          `SELECT delivered_at AS quand, price, commission, currency
           FROM packages WHERE status = 'delivered' AND delivered_at >= $1`,
          [debuts.month]
        ),
        // Places de taxi partagé PAYÉES : acquises dès le paiement (un
        // client ne peut plus annuler à moins de 24 h du départ).
        query(
          `SELECT b.paid_at AS quand, b.seats,
                  r.origin, r.destination, r.price_per_seat,
                  u.account_type, u.verification_status,
                  (b.hotel_id IS NOT NULL) AS par_hotel
           FROM ride_bookings b
           JOIN posted_rides r ON r.id = b.ride_id
           LEFT JOIN users u ON u.id = b.user_id
           WHERE b.paid_at IS NOT NULL AND b.cancelled_at IS NULL AND b.paid_at >= $1`,
          [debuts.month]
        ),
      ]);

    const round2 = (x) => Math.round(x * 100) / 100;
    const fenetreVide = () => ({ courses: 0, colis: 0, places: 0, ca: {}, gains: {} });
    const revenue = { today: fenetreVide(), week: fenetreVide(), month: fenetreVide() };
    const ajouter = (ligne, type, increment = 1) => {
      const quand = new Date(ligne.quand).getTime();
      for (const cle of ['today', 'week', 'month']) {
        if (quand >= debuts[cle].getTime()) {
          const fenetre = revenue[cle];
          fenetre[type] += increment;
          fenetre.ca[ligne.currency] = round2(
            (fenetre.ca[ligne.currency] ?? 0) + Number(ligne.price)
          );
          fenetre.gains[ligne.currency] = round2(
            (fenetre.gains[ligne.currency] ?? 0) + Number(ligne.commission)
          );
        }
      }
    };
    for (const ligne of courses) ajouter(ligne, 'courses');
    for (const ligne of colis) ajouter(ligne, 'colis');
    for (const ligne of places) {
      const valeur = valeurReservationPlace(ligne);
      ajouter({ quand: ligne.quand, ...valeur }, 'places', ligne.seats);
    }

    const n = (type) => parType.find((ligne) => ligne.account_type === type)?.n ?? 0;
    res.json({
      tourists: n('tourist'),
      residents: n('resident'),
      locals: n('local'),
      // « Clients » au sens du tableau de bord : visiteurs USD
      // (touristes + résidents), les locaux étant comptés à part.
      clients: n('tourist') + n('resident'),
      hotels: hotels[0].total,
      hotels_verified: hotels[0].verifies,
      drivers_verified: drivers[0].verifies,
      revenue,
    });
  })
);

export default router;
