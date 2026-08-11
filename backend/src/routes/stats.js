import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

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

    const [{ rows: parType }, { rows: hotels }, { rows: drivers }, { rows: courses }, { rows: colis }] =
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
      ]);

    const round2 = (x) => Math.round(x * 100) / 100;
    const fenetreVide = () => ({ courses: 0, colis: 0, ca: {}, gains: {} });
    const revenue = { today: fenetreVide(), week: fenetreVide(), month: fenetreVide() };
    const ajouter = (ligne, type) => {
      const quand = new Date(ligne.quand).getTime();
      for (const cle of ['today', 'week', 'month']) {
        if (quand >= debuts[cle].getTime()) {
          const fenetre = revenue[cle];
          fenetre[type] += 1;
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
